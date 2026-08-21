/**
 * Guards the committed STaRK gold-harvest fixtures (Phase 18, Plan 02,
 * REQ-77): shape, cross-pool disjointness, the OracleReceipt, and the D-09
 * hard CI boundary — nothing under `test/` may import or shell to the
 * Python toolchain. Every guard here is proven red once during planning by
 * a deliberately introduced violation, then reverted (see 18-02-SUMMARY.md).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { validateReceipt, resolveRootKind } from "../src/foundry/battery-types.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = join(repoRoot, "test", "fixtures", "stark");
const testDir = join(repoRoot, "test");
const selfFile = fileURLToPath(import.meta.url);

function loadFixture(name: string): { meta: Record<string, unknown>; pairs: any[] } {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8"));
}

const POOLS: [string, string][] = [
  ["prime-selection.json", "val"],
  ["prime-heldout.json", "test"],
];

describe("STaRK gold pool fixtures", () => {
  it.each(POOLS)("%s parses, holds 50-100 pairs, split=%s", (filename, expectedSplit) => {
    const fixture = loadFixture(filename);
    expect(fixture.pairs.length).toBeGreaterThanOrEqual(50);
    expect(fixture.pairs.length).toBeLessThanOrEqual(100);
    expect(fixture.meta.split).toBe(expectedSplit);
  });

  it.each(POOLS)("%s has all nine meta keys with the pinned kb/hf_revision/version", (filename) => {
    const fixture = loadFixture(filename);
    expect(fixture.meta.kb).toBe("prime");
    expect(fixture.meta.hf_revision).toBe("88269e23e90587f99476c5dd74e235a0877e69be");
    expect(fixture.meta.stark_qa_version).toBe("1.1.0");
    expect(typeof fixture.meta.seed).toBe("number");
    expect(typeof fixture.meta.sampled_from_n).toBe("number");
  });

  it.each(POOLS)("%s: query_id unique within pool, query non-empty, answer_ids non-empty ints", (filename) => {
    const fixture = loadFixture(filename);
    const ids = fixture.pairs.map((p) => p.query_id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const pair of fixture.pairs) {
      expect(typeof pair.query_id).toBe("number");
      expect(Number.isInteger(pair.query_id)).toBe(true);
      expect(typeof pair.query).toBe("string");
      expect(pair.query.length).toBeGreaterThan(0);
      expect(Array.isArray(pair.answer_ids)).toBe(true);
      expect(pair.answer_ids.length).toBeGreaterThan(0);
      for (const answerId of pair.answer_ids) {
        expect(Number.isInteger(answerId)).toBe(true);
      }
    }
  });

  it("filename's pool matches meta.pool", () => {
    const selection = loadFixture("prime-selection.json");
    const heldout = loadFixture("prime-heldout.json");
    expect(selection.meta.pool).toBe("selection");
    expect(heldout.meta.pool).toBe("heldout");
  });
});

describe("STaRK gold pools are held out from each other", () => {
  it("no query_id appears in both the selection and held-out pool", () => {
    const selection = loadFixture("prime-selection.json");
    const heldout = loadFixture("prime-heldout.json");
    const selectionIds = new Set(selection.pairs.map((p) => p.query_id));
    const overlap = heldout.pairs.filter((p) => selectionIds.has(p.query_id));
    expect(overlap).toEqual([]);
  });

  it("both pools share the same hf_revision and stark_qa_version", () => {
    const selection = loadFixture("prime-selection.json");
    const heldout = loadFixture("prime-heldout.json");
    expect(selection.meta.hf_revision).toBe(heldout.meta.hf_revision);
    expect(selection.meta.stark_qa_version).toBe(heldout.meta.stark_qa_version);
  });
});

describe("STaRK oracle-receipt fixture", () => {
  it("passes validateReceipt with kind=constructed and lineage[0]=constructed:stark-prime", () => {
    const receipt = JSON.parse(readFileSync(join(fixtureDir, "oracle-receipt.json"), "utf8"));
    expect(() => validateReceipt(receipt, "stark-prime-selection-pool")).not.toThrow();
    expect(resolveRootKind(receipt)).toBe("constructed");
    expect(receipt.kind).toBe("constructed");
    expect(receipt.lineage[0]).toBe("constructed:stark-prime");
  });

  it("is exactly three keys: kind, acceptedBy, lineage", () => {
    const receipt = JSON.parse(readFileSync(join(fixtureDir, "oracle-receipt.json"), "utf8"));
    expect(Object.keys(receipt).sort()).toEqual(["acceptedBy", "kind", "lineage"]);
    expect(typeof receipt.acceptedBy).toBe("string");
    expect(receipt.acceptedBy.length).toBeGreaterThan(0);
  });
});

// D-09: hard CI boundary — nothing under test/ may import or shell to the
// Python toolchain. These four tokens are the guard's DATA, not prose about
// the toolchain; they are absent from every test/**/*.ts source file today.
const PYTHON_TOOLCHAIN_MARKERS = ["stark-eval", "stark_qa", ".venv", "python3"];

function listTsFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      files.push(...listTsFilesRecursive(full));
    } else if (entry.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

describe("D-09 CI boundary: no test/**/*.ts file references the Python toolchain", () => {
  it("scans every test/**/*.ts file except this guard's own source", () => {
    const files = listTsFilesRecursive(testDir).filter((f) => f !== selfFile);
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const marker of PYTHON_TOOLCHAIN_MARKERS) {
        if (source.includes(marker)) {
          offenders.push(`${relative(repoRoot, file)} contains marker ${JSON.stringify(marker)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
