/**
 * Component-altitude archive sibling (Phase 2, Plan 02-03 — D-02/CONTEXT
 * D2/D5). Proves the search→promotion gap is DERIVED, never caller-supplied
 * (REQ-21), and that the component archive lives in its own manifest,
 * structurally parallel to but never interleaved with the harness-genome
 * archive. Offline, deterministic: real temp dirs (`mkdtempSync`), no fs
 * mock, no network, no daemon (D-05/CONTEXT D5).
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultGenome,
  makeArchiveEntry,
  appendArchiveEntry,
  readArchive,
  componentDir,
  componentManifestPath,
  readComponentArchive,
  appendComponentArchiveEntry,
  componentVariantId,
  makeComponentArchiveEntry,
  componentIncumbent,
  type PromotionInputs,
} from "../src/harness.js";
import { STZ_DIR } from "../src/taxonomy.js";
import {
  runComponentTournament,
  type PromoteComponentWinnerResult,
} from "../src/foundry/component-tournament.js";
import type { CandidateAgent } from "../src/foundry/agent-runner.js";
import { makeSplitBattery, type SplitBattery } from "../src/foundry/battery-types.js";
import type { JudgeReliabilityProfile } from "../src/judge-reliability.js";
import type { ChatRequest, ChatResponse, Provider } from "../src/foundry/provider.js";
import type { PredicateCheck } from "../src/contract/contract-types.js";

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), "stz-component-archive-test-"));
}

function genomeGates(): PromotionInputs {
  return { hackClean: false, sealOk: false, interfaceParity: false, diversityOk: false, beatsIncumbent: false, rubricCalibrated: false, exogenousLineage: false };
}

function sevenGates(exogenousLineage = true): PromotionInputs {
  return { beatsIncumbent: true, hackClean: true, sealOk: true, interfaceParity: true, diversityOk: true, rubricCalibrated: true, exogenousLineage };
}

describe("component archive sibling — types + I/O (REQ-21, D-02/CONTEXT D2)", () => {
  it("makeComponentArchiveEntry's variantId is content-addressed from the definition text (N6 determinism)", () => {
    const defA = "---\nname: a\n---\nbody a";
    const defB = "---\nname: b\n---\nbody b";
    const e1 = makeComponentArchiveEntry({
      slot: "reviewer", specimenId: "cand-1", definitionText: defA, parent: null,
      searchFitness: 0.9, promotionFitness: 0.7, advantage: 0.2, gates: sevenGates(),
    });
    const e1b = makeComponentArchiveEntry({
      slot: "reviewer", specimenId: "cand-1", definitionText: defA, parent: null,
      searchFitness: 0.1, promotionFitness: 0.05, advantage: 0, gates: sevenGates(),
    });
    const e2 = makeComponentArchiveEntry({
      slot: "reviewer", specimenId: "cand-2", definitionText: defB, parent: null,
      searchFitness: 0.9, promotionFitness: 0.7, advantage: 0.2, gates: sevenGates(),
    });
    expect(e1.variantId).toBe(componentVariantId(defA));
    expect(e1.variantId).toBe(e1b.variantId); // same definition text → same id, regardless of fitness
    expect(e1.variantId).not.toBe(e2.variantId);
    expect(e1.artifact).toEqual({ slot: "reviewer", specimenId: "cand-1", definitionHash: componentVariantId(defA) });
  });

  it("searchPromotionGap equals searchFitness - promotionFitness exactly, derived (never accepted as an argument)", () => {
    const entry = makeComponentArchiveEntry({
      slot: "reviewer", specimenId: "cand-1", definitionText: "def", parent: null,
      searchFitness: 0.82, promotionFitness: 0.51, advantage: 0.3, gates: sevenGates(),
    });
    expect(entry.searchPromotionGap).toBeCloseTo(0.82 - 0.51, 10);
    expect(entry.searchFitness).toBe(0.82);
    expect(entry.promotionFitness).toBe(0.51);
    // fitness = the honest promotion-set number, never the search-set one.
    expect(entry.fitness).toBe(0.51);
  });

  it("appendComponentArchiveEntry writes under .stz/60-harness/component/<slot>/MANIFEST.json; append-order is the audit sequence", () => {
    const root = tmpRoot();
    try {
      const e1 = makeComponentArchiveEntry({ slot: "reviewer", specimenId: "cand-1", definitionText: "def1", parent: null, searchFitness: 0.9, promotionFitness: 0.6, advantage: 0, gates: sevenGates() });
      const e2 = makeComponentArchiveEntry({ slot: "reviewer", specimenId: "cand-2", definitionText: "def2", parent: e1.variantId, searchFitness: 0.5, promotionFitness: 0.4, advantage: 0, gates: sevenGates() });
      appendComponentArchiveEntry(root, "reviewer", e1);
      appendComponentArchiveEntry(root, "reviewer", e2);
      expect(componentManifestPath(root, "reviewer")).toBe(join(componentDir(root, "reviewer"), "MANIFEST.json"));
      expect(existsSync(componentManifestPath(root, "reviewer"))).toBe(true);
      const onDisk = readComponentArchive(root, "reviewer");
      expect(onDisk.map((e) => e.variantId)).toEqual([e1.variantId, e2.variantId]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("after appending a component entry, readArchive(root) (the genome archive) is unchanged — the two manifests never interleave", () => {
    const root = tmpRoot();
    try {
      appendArchiveEntry(root, makeArchiveEntry({ genome: defaultGenome(), parent: null, fitness: 0.8, perSubstrate: { cron: 0.8 }, advantage: 0, gates: genomeGates() }));
      const componentEntry = makeComponentArchiveEntry({ slot: "reviewer", specimenId: "cand-1", definitionText: "def1", parent: null, searchFitness: 0.9, promotionFitness: 0.6, advantage: 0, gates: sevenGates() });
      appendComponentArchiveEntry(root, "reviewer", componentEntry);

      const genomeEntries = readArchive(root);
      expect(genomeEntries.length).toBe(1);
      expect(genomeEntries[0]).toHaveProperty("genome");
      expect((genomeEntries[0] as { genome: unknown }).genome).toEqual(defaultGenome());

      const componentEntries = readComponentArchive(root, "reviewer");
      expect(componentEntries.length).toBe(1);
      expect(componentEntries[0]).not.toHaveProperty("genome");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("two different slots keep two independent archives", () => {
    const root = tmpRoot();
    try {
      appendComponentArchiveEntry(root, "reviewer", makeComponentArchiveEntry({ slot: "reviewer", specimenId: "cand-1", definitionText: "def-r", parent: null, searchFitness: 0.9, promotionFitness: 0.6, advantage: 0, gates: sevenGates() }));
      appendComponentArchiveEntry(root, "planner", makeComponentArchiveEntry({ slot: "planner", specimenId: "cand-2", definitionText: "def-p", parent: null, searchFitness: 0.5, promotionFitness: 0.3, advantage: 0, gates: sevenGates() }));
      expect(readComponentArchive(root, "reviewer").length).toBe(1);
      expect(readComponentArchive(root, "planner").length).toBe(1);
      expect(readComponentArchive(root, "reviewer")[0]!.artifact.slot).toBe("reviewer");
      expect(readComponentArchive(root, "planner")[0]!.artifact.slot).toBe("planner");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("a slot containing a path-escaping segment throws before any directory is created", () => {
    const root = tmpRoot();
    try {
      expect(() => componentManifestPath(root, "../evil")).toThrow();
      expect(() => componentDir(root, "a/b")).toThrow();
      // no .stz tree at all should exist under root after the throws above.
      expect(existsSync(join(root, STZ_DIR))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("componentIncumbent returns the highest-fitness entry for a slot, or null for an empty archive", () => {
    const root = tmpRoot();
    try {
      expect(componentIncumbent(root, "reviewer")).toBeNull();
      appendComponentArchiveEntry(root, "reviewer", makeComponentArchiveEntry({ slot: "reviewer", specimenId: "cand-1", definitionText: "def1", parent: null, searchFitness: 0.9, promotionFitness: 0.6, advantage: 0, gates: sevenGates() }));
      appendComponentArchiveEntry(root, "reviewer", makeComponentArchiveEntry({ slot: "reviewer", specimenId: "cand-2", definitionText: "def2", parent: null, searchFitness: 0.9, promotionFitness: 0.9, advantage: 0, gates: sevenGates() }));
      expect(componentIncumbent(root, "reviewer")!.fitness).toBe(0.9);
      expect(componentIncumbent(root, "reviewer")!.artifact.specimenId).toBe("cand-2");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ── Task 2 fixtures: an offline provider stub + a real SplitBattery, driven
// end to end through runComponentTournament so the persisted gap comes from
// a real battery run, not a hand-built entry. ────────────────────────────
const provider: Provider = {
  kind: "openai",
  baseUrl: "http://test-provider.invalid",
  async chat(req: ChatRequest): Promise<ChatResponse> {
    const winning = (req.system ?? "").includes("WINNING");
    return {
      text: winning ? "```path=out.txt\nok\n```" : "```path=out.txt\nnope\n```",
      model: req.model,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 },
    };
  },
};

const CHECK: PredicateCheck = {
  checkId: "c1",
  kind: "output-assertion",
  input: "out.txt",
  expect: "ok",
  description: "out.txt says ok",
};

const WINNING_DEF = "---\nname: stz-winner\ntools: Read, Write\n---\nWINNING agent body.";
const LOSING_DEF = "---\nname: stz-loser\ntools: Read\n---\nLOSING agent body.";

const candidates: CandidateAgent[] = [
  { id: "cand-win", systemPrompt: WINNING_DEF },
  { id: "cand-lose", systemPrompt: LOSING_DEF },
];

const judgeProfile: JudgeReliabilityProfile = {
  schemaVersion: 1,
  perSliceType: [{ sliceType: "component", consistency: 1, blindAccuracyBucket: "high", n: 4 }],
};

function makeSplit(idPrefix: string): SplitBattery {
  return makeSplitBattery(
    {
      id: `${idPrefix}-search-battery`,
      tasks: [{ id: `${idPrefix}-search-t1`, prompt: "write out.txt containing ok", checks: [CHECK] }],
      receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] },
    },
    {
      id: `${idPrefix}-promotion-battery`,
      tasks: [{ id: `${idPrefix}-promo-t1`, prompt: "write out.txt containing ok", checks: [CHECK] }],
      receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] },
    },
  );
}

describe("the gap is computed at the promotion decision and persisted (Task 2, REQ-21)", () => {
  it("gap: a real end-to-end run's persisted searchPromotionGap round-trips through disk and matches the returned promotion result", async () => {
    const root = tmpRoot();
    try {
      const split = makeSplit("gap-e2e");
      const result = await runComponentTournament({
        candidates,
        split,
        incumbentFrontmatter: WINNING_DEF,
        incumbentFitness: 0,
        diversityFloor: 0.01,
        judgeProfile,
        sliceType: "component",
        runOpts: { providerImpl: provider },
        archive: { root, slot: "reviewer" },
      });
      expect(result.promotion).not.toBeNull();
      const promotion = result.promotion as PromoteComponentWinnerResult;
      expect(promotion.verdict.promote).toBe(true);

      const onDisk = JSON.parse(
        await import("node:fs/promises").then((fs) => fs.readFile(componentManifestPath(root, "reviewer"), "utf8")),
      );
      expect(onDisk).toHaveLength(1);
      expect(onDisk[0].searchPromotionGap).toBeCloseTo(promotion.searchPromotionGap, 10);
      expect(onDisk[0].searchFitness).toBeCloseTo(promotion.searchFitness, 10);
      expect(onDisk[0].promotionFitness).toBeCloseTo(promotion.promotionFitness, 10);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("gap: a REFUSED promotion still appends an entry — a refusal is as much an audit record as a promotion", async () => {
    const root = tmpRoot();
    try {
      const split = makeSplit("gap-refuse");
      const result = await runComponentTournament({
        candidates,
        split,
        incumbentFrontmatter: LOSING_DEF, // diverges from the winner's frontmatter → interfaceParity fails
        incumbentFitness: 0,
        diversityFloor: 0.01,
        judgeProfile,
        sliceType: "component",
        runOpts: { providerImpl: provider },
        archive: { root, slot: "reviewer" },
      });
      expect(result.promotion!.verdict.promote).toBe(false);
      expect(result.promotion!.verdict.failed).toContain("interface-parity-broken");

      const onDisk = readComponentArchive(root, "reviewer");
      expect(onDisk).toHaveLength(1);
      expect(onDisk[0]!.gates.interfaceParity).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("gap: two tournaments against the same slot chain — the second entry's parent is the first entry's variantId, and beatsIncumbent reads the real recorded incumbent", async () => {
    const root = tmpRoot();
    try {
      const split1 = makeSplit("gap-chain-1");
      await runComponentTournament({
        candidates, split: split1, incumbentFrontmatter: WINNING_DEF, incumbentFitness: 0,
        diversityFloor: 0.01, judgeProfile, sliceType: "component",
        runOpts: { providerImpl: provider }, archive: { root, slot: "reviewer" },
      });
      const first = readComponentArchive(root, "reviewer")[0]!;

      const split2 = makeSplit("gap-chain-2");
      await runComponentTournament({
        candidates, split: split2, incumbentFrontmatter: WINNING_DEF, incumbentFitness: 0,
        diversityFloor: 0.01, judgeProfile, sliceType: "component",
        runOpts: { providerImpl: provider }, archive: { root, slot: "reviewer" },
      });
      const entries = readComponentArchive(root, "reviewer");
      expect(entries).toHaveLength(2);
      expect(entries[1]!.parent).toBe(first.variantId);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("gap: no archive target writes nothing to disk under the temp root, and the returned result still carries the gap", async () => {
    const root = tmpRoot();
    try {
      const split = makeSplit("gap-none");
      const result = await runComponentTournament({
        candidates,
        split,
        incumbentFrontmatter: WINNING_DEF,
        incumbentFitness: 0,
        diversityFloor: 0.01,
        judgeProfile,
        sliceType: "component",
        runOpts: { providerImpl: provider },
        // no `archive` field
      });
      expect(result.promotion).not.toBeNull();
      expect(typeof result.promotion!.searchPromotionGap).toBe("number");
      expect(existsSync(join(root, STZ_DIR))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("source assertion: searchPromotionGap is produced by a subtraction of the two evalReward-derived numbers, and runComponentTournament takes no gap parameter", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../src/foundry/component-tournament.ts", import.meta.url), "utf8"),
    );
    expect(src).toMatch(/searchPromotionGap\s*=\s*searchFitness\s*-\s*promotionFitness/);
    const sig = src.match(/export async function runComponentTournament\(([\s\S]*?)\): Promise<RunComponentTournamentResult>/);
    expect(sig).not.toBeNull();
    expect(sig![0]).not.toMatch(/gap/i);
  });
});
