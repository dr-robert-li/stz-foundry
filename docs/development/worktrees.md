# Per-specimen worktrees: the isolation mechanism

N specimens implement the same contract in parallel. While they *synthesize*
files from a contract, writing each into its own `prototypes/specimen-<id>/`
directory is enough. Once a slice **edits an existing repo** (brownfield, 1.12.0),
directory isolation stops being honest: two specimens editing the same tracked
file collide, and neither diff is attributable.

Since 1.17.0 each specimen gets a real **git worktree** when the target is a git
repository, and a plain directory when it is not. The mode is always reported —
never silently degraded.

All of it lives in `src/worktree.ts`, the single place in `src/` that shells out
to `git` (argv arrays via `execFileSync`; never a shell string). The bridge verbs
(`worktree-create` / `-list` / `-destroy`), the standalone foundry runner, and
`/stz-f:run` all call that one module.

## The sealed-suite firewall — why the create sequence is ordered

A specimen must never be able to read the sealed held-out suite. A worktree is a
full checkout of the repo, and in this project the sealed suite lives *in* the
repo under `.stz/30-tests/held-out/`. So the naive call is a leak:

```bash
git worktree add <path> HEAD        # ← DOES materialize .stz/30-tests/held-out/
```

This was **reproduced**, and `test/worktree.test.ts` keeps a deliberate negative
control that runs the naive form and asserts the sealed file IS exposed. Do not
"simplify" the sequence below back into it.

The shipped sequence is three steps, and the order is load-bearing:

```bash
git worktree add --no-checkout --detach <path> <base>          # 1. register, materialize nothing
git -C <path> sparse-checkout set --no-cone '/*' '!/.stz/'     # 2. carve .stz/ out
git -C <path> checkout                                         # 3. NOW write files
```

Nothing is ever written to disk before the exclusion exists. If step 2 fails, the
partial worktree is rolled back and the call returns the directory fallback
rather than proceeding un-firewalled — a worktree that could not be firewalled is
never handed to a specimen.

**The ownership hook is not the barrier.** `hooks/held-out-guard.mjs` is a
PreToolUse **destruction** guard: it denies `rm`/`mv`/truncate-class Bash calls
against `.stz/30-tests/held-out/`, and it deliberately exempts every non-Bash
tool (Read, Grep, Write). It has never blocked a read and must not be presented
as a confidentiality control. Confidentiality here is **structural** — the bytes
are not on disk inside the worktree — and that is the only reason it holds.

## The snapshot base — why not `HEAD`

STZ never commits. On a multi-slice brownfield run, slice 2's specimens must start
from slice 1's merged winner, and that winner is in the working tree, not in
`HEAD`. Basing worktrees on `HEAD` would silently hand every specimen a stale
repo.

So `createWorktree` snapshots the *current working tree* into a commit object,
without touching anything the operator owns — a throwaway index, discarded in a
`finally`:

```bash
GIT_INDEX_FILE=<tmp> git add -A
GIT_INDEX_FILE=<tmp> git write-tree
git -c commit.gpgsign=false commit-tree <tree> -p HEAD -m "stz: specimen worktree base"
```

`git status`, the real index, the stash list and the ref set are all byte-identical
across the call; a test asserts all four.

`-c commit.gpgsign=false` is not cosmetic: `commit-tree` honours `commit.gpgsign`,
so on a signing-configured repo the snapshot would otherwise block on a GPG
passphrase prompt in the middle of a non-interactive round.

The resulting commit is **dangling** — no ref points at it. It is a GC root only
while a worktree references it, and becomes collectable by an ordinary `git gc`
after teardown. An operator who notices loose objects after a run now knows where
they came from.

## Teardown

```bash
git worktree remove --force --force <path>   # dirty AND locked both need a --force
git worktree prune                           # reclaim crash orphans
```

- **`--force` twice.** A specimen worktree is *always* dirty (that is the point),
  and a locked one needs the second flag.
- **Exit 128 `is not a working tree` is success.** That is what the idempotent
  second call returns, and teardown is called from terminal paths that may run
  after a partial teardown. `destroyWorktrees` treats it as removed.
- **`prune` reclaims crash orphans** — a killed process leaves a registration
  behind with no directory. `worktree-create` also runs an unconditional
  `prune` + `rmSync` before every add, so a stale registration and a leftover
  directory from a prior run are both reconciled rather than fatal.
- **`prunable`** on each `worktree-list` entry is the reconciliation input: it is
  git's own verdict that an entry is reclaimable.
- **No branches to prune.** Worktrees are created `--detach`. A worktree's
  auto-created branch *survives* `git worktree remove`, so detached HEAD makes the
  "branches pruned at slice close" requirement vacuous instead of merely handled —
  a test asserts the branch set is byte-identical before creates and after
  teardown.

Teardown runs at every terminal path: bridge `finalize`, `escalate` returning
`halt`, `slice-halt`, and `slice-reset`; and, on the foundry runner, in a single
`finally` around the whole tournament loop that also covers the
`BudgetExceededError` throw. A **retry or replan round deliberately does not tear
down** — it re-enters the spawn step, and the next `worktree-create` reconciles.

## Three durable side effects on a target repo

None of these is a bug. They are the price of the mechanism, listed so nobody
files them as one.

1. **One line in `.git/info/exclude`** — `/<relative-path-to-worktree-root>/`,
   appended grep-before-append so it is idempotent. It keeps the worktree root out
   of the target's `git status` (otherwise diff attribution is polluted and the
   snapshot's `git add -A` sweeps the worktrees into their own base). This file is
   **repo-local and uncommitted**; it never appears in the user's diff. The user's
   committed `.gitignore` is never touched. It is located via
   `git rev-parse --git-common-dir`, so a target that is itself a linked worktree
   still gets the line in the right place.

2. **`extensions.worktreeConfig=true` in `.git/config`** — set by **git itself**,
   automatically, on the first per-worktree `sparse-checkout`. STZ does not write
   it and does not remove it.

3. **Dangling snapshot commit objects** — one per create, as described above.
   Collectable by `git gc` once teardown has released them.

## Stated ceilings

Honest limits, each with its upgrade path.

- **A worktree is not an execution jail.** It prevents *collisions* and exposes no
  sealed content. It does not confine execution: a specimen runs with the
  operator's uid and can reach outside its worktree with an absolute path. That is
  a different control — `src/sandbox.ts` (bwrap / sandbox-exec / the Node
  permission model, default-deny) owns execution isolation, and this layer does
  not extend it. Model-returned file paths are separately guarded by a lexical
  containment check before any write.

- **N full checkouts is a disk-usage ceiling, documented rather than
  code-controlled.** Fan-out × repo size, with no cap enforced. Sparse-checkout
  already trims `.stz/`, usually the largest tree in a mature STZ project, which
  takes the edge off but is not a solution. Upgrade path if this bites: a
  narrower sparse-checkout driven by the slice anchor's `targetFiles`.

- **Repositories with submodules deliberately fall back to directory isolation.**
  Git's own documentation calls worktree support for submodules incomplete, so the
  probe refuses rather than producing a half-working checkout. **This is the one
  MEDIUM-confidence claim in this document:** it is documented by git and
  implemented as a probe, but was not reproduced on a real submodule superproject
  here. Treat it as a manual verification if you run STZ against one — create a
  repo with a submodule, run a worktree-isolated slice, confirm the probe forces
  directory isolation and that teardown is clean.

## The directory fallback

Every failure returns a usable handle instead of throwing: no `git` binary, not a
git repository, unborn HEAD, a submodule superproject, or any failed git step all
yield `{mode: "directory", path: <fallbackDir>, reason: "<why>"}` with the
directory created. Greenfield synthesis — no repo to edit — is still the common
case, so this is a normal outcome, not an error path.

The fallback directory is chosen by the caller so a degrade never becomes a second
code path downstream: the bridge passes the prototype directory the in-session
specimen already writes into, so `/stz-f:run` behaves identically either way.

## How to inspect a run

- **On disk:** `.stz/40-slices/<slice>/worktrees/<name>/` — `<name>` is the
  specimen id on the in-session path, and the strategy-slot index (`s0`, `s1`, …)
  on the foundry path, where the specimen id is not yet assigned at create time.
- **Live:** `stz bridge worktree-list --root . --slice <slice>` prints
  `{slice, worktrees: [{path, head, detached, prunable}]}`.
- **After the fact, in the audit tree** — the durable record, since the worktrees
  themselves are gone:
  - `90-audit/foundry-cost.md` carries `- **worktree isolation:** worktree`, or
    `- **worktree isolation:** directory (DEGRADED — <reason>)` when it fell back.
    A bare `directory` with no suffix means no worktree was ever requested.
  - `90-audit/journal.md` carries one isolation event per round:
    `round 1: worktree isolation for 3 specimen slot(s)`, with the same
    `(DEGRADED — <reason>)` suffix on a fallback.
  - Each specimen's run record carries `isolation`, `worktreePath`, and
    `diffFiles` — the files that specimen changed inside its own worktree.
    `diffFiles` is **attribution only**; turning it into an `--impl` for
    `bridge eval` is out of scope.
  - **On the in-session path**, that record is written by
    `stz bridge specimen-record --root . --slice <slice> --specimen <id>
    --status <ok|timeout|error> --duration-ms <n> [--kill-reason "<why>"]`,
    appended to `90-audit/specimens/<slice>.jsonl` and read back with
    `stz bridge specimen-records`. The foundry runner builds its own record
    because it owns the spawn loop; `/stz-f:run` does not, so it reports what it
    alone observed and the bridge derives the rest.

    Three properties worth knowing, because each is a control rather than a
    convenience:

    - **The bridge derives `isolation`, `worktreePath` and `diffFiles` itself**,
      matching the exact path `worktree-create` would have produced. It does not
      accept them from the caller, so a command that believed it got a worktree
      but silently degraded cannot report itself as a worktree run.
    - **`--kill-reason` is required whenever `--status` is not `ok`.** An outcome
      with no reason is unattributable, which is the thing the record exists to
      prevent.
    - **Record before teardown.** `worktree-destroy` removes the tree, and with it
      the only source of `diffFiles`. `finalize` reports `specimensRecorded` in
      its JSON and warns on stderr when it is zero — it never gates (a successful
      tournament must not fail over thin telemetry), but the omission is visible
      rather than silent.
