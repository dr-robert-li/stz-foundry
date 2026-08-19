import { describe, it, expect } from "vitest";
import { renderPairedResultsReport, type PairedReportUnitRecord } from "../experiments/paired-comparison-arm/_paired-report.js";
import { evaluatePairedGate, type PairedAccounting, type PairedArmCategoryCounts, type PairedGateVerdict, type PairedBlockClassification } from "../experiments/paired-comparison-arm/_paired-gate.js";
import { PAIRED_SEEDS, PAIRED_CRITICAL_VALUE_TABLE } from "../experiments/paired-comparison-arm/_paired-constants.js";

// Plan 14-03, Task 3 (REQ-69). Covers all eight behaviors §6/§7/§8 pin for
// the results report, boundary-tested from both sides on the
// dominant-failure-mode threshold.

function categoryCounts(overrides: Partial<PairedArmCategoryCounts> = {}): PairedArmCategoryCounts {
  return {
    "no-artifact": 0,
    "non-scoreable": 0,
    "resolution-mismatch": 0,
    "resolution-match": 0,
    ...overrides,
  };
}

function emptyBlocks() {
  return PAIRED_SEEDS.map((seed) => ({ seed, discordantWins: 0, discordantLosses: 0 }));
}

function baseAccounting(overrides: Partial<PairedAccounting> = {}): PairedAccounting {
  return {
    armW: categoryCounts(),
    armB: categoryCounts(),
    winCount: 0,
    lossCount: 0,
    tieCount: 0,
    discordantCount: 0,
    blocks: emptyBlocks(),
    ...overrides,
  };
}

function unit(arm: "W" | "B", unitId: string): PairedReportUnitRecord {
  return { unitId, arm, status: "ok", oracleCategory: "resolution-match", score: 1 };
}

describe("renderPairedResultsReport", () => {
  it("appends the oracle-discrimination caveat when one arm's mismatch count reaches nine tenths of its own scoreable attempts (boundary, at threshold)", () => {
    const accounting = baseAccounting({
      armW: categoryCounts({ "resolution-mismatch": 9, "resolution-match": 1 }), // 9/10 = exactly at threshold
      armB: categoryCounts({ "resolution-mismatch": 1, "resolution-match": 9 }),
      discordantCount: 20,
      winCount: 10,
    });
    const verdict: PairedGateVerdict = { outcome: "COMPLETE", decision: "INDISTINGUISHABLE", reason: "test" };
    const report = renderPairedResultsReport(verdict, accounting, []);
    expect(report).toContain("ORACLE-DISCRIMINATION CAVEAT");
  });

  it("omits the caveat one unit below the threshold on both arms", () => {
    const accounting = baseAccounting({
      armW: categoryCounts({ "resolution-mismatch": 8, "resolution-match": 2 }), // 8*10=80 < 10*9=90
      armB: categoryCounts({ "resolution-mismatch": 8, "resolution-match": 2 }),
      discordantCount: 20,
      winCount: 10,
    });
    const verdict: PairedGateVerdict = { outcome: "COMPLETE", decision: "INDISTINGUISHABLE", reason: "test" };
    const report = renderPairedResultsReport(verdict, accounting, []);
    expect(report).not.toContain("ORACLE-DISCRIMINATION CAVEAT");
  });

  it("contains a six-row concordance table, one row per seed block, with each block's classification", () => {
    const blocks = PAIRED_SEEDS.map((seed, i) => ({ seed, discordantWins: i, discordantLosses: 0 }));
    const accounting = baseAccounting({ blocks, discordantCount: 15, winCount: 15 });
    const verdict: PairedGateVerdict = { outcome: "COMPLETE", decision: "W-SUPERIOR", reason: "test" };
    const report = renderPairedResultsReport(verdict, accounting, []);
    for (const seed of PAIRED_SEEDS) {
      expect(report).toContain(`| ${seed} |`);
    }
    expect(report).toContain("block-tied"); // block 0 has 0 wins, 0 losses
    expect(report).toContain("W-majority");
  });

  it("shows the sign-test arithmetic — discordant count, win count, critical value, and both boundaries — not only the verdict", () => {
    const nd = 30;
    const c = PAIRED_CRITICAL_VALUE_TABLE[nd]!;
    const accounting = baseAccounting({ discordantCount: nd, winCount: c });
    const verdict: PairedGateVerdict = { outcome: "COMPLETE", decision: "W-SUPERIOR", reason: "test" };
    const report = renderPairedResultsReport(verdict, accounting, []);
    expect(report).toContain(`n_d=${nd}`);
    expect(report).toContain(`k_w=${c}`);
    expect(report).toContain(`c(n_d)=${c}`);
    expect(report).toContain(String(nd - c)); // B-superior bound
  });

  it("states the tie count regardless of outcome (completion and termination alike)", () => {
    const completeAcc = baseAccounting({ tieCount: 7, discordantCount: 20, winCount: 15 });
    const completeVerdict: PairedGateVerdict = { outcome: "COMPLETE", decision: "W-SUPERIOR", reason: "test" };
    expect(renderPairedResultsReport(completeVerdict, completeAcc, [])).toContain("7");

    const termAcc = baseAccounting({ tieCount: 3 });
    const termVerdict: PairedGateVerdict = { outcome: "TERMINATED-UNDERPOWERED", reason: "test" };
    expect(renderPairedResultsReport(termVerdict, termAcc, [])).toContain("3");
  });

  it("on a termination outcome, names which clause terminated the study and states the decision rule was never evaluated", () => {
    const accounting = baseAccounting();
    for (const [outcome, expectedClause] of [
      ["TERMINATED-UNDERPOWERED", "Clause 2"],
      ["TERMINATED-HEALTH-GATE-FAILED", "Clause 1"],
      ["TERMINATED-DROP-BUDGET-BREACHED", "Clause 3"],
    ] as const) {
      const verdict: PairedGateVerdict = { outcome, reason: "test" };
      const report = renderPairedResultsReport(verdict, accounting, []);
      expect(report).toContain(expectedClause);
      expect(report).toMatch(/NEVER EVALUATED/);
    }
  });

  it("on a null verdict, states the clauses were met and the rule was evaluated, and attaches the near-the-floor caveat when n_d is in the low twenties", () => {
    const lowAcc = baseAccounting({ discordantCount: 22, winCount: 15 });
    const lowVerdict: PairedGateVerdict = { outcome: "COMPLETE", decision: "INDISTINGUISHABLE", reason: "test" };
    const lowReport = renderPairedResultsReport(lowVerdict, lowAcc, []);
    expect(lowReport).toMatch(/clauses were met.*rule was evaluated/s);
    expect(lowReport).toContain("Near-the-floor evidential-weight caveat");

    const highAcc = baseAccounting({ discordantCount: 60, winCount: 30 });
    const highVerdict: PairedGateVerdict = { outcome: "COMPLETE", decision: "INDISTINGUISHABLE", reason: "test" };
    const highReport = renderPairedResultsReport(highVerdict, highAcc, []);
    expect(highReport).not.toContain("Near-the-floor evidential-weight caveat");
  });

  it("states the v1.25.0 human-override framing in its own text", () => {
    const accounting = baseAccounting();
    const verdict: PairedGateVerdict = { outcome: "TERMINATED-UNDERPOWERED", reason: "test" };
    const report = renderPairedResultsReport(verdict, accounting, []);
    expect(report).toContain("v1.25.0");
    expect(report).toContain("2026-08-11");
    expect(report).toMatch(/NOT a Stage-B trigger/);
    expect(report).toContain("v1.24.0");
  });

  it("shows each arm's mismatch rate, as computed arithmetic, on both a completed and a terminated outcome (15-09, REQ-72)", () => {
    const accounting = baseAccounting({
      armW: categoryCounts({ "resolution-mismatch": 10, "resolution-match": 75 }),
      armB: categoryCounts({ "resolution-mismatch": 10, "resolution-match": 73 }),
    });
    const termVerdict: PairedGateVerdict = { outcome: "TERMINATED-UNDERPOWERED", reason: "test" };
    const termReport = renderPairedResultsReport(termVerdict, accounting, []);
    expect(termReport).toContain("Arm W mismatch rate: 10/85 (11.8%)");
    expect(termReport).toContain("Arm B mismatch rate: 10/83 (12.0%)");

    const completeAcc = baseAccounting({ ...accounting, discordantCount: 20, winCount: 15 });
    const completeVerdict: PairedGateVerdict = { outcome: "COMPLETE", decision: "W-SUPERIOR", reason: "test" };
    const completeReport = renderPairedResultsReport(completeVerdict, completeAcc, []);
    expect(completeReport).toContain("Arm W mismatch rate: 10/85 (11.8%)");
  });

  it("reports an undefined mismatch rate rather than dividing by zero when an arm has no scoreable attempts", () => {
    const accounting = baseAccounting();
    const verdict: PairedGateVerdict = { outcome: "TERMINATED-HEALTH-GATE-FAILED", reason: "test" };
    const report = renderPairedResultsReport(verdict, accounting, []);
    expect(report).toContain("Arm W mismatch rate: undefined (zero scoreable attempts).");
  });

  it("overrides the title and intro paragraph when supplied, without disturbing the rev-2 default for callers that pass nothing (15-09, REQ-72)", () => {
    const accounting = baseAccounting();
    const verdict: PairedGateVerdict = { outcome: "TERMINATED-UNDERPOWERED", reason: "test" };
    const report = renderPairedResultsReport(verdict, accounting, [], {
      title: "# Rev-3 report",
      introParagraph: "Custom rev-3 framing paragraph.",
    });
    expect(report).toContain("# Rev-3 report");
    expect(report).toContain("Custom rev-3 framing paragraph.");
    expect(report).not.toContain("v1.25.0");
  });

  it("the downgraded case names what the pooled verdict was downgraded from", () => {
    const blocks: PairedBlockClassification[] = ["W-majority", "W-majority", "W-majority", "B-majority", "B-majority", "block-tied"];
    const nd = 60;
    const c = PAIRED_CRITICAL_VALUE_TABLE[nd]!;
    const verdict = evaluatePairedGate("COMPLETE", nd, c, blocks);
    const accounting = baseAccounting({ discordantCount: nd, winCount: c });
    const report = renderPairedResultsReport(verdict, accounting, []);
    expect(report).toContain("downgraded from pooled W-SUPERIOR");
  });

  it("renders per-unit records before per-arm accounting, which appears before the concordance table", () => {
    const accounting = baseAccounting({ discordantCount: 20, winCount: 15 });
    const verdict: PairedGateVerdict = { outcome: "COMPLETE", decision: "W-SUPERIOR", reason: "test" };
    const units: PairedReportUnitRecord[] = [unit("W", "1301:0"), unit("B", "1301:0")];
    const report = renderPairedResultsReport(verdict, accounting, units);
    const unitIdx = report.indexOf("1301:0");
    const armAccountingIdx = report.indexOf("Per-arm accounting");
    const concordanceIdx = report.indexOf("Seed-block concordance");
    expect(unitIdx).toBeGreaterThan(-1);
    expect(unitIdx).toBeLessThan(armAccountingIdx);
    expect(armAccountingIdx).toBeLessThan(concordanceIdx);
  });
});
