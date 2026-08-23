/**
 * The C-01 collaborative ablation gate (Phase 23 -- Ablation gate + powered
 * STaRK round, Plan 23-01, REQ-81; `experiments/collab-design/COLLAB-DESIGN.md`
 * §7 -- FROZEN at commit `3569d25642d4fd5702d36715da99ec2853f681c7`, the
 * pre-registration of record for this whole module). A pure, side-effect-free
 * lookup -- no environment reads, no filesystem access, no clock, no
 * randomness, no network, and no division operator or decimal literal
 * anywhere in this module's executable code. Every numeral this module
 * compares against is a pinned module constant defined here; neither margin
 * nor the critical-value table can be overridden by a caller-supplied
 * argument or an environment variable (mirrors `promoteComponentWinner`'s
 * own documented anti-pattern, `src/foundry/component-tournament.ts:104-122`
 * -- a caller-supplied margin number is the trusted-boolean hole inverted).
 *
 * Mirrors `experiments/paired-comparison-arm/_paired-gate.ts`'s own
 * pure-evaluator shape: explicit non-negative-integer guards, a lookup
 * against a design-time-pinned table (never a live computation), and a
 * plain integer comparison against pinned margins -- never a rate float.
 * §7 states the derived percentage-point figures (8.0pp primary, ~6.7pp
 * secondary) are inexact; the decision path here compares only the integer
 * hit counts out of the 75-pair suite.
 *
 * Every commit that touches this file must have the freeze commit above as
 * a git ancestor -- enforced by `test/collaborative-ablation-gate-freeze.test.ts`,
 * a sibling guard, never by widening `test/collab-design-freeze.test.ts`'s
 * own `WATCHED_IMPL_PATHS` (D-15: that array is checked against frozen §9's
 * own text, which pins only the four Phase 20-22 module names; adding a
 * fifth would require a substantive amendment to a frozen document).
 */

// ── The pinned §7 gate constants ────────────────────────────────────────

export class CollaborativeAblationGateError extends Error {
  constructor(message: string) {
    super(`[foundry:collaborative-ablation-gate] ${message}`);
    this.name = "CollaborativeAblationGateError";
  }
}

/** §7's sealed heldout evaluation suite's own `sample_size`. */
export const ABLATION_SUITE_SIZE = 75;

/**
 * §7's primary bypass-defense margin, in whole queries: PASS requires the
 * graph-handoff arm to beat the no-subgraph null arm by at least this many
 * of the 75 paired queries.
 */
export const ABLATION_DELTA1_QUERIES = 6;

/**
 * §7's secondary do-no-harm margin, in whole queries: the flag fires when
 * the null arm beats the graph-handoff arm by at least this many of the 75
 * paired queries. One query lighter than δ1 by §7's own design -- the flag
 * is a same-swing diagnostic on an already-failing primary gate, never an
 * independent detector.
 */
export const ABLATION_DELTA2_QUERIES = 5;

/**
 * The sign test's precision floor, reusing the house
 * `PAIRED_MIN_DISCORDANT_FLOOR` convention (`_paired-constants.ts`). Below
 * this many discordant pairs, the sign test reports UNDERPOWERED as its own
 * result -- a precision statement, never a significance verdict -- and this
 * floor governs the sign test's own output only. It never blocks or alters
 * the primary margin gate above, which is evaluated on the raw paired hit
 * counts regardless of the discordant-pair count (G-18).
 */
export const ABLATION_MIN_DISCORDANT_FLOOR = 20;

/**
 * §7's own pinned n_d 20-75 sign-test critical-value table, transcribed
 * verbatim from the frozen design (`23-PATTERNS.md`'s verbatim block, which
 * is itself transcribed from `COLLAB-DESIGN.md:604-617`). A lookup, never a
 * live computation -- `test/collaborative-ablation-gate.test.ts`'s G-15 case
 * mechanically re-derives every one of these 56 rows in exact BigInt
 * arithmetic from §7's own combinatorial condition: the smallest integer c
 * such that 40 · Σ_{i=c}^{n_d} C(n_d, i) ≤ 2^{n_d}.
 */
export const ABLATION_CRITICAL_VALUE_TABLE: Readonly<Record<number, number>> = {
  20: 15, 21: 16, 22: 17, 23: 17, 24: 18,
  25: 18, 26: 19, 27: 20, 28: 20, 29: 21,
  30: 21, 31: 22, 32: 23, 33: 23, 34: 24,
  35: 24, 36: 25, 37: 25, 38: 26, 39: 27,
  40: 27, 41: 28, 42: 28, 43: 29, 44: 29,
  45: 30, 46: 31, 47: 31, 48: 32, 49: 32,
  50: 33, 51: 33, 52: 34, 53: 35, 54: 35,
  55: 36, 56: 36, 57: 37, 58: 37, 59: 38,
  60: 39, 61: 39, 62: 40, 63: 40, 64: 41,
  65: 41, 66: 42, 67: 42, 68: 43, 69: 44,
  70: 44, 71: 45, 72: 45, 73: 46, 74: 46,
  75: 47,
};

/**
 * The sign test's four-way result taxonomy. `GRAPH-SUPERIOR`/`NULL-SUPERIOR`
 * mirror `_paired-gate.ts`'s `W-SUPERIOR`/`B-SUPERIOR` convention exactly;
 * `INDISTINGUISHABLE` and `UNDERPOWERED` (G-18's precision floor result) are
 * their own named members, never collapsed into a null/undefined field.
 */
export const ABLATION_SIGN_TEST_RESULTS = [
  "GRAPH-SUPERIOR",
  "NULL-SUPERIOR",
  "INDISTINGUISHABLE",
  "UNDERPOWERED",
] as const;
export type AblationSignTestResult = (typeof ABLATION_SIGN_TEST_RESULTS)[number];

/**
 * Every key of `AblationSignTestResult`'s own union, assigned to a
 * `Record<AblationSignTestResult, true>` literal -- the same
 * excess/missing-property exhaustiveness idiom `collaborative-runner.ts`
 * uses for `ALL_HANDOFF_OUTCOME_KINDS`: a member added to
 * `ABLATION_SIGN_TEST_RESULTS` without a matching key here, or a stray key
 * matching no member, is a typecheck failure.
 */
const ALL_ABLATION_SIGN_TEST_RESULTS: Record<AblationSignTestResult, true> = {
  "GRAPH-SUPERIOR": true,
  "NULL-SUPERIOR": true,
  INDISTINGUISHABLE: true,
  UNDERPOWERED: true,
};

// ── Data shapes ──────────────────────────────────────────────────────────

export interface AblationPairedUnit {
  queryId: number;
  /**
   * The graph-handoff arm's hit value for this query, 0 or 1. A
   * non-completion on this arm (agent failure, timeout, malformed output)
   * is recorded here as 0 -- counted in the denominator, never excluded.
   * §7's non-completion paragraph: silent exclusion would let the
   * graph-handoff arm's own failures shrink the effective sample and bias
   * the paired comparison in its own favour.
   */
  graphHit1: number;
  /** Same non-completion-as-0 discipline as `graphHit1`, for the
   *  no-subgraph null arm. */
  nullHit1: number;
}

export interface AblationPairedCounts {
  pairs: number;
  graphHits: number;
  nullHits: number;
  bothHit: number;
  bothMiss: number;
  graphOnlyHits: number;
  nullOnlyHits: number;
  discordant: number;
}

export interface AblationSignTest {
  discordant: number;
  /** `null` exactly when `result` is `"UNDERPOWERED"`. */
  criticalValue: number | null;
  graphOnlyHits: number;
  result: AblationSignTestResult;
}

export interface AblationGateVerdict {
  primaryPass: boolean;
  secondaryFlag: boolean;
  delta1: number;
  delta2: number;
  primaryDifference: number;
  secondaryDifference: number;
  counts: AblationPairedCounts;
  signTest: AblationSignTest;
}

// ── Guards ───────────────────────────────────────────────────────────────

function requireWholeNonNegative(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new CollaborativeAblationGateError(
      `${name} must be a non-negative integer, got ${JSON.stringify(value)}`,
    );
  }
}

// ── Accounting ───────────────────────────────────────────────────────────

/**
 * Refuses anything but exactly `ABLATION_SUITE_SIZE` paired units with
 * unique query ids and 0/1 hit values on both arms -- a partial run cannot
 * produce a verdict (§7's non-completion paragraph is the caller's
 * responsibility: a non-completion must already have been recorded as a 0
 * before it reaches this function).
 */
export function accountAblationUnits(units: AblationPairedUnit[]): AblationPairedCounts {
  if (units.length !== ABLATION_SUITE_SIZE) {
    throw new CollaborativeAblationGateError(
      `expected exactly ${ABLATION_SUITE_SIZE} paired units (§7's evaluation suite), got ` +
        `${units.length} -- a partial run cannot produce a verdict`,
    );
  }

  const seenQueryIds = new Set<number>();
  let graphHits = 0;
  let nullHits = 0;
  let bothHit = 0;
  let bothMiss = 0;
  let graphOnlyHits = 0;
  let nullOnlyHits = 0;

  for (const unit of units) {
    requireWholeNonNegative(unit.queryId, "queryId");
    if (seenQueryIds.has(unit.queryId)) {
      throw new CollaborativeAblationGateError(
        `duplicate queryId ${unit.queryId} -- every paired unit must have a unique query id`,
      );
    }
    seenQueryIds.add(unit.queryId);

    if (unit.graphHit1 !== 0 && unit.graphHit1 !== 1) {
      throw new CollaborativeAblationGateError(
        `queryId ${unit.queryId}: graphHit1 must be exactly 0 or 1, got ${JSON.stringify(unit.graphHit1)}`,
      );
    }
    if (unit.nullHit1 !== 0 && unit.nullHit1 !== 1) {
      throw new CollaborativeAblationGateError(
        `queryId ${unit.queryId}: nullHit1 must be exactly 0 or 1, got ${JSON.stringify(unit.nullHit1)}`,
      );
    }

    if (unit.graphHit1 === 1) graphHits++;
    if (unit.nullHit1 === 1) nullHits++;

    if (unit.graphHit1 === 1 && unit.nullHit1 === 1) bothHit++;
    else if (unit.graphHit1 === 0 && unit.nullHit1 === 0) bothMiss++;
    else if (unit.graphHit1 === 1 && unit.nullHit1 === 0) graphOnlyHits++;
    else nullOnlyHits++;
  }

  return {
    pairs: units.length,
    graphHits,
    nullHits,
    bothHit,
    bothMiss,
    graphOnlyHits,
    nullOnlyHits,
    discordant: graphOnlyHits + nullOnlyHits,
  };
}

// ── Sign test ────────────────────────────────────────────────────────────

/**
 * §7's exact discordant-pairs sign test, reported as diagnostic context
 * around the pre-specified practical margins -- never as the verdict
 * itself. Outcome-first dispatch: below `ABLATION_MIN_DISCORDANT_FLOOR`,
 * the underpowered result is returned immediately, before any table lookup
 * (G-18).
 */
export function evaluateAblationSignTest(counts: AblationPairedCounts): AblationSignTest {
  const { discordant, graphOnlyHits } = counts;
  requireWholeNonNegative(discordant, "discordant");
  requireWholeNonNegative(graphOnlyHits, "graphOnlyHits");

  if (discordant < ABLATION_MIN_DISCORDANT_FLOOR) {
    return { discordant, criticalValue: null, graphOnlyHits, result: "UNDERPOWERED" };
  }

  if (discordant > ABLATION_SUITE_SIZE) {
    throw new CollaborativeAblationGateError(
      `discordant count ${discordant} outside the pinned critical-value table's own range ` +
        `[${ABLATION_MIN_DISCORDANT_FLOOR}, ${ABLATION_SUITE_SIZE}]`,
    );
  }

  const c = ABLATION_CRITICAL_VALUE_TABLE[discordant];
  if (c === undefined) {
    throw new CollaborativeAblationGateError(`no pinned critical value for discordant count ${discordant}`);
  }

  let result: AblationSignTestResult;
  if (graphOnlyHits >= c) {
    result = "GRAPH-SUPERIOR";
  } else if (graphOnlyHits <= discordant - c) {
    result = "NULL-SUPERIOR";
  } else {
    result = "INDISTINGUISHABLE";
  }

  return { discordant, criticalValue: c, graphOnlyHits, result };
}

// ── The gate ─────────────────────────────────────────────────────────────

/**
 * §7's full ablation-gate evaluation: accounting, both margin inequalities,
 * and the sign test, assembled into one JSON-serialisable verdict object
 * (no function or class instance anywhere in it) so the round driver can
 * embed it directly in the verdict artifact.
 */
export function evaluateAblationGate(units: AblationPairedUnit[]): AblationGateVerdict {
  const counts = accountAblationUnits(units);

  const primaryDifference = counts.graphHits - counts.nullHits;
  const secondaryDifference = counts.nullHits - counts.graphHits;

  // Both inclusive (>=) because §7's boundary paragraph defines the
  // on-margin case as clearing/triggering, not falling short -- and the
  // comparison is on whole-query counts (graphHits/nullHits), never the
  // derived percentage-point rate figures (8.0pp / ~6.7pp), which are
  // display-only and belong to the report renderer, not this module.
  const primaryPass = primaryDifference >= ABLATION_DELTA1_QUERIES;
  // Computed after and independently of primaryPass above -- nothing here
  // lets the secondary flag feed back into the primary field. Same
  // inclusive/integer-count discipline as the primary comparison.
  const secondaryFlag = secondaryDifference >= ABLATION_DELTA2_QUERIES;

  const signTest = evaluateAblationSignTest(counts);

  return {
    primaryPass,
    secondaryFlag,
    delta1: ABLATION_DELTA1_QUERIES,
    delta2: ABLATION_DELTA2_QUERIES,
    primaryDifference,
    secondaryDifference,
    counts,
    signTest,
  };
}
