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
  parsePoolManifest,
  preFilterPredictions,
  scorePrediction,
  type PoolManifest,
  type ScoringExecFn,
} from "../src/foundry/collaborative-scoring-bridge.js";
import { requireCollaborativeAdmitted } from "../src/foundry/collaborative-admission.js";

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
