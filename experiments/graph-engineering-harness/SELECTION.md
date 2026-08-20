# Selection — graph engineering harness direction (REQ-75)

**Phase:** 16-graph-engineering-harness-unconditional-pivot · **Author:** Robert Li

This document is the presentation the blocking gate at 16-05 needs, written down before the question is
asked rather than assembled verbally at the checkpoint, so the record shows exactly what was in front of
the decision. It carries the full scored matrix, every candidate's oracle-gate status, the screened-out
record, the post-validation evidence base, and the graph-integrity finding — in that order. The `## Decision`
fields at the end are left unfilled here; they are written only after the gate resolves, because this
document has to stand alone (the planning record these terms come from is not committed to this repository).

## Scope of this decision

The direction selected here becomes the next milestone's direction. The design and implementation work that
follows is built against it, and re-opening the selection later means discarding whatever was built against
it and re-opening this choice from scratch. The backbone — `runAgentBattery`, `OracleReceipt`/
`EXOGENOUS_ROOT_KINDS`, `runComponentTournament`/`promoteComponentWinner`, `src/bridge.ts` — is kept under
every surfaced option; this decision adds a new collaborative mode beside the existing adversarial one, it
does not replace it or any of the five existing `VERTICAL_ADMISSION` rows. No design or implementation work
for any direction exists yet, by construction, because the phase ends at this selection. The candidate set
came in at exactly 3, the minimum of the plan's 3-5 bound — not a shortfall; `16-04-SUMMARY.md` records that
the three surfaced candidates genuinely differ (oracle kind, backbone-fit stretch, collaborative-mode
isolation pattern) and were not merged, split, or padded to reach that count.

## Decision-matrix aggregate, reproduced in full

**No adversarial review pass over this matrix's mechanics.** The criteria, cell semantics, weights, and
aggregation rule below have no precedent in this repository — the nearest analog (`SHORTLIST.md`) is an
unscored binary gate — and were authored in a single pass by the same process that wrote the dossiers they
score. Cross-AI review flagged that as the phase's one unreviewed mechanism and suggested an adversarial
pass over it; that pass could not be run because three of the four review lanes are environmentally dead,
and `16-04` records the rejection and its reason rather than pretending the review happened. The mitigation
actually applied: every cell below carries a one-line justification naming the specific dossier content it
came from. The arithmetic has been recomputed (`node _check-artifacts.mjs matrix`) and closes for all three
rows. **The matrix orders and informs; it does not decide.** A selection that departs from the ordering
below is legitimate and is recorded with its reason in the `## Decision` section.

### Criteria and weights

| Criterion | Weight | Meaning |
|---|---|---|
| Oracle strength | 3 | How directly the already-existing oracle measures the candidate's downstream deliverable. |
| Backbone fit | 2 | How much of the kept machinery (`runAgentBattery`, `OracleReceipt`, `component-tournament.ts`, `bridge.ts`) is reused unchanged versus needing new infrastructure. |
| Effort | 1 | How much new infrastructure the candidate needs to stand up; lower cost earns a higher cell. |
| Risk | 2 | How well-bounded the candidate's new failure modes are by existing or directly adaptable isolation discipline; lower risk earns a higher cell. |
| Evidence depth | 1 | How much validated (confirmed and kept) survey evidence the candidate rests on. |

Oracle strength carries the highest weight because it is the entire point of this phase's gate: a candidate
whose oracle only weakly measures its own deliverable is a candidate whose fitness signal is suspect
regardless of backbone fit. Backbone fit and Risk are weighted next because both speak directly to whether
the candidate can be built without touching the kept machinery or opening a new, unbounded failure class.
Effort and Evidence depth are weighted lowest — real considerations, but neither bears on whether the
resulting fitness signal is honest.

Every cell is an integer 0-3, never a fraction or a range. Cell bands (condensed; full semantics tables live
in `DECISION-MATRIX.md`): **Oracle strength** 0=proxy quantity, 1=checked only via a translation layer this
project must author, 2=checked directly but the mechanism isn't standing up here yet (confirmed usable
elsewhere), 3=checked directly by a scoring mechanism already runnable as-is. **Backbone fit** 0=no reuse,
1=only the outer battery shape reused, 2=scoring pattern has a direct precedent and the selection loop is
reused unchanged but the working-medium artifact is net-new, 3=every seam reused with no adaptation.
**Effort** 0=new infrastructure at multiple layers with no existing pattern, 1=two-plus new layers with at
least one having no pattern to build on, 2=one new layer on an already-proven pattern, 3=only wiring existing
pieces together. **Risk** 0=unmitigated new failure class, 1=new failure class only partially bounded,
2=new but well-scoped failure mode fully bounded by an adaptable isolation pattern, 3=no shared-mutation
window at all between roles. **Evidence depth** 0=zero eligible entries, 1=exactly one, 2=two to three,
3=four or more.

**Aggregation rule:** Row total = the weighted sum of a candidate's five cells, each cell multiplied by its
criterion's declared weight, summed across all five criteria. Fully recomputable from the cell table and the
weights above — no other input. **Tie rule:** a tie in row totals is not broken by this matrix; a tie is
carried to the human as a tie, with no default ordering implied by cell order or candidate id. (No tie
occurred in this scoring — see below.)

### Scores

**C-01 — Knowledge-graph-mediated retrieval QA scored against STaRK — row total 23 (ranked first)**

| Criterion | Cell | Justification |
|---|---|---|
| Oracle strength | 3 | STaRK ships a documented, runnable `eval.py` scoring the predicted node id directly — no new infrastructure needed to interpret it. |
| Backbone fit | 2 | Scoring reuses `execution-oracle.ts`'s "shell out to an external checker" shape and the selection loop unchanged; only the subgraph artifact and its build/read split are net-new. |
| Effort | 2 | The subgraph-builder is "one clearly-scoped new layer" on an already-proven pattern — one new layer, not several. |
| Risk | 3 | The graph-builder's subgraph is immutable once handed off; no shared-mutation window within a scored attempt. |
| Evidence depth | 2 | Evidence field cites three entries (E-01, E-02, E-05) — within the 2-3 band. |

**C-02 — Text-to-Cypher / graph-query generation scored by live execution-match — row total 14 (ranked
third)**

| Criterion | Cell | Justification |
|---|---|---|
| Oracle strength | 2 | Execution against a real engine checks the deliverable directly, but E-15's own card documents no scoring method — the execution-match comparison is this project's own construction on top of an existing engine and dataset. |
| Backbone fit | 1 | Nothing in this repository today executes queries against a stateful, long-running external service across a task's lifetime — a materially bigger stretch than C-01's reuse; only the outer battery shape and selection loop are cleanly reused. |
| Effort | 1 | Two new infrastructure layers named (process lifecycle/reseeding for a stateful DB, plus a new execution-match diff scorer), not one. |
| Risk | 1 | The existing sandbox discipline (built around source-file execution) does not fully cover a live-database execution surface; throwaway-copy isolation only partially bounds it. |
| Evidence depth | 3 | Evidence field cites five entries (E-15, E-09, E-03, E-12, E-13) — at or above the 4-entry band. |

**C-03 — Code-property-graph-mediated known-defect hunt — row total 20 (ranked second)**

| Criterion | Cell | Justification |
|---|---|---|
| Oracle strength | 2 | The construction mechanism already runs in production for three verticals, but the code-property-graph working medium this candidate needs is not yet standing up in this repository — the mechanism exists and is usable, the specific instance doesn't. |
| Backbone fit | 2 | Scoring is a "direct, same-shape extension" of the already-running fixture-warehouse/customer-support-warehouse construction pattern, selection loop reused unchanged; the code-property-graph builder itself is net-new. |
| Effort | 2 | The CPG builder is "one new layer... on an already-proven pattern, not several." |
| Risk | 3 | The injection log is sealed strictly before the hunter agent's access window opens — no shared-write window exists at all between construction and hunting, a stronger guarantee than either other candidate's isolation pattern. |
| Evidence depth | 2 | Evidence field cites two entries (E-08, E-11) — within the 2-3 band. |

**Ordering:** C-01 (23) first, C-03 (20) second — margin 3 — C-02 (14) third — margin 6 below C-03. No tie.

**What the matrix deliberately does not encode** (per `DECISION-MATRIX.md`'s own Decision authority line):
the operator's own appetite for a direction — a lower-scoring candidate the operator finds more interesting
or strategically timely is a legitimate selection reason this matrix has no column for — and anything the
evidence base could not reach, most concretely whether a fourth or fifth candidate would have scored
differently had the E-06/E-14 evidence-eligibility bar not removed the SWE-bench-scored direction from
contention (see Screened out, below).

## Candidate blocks

### C-01 — Knowledge-graph-mediated retrieval QA scored against STaRK's constructed gold node ids

- **Oracle mechanism and kind:** `constructed`. STaRK's authors built three knowledge bases (Amazon product
  graph, MAG academic-paper graph, PrimeKG biomedical graph) and their gold target node ids by a mechanism
  independent of any agent under test; the correct answer is known by construction. What plays the oracle:
  STaRK's own public `eval.py` (`--dataset {amazon,mag,prime}`), scoring candidate `node_id -> torch.Tensor`
  embeddings against the gold node id, reportable to STaRK's own public Hugging Face leaderboard. Harvested
  from `E-05` (STaRK), confirmed and kept in `VALIDATION.md` (`V-06`).
- **Backbone seams reused unchanged:** `runAgentBattery`, `OracleReceipt`/`EXOGENOUS_ROOT_KINDS`
  (`kind: "constructed"`), the "shell out to an external checker" pattern already operating in
  `execution-oracle.ts`, and `runComponentTournament`/`promoteComponentWinner`/`src/bridge.ts` as the
  selection loop. Net new: the subgraph-construction/subgraph-handoff artifact and its build/read split.
- **Collaborative-mode sketch:** Two agents. A graph-builder agent reads the corpus for one STaRK query and
  writes a retrieved subgraph to a per-task artifact slot; an answer-agent reads only that subgraph — never
  the raw corpus — and writes the predicted node id. The graph-builder's subgraph is immutable once handed
  off for a given scored attempt; there is no shared-mutation window within a scored attempt.
- **Effort and risk:** Effort moderate — the scoring layer is close to free (an existing public script), the
  subgraph-builder is one clearly-scoped new layer. Risk low — the immutable-handoff isolation leaves no
  shared-mutation window.

### C-02 — Text-to-Cypher / graph-query generation scored by live execution-match

- **Oracle mechanism and kind:** `execution`. An agent generates a Cypher query; it is executed against a
  real, already-existing graph-database engine (FalkorDB, `E-12`, or Apache AGE, `E-13`, both confirmed live
  repositories) and its result set is diffed against the result the dataset's own gold query produces. The
  ground truth is `E-15`'s Neo4j-Text2Cypher dataset (44,387 `question`/`schema`/`cypher` instances, 4,833
  held-out test split). `E-15`'s own dataset card documents no scoring method — the execution-match
  comparison logic itself is this project's own construction on top of an already-existing engine and
  dataset, not an off-the-shelf script.
- **Backbone seams reused unchanged:** `runAgentBattery`, `OracleReceipt`/`EXOGENOUS_ROOT_KINDS`
  (`kind: "execution"`), and `runComponentTournament`/`promoteComponentWinner`/`src/bridge.ts` as the
  selection loop. Nothing in this repository today stands up and executes queries against a stateful,
  long-running external database process across a task's whole lifetime — a materially bigger stretch from
  `execution-oracle.ts`'s self-contained-command shape than C-01's or C-03's reuse; only the outer battery
  shape and selection loop are cleanly reused, the scoring internals are new.
- **Collaborative-mode sketch:** Two agents. A schema-agent inspects the live database schema and writes a
  schema summary artifact; a query-agent reads only that summary — never the live schema directly — and
  writes the generated Cypher. The query-agent's execution is confined to a throwaway, freshly seeded copy of
  the database per scored attempt, never the schema-agent's own session or a shared long-lived instance.
- **Effort and risk:** Effort highest of the three — two new infrastructure layers (process lifecycle/
  reseeding for a stateful DB, plus a new execution-match diff scorer). Risk highest of the three — executing
  LLM-generated, potentially destructive queries against a running database process is a new execution-safety
  surface the existing sandbox discipline (built around source-file execution) does not fully cover; the
  throwaway-copy isolation only partially bounds it.

### C-03 — Code-property-graph-mediated known-defect hunt scored by this project's own answer-first construction

- **Oracle mechanism and kind:** `constructed`, under the answer-first "known-injection hunt" pattern this
  project's data-ops/bi-analytics/customer-support batteries already run twice-proven. A known defect is
  injected into clean source; the injection log is the answer key, built independently of any agent under
  test. Per this project's own code-and-engineering doctrine, no external benchmark is needed to clear the
  oracle gate — this project's own construction machinery is the harvested oracle, already running in
  production for three other verticals today.
- **Backbone seams reused unchanged:** `runAgentBattery`, `OracleReceipt`/`EXOGENOUS_ROOT_KINDS`
  (`kind: "constructed"`), `runComponentTournament`/`promoteComponentWinner`/`src/bridge.ts`. The scoring
  pattern is the closest reuse of the three surfaced candidates — a direct, same-shape extension of the
  "build the answer first, derive the task, compare the candidate's output to the precomputed answer" pattern
  already running in `fixture-warehouse.ts`/`fixture-warehouse-v3.ts`, `bi-warehouse.ts`, and
  `customer-support-warehouse.ts`/`customer-support-oracle.ts`. Net new: the code-property-graph
  construction/query layer itself — nothing in this repository parses source into a queryable property graph
  today.
- **Collaborative-mode sketch:** The injector (this project's own construction step, run before any agent
  battery starts) writes the known defect and the injection log into a clean codebase; this step is sealed
  and complete before any agent ever sees the codebase. A graph-hunter agent then builds a code property graph
  over the resulting codebase and writes only its located-defect report — it never reads or writes the
  injection log. The injection log is generated and sealed strictly before the hunter agent's access window
  opens; there is no shared-write window at all between construction and hunting, the strongest isolation
  guarantee of the three surfaced candidates.
- **Effort and risk:** Effort moderate — the construction/scoring layer is close to free (a direct extension
  of already-running machinery), the code-property-graph builder is one clearly new layer. Risk low — the
  sealed-before-access ordering leaves no shared-mutation window between construction and hunting at all.

## Screened out

Six longlist directions did not clear to a surfaced candidate. Each is recorded here with what would have
had to play the oracle and why it does not clear.

1. **Code-graph-encoder-bridged repo bug-fix scored by SWE-bench (CGBridge, `E-06`, bridged into a frozen
   LLM, scored by SWE-bench's Docker execution harness, `E-14`).** Missing oracle: none by mechanism — this
   is the sharpest instance in this sweep of the oracle-existing/evidence-eligible distinction. SWE-bench's
   Docker harness is a real, working, already-usable `execution` oracle, and this project's own
   sealed-suite/replay machinery would slot into exactly this shape. It is screened out because its only two
   supporting survey entries, `E-06` and `E-14`, both carry disposition `reworked` rather than `kept` in
   `VALIDATION.md` (`V-07`, `V-15`) — this document's own stricter evidence-eligibility bar (confirmed AND
   kept) fails both citations, so no `Evidence:` field in `CANDIDATE-DOSSIERS.md` cites either. Held back
   pending a future independent re-verification pass, not re-argued around here.
2. **Full-pipeline GraphRAG summarization/QA scored by GraphRAG-Bench (`E-16`).** Missing oracle:
   `E-16`'s harvested quote describes the benchmark's task taxonomy and pipeline scope but documents no
   runnable scoring script or gold-answer comparison mechanism. Nothing in this sweep independently confirmed
   a usable oracle exists today for this benchmark's own scoring.
3. **Knowledge-graph hygiene/consistency-invariant enforcement harness.** Missing oracle: no distinct
   literature of hygiene checks purpose-built for an LLM-agent-mediated shared graph surfaced beyond
   database-level constraints (`E-09`) — none was harvested or confirmed usable. Independently disqualifying
   even if one existed: the natural scored quantity (did the graph stay hygienic) is a property of the
   graph's own state, not a downstream deliverable.
4. **Graph Change-Data-Capture replication-correctness harness.** Missing oracle: no survey entry documents
   an existing, usable oracle for "did this replica correctly mirror the source graph" — Neo4j's CDC
   (`E-10`) is infrastructure for replaying mutations, not a benchmark with a gold answer. Independently
   disqualifying: replica fidelity is again a property of the graph's own state, not a downstream deliverable.
5. **TGMS-style temporal-graph agent-tool-contract question answering.** Missing oracle: `E-07` is a single
   academic (SC-A) entry describing a trace-verification mechanism, with no accompanying open-source (SC-C)
   entry confirming it is downloadable, runnable software today — unlike Joern (`E-11`), FalkorDB (`E-12`),
   or Apache AGE (`E-13`), all independently confirmed live repositories.
6. **Open-source graph-tooling adoption-strength predictor.** Missing oracle: the deliverable domain
   (adoption-signal analysis and research synthesis) is excluded outright regardless of any oracle question;
   independently, no survey entry documents a scored, gold-answer oracle for "adoption strength" — star/fork
   counts are descriptive facts, not a benchmark with a correct answer to predict against.

## Evidence base after validation

`VALIDATION.md` independently re-fetched and re-checked all 16 survey entries. **Verdicts:** confirmed=15,
refuted=1, unverifiable=0. **Dispositions:** kept=14, reworked=2, dropped=0. The 14 confirmed-and-kept
entries are the only ones any dossier's `Evidence:` field may cite; `_check-artifacts.mjs dossiers` enforces
this mechanically.

**Notable nulls — the two reworked entries, neither dropped:**

- **`E-06` (CGBridge) — verdict `refuted`, disposition `reworked` (`V-07`).** The paper's identity,
  publication date, and substantive relevance were independently confirmed by the re-fetch; only the
  `Quote` field was at fault — the recorded quote dropped a leading clause and recapitalized the next word,
  producing a grammatically complete sentence that was not a literal substring of the source (an edited
  excerpt presented as verbatim). The correction replaces the `Quote` field with a literal substring of the
  fetched abstract; the entry's substantive content stands.
- **`E-14` (SWE-bench) — verdict `confirmed`, disposition `reworked` (`V-15`).** A prior correction to the
  `Bar applied` field (made during dossier-writing, before this validation pass) was independently
  re-derived rather than trusted on re-fetch: `FAIL_TO_PASS`/`PASS_TO_PASS` terminology was confirmed
  genuinely absent from the current README, and the corrected `swebench eval verified --gold` /
  `swebench report` commands were confirmed to appear verbatim.

Both reworked entries are individually accurate after correction, but neither clears this document's own
stricter confirmed-AND-kept evidence bar — which is exactly why the SWE-bench-scored direction (screened-out
item 1, above) could not be surfaced as a candidate despite its oracle being real and already usable.

## Graph-integrity finding

The graph-integrity question — whether this harness's own shared graph adopts typed contracts, hygiene
invariants, or replayable-mutation discipline — is a genuine differentiator across the surfaced set, though
the decision matrix does not score it as a sixth criterion (considered and rejected as redundant with
Backbone fit and Risk, which already capture the isolation-pattern differences a graph-integrity column
would duplicate). `C-02` is the only surfaced candidate with direct field precedent for its isolation
pattern: `E-09`'s Neo4j Cypher constraints are the named precedent for its schema-agent boundary. `C-01` and
`C-03` both operate without direct field precedent on their specific isolation choices
(handoff-immutability and sealed-before-access ordering, respectively) — each dossier's own
Collaborative-mode sketch says so explicitly rather than citing a survey entry that doesn't actually cover
the point. Whether the selected direction takes contract discipline on the shared graph, and on what basis,
is recorded as part of the `## Decision` below, since it is a selection-time question, not a scored one.

## Decision

*Filled after the gate resolves — nothing below is decided yet.*

- **Selected:**
- **Decided by:**
- **Decided on:**
- **Basis:**
- **Matrix aggregate and rank at decision time:**
- **Departure from matrix ordering, if any, and reason:**
- **What this decision authorises:**
- **What this decision does not authorise:**
- **Graph-integrity call and basis:**
- **Open questions carried forward:**
- **Governing text:**
