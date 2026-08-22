/**
 * Guards the two committed manifests Plan 21-02 harvests (D-03/D-04 pool
 * manifest, D-05/D-06 fingerprint manifest): their provenance can't be
 * verified by inspection, so what CAN be checked mechanically — agreement
 * with the typed admission pin, internal consistency, and coverage of both
 * cache namespaces — is checked permanently here.
 *
 * Imports nothing from `collaborative-scoring-bridge.ts` on purpose: this
 * test asserts the committed shape directly, which is what lets this plan
 * run in the same wave as Plan 21-01 with no dependency between them. Do
 * not "tidy" this into a bridge import.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { COLLABORATIVE_ADMISSION } from "../src/foundry/collaborative-admission.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = join(repoRoot, "test", "fixtures", "stark");

interface PoolManifest {
  kb: string;
  hfRevision: string;
  form: "bounds" | "explicit";
  count: number;
  min: number;
  max: number;
  idListSha256: string;
  ids?: number[];
}

interface FingerprintManifest {
  pythonPath: string;
  pythonVersion: string;
  starkQaVersion: string;
  torchVersion: string;
  hfPin: string;
  scoreOneSha256: string;
  cacheKeyFileSha256: Record<string, string>;
}

function loadPoolManifest(): PoolManifest {
  return JSON.parse(readFileSync(join(fixtureDir, "prime-pool-manifest.json"), "utf8"));
}

function loadFingerprintManifest(): FingerprintManifest {
  return JSON.parse(readFileSync(join(fixtureDir, "fingerprint-manifest.json"), "utf8"));
}

const pin = COLLABORATIVE_ADMISSION.get("stark-prime")!.revisionSha;

// The recipe the harvest tool's Python side implements (see the harvester's
// own comment for the other half of this pair): sha256 over the sorted full
// id list, one id per line, joined by a single "\n", no trailing newline. A
// divergence between the two implementations of this recipe is exactly what
// this test exists to catch.
function idListDigest(ids: number[]): string {
  const sorted = [...ids].sort((a, b) => a - b);
  return createHash("sha256").update(sorted.join("\n"), "utf8").digest("hex");
}

function impliedIds(manifest: PoolManifest): number[] {
  if (manifest.form === "explicit") {
    if (!manifest.ids) {
      throw new Error("form is explicit but manifest carries no ids array");
    }
    return manifest.ids;
  }
  const ids: number[] = [];
  for (let i = manifest.min; i <= manifest.max; i++) {
    ids.push(i);
  }
  return ids;
}

describe("both manifests agree with the admission table's pin, never a literal", () => {
  it("pool manifest hfRevision equals COLLABORATIVE_ADMISSION's revisionSha", () => {
    const pool = loadPoolManifest();
    expect(pool.hfRevision).toBe(pin);
  });

  it("fingerprint manifest hfPin equals the same value", () => {
    const fingerprint = loadFingerprintManifest();
    expect(fingerprint.hfPin).toBe(pin);
  });
});

describe("pool manifest shape and internal consistency (D-03/D-04)", () => {
  it("top-level key set is exactly the pinned set for its form", () => {
    const pool = loadPoolManifest();
    const keys = Object.keys(pool).sort();
    const expected =
      pool.form === "explicit"
        ? ["count", "form", "hfRevision", "ids", "kb", "idListSha256", "max", "min"].sort()
        : ["count", "form", "hfRevision", "kb", "idListSha256", "max", "min"].sort();
    expect(keys).toEqual(expected);
  });

  it("when form is bounds, count equals max - min + 1", () => {
    const pool = loadPoolManifest();
    if (pool.form === "bounds") {
      expect(pool.count).toBe(pool.max - pool.min + 1);
    }
  });

  it("idListSha256 re-derived from the manifest's own bounds equals the committed value", () => {
    const pool = loadPoolManifest();
    const ids = impliedIds(pool);
    expect(ids.length).toBe(pool.count);
    expect(idListDigest(ids)).toBe(pool.idListSha256);
  });

  it("control: the same recipe applied to a deliberately wrong range does NOT equal the committed digest", () => {
    const pool = loadPoolManifest();
    const wrongIds: number[] = [];
    for (let i = pool.min; i <= pool.max + 1; i++) {
      wrongIds.push(i);
    }
    expect(idListDigest(wrongIds)).not.toBe(pool.idListSha256);
  });
});

describe("fingerprint manifest coverage of both cache namespaces (D-05/D-06)", () => {
  it("has at least one skb: key and at least one hub: key, every value a 64-char lowercase hex string", () => {
    const fingerprint = loadFingerprintManifest();
    const keys = Object.keys(fingerprint.cacheKeyFileSha256);
    expect(keys.some((k) => k.startsWith("skb:"))).toBe(true);
    expect(keys.some((k) => k.startsWith("hub:"))).toBe(true);
    for (const value of Object.values(fingerprint.cacheKeyFileSha256)) {
      expect(value).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("pythonPath does not start with / and contains no home-directory segment", () => {
    const fingerprint = loadFingerprintManifest();
    expect(fingerprint.pythonPath.startsWith("/")).toBe(false);
    expect(fingerprint.pythonPath).not.toMatch(/\/home\//);
  });
});

describe("no committed manifest contains a timestamp-shaped or hostname-shaped field", () => {
  it("pool manifest has no generatedAt/timestamp/hostname key or home-directory value", () => {
    const raw = readFileSync(join(fixtureDir, "prime-pool-manifest.json"), "utf8");
    expect(raw).not.toMatch(/"(generatedAt|timestamp|hostname)"/);
    expect(raw).not.toMatch(/\/home\//);
  });

  it("fingerprint manifest has no generatedAt/timestamp/hostname key or home-directory value", () => {
    const raw = readFileSync(join(fixtureDir, "fingerprint-manifest.json"), "utf8");
    expect(raw).not.toMatch(/"(generatedAt|timestamp|hostname)"/);
    expect(raw).not.toMatch(/\/home\//);
  });
});
