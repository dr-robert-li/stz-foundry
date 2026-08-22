/**
 * Contract suite for `runCollaborativeRound` (Phase 22 -- Collaborative
 * runner + tournament shell, Plan 22-01 tracer, REQ-80): split, selection,
 * promotion, and archive, driven through two candidates whose injected
 * provider double makes one strictly better on hit@1 than the other. Offline
 * throughout -- no venv, no network, no real STaRK.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { SpawnSyncReturns } from "node:child_process";
import {
  runCollaborativeRound,
  splitCollaborativeTasks,
} from "../src/foundry/collaborative-tournament-shell.js";
import {
  makeCollaborativeCandidate,
  SUBGRAPH_SCHEMA_VERSION,
  type CollaborativeCandidate,
  type KbNeighborhood,
} from "../src/foundry/collaborative-runner.js";
import type { CollaborativeBatteryTask } from "../src/foundry/collaborative-battery.js";
import {
  SCORE_ONE_REL,
  SKB_DATA_ROOT_REL,
  VENV_PYTHON_REL,
  type FingerprintManifest,
  type PoolManifest,
  type ScoringExecFn,
} from "../src/foundry/collaborative-scoring-bridge.js";
import { requireCollaborativeAdmitted } from "../src/foundry/collaborative-admission.js";
import { readComponentArchive } from "../src/harness.js";
import type { ChatRequest, ChatResponse, Provider } from "../src/foundry/provider.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const ADMISSION_RECORD = requireCollaborativeAdmitted("stark-prime");

function scratchDir(): string {
  return mkdtempSync(join(tmpdir(), "stz-collab-shell-"));
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

interface FixtureNeighborhood {
  seeds: number[];
  nodes: { id: number; label: string; type: string }[];
  edges: [number, number, number][];
  relationNames: Record<string, string>;
}
const FIXTURE = JSON.parse(
  readFileSync(join(repoRoot, "test", "fixtures", "collab", "neighborhoods.json"), "utf8"),
) as { neighborhoods: Record<string, FixtureNeighborhood> };

function kbNeighborhoodFn(queryId: number): KbNeighborhood {
  const nb = FIXTURE.neighborhoods[String(queryId)];
  if (!nb) throw new Error(`test fixture has no neighbourhood for queryId ${queryId}`);
  return { queryId, ...nb };
}

const HUB_CACHE_ROOT = "/fake/hub/cache/shell-test";
const SCORE_ONE_BYTES = Buffer.from("score_one.py contents (shell test fixture)");
const SKB_BYTES = Buffer.from("skb marker bytes (shell test fixture)");
const HUB_BYTES = Buffer.from("hub marker bytes (shell test fixture)");
const SKB_KEY = "skb:prime/processed/shell-test-marker.bin";
const HUB_KEY = "hub:qa/prime/shell-test-marker.csv";
const SKB_PATH = join(SKB_DATA_ROOT_REL, "prime/processed/shell-test-marker.bin");
const HUB_PATH = join(
  HUB_CACHE_ROOT,
  "datasets--snap-stanford--stark",
  "snapshots",
  ADMISSION_RECORD.revisionSha,
  "qa/prime/shell-test-marker.csv",
);

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const FINGERPRINT_MANIFEST: FingerprintManifest = {
  pythonPath: VENV_PYTHON_REL,
  pythonVersion: "3.11.15",
  starkQaVersion: "1.1.0",
  torchVersion: "2.13.0",
  hfPin: ADMISSION_RECORD.revisionSha,
  scoreOneSha256: sha256(SCORE_ONE_BYTES),
  cacheKeyFileSha256: { [SKB_KEY]: sha256(SKB_BYTES), [HUB_KEY]: sha256(HUB_BYTES) },
};

function readFileFnFixture(path: string): Buffer {
  if (path === SCORE_ONE_REL) return SCORE_ONE_BYTES;
  if (path === SKB_PATH) return SKB_BYTES;
  if (path === HUB_PATH) return HUB_BYTES;
  throw new Error(`unexpected path in test readFileFn: ${path}`);
}

function idListDigest(ids: number[]): string {
  return createHash("sha256").update(ids.join("\n")).digest("hex");
}

const POOL_IDS = Array.from({ length: 51 }, (_, i) => i); // 0..50, covers every fixture node id
const POOL_MANIFEST: PoolManifest = {
  kb: "prime",
  hfRevision: ADMISSION_RECORD.revisionSha,
  form: "explicit",
  count: POOL_IDS.length,
  min: 0,
  max: 50,
  idListSha256: idListDigest([...POOL_IDS].sort((a, b) => a - b)),
  ids: POOL_IDS,
};

const GOLD_ID_BY_QUERY: Record<number, number> = { 1001: 11, 1002: 21, 1003: 31, 1004: 41 };
const WRONG_ID_BY_QUERY: Record<number, number> = { 1001: 12, 1002: 22, 1003: 32, 1004: 42 };

/** Real Python-scoring stand-in: hit@1 is 1 exactly when the submitted
 *  predDict names that query's gold id, 0 otherwise -- discriminates the
 *  WINNING/LOSING answerer double below by their actual submitted content,
 *  not by a hard-coded per-query constant. */
function makeExecFn(): ScoringExecFn {
  return (_file, args, opts) => {
    if (args[0] === "-c") return fakeResult({ stdout: "3.11.15\n2.13.0\n1.1.0\n" });
    const queryId = Number(args[2]);
    const predDict = JSON.parse(opts.input) as Record<string, number>;
    const goldId = GOLD_ID_BY_QUERY[queryId];
    const hit1 = predDict[String(goldId)] !== undefined ? 1 : 0;
    return fakeResult({
      stdout: JSON.stringify({
        kb: "prime",
        query_id: queryId,
        hf_revision: ADMISSION_RECORD.revisionSha,
        metrics: { mrr: hit1, "hit@1": hit1, "hit@5": hit1, "recall@20": hit1 },
      }),
    });
  };
}

const ZERO_USAGE = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 };

function makeProvider(): Provider {
  return {
    kind: "openai",
    baseUrl: "http://test-provider.invalid",
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const system = req.system ?? "";
      const userText = req.messages[0]?.content ?? "";
      const match = userText.match(/QUERY_ID: (\d+)/);
      const queryId = match ? Number(match[1]) : NaN;
      if (system.includes("BUILDER-ROLE")) {
        const nb = kbNeighborhoodFn(queryId);
        const artifact = {
          schemaVersion: SUBGRAPH_SCHEMA_VERSION,
          queryId,
          kbRevision: ADMISSION_RECORD.revisionSha,
          nodes: nb.nodes.map((n) => n.id),
          edges: nb.edges,
        };
        return {
          text: "```path=subgraph.json\n" + JSON.stringify(artifact) + "\n```",
          model: req.model,
          usage: ZERO_USAGE,
        };
      }
      if (system.includes("ANSWERER-ROLE")) {
        const winning = system.includes("WINNING");
        const id = winning ? GOLD_ID_BY_QUERY[queryId] : WRONG_ID_BY_QUERY[queryId];
        return {
          text: "```path=answer.json\n" + JSON.stringify([id]) + "\n```",
          model: req.model,
          usage: ZERO_USAGE,
        };
      }
      throw new Error(`test provider: system prompt has no recognized role marker: ${system}`);
    },
  };
}

const WINNER: CollaborativeCandidate = makeCollaborativeCandidate(
  "BUILDER-ROLE prompt for the WINNING candidate.",
  "ANSWERER-ROLE WINNING prompt for the candidate.",
);
const LOSER: CollaborativeCandidate = makeCollaborativeCandidate(
  "BUILDER-ROLE prompt for the LOSING candidate.",
  "ANSWERER-ROLE LOSING prompt for the candidate.",
);

const TASKS: CollaborativeBatteryTask[] = [
  { id: "t-1001", queryId: 1001, prompt: "Query about entity 1001." },
  { id: "t-1002", queryId: 1002, prompt: "Query about entity 1002." },
  { id: "t-1003", queryId: 1003, prompt: "Query about entity 1003." },
  { id: "t-1004", queryId: 1004, prompt: "Query about entity 1004." },
];

// ── splitCollaborativeTasks ──────────────────────────────────────────────

describe("splitCollaborativeTasks", () => {
  it("returns halves with disjoint task ids and is deterministic across repeated calls", () => {
    const first = splitCollaborativeTasks(TASKS);
    const second = splitCollaborativeTasks(TASKS);
    const searchIds = new Set(first.search.map((t) => t.id));
    const promotionIds = new Set(first.promotion.map((t) => t.id));
    for (const id of searchIds) expect(promotionIds.has(id)).toBe(false);
    expect(first.search.map((t) => t.id)).toEqual(second.search.map((t) => t.id));
    expect(first.promotion.map((t) => t.id)).toEqual(second.promotion.map((t) => t.id));
  });
});

// ── runCollaborativeRound ────────────────────────────────────────────────

describe("runCollaborativeRound — split, selection, promotion, archive (Task 2)", () => {
  it("selects the better candidate, promotes it, and appends exactly one archive entry", async () => {
    const archiveRoot = scratchDir();
    const result = await runCollaborativeRound({
      candidates: [WINNER, LOSER],
      tasks: TASKS,
      runDir: scratchDir(),
      gateThreshold: 0.05,
      kbNeighborhoodFn,
      poolManifest: POOL_MANIFEST,
      fingerprintManifest: FINGERPRINT_MANIFEST,
      warmUp: { queryId: 1001, predDict: { "11": 1 } },
      incumbentFrontmatter: null,
      incumbentFitness: null,
      diversityFloor: 0,
      archive: { root: archiveRoot, slot: "collab-test-slot" },
      execFn: makeExecFn(),
      readFileFn: readFileFnFixture,
      hubCacheRoot: HUB_CACHE_ROOT,
      runOpts: { providerImpl: makeProvider() },
    });

    expect(result.winner).toBe(WINNER.id);
    expect(result.promotion).not.toBeNull();
    expect(result.promotion!.verdict.promote).toBe(true);
    expect(result.promotion!.verdict.failed).toEqual([]);

    const entries = readComponentArchive(archiveRoot, "collab-test-slot");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.artifact.specimenId).toBe(WINNER.id);
  });

  it("both minted answerer battery ids (search vs promotion half) differ", async () => {
    const archiveRoot = scratchDir();
    const result = await runCollaborativeRound({
      candidates: [WINNER, LOSER],
      tasks: TASKS,
      runDir: scratchDir(),
      gateThreshold: 0.05,
      kbNeighborhoodFn,
      poolManifest: POOL_MANIFEST,
      fingerprintManifest: FINGERPRINT_MANIFEST,
      warmUp: { queryId: 1001, predDict: { "11": 1 } },
      incumbentFrontmatter: null,
      incumbentFitness: null,
      diversityFloor: 0,
      archive: { root: archiveRoot, slot: "collab-test-slot-2" },
      execFn: makeExecFn(),
      readFileFn: readFileFnFixture,
      hubCacheRoot: HUB_CACHE_ROOT,
      runOpts: { providerImpl: makeProvider() },
    });
    const searchWinnerRun = result.searchRuns.get(result.winner!)!;
    expect(searchWinnerRun.answererBattery.id).not.toBe(result.promotionRun!.answererBattery.id);
  });

  it("the promotion-half battery/run pair the shell hands to promoteComponentWinner carries the same receipt object (SC-3)", async () => {
    const archiveRoot = scratchDir();
    const result = await runCollaborativeRound({
      candidates: [WINNER, LOSER],
      tasks: TASKS,
      runDir: scratchDir(),
      gateThreshold: 0.05,
      kbNeighborhoodFn,
      poolManifest: POOL_MANIFEST,
      fingerprintManifest: FINGERPRINT_MANIFEST,
      warmUp: { queryId: 1001, predDict: { "11": 1 } },
      incumbentFrontmatter: null,
      incumbentFitness: null,
      diversityFloor: 0,
      archive: { root: archiveRoot, slot: "collab-test-slot-3" },
      execFn: makeExecFn(),
      readFileFn: readFileFnFixture,
      hubCacheRoot: HUB_CACHE_ROOT,
      runOpts: { providerImpl: makeProvider() },
    });
    expect(
      Object.is(result.promotionRun!.fitnessRun.receipt, result.promotionRun!.answererBattery.receipt),
    ).toBe(true);
  });
});
