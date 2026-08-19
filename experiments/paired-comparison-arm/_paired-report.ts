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

const TERMINATION_CLAUSE_NAMES: Record<Exclude<PairedStudyOutcome, "COMPLETE">, string> = {
  "TERMINATED-HEALTH-GATE-FAILED": "Clause 1 (instrument-health gate)",
  "TERMINATED-UNDERPOWERED": "Clause 2 (minimum discordant-pairs floor)",
  "TERMINATED-DROP-BUDGET-BREACHED": "Clause 3 (per-arm drop-budget ceiling)",
};

/**
 * §8 item 3's dominant-failure-mode ceiling, evaluated as an integer
 * cross-multiplication — never a live float: an arm breaches when its
 * mismatch count multiplied by the pinned denominator is at least its own
 * scoreable-attempt count (mismatch plus match, the two unscoreable
 * categories excluded) multiplied by the pinned numerator. An arm with zero
 * scoreable attempts cannot be evaluated against a rate and never breaches.
 */
function armBreachesDominantFailureMode(counts: PairedArmCategoryCounts): boolean {
  const mismatch = counts["resolution-mismatch"];
  const scoreable = counts["resolution-mismatch"] + counts["resolution-match"];
  if (scoreable === 0) return false;
  return mismatch * PAIRED_DOMINANT_FAILURE_MODE_CEILING_DEN >= scoreable * PAIRED_DOMINANT_FAILURE_MODE_CEILING_NUM;
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
): string {
  const lines: string[] = [];

  lines.push("# Paired-comparison round — results (REQ-69)");
  lines.push("");
  lines.push(
    "This report executes under the 2026-08-11 human override as v1.25.0 human-directed follow-on " +
      "work. It is explicitly NOT a Stage-B trigger outcome and does not disturb the v1.24.0 " +
      "milestone record.",
  );
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

  if (verdict.outcome !== "COMPLETE") {
    const clause = TERMINATION_CLAUSE_NAMES[verdict.outcome];
    lines.push("## Verdict");
    lines.push("");
    lines.push(`TERMINATED (${verdict.outcome}) — ${clause} was breached. The decision rule (§5) was NEVER EVALUATED.`);
    lines.push("");
    return lines.join("\n");
  }

  const c = PAIRED_CRITICAL_VALUE_TABLE[accounting.discordantCount]!;
  lines.push(
    `Discordant count n_d=${accounting.discordantCount}; win count k_w=${accounting.winCount}; ` +
      `looked-up critical value c(n_d)=${c}; W-superior bound (k_w>=c) is ${c}; B-superior bound ` +
      `(k_w<=n_d-c) is ${accounting.discordantCount - c}.`,
  );
  lines.push("");

  const breachW = armBreachesDominantFailureMode(accounting.armW);
  const breachB = armBreachesDominantFailureMode(accounting.armB);

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
    if (verdict.decision === "INDISTINGUISHABLE" && accounting.discordantCount <= PAIRED_NEAR_FLOOR_EVIDENTIAL_WEIGHT_BOUND) {
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
        `(mismatch times ${PAIRED_DOMINANT_FAILURE_MODE_CEILING_DEN} at or above scoreable times ` +
        `${PAIRED_DOMINANT_FAILURE_MODE_CEILING_NUM}) — this paired comparison may be uninformative ` +
        `regardless of the verdict stated above.`,
    );
  }

  lines.push(verdictLines.join(" "));
  lines.push("");

  return lines.join("\n");
}
