/**
 * Partial-credit scoring for battery tasks — the phase-3 battery revision
 * (`experiments/dataops-agent-pilot/PILOT-RESULTS.md`).
 *
 * PURE, and deliberately separate from `src/contract/predicate-eval.ts`. That
 * module owns contract pass/fail and stays exact: a predicate either holds or
 * it does not. This module owns the SELECTION signal, where a near-miss
 * genuinely is better evidence than a wild miss and should be scored as such.
 *
 * Why it exists, measured rather than assumed: the completed separation gate
 * found `testPassRate` quantized to 0.167 (6 binary tasks), with the whole
 * spread between a minimal and a strong system prompt (0.111) smaller than one
 * scale point. Exact-integer equality on a 6-digit `revenueCents` gives a
 * search nothing to climb — a candidate one cent out and a candidate 87% out
 * score identically.
 */
import type { CheckResult } from "../contract/predicate-eval.js";
import type { GradedSpec } from "./battery-types.js";

/**
 * Parse an observation/expectation into a finite number, or `undefined`.
 *
 * Both sides arrive as JSON-encoded strings (`observeCheck` returns
 * `JSON.stringify(value)`, and `PredicateCheck.expect` is written the same
 * way), so `"744035"` parses and `"\"abc\""`, `""`, `"<no-observation>"` and
 * `null`/`undefined` do not. `Number("")` is 0 in JavaScript, which would
 * silently score an empty observation as a near-miss of a small expectation —
 * so empty is rejected explicitly rather than left to `Number`.
 */
function finiteNumber(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Credit in `[0, 1]` for one check.
 *
 * - An exactly-passing check scores 1, whatever its grading says — grading can
 *   only ever soften a failure, never demote a pass.
 * - A failing check with no grading spec scores 0 (v1 behaviour, unchanged).
 * - A failing check WITH a spec scores `max(0, 1 - relErr / zeroAt)`, where
 *   `relErr = |actual - expected| / max(|expected|, 1)`. The `max(…, 1)`
 *   denominator keeps an expectation of 0 from dividing by zero.
 * - A failing check whose expectation or observation is not a finite number
 *   scores 0 — a missing or non-numeric answer is not a near miss.
 */
export function gradeCheck(result: CheckResult, spec: GradedSpec | undefined): number {
  if (result.pass) return 1;
  if (!spec) return 0;
  const expected = finiteNumber(result.expected);
  const actual = finiteNumber(result.actual);
  if (expected === undefined || actual === undefined) return 0;
  const relativeError = Math.abs(actual - expected) / Math.max(Math.abs(expected), 1);
  return Math.max(0, 1 - relativeError / spec.zeroAt);
}

/**
 * Score one task's checks in `[0, 1]`.
 *
 * A task with NO grading specs scores binary — 1 only if every check passes,
 * exactly as before this module existed. That keeps every v1 battery's
 * `testPassRate` byte-identical; only a task that opts in by carrying
 * `grading` is scored continuously.
 *
 * A graded task scores the MEAN of its per-check credit, so a task is worth
 * the same as any other task regardless of how many checks it carries.
 * `results.length === 0` scores 0 rather than dividing by zero — `makeBattery`
 * already refuses a check-less task, so this is defence in depth.
 */
export function gradeTask(results: CheckResult[], grading: GradedSpec[] | undefined): number {
  if (results.length === 0) return 0;
  if (!grading || grading.length === 0) {
    return results.every((r) => r.pass) ? 1 : 0;
  }
  const specById = new Map(grading.map((s) => [s.checkId, s]));
  const total = results.reduce((sum, r) => sum + gradeCheck(r, specById.get(r.checkId)), 0);
  return total / results.length;
}
