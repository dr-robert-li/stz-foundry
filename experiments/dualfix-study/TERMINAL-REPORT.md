# DUALFIX property study — TERMINAL REPORT

**Verdict:** MILESTONE CLOSING (`stage-b-decision.json`: `outcome: "COMPLETE"`,
`verdict: "NOT-MET"`, `branch: "MILESTONE CLOSING"`, decided from
`dualfix-study-verdict.json`, the paired run's own completed verdict artifact).
REQ-66 closes on this basis as the pre-registered refusal that
`.planning/ROADMAP.md`'s Overview and `.planning/REQUIREMENTS.md`'s REQ-66 both
authorise in advance. This report is committed per the milestone's own
pre-committed conditional exit — the legitimate outcome that clause exists to
name, not a gap in the milestone.

## 1. What was measured

Both arms ran to a `COMPLETE` outcome on the identical, pinned 24-entry
failing-candidate corpus (`dualfix-corpus.json`, pinned at commit `7e44cca`).
DUALFIX repaired 19 of 24 attempted candidates; naive-retry, the control arm,
repaired 17 of 24 — the same shared denominator by construction of the study
driver's interleaved loop, confirmed by `assertPairedDenominator(24, 24)` in
12-04 rather than merely assumed.

§7's integer inequality is
`DUALFIX_STAGE_B_MARGIN_DEN * (kD - kC) >= DUALFIX_STAGE_B_MARGIN_NUM * n`.
Substituting the recorded counts: `20 * (19 - 17) >= 3 * 24`, i.e.
`40 >= 72`. This does not hold — `40 < 72`. The two integer sides are `lhs =
40`, `rhs = 72`, both transcribed from `evaluateStageBGate`'s own return
value, never computed by hand.

**The finding, stated plainly.** A DUALFIX repair rate 2/24 above the
naive-retry control, well short of the pre-registered 0.15-of-shared-
denominator margin, is a standalone result under this study's design — not a
failure, and not softened toward a near-hit in either direction. On this
corpus, under this prereg's margin, DUALFIX's repair-rate advantage over a
naive retry does not clear the bar that would have autonomously opened the
paired-comparison third-family arm.

## 2. VOID BY RULE, named requirement by requirement

Per the pre-registered conditional exit (`.planning/ROADMAP.md`'s Overview:
"If Phase 12's Stage-B gate (REQ-66) refuses because the frozen REQ-61
threshold is not met, the milestone closes at Phase 12 itself — REQ-67,
REQ-68, and REQ-69 are recorded VOID BY RULE (not skipped)..."), the
following are **VOID BY RULE** — recorded here explicitly, not silently
skipped, deferred, or left incomplete:

- **REQ-67** (third-family selection + full-discipline paired prereg) — VOID BY RULE.
  REQ-67's own triggering condition is Stage B opening; admission-path analysis over
  a third task family, and a `PAIRED-DESIGN-PREREG.md` built against that selection,
  presuppose a Stage B that never opened. There is no selection to analyse and no
  prereg to freeze, because the condition that would have authorised either never held.

- **REQ-68** (instrument build per frozen paired design) — VOID BY RULE.
  REQ-68 builds strictly against REQ-67's own frozen design document — a new
  vertical admission, an answer-first generator, an independent oracle, all
  scoped to whatever paired design REQ-67 would have produced. No such design
  exists on this branch, so there is no frozen design to build against; a
  build with nothing to build against is not a deferred build, it is a build
  that was never authorised to begin.

- **REQ-69** (paired round) — VOID BY RULE. REQ-69's W-vs-B paired round runs
  the instrument REQ-68 would have built, per the decision rule REQ-67's
  design would have fixed. Neither the instrument nor the decision rule
  exists on this branch, so there is no instrument to run a paired round
  against and no design-specific rule to read a verdict from.

Each of the three requirements above sits on the same footing as a fired gate
that then produced a null result: pre-registered, authorised in advance, and
recorded as closed rather than left open. None of the three is an unfinished
or postponed item.

## 3. The gate did not misfire — the pre-authorisation's auto-refusal path

Per `.planning/ROADMAP.md`'s Overview, quoted verbatim: **"Autonomy directive
(Dr. Robert Li, 2026-08-10) carries verbatim: pre-registered auto-gates,
auto-refusal never auto-acceptance, no mid-run human stops. The Stage-B gate
(REQ-66) is the one gate this milestone turns on — it fires automatically
iff the frozen REQ-61 inequality is met, and refuses automatically (never
auto-accepts on a miss) otherwise."**

And per `.planning/REQUIREMENTS.md`'s REQ-66 text, quoted verbatim: **"Fires
iff the frozen REQ-61 threshold is met: Stage B opens autonomously. Not met
⇒ milestone closes with the study as a standalone finding; REQ-67–69 VOID BY
RULE (recorded, not skipped); REQ-70 record discipline still applies. Never
opens on a miss."**

That is exactly what happened here. The frozen REQ-61 inequality does not
hold on this run's own numbers (`40 < 72`), so Stage B refuses automatically,
never partially, never on a "close enough" reading of a 2/24 difference
against a 0.15-of-denominator margin. `stage-b-decision.json` is produced by
exactly one call to `evaluateStageBGate`, reading only
`dualfix-study-verdict.json`'s own recorded `outcome`/`arms` fields and the
imported `DUALFIX_STAGE_B_MARGIN_NUM`/`DEN` constants — no partial pass, no
re-derived figure, no threshold adjusted after seeing the data. This is the
auto-refusal path working exactly as written, not a step that was skipped or
forgotten. The record shows the refusal was written down before the data
existed: `.planning/ROADMAP.md`'s conditional-exit paragraph and
`.planning/REQUIREMENTS.md`'s REQ-66 text both predate this study's corpus
build and repair run.

## 4. Closing

This is a legitimate, pre-registered, milestone-ending outcome — **not an incomplete milestone**.
The pre-committed conditional exit names exactly
this shape as satisfied-by-rule, not as a gap: REQ-67, REQ-68, and REQ-69
close VOID BY RULE above, each with its own reason drawn from what that
requirement specifically called for, and REQ-70's closing discipline is
completed in this phase under the requirement's own dual-homing — not
deferred to a Phase 14 that will not run. Phases 13 and 14 are marked void
by rule in `.planning/ROADMAP.md`'s phase checklist; no plan, stub, or
placeholder is authored for either.

The substantive finding stands on its own terms: a naive retry against the
same failing-candidate corpus came within 2/24 of DUALFIX's repair rate,
well inside the pre-registered margin — a measurement of DUALFIX's
repair-component property on this corpus, reported honestly rather than
pressed toward a positive result it did not reach.
