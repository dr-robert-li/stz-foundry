/**
 * The Stage-B gate evaluator (Phase 12 — Corpus + paired repair run + gate,
 * Plan 12-02, REQ-66). Pure, side-effect-free — no environment reads, no
 * filesystem access, no top-level execution — so it can be imported by both
 * this plan's test suite and 12-05's results-sync check without ever
 * touching a real run.
 *
 * The frozen pre-registration `DUALFIX-STUDY-PREREG.md` §7 (the Stage-B
 * trigger inequality, its inclusive boundary, and its firing discipline)
 * and §8 (the two termination clauses) are this module's sole authority.
 * Every threshold this module compares against is imported from
 * `_dualfix-arms.ts`, never retyped — a second copy of a pinned constant is
 * the drift the pre-registration discipline exists to prevent.
 */
import { DUALFIX_STAGE_B_MARGIN_NUM, DUALFIX_STAGE_B_MARGIN_DEN } from "./_dualfix-arms.js";

/** The three values the study driver's verdict artifact
 *  (`dualfix-study-verdict.json`, §8) writes to its `outcome` field. */
export type StudyOutcome = "COMPLETE" | "UNDERPOWERED" | "ERROR-BUDGET-EXCEEDED";

/** §7's evaluated result: `MET`/`NOT-MET` arise only on a `COMPLETE`
 *  outcome; `NOT-EVALUATED` is §8's firing-discipline short-circuit — the
 *  inequality is never read for a study that already terminated under §8. */
export type StageBVerdict = "MET" | "NOT-MET" | "NOT-EVALUATED";

/** The two branches REQ-67 reads: continue into the paired-comparison arm,
 *  or close the milestone at Phase 12 (REQ-70's closing discipline). */
export type StageBBranch = "STAGE B OPEN" | "MILESTONE CLOSING";

/** §7's full evaluation result. `lhs`/`rhs` are the two integer sides of the
 *  pinned inequality — populated only when `verdict` is `MET`/`NOT-MET`
 *  (the `COMPLETE`-outcome path); left as `NaN` for `NOT-EVALUATED`, since
 *  §7's firing discipline means the inequality is never computed there.
 *  `reason` names the governing prereg clause for the result reached. */
export interface StageBEvaluation {
  verdict: StageBVerdict;
  branch: StageBBranch;
  lhs: number;
  rhs: number;
  reason: string;
}

const KNOWN_OUTCOMES: ReadonlySet<StudyOutcome> = new Set(["COMPLETE", "UNDERPOWERED", "ERROR-BUDGET-EXCEEDED"]);

function requireValidCount(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`[dualfix-gate] ${name} must be a non-negative integer, got ${JSON.stringify(value)}`);
  }
}

/**
 * §7's Stage-B trigger inequality, evaluated in pure integer arithmetic —
 * the property §7 states in prose ("no float comparison, no rounding, no
 * tie-breaking policy is ever required") becomes a structural property of
 * this function: there is no `/` division anywhere in this module, so the
 * comparison is between two integers by construction.
 *
 * `outcome` is the study driver's own recorded verdict-artifact outcome
 * (§8). `kD`/`kC` are the DUALFIX/naive-retry arms' repaired counts; `n` is
 * the shared attempted-candidate denominator (§7: the two arms' attempted
 * counts cannot diverge, by construction of the study driver).
 *
 * Firing discipline (§7, "Firing discipline"): the inequality is evaluated
 * only when `outcome === "COMPLETE"`. An `"UNDERPOWERED"` or
 * `"ERROR-BUDGET-EXCEEDED"` outcome means §8 already terminated the study,
 * so this function short-circuits to `NOT-EVALUATED` / `MILESTONE CLOSING`
 * without ever computing the inequality — the gate auto-fires or
 * auto-refuses, and never auto-accepts on a miss.
 */
export function evaluateStageBGate(outcome: StudyOutcome, kD: number, kC: number, n: number): StageBEvaluation {
  if (!KNOWN_OUTCOMES.has(outcome)) {
    throw new Error(`[dualfix-gate] unrecognised outcome ${JSON.stringify(outcome)}`);
  }
  requireValidCount(kD, "kD");
  requireValidCount(kC, "kC");
  requireValidCount(n, "n");
  if (kD > n) throw new Error(`[dualfix-gate] kD (${kD}) must not exceed n (${n})`);
  if (kC > n) throw new Error(`[dualfix-gate] kC (${kC}) must not exceed n (${n})`);

  if (outcome !== "COMPLETE") {
    return {
      verdict: "NOT-EVALUATED",
      branch: "MILESTONE CLOSING",
      lhs: NaN,
      rhs: NaN,
      reason: `§7's firing discipline: the inequality is evaluated only on a COMPLETE outcome; §8 already terminated this study as ${outcome}`,
    };
  }

  // Only on the COMPLETE outcome do we compute the two sides of the
  // inequality — this is the one guarded expression in the module that can
  // produce the STAGE B OPEN branch.
  const lhs = DUALFIX_STAGE_B_MARGIN_DEN * (kD - kC);
  const rhs = DUALFIX_STAGE_B_MARGIN_NUM * n;
  if (lhs >= rhs) {
    return {
      verdict: "MET",
      branch: "STAGE B OPEN",
      lhs,
      rhs,
      reason: `§7's inequality holds: DUALFIX_STAGE_B_MARGIN_DEN*(kD-kC) = ${lhs} >= DUALFIX_STAGE_B_MARGIN_NUM*n = ${rhs} (inclusive boundary)`,
    };
  }
  return {
    verdict: "NOT-MET",
    branch: "MILESTONE CLOSING",
    lhs,
    rhs,
    reason: `§7's inequality does not hold: DUALFIX_STAGE_B_MARGIN_DEN*(kD-kC) = ${lhs} < DUALFIX_STAGE_B_MARGIN_NUM*n = ${rhs}`,
  };
}

/**
 * §7: "The shared-`n` assumption holds by construction of the study
 * driver, not merely by assertion." This makes that assumption checked
 * rather than trusted, per this milestone's standing rule that no
 * arithmetic assumption is taken on faith. Throws naming both counts when
 * the two arms' attempted counts diverge; no-ops when they agree.
 */
export function assertPairedDenominator(dualfixAttempted: number, controlAttempted: number): void {
  if (dualfixAttempted !== controlAttempted) {
    throw new Error(
      `[dualfix-gate] paired-denominator violation: dualfix arm attempted=${dualfixAttempted}, control arm attempted=${controlAttempted} — §7's shared-n assumption does not hold`,
    );
  }
}
