/**
 * The paired-round decision gate (Phase 14 — Instrument build, Plan 14-03,
 * REQ-69; `PAIRED-DESIGN-PREREG.md` rev 2 §5/§6/§7 — FROZEN, the
 * pre-registration of record for this whole module). A pure, side-effect-free
 * lookup — no environment reads, no filesystem access, no clock, no
 * randomness, no division, no decimal literal, and no call into any maths
 * library anywhere in this module. Every numeral this module compares
 * against imports from `_paired-constants.ts`; nothing here is retyped, and
 * nothing here is imported from the driver (`_paired-arms.ts` or any later
 * plan's driver file) — this module is evaluated from plain accounting
 * inputs only.
 *
 * Mirrors `_dualfix-gate.ts`'s own pure-evaluator shape: an outcome, a
 * lookup against a design-time-pinned table, and a plain integer comparison
 * — never a live significance computation.
 */
import {
  PAIRED_BATTERY_SIZE,
  PAIRED_MIN_DISCORDANT_FLOOR,
  PAIRED_CRITICAL_VALUE_TABLE,
  PAIRED_CONCORDANCE_BLOCK_COUNT,
  PAIRED_CONCORDANCE_AGREE_THRESHOLD,
  PAIRED_SEEDS,
} from "./_paired-constants.js";

// ── §7 — the four-way outcome, spelled exactly as §7 names it ──────────────

export const PAIRED_STUDY_OUTCOMES = [
  "COMPLETE",
  "TERMINATED-UNDERPOWERED",
  "TERMINATED-HEALTH-GATE-FAILED",
  "TERMINATED-DROP-BUDGET-BREACHED",
] as const;
export type PairedStudyOutcome = (typeof PAIRED_STUDY_OUTCOMES)[number];
const KNOWN_OUTCOMES: ReadonlySet<string> = new Set(PAIRED_STUDY_OUTCOMES);

// ── §5 — the three-way decision, populated only on completion ──────────────

export const PAIRED_DECISIONS = ["W-SUPERIOR", "B-SUPERIOR", "INDISTINGUISHABLE"] as const;
export type PairedDecision = (typeof PAIRED_DECISIONS)[number];

// ── §5 — the three seed-block classifications ───────────────────────────────

export const PAIRED_BLOCK_CLASSIFICATIONS = ["W-majority", "B-majority", "block-tied"] as const;
export type PairedBlockClassification = (typeof PAIRED_BLOCK_CLASSIFICATIONS)[number];

/**
 * §5: "each of the six seed-blocks is independently classified from its own
 * ten pairing units' discordant win/loss count as W-majority, B-majority, or
 * block-tied". A block with zero discordant pairs is an equal split (both
 * counts zero) and therefore classifies block-tied by the same rule that
 * classifies any other equal split — it never agrees with either direction.
 */
export function classifyBlock(discordantWins: number, discordantLosses: number): PairedBlockClassification {
  requireValidCount(discordantWins, "discordantWins");
  requireValidCount(discordantLosses, "discordantLosses");
  if (discordantWins === discordantLosses) return "block-tied";
  return discordantWins > discordantLosses ? "W-majority" : "B-majority";
}

export interface PairedGateVerdict {
  outcome: PairedStudyOutcome;
  /** Populated only when `outcome === "COMPLETE"`. */
  decision?: PairedDecision;
  /** Populated only when the block-concordance check downgraded a pooled
   *  W-SUPERIOR/B-SUPERIOR to INDISTINGUISHABLE — the direction it was
   *  downgraded from. */
  downgradedFrom?: PairedDecision;
  reason: string;
}

function requireValidCount(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`[paired-gate] ${name} must be a non-negative integer, got ${JSON.stringify(value)}`);
  }
}

/**
 * §5's pinned integer decision rule, evaluated exactly once from a
 * completed artifact's own final counts — never from wall-clock or partial
 * progress. On a non-completing outcome (§7), the decision rule is NEVER
 * EVALUATED: this function returns the termination verdict immediately,
 * with no `decision` field populated at all.
 *
 * On completion, `c(n_d)` is looked up in the pinned table — a lookup,
 * never a computation. Both decision boundaries are inclusive by the
 * design's own symmetric construction. If the pooled comparison reads
 * INDISTINGUISHABLE, this function returns immediately (§5: a pooled null
 * verdict is never upgraded by any block pattern, so the concordance check
 * below never runs against it). Otherwise, §5's required block-level
 * concordance check counts how many of the six blocks agree with the
 * pooled direction; below the pinned threshold, the reported decision
 * downgrades to INDISTINGUISHABLE, carrying what it was downgraded from.
 * THIS CHECK CAN ONLY DOWNGRADE, NEVER UPGRADE — a pooled W-SUPERIOR or
 * B-SUPERIOR can fall to INDISTINGUISHABLE here; INDISTINGUISHABLE can
 * never rise to either superior verdict by block agreement alone.
 */
export function evaluatePairedGate(
  outcome: PairedStudyOutcome,
  discordantCount: number,
  winCount: number,
  blocks: readonly PairedBlockClassification[],
): PairedGateVerdict {
  if (!KNOWN_OUTCOMES.has(outcome)) {
    throw new Error(`[paired-gate] unrecognised outcome ${JSON.stringify(outcome)}`);
  }

  if (outcome !== "COMPLETE") {
    return {
      outcome,
      reason: `§7 firing discipline: the decision rule is never evaluated on a non-completing outcome (${outcome})`,
    };
  }

  requireValidCount(discordantCount, "discordantCount");
  requireValidCount(winCount, "winCount");
  if (discordantCount < PAIRED_MIN_DISCORDANT_FLOOR || discordantCount > PAIRED_BATTERY_SIZE) {
    throw new Error(
      `[paired-gate] discordantCount ${discordantCount} outside the pinned critical-value table's own range ` +
        `[${PAIRED_MIN_DISCORDANT_FLOOR}, ${PAIRED_BATTERY_SIZE}]`,
    );
  }
  if (winCount > discordantCount) {
    throw new Error(`[paired-gate] winCount ${winCount} cannot exceed discordantCount ${discordantCount}`);
  }
  if (blocks.length !== PAIRED_CONCORDANCE_BLOCK_COUNT) {
    throw new Error(
      `[paired-gate] expected exactly ${PAIRED_CONCORDANCE_BLOCK_COUNT} block classifications, got ${blocks.length}`,
    );
  }

  const c = PAIRED_CRITICAL_VALUE_TABLE[discordantCount];
  if (c === undefined) {
    throw new Error(`[paired-gate] no pinned critical value for discordantCount ${discordantCount}`);
  }

  let pooled: PairedDecision;
  if (winCount >= c) {
    pooled = "W-SUPERIOR";
  } else if (winCount <= discordantCount - c) {
    pooled = "B-SUPERIOR";
  } else {
    pooled = "INDISTINGUISHABLE";
  }

  if (pooled === "INDISTINGUISHABLE") {
    return {
      outcome,
      decision: pooled,
      reason: `pooled winCount=${winCount} falls strictly between the two bounds at discordantCount=${discordantCount} — indistinguishable`,
    };
  }

  const agreeingMajority: PairedBlockClassification = pooled === "W-SUPERIOR" ? "W-majority" : "B-majority";
  const agreeing = blocks.filter((block) => block === agreeingMajority).length;

  if (agreeing < PAIRED_CONCORDANCE_AGREE_THRESHOLD) {
    return {
      outcome,
      decision: "INDISTINGUISHABLE",
      downgradedFrom: pooled,
      reason:
        `block-concordance downgrade: only ${agreeing} of ${PAIRED_CONCORDANCE_BLOCK_COUNT} blocks agree with pooled ` +
        `${pooled}, below the ${PAIRED_CONCORDANCE_AGREE_THRESHOLD}-block threshold — this check can only downgrade, never upgrade`,
    };
  }

  return {
    outcome,
    decision: pooled,
    reason:
      `pooled ${pooled} stands: ${agreeing} of ${PAIRED_CONCORDANCE_BLOCK_COUNT} blocks agree, ` +
      `meeting the ${PAIRED_CONCORDANCE_AGREE_THRESHOLD}-block threshold`,
  };
}

// ── §4 — the per-arm outcome categories, mirrored structurally so this file
// never imports the oracle module (or the driver) — any caller passing the
// oracle's own `CustomerSupportOracleCategory` values satisfies this type
// by structural equality, with no import required on either side. ─────────

export const PAIRED_ORACLE_CATEGORIES = ["no-artifact", "non-scoreable", "resolution-mismatch", "resolution-match"] as const;
export type PairedOracleCategory = (typeof PAIRED_ORACLE_CATEGORIES)[number];

function categoryScore(category: PairedOracleCategory): 0 | 1 {
  return category === "resolution-match" ? 1 : 0;
}

export type PairedArmCategoryCounts = Record<PairedOracleCategory, number>;

function zeroCategoryCounts(): PairedArmCategoryCounts {
  const counts = {} as PairedArmCategoryCounts;
  for (const category of PAIRED_ORACLE_CATEGORIES) counts[category] = 0;
  return counts;
}

export interface PairedUnitAccountingInput {
  seed: number;
  categoryW: PairedOracleCategory;
  categoryB: PairedOracleCategory;
}

export interface PairedSeedBlockCounts {
  seed: number;
  discordantWins: number;
  discordantLosses: number;
}

export interface PairedAccounting {
  armW: PairedArmCategoryCounts;
  armB: PairedArmCategoryCounts;
  winCount: number;
  lossCount: number;
  tieCount: number;
  discordantCount: number;
  /** One entry per seed-block, in `PAIRED_SEEDS` order — the driver and the
   *  report both consume this to call `classifyBlock` per block. */
  blocks: PairedSeedBlockCounts[];
}

/**
 * The per-arm and per-pair accounting function the driver and the report
 * both consume: per arm, the counts of each of the four outcome categories;
 * per battery, the win, loss and tie counts, the discordant count, and the
 * six per-block win/loss pairs. Ties are carried as their own field and
 * never folded into either side of the statistic (§5: "the tie count is
 * recorded... never silently absorbed into either the numerator or the
 * denominator of the discordant-pair statistic").
 */
export function accountPairedUnits(units: readonly PairedUnitAccountingInput[]): PairedAccounting {
  const armW = zeroCategoryCounts();
  const armB = zeroCategoryCounts();
  const blockBySeed = new Map<number, PairedSeedBlockCounts>(
    PAIRED_SEEDS.map((seed) => [seed, { seed, discordantWins: 0, discordantLosses: 0 }]),
  );

  let winCount = 0;
  let lossCount = 0;
  let tieCount = 0;

  for (const unit of units) {
    armW[unit.categoryW]++;
    armB[unit.categoryB]++;

    const block = blockBySeed.get(unit.seed);
    if (!block) {
      throw new Error(`[paired-gate] unit references seed ${unit.seed}, not one of the pinned PAIRED_SEEDS`);
    }

    const scoreW = categoryScore(unit.categoryW);
    const scoreB = categoryScore(unit.categoryB);
    if (scoreW === scoreB) {
      tieCount++;
    } else if (scoreW > scoreB) {
      winCount++;
      block.discordantWins++;
    } else {
      lossCount++;
      block.discordantLosses++;
    }
  }

  return {
    armW,
    armB,
    winCount,
    lossCount,
    tieCount,
    discordantCount: winCount + lossCount,
    blocks: PAIRED_SEEDS.map((seed) => blockBySeed.get(seed)!),
  };
}
