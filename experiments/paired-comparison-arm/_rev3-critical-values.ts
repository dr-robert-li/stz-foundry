/**
 * Rev-3 critical-value re-derivation (Plan 15-02, Task 1, REQ-71).
 *
 * Re-derives `c(n_d)` for the widened rev-3 discordant-pair domain — the
 * pinned floor (20, `PAIRED_MIN_DISCORDANT_FLOOR`, unchanged) through the
 * proposed new battery size (90) inclusive — from §5's own exact combinatorial
 * condition, restated verbatim:
 *
 *   "a critical value c(n_d) ... computed once at design time as the smallest
 *   integer c such that 40 · Σ_{i=c}^{n_d} C(n_d, i) ≤ 2^{n_d} (the exact
 *   combinatorial condition for a per-tail probability not exceeding 0.025
 *   under Binomial(n_d, 0.5), evaluated in exact integer arithmetic over
 *   binomial coefficients — no approximation, no floating-point tail-
 *   probability computation, ever)."
 *   — PAIRED-DESIGN-PREREG.md §5, lines 405-409
 *
 * Reuses the same Pascal-recurrence/suffix-sum approach
 * `test/paired-critical-value-drift.test.ts`'s `binomialRow`/
 * `deriveCriticalValue` already proves correct against the frozen rev-2
 * table — re-implemented here (never imported from the test file: this
 * script is the production artifact the amendment's §12 table is pasted
 * from, and the test is its own independent check, not a shared dependency).
 *
 * This script WRITES NOTHING. It only derives and prints markdown table
 * rows to stdout — the amendment's own §12 table is an authored, reviewed
 * part of the pre-registration, not a side effect of running a script.
 *
 * 90 (the proposed rev-3 battery size) is NOT a `_paired-constants.ts`
 * export: this plan's `files_modified` list does not touch that module, and
 * the frozen rev-3 §12 binding for these constants lands in Plan 15-05, once
 * the panel has adjudicated and rev 3 is frozen. `PAIRED_MIN_DISCORDANT_FLOOR`
 * (20, unchanged) and `PAIRED_PER_TAIL_SIGNIFICANCE_RECIPROCAL` (40, the
 * frozen per-tail-significance reciprocal §5's condition uses directly) ARE
 * imported: both are already-frozen rev-2 constants this amendment proposes
 * to reuse unchanged, not new rev-3 pins.
 *
 * ── Two derived floors + one disclosure threshold, recomputed from §9's own
 * provenance formulas, applied to the proposed new battery size (90) ──
 *
 *   Instrument-health gate floor (§9/§6 Clause 1)
 *     = battery_size × (1 − 2 × 0.10)
 *     = 90 × 0.8 = 72                                   (was 60×0.8=48)
 *
 *   Per-arm drop-budget ceiling (§9/§6 Clause 3)
 *     = battery_size × 0.10
 *     = 90 × 0.1 = 9                                    (was 60×0.1=6)
 *
 *   Tie-rate ceiling disclosure threshold (§9/§8 item 1)
 *     = smallest tie count whose complement (discordant pairs) falls
 *       strictly below the Clause 2 floor of 20
 *     = battery_size − 19
 *     = 90 − 19 = 71                                    (was 60−19=41)
 *
 * §9's provenance column states a formula for each of these three
 * constants — none is invented here; each formula above is applied to the
 * new battery size only, unchanged in form. §9 states no formula for the
 * seed-block shape or the block-concordance agreement threshold: those stay
 * open decisions for the panel (§12's own open-decisions section), not
 * derived here.
 */
import {
  PAIRED_MIN_DISCORDANT_FLOOR,
  PAIRED_PER_TAIL_SIGNIFICANCE_RECIPROCAL,
} from "./_paired-constants.js";

/** The proposed rev-3 battery size — see header comment above for why this
 *  is a local constant, not a `_paired-constants.ts` export, in this plan. */
export const REV3_BATTERY_SIZE = 90;

const RECIPROCAL = BigInt(PAIRED_PER_TAIL_SIGNIFICANCE_RECIPROCAL);

/**
 * Exact integer binomial-coefficient row for a given `n`, `C(n, 0..n)`,
 * built by Pascal's-triangle recurrence in BigInt end to end — never a
 * factorial division through a float, and never `Math.pow`/`Math.log`
 * anywhere in this derivation.
 */
export function binomialRow(n: number): bigint[] {
  const row: bigint[] = [1n];
  for (let k = 1; k <= n; k++) {
    // C(n, k) = C(n, k-1) * (n - k + 1) / k — exact BigInt division: the
    // running product is always divisible by k at this point in the
    // standard incremental-binomial recurrence.
    row.push((row[k - 1]! * BigInt(n - k + 1)) / BigInt(k));
  }
  return row;
}

/**
 * §5's exact combinatorial condition: the smallest integer `c` such that
 * `RECIPROCAL * sum_{i=c}^{n} C(n, i) <= 2^n`. The suffix sum is
 * accumulated from `i = n` down to `i = 0`, entirely in BigInt.
 */
export function deriveCriticalValue(n: number): number {
  const row = binomialRow(n);
  const twoToN = 1n << BigInt(n);
  // The suffix sum sum_{i=c}^{n} C(n,i) is monotonically non-increasing as
  // c increases, so the first c from 0 upward satisfying the condition is
  // the smallest such c — walk c from 0 upward, subtracting C(n,c) out of
  // a running total each step.
  let runningSum = row.reduce((sum, value) => sum + value, 0n);
  for (let c = 0; c <= n; c++) {
    if (RECIPROCAL * runningSum <= twoToN) return c;
    runningSum -= row[c]!;
  }
  throw new Error(`[rev3-critical-values] no critical value satisfies the condition for n=${n}`);
}

/** One derived row: `[n_d, c(n_d), n_d - c(n_d)]`. */
export interface Rev3CriticalValueRow {
  nd: number;
  c: number;
  ndMinusC: number;
}

/**
 * Derives the full range from the pinned discordant floor (20) through the
 * proposed new battery size (90) inclusive.
 */
export function deriveRev3Table(
  floor: number = PAIRED_MIN_DISCORDANT_FLOOR,
  size: number = REV3_BATTERY_SIZE,
): Rev3CriticalValueRow[] {
  const rows: Rev3CriticalValueRow[] = [];
  for (let nd = floor; nd <= size; nd++) {
    const c = deriveCriticalValue(nd);
    rows.push({ nd, c, ndMinusC: nd - c });
  }
  return rows;
}

/** Renders the derived rows as the same three-integer-column markdown rows
 *  the frozen §9 table already uses, ready to paste into §12. */
export function renderRev3TableMarkdown(rows: Rev3CriticalValueRow[]): string {
  return rows.map((r) => `| ${r.nd} | ${r.c} | ${r.ndMinusC} |`).join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = deriveRev3Table();
  console.log(renderRev3TableMarkdown(rows));
}
