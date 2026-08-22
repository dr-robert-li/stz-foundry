/**
 * SC-1 through SC-4 contract suite (Phase 21 — Fail-closed scoring bridge,
 * Plan 21-01, REQ-78), driven entirely through an injected `ScoringExecFn` —
 * no venv, no network, no real cache is touched by this file. Every
 * throwing assertion checks the thrown message's CONTENT, never a bare
 * `.toThrow()` with no argument — same house rule as
 * `test/foundry-collaborative-admission.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { SpawnSyncReturns } from "node:child_process";
import {
  SCORING_TIMEOUT_MS,
  VENV_PYTHON_REL,
  SCORE_ONE_REL,
  SKB_DATA_ROOT_REL,
  parsePoolManifest,
  preFilterPredictions,
  validatePredDict,
  scorePrediction,
  runScoringPreflight,
  parseFingerprintManifest,
  type PoolManifest,
  type FingerprintManifest,
  type ScoringExecFn,
} from "../src/foundry/collaborative-scoring-bridge.js";
import { requireCollaborativeAdmitted } from "../src/foundry/collaborative-admission.js";
import { validateReceipt } from "../src/foundry/battery-types.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = join(repoRoot, "test", "fixtures", "stark");

function thrown(fn: () => unknown): Error {
  try {
    fn();
  } catch (e) {
    return e as Error;
  }
  throw new Error("expected fn to throw, it did not");
}

function scratchDir(): string {
  return mkdtempSync(join(tmpdir(), "stz-scoring-bridge-"));
}

function fakeResult(overrides: Partial<SpawnSyncReturns<string>> = {}): SpawnSyncReturns<string> {
  return {
    pid: 4242,
    output: [null, overrides.stdout ?? "", overrides.stderr ?? ""],
    stdout: "",
    stderr: "",
    status: 0,
    signal: null,
    error: undefined,
    ...overrides,
  };
}

const ADMISSION_RECORD = requireCollaborativeAdmitted("stark-prime");

const HAPPY_STDOUT = JSON.stringify({
  kb: "prime",
  query_id: 523,
  hf_revision: ADMISSION_RECORD.revisionSha,
  metrics: { mrr: 0.5, "hit@1": 1.0, "hit@5": 1.0, "recall@20": 0.25 },
});

function idListDigest(ids: number[]): string {
  return createHash("sha256").update(ids.join("\n")).digest("hex");
}

function boundsManifest(min: number, max: number): PoolManifest {
  const ids = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return {
    kb: "stark-prime",
    hfRevision: ADMISSION_RECORD.revisionSha,
    form: "bounds",
    count: max - min + 1,
    min,
    max,
    idListSha256: idListDigest(ids),
  };
}

// ── Task 1: end-to-end happy path ───────────────────────────────────────

describe("scorePrediction — end to end happy path (Task 1)", () => {
  it("returns a scored outcome with all four metric values passed through unrounded", () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(0, 999);
    const execFn: ScoringExecFn = () => fakeResult({ stdout: HAPPY_STDOUT, stderr: "loading skb ...\n" });
    const attempt = scorePrediction({
      queryId: 523,
      predDict: { "1": 0.9, "2": 0.1 },
      outputDir,
      poolManifest: manifest,
      execFn,
    });
    expect(attempt.outcome).toEqual({
      outcome: "scored",
      metrics: { mrr: 0.5, "hit@1": 1.0, "hit@5": 1.0, "recall@20": 0.25 },
    });
  });

  it("passes an argv array asserted element by element, with --hf-revision equal to the admission record's revisionSha", () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(0, 999);
    let capturedFile: string | undefined;
    let capturedArgv: string[] | undefined;
    const execFn: ScoringExecFn = (file, args) => {
      capturedFile = file;
      capturedArgv = args;
      return fakeResult({ stdout: HAPPY_STDOUT });
    };
    scorePrediction({ queryId: 523, predDict: { "1": 0.9 }, outputDir, poolManifest: manifest, execFn });
    expect(capturedFile).toBe(VENV_PYTHON_REL);
    expect(capturedArgv).toEqual([
      SCORE_ONE_REL,
      "prime",
      "523",
      "--hf-revision",
      requireCollaborativeAdmitted("stark-prime").revisionSha,
    ]);
  });

  it("passes opts.input equal to JSON.stringify(filteredPredDict) and opts.timeout equal to SCORING_TIMEOUT_MS by default", () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(0, 999);
    let capturedOpts: { input: string; timeout: number; encoding: "utf8" } | undefined;
    const execFn: ScoringExecFn = (_file, _args, opts) => {
      capturedOpts = opts;
      return fakeResult({ stdout: HAPPY_STDOUT });
    };
    scorePrediction({
      queryId: 523,
      predDict: { "1": 0.9, "2": 0.1 },
      outputDir,
      poolManifest: manifest,
      execFn,
    });
    expect(capturedOpts?.input).toBe(JSON.stringify({ "1": 0.9, "2": 0.1 }));
    expect(capturedOpts?.timeout).toBe(SCORING_TIMEOUT_MS);
    expect(capturedOpts?.encoding).toBe("utf8");
  });

  it("writes the attempt artifact to artifactPath, and its parsed contents deep-equal the returned attempt", () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(0, 999);
    const execFn: ScoringExecFn = () => fakeResult({ stdout: HAPPY_STDOUT });
    const attempt = scorePrediction({ queryId: 523, predDict: { "1": 0.9 }, outputDir, poolManifest: manifest, execFn });
    const onDisk = JSON.parse(readFileSync(attempt.artifactPath, "utf8"));
    expect(onDisk).toEqual(attempt);
  });

  it("two consecutive calls into the same outputDir produce two distinct artifactPath and attemptId values", () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(0, 999);
    const execFn: ScoringExecFn = () => fakeResult({ stdout: HAPPY_STDOUT });
    const a = scorePrediction({ queryId: 523, predDict: { "1": 0.9 }, outputDir, poolManifest: manifest, execFn });
    const b = scorePrediction({ queryId: 524, predDict: { "1": 0.9 }, outputDir, poolManifest: manifest, execFn });
    expect(a.artifactPath).not.toBe(b.artifactPath);
    expect(a.attemptId).not.toBe(b.attemptId);
  });

  it("two consecutive calls return receipts that are toEqual but not toBe — a fresh object per prediction", () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(0, 999);
    const execFn: ScoringExecFn = () => fakeResult({ stdout: HAPPY_STDOUT });
    const receiptA = scorePrediction({ queryId: 523, predDict: { "1": 0.9 }, outputDir, poolManifest: manifest, execFn }).receipt;
    const receiptB = scorePrediction({ queryId: 524, predDict: { "1": 0.9 }, outputDir, poolManifest: manifest, execFn }).receipt;
    expect(receiptA).toEqual(receiptB);
    expect(receiptA).not.toBe(receiptB);
  });

  it("the built receipt deep-equals the committed oracle-receipt.json fixture and passes validateReceipt", () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(0, 999);
    const execFn: ScoringExecFn = () => fakeResult({ stdout: HAPPY_STDOUT });
    const attempt = scorePrediction({ queryId: 523, predDict: { "1": 0.9 }, outputDir, poolManifest: manifest, execFn });
    const fixture = JSON.parse(readFileSync(join(fixtureDir, "oracle-receipt.json"), "utf8"));
    expect(attempt.receipt).toEqual(fixture);
  });

  it("predictions whose ids fall outside the manifest bounds are forfeited; min and max survive, min-1 and max+1 are forfeited", () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(10, 20);
    let capturedInput: string | undefined;
    const execFn: ScoringExecFn = (_file, _args, opts) => {
      capturedInput = opts.input;
      return fakeResult({ stdout: HAPPY_STDOUT });
    };
    const attempt = scorePrediction({
      queryId: 523,
      predDict: { "9": 0.1, "10": 0.2, "20": 0.3, "21": 0.4 },
      outputDir,
      poolManifest: manifest,
      execFn,
    });
    expect(JSON.parse(capturedInput!)).toEqual({ "10": 0.2, "20": 0.3 });
    expect(attempt.forfeitedIds.slice().sort()).toEqual(["21", "9"]);
    expect(attempt.forfeitedCount).toBe(2);
  });

  it("a predDict with exactly 20 entries reaches the execFn", () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(0, 999);
    const predDict: Record<string, number> = {};
    for (let i = 0; i < 20; i++) predDict[String(i)] = i / 20;
    let capturedInput: string | undefined;
    const execFn: ScoringExecFn = (_file, _args, opts) => {
      capturedInput = opts.input;
      return fakeResult({ stdout: HAPPY_STDOUT });
    };
    scorePrediction({ queryId: 523, predDict, outputDir, poolManifest: manifest, execFn });
    expect(Object.keys(JSON.parse(capturedInput!)).length).toBe(20);
  });

  it("a pre-filter miss (nothing survives) returns a prefilter-miss outcome without spawning at all", () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(10, 20);
    let execFnCalled = false;
    const execFn: ScoringExecFn = () => {
      execFnCalled = true;
      return fakeResult({ stdout: HAPPY_STDOUT });
    };
    const attempt = scorePrediction({
      queryId: 523,
      predDict: { "1": 0.1, "2": 0.2 },
      outputDir,
      poolManifest: manifest,
      execFn,
    });
    expect(execFnCalled).toBe(false);
    expect(attempt.outcome).toEqual({ outcome: "prefilter-miss", forfeitedIds: ["1", "2"] });
    expect(attempt.wallTimeMs).toBe(0);
  });
});

// ── Task 1: the six pre-invocation outcomes ─────────────────────────────

describe("validatePredDict / scorePrediction — pre-invocation outcomes decided before a process is spawned (Task 1)", () => {
  function countingExecFn(): { execFn: ScoringExecFn; count: () => number } {
    let execFnCallCount = 0;
    const execFn: ScoringExecFn = () => {
      execFnCallCount++;
      return fakeResult({ stdout: HAPPY_STDOUT });
    };
    return { execFn, count: () => execFnCallCount };
  }

  it("an empty predDict resolves to empty-prediction and never calls execFn", () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(0, 999);
    const { execFn, count } = countingExecFn();
    const attempt = scorePrediction({ queryId: 1, predDict: {}, outputDir, poolManifest: manifest, execFn });
    expect(attempt.outcome).toEqual({ outcome: "empty-prediction" });
    expect(count()).toBe(0);
  });

  it("an empty-prediction attempt still writes an artifact on disk and carries a receipt that passes validateReceipt", () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(0, 999);
    const { execFn } = countingExecFn();
    const attempt = scorePrediction({ queryId: 1, predDict: {}, outputDir, poolManifest: manifest, execFn });
    expect(attempt.artifactPath.length).toBeGreaterThan(0);
    const onDisk = JSON.parse(readFileSync(attempt.artifactPath, "utf8"));
    expect(onDisk).toEqual(attempt);
    expect(() => validateReceipt(attempt.receipt, "test")).not.toThrow();
  });

  it("21 entries resolves to over-cap carrying entryCount, and never calls execFn", () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(0, 999);
    const predDict: Record<string, number> = {};
    for (let i = 0; i < 21; i++) predDict[String(i)] = i / 21;
    const { execFn, count } = countingExecFn();
    const attempt = scorePrediction({ queryId: 1, predDict, outputDir, poolManifest: manifest, execFn });
    expect(attempt.outcome).toEqual({ outcome: "over-cap", entryCount: 21 });
    expect(count()).toBe(0);
  });

  it("the cap is checked on the caller's own list before filtering: 21 entries of which 5 are out of pool still resolves to over-cap, never a filtered 16-entry call", () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(100, 999); // ids 0-4 below are all out of pool
    const predDict: Record<string, number> = {};
    for (let i = 0; i < 21; i++) predDict[String(i)] = i / 21;
    const { execFn, count } = countingExecFn();
    const attempt = scorePrediction({ queryId: 1, predDict, outputDir, poolManifest: manifest, execFn });
    expect(attempt.outcome).toEqual({ outcome: "over-cap", entryCount: 21 });
    expect(count()).toBe(0);
  });

  it('{"7": 0.9, "007": 0.8} resolves to duplicate-prediction-id naming nodeId 7, and never calls execFn', () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(0, 999);
    const { execFn, count } = countingExecFn();
    const attempt = scorePrediction({
      queryId: 1,
      predDict: { "7": 0.9, "007": 0.8 },
      outputDir,
      poolManifest: manifest,
      execFn,
    });
    expect(attempt.outcome).toEqual({ outcome: "duplicate-prediction-id", nodeId: 7 });
    expect(count()).toBe(0);
  });

  it('{"abc": 0.5} resolves to non-integer-prediction-id naming key "abc"', () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(0, 999);
    const { execFn, count } = countingExecFn();
    const attempt = scorePrediction({
      queryId: 1,
      predDict: { abc: 0.5 },
      outputDir,
      poolManifest: manifest,
      execFn,
    });
    expect(attempt.outcome).toEqual({ outcome: "non-integer-prediction-id", key: "abc" });
    expect(count()).toBe(0);
  });

  it('{"7.5": 0.5} also resolves to non-integer-prediction-id naming key "7.5"', () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(0, 999);
    const { execFn, count } = countingExecFn();
    const attempt = scorePrediction({
      queryId: 1,
      predDict: { "7.5": 0.5 },
      outputDir,
      poolManifest: manifest,
      execFn,
    });
    expect(attempt.outcome).toEqual({ outcome: "non-integer-prediction-id", key: "7.5" });
    expect(count()).toBe(0);
  });

  it('{"7": NaN} resolves to non-finite-score naming key "7", and never calls execFn', () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(0, 999);
    const { execFn, count } = countingExecFn();
    const attempt = scorePrediction({
      queryId: 1,
      predDict: { "7": Number.NaN },
      outputDir,
      poolManifest: manifest,
      execFn,
    });
    expect(attempt.outcome).toEqual({ outcome: "non-finite-score", key: "7" });
    expect(count()).toBe(0);
  });

  it('{"7": Infinity} also resolves to non-finite-score naming key "7"', () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(0, 999);
    const { execFn, count } = countingExecFn();
    const attempt = scorePrediction({
      queryId: 1,
      predDict: { "7": Number.POSITIVE_INFINITY },
      outputDir,
      poolManifest: manifest,
      execFn,
    });
    expect(attempt.outcome).toEqual({ outcome: "non-finite-score", key: "7" });
    expect(count()).toBe(0);
  });

  it("a non-numeric value resolves to non-finite-score naming the key", () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(0, 999);
    const { execFn, count } = countingExecFn();
    const attempt = scorePrediction({
      queryId: 1,
      predDict: { "7": "not-a-number" as unknown as number },
      outputDir,
      poolManifest: manifest,
      execFn,
    });
    expect(attempt.outcome).toEqual({ outcome: "non-finite-score", key: "7" });
    expect(count()).toBe(0);
  });

  it("a predDict whose every id is outside the manifest's bounds resolves to prefilter-miss listing all of them, and never calls execFn", () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(100, 999);
    const { execFn, count } = countingExecFn();
    const attempt = scorePrediction({
      queryId: 1,
      predDict: { "1": 0.1, "2": 0.2 },
      outputDir,
      poolManifest: manifest,
      execFn,
    });
    expect(attempt.outcome).toEqual({ outcome: "prefilter-miss", forfeitedIds: ["1", "2"] });
    expect(count()).toBe(0);
  });

  it("validatePredDict returns null for an acceptable input", () => {
    expect(validatePredDict({ "1": 0.9, "2": 0.1 })).toBeNull();
  });
});

describe("preFilterPredictions — order preservation and bounds membership", () => {
  it("adds no sorting or re-ranking of its own: the surviving key order matches Object.entries(predDict)'s own order verbatim", () => {
    // Node ids are integer-like strings, so the JS engine itself always
    // enumerates them ascending regardless of literal-source order (a
    // property of the language, not this function). What E4 forbids is
    // preFilterPredictions adding a SECOND sort/re-rank on top of that —
    // asserting against Object.keys(predDict) itself (not a hand-written
    // literal order) proves nothing extra was imposed.
    const manifest = boundsManifest(0, 999);
    const predDict = { "5": 0.1, "3": 0.2, "9": 0.3 };
    const { filtered } = preFilterPredictions(predDict, manifest);
    expect(Object.keys(filtered)).toEqual(Object.keys(predDict));
  });
});

describe("parsePoolManifest — fail-closed field-by-field parsing", () => {
  function validRaw(): Record<string, unknown> {
    return {
      kb: "stark-prime",
      hfRevision: ADMISSION_RECORD.revisionSha,
      form: "bounds",
      count: 10,
      min: 0,
      max: 9,
      idListSha256: idListDigest([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    };
  }

  it("rejects a non-object", () => {
    expect(thrown(() => parsePoolManifest(null)).message).toContain("object");
  });

  it("rejects a missing kb field", () => {
    const raw = validRaw();
    delete raw.kb;
    expect(thrown(() => parsePoolManifest(raw)).message).toContain("kb");
  });

  it("rejects an invalid form value", () => {
    const raw = { ...validRaw(), form: "bogus" };
    expect(thrown(() => parsePoolManifest(raw)).message).toContain("form");
  });

  it("rejects count <= 0", () => {
    const raw = { ...validRaw(), count: 0 };
    expect(thrown(() => parsePoolManifest(raw)).message).toContain("count");
  });

  it("rejects min > max", () => {
    const raw = { ...validRaw(), min: 10, max: 5 };
    expect(thrown(() => parsePoolManifest(raw)).message).toContain("min");
  });

  it("rejects a bounds manifest whose count does not equal max - min + 1", () => {
    const raw = { ...validRaw(), count: 999 };
    expect(thrown(() => parsePoolManifest(raw)).message).toContain("count");
  });

  it("rejects an explicit-form manifest with no ids array", () => {
    const raw = { ...validRaw(), form: "explicit" };
    expect(thrown(() => parsePoolManifest(raw)).message).toContain("ids");
  });

  it("accepts a valid manifest", () => {
    expect(() => parsePoolManifest(validRaw())).not.toThrow();
  });
});

// ── Task 2: runScoringPreflight ─────────────────────────────────────────

describe("runScoringPreflight — field-by-field fingerprint, pin cross-check, warm-up (Task 2)", () => {
  const HUB_CACHE_ROOT = "/fake/hub/cache";
  const SCORE_ONE_BYTES = Buffer.from("score_one.py contents");
  const SKB_BYTES = Buffer.from("skb marker bytes");
  const HUB_BYTES = Buffer.from("hub marker bytes");
  const SKB_KEY = "skb:prime/processed/marker.bin";
  const HUB_KEY = "hub:qa/prime/eval-cache/marker.csv";
  const SKB_PATH = join(SKB_DATA_ROOT_REL, "prime/processed/marker.bin");
  const HUB_PATH = join(
    HUB_CACHE_ROOT,
    "datasets--snap-stanford--stark",
    "snapshots",
    ADMISSION_RECORD.revisionSha,
    "qa/prime/eval-cache/marker.csv",
  );

  function sha256(bytes: Buffer): string {
    return createHash("sha256").update(bytes).digest("hex");
  }

  function validFingerprintManifest(overrides: Partial<FingerprintManifest> = {}): FingerprintManifest {
    return {
      pythonPath: VENV_PYTHON_REL,
      pythonVersion: "3.11.15",
      starkQaVersion: "1.1.0",
      torchVersion: "2.13.0",
      hfPin: ADMISSION_RECORD.revisionSha,
      scoreOneSha256: sha256(SCORE_ONE_BYTES),
      cacheKeyFileSha256: {
        [SKB_KEY]: sha256(SKB_BYTES),
        [HUB_KEY]: sha256(HUB_BYTES),
      },
      ...overrides,
    };
  }

  function makeReadFileFn(): (path: string) => Buffer {
    return (path: string) => {
      if (path === SCORE_ONE_REL) return SCORE_ONE_BYTES;
      if (path === SKB_PATH) return SKB_BYTES;
      if (path === HUB_PATH) return HUB_BYTES;
      throw new Error(`unexpected path in test readFileFn: ${path}`);
    };
  }

  function makeExecFn(): ScoringExecFn {
    return (_file, args) => {
      if (args[0] === "-c") {
        return fakeResult({ stdout: "3.11.15\n2.13.0\n1.1.0\n" });
      }
      return fakeResult({ stdout: HAPPY_STDOUT });
    };
  }

  function baseArgs(overrides: {
    fingerprintManifest?: FingerprintManifest;
    poolManifest?: PoolManifest;
    execFn?: ScoringExecFn;
  } = {}) {
    return {
      fingerprintManifest: overrides.fingerprintManifest ?? validFingerprintManifest(),
      poolManifest: overrides.poolManifest ?? boundsManifest(0, 9),
      outputDir: scratchDir(),
      warmUp: { queryId: 523, predDict: { "1": 0.9 } },
      execFn: overrides.execFn ?? makeExecFn(),
      readFileFn: makeReadFileFn(),
      hubCacheRoot: HUB_CACHE_ROOT,
    };
  }

  it("passes when every field matches and returns a PreflightReport carrying the warm-up's wallTimeMs", () => {
    const report = runScoringPreflight(baseArgs());
    expect(report.fingerprintOk).toBe(true);
    expect(report.warmUpWallTimeMs).toBe(report.warmUpAttempt.wallTimeMs);
    expect(report.warmUpAttempt.outcome.outcome).toBe("scored");
  });

  it("a manifest differing in pythonVersion throws naming pythonVersion, expected, and observed", () => {
    const err = thrown(() =>
      runScoringPreflight(baseArgs({ fingerprintManifest: validFingerprintManifest({ pythonVersion: "3.12.0" }) })),
    );
    expect(err.message).toContain("pythonVersion");
    expect(err.message).toContain("3.12.0");
    expect(err.message).toContain("3.11.15");
  });

  it("a manifest differing in BOTH pythonVersion and torchVersion throws naming pythonVersion only", () => {
    const err = thrown(() =>
      runScoringPreflight(
        baseArgs({
          fingerprintManifest: validFingerprintManifest({ pythonVersion: "3.12.0", torchVersion: "9.9.9" }),
        }),
      ),
    );
    expect(err.message).toContain("pythonVersion");
    expect(err.message).not.toContain("torchVersion");
  });

  it("a manifest differing only in a cacheKeyFileSha256 entry throws naming that entry's key", () => {
    const err = thrown(() =>
      runScoringPreflight(
        baseArgs({
          fingerprintManifest: validFingerprintManifest({
            cacheKeyFileSha256: { [SKB_KEY]: "f".repeat(64), [HUB_KEY]: sha256(HUB_BYTES) },
          }),
        }),
      ),
    );
    expect(err.message).toContain(SKB_KEY);
  });

  it("a fingerprint manifest with only skb: keys is rejected at parse, naming cacheKeyFileSha256", () => {
    const raw = { ...validFingerprintManifest(), cacheKeyFileSha256: { [SKB_KEY]: sha256(SKB_BYTES) } };
    const err = thrown(() => parseFingerprintManifest(raw));
    expect(err.message).toContain("cacheKeyFileSha256");
  });

  it("a fingerprint manifest with only hub: keys is rejected at parse, naming cacheKeyFileSha256", () => {
    const raw = { ...validFingerprintManifest(), cacheKeyFileSha256: { [HUB_KEY]: sha256(HUB_BYTES) } };
    const err = thrown(() => parseFingerprintManifest(raw));
    expect(err.message).toContain("cacheKeyFileSha256");
  });

  it("a pool manifest whose hfRevision differs from the admission record's revisionSha throws naming hfRevision", () => {
    const manifest = boundsManifest(0, 9);
    const badManifest = { ...manifest, hfRevision: "deadbeef" };
    const err = thrown(() => runScoringPreflight(baseArgs({ poolManifest: badManifest })));
    expect(err.message).toContain("hfRevision");
    expect(err.message).toContain("deadbeef");
    expect(err.message).toContain(ADMISSION_RECORD.revisionSha);
  });

  it("a bounds pool manifest whose idListSha256 doesn't match the implied contiguous id list is rejected naming idListSha256", () => {
    const manifest = boundsManifest(0, 9);
    const badManifest = { ...manifest, idListSha256: "f".repeat(64) };
    const err = thrown(() => runScoringPreflight(baseArgs({ poolManifest: badManifest })));
    expect(err.message).toContain("idListSha256");
  });

  it("a warm-up call whose outcome is not scored throws rather than returning a report", () => {
    const execFn: ScoringExecFn = (_file, args) => {
      if (args[0] === "-c") return fakeResult({ stdout: "3.11.15\n2.13.0\n1.1.0\n" });
      return fakeResult({ status: 1, stdout: "", stderr: "boom" });
    };
    expect(() => runScoringPreflight(baseArgs({ execFn }))).toThrow();
  });

  it("scorePrediction succeeds with no fingerprint manifest supplied at all — runScoringPreflight is not called from inside it", () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(0, 999);
    const execFn: ScoringExecFn = () => fakeResult({ stdout: HAPPY_STDOUT });
    const attempt = scorePrediction({ queryId: 523, predDict: { "1": 0.9 }, outputDir, poolManifest: manifest, execFn });
    expect(attempt.outcome.outcome).toBe("scored");
  });
});

// ── Task 3: SC-2 hardening ───────────────────────────────────────────────

describe("scorePrediction — SC-2 hardening: two signals, pinned branch order, no read-back (Task 3)", () => {
  it("a timeout-coded error AND a SIGTERM signal together resolve to the timeout branch, not the signal branch", () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(0, 999);
    const timeoutError = Object.assign(new Error("spawnSync ETIMEDOUT"), { code: "ETIMEDOUT" });
    const execFn: ScoringExecFn = () =>
      fakeResult({ error: timeoutError, signal: "SIGTERM", status: null, stdout: "", stderr: "" });
    const err = thrown(() =>
      scorePrediction({ queryId: 1, predDict: { "1": 0.9 }, outputDir, poolManifest: manifest, execFn }),
    );
    expect(err.message).toContain("timeout");
    expect(err.message).not.toContain("signal");
  });

  it("status 0 with error set never resolves to scored — both signals are required, neither inferred from the other", () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(0, 999);
    const execFn: ScoringExecFn = () =>
      fakeResult({ error: new Error("spawn failed"), status: 0, signal: null, stdout: HAPPY_STDOUT });
    const err = thrown(() =>
      scorePrediction({ queryId: 1, predDict: { "1": 0.9 }, outputDir, poolManifest: manifest, execFn }),
    );
    expect(err.message).toContain("process-unreachable");
    expect(err.message).not.toContain("scored");
  });

  it("error undefined and status 0 but empty stdout never resolves to scored", () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(0, 999);
    const execFn: ScoringExecFn = () => fakeResult({ status: 0, error: undefined, signal: null, stdout: "" });
    const err = thrown(() =>
      scorePrediction({ queryId: 1, predDict: { "1": 0.9 }, outputDir, poolManifest: manifest, execFn }),
    );
    expect(err.message).toContain("malformed-stdout");
  });

  it("fifty consecutive calls into one outputDir produce fifty distinct artifactPath values", () => {
    const outputDir = scratchDir();
    const manifest = boundsManifest(0, 999);
    const execFn: ScoringExecFn = () => fakeResult({ stdout: HAPPY_STDOUT });
    const paths = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const attempt = scorePrediction({
        queryId: i,
        predDict: { "1": 0.9 },
        outputDir,
        poolManifest: manifest,
        execFn,
      });
      paths.add(attempt.artifactPath);
    }
    expect(paths.size).toBe(50);
  });

  it("a pre-existing sentinel file in outputDir is neither read nor overwritten by a fresh call", () => {
    const outputDir = scratchDir();
    const sentinelPath = join(outputDir, "attempt-stale.json");
    const sentinelContents = JSON.stringify({ stale: true });
    writeFileSync(sentinelPath, sentinelContents);
    const manifest = boundsManifest(0, 999);
    const execFn: ScoringExecFn = () => fakeResult({ stdout: HAPPY_STDOUT });
    const attempt = scorePrediction({
      queryId: 1,
      predDict: { "1": 0.9 },
      outputDir,
      poolManifest: manifest,
      execFn,
    });
    expect(readFileSync(sentinelPath, "utf8")).toBe(sentinelContents);
    expect(attempt.artifactPath).not.toBe(sentinelPath);
  });
});
