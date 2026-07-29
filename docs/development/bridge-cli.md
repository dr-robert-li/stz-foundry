# The bridge CLI directly

STZ's deterministic half is exposed as `stz bridge <subcommand>` — JSON in,
JSON out, over the `.stz/` tree. The `/stz-f:*` commands call it between subagent
spawns, but it is scriptable on its own. Each subcommand prints one JSON object
and writes its artifacts under `.stz/`.

```bash
stz bridge version                                                 # {version, schemaVersion, packageName} — drift detection (F19)
stz bridge begin        --root . --manifest .stz/40-slices/slice-01/manifest.json
stz bridge eval         --root . --slice slice-01 --specimen a \
                        --sealed .stz/30-tests/held-out/<file> \
                        --impl   .stz/40-slices/slice-01/prototypes/specimen-a/<file>
stz bridge gate         --root . --slice slice-01
stz bridge escalate     --root . --slice slice-01   # no-passers: advance retry→replan→halt FSM (F14), write refinement/failure report
stz bridge record-votes --root . --slice slice-01 --votes votes.json
stz bridge select       --root . --slice slice-01
stz bridge finalize     --root . --slice slice-01 --intent intent.json --asbuilt asbuilt.json

# project-level driver (multi-slice)
stz bridge project-set-config   --root . --config run-config.json  # persist run config (validated, clamped)
stz bridge project-config       --root .                           # read it back (defaults if unset)
stz bridge project-dark-factory --root . --on                      # engage autonomous mode (--off to disengage)
stz bridge project-harness-evolve --root . --on                    # enable the /stz-f:evolve meta-loop (--off; default off)
stz bridge project-status       --root .                           # DAG + phase status + progress totals + dashboard-ready slice rows + runConfig + darkFactory + harnessEvolve

# sealed held-out suite integrity (L1/F10) — freeze before the tournament
stz bridge seal            --root .                   # sha256 the held-out suite into SEAL.json
stz bridge seal-verify     --root .                   # re-hash vs SEAL.json; exit 1 on drift (gate before judging)
stz bridge seal-crosscheck --root . --sealed <suite> --reference-a <impl> --reference-b <impl>
                                                     # run the suite vs two independent references; exit 1 unless both pass
stz bridge seal-amend      --root . --reason "<why>"  # sanctioned post-freeze change: records from→to + reason

# cross-slice merge integrity — superseded sealed invariants
stz bridge merge-validate        --root . --results results.json   # adjudicate reported suite failures; exit 1 unless all sanctioned
stz bridge merge-compat-propose  --root . --entry entry.json       # merge agent proposes a supersession (always unapproved)
stz bridge merge-compat-approve  --root . --id <id> --by "<who/why>"  # approver blesses it (recorded)
stz bridge merge-compat-retire   --root . --id <id> --amendment "<ref>"  # retire once the superseded suite is seal-amended
stz bridge merge-compat-list     --root .                          # read-only dump of the manifest

# per-specimen worktree isolation (1.17.0) — --target defaults to --root
stz bridge worktree-create  --root . --slice slice-01 --specimen a  # {mode, path, name, reason, slice, specimen} — the bridge owns the path AND the fallback
stz bridge worktree-list    --root . --slice slice-01               # {slice, worktrees:[{path, head, detached, prunable}]}
stz bridge worktree-destroy --root . --slice slice-01               # {slice, removed[], pruned} — idempotent, always exit 0

# per-specimen run record, in-session path (1.17.0) — run BEFORE worktree-destroy
stz bridge specimen-record  --root . --slice slice-01 --specimen a --status ok --duration-ms 1234
stz bridge specimen-record  --root . --slice slice-01 --specimen b --status timeout --kill-reason "stuck" --duration-ms 30000
stz bridge specimen-records --root . --slice slice-01               # {slice, records[]} — every recorded specimen, append-only

# cross-slice semantic recall (1.17.0) — over the allowlisted .stz/ tiers only
stz bridge knowledge-index --root .                                 # {rebuilt, embedded, evicted, total, fingerprint, provider} — walk/hash/embed/persist
stz bridge knowledge-query --root . --role planning --keywords a,b [--symbols s] [--step-id id]
                                                                    # {hits[], role, caps, semantic} — capped, explained, role-scoped; never writes
```

`merge-validate` adjudicates *reported* sealed-suite results (`{slice, passed,
failure}`) against an audited compat manifest — it does not run the suites (the
assembled crate may be Rust), so what is deterministic is the **rule application**
(signature match + superseding-passes + approved), the same trust split as `eval`
vs `record-eval`. A failing suite is sanctioned only as a signature-matched,
approved supersession whose replacement invariant also passes; `pendingApproval` /
`invalid` / `unsanctioned` all block. Compat entries are transitional debt retired
by a `seal-amend`. Full contract:
[`../../commands/stz-merge.md`](../../commands/stz-merge.md) and the cross-slice
section of [`sealed-suite.md`](./sealed-suite.md).

`escalate` is the deterministic owner of bounded cross-round failure handling
(F14). The `/stz-f:run` command calls it once after a gate that produced zero
passers; it advances the retry→replan→halt FSM over `state.json` (hard ceiling:
run-config `retryPolicy`; default 2 retries, 1 replan), persists the new counts, and writes the PDR `refinement.md`
the next round's specimens consume (on retry/replan) or a `failure-report.md` and
a `judgment: failed` phase (on halt). `gate` stays a pure read and never mutates
escalation, so the two can't double-advance; the FSM's ceiling makes even a stray
double-`escalate` fail-safe (it halts early, never loops). The sealed suite is
untouched across rounds — retry/replan re-enter the tournament with the same
frozen suite, `seal-verify` gating each round.

`project-dark-factory` is a load-modify-save toggle: it flips `darkFactory` in the
persisted run config without touching any other field (deliberately NOT routed
through `project-set-config`, whose normalize-over-defaults merge would reset
fan-out/models/strictness). It is the single source of truth for autonomous mode —
the `/stz-f:*` commands read the hoisted `darkFactory` flag from `project-status` at
each phase, so engaging it mid-run takes effect at the next phase. See
[`dark-factory.md`](./dark-factory.md) for the gate-skipping contract.
`project-harness-evolve` is the same pattern for the opt-in `/stz-f:evolve`
meta-loop: it flips `harness.enabled` in place (hoisted as `harnessEvolve`),
which the pipeline reads to decide whether to run `/stz-f:evolve` after the
summary. Off by default.

The `worktree-*` verbs are the in-session seam for per-specimen isolation:
`/stz-f:run` calls `worktree-create` once per specimen and hands each the `path`
it printed, never computing one itself — the bridge owns both the path and the
decision to degrade to directory isolation, and `mode`/`reason` are what the run
report surfaces. `--target` is the repo being edited, defaulting to the project
root that holds the `.stz` tree (the same shape `explore` uses). Teardown is
already wired into `finalize`, `escalate`(halt), `slice-halt` and `slice-reset`,
so `worktree-destroy` is only needed on an abort that reaches none of them; it is
idempotent and never sets a non-zero exit code. Mechanism, durable side effects
on the target repo, and the stated ceilings: [`worktrees.md`](./worktrees.md).

The `knowledge-*` verbs are cross-slice recall. `knowledge-index` walks only the
approval-gated tiers (`00-intent`, `10-research`, `20-standards` — an allowlist,
so `30-tests/` is never opened), embeds each document's frontmatter summary
behind a provider seam (Ollama `nomic-embed-text` when it answers, a
deterministic offline embedder otherwise, selection always reported), and
persists `.stz/90-audit/knowledge-index.json`. It is incremental — only changed
documents are re-embedded, deleted ones are evicted — and `finalize` already runs
it at slice close, so the manual invocation is for a deleted, gitignored or
fingerprint-stale index. `knowledge-query` never writes and never re-embeds the
tree: one query embedding, then capped, explained, role-scoped hits through the
same `retrieve()` contract, with the semantic layer reporting itself off (with a
reason) rather than comparing vectors across embedders. Mechanism, the tier
allowlist's rationale, the similarity-floor calibration procedure and what is
*not* wired yet: [`semantic-recall.md`](./semantic-recall.md).

The sealed-suite commands back the anti-hacking freeze: `seal-crosscheck` (0.5.0)
runs the suite against a second, independently-authored reference before sealing,
so a blind spot the test-author shares with the suite surfaces as a divergence;
`seal` after the smoke gate is green and the cross-check is both-pass; `seal-verify`
immediately before the eval/gate so a frozen-suite edit can't slip in
mid-tournament; `seal-amend` as the only audited way to change a sealed file once
frozen. The guide-vs-sensor
contract behind it (what the smoke gate does and does NOT catch, where the
reference lives, how failures are classified) is in
[`sealed-suite.md`](./sealed-suite.md).
