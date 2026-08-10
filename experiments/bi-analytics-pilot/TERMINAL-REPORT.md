# BI analytical-query-answering instrument — TERMINAL REPORT

**Verdict:** FAILURE BRANCH (`bi-corridor-verdict.json`: `complete: true`,
`verdict: "FAILURE BRANCH"`, `failureStage: "pretest"`, `selectedPoint:
null`). REQ-55 closes on this basis. This report is committed per §6's
pre-committed failure branch and §10's one-shot termination — the legitimate
outcome that section exists to name, not a gap in the milestone.

## 1. What failed, and where

**Not a stage-1 clause failure. The termination happened one stage earlier,
at the §5 pretest screen**, before the corridor probe (§6) ever launched.
`PROBE-RESULTS.md` records it: the original four-level grid's L2↔L3 adjacent
pair moved 0.30 (three times the 0.10 pretest granularity ceiling); the one
permitted §5/F-34 subdivision pass inserted `L2B` between them; the
re-screened L2↔L2B pair still moved 0.30, the identical magnitude as the
original violation — the intermediate level did not bridge the cliff at
all. Per F-34, subdivision is capped at exactly one pass per violating pair;
a pair still violating after that pass routes directly to §10, which is
what happened here.

**Which of §11's five falsifiers fired: none of them, precisely stated.**
Falsifiers 1 through 5 are all defined over corridor-probe (§6) data — the
format-stability gate, the stage-1 baseline CI, the stage-1 gradient
clauses, arm inversion, and the executes-but-wrong rate. None of that data
exists on this run: the corridor probe never launched, so there is no
`bi-corridor-state.json` and no `bi-corridor.log`, by design. The
termination mechanism here is a DIFFERENT, separately pre-registered route
to §10 — §5's own F-34 one-pass-subdivision-exhaustion rule, which routes
to §10 directly on its own terms rather than through any of the five §11
falsifiers. Naming this precisely matters: it would be dishonest to force
this outcome into Falsifier 3's language (the 0.15-vs-0.10 gradient-floor
tension) when the actual failure was a raw pretest granularity violation
three times the ceiling, unconnected to the resolvable-gradient floor's
derivation. For the record, each of the five is stated explicitly:

| Falsifier | Disposition |
|---|---|
| 1 — ceiling gate fails at every point | Did not fire — the corridor probe's own format-stability gate never ran. |
| 2 — no grid point places baseline CI inside the corridor | Did not fire — no corridor-probe stage-1 data exists to place. |
| 3 — every adjacent step falls below the 0.15 gradient floor while individually satisfying the ≤0.10 ceiling | Did not fire — this is a stage-1-grid finding; the pretest screen's L2↔L2B violation EXCEEDED the 0.10 ceiling outright (at 0.30, three times over), which is a different failure shape than every step narrowly clearing 0.10 while missing 0.15. |
| 4 — arm inversion persists | Did not fire — the pretest screen runs the baseline arm only; no s0-minimal data exists to compare. |
| 5 — executes-but-wrong exceeds 0.20 at every point | Did not fire — no corridor-probe zero-decomposition data exists. |

## 2. §10's termination, in its own terms

Per `BI-BATTERY-DESIGN.md` §10: the BI analytical-query-answering instrument
line **TERMINATES**, and the prohibition is on **SUBSTANCE, not name** — no
successor instrument testing this hypothesis (prompt-search vs
hand-written-baseline on BI analytical-query answering, as the phase-5
promotion gate for the bi-analytics vertical) may be built under ANY label
by changing parser, prompts, grid, scoring, or qualification rules.
Widening §2's accepted-dialect set (`sql` / bare-fence) after data exists is
itself a prohibited new generation of this line. This bars, specifically:
a re-run of the join/aggregation-depth knob at coarser or finer granularity,
a different filter-subdivision recipe, a relaxed or tightened pretest
ceiling, a different scoring function over the same SQL result-set diff, or
any combination of the above dressed up as a different named instrument.
The line ends by its own rule, not by a decision made after seeing the
data — the rule was written into `BI-BATTERY-DESIGN.md` before the pretest
screen ever ran.

## 3. VOID BY RULE, named requirement by requirement

Per the pre-registered conditional exit (`.planning/STATE.md`'s milestone
decision: "if the Phase 9 corridor probe (REQ-55) hits the pre-committed
failure branch, REQ-56–58 and all of Phase 10 are VOID BY RULE and the
milestone closes with a terminal report"), the following are **VOID BY
RULE** — recorded here explicitly, not silently skipped:

- **REQ-56** (F-22 disclosure checkpoint readout) — VOID BY RULE. The
  format-stability gate plus stage-1 data this readout would be checked
  against never existed; there is nothing for the four §7 disclosures to be
  marked met or unmet against. No `DISCLOSURE-READOUT.md` is written on this
  branch.
- **REQ-57** (generator acceptance by pre-authorized rule) — VOID BY RULE.
  §9 gate condition 2 (the corridor verdict is `QUALIFIED`) cannot hold; the
  full AND of all three gate conditions therefore cannot hold; acceptance
  is refused, not partially granted.
- **REQ-58** (prereg adoption commit) — VOID BY RULE. Adoption fires only
  if acceptance actually fired (REQ-57); it did not.
- **All of Phase 10, including REQ-59** (DUALFIX round 1 under the adopted
  prereg) — VOID BY RULE. Round 1 requires a qualified instrument and an
  adopted pre-registration; neither exists.

This is a legitimate, pre-registered, milestone-ending outcome — **not an
incomplete milestone**. The milestone's own decision record states this
plainly: "instrument fails to qualify" is a pre-committed legitimate
outcome on the same footing as a DUALFIX null would have been had the
instrument qualified.

## 4. Neither auto-gate fired — the pre-authorization's auto-refusal path

Per `BI-BATTERY-DESIGN.md` §9's conditional pre-authorization (Dr. Robert
Li, 2026-08-10): "acceptance/adoption fire automatically iff the frozen
pre-registered gates pass; gates failing yields auto-refusal and a terminal
report, never auto-acceptance." That is exactly what happened here. Gate
condition 2 (corridor verdict `QUALIFIED`) fails outright — the verdict is
FAILURE BRANCH — so the full AND of §9's three gate conditions cannot hold,
and acceptance is refused automatically. Adoption never evaluates its own
precondition (acceptance actually firing) because acceptance never fired.
This is the auto-refusal path working exactly as written, not a step that
was skipped or forgotten.

Verified negatives, both confirmed directly against the tree at this
commit:

- `BI_ANALYTICS_GENERATOR_ID` remains **absent** from `ACCEPTED_GENERATORS`
  in `src/foundry/fixture-warehouse.ts` — `generateBiBattery` still throws.
  `src/` is untouched by this plan (`git status --porcelain src/` empty
  before this commit).
- `experiments/method-research/PREREG-DRAFT.md` remains **unadopted** —
  its `DRAFT — NOT ADOPTED` header is unchanged, and no
  `experiments/bi-analytics-pilot/PREREG-ADOPTION.md` exists.

## 5. What remains legitimate after termination

Per §10's own text:

- **This terminal report**, for this instrument line, on this hypothesis.
- **Using its diagnostics to design instruments for DIFFERENT hypotheses or
  task families** — including the other verticals `RECOMMENDATION.md` §1
  assessed but did not recommend (performance-marketing, customer-support).
  The join/aggregation-depth knob's own difficulty cliff (documented below)
  is exactly the kind of diagnostic that transfers: a lesson about how a
  local qwen3.6 model's SQL-writing capability degrades non-uniformly
  across structural complexity, not a lesson that is itself barred from
  informing a differently-scoped instrument.
- **Phase 5 staying gated on whatever evidence exists at that point.** No
  new evidence toward the phase-5 promotion gate for the bi-analytics
  vertical was produced by this line; that gate remains exactly as gated as
  it was before this milestone began.

## The substantive finding

Stated as the measurement it is, not smoothed into a procedural footnote:
the BI knob has a genuine difficulty cliff between structural complexity 2
(one JOIN, zero aggregations) and structural complexity 3 (one JOIN plus
one aggregation) — a 0.30 mean-score drop, three times the design's own
0.10 per-step granularity ceiling, and the drop survived being bisected by
a genuinely new intermediate level (`L2B`: L2's exact join shape plus one
added filter clause) rather than a fresh aggregation. The intermediate
level's mean landed on L2's neighbor's own score (0.500, identical to L3),
not partway between L2's 0.800 and L3's 0.500 — the filter clause added no
measurable difficulty of its own at this point on the scale; the entire
0.30 drop is attributable to the aggregation operation itself, and a single
filter-clause subdivision cannot resolve a cliff whose cause is a different
kind of structural operation. This is the second instrument line, after the
v3/v3.1 data-ops family, to terminate under this milestone's corridor
methodology — a different failure shape (a raw granularity violation
against the pretest screen, not a corridor-placement or gradient-floor
failure against six-seed stage-1 data), reached at an earlier stage (before
any corridor task was drawn), but the same discipline: a step whose own
data can't support the design's granularity, discovered honestly rather
than papered over, terminates the line by its own pre-registered rule.
