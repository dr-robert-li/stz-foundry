import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DUALFIX_STAGE_B_MARGIN_NUM, DUALFIX_STAGE_B_MARGIN_DEN } from "../experiments/dualfix-study/_dualfix-arms.js";
import { evaluateStageBGate, type StudyOutcome } from "../experiments/dualfix-study/_dualfix-gate.js";

// Plan 12-05 (REQ-65/REQ-66, T-12-21..T-12-24). This test reads
// `STUDY-RESULTS.md`'s pinned Stage-B table off disk, reads the source
// artifact the table names, and asserts all three — the document, the
// artifact, and the imported frozen margin constants — agree. No numeral
// for the margin, the error budget, or the corpus bounds is retyped here;
// every one is imported. A missing document, a missing artifact, or an
// unparseable table row throws — there is no skip path and no default that
// lets this suite pass without reading both files.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const STUDY_RESULTS_REL_PATH = "experiments/dualfix-study/STUDY-RESULTS.md";
const ARTIFACT_DIR = "experiments/dualfix-study";

// readFileSync with no try/catch: a missing document must fail this suite
// loudly, not be swallowed into a skip.
const reportText = readFileSync(join(repoRoot, STUDY_RESULTS_REL_PATH), "utf8");

const STAGE_B_ROW_LABELS = ["source", "outcome", "kD", "kC", "n", "lhs", "rhs", "verdict", "branch"] as const;
type StageBRowLabel = (typeof STAGE_B_ROW_LABELS)[number];

/**
 * Parses one pinned two-column `| label | value |` row for `label` out of
 * the `## Stage-B gate evaluation` section. Throws a named error — never
 * returns a default — when the row is absent, so a dropped row fails the
 * suite instead of silently reading as `undefined`.
 */
function extractStageBRow(text: string, label: StageBRowLabel): string {
  const heading = "## Stage-B gate evaluation";
  const start = text.indexOf(heading);
  if (start === -1) {
    throw new Error(`[results-sync] "${heading}" heading not found in ${STUDY_RESULTS_REL_PATH}`);
  }
  const section = text.slice(start);
  const pattern = new RegExp(`^\\|\\s*${label}\\s*\\|\\s*(.+?)\\s*\\|\\s*$`, "m");
  const match = section.match(pattern);
  if (!match || match[1] === undefined) {
    throw new Error(`[results-sync] Stage-B table row missing for label "${label}" in ${STUDY_RESULTS_REL_PATH}`);
  }
  return match[1];
}

function parseStageBTable(text: string): Record<StageBRowLabel, string> {
  const rows = {} as Record<StageBRowLabel, string>;
  for (const label of STAGE_B_ROW_LABELS) {
    rows[label] = extractStageBRow(text, label);
  }
  return rows;
}

const doc = parseStageBTable(reportText);

// The named source artifact — read off disk, never trusted from the
// document's own transcription. A missing/renamed artifact throws here,
// failing the suite rather than skipping it.
const artifactPath = join(repoRoot, ARTIFACT_DIR, doc.source);
const artifactText = readFileSync(artifactPath, "utf8");
const artifact = JSON.parse(artifactText) as {
  outcome: StudyOutcome;
  arms?: Record<string, { attempted: number; repaired: number; okRepairRate: { num: number; den: number } }>;
};

function parseIntStrict(value: string, name: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`[results-sync] expected "${name}" to be a bare integer, got ${JSON.stringify(value)}`);
  }
  return Number.parseInt(value, 10);
}

describe("DUALFIX STUDY-RESULTS.md <-> verdict artifact <-> pinned constants drift guard (T-12-21..T-12-24)", () => {
  it("parses all nine pinned Stage-B table rows", () => {
    for (const label of STAGE_B_ROW_LABELS) {
      expect(doc[label], `row "${label}"`).toBeDefined();
    }
  });

  it("the document's outcome equals the named source artifact's own outcome field", () => {
    expect(doc.outcome).toBe(artifact.outcome);
  });

  if (artifact.outcome === "COMPLETE") {
    const arms = artifact.arms;
    const armDualfix = arms?.dualfix;
    const armNaiveRetry = arms?.["naive-retry"];
    if (!armDualfix || !armNaiveRetry) {
      throw new Error(`[results-sync] artifact ${doc.source} records outcome COMPLETE but has no arms.dualfix/naive-retry`);
    }
    const artifactKD = armDualfix.repaired;
    const artifactKC = armNaiveRetry.repaired;
    const artifactN = armDualfix.attempted;

    it("the shared-n assumption holds: both arms' attempted counts agree in the artifact", () => {
      expect(armNaiveRetry.attempted).toBe(artifactN);
    });

    it("the document's kD, kC and n equal the artifact's dualfix repaired, naive-retry repaired, and shared attempted count", () => {
      expect(parseIntStrict(doc.kD, "kD")).toBe(artifactKD);
      expect(parseIntStrict(doc.kC, "kC")).toBe(artifactKC);
      expect(parseIntStrict(doc.n, "n")).toBe(artifactN);
    });

    it("the document's lhs equals the imported margin denominator times (kD - kC), and rhs equals the imported margin numerator times n", () => {
      const kD = parseIntStrict(doc.kD, "kD");
      const kC = parseIntStrict(doc.kC, "kC");
      const n = parseIntStrict(doc.n, "n");
      expect(parseIntStrict(doc.lhs, "lhs")).toBe(DUALFIX_STAGE_B_MARGIN_DEN * (kD - kC));
      expect(parseIntStrict(doc.rhs, "rhs")).toBe(DUALFIX_STAGE_B_MARGIN_NUM * n);
    });

    it("feeding the artifact's own numbers to evaluateStageBGate reproduces exactly the verdict and branch the document states", () => {
      const expected = evaluateStageBGate(artifact.outcome, artifactKD, artifactKC, artifactN);
      expect(doc.verdict).toBe(expected.verdict);
      expect(doc.branch).toBe(expected.branch);
    });

    it("the document contains both arms' ok-only rate pairs (okRepairRate), read from the artifact, never retyped", () => {
      for (const [armName, arm] of [
        ["dualfix", armDualfix],
        ["naive-retry", armNaiveRetry],
      ] as const) {
        const { num, den } = arm.okRepairRate;
        expect(reportText, `okRepairRate for ${armName}`).toContain(`${num}/${den}`);
      }
    });
  } else {
    it("on a non-COMPLETE outcome, the document's kD/kC/n/lhs/rhs are all the em-dash placeholder", () => {
      for (const label of ["kD", "kC", "n", "lhs", "rhs"] as const) {
        expect(doc[label], `row "${label}"`).toBe("—");
      }
    });

    it("on a non-COMPLETE outcome, the document's verdict is NOT-EVALUATED and branch is MILESTONE CLOSING", () => {
      expect(doc.verdict).toBe("NOT-EVALUATED");
      expect(doc.branch).toBe("MILESTONE CLOSING");
    });

    it("feeding the artifact's own outcome to evaluateStageBGate reproduces NOT-EVALUATED / MILESTONE CLOSING regardless of counts", () => {
      const expected = evaluateStageBGate(artifact.outcome, 0, 0, 0);
      expect(doc.verdict).toBe(expected.verdict);
      expect(doc.branch).toBe(expected.branch);
    });
  }

  it("the document carries the substance-not-name standing-bars phrasing, naming both barred verticals", () => {
    expect(reportText).toMatch(/substance[, ]+not name/i);
    expect(reportText).toContain("data-ops");
    expect(reportText).toContain("bi-analytics");
  });

  it("the document contains no percentage-formatted repair rate (the gate's inputs are integer pairs, never rounded)", () => {
    expect(reportText).not.toMatch(/\d+(\.\d+)?\s*%/);
  });
});
