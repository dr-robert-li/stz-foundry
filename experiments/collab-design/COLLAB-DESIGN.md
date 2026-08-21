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

## 4. STaRK KB selection

**Decision: PrimeKG.** This is a decided, documented choice against Amazon and MAG —
STaRK's other two constructed knowledge bases — on three grounds: size, licence, and
replay.

**Size.** The verified operational footprint of the STaRK-processed PrimeKG artifact
is **254M** on disk (`tools/stark-eval/data/prime/processed`), quoted verbatim from
`experiments/collab-oracle-spike/raw/download-size.log`'s own `du -sh` output — the
only in-repo, hands-on-measured size evidence for any of the three KBs. This is the
operational footprint claim: what this project actually stores and loads once
STaRK's own feature/embedding processing has run. A separate, smaller figure
("~28 MB") appears in this phase's own carry-forward context (`19-CONTEXT.md`
`<specifics>`) and most plausibly refers to PrimeKG's own raw upstream CSV release
(the Harvard Dataverse artifact, before STaRK's processing inflates it) — but this
project has not independently verified that number against the Dataverse artifact
itself, so it is stated here only as an unverified upstream-release figure, distinct
from and never interchangeable with the 254M verified processed-artifact figure. An
unqualified size claim that a committed log in this same repository contradicts is
the easiest finding a panel lane could score against this document, so the two
figures are kept explicitly separate.

**Licence.** Both licence claims below were independently retrieved this session,
not carried forward from search-synthesis, upgrading RESEARCH assumptions A2 and A3:

- **STaRK dataset:** `cc-by-4.0`, read from the YAML front-matter of the dataset card
  at `https://huggingface.co/datasets/snap-stanford/stark` (fetched 2026-08-21;
  `license: cc-by-4.0` is the first line of the card's metadata block).
- **PrimeKG:** the PrimeKG **codebase** is MIT-licensed, per the README at
  `https://github.com/mims-harvard/PrimeKG` (fetched 2026-08-21; "PrimeKG codebase
  and associated tools are released under the MIT license"). That same README states
  in the same sentence that this MIT grant covers the software only and explicitly
  does **not** cover the PrimeKG **dataset** itself, directing users instead to "the
  respective dataset licenses available on data website" without naming one in the
  fetched text. The PrimeKG dataset's own licence is therefore left **unverified**
  by this fetch — the codebase licence (MIT) and the dataset licence (unstated in
  this source) are two different claims and are not conflated here.

**Replay.** PrimeKG is the KB Phase 18 actually harvested against: revision-pinned to
`88269e23e90587f99476c5dd74e235a0877e69be` (stark-qa `1.1.0`), with sealed selection
and heldout pools already committed and byte-reproducible —
`test/fixtures/stark/prime-selection.json` (`pool: selection`, `sample_size: 75`,
`sampled_from_n: 2241`, `split: val`, `seed: 1801`) and
`test/fixtures/stark/prime-heldout.json` (`pool: heldout`, `sample_size: 75`,
`sampled_from_n: 2801`, `split: test`, `seed: 1802`), both traced through
`tools/stark-eval/harvest_gold.py` and re-confirmed byte-identical on a fresh re-run
(`experiments/collab-oracle-spike/SPIKE-FINDINGS.md` §"Sample seeds and pools").
Choosing Amazon or MAG instead would discard this entire replay chain and require
re-running Phase 18's harvest from scratch against a different KB, with no existing
sealed fixtures — this is the strongest of the three grounds: it is not merely that
PrimeKG scores better on paper, it is that the harvested, byte-reproducible evidence
for it already exists and the evidence for the alternatives does not.

**Decision statement.** PrimeKG is selected over Amazon and MAG on the verified
254M operational footprint (size), an independently-retrieved cc-by-4.0 dataset
licence with the PrimeKG codebase/dataset licence distinction stated explicitly
(licence), and an already-harvested, byte-reproducible sealed fixture pair this
project would otherwise have to redo from scratch (replay).

## 5. Battery and task shape

**Unit of work.** One STaRK query is one battery task, keyed by the query's own
`query_id` field — **never** by positional index. Phase 18's spike confirmed the two
do not coincide once a real split is selected (`SPIKE-FINDINGS.md` §"query_id vs
positional index": every sampled row across both the `val` and `test` splits had
`row_query_id != idx`); `query_id` is a global id into STaRK's full un-split dataset,
and both `harvest_gold.py`'s sampler and `tools/stark-eval/score_one.py`'s
`load_split()` key exclusively off the row's own `query_id`, never a loop index. A
task keyed by index would silently mispair a query with the wrong gold answer set
the moment a split boundary shifted.

**Output contract (CD-01).** The answerer emits a ranked candidate list capped at
**20** entries. This preserves STaRK's native Hit@k, MRR, and Recall metrics and
keeps baseline comparability with STaRK's own published leaderboard shape; a
single-id answer is recoverable from the ranked list as Hit@1 and is not a separate
output mode the answerer needs to support.

**Candidate identity (CD-02).** The builder-prompt/answerer-prompt pair jointly *is*
the candidate, carrying a single lineage — not two independently-scored halves. A
mutation edits one role's prompt (builder or answerer, never both in the same
mutation step), and selection scores the pair as a whole; no role is ever scored or
selected in isolation from its partner.

**Artifact durability (CD-03).** Per-attempt subgraph artifacts live in the detached
round's own artifact directory for the duration of that round. Only the **winning**
attempt's subgraph artifact is promoted into the `.stz/` audit tree; losing attempts'
artifacts are not carried forward into the permanent record.

**Structural bounds (CD-05).** The builder's subgraph must be (a) connected, (b)
within a stated minimum and maximum node count, and (c) a query-linked neighbourhood
(every node reachable from the query's own seed entities within the subgraph, not an
arbitrary disconnected sample). Concrete proposed bounds, marked explicitly as
**panel-tested proposals, not settled values** (CD-05 requires the exact bounds get
panel scrutiny before freeze): minimum 3 nodes (below which "subgraph" is not a
meaningful distinction from a single fact lookup), maximum 200 nodes (bounding both
the answerer's read cost and the artifact's storage footprint, chosen as a round
order-of-magnitude ceiling well above what a query-linked neighbourhood at this KB's
typical entity degree should need, and left open to the panel to argue up or down).

**D-04/CD-05 harmonizing reading, open to panel attack.** D-04 ("one condition") and
CD-05 ("a degenerate-graph arm" in the REQ-81 ablation family) read as if they might
conflict — D-04 fixes the primary ablation gate to a single no-subgraph null control,
while CD-05 separately requires a degenerate-graph arm. The reading this document
takes, per RESEARCH's Open Question 1 recommendation: D-04's "one condition" governs
the **primary** ablation gate (the binary "degraded" verdict §7 will pin as an
explicit inequality) — CD-05's degenerate-graph arm is a **diagnostic member of the
broader REQ-81 ablation family**, distinct from and never overriding the D-05 primary
gate itself, not a second arm competing for the same degraded/not-degraded verdict.
This reading is stated explicitly, not silently resolved by dropping either decision,
and the panel is invited to attack it if it is wrong.

**Battery entry point.** `runAgentBattery` (`src/foundry/agent-runner.ts`) is reused
unchanged as the collaborative mode's battery driver — the same dispatcher that runs
one task per candidate today runs one task per STaRK query here, with no change to
its own signature or scheduling. What the collaborative mode adds beside it is the
task record's own payload: the builder/answerer prompt pair (for the CD-04 hash, §9),
the handoff artifact's recorded hash (§3), and the query's `query_id` (this section)
— all carried as data on top of `runAgentBattery`'s existing task/result shape, not
as a change to the function itself.

