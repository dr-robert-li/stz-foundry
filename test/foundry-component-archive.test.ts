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
