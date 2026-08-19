/**
 * Phase 14 pinned constants — the single source of truth every later module
 * in this phase reads from (Plan 14-01, REQ-68/REQ-69,
 * `PAIRED-DESIGN-PREREG.md` rev 2 — FROZEN, freeze commit
 * `2f9e6095dc6e20bcc8196a293397f7ec07f8c704`).
 *
 * Pure exported data. Zero pulled-in modules, zero environment reads, zero
 * computation — every value below is either transcribed from the frozen
 * design's §9 table (and its §5/§8 prose, for the two rows §9's table itself
 * does not carry a dedicated row for) or pinned fresh by this commit for the
 * three rows the frozen design explicitly deferred. `test/paired-constants.test.ts`
 * re-reads the frozen document off disk and fails if this module drifts from
 * it — this file is never the place a drift is fixed; the frozen document
 * is the expected value, always.
 */

// ── §9 — battery shape ──────────────────────────────────────────────────────

/** §9 "Battery size (pairing units)" — 6 seeds × 10 tasks per seed. */
export const PAIRED_BATTERY_SIZE = 60;

/** §9 "Seeds (six, pinned)" — fresh, disjoint from every seed set already
 *  used by any prior study in this project: DUALFIX 1201-1206; BI stage-1
 *  101/202/303/404/505/606, stage-2 707/808/909, pretest 999; and this
 *  phase's own build-gate seeds below (1399, 1401-1403, 1404-1406). */
export const PAIRED_SEEDS: readonly number[] = Object.freeze([1301, 1302, 1303, 1304, 1305, 1306]);

/** §9 "Tasks per seed". */
export const PAIRED_TASKS_PER_SEED = 10;

// ── §9/§6 — qualification clauses ───────────────────────────────────────────

/** §9/§6 Clause 1 "Instrument-health gate floor" — 48 of 60 pairing units
 *  must land with both arms scoreable. */
export const PAIRED_HEALTH_GATE_FLOOR = 48;

/** §9/§6 Clause 2 "Minimum discordant-pairs floor". */
export const PAIRED_MIN_DISCORDANT_FLOOR = 20;

/** §9/§6 Clause 3 "Per-arm drop-budget ceiling" — 6 of 60 (10%), per arm. */
export const PAIRED_DROP_BUDGET_CEILING = 6;

// ── §9/§8 — quantified disclosures ──────────────────────────────────────────

/** §9/§8 item 1 "Tie-rate ceiling disclosure" — a tie rate at or above this
 *  count leaves fewer than the Clause 2 floor of discordant pairs available. */
export const PAIRED_TIE_RATE_DISCLOSURE_THRESHOLD = 41;

/** §9/§5 "Per-tail-significance reciprocal" — 1/0.025, the reciprocal of the
 *  per-tail significance level (half of α = 0.05), used directly in the
 *  design-time combinatorial condition that produced the critical-value
 *  table below. A live number the decision path never recomputes. */
export const PAIRED_PER_TAIL_SIGNIFICANCE_RECIPROCAL = 40;

/**
 * §9/§8 item 3 "Per-arm dominant-failure-mode ceiling" — 90% of an arm's own
 * scoreable attempts (category 3 + category 4 combined), expressed as an
 * integer numerator/denominator pair rather than a floating-point 0.9,
 * because §5 forbids a live float anywhere in the decision path.
 */
export const PAIRED_DOMINANT_FAILURE_MODE_CEILING_NUM = 9;
export const PAIRED_DOMINANT_FAILURE_MODE_CEILING_DEN = 10;

// ── §9/§3 — the equal-treatment invariant's attempt discipline ─────────────

/** §9/§3 "Attempt discipline" — exactly one resolution proposal per arm per
 *  pairing unit. */
export const PAIRED_ATTEMPT_DISCIPLINE = 1;

// ── §5 — required block-level concordance check (F-05) ─────────────────────

/** §5 "Required block-level concordance check" — one classification per
 *  seed-block (1301..1306); not a §9 table row, pinned here from §5's own
 *  prose ("each of the six seed-blocks... is independently classified"). */
export const PAIRED_CONCORDANCE_BLOCK_COUNT = 6;

/** §5 "at least four of the six blocks agree with the pooled decision's
 *  direction" — the pooled verdict stands only at or above this count. */
export const PAIRED_CONCORDANCE_AGREE_THRESHOLD = 4;

/**
 * §7's null-result canonization (F-14): an INDISTINGUISHABLE result landing
 * near Clause 2's floor ("n_d in the low twenties") carries markedly less
 * evidential weight than one near the full battery size — the frozen design
 * states this in prose only, without pinning a literal boundary. Pinned here
 * by Plan 14-03 (not a §9 table row — the frozen document names no exact
 * integer) as the inclusive upper bound of "low twenties": 20-24. Chosen
 * because §6 Clause 2's own worked power comparison (`n_d=20` vs `n_d=40`)
 * treats 20 as the low end and the gap to 40 as the wide-power end, so a
 * boundary roughly a quarter of the way through that gap keeps "low" narrow
 * rather than creeping toward the midpoint.
 */
export const PAIRED_NEAR_FLOOR_EVIDENTIAL_WEIGHT_BOUND = 24;

// ── §9/§8 item 2 — significance level, documentation-only ──────────────────

/**
 * §9/§8 item 2 "Significance level". Carried as a documentation string used
 * only in reports — never a number any comparison in the decision path
 * reads. The pinned consequence of this level is the critical-value table
 * below, computed once at design time; nothing downstream recomputes it.
 */
export const PAIRED_SIGNIFICANCE_LEVEL_DOC = "α = 0.05, two-sided (0.025 per tail)";

// ── §9 — the 41-row critical-value table, n_d -> c(n_d), literal integers ──

/**
 * `c(n_d)`: W-superior fires at `k_w >= c(n_d)`; B-superior fires at
 * `k_w <= n_d - c(n_d)` (computed by a caller, never stored here — this
 * module holds only the pinned literal). Covers every discordant-pair count
 * this design can plausibly produce: the Clause 2 floor (20) through the
 * full battery size (60), 41 keys total.
 */
export const PAIRED_CRITICAL_VALUE_TABLE: Readonly<Record<number, number>> = Object.freeze({
  20: 15,
  21: 16,
  22: 17,
  23: 17,
  24: 18,
  25: 18,
  26: 19,
  27: 20,
  28: 20,
  29: 21,
  30: 21,
  31: 22,
  32: 23,
  33: 23,
  34: 24,
  35: 24,
  36: 25,
  37: 25,
  38: 26,
  39: 27,
  40: 27,
  41: 28,
  42: 28,
  43: 29,
  44: 29,
  45: 30,
  46: 31,
  47: 31,
  48: 32,
  49: 32,
  50: 33,
  51: 33,
  52: 34,
  53: 35,
  54: 35,
  55: 36,
  56: 36,
  57: 37,
  58: 37,
  59: 38,
  60: 39,
});

// ── §9 — the three rows the frozen design deferred to Phase 14's own
// instrument commit, pinned here identically for both arm slots ───────────

/**
 * §9 "Model and model digest" — deferred to this commit. Pinned to the same
 * locally-pulled model both prior instrument lines (DUALFIX, BI) ran, so the
 * equal-treatment invariant is satisfied by a model whose behaviour on this
 * hardware is already characterised.
 */
export const PAIRED_MODEL = "qwen3.6:latest";
export const PAIRED_MODEL_DIGEST = "07d35212591f";

/**
 * §9 "Timeout" — deferred to this commit. Pinned to the same 3,600,000ms
 * house ceiling both `BI_TASK_TIMEOUT_MS` and DUALFIX's driver default use —
 * the bound, not a median, so reusing the house ceiling is the low-risk
 * default absent a reason to diverge.
 */
export const PAIRED_TIMEOUT_MS = 3_600_000;

/**
 * §9 "Prompt-length bound" — deferred to this commit. Sized for a ticket
 * plus a three-field output contract, deliberately tighter than the 4000
 * `MAX_DUALFIX_PROMPT_CHARS` needed for a full SQL repair artifact.
 */
export const PAIRED_MAX_PROMPT_CHARS = 2000;

// ── Phase-14 build-gate constants — NOT rows of the frozen design's own
// table, pinned by this commit for the ceiling probe (14-04) and the
// tournament search/promotion halves (14-05). Seed-disjointness rationale:
// avoids DUALFIX 1201-1206; BI stage-1 101/202/303/404/505/606, stage-2
// 707/808/909, pretest 999; and this phase's own frozen-design seeds
// 1301-1306 above. ──────────────────────────────────────────────────────────

/** The ceiling-probe seed, distinct from the paired battery's own
 *  1301-1306 block per §4's no-redraw rule. */
export const CEILING_PROBE_SEED = 1399;
export const CEILING_PROBE_TASK_COUNT = 10;
export const CEILING_PROBE_SCOREABLE_FLOOR = 8;

/** The component-tournament's search-set half — disjoint from the paired
 *  battery's 1301-1306 seeds per §3's "the data used to select W... is
 *  disjoint from this battery's own seeds" requirement. */
export const TOURNAMENT_SEARCH_SEEDS: readonly number[] = Object.freeze([1401, 1402, 1403]);

/** The component-tournament's promotion-set half — disjoint from the
 *  search-set half above and from every other seed block in this file. */
export const TOURNAMENT_PROMOTION_SEEDS: readonly number[] = Object.freeze([1404, 1405, 1406]);

// ── Phase-15 rev-3 pins (Plan 15-01) — pinned by THIS COMMIT under the
// confirmed Phase-15 pins (`.planning/HANDOVER-phase15-amended-run.md` §3,
// STATE.md 2026-08-19 decision), NOT a transcription of any frozen §12
// table — the frozen-§12 binding for these two symbols arrives in Plan
// 15-05, once rev 3 is frozen. Additive only: every rev-2 export above
// stays exactly as it stands, value and order both. ─────────────────────────

/** The rev-3 executor model — the only local model the calibration
 *  dry-runs found with a measured, prompt-addressable gradient; qwen3.6
 *  (`PAIRED_MODEL` above) saturated every calibration configuration. */
export const PAIRED_MODEL_REV3 = "gpt-oss:latest";
export const PAIRED_MODEL_DIGEST_REV3 = "17052f91a42e";

// ── Phase-15 rev-3 pins (Plan 15-05) — transcribed from §12 as FROZEN
// (freeze commit `8279159aa28885bf0f95afe59db43eceb7921746`). Each symbol
// below carries a doc comment naming the exact §12 row/paragraph it
// transcribes; `test/paired-constants-rev3.test.ts` reads that frozen text
// off disk and binds every one of them to it, plus independently re-derives
// the widened critical-value table in arbitrary-precision arithmetic.
// Additive only — every rev-2 export and the Plan-15-01 model pins above
// stay exactly as they stand, value and order both. Reused unchanged where
// §12 says so explicitly (the discordant floor, the ceiling probe's task
// count and scoreable floor); transcribed as a fresh rev-3 symbol wherever
// §12 restates a value as part of a settled decision, even when the number
// coincides with rev-2's. ─────────────────────────────────────────────────

/** §12 "Battery size:" 90 pairing units, replacing rev-2's 60. */
export const PAIRED_BATTERY_SIZE_REV3 = 90;

/** §12 "Fresh seed blocks ... Battery seeds (nine, under the settled 9×10
 *  default)" — disjoint from the full prior-seed union. */
export const PAIRED_SEEDS_REV3: readonly number[] = Object.freeze([
  1601, 1602, 1603, 1604, 1605, 1606, 1607, 1608, 1609,
]);

/** §12 decision 1 "SETTLED: 9 blocks of ten" — the tasks-per-seed value the
 *  settled 9×10 shape restates as part of that decision (same value as
 *  rev-2's `PAIRED_TASKS_PER_SEED`, restated fresh rather than reused). */
export const PAIRED_TASKS_PER_SEED_REV3 = 10;

// Note: §12's "Minimum discordant-pairs floor: 20, unchanged" is reused
// directly as `PAIRED_MIN_DISCORDANT_FLOOR` above — no rev-3 symbol, per
// §12's own explicit "unchanged".

/** §12 "Instrument-health gate floor (§9/§6 Clause 1), recomputed from §9's
 *  own provenance formula applied to the new battery size:"
 *  `battery_size × (1 − 2 × 0.10) = 90 × 0.8 = 72`. */
export const PAIRED_HEALTH_GATE_FLOOR_REV3 = 72;

/** §12 "Per-arm drop-budget ceiling (§9/§6 Clause 3), recomputed the same
 *  way:" `battery_size × 0.10 = 90 × 0.1 = 9`. */
export const PAIRED_DROP_BUDGET_CEILING_REV3 = 9;

/** §12 "Tie-rate ceiling disclosure threshold (§9/§8 item 1), recomputed
 *  the same way:" `battery_size − 19 = 90 − 19 = 71`. */
export const PAIRED_TIE_RATE_DISCLOSURE_THRESHOLD_REV3 = 71;

/** §12 decision 1 "SETTLED: 9 blocks of ten, six-of-nine concordance
 *  agreement threshold" — the block count. */
export const PAIRED_CONCORDANCE_BLOCK_COUNT_REV3 = 9;

/** §12 decision 1 "SETTLED: 9 blocks of ten, six-of-nine concordance
 *  agreement threshold" — the agreement threshold ("six of nine"). */
export const PAIRED_CONCORDANCE_AGREE_THRESHOLD_REV3 = 6;

/** §12 decision 2 "The near-floor evidential-weight bound ... SETTLED:
 *  re-derived to 25, via a power-anchored criterion" — replacing Plan
 *  14-03's 24 (`PAIRED_NEAR_FLOOR_EVIDENTIAL_WEIGHT_BOUND` above, untouched). */
export const PAIRED_NEAR_FLOOR_EVIDENTIAL_WEIGHT_BOUND_REV3 = 25;

/**
 * §12's critical-value table, pasted verbatim from §12's own 71-row table
 * (n_d 20 through 90 inclusive) — the same combinatorial condition as
 * `PAIRED_CRITICAL_VALUE_TABLE` above, widened to the rev-3 battery.
 * `test/paired-constants-rev3.test.ts` re-derives every value independently
 * in arbitrary-precision integer arithmetic; this module holds only the
 * pinned literal, exactly as the rev-2 table above does.
 */
export const PAIRED_CRITICAL_VALUE_TABLE_REV3: Readonly<Record<number, number>> = Object.freeze({
  20: 15,
  21: 16,
  22: 17,
  23: 17,
  24: 18,
  25: 18,
  26: 19,
  27: 20,
  28: 20,
  29: 21,
  30: 21,
  31: 22,
  32: 23,
  33: 23,
  34: 24,
  35: 24,
  36: 25,
  37: 25,
  38: 26,
  39: 27,
  40: 27,
  41: 28,
  42: 28,
  43: 29,
  44: 29,
  45: 30,
  46: 31,
  47: 31,
  48: 32,
  49: 32,
  50: 33,
  51: 33,
  52: 34,
  53: 35,
  54: 35,
  55: 36,
  56: 36,
  57: 37,
  58: 37,
  59: 38,
  60: 39,
  61: 39,
  62: 40,
  63: 40,
  64: 41,
  65: 41,
  66: 42,
  67: 42,
  68: 43,
  69: 44,
  70: 44,
  71: 45,
  72: 45,
  73: 46,
  74: 46,
  75: 47,
  76: 48,
  77: 48,
  78: 49,
  79: 49,
  80: 50,
  81: 50,
  82: 51,
  83: 51,
  84: 52,
  85: 53,
  86: 53,
  87: 54,
  88: 54,
  89: 55,
  90: 55,
});

/** §12 "Fresh seed blocks ... Probe seed (one): `1610`" — also restated in
 *  "The rev-3 ceiling probe's own parameters" paragraph. Task count and
 *  scoreable floor are explicitly unchanged there and reuse the rev-2
 *  symbols (`CEILING_PROBE_TASK_COUNT`, `CEILING_PROBE_SCOREABLE_FLOOR`
 *  above) — no rev-3 symbol for either, per §12's own explicit "unchanged". */
export const CEILING_PROBE_SEED_REV3 = 1610;

/** §12 "Fresh seed blocks ... Search seeds (three)". */
export const TOURNAMENT_SEARCH_SEEDS_REV3: readonly number[] = Object.freeze([1611, 1612, 1613]);

/** §12 "Fresh seed blocks ... Promotion seeds (three)". */
export const TOURNAMENT_PROMOTION_SEEDS_REV3: readonly number[] = Object.freeze([1614, 1615, 1616]);
