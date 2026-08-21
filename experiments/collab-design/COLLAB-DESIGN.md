# C-01 collaborative-mode design

This document governs the C-01 collaborative mode — a graph-builder agent and an
answer agent jointly working a shared, handoff-immutable STaRK subgraph, scored
fail-closed against STaRK's own constructed gold node ids — before any of its
implementation code exists. It exists so the design is fixed and panel-attacked
before Phases 20–22 write `collaborative-admission.ts`, the scoring bridge, the
collaborative runner, and the tournament shell against it, rather than the design
being discovered piecemeal as those modules are built. `SELECTION.md` (commit
`2747e11`) selected C-01 as the direction; this document is the next step that
selection authorised, not a re-argument of the selection itself.

## 1. Scope and freeze status

This document governs the C-01 collaborative mode as it will be implemented across
Phases 20–22: the builder/answerer role split, the handoff-immutability contract
between them, the STaRK knowledge-base choice, the battery/task shape, the oracle
interface (grounded in Phase 18's spike), the ablation-gate design, and the
two-prompt candidate hash shape. It does not govern Phase 18's already-landed
`experiments/collab-oracle-spike/` work, which stands as read-only prior evidence
this document cites; nor does it govern anything outside the collaborative mode —
the existing adversarial mode, `runAgentBattery`, `OracleReceipt`, and the rest of
the foundry backbone are used here exactly as they exist today and are not
redesigned by this document.

**Freeze protocol (D-08).** This document is frozen at a commit that is a strict git
ancestor of every commit touching the Phase 20–22 implementation modules named in
§9. That ancestry is provable with `git merge-base --is-ancestor <freeze-commit>
<later-commit>` and is pinned mechanically by a committed freeze test
(`test/collab-design-freeze.test.ts`, added in plan 19-05) rather than relying on a
reviewer's memory of commit order. **Amendment protocol, stated in the same breath:**
once frozen, a change to this document requires either a new five-lane panel round
over the amended text, or a documented amendment entry naming what changed and why —
never a silent edit. That cost is deliberate: it is exactly why the panel round runs
before the freeze rather than after, so the expensive adversarial scrutiny happens
once, on the design as a whole, instead of being paid piecemeal for every later
edit. Phase 18's spike commits (`experiments/collab-oracle-spike/`) are explicitly
**out of freeze scope** — they predate this document, are cited as evidence rather
than governed by it, and their prior existence is not a freeze violation.

## 2. Builder and answerer roles

Two roles, precise about what each can and cannot see:

- **The builder** reads the STaRK KB corpus (the PrimeKG-processed artifact, §4) for
  one query and writes an entity/relation subgraph judged relevant to that query to a
  per-task artifact slot. The builder never sees the gold `answer_ids` for the query
  it is building against — nothing in its inputs includes them.
- **The answerer** reads the builder's handed-off subgraph artifact and the query
  text, and writes a ranked candidate list (§5, CD-01). The answerer has **no path to
  the KB corpus** — it never queries PrimeKG directly, only the subgraph the builder
  handed off — and **no path to gold `answer_ids`** at any point before it commits its
  ranked list.

Enforcing the answerer's KB-corpus and gold-id boundary mechanically — not merely
instructing the answerer's prompt not to look — is Phase 21's mutation-tested strip
boundary (REQ-78), described here as the target behaviour but not implemented in
this phase. Per CLAUDE.md's architecture rule ("exact decisions... live in
deterministic TypeScript, never in agent prose"), every role boundary in this
section is phrased as something a runner can check or refuse, not something an agent
is trusted to respect on instruction alone. One boundary in this split resists that
framing today and is flagged rather than quietly left as a prompt instruction: the
builder's own restraint in what it writes into the subgraph (not smuggling
information that lets the answerer infer more than the subgraph structurally
conveys) has no mechanical check proposed anywhere in this document — §3's
failure-mode list names this explicitly as a gap the handoff contract does not
close, because a TypeScript boundary that only checks the artifact's hash cannot see
inside the artifact's content for that class of leak.

## 3. Handoff-immutability contract

This is the design's own novel piece (D-06) — the dossier's Collaborative-mode
sketch names the isolation requirement but records no field precedent for how to
implement it, so this section states the contract from scratch rather than adapting
an existing shape to fit.

**The contract: hash-at-handoff, verify-at-read.** When the builder finishes a task,
its subgraph artifact is hashed and that hash is recorded in the task record at the
moment of handoff. Before the answerer reads the artifact, the answerer's runner
re-hashes the artifact on disk and compares it against the recorded handoff hash.
Any mismatch is a fail-closed condition: the answerer's runner refuses to read the
artifact and the task is marked failed rather than proceeding on unverified content.

**Mechanical precedent for the check's *shape*, not its field.**
`src/foundry/battery-types.ts`'s `validateReceipt` is the precedent cited here: it is a
fail-closed, validate-first gate that throws `OracleReceiptError` naming the
concrete violation rather than flag-and-continue, and it runs at construction time
so an invalid value cannot exist rather than being caught after the fact
(`makeBattery` calls it before returning a battery value at all). The
handoff-immutability contract follows that same validate-first discipline — refuse
the read on mismatch, name the violation, never proceed on a hopeful default. This
is a precedent for the *idiom*, not the *data shape*: `OracleReceipt` has no
`artifactHash` or handoff-verification field of its own, and this contract is not
force-fit into `OracleReceipt`'s structure. It is recorded as its own contract, with
its own fields and its own failure modes below.

### Failure modes

Named explicitly, per D-06's instruction, so the panel attacks substance rather than
discovering omissions:

- **The artifact is mutated between hash and read (TOCTOU).** Intended behaviour:
  fail closed. The re-hash at read time is exactly the check that catches this — any
  mutation after handoff, regardless of cause (a bug, a race, a bad actor), produces
  a hash mismatch, and "closed" means the answerer's runner refuses to open the file
  and the task is marked failed, never silently proceeding on the mutated content.
- **The artifact is absent at read time.** Intended behaviour: fail closed. A missing
  file is not treated as "empty subgraph, proceed" — it is a distinct failure from a
  hash mismatch (the artifact was never produced or was deleted, not tampered with),
  reported as such, and the answerer's runner never synthesizes a placeholder
  artifact to keep the task alive.
- **The builder emits an artifact that hashes identically to a prior attempt's.**
  Intended behaviour: this is not itself a failure — a content-addressed hash
  colliding because two attempts produced byte-identical subgraphs is expected and
  correct (the same query against the same KB revision can legitimately produce the
  same subgraph twice). "Closed" has no meaning here because nothing is wrong; the
  contract's job is catching a hash that does **not** match its recorded handoff
  value, not policing hash reuse across attempts.
- **What the hash covers and what it does not.** The hash covers the artifact's byte
  content only — not filesystem metadata (mtime, permissions, inode) and not the
  path it lives at. A file moved to a different path with identical bytes still
  verifies; a file with identical bytes but a touched mtime still verifies. This is a
  deliberate scope: metadata and path are not part of what "the same subgraph" means
  for this contract, and including them would make the check brittle to operations
  (a filesystem copy, a rename) that do not change what the answerer actually reads.
- **What the contract does not defend against.** A builder that writes a subgraph
  containing information it should not have had — the contract verifies the artifact
  the answerer reads is byte-identical to what the builder handed off, which says
  nothing about whether the builder should have produced that content in the first
  place. Hash-at-handoff/verify-at-read is an integrity check across the handoff
  boundary, not a content-correctness or a scope-of-knowledge check on either side of
  it; that gap is the same one §2 flags for the builder's own restraint, and no
  mechanism in this section closes it.
