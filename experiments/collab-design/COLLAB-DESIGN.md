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
never a silent edit. The documented-amendment-entry branch is bounded: it covers only
non-substantive corrections — typos, cross-reference fixes, wording clarifications
that change no inequality, threshold, contract shape, or decision — and any change to
a symbol, a threshold, a contract, or a decision requires a new five-lane panel round,
never a documented entry alone. That cost is deliberate: it is exactly why the panel round runs
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

The output-smuggling gap gets a target mechanism, described here and implemented in
Phase 20/21: the builder's subgraph output must conform to a closed, versioned schema
with a deterministic validator that rejects unrecognized or free-form fields, so a
field the schema does not name cannot carry smuggled information into the answerer's
input. A second, distinct gap sits alongside it: the builder's own filesystem, tool,
cache, and fixture access is not itself mechanically restricted from reaching
gold-`answer_ids`-bearing data by a path other than its stated query inputs — a
schema on the *output* artifact says nothing about what the builder could read on the
way to producing it. Both gaps are named here as Phase 21's builder input/capability
boundary to close (REQ-78), not designed further by this document.

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
Both the handoff hash and the re-hash are performed by the runner/orchestrator, never
by the builder agent itself: a self-hashed, self-recorded artifact would only prove
the file matches the builder's own claim about it, not that the claim is
trustworthy — the check's value depends on the party computing the hash being
outside the party whose output it is checking. The recorded handoff hash is stored as
part of a record bound to the task's own `query_id`, attempt id, candidate
`definitionHash`, and KB revision — not as a bare hash value an actor with
artifact-replacement access could also overwrite or transplant from a different
task's record.

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
  A residual TOCTOU window remains between the re-hash itself and the actual
  open/read that follows it: the answerer's runner must open the artifact once into
  a buffer (or hold the same file descriptor) that it then both hashes and reads
  from, rather than re-hashing a path and reopening it as two separate operations —
  any mutation observed between those two operations is the same fail-closed
  condition as a hash mismatch, not a distinct case. A symlink target swapped
  between the hash and the open is treated identically: a mutation, not a distinct
  case the contract needs its own handling for.
- **The artifact is absent at read time.** Intended behaviour: fail closed. A missing
  file is not treated as "empty subgraph, proceed" — it is a distinct failure from a
  hash mismatch (the artifact was never produced or was deleted, not tampered with),
  reported as such, and the answerer's runner never synthesizes a placeholder
  artifact to keep the task alive.
- **The recorded handoff hash itself is absent, corrupted, or was never correctly
  written at handoff time.** Intended behaviour: fail closed, identically to an
  artifact-content mismatch — a re-hash with nothing valid to compare against is not
  "no check possible, proceed," it is the same refuse-and-mark-failed outcome as a
  mismatched hash, stated here as its own case rather than assumed to be covered by
  the "artifact is mutated" mode above.
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

**Illustrative, not exhaustive.** The five failure modes named above are illustrative
of the handoff contract's own shape, not an exhaustive enumeration of every
artifact-side edge case. Partial writes, oversized artifacts, malformed
serialization, and parser/schema-version drift are named explicitly as Phase 21
implementation-level failure modes this design does not itself enumerate further,
matching the "described here, implemented there" pattern §2 and §6 already use.

**Canonical serialization.** The builder's subgraph artifact must be written in a
canonical, deterministic serialization — fixed field ordering, a defined encoding, no
incidental whitespace variance — so that two structurally identical subgraphs always
hash identically. The concrete format is left to Phase 20/21 to choose within that
constraint; this section pins the requirement, not the format.

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

The STaRK dataset's `cc-by-4.0` licence applies identically to Amazon and MAG — it is
STaRK's own wrapper licence over whichever underlying KB is selected — and therefore
does not itself discriminate among the three candidate KBs. The only licence question
that would discriminate is PrimeKG's own dataset licence, and that one remains
unverified, as stated above.

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

**Decision statement.** PrimeKG is selected over Amazon and MAG chiefly on replay: an
already-harvested, byte-reproducible sealed fixture pair this project would
otherwise have to redo from scratch against a different KB — the one ground among
the three whose own body text above actually discriminates PrimeKG from Amazon and
MAG, since choosing either alternative discards this entire chain with no existing
sealed fixtures for it. The verified 254M operational footprint (size) and the
independently-retrieved cc-by-4.0 dataset licence (licence) are presented alongside
as honest supporting context — the only measured size figure in the repo for any of
the three KBs, and a licence distinction stated with its own unverified gap named —
rather than as independent comparative grounds a reader could mistake for equal
weight with replay's own discriminating evidence.

## 5. Battery and task shape

**Unit of work.** One STaRK query is one battery task, keyed by the query's own
`query_id` field — **never** by positional index. Phase 18's spike confirmed the two
do not coincide once a real split is selected (`SPIKE-FINDINGS.md` §"query_id vs
positional index": every sampled row across both the `val` and `test` splits had
`row_query_id != idx`); both `harvest_gold.py`'s sampler and
`tools/stark-eval/score_one.py`'s `load_split()` key exclusively off the row's own
`query_id`, never a loop index. This is what the cited evidence actually shows —
that `query_id` is not positional — and no more: it does not by itself establish
that `query_id` is globally unique across STaRK's full un-split dataset, a stronger
claim this section does not need and does not make. A task keyed by index would
silently mispair a query with the wrong gold answer set the moment a split boundary
shifted. A lookup by `query_id` must reject zero or multiple matching rows rather
than silently taking the first — a defined failure, not a defined behaviour that
happens to work when the assumption holds.

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

**Candidate × query expansion.** For a given candidate (one builder+answerer prompt
pair), one task is generated per query in the 75-query battery; task identity is the
pair `(candidateId, query_id)`. Retries and artifact ownership follow
`runAgentBattery`'s existing per-task retry semantics unchanged — this is never a
Cartesian product across multiple candidates within one round, only the one
candidate under evaluation expanded across the battery's queries.

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
task record's own payload: the builder/answerer prompt pair (for the CD-04 hash, §8),
the handoff artifact's recorded hash (§3), and the query's `query_id` (this section)
— all carried as data on top of `runAgentBattery`'s existing task/result shape, not
as a change to the function itself.

## 6. Oracle interface

**This section's ground truth is `SPIKE-FINDINGS.md`, not the dossier.** ROADMAP SC-1
requires the oracle-interface section be grounded in Phase 18's confirmed working path
because the dossier's own assumption about that path was wrong; every factual claim
below cites `SPIKE-FINDINGS.md` by name, and where the spike itself quotes a transcript,
that transcript is cited too, so a reader can walk from this section to the hands-on
evidence without an intermediate paraphrase.

**The correction, stated plainly.** The dossier's Exogenous-oracle analysis
(`experiments/graph-engineering-harness/CANDIDATE-DOSSIERS.md` §C-01) assumed: "The
oracle is STaRK's own scoring script (`E-05`'s Bar applied: `eval.py --dataset
{amazon,mag,prime}`, ranking candidate `node_id -> torch.Tensor` embeddings against the
gold node id, reportable to STaRK's own public Hugging Face leaderboard)," and its
Collaborative-mode sketch assumed the answer-agent "writes the final predicted node id,
which STaRK's `eval.py` scores against the gold id." **This is superseded.** `eval.py`
has no external-prediction flag — it drives only STaRK's five built-in baseline
retrievers, not an arbitrary agent's prediction (`SPIKE-FINDINGS.md` §"Corrections to the
C-01 dossier assumption"). The replacement, verified hands-on in Phase 18: a thin
project-authored wrapper, `tools/stark-eval/score_one.py`, calling
`stark_qa.evaluator.Evaluator.evaluate()` directly. The oracle itself is still
`stark_qa`'s own metric computation — nothing is reimplemented — but the invocation path
is a direct `Evaluator` call, not an `eval.py` shell-out.

**Invocation contract.** `score_one.py`'s argv is `<kb> <query_id>` positional, with
`[--hf-revision SHA] [--metrics ...] [--root DIR]` optional flags; the ranked prediction
object is piped on stdin as JSON, `{node_id_str: score, ...}`, capped at 20 entries per
CD-01 (`SPIKE-FINDINGS.md` §"Working invocation shape"). The wrapper prints exactly one
JSON object to stdout — `{"kb", "query_id", "hf_revision", "metrics"}` — and nothing
else on stdout: `stark_qa`'s own transitive dependencies (`colbert`, `tdc`'s
`download_hf`) print progress and warning lines with bare `print()` straight to the real
stdout, which would corrupt a `JSON.parse` on the Node side of Phase 21's bridge, so
`score_one.py` redirects the process's real stdout fd to stderr for the duration of every
load and only restores it to emit the final JSON line
(`tools/stark-eval/score_one.py:37-51`, the `_stdout_to_stderr()` context manager,
alongside `SPIKE-FINDINGS.md`'s own prose description of the same behaviour). Stdout
purity is not an implementation detail Phase 21 can take on faith — it is the exact
contract the bridge's `JSON.parse(stdout)` step depends on holding for every
invocation, including a failing one.

**Failure outcome table (Phase 21).** Beyond the out-of-pool `IndexError` case named
below, Phase 21's bridge must define a complete fail-closed outcome table covering
timeout, signal termination, malformed or multiple JSON on stdout, missing expected
metric keys, and stderr-only warnings — each its own deterministic outcome, never
silently scored as zero and never silently retried. This extends the
pre-filter/scored-miss precedent this section sets below for out-of-pool predictions
to the rest of the invocation's own failure surface.

**Evaluator construction and `candidate_ids`.** `Evaluator(candidate_ids=candidate_ids)`
— the constructor takes only `candidate_ids`, resolved from the loaded SKB's own
`.candidate_ids` accessor, never from the caller's prediction keys
(`SPIKE-FINDINGS.md` §"Evaluator construction and candidate_ids"; observed cardinality
129375, the KB's full node-id pool, dense and contiguous). The consequence Phase 21's
bridge inherits: a predicted node id outside that pool does not score zero and is not
silently dropped — `Evaluator.evaluate()` raises `IndexError` from inside `stark_qa`'s
own metric-computation code, the process exits non-zero, and stdout stays empty
(`SPIKE-FINDINGS.md` §"Three test predictions", case (c)). Phase 21's bridge must
pre-filter predicted node ids to the candidate pool before calling `score_one.py`, and
must treat a filtered-out prediction as a defined outcome — a scored miss, not an error
the bridge swallows or lets crash the caller. The bridge must also log and
differentiate its own pre-filter misses (an expected, defined outcome) from genuine
oracle-process failures such as OOM or a segfault, rather than presenting both
identically as "non-zero exit, empty stdout" — a systemic oracle failure needs to be
diagnosable separately from expected filtering, not folded into the same signal.

**Prediction shape.** `pred_dict` is a ranked mapping of candidate node id to score,
parsed from a JSON object on stdin and validated key-by-key, capped at 20 entries per
CD-01 — matching the wrapper's confirmed input contract, not a single predicted node id
(`SPIKE-FINDINGS.md` §"Prediction shape (ranked list, CD-01)"). Mixed valid/invalid
predictions have one defined rule: an invalid id is dropped from the ranked list and
its rank slot counts as a forfeited miss, never promoting subsequent valid ids into
its position. An empty ranked list and a duplicate-id list are each named with their
own defined outcome rather than left to fall through to whichever behaviour the
implementation happens to produce.

**Metrics.** The exact metrics list requested is `["mrr", "hit@1", "hit@5",
"recall@20"]`, and `Evaluator.evaluate()` returns a dict with those same four keys
(`SPIKE-FINDINGS.md` §"Metrics requested and returned"). `hit@1` is the ablation gate's
primary metric (§7); `mrr`, `hit@5`, and `recall@20` are secondary diagnostics — this is
the fact §7's secondary-diagnostics clause builds on.

**Granularity.** Scoring is confirmed per-query, hands-on — `Evaluator.evaluate()` is
already single-query-shaped, and no batch workaround was needed
(`SPIKE-FINDINGS.md` §"Per-query granularity"). A battery task is keyed by the query's
own `query_id` field, never by a positional index: the spike confirmed the two do not
coincide once a real split is selected — every sampled row across both the `val` and
`test` splits had `row_query_id != idx` (`SPIKE-FINDINGS.md` §"query_id vs positional
index"). §5 already states this for the battery/task shape; this section restates it as
part of the oracle contract because `score_one.py`'s own `load_split()` performs the
same `query_id`-keyed lookup on the Python side.

**Revision pinning.** The mechanism actually used is a checked, fail-closed assertion
(`assert_pinned_revision()`) that queries the live Hugging Face Hub for the dataset's
currently-resolved commit sha and compares it against a `HF_PIN` constant embedded in the
wrapper, aborting before any KB load on mismatch — not a `revision` kwarg, because
neither `load_qa` nor `load_skb` exposes one (`SPIKE-FINDINGS.md` §"Hugging Face revision
pin"). On a deliberately wrong pin, `score_one.py` exits 1 with `HF revision pin mismatch
for snap-stanford/stark: expected <wrong>, Hub currently resolves to
88269e23e90587f99476c5dd74e235a0877e69be` printed to stderr, confirmed hands-on
(`SPIKE-FINDINGS.md` §"Hugging Face revision pin", `raw/probe-pin-mismatch.log`).
This assertion verifies the Hub's current remote resolution only — it does not verify
the local cache's own on-disk content against that resolution, so a stale or
tampered local cache that happens to sit under a directory named for the pinned
revision would not be caught by this check alone. This is a known residual risk,
named here for Phase 21 to mitigate (a revision-qualified load path, or a local
artifact-manifest check), not resolved by this design.

**Receipt discipline.** Each scored prediction produces a `constructed`-kind
`OracleReceipt` carrying the lineage string the Phase 18 fixture already carries —
`["constructed:stark-prime", "constructed:hf:snap-stanford/stark@<pinned-sha>"]`, matching
`test/fixtures/stark/oracle-receipt.json` verbatim — and the `acceptedBy` identity
already human-approved during Plan 18-01 (`SPIKE-FINDINGS.md` §"Corrections to the C-01
dossier assumption", A4). This is a requirement on Phase 21's bridge (REQ-78), described
here and implemented there: every scored prediction the bridge returns must carry this
receipt shape, built with `src/foundry/battery-types.ts`'s existing `OracleReceipt`
type and validated by its existing `validateReceipt`/`EXOGENOUS_ROOT_KINDS` discipline —
no new receipt shape is introduced for the collaborative mode. Every `OracleReceipt`
must be constructed per scored prediction and bound to that specific `query_id`,
prediction payload, metrics, and attempt identity — never a template receipt reused
across results — an explicit requirement on the bridge's `validateReceipt` call site,
beyond the lineage fields the receipt type already carries.

**What this design does NOT specify about the oracle.** The strip-boundary
implementation that keeps `answer_ids` unreachable from any agent-visible code path, the
environment-fingerprint preflight's exact shape (venv path, package versions, KB
revision — named in ROADMAP Phase 21 SC-3, not designed here), and the per-attempt
output-path scheme that keeps a stale result from a crashed prior run from being mistaken
for a fresh one are all Phase 21's to design within the contract this section states, not
this document's to pin.

## 7. Ablation-gate pre-registration

**Authority statement.** This section's every inequality is transcribed from amended
D-05 in `.planning/phases/19-c-01-design-freeze/19-CONTEXT.md` (amended 2026-08-21), the
sole authority for both gates and their directions — not from `19-PATTERNS.md`'s "Core
pattern" list, whose formula has its two arms transposed relative to amended D-05's own
words. D-05 is rated one-way: once a heldout run has happened, the pre-registration
cannot be amended without invalidating the run, so this section is written entirely
before any measurement, in the house pre-registration voice
(`experiments/paired-comparison-arm/PAIRED-DESIGN-PREREG.md`): the gate, the metric, the
procedure, and the treatment of failures, all stated now, nothing left to be settled
after results are seen.

**The null control (D-04).** One condition: the no-subgraph answerer — the identical
answerer prompt shape with an empty or absent subgraph slot, query only. The
shuffled-subgraph control was considered and deliberately not taken: it would
approximately double the evaluation cost of this gate (a third arm scored over the same
75-query suite) for a condition this design does not need to isolate "wrong subgraph"
from "no subgraph" — the bypass-defense question §5 exists to answer is whether removing
the subgraph entirely hurts, not whether a corrupted one does. This omission is a
recorded decision (`19-CONTEXT.md` Deferred), not a gap; it can be revisited as its own
amendment if the no-subgraph result proves ambiguous.

**The evaluation suite.** The sealed heldout pool at
`test/fixtures/stark/prime-heldout.json` — `pool: heldout`, `sample_size: 75`,
`sampled_from_n: 2801`, `split: test`, `seed: 1802` (its own `meta` block, read directly)
— both arms scored over the identical 75 queries, paired per query.

**The primary gate — bypass defense.**

```
graph_hit@1 - null_hit@1 >= δ1
```

Per amended D-05, PASS requires the no-subgraph arm to be at least δ1 BELOW the
graph-handoff arm: removing the subgraph must measurably hurt, or the answerer is
running on parametric recall and the subgraph is not the thing producing correct
answers. This is the design's central validity defense against parametric-recall
bypass — a defense that only does its job if it correctly FAILS whenever the null arm
scores close to or above the graph arm, which is what the inequality above checks
directly:
`graph_hit@1` on the left, `null_hit@1` subtracted, compared against a margin the
no-subgraph arm must fall short by.

**The secondary check — do-no-harm.**

```
null_hit@1 - graph_hit@1 >= δ2
```

Its own named inequality, its own relational operator, its own margin — not prose
riding on the primary gate's paragraph. It flags when the graph-handoff arm is at least
δ2 BELOW the no-subgraph arm: the handoff actively hurting, the opposite direction from
the primary gate. This is a **bypass-defense primary** (the gate above) and a
**do-no-harm secondary** (this one) — named in words, not only in the direction of a
symbol, so a reader checks both without decoding sign conventions. The secondary is a
flag, not the verdict: it cannot alter the primary gate's PASS/FAIL outcome, whatever it
reports.

**Margins, expressed as queries first.** Both margins are proposed here as the draft's
starting point for panel scrutiny, per D-05's own text ("the number gets panel scrutiny
before freeze") — not as settled values.

- **δ1 (primary, bypass-defense):** 6 of the 75 queries, `6/75 = 8.0` percentage points.
  Six queries is inside a 4–8-query range offered here as a stated practitioner
  judgment call, not a cited derivation — no traceable source pins this range, and it
  is presented for panel scrutiny per D-05's own text rather than beside an uncited
  number a reader might mistake for a derived figure. §10 already asks that any
  overturning evidence be cited rather than intuitive; this range is held to the same
  bar it sets for its own challengers.
- **δ2 (secondary, do-no-harm):** 5 of the 75 queries, `5/75 ≈ 6.7` percentage points.
  Set one query lighter than δ1 precisely because δ2 is the smaller margin and both
  inequalities read the same paired difference in opposite directions: a do-no-harm
  trigger necessarily co-occurs with a primary-gate FAIL whenever it fires. The
  secondary is not an independent detector — it is a same-swing diagnostic that names
  the direction and magnitude of harm within a result the primary gate has already
  failed, existing to surface that an already-failing result is actively harmful, not
  to catch a case the primary gate would otherwise miss.

Both are whole numbers of queries out of the sealed suite first, with the
percentage-point figure derived from that count — no margin here is a number no integer
outcome count of this 75-pair suite could actually reach. Wherever δ1 and δ2 appear
beside the `hit@1`-based inequalities above, they denote the rate equivalents —
δ1 = 0.08, δ2 ≈ 0.067 — not the raw query counts: `hit@1` is itself a rate, and a
margin combined with it in the same inequality must be stated in that same unit. The
query counts and the rates are two representations of the same margin, restated in
whichever unit the surrounding context requires, never left for the reader to
reconcile a query count against a per-query rate.

**Boundary behaviour.** Both inequalities include equality (`>=`), so a result landing
exactly on a margin has a defined outcome, stated here rather than left to inference: a
paired difference of exactly 6 queries (`graph_hit@1 - null_hit@1 = 8.0` pp) is a PASS on
the primary gate — the boundary counts as clearing it, not as falling short. A paired
difference of exactly 5 queries in the harmful direction
(`null_hit@1 - graph_hit@1 = 6.7` pp) fires the do-no-harm flag — the boundary counts as
triggering it, not as clearing it.

**Non-completions.** A non-completion — agent failure, timeout, malformed output — on
either arm for a given query counts as a **miss** for that arm on that query, and is
never excluded from the 75-pair denominator. Silent exclusion would let the
graph-handoff arm's own failures shrink the effective sample and bias the paired
comparison in its own favour, which is exactly the failure this treatment forbids; this
matches the fail-closed convention the rest of this system runs on
(`OracleReceipt`'s validate-first discipline, the out-of-candidate-pool `IndexError`
in §6 — neither silently drops a bad outcome, both make it count against the arm that
produced it).

**Precision statement.** The secondary statistical treatment is this project's own
exact discordant-pairs sign test (`experiments/paired-comparison-arm/_paired-gate.ts`),
the same family as McNemar's exact test, reported as a statement about uncertainty
around the pre-specified practical margins above — never as the verdict itself.
Statistical significance alone is **not** degradation; the margins above are the
verdict, and the sign test's p-value is diagnostic context around them. A discordant
pair is, by definition, exactly a query where the two arms disagree — one arm hits
and the other misses; a tie, where both arms hit or both arms miss, is excluded from
`n_d` by definition, stated here plainly rather than left to a reader's own
familiarity with the sign-test term of art.

**Critical values.** `_paired-constants.ts`'s pinned `PAIRED_CRITICAL_VALUE_TABLE`
(`_paired-gate.ts:145-167`, read directly) is indexed by discordant-pair count and
covers `[20, 60]`. The error that actually fires for an out-of-range discordant count
is the range guard ahead of the table lookup: `evaluatePairedGate` throws
`discordantCount ${discordantCount} outside the supplied critical-value table's own
range [${discordantFloor}, ${batterySize}]` (`_paired-gate.ts:152-156`), transcribed
verbatim from the check's own error text. The separate `no pinned critical value for
discordantCount ${discordantCount}` message (`_paired-gate.ts:165-167`) only fires for
an in-range count that is missing from the table — which cannot occur against the
default table for any in-range count, since the range guard above it already excludes
every out-of-range value before the lookup runs. This suite's 75 pairs land 15 rows
past that table's own ceiling — discordant counts 61 through 75 are uncovered, not
merely one row past it — so this design cannot reference it by index without a
guaranteed throw. **This design pins its own table**, covering the full discordant range this
suite can produce — the same Clause-2-style floor of 20 discordant pairs through the
full 75-query suite — computed by the identical exact-integer combinatorial condition
`PAIRED-DESIGN-PREREG.md` §5 states: the smallest integer `c` such that
`40 · Σ_{i=c}^{n_d} C(n_d, i) ≤ 2^{n_d}` (the exact per-tail-probability-≤-0.025
condition under `Binomial(n_d, 0.5)`, α = 0.05 two-sided, no floating-point tail
probability computed anywhere). This table was independently re-derived this session in
exact BigInt arithmetic and cross-checked against `PAIRED_CRITICAL_VALUE_TABLE_REV3`
(`_paired-constants.ts`, the paired-comparison-arm's own rev-3 widened table, which
covers `n_d` 20 through 90) — the two agree on every one of the 56 overlapping rows
(`n_d` 20 through 75), giving this design's own table an independent second derivation
rather than resting on a single unverified computation:

```
n_d=20: c=15  |  n_d=21: c=16  |  n_d=22: c=17  |  n_d=23: c=17  |  n_d=24: c=18
n_d=25: c=18  |  n_d=26: c=19  |  n_d=27: c=20  |  n_d=28: c=20  |  n_d=29: c=21
n_d=30: c=21  |  n_d=31: c=22  |  n_d=32: c=23  |  n_d=33: c=23  |  n_d=34: c=24
n_d=35: c=24  |  n_d=36: c=25  |  n_d=37: c=25  |  n_d=38: c=26  |  n_d=39: c=27
n_d=40: c=27  |  n_d=41: c=28  |  n_d=42: c=28  |  n_d=43: c=29  |  n_d=44: c=29
n_d=45: c=30  |  n_d=46: c=31  |  n_d=47: c=31  |  n_d=48: c=32  |  n_d=49: c=32
n_d=50: c=33  |  n_d=51: c=33  |  n_d=52: c=34  |  n_d=53: c=35  |  n_d=54: c=35
n_d=55: c=36  |  n_d=56: c=36  |  n_d=57: c=37  |  n_d=58: c=37  |  n_d=59: c=38
n_d=60: c=39  |  n_d=61: c=39  |  n_d=62: c=40  |  n_d=63: c=40  |  n_d=64: c=41
n_d=65: c=41  |  n_d=66: c=42  |  n_d=67: c=42  |  n_d=68: c=43  |  n_d=69: c=44
n_d=70: c=44  |  n_d=71: c=45  |  n_d=72: c=45  |  n_d=73: c=46  |  n_d=74: c=46
n_d=75: c=47
```

Below the 20-discordant floor — reused from this project's `PAIRED_MIN_DISCORDANT_FLOOR`
house convention — the sign test reports UNDERPOWERED as its own result, not a
significance verdict; this floor governs the sign test's precision statement only and
does not block or alter the primary margin gate above, which is evaluated on the raw
paired hit@1 counts regardless of the discordant-pair count. `W-superior`/`B-superior`
in the sign-test sense would read `k_w >= c(n_d)` / `k_w <= n_d - c(n_d)`, mirroring
`_paired-gate.ts`'s own convention exactly; this design does not write TypeScript for it
— Phase 23 implements this table and comparison as its own code artifact, this section
specifies the values it must transcribe. Phase 23's implementation must include a test
that mechanically re-derives all 56 rows of the pinned table above from the stated
combinatorial formula and compares them against the transcribed constants, mirroring
the paired-comparison-arm's own drift-guard discipline for its critical-value table —
this document's own transcription is not to be trusted on its own indefinitely. The
UNDERPOWERED precision statement, when `n_d` falls below the 20-discordant floor, must
be surfaced in whatever report or receipt artifact records the ablation-gate result —
never left as an internal return value the caller may or may not propagate. The gate
always evaluates against this design's own newly pinned table above (`n_d` 20 through
75), never against the existing `[20, 60]` table cited earlier in this section, for
every discordant count this 75-query suite can produce.

**Secondary diagnostics.** MRR, hit@5, recall@20, input-token counts, and error rates
are recorded as diagnostics. Statistical significance alone is not degradation, and none
of these diagnostics can alter the primary verdict after results are seen — they explain
a verdict already fixed by the margins above, never substitute for one.

**Ordering relative to any headline score.** This gate evaluates before any StaRK score
is reported as meaningful — the ablation-before-score discipline REQ-81 pins for
Phase 23.

## 8. Two-prompt candidate hash

Per CD-02/CD-04, one `definitionHash` identifies a collaborative candidate — the
builder-prompt/answerer-prompt pair jointly *is* the candidate, carrying a single
lineage, never two independently-scored halves. Per-role hashes are recorded in the
artifact payload for diagnostics only and are never used as the candidate id (CD-04).

**Why plain delimited concatenation is not specified enough.** `.planning/STATE.md`'s
CD-04 shorthand names "delimited concatenation" as the bundling shape; this section
specifies it exactly, because a naive delimiter is exploitable the moment either prompt
can contain the delimiter character. Worked collision, for a delimiter of `|`: the pair
`(builderPrompt = "a|", answererPrompt = "bc")` and the pair
`(builderPrompt = "a", answererPrompt = "|bc")` are two distinct, structurally different
prompt pairs — but under naive delimited concatenation, `builderPrompt + "|" +
answererPrompt` produces `"a|" + "|" + "bc" = "a||bc"` for the first pair and
`"a" + "|" + "|bc" = "a||bc"` for the second — byte-identical bundles, hence identical
`definitionHash` values, for two pairs that must never share an id. The "same pair, same
id" guarantee the hash exists to provide is broken by this construction whenever a
delimiter character can appear inside either prompt's own text, which this design does
not otherwise constrain.

**Chosen encoding: hash-of-hashes over fixed-length digests, builder-then-answerer.**
`definitionHash = sha256( sha256(builderPrompt) || sha256(answererPrompt) )`, where `||`
is raw-byte concatenation of the two **full, untruncated 32-byte** sha256 digests in a
fixed order (builder first, answerer second) — never the truncated 16-hex-character
diagnostic form. This is the failure mode the collision example above defends against:
because both inputs to the outer hash are fixed-length 32-byte values, there is no
delimiter-boundary question at all — a builder-prompt digest and an answerer-prompt
digest cannot be rearranged into a different byte split the way variable-length text
concatenated around a delimiter can. No normalization is applied to either prompt
before hashing: byte-identical prompt text is required for identical hashes, so
trailing whitespace, line-ending, and Unicode-normalization differences between two
otherwise-equivalent prompts are identity-bearing, never silently collapsed. Feeding
the outer hash the *truncated* 16-hex per-role diagnostic hashes instead of the full
32-byte digests was considered and rejected: using the full 32-byte inner digests
keeps the outer sha256's own 256-bit output space unconstrained by an artificially
small (2^128) input combination space, preserving headroom should a future need call
for the untruncated outer digest — a needless narrowing of that input space this
design does not accept when the full digests are already computed and available.

**Width, algorithm, and relationship to the existing single-prompt id.** The outer
hash's own output is sha256, hex-encoded, truncated to the same 16-hex-character width
`componentVariantId` already uses (`src/harness.ts:370-372`,
`createHash("sha256").update(definitionText).digest("hex").slice(0, 16)`), so
collaborative candidate ids read alike beside existing single-prompt component ids —
this design introduces no new hash width or algorithm, only a new two-input composition
in front of the existing one. This 16-hex (64-bit) truncated output carries the same
birthday-bound collision probability `componentVariantId` already accepts as house
convention — named here explicitly so the "prevents distinct prompt pairs from sharing
a hash" language above reads as a collision-resistance claim at a stated probability,
not an absolute-uniqueness claim. The joint `definitionHash` is a **sibling identity
added beside** the existing single-prompt id, never a redefinition of it:
`componentVariantId` itself is unchanged and continues to produce its own existing
16-hex-character truncated diagnostic form exactly as before — it is **not** the
function that produces the outer hash's two 32-byte inputs; those are the full,
untruncated `sha256(builderPrompt)` and `sha256(answererPrompt)` digests, computed
directly for that purpose as a step distinct from `componentVariantId`'s own
truncation. Every existing archived single-prompt component id in
`.stz/60-harness/component/<slot>/MANIFEST.json` is computed exactly as it always was,
untouched by this section.

**Per-role hashes, diagnostics only.** `componentVariantId(builderPrompt)` and
`componentVariantId(answererPrompt)` — the existing 16-hex-character truncated form —
are each recorded in the artifact payload alongside the joint `definitionHash`, for
diagnostics only, per CD-04's own text. Neither is ever substituted for the joint hash
as the candidate id, and selection never scores a role's prompt independent of its
partner (CD-02).

## 9. Module names for Phases 20–22

The frozen design is what the forward-ancestry guard (`test/collab-design-freeze.test.ts`,
Plan 19-05) watches, and it can only watch paths this document names. Pinning at least
one filename per surface ROADMAP Phase 19 SC-3 lists — `collaborative-admission.ts`, the
scoring bridge, the collaborative runner, and the tournament shell:

| Surface (ROADMAP SC-3) | Module filename | Provenance |
|---|---|---|
| Collaborative admission axis | `collaborative-admission.ts` | Already fixed in REQUIREMENTS.md (REQ-79, Phase 20) — reused verbatim, not renamed |
| Node↔Python scoring bridge | `collaborative-scoring-bridge.ts` | New name, this section, matching the admission module's `collaborative-<noun>.ts` style (Phase 21, REQ-78) |
| Collaborative runner | `collaborative-runner.ts` | New name, this section, same style (Phase 22, REQ-80) |
| Tournament shell | `collaborative-tournament-shell.ts` | New name, this section, same style (Phase 22, REQ-80) |

**Directory placement within `src/foundry/` is Phase 20's and Phase 21's to settle** —
this section pins the top-level filenames only, the concrete watched paths the
forward-ancestry guard needs, not the subtree layout around them.

**What this table currently is.** A naming commitment for Phase 20/21 to honour when
creating these modules, checked — if at all before those modules exist — by a guard
those phases author against the concrete paths they choose, not an active
path-watching mechanism today. This is distinguished explicitly from §1's ancestry
freeze test, which operates at the commit level via `git merge-base --is-ancestor` and
needs no file paths at all; the two mechanisms are not conflated under one "pinned
mechanically" claim.

**The sealed-union constraint, alongside.** `collaborative-admission.ts` is a sibling
table beside `src/foundry/vertical-admission.ts`'s existing `VERTICAL_ADMISSION`, never
a widening of it: the existing five-member `Vertical` union
(`data-ops`, `bi-analytics`, `performance-marketing`, `customer-support`,
`revops-gtm-exec-strategy`) and its size test stay exactly as they are — no member
added, no test edited to accommodate a widening. The collaborative mode's own admission
axis is a wholly new, separately-typed table, not an extension of `Vertical`.

## 10. Open items for the panel

The design's own list of what it knows is contestable, so the panel attacks stated
positions instead of finding gaps. For each item, what a reviewer would need to show to
overturn it:

- **The proposed margin values, δ1 = 6 queries (8.0 pp) and δ2 = 5 queries (6.7 pp)
  (§7).** Overturn by showing either number sits outside the range ordinary
  run-to-run agent variance on this suite would produce, with evidence (a prior run's own
  variance, or a cited figure) rather than intuition alone.
- **The proposed structural bounds, minimum 3 nodes and maximum 200 nodes (§5).**
  Overturn by showing PrimeKG's typical query-linked neighbourhood at this KB's own
  entity degree routinely falls outside this range, making the bound either
  needlessly restrictive or too loose to constrain a degenerate subgraph.
- **The D-04/CD-05 harmonizing reading (§5): CD-05's degenerate-graph arm is a
  diagnostic REQ-81-family member, not a competing second verdict for D-05's primary
  gate.** Overturn by showing CD-05's own text requires a second, independent
  win/loss/degraded verdict that this reading's demotion to "diagnostic" would suppress.
- **The chosen candidate-hash encoding, hash-of-hashes over full 32-byte digests (§8).**
  Overturn by demonstrating an actual construction under which two distinct prompt pairs
  produce the same joint `definitionHash`, or by arguing length-prefixing is preferable
  on a concrete ground (implementation simplicity, existing precedent) this section did
  not weigh.
- **The handoff-immutability contract's lack of field precedent (§3).** Overturn by
  naming an existing in-repo or external mechanism this design should have reused
  instead of the from-scratch hash-at-handoff/verify-at-read contract.
- **Any claim still carrying an unverified provenance qualifier.** The PrimeKG
  **dataset's** own licence (§4 — the codebase's MIT licence is independently verified,
  the dataset licence is not) and the "~28 MB" upstream-release size figure (§4,
  distinct from the verified 254M processed-artifact figure). Overturn either by an
  independent fetch of the PrimeKG dataset's own stated licence, or by verifying the
  28 MB figure against the Harvard Dataverse artifact directly.

**Status.** This is **rev-2, frozen** (Plan 19-05). A five-lane adversarial panel round
(gpt-sol-pro, kimi-k3, qwen-max, gemma4, gpt-oss) ran over rev-1 on 2026-08-21,
producing 47 raw findings merged into 39 global findings and adjudicated 35 ADOPTED /
4 REJECTED-with-reason (`experiments/collab-design/COLLAB-DESIGN-REVIEWS.md`
"Adjudication ledger"). This commit applies exactly the 35 adopted findings; no lane
attacked §7's primary bypass-defense inequality's sign or direction, and none of the
open items above is resolved by this freeze — they remain open for a future
five-lane round or documented amendment entry per §1's amendment protocol.

