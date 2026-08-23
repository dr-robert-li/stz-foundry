/**
 * The C-01 collaborative round's verdict-artifact-to-markdown renderer suite
 * (Phase 23 -- Ablation gate + powered STaRK round, Plan 23-05, REQ-81/82).
 * House rule (mirrors `test/collaborative-ablation-gate.test.ts`): every
 * throwing assertion inspects the thrown message's content, never a bare
 * `.toThrow()`.
 *
 * Task 1: a verdict object renders, gate block first -- ordering by offset,
 * the gate section's own content, no-filesystem-access (via the pinned
 * import allowlist), the completion-marker refusal, and determinism.
 * Task 2 (appended below): not-meaningful labelling, promotion refusal, and
 * the full diagnostic set.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateAblationGate,
  ABLATION_SUITE_SIZE,
  type AblationGateVerdict,
  type AblationPairedUnit,
} from "../src/foundry/collaborative-ablation-gate.js";
import { HANDOFF_OUTCOME_KINDS, type HandoffOutcomeKind } from "../src/foundry/collaborative-runner.js";
import {
  COLLAB_ROUND_OUTCOMES,
  renderCollabRoundReport,
  type CollabRoundVerdict,
  type CollabRoundOutcome,
  type CollabRoundArm,
  type CollabRoundUnitRecord,
  type CollabRoundDiagnostics,
  type CollabRoundRunConfig,
} from "../experiments/collab-round/_collab-report.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The report module's own pinned import allowlist -- sorted, exact
 *  equality. No filesystem, child-process, clock or network symbol is
 *  permitted anywhere in this list (Task 1 acceptance criteria). */
const REPORT_IMPORT_ALLOWLIST = [
  "../../src/foundry/collaborative-ablation-gate.js",
  "../../src/foundry/collaborative-runner.js",
].sort();

/**
 * Builds exactly `ABLATION_SUITE_SIZE` paired units from four named cell
 * counts, mirroring `test/collaborative-ablation-gate.test.ts`'s own
 * `buildUnits` helper, then evaluates the real gate over them -- so every
 * `AblationGateVerdict` fixture in this file is a real gate output, never a
 * hand-typed object that could drift from the gate module's actual shape.
 */
function buildGateVerdict(cells: {
  bothHit: number;
  graphOnly: number;
  nullOnly: number;
  bothMiss: number;
}): AblationGateVerdict {
  const total = cells.bothHit + cells.graphOnly + cells.nullOnly + cells.bothMiss;
  if (total !== ABLATION_SUITE_SIZE) {
    throw new Error(`[test fixture] cells sum to ${total}, expected exactly ${ABLATION_SUITE_SIZE}`);
  }
  const units: AblationPairedUnit[] = [];
  let queryId = 0;
  for (let i = 0; i < cells.bothHit; i++) units.push({ queryId: queryId++, graphHit1: 1, nullHit1: 1 });
  for (let i = 0; i < cells.graphOnly; i++) units.push({ queryId: queryId++, graphHit1: 1, nullHit1: 0 });
  for (let i = 0; i < cells.nullOnly; i++) units.push({ queryId: queryId++, graphHit1: 0, nullHit1: 1 });
  for (let i = 0; i < cells.bothMiss; i++) units.push({ queryId: queryId++, graphHit1: 0, nullHit1: 0 });
  return evaluateAblationGate(units);
}

/** Primary PASS (diff=10>=6), sign test INDISTINGUISHABLE (n_d=50 >= floor). */
const PASSING_GATE = buildGateVerdict({ bothHit: 10, graphOnly: 30, nullOnly: 20, bothMiss: 15 });
/** Primary FAIL (diff=0<6), secondary not fired (diff=0<5), n_d=30 >= floor. */
const FAILING_GATE = buildGateVerdict({ bothHit: 10, graphOnly: 15, nullOnly: 15, bothMiss: 35 });
/** Primary FAIL, n_d=10 < floor(20) -- UNDERPOWERED. */
const UNDERPOWERED_GATE = buildGateVerdict({ bothHit: 50, graphOnly: 5, nullOnly: 5, bothMiss: 15 });

function buildHandoffTally(overrides: Partial<Record<HandoffOutcomeKind, number>> = {}): Record<HandoffOutcomeKind, number> {
  const tally = {} as Record<HandoffOutcomeKind, number>;
  for (const kind of HANDOFF_OUTCOME_KINDS) tally[kind] = overrides[kind] ?? 0;
  return tally;
}

function buildRunConfig(overrides: Partial<CollabRoundRunConfig> = {}): CollabRoundRunConfig {
  return {
    repoCommit: "abc1234",
    pairFileCommit: "def5678",
    modelName: "gpt-oss:latest",
    modelDigest: "17052f91a42e",
    perCallCeilingMs: 1_800_000,
    concurrency: 1,
    gateThreshold: 0.05,
    interleaving: "per-query: graph unit then null unit, ascending queryId",
    manifestHashes: { "prime-pool-manifest.json": "sha1", "fingerprint-manifest.json": "sha2" },
    criticalValueTableHash: "sha3",
    archiveRoot: ".stz/60-harness/component",
    archiveSlot: "collab-stark-prime",
    warmUpQueryId: 1,
    ...overrides,
  };
}

function buildDiagnostics(overrides: Partial<CollabRoundDiagnostics> = {}): CollabRoundDiagnostics {
  return {
    graph: {
      meanReciprocalRank: 0.6,
      hitAt5Count: 50,
      recallAt20: 0.8,
      inputTokenCount: 120_000,
      errorCount: 1,
      nonCompletionCount: 2,
    },
    nullArm: {
      meanReciprocalRank: 0.4,
      hitAt5Count: 35,
      recallAt20: 0.5,
      inputTokenCount: 90_000,
      errorCount: 0,
      nonCompletionCount: 1,
    },
    handoffOutcomeTally: buildHandoffTally({ success: 73, "cd05-violation": 2 }),
    selection: {
      pairs: [
        { specimenId: "conservative-prune", pairFileBasename: "_pair-conservative-prune.md", searchFitness: 0.42 },
        { specimenId: "relation-focused", pairFileBasename: "_pair-relation-focused.md", searchFitness: 0.51 },
        { specimenId: "breadth", pairFileBasename: "_pair-breadth.md", searchFitness: 0.38 },
      ],
      winner: "relation-focused",
      promotionVerdict: { promote: true, reason: "promoted" },
    },
    ...overrides,
  };
}

function buildUnitRecords(n: number, arm: CollabRoundArm = "graph"): CollabRoundUnitRecord[] {
  const records: CollabRoundUnitRecord[] = [];
  for (let i = 0; i < n; i++) {
    records.push({
      arm,
      queryId: i,
      handoffOutcomeKind: "success",
      hit1: i % 2,
      wallTimeMs: 9700 + i,
      diagnostics: {},
    });
  }
  return records;
}

/**
 * Baseline builder: a complete, valid `CollabRoundVerdict` from a small set
 * of overrides, so every later case differs from a known-good baseline by
 * exactly one field.
 */
function buildBaselineVerdict(overrides: Partial<CollabRoundVerdict> = {}): CollabRoundVerdict {
  return {
    complete: true,
    outcome: "GATE-PASS",
    gate: PASSING_GATE,
    headline: {
      graphHit1Count: PASSING_GATE.counts.graphHits,
      graphHit1Rate: PASSING_GATE.counts.graphHits / PASSING_GATE.counts.pairs,
      nullHit1Count: PASSING_GATE.counts.nullHits,
      nullHit1Rate: PASSING_GATE.counts.nullHits / PASSING_GATE.counts.pairs,
      meaningful: true,
    },
    diagnostics: buildDiagnostics(),
    unitRecords: buildUnitRecords(4),
    retries: [],
    runConfig: buildRunConfig(),
    armCommits: { graph: "abc1234", "no-subgraph": "abc1234" },
    ...overrides,
  };
}

describe("_collab-report.ts -- Task 1: a verdict object renders, gate block first", () => {
  it("declares COLLAB_ROUND_OUTCOMES with at least the gate-pass, gate-fail and promotion-refusal members", () => {
    expect(COLLAB_ROUND_OUTCOMES).toContain("GATE-PASS");
    expect(COLLAB_ROUND_OUTCOMES).toContain("GATE-FAIL");
    expect(COLLAB_ROUND_OUTCOMES).toContain("PROMOTION-REFUSED");
    const asOutcome = (s: string): CollabRoundOutcome => s as CollabRoundOutcome;
    expect(asOutcome("GATE-PASS")).toBe("GATE-PASS");
  });

  it("gate section precedes both arms' hit@1 figures for a PASSING verdict", () => {
    const md = renderCollabRoundReport(buildBaselineVerdict({ outcome: "GATE-PASS" }));
    const gateOffset = md.indexOf("## Gate");
    expect(gateOffset).toBeGreaterThanOrEqual(0);
    const graphFigureOffset = md.indexOf(String(PASSING_GATE.counts.graphHits));
    const nullFigureOffset = md.indexOf(String(PASSING_GATE.counts.nullHits));
    // The first occurrence of either count could appear inside the gate
    // section itself; what must hold is the HEADLINE section's own heading
    // (and thus its own figure occurrences) is strictly after the gate
    // heading -- assert via the headline heading offset directly.
    const headlineOffset = md.indexOf("## Headline");
    expect(headlineOffset).toBeGreaterThan(gateOffset);
    expect(graphFigureOffset).toBeGreaterThanOrEqual(0);
    expect(nullFigureOffset).toBeGreaterThanOrEqual(0);
  });

  it("gate section precedes both arms' hit@1 figures for a FAILING verdict", () => {
    const verdict = buildBaselineVerdict({
      outcome: "GATE-FAIL",
      gate: FAILING_GATE,
      headline: {
        graphHit1Count: FAILING_GATE.counts.graphHits,
        graphHit1Rate: FAILING_GATE.counts.graphHits / FAILING_GATE.counts.pairs,
        nullHit1Count: FAILING_GATE.counts.nullHits,
        nullHit1Rate: FAILING_GATE.counts.nullHits / FAILING_GATE.counts.pairs,
        meaningful: false,
      },
    });
    const md = renderCollabRoundReport(verdict);
    const gateOffset = md.indexOf("## Gate");
    const headlineOffset = md.indexOf("## Headline");
    expect(gateOffset).toBeGreaterThanOrEqual(0);
    expect(headlineOffset).toBeGreaterThan(gateOffset);
  });

  it("gate section names the primary result, secondary flag, both margins, both hit counts and both differences", () => {
    const md = renderCollabRoundReport(buildBaselineVerdict());
    const gateSection = md.slice(md.indexOf("## Gate"), md.indexOf("## Headline"));
    expect(gateSection).toContain("PASS");
    expect(gateSection).toMatch(/FIRED|not fired/);
    expect(gateSection).toContain(`δ1=${PASSING_GATE.delta1}`);
    expect(gateSection).toContain(`δ2=${PASSING_GATE.delta2}`);
    expect(gateSection).toContain(String(PASSING_GATE.counts.graphHits));
    expect(gateSection).toContain(String(PASSING_GATE.counts.nullHits));
    expect(gateSection).toContain(String(PASSING_GATE.primaryDifference));
    expect(gateSection).toContain(String(PASSING_GATE.secondaryDifference));
  });

  it("renders the underpowered statement and states the primary gate was still evaluated on raw counts", () => {
    const verdict = buildBaselineVerdict({
      outcome: "GATE-FAIL",
      gate: UNDERPOWERED_GATE,
      headline: {
        graphHit1Count: UNDERPOWERED_GATE.counts.graphHits,
        graphHit1Rate: UNDERPOWERED_GATE.counts.graphHits / UNDERPOWERED_GATE.counts.pairs,
        nullHit1Count: UNDERPOWERED_GATE.counts.nullHits,
        nullHit1Rate: UNDERPOWERED_GATE.counts.nullHits / UNDERPOWERED_GATE.counts.pairs,
        meaningful: false,
      },
    });
    const md = renderCollabRoundReport(verdict);
    const gateSection = md.slice(md.indexOf("## Gate"), md.indexOf("## Headline"));
    expect(gateSection).toContain("UNDERPOWERED");
    expect(gateSection).toContain("primary margin gate");
    expect(gateSection).toContain("still evaluated");
  });

  it("touches no filesystem, child-process, clock or network symbol -- pinned import allowlist", () => {
    const source = readFileSync(join(repoRoot, "experiments/collab-round/_collab-report.ts"), "utf8");
    const specifiers = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!).sort();
    expect(specifiers).toEqual(REPORT_IMPORT_ALLOWLIST);
  });

  it("refuses to render an artifact whose completion marker is not exactly true, naming the field", () => {
    const verdict = buildBaselineVerdict({ complete: false as unknown as true });
    expect(() => renderCollabRoundReport(verdict)).toThrowError(/complete/);
  });

  it("refuses an artifact whose completion marker is absent (undefined)", () => {
    const verdict = buildBaselineVerdict();
    // @ts-expect-error -- deliberately constructing an invalid artifact for the refusal test
    delete verdict.complete;
    expect(() => renderCollabRoundReport(verdict)).toThrowError(/complete/);
  });

  it("is deterministic -- two calls with the same input return equal strings", () => {
    const verdict = buildBaselineVerdict();
    const a = renderCollabRoundReport(verdict);
    const b = renderCollabRoundReport(verdict);
    expect(a).toBe(b);
  });
});

describe("_collab-report.ts -- Task 2: not-meaningful labelling, promotion refusal, full diagnostic set", () => {
  function buildFailingVerdict(overrides: Partial<CollabRoundVerdict> = {}): CollabRoundVerdict {
    return buildBaselineVerdict({
      outcome: "GATE-FAIL",
      gate: FAILING_GATE,
      headline: {
        graphHit1Count: FAILING_GATE.counts.graphHits,
        graphHit1Rate: FAILING_GATE.counts.graphHits / FAILING_GATE.counts.pairs,
        nullHit1Count: FAILING_GATE.counts.nullHits,
        nullHit1Rate: FAILING_GATE.counts.nullHits / FAILING_GATE.counts.pairs,
        meaningful: false,
      },
      ...overrides,
    });
  }

  it("labels every occurrence of either arm's hit@1 figure on the same line when the primary gate failed", () => {
    const md = renderCollabRoundReport(buildFailingVerdict());
    const headlineSection = md.slice(md.indexOf("## Headline"), md.indexOf("## Diagnostics"));
    const figureLines = headlineSection
      .split("\n")
      .filter((line) => line.includes("hit@1:"));
    expect(figureLines.length).toBeGreaterThanOrEqual(2);
    for (const line of figureLines) {
      expect(line).toContain("NOT MEANINGFUL");
      expect(line).toContain("bypass-defense");
    }
  });

  it("renders no not-meaningful label anywhere when the primary gate passed", () => {
    const md = renderCollabRoundReport(buildBaselineVerdict());
    expect(md).not.toContain("NOT MEANINGFUL");
  });

  it("a promotion-refusal verdict renders the terminal outcome, the refusal reason, and the unspent-suite statement, with no paired counts or headline figures", () => {
    const verdict = buildBaselineVerdict({
      outcome: "PROMOTION-REFUSED",
      diagnostics: buildDiagnostics({
        selection: {
          pairs: [
            { specimenId: "conservative-prune", pairFileBasename: "_pair-conservative-prune.md", searchFitness: 0.42 },
            { specimenId: "relation-focused", pairFileBasename: "_pair-relation-focused.md", searchFitness: 0.51 },
            { specimenId: "breadth", pairFileBasename: "_pair-breadth.md", searchFitness: 0.38 },
          ],
          winner: "relation-focused",
          promotionVerdict: { promote: false, reason: "does-not-beat-incumbent; hack-findings-on-own-outputs" },
        },
      }),
    });
    const md = renderCollabRoundReport(verdict);
    expect(md).toContain("PROMOTION-REFUSED");
    expect(md).toContain("does-not-beat-incumbent; hack-findings-on-own-outputs");
    expect(md).toMatch(/never spent|never .*evaluated|were never/i);
    expect(md).not.toContain("## Gate");
    expect(md).not.toContain("## Headline");
    expect(md).not.toContain(`${PASSING_GATE.counts.graphHits}/${PASSING_GATE.counts.pairs}`);
  });

  it("the diagnostics section renders every handoff-outcome kind the runner declares, including zero counts", () => {
    const verdict = buildBaselineVerdict({
      diagnostics: buildDiagnostics({ handoffOutcomeTally: buildHandoffTally({ success: 75 }) }),
    });
    const md = renderCollabRoundReport(verdict);
    for (const kind of HANDOFF_OUTCOME_KINDS) {
      expect(md).toContain(kind);
    }
  });

  it("the degeneracy tally is labelled as a diagnostic and states it is never a verdict", () => {
    const md = renderCollabRoundReport(buildBaselineVerdict());
    const diagnosticsSection = md.slice(md.indexOf("## Diagnostics"), md.indexOf("## Per-unit records"));
    expect(diagnosticsSection).toMatch(/degeneracy/i);
    expect(diagnosticsSection).toContain("diagnostic");
    expect(diagnosticsSection).toMatch(/never a verdict/i);
  });

  it("an underpowered sign test renders its own statement plus the primary-gate-still-evaluated sentence in the gate block", () => {
    const verdict = buildBaselineVerdict({
      outcome: "GATE-FAIL",
      gate: UNDERPOWERED_GATE,
      headline: {
        graphHit1Count: UNDERPOWERED_GATE.counts.graphHits,
        graphHit1Rate: UNDERPOWERED_GATE.counts.graphHits / UNDERPOWERED_GATE.counts.pairs,
        nullHit1Count: UNDERPOWERED_GATE.counts.nullHits,
        nullHit1Rate: UNDERPOWERED_GATE.counts.nullHits / UNDERPOWERED_GATE.counts.pairs,
        meaningful: false,
      },
    });
    const md = renderCollabRoundReport(verdict);
    const gateSection = md.slice(md.indexOf("## Gate"), md.indexOf("## Headline"));
    expect(gateSection).toContain("UNDERPOWERED");
    expect(gateSection).toContain("primary margin gate");
    expect(gateSection).toContain("still evaluated");
  });

  it("the per-unit table's data-row count equals the unit-record array's length (fifty-record fixture)", () => {
    const records = buildUnitRecords(50);
    const verdict = buildBaselineVerdict({ unitRecords: records });
    const md = renderCollabRoundReport(verdict);
    const tableSection = md.slice(md.indexOf("## Per-unit records"), md.indexOf("## Retries"));
    const dataRows = tableSection
      .split("\n")
      .filter((line) => line.startsWith("|") && !line.includes("---") && !line.includes("query id"));
    expect(dataRows.length).toBe(50);
  });

  it("the selection-round section renders per-pair search fitness, the winner, and the promotion verdict", () => {
    const md = renderCollabRoundReport(buildBaselineVerdict());
    const selectionSection = md.slice(md.indexOf("## Selection round"), md.indexOf("## Run configuration"));
    expect(selectionSection).toContain("conservative-prune");
    expect(selectionSection).toContain("relation-focused");
    expect(selectionSection).toContain("breadth");
    expect(selectionSection).toContain("0.4200");
    expect(selectionSection).toContain("Winner: relation-focused");
    expect(selectionSection).toContain("PROMOTED");
    expect(selectionSection).toMatch(/compressed adapter reward/);
  });
});
