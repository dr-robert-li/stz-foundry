# Candidate dossiers — graph engineering harness (REQ-75)

**Phase:** 16-graph-engineering-harness-unconditional-pivot · **Author:** Robert Li

This document applies the oracle gate to the longlist the validated survey (`SURVEY.md`, `VALIDATION.md`)
supports, then writes a full dossier for every candidate that clears it. The gate: a candidate is surfaced
only if it names an exogenous oracle that already exists and is already usable today — execution,
constructed, or replay (`src/foundry/battery-types.ts` `EXOGENOUS_ROOT_KINDS`, lines 132-136). The judged
kind (`anchored-judge`) is excluded from that set by design and cannot carry a candidate.

**A second, stricter bar sits on top of the oracle gate and narrows the field further.** `16-03-SUMMARY.md`
flagged, precisely, that this document's own evidence-eligibility check (`_check-artifacts.mjs dossiers`)
requires a cited survey entry's ledger verdict to be `confirmed` **and** its disposition to be `kept` — both
conditions. Two entries fail that stricter bar despite being individually accurate: `E-06` (CGBridge, verdict
`confirmed`, disposition `reworked` per `V-07`, originally `refuted`) and `E-14` (SWE-bench, verdict
`confirmed`, disposition `reworked` per `V-15`). Neither is dropped, refuted-and-uncorrected, or
unverifiable — this document's own prohibition against citing a "dropped, refuted or left unverifiable" entry
does not, read literally, bar them. But the mechanical check does, and this document honors the mechanical
check rather than arguing around it: **no `Evidence:` field below cites `E-06` or `E-14`.** Where SWE-bench
or CGBridge would otherwise have been the strongest oracle for a direction, that direction is recorded in
`## Screened out` with the distinction stated plainly — its oracle mechanism is real and would clear the
oracle gate on its own terms, but its sole supporting survey citation cannot clear the dossier's stricter
evidence bar until a future pass independently re-verifies the correction and re-dispositions the ledger
entry to `kept`.

## Longlist

Every harness direction the 16 validated survey entries plausibly support, before any gate is applied:

1. **Knowledge-graph-mediated retrieval QA scored against STaRK's constructed gold node ids** — an
   entity/relation subgraph is the working medium; the deliverable is a retrieval answer scored by STaRK's
   own `eval.py`. (`E-01`, `E-02`, `E-05`)
2. **Text-to-Cypher / graph-query generation scored by live execution-match against a schema-constrained
   graph database** — a generated Cypher query is executed against a real graph-database engine and its
   result set is diffed against the gold query's result. (`E-15`, `E-09`, `E-03`, `E-12`, `E-13`)
3. **Code-property-graph-mediated known-defect hunt, scored by this project's own answer-first
   known-injection construction** — a code property graph is the working medium agents query to locate a
   defect this project itself injected; the injection log is the ground truth. (`E-08`, `E-11`)
4. **Code-graph-encoder-bridged repository bug-fix agent scored by SWE-bench's Docker execution harness** —
   a pretrained code-graph encoder bridges structural semantics into an LLM that generates a patch, scored
   by SWE-bench's real test-execution harness. (`E-06`, `E-14`)
5. **Full-pipeline GraphRAG summarization/QA scored by GraphRAG-Bench** — the entire GraphRAG pipeline, from
   graph construction to final generation, scored end to end. (`E-16`)
6. **Knowledge-graph hygiene/consistency-invariant enforcement harness** — agents jointly maintain a shared
   graph under checked hygiene invariants (existence, uniqueness, type constraints). (`E-09`, graph integrity
   practice section)
7. **Graph Change-Data-Capture replication-correctness harness** — an agent-mediated graph's mutations are
   streamed via CDC and a downstream replica's fidelity is the scored deliverable. (`E-10`)
8. **TGMS-style temporal-graph agent-tool-contract question answering** — agents plan over thirteen typed,
   deterministic temporal-graph operators, checked against a content-addressed execution trace. (`E-07`)
9. **Open-source graph-tooling adoption-strength predictor** — a model predicts or explains adoption signals
   (stars, forks, release cadence) for graph-engineering repositories. (`E-04`, `E-11`, `E-12`, `E-13`)

## Screened out

Every longlist direction that did not clear to a surfaced candidate, with what would have had to play the
oracle and why that does not clear the bar this document enforces.

### Longlist 4 — code-graph-encoder-bridged repo bug-fix scored by SWE-bench

**What it was:** A pretrained code-graph encoder (CGBridge, `E-06`) bridges structural semantics from a
repository's code graph into a frozen LLM via an external module; the LLM generates a patch for a real
GitHub issue, scored by SWE-bench's (`E-14`) reproducible Docker test-execution harness against
`FAIL_TO_PASS`/reference-patch criteria.

**Why it is screened out:** Not for want of an oracle — SWE-bench's Docker harness is a real, working,
already-usable `execution` oracle, and this project's own sealed-suite/replay machinery would slot into
exactly this shape per D-12. It is screened out because its only two supporting survey entries, `E-06` and
`E-14`, both carry disposition `reworked` rather than `kept` in `VALIDATION.md` (`V-07`, `V-15`) —
`16-03-SUMMARY.md`'s own flagged evidence-eligibility note. Citing either in an `Evidence:` field fails
`_check-artifacts.mjs dossiers`. This is the sharpest instance in this sweep of the oracle-existing/
evidence-eligible distinction: the oracle is real, the citation trail is not currently admissible. Held back
pending a future independent re-verification pass, not re-argued around here.

### Longlist 5 — full-pipeline GraphRAG summarization/QA scored by GraphRAG-Bench

**What would have played the oracle:** GraphRAG-Bench's (`E-16`) own scoring rubric across its
difficulty-graded tasks (fact retrieval, complex reasoning, contextual summarization, creative generation).

**Why it does not clear:** `E-16`'s harvested quote and Bar applied describe the benchmark's task taxonomy
and pipeline scope but do not document a runnable scoring script or a gold-answer comparison mechanism the
way `E-05`'s Bar applied does for STaRK (`eval.py`, `node_id -> torch.Tensor` embeddings, a named leaderboard).
Nothing in this sweep independently confirmed that a usable oracle exists today for this benchmark's own
scoring; asserting one would exceed what the harvested evidence supports. Surfacing this candidate would
require either a fresh, deeper harvest of GraphRAG-Bench's own evaluation code, or building a scoring
mechanism ourselves — the latter is exactly the disqualification this gate exists to catch.

### Longlist 6 — knowledge-graph hygiene/consistency-invariant enforcement harness

**What would have played the oracle:** A checked hygiene invariant (existence, uniqueness, type) applied
continuously to a shared, agent-mediated graph, analogous to `E-09`'s Cypher constraint layer but purpose-built
for the harness's own collaborative graph rather than a generic database.

**Why it does not clear, on two independent grounds:** First, this sweep's own graph integrity practice
section states plainly that "a distinct literature of hygiene checks purpose-built for an LLM-agent-mediated
shared graph did not surface" beyond database-level constraints (`E-09`) — no such oracle was harvested, and
none is confirmed usable. Second, and independently disqualifying even if an oracle existed: the natural
scored quantity here is a property of the graph's own state (did it stay hygienic), not a downstream
deliverable produced through the graph — the exact violation D-02 bars.

### Longlist 7 — graph Change-Data-Capture replication-correctness harness

**What would have played the oracle:** Neo4j's Change Data Capture stream (`E-10`) — an ordered, queryable
log of graph mutations a downstream replica could be checked against for fidelity.

**Why it does not clear, on the same two grounds as longlist 6:** No survey entry documents an existing,
usable oracle for "did this replica correctly mirror the source graph" as a scored quantity — CDC is
infrastructure for replaying mutations, not a benchmark with a gold answer. And the natural scored quantity
(replica fidelity to the graph) is again a property of the graph's own state, not a downstream deliverable,
independently barred by D-02.

### Longlist 8 — TGMS-style temporal-graph agent-tool-contract question answering

**What would have played the oracle:** TGMS's (`E-07`) own claim that agent answers are "checked against the
content-addressed execution trace" of its thirteen typed, deterministic temporal-graph operators — a
real-sounding `execution` oracle if it exists as usable software.

**Why it does not clear:** `E-07` is a single SC-A (academic) entry — an arXiv paper describing a system, with
no accompanying SC-C (open-source repository) entry in this sweep confirming the described trace-verification
mechanism is downloadable, runnable software today. Unlike Joern (`E-11`), FalkorDB (`E-12`) or Apache AGE
(`E-13`), which are all independently confirmed live repositories, nothing in this sweep independently
confirms TGMS is usable rather than merely described. Surfacing it would assert usability the harvested
evidence does not establish.

### Longlist 9 — open-source graph-tooling adoption-strength predictor

**What would have played the oracle:** GitHub star/fork/release-cadence signals (`E-04`, `E-11`, `E-12`,
`E-13`) treated as a graded target a model predicts or explains.

**Why it does not clear, on two independent grounds:** This candidate's deliverable domain is analysis and
research synthesis of adoption signals, not code and engineering work or question answering and retrieval —
excluded by D-03 outright, regardless of any oracle question. Independently, no survey entry documents a
scored, gold-answer oracle for "adoption strength" as a predicted quantity; the star/fork counts are
descriptive facts about the surveyed repositories, not a benchmark with a correct answer to predict against.

## C-01 — Knowledge-graph-mediated retrieval QA scored against STaRK's constructed gold node ids

- **Oracle kind:** constructed
- **Oracle status:** harvested-and-existing
- **Deliverable domain:** qa-retrieval
- **Evidence:** E-01, E-02, E-05

Agents jointly build an entity/relation subgraph from a corpus in response to a natural-language query
(the GraphRAG/SubgraphRAG shape `E-01`/`E-02` describe), and a second agent answers from that subgraph. The
scored deliverable is the retrieval answer — specifically the target node id STaRK's own benchmark asks
for — never the subgraph itself. STaRK ships three constructed knowledge bases (an Amazon product graph, a
MAG academic-paper graph, a PrimeKG biomedical graph) with gold target node ids built independently of any
agent, and a public `eval.py` that scores retrieval directly against those ids.

### Exogenous-oracle analysis

The oracle is STaRK's own scoring script (`E-05`'s Bar applied: `eval.py --dataset {amazon,mag,prime}`,
ranking candidate `node_id -> torch.Tensor` embeddings against the gold node id, reportable to STaRK's own
public Hugging Face leaderboard). This is a `constructed` oracle under D-11/`docs/development/harness-factory.md`'s
"construction — answer-first task generation" doctrine: STaRK's authors built the three knowledge bases and
their gold node ids by a mechanism independent of any agent under test, so the correct answer is known by
construction rather than judged after the fact. The oracle already exists and is already usable — it is a
public script over a public dataset, not something this project would build. Because the deliverable is the
predicted node id and the oracle checks exactly that id, this is as direct a working-medium/deliverable split
as this sweep found: the subgraph is what the agents build and read, the retrieval answer is what gets
scored, and the two are never conflated.

### Backbone-fit map

`runAgentBattery` (`src/foundry/agent-runner.ts`) is reused unchanged as the battery driver dispatching one
task per STaRK query. `OracleReceipt`/`EXOGENOUS_ROOT_KINDS` (`src/foundry/battery-types.ts`) are reused
unchanged, with `kind: "constructed"`. The scoring pattern reuses the existing shape in
`src/foundry/execution-oracle.ts` (`runExecutionOracle`) of shelling out to an external process and reading
its verdict — here the external process is STaRK's own `eval.py` rather than a project-authored script, the
same "run and trust an external checker" seam this repository already operates, adapted rather than
reinvented. `runComponentTournament`/`promoteComponentWinner` (`src/foundry/component-tournament.ts`) and the
`src/bridge.ts` selection seam are reused unchanged as the collaborative-mode's search/promotion loop. Net
new: the subgraph-construction/subgraph-handoff artifact and its build/read split — nothing in this
repository today builds or stores an intermediate entity/relation subgraph as a battery-task artifact.

### Collaborative-mode sketch

Two agents. A graph-builder agent reads the corpus for one STaRK query and writes a retrieved subgraph
(entities and relations judged relevant to the query, per the SubgraphRAG shape `E-02` describes) to a
per-task artifact slot. An answer-agent reads only that subgraph — never the raw corpus directly — and
writes the final predicted node id, which STaRK's `eval.py` scores against the gold id. What prevents mutual
corruption: the graph-builder's subgraph is treated as immutable once handed off for a given scored attempt —
the answer-agent cannot request a rebuild mid-task, and the graph-builder never writes to the answer slot the
oracle reads. The survey's graph integrity practice section covers schema-level constraints (`E-09`) and
replayable mutations (`E-10`), neither of which speaks to this specific handoff-immutability isolation
pattern — this candidate operates without direct field precedent on that point; the isolation described here
is this project's own design choice, not a harvested practice.

### Effort and risk estimate

`src/foundry/vertical-admission.ts`'s `VERTICAL_ADMISSION` table names five rows (data-ops, bi-analytics,
performance-marketing, customer-support, revops-gtm-exec-strategy) — all business verticals from the original
harness-factory design. None of them is a code-engineering or qa-retrieval deliverable domain in this
survey's D-03 sense, so this candidate's deliverable domain maps onto **none** of the five existing rows and
would need a wholly new admission axis, not an extension of an existing row. Effort is moderate: the scoring
layer is close to free (an existing public script, no new execution infrastructure), but the subgraph-builder
component is genuinely new — one clearly-scoped new layer built on the "shell out to an external checker"
pattern this project already operates, not several new layers. Risk is low: the immutable-handoff isolation
described above leaves no shared-mutation window within a scored attempt.

### Validated evidence trail

`E-01` (GraphRAG's entity-graph-mediated summarization, establishing the graph-as-working-medium framing),
`E-02` (SubgraphRAG's retrieved-subgraph-for-reasoning shape, the direct precedent for this candidate's
graph-builder/answer-agent split), `E-05` (STaRK, the oracle itself — three constructed knowledge bases, gold
node ids, and a documented, runnable `eval.py`). All three are `confirmed` and `kept` in `VALIDATION.md`
(`V-02`, `V-03`, `V-06`).
