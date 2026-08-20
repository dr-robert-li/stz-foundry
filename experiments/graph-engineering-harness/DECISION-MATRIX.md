# Decision matrix — graph engineering harness candidates (REQ-75)

**Phase:** 16-graph-engineering-harness-unconditional-pivot · **Author:** Robert Li

This document has no precedent in this repository. The nearest existing analog,
`experiments/method-research/SHORTLIST.md` (lines 15-35), is a binary pass-or-fail gate on two frozen
criteria with no numeric or ordinal cell anywhere — a method either meets both criteria or it doesn't, and
nothing is scored. `SURVEY.md`'s own coverage tables are unscored counts against a floor. Neither is close
enough to a scored matrix to serve as a template; this document authors its own mechanics explicitly, in the
order they had to exist — criteria and cell semantics declared before any candidate is scored, so the scoring
cannot be reverse-engineered from a preferred answer.

**No adversarial review pass over this document's mechanics.** `16-04-PLAN.md`'s "Review disposition" section
records why: the mitigation on offer (a single-lane adversarial pass) does not currently exist — three of
four review lanes attempted for this phase failed environmentally, and the fourth is the lane that raised the
point. This document is authored, and its cells justified, in a single pass by the same agent that wrote
`CANDIDATE-DOSSIERS.md`. That is the exact setting where scores get rationalised backwards from a preferred
answer, and the row-total recomputation the mechanical check runs does not touch that risk — an arithmetically
perfect matrix built on inflated cells still reconciles. The mitigation actually applied: every cell below
carries a one-line justification naming the specific dossier content it came from, so a challenged score can
be checked against its stated basis rather than argued about in the abstract, and the person deciding
(16-05's checkpoint) is told this document is single-pass-authored and unreviewed rather than being handed a
table that looks computed.

## Criteria

Five criteria, declared with their weights before any candidate is scored.

- **Criterion:** Oracle strength
  - **Weight:** 3
  - **Meaning:** how directly the already-existing oracle measures the candidate's downstream deliverable.
- **Criterion:** Backbone fit
  - **Weight:** 2
  - **Meaning:** how much of the kept machinery (`runAgentBattery`, `OracleReceipt`, `component-tournament.ts`,
    `bridge.ts`) is reused unchanged versus needing new infrastructure.
- **Criterion:** Effort
  - **Weight:** 1
  - **Meaning:** how much new infrastructure the candidate needs to stand up; scored so a lower cost earns a
    higher cell.
- **Criterion:** Risk
  - **Weight:** 2
  - **Meaning:** how well-bounded the candidate's new failure modes are by existing or directly adaptable
    isolation discipline; scored so lower risk earns a higher cell.
- **Criterion:** Evidence depth
  - **Weight:** 1
  - **Meaning:** how much validated (`confirmed` and `kept`) survey evidence the candidate rests on.

No sixth criterion was added. The three surfaced candidates already differ cleanly across all five of the
above (see Scores below); a sixth criterion was considered for "graph-integrity precedent" specifically but
rejected as redundant with Backbone fit and Risk, which already capture the isolation-pattern differences a
graph-integrity criterion would otherwise duplicate — see "Graph integrity differentiator" below for that
question handled as prose instead of a scored column, per this document's own decision-authority line.

Oracle strength is weighted highest (3) because it is the entire point of this phase's gate: a candidate
whose oracle only weakly measures its own deliverable is a candidate whose fitness signal is suspect
regardless of how well it fits the backbone. Backbone fit and Risk are weighted next (2 each) because both
speak directly to whether the candidate can be built without touching the kept machinery or opening a new,
unbounded failure class. Effort and Evidence depth are weighted lowest (1 each) — real considerations, but
neither bears on whether the resulting fitness signal is honest, only on how expensive and how well-attested
the candidate is.

## Cell semantics

Every cell is an integer from 0 to 3. Never a fraction, never a range.

### Oracle strength

| Cell | Meaning |
|---|---|
| 0 | The oracle checks something other than the deliverable — a proxy quantity. |
| 1 | The oracle checks the deliverable only through a translation layer this project must author and trust. |
| 2 | The oracle checks the deliverable directly, but the mechanism that runs the check is not yet standing up in this repository (though it is confirmed to exist and be usable elsewhere). |
| 3 | The oracle checks the deliverable directly using a scoring mechanism that is itself already documented as runnable-as-is (an existing script or execution harness needing no new infrastructure to interpret). |

### Backbone fit

| Cell | Meaning |
|---|---|
| 0 | No kept machinery reused; a new selection loop would be needed. |
| 1 | Only the outer battery-task shape (`runAgentBattery`) is reused unchanged; the scoring internals are new, with no direct precedent in this repository's existing scoring seams. |
| 2 | The scoring pattern has a direct precedent in an existing seam, and the selection loop (`component-tournament.ts`, `bridge.ts`) is reused unchanged, but the working-medium artifact itself (the shared graph) and its construction are net-new. |
| 3 | Every seam the candidate touches, including the scoring pattern, is already directly reusable with no adaptation. |

### Effort

| Cell | Meaning |
|---|---|
| 0 | New infrastructure is needed at multiple layers (a new execution target, a new artifact type, and a new scoring harness, none reusing an existing pattern). |
| 1 | Two or more new infrastructure layers beyond what's reused, at least one with no existing pattern to build on. |
| 2 | One clearly new infrastructure layer, built on an already-proven pattern elsewhere in this repository. |
| 3 | Only wiring already-existing pieces together; no new infrastructure layer at all. |

### Risk

| Cell | Meaning |
|---|---|
| 0 | Introduces an unmitigated new failure class with no existing project discipline to bound it. |
| 1 | Introduces a new failure class only partially bounded by existing or adapted discipline. |
| 2 | Introduces a new but well-scoped failure mode, fully bounded by an existing or directly adaptable isolation pattern. |
| 3 | The collaborative-mode's write/read split leaves no shared-mutation window at all between roles. |

### Evidence depth

| Cell | Meaning |
|---|---|
| 0 | Zero eligible (confirmed and kept) survey entries support the candidate. |
| 1 | Exactly one eligible survey entry supports the candidate. |
| 2 | Two to three eligible survey entries support the candidate. |
| 3 | Four or more eligible survey entries support the candidate. |

## Aggregation rule

- **Aggregation rule:** Row total = the weighted sum of a candidate's five cells, each cell multiplied by its
  criterion's declared weight (Oracle strength ×3, Backbone fit ×2, Effort ×1, Risk ×2, Evidence depth ×1),
  summed across all five criteria. Fully recomputable by a reader from the cell table and the weights above —
  no other input.

**Tie rule:** a tie in the row totals is not broken by this matrix. A tie is carried to the human as a tie,
stated as such, with no default ordering implied by cell order or candidate id.

## Scores

Scored in the order the candidates were surfaced. `C-01` scored first and its arithmetic checked before the
remaining two were scored, per this document's own discipline against reverse-engineering a preferred total.

### C-01 — Knowledge-graph-mediated retrieval QA scored against STaRK

- **Oracle strength:** 3
  - Justification: STaRK ships a documented, runnable `eval.py` that scores the deliverable (the predicted
    node id) directly, off the fetched README per the dossier's Exogenous-oracle analysis — no new
    infrastructure needed to interpret it.
- **Backbone fit:** 2
  - Justification: the dossier's Backbone-fit map states the scoring pattern reuses `execution-oracle.ts`'s
    "shell out to an external checker" shape and the selection loop is reused unchanged; only the subgraph
    artifact and its build/read split are net-new.
- **Effort:** 2
  - Justification: the Effort-and-risk section calls the subgraph-builder "one clearly-scoped new layer"
    on an already-proven "shell out to an external checker" pattern — one new layer, not several.
- **Risk:** 3
  - Justification: the Collaborative-mode sketch states the graph-builder's subgraph is immutable once
    handed off, with no shared-mutation window within a scored attempt.
- **Evidence depth:** 2
  - Justification: the Evidence field cites three entries (`E-01`, `E-02`, `E-05`) — within the 2-3 band.
- **Row total:** 23

### C-02 — Text-to-Cypher / graph-query generation scored by live execution-match

- **Oracle strength:** 2
  - Justification: the Exogenous-oracle analysis states execution against a real engine checks the
    deliverable directly, but `E-15`'s own card documents no scoring method — the execution-match comparison
    is this project's own construction on top of an existing engine and dataset, not an off-the-shelf script.
- **Backbone fit:** 1
  - Justification: the Backbone-fit map states nothing in this repository today executes queries against a
    stateful, long-running external service across a task's lifetime — a materially bigger stretch from
    `execution-oracle.ts`'s self-contained-command shape than `C-01`'s reuse, so only the outer battery shape
    and selection loop are cleanly reused; the scoring internals are new.
- **Effort:** 1
  - Justification: the Effort-and-risk section names two new infrastructure layers (process lifecycle/
    reseeding for a stateful DB, plus a new execution-match diff scorer), not one.
- **Risk:** 1
  - Justification: the Effort-and-risk section states the existing sandbox discipline (built around
    source-file execution) does not fully cover a live-database execution surface; the throwaway-copy
    isolation only partially bounds it.
- **Evidence depth:** 3
  - Justification: the Evidence field cites five entries (`E-15`, `E-09`, `E-03`, `E-12`, `E-13`) — at or
    above the 4-entry band.
- **Row total:** 14

### C-03 — Code-property-graph-mediated known-defect hunt

- **Oracle strength:** 2
  - Justification: the Exogenous-oracle analysis states the construction mechanism itself already runs in
    production for three verticals, but the code-property-graph working medium this candidate needs is not
    yet standing up in this repository — the mechanism exists and is usable, the specific instance doesn't.
- **Backbone fit:** 2
  - Justification: the Backbone-fit map calls the scoring pattern a "direct, same-shape extension" of the
    already-running fixture-warehouse/customer-support-warehouse construction pattern, with the selection
    loop reused unchanged; the code-property-graph builder itself is net-new.
- **Effort:** 2
  - Justification: the Effort-and-risk section calls the CPG builder "one new layer... on an already-proven
    pattern, not several."
- **Risk:** 3
  - Justification: the Collaborative-mode sketch states the injection log is sealed strictly before the
    hunter agent's access window opens — no shared-write window exists between construction and hunting at
    all, a stronger guarantee than either other candidate's isolation pattern.
- **Evidence depth:** 2
  - Justification: the Evidence field cites two entries (`E-08`, `E-11`) — within the 2-3 band.
- **Row total:** 20

## Decision authority

- **Decision authority:** This matrix's aggregate orders and informs; it does not decide. The human at
  16-05's checkpoint selects, and the selection may depart from the ordering above with a stated reason.
  What this matrix deliberately does not encode: the operator's own appetite for a direction (a lower-scoring
  candidate the operator finds more interesting or strategically timely is a legitimate selection reason this
  matrix has no column for), and anything the evidence base could not reach — most concretely, whether a
  fourth or fifth candidate would have scored differently had the E-06/E-14 evidence-eligibility bar not
  removed the SWE-bench-scored direction from contention (see `CANDIDATE-DOSSIERS.md`'s "Screened out"
  section, longlist item 4). Neither of those questions has a numeric answer, and this matrix does not
  pretend to compute one.

## Graph integrity differentiator

The graph-integrity question — whether this harness's own shared graph adopts typed contracts, hygiene
invariants, or replayable-mutation discipline (D-04) — is a genuine differentiator across the surfaced set,
though not one this matrix scores directly (see "No sixth criterion was added" above). `C-02` is the only
surfaced candidate with direct field precedent for its isolation pattern: `E-09`'s Cypher constraints are the
named precedent for its schema-agent boundary. `C-01` and `C-03` both operate without direct field precedent
on their specific isolation choices (handoff-immutability and sealed-before-access ordering, respectively) —
each dossier's Collaborative-mode sketch says so explicitly rather than citing a survey entry that doesn't
actually cover the point. This is recorded here, at the last point before the checkpoint, because it is a
selection-time question under D-04's own framing, not one this matrix's numeric criteria were built to answer.
