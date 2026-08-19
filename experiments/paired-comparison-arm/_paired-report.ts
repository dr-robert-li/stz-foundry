/**
 * The paired-round results-report writer (Phase 14 — Instrument build,
 * Plan 14-03, REQ-69; `PAIRED-DESIGN-PREREG.md` rev 2 §7/§8 items 3-4 —
 * FROZEN). A pure function from the gate's own verdict plus its accounting
 * to a markdown string — no file writes inside it, so the test needs no
 * filesystem; the caller in a later plan writes the returned string. This
 * module never re-derives a verdict of its own: it consumes exactly the
 * `PairedGateVerdict`/`PairedAccounting` values `_paired-gate.ts` produces.
 */
import {
  type PairedGateVerdict,
  type PairedAccounting,
  type PairedArmCategoryCounts,
  type PairedOracleCategory,
  type PairedStudyOutcome,
  classifyBlock,
} from "./_paired-gate.js";
import {
  PAIRED_CRITICAL_VALUE_TABLE,
  PAIRED_DOMINANT_FAILURE_MODE_CEILING_NUM,
  PAIRED_DOMINANT_FAILURE_MODE_CEILING_DEN,
  PAIRED_NEAR_FLOOR_EVIDENTIAL_WEIGHT_BOUND,
} from "./_paired-constants.js";

export interface PairedReportUnitRecord {
  unitId: string;
  arm: "W" | "B";
  status: "ok" | "timeout" | "error";
  oracleCategory: PairedOracleCategory;
  score: 0 | 1;
}

/**
 * The battery-shape surface this module accepts as explicit input (Plan
 * 15-06, REQ-72). Every field is optional and resolves to its rev-2 pinned
 * constant when omitted, so a caller that passes nothing (every existing
 * caller) gets byte-identical output for the same verdict input. The
 * concordance table's own row count/keys follow `accounting.blocks` — that
 * shape arrives through the accounting the caller already built via
 * `_paired-gate.ts`'s own shape options, never re-supplied here.
 */
export interface PairedReportShapeOptions {
  /** `c(n_d)` lookup table — defaults to `PAIRED_CRITICAL_VALUE_TABLE`. */
  criticalValueTable?: Readonly<Record<number, number>>;
  /** §8 item 3's dominant-failure-mode ceiling numerator — defaults to
   *  `PAIRED_DOMINANT_FAILURE_MODE_CEILING_NUM`. */
  dominantFailureModeCeilingNum?: number;
  /** §8 item 3's dominant-failure-mode ceiling denominator — defaults to
   *  `PAIRED_DOMINANT_FAILURE_MODE_CEILING_DEN`. */
  dominantFailureModeCeilingDen?: number;
  /** The near-floor evidential-weight bound — defaults to
   *  `PAIRED_NEAR_FLOOR_EVIDENTIAL_WEIGHT_BOUND`. */
  nearFloorEvidentialWeightBound?: number;
  /** Report heading — defaults to the rev-2 pinned "# Paired-comparison
   *  round — results (REQ-69)" heading (Plan 15-09, REQ-72: each round
   *  states its own provenance in its own words without disturbing the
   *  rev-2 report's own pinned default). */
  title?: string;
  /** Framing paragraph directly under the heading — defaults to the rev-2
   *  pinned "2026-08-11 human override" paragraph (Plan 15-09, REQ-72). */
  introParagraph?: string;
}

const TERMINATION_CLAUSE_NAMES: Record<Exclude<PairedStudyOutcome, "COMPLETE">, string> = {
  "TERMINATED-HEALTH-GATE-FAILED": "Clause 1 (instrument-health gate)",
  "TERMINATED-UNDERPOWERED": "Clause 2 (minimum discordant-pairs floor)",
  "TERMINATED-DROP-BUDGET-BREACHED": "Clause 3 (per-arm drop-budget ceiling)",
};

/**
 * §8 item 3's dominant-failure-mode ceiling, evaluated as an integer
 * cross-multiplication — never a live float: an arm breaches when its
 * mismatch count multiplied by the supplied denominator is at least its own
 * scoreable-attempt count (mismatch plus match, the two unscoreable
 * categories excluded) multiplied by the supplied numerator. An arm with
 * zero scoreable attempts cannot be evaluated against a rate and never
 * breaches.
 */
function armBreachesDominantFailureMode(counts: PairedArmCategoryCounts, num: number, den: number): boolean {
  const mismatch = counts["resolution-mismatch"];
  const scoreable = counts["resolution-mismatch"] + counts["resolution-match"];
  if (scoreable === 0) return false;
  return mismatch * den >= scoreable * num;
}

/** Each arm's own mismatch rate over its own scoreable attempts (mismatch
 *  plus match, the two unscoreable categories excluded) — arithmetic shown,
 *  never hand-typed into a report. Rendered unconditionally (both COMPLETE
 *  and every TERMINATED-* outcome): this is plain accounting over what
 *  happened, distinct from the §8 item 3 CAVEAT itself, which stays scoped
 *  to a completed run's own decision-rule verdict per §8 item 3's own text
 *  ("alongside whatever verdict §5's decision rule produces"). */
function armMismatchRateLine(arm: "W" | "B", counts: PairedArmCategoryCounts): string {
  const mismatch = counts["resolution-mismatch"];
  const scoreable = mismatch + counts["resolution-match"];
  if (scoreable === 0) return `Arm ${arm} mismatch rate: undefined (zero scoreable attempts).`;
  const pct = ((mismatch / scoreable) * 100).toFixed(1);
  return `Arm ${arm} mismatch rate: ${mismatch}/${scoreable} (${pct}%) of its own scoreable attempts.`;
}

/**
 * Renders the paired round's results report as markdown, per §6's ordering
 * rule (per-unit records before any aggregate, aggregates before the
 * decision-rule evaluation): per-unit records, then per-arm accounting,
 * then the six-row seed-block concordance table, then the pooled sign-test
 * arithmetic, then the verdict — with the oracle-discrimination caveat
 * rendered immediately alongside the verdict, never in a footnote, once
 * either arm crosses the dominant-failure-mode ceiling.
 */
export function renderPairedResultsReport(
  verdict: PairedGateVerdict,
  accounting: PairedAccounting,
  unitRecords: readonly PairedReportUnitRecord[],
  opts: PairedReportShapeOptions = {},
): string {
  const criticalValueTable = opts.criticalValueTable ?? PAIRED_CRITICAL_VALUE_TABLE;
  const ceilingNum = opts.dominantFailureModeCeilingNum ?? PAIRED_DOMINANT_FAILURE_MODE_CEILING_NUM;
  const ceilingDen = opts.dominantFailureModeCeilingDen ?? PAIRED_DOMINANT_FAILURE_MODE_CEILING_DEN;
  const nearFloorBound = opts.nearFloorEvidentialWeightBound ?? PAIRED_NEAR_FLOOR_EVIDENTIAL_WEIGHT_BOUND;
  const title = opts.title ?? "# Paired-comparison round — results (REQ-69)";
  const introParagraph =
    opts.introParagraph ??
    "This report executes under the 2026-08-11 human override as v1.25.0 human-directed follow-on " +
      "work. It is explicitly NOT a Stage-B trigger outcome and does not disturb the v1.24.0 " +
      "milestone record.";
  const lines: string[] = [];

  lines.push(title);
  lines.push("");
  lines.push(introParagraph);
  lines.push("");

  lines.push("## Per-unit records");
  lines.push("");
  lines.push("| arm | unit id | status | category | score |");
  lines.push("|---|---|---|---|---|");
  for (const unit of unitRecords) {
    lines.push(`| ${unit.arm} | ${unit.unitId} | ${unit.status} | ${unit.oracleCategory} | ${unit.score} |`);
  }
  lines.push("");

  lines.push("## Per-arm accounting");
  lines.push("");
  lines.push("| arm | no-artifact | non-scoreable | resolution-mismatch | resolution-match |");
  lines.push("|---|---|---|---|---|");
  lines.push(
    `| W | ${accounting.armW["no-artifact"]} | ${accounting.armW["non-scoreable"]} | ` +
      `${accounting.armW["resolution-mismatch"]} | ${accounting.armW["resolution-match"]} |`,
  );
  lines.push(
    `| B | ${accounting.armB["no-artifact"]} | ${accounting.armB["non-scoreable"]} | ` +
      `${accounting.armB["resolution-mismatch"]} | ${accounting.armB["resolution-match"]} |`,
  );
  lines.push("");

  lines.push("## Seed-block concordance");
  lines.push("");
  lines.push("| seed | discordant wins (W) | discordant losses (B) | classification |");
  lines.push("|---|---|---|---|");
  for (const block of accounting.blocks) {
    const classification = classifyBlock(block.discordantWins, block.discordantLosses);
    lines.push(`| ${block.seed} | ${block.discordantWins} | ${block.discordantLosses} | ${classification} |`);
  }
  lines.push("");

  lines.push("## Pooled arithmetic");
  lines.push("");
  lines.push(`Tie count (recorded regardless of outcome, never entering the discordant numerator or denominator): ${accounting.tieCount}.`);
  lines.push("");
  lines.push(armMismatchRateLine("W", accounting.armW));
  lines.push(armMismatchRateLine("B", accounting.armB));
  lines.push("");

  if (verdict.outcome !== "COMPLETE") {
    const clause = TERMINATION_CLAUSE_NAMES[verdict.outcome];
    lines.push("## Verdict");
    lines.push("");
    lines.push(`TERMINATED (${verdict.outcome}) — ${clause} was breached. The decision rule (§5) was NEVER EVALUATED.`);
    lines.push("");
    return lines.join("\n");
  }

  const c = criticalValueTable[accounting.discordantCount]!;
  lines.push(
    `Discordant count n_d=${accounting.discordantCount}; win count k_w=${accounting.winCount}; ` +
      `looked-up critical value c(n_d)=${c}; W-superior bound (k_w>=c) is ${c}; B-superior bound ` +
      `(k_w<=n_d-c) is ${accounting.discordantCount - c}.`,
  );
  lines.push("");

  const breachW = armBreachesDominantFailureMode(accounting.armW, ceilingNum, ceilingDen);
  const breachB = armBreachesDominantFailureMode(accounting.armB, ceilingNum, ceilingDen);

  lines.push("## Verdict");
  lines.push("");

  const verdictLines: string[] = [];
  if (verdict.downgradedFrom) {
    verdictLines.push(
      `The qualification clauses were met and the decision rule was evaluated: INDISTINGUISHABLE ` +
        `(downgraded from pooled ${verdict.downgradedFrom} by the block-concordance check — ${verdict.reason}).`,
    );
  } else {
    verdictLines.push(`The qualification clauses were met and the decision rule was evaluated: ${verdict.decision}.`);
    if (verdict.decision === "INDISTINGUISHABLE" && accounting.discordantCount <= nearFloorBound) {
      verdictLines.push(
        `Near-the-floor evidential-weight caveat: n_d=${accounting.discordantCount} sits in the low twenties — this ` +
          `INDISTINGUISHABLE result carries markedly less evidential weight than one landing near the battery's full size.`,
      );
    }
  }

  if (breachW || breachB) {
    const breachingArms = [breachW ? "W" : null, breachB ? "B" : null].filter(Boolean).join(" and ");
    verdictLines.push(
      `ORACLE-DISCRIMINATION CAVEAT: ${breachingArms} reached the dominant-failure-mode ceiling ` +
        `(mismatch times ${ceilingDen} at or above scoreable times ` +
        `${ceilingNum}) — this paired comparison may be uninformative ` +
        `regardless of the verdict stated above.`,
    );
  }

  lines.push(verdictLines.join(" "));
  lines.push("");

  return lines.join("\n");
}
