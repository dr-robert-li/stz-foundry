/**
 * Contract suite for `runCollaborativeRound` (Phase 22 -- Collaborative
 * runner + tournament shell, Plan 22-01 tracer, REQ-80): split, selection,
 * promotion, and archive, driven through two candidates whose injected
 * provider double makes one strictly better on hit@1 than the other. Offline
 * throughout -- no venv, no network, no real STaRK.
 */
import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { SpawnSyncReturns } from "node:child_process";
import {
  runCollaborativeRound,
  splitCollaborativeTasks,
  promoteWinnerSubgraphs,
  collaborativeBundleText,
} from "../src/foundry/collaborative-tournament-shell.js";
import * as selectionModule from "../src/selection.js";
import { evalReward } from "../src/selection.js";
import {
  makeCollaborativeCandidate,
  runCollaborativeBattery,
  mintCollaborativeReceipt,
  CollaborativeRunnerError,
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
import { readComponentArchive, componentDir } from "../src/harness.js";
import type { ChatRequest, ChatResponse, Provider } from "../src/foundry/provider.js";
import type { EvalResult } from "../src/types.js";

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

// ── Task 1: full single round -- N candidates, incumbent baseline, both
// archive outcomes ──────────────────────────────────────────────────────

/** A third, mid-scoring candidate: correct on query 1001 only (the search
 *  half's other query, 1003, is answered wrong), so its search-half mean
 *  hit@1 is exactly 0.5 -- strictly between WINNER's 1.0 and LOSER's 0.0. */
const MIDDLE: CollaborativeCandidate = makeCollaborativeCandidate(
  "BUILDER-ROLE prompt for the MIDDLE candidate.",
  "ANSWERER-ROLE MIDDLE prompt for the candidate.",
);

function makeThreeWayProvider(): Provider {
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
        let id: number;
        if (system.includes("WINNING")) {
          id = GOLD_ID_BY_QUERY[queryId]!;
        } else if (system.includes("MIDDLE")) {
          id = queryId === 1001 ? GOLD_ID_BY_QUERY[queryId]! : WRONG_ID_BY_QUERY[queryId]!;
        } else {
          id = WRONG_ID_BY_QUERY[queryId]!;
        }
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

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

describe("runCollaborativeRound — full single round (Task 1)", () => {
  it("a three-candidate round selects the highest mean-hit@1 candidate and reports one advantage per candidate", async () => {
    const archiveRoot = scratchDir();
    const result = await runCollaborativeRound({
      candidates: [WINNER, MIDDLE, LOSER],
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
      archive: { root: archiveRoot, slot: "three-way-slot" },
      execFn: makeExecFn(),
      readFileFn: readFileFnFixture,
      hubCacheRoot: HUB_CACHE_ROOT,
      runOpts: { providerImpl: makeThreeWayProvider() },
    });

    expect(result.winner).toBe(WINNER.id);
    expect(result.judgment.advantages).toHaveLength(3);
    const advSpecimens = new Set(result.judgment.advantages.map((a) => a.specimen));
    expect(advSpecimens).toEqual(new Set([WINNER.id, MIDDLE.id, LOSER.id]));
  });

  it("a candidate whose mean hit@1 falls below the gate threshold is eliminated and cannot win, even as the sole candidate", async () => {
    const result = await runCollaborativeRound({
      candidates: [LOSER],
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
      execFn: makeExecFn(),
      readFileFn: readFileFnFixture,
      hubCacheRoot: HUB_CACHE_ROOT,
      runOpts: { providerImpl: makeProvider() },
    });

    expect(result.winner).toBeNull();
    expect(result.promotion).toBeNull();
    expect(result.promotionRun).toBeNull();
    expect(result.archiveEntry).toBeNull();
    expect(result.promoted).toEqual([]);
    expect(result.receipt).toBeNull();
  });

  it("an all-eliminated round returns the explicit no-winner outcome rather than throwing or promoting", async () => {
    await expect(
      runCollaborativeRound({
        candidates: [LOSER],
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
        archive: { root: scratchDir(), slot: "no-winner-slot" },
        execFn: makeExecFn(),
        readFileFn: readFileFnFixture,
        hubCacheRoot: HUB_CACHE_ROOT,
        runOpts: { providerImpl: makeProvider() },
      }),
    ).resolves.toMatchObject({ winner: null, promotion: null });
  });

  it("a refused promotion still appends exactly one archive entry recording the failing gate", async () => {
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
      // No leading "---" line ⇒ agentFrontmatter(...) === "", which can never
      // equal the winner's real (non-empty) frontmatter block -- a
      // deterministic interface-parity refusal that touches no other gate.
      incumbentFrontmatter: "plain text with no frontmatter delimiter at all",
      incumbentFitness: null,
      diversityFloor: 0,
      archive: { root: archiveRoot, slot: "refusal-slot" },
      execFn: makeExecFn(),
      readFileFn: readFileFnFixture,
      hubCacheRoot: HUB_CACHE_ROOT,
      runOpts: { providerImpl: makeProvider() },
    });

    expect(result.promotion!.verdict.promote).toBe(false);
    expect(result.promotion!.verdict.failed).toContain("interface-parity-broken");
    expect(result.promotion!.verdict.failed.length).toBeGreaterThan(0);

    const entries = readComponentArchive(archiveRoot, "refusal-slot");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.gates.interfaceParity).toBe(false);
  });

  it("a second round against the same archive root reads the first round's entry as incumbent, leaving the first byte-identical", async () => {
    const archiveRoot = scratchDir();
    const roundArgs = {
      candidates: [WINNER, LOSER],
      tasks: TASKS,
      gateThreshold: 0.05,
      kbNeighborhoodFn,
      poolManifest: POOL_MANIFEST,
      fingerprintManifest: FINGERPRINT_MANIFEST,
      warmUp: { queryId: 1001, predDict: { "11": 1 } },
      incumbentFrontmatter: null,
      incumbentFitness: null,
      diversityFloor: 0,
      archive: { root: archiveRoot, slot: "repeat-slot" },
      execFn: makeExecFn(),
      readFileFn: readFileFnFixture,
      hubCacheRoot: HUB_CACHE_ROOT,
      runOpts: { providerImpl: makeProvider() },
    };
    await runCollaborativeRound({ ...roundArgs, runDir: scratchDir() });
    const firstEntries = readComponentArchive(archiveRoot, "repeat-slot");
    expect(firstEntries).toHaveLength(1);
    const firstEntrySnapshot = JSON.parse(JSON.stringify(firstEntries[0]));

    await runCollaborativeRound({ ...roundArgs, runDir: scratchDir() });
    const secondEntries = readComponentArchive(archiveRoot, "repeat-slot");
    expect(secondEntries).toHaveLength(2);
    expect(secondEntries[0]).toEqual(firstEntrySnapshot);
    expect(secondEntries[1]!.parent).toBe(firstEntries[0]!.variantId);
  });

  it("the winner's archive entry carries the two-prompt-derived specimen id and the canonical bundle definitionText", async () => {
    const archiveRoot = scratchDir();
    await runCollaborativeRound({
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
      archive: { root: archiveRoot, slot: "definition-text-slot" },
      execFn: makeExecFn(),
      readFileFn: readFileFnFixture,
      hubCacheRoot: HUB_CACHE_ROOT,
      runOpts: { providerImpl: makeProvider() },
    });
    const entries = readComponentArchive(archiveRoot, "definition-text-slot");
    expect(entries[0]!.artifact.specimenId).toBe(WINNER.id);
    // definitionText is not itself persisted on ComponentArchiveEntry (only
    // its hash, artifact.definitionHash) -- prove the entry's hash is
    // derived from exactly collaborativeBundleText(WINNER), the canonical
    // bundle text, by recomputing the same hash the harness helper uses.
    const expectedHash = createHash("sha256")
      .update(collaborativeBundleText(WINNER))
      .digest("hex")
      .slice(0, 16);
    expect(entries[0]!.artifact.definitionHash).toBe(expectedHash);
    expect(entries[0]!.variantId).toBe(expectedHash);
  });

  it("passes an empty votes array to select() -- D-14, no judge call", async () => {
    const spy = vi.spyOn(selectionModule, "select");
    try {
      await runCollaborativeRound({
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
        execFn: makeExecFn(),
        readFileFn: readFileFnFixture,
        hubCacheRoot: HUB_CACHE_ROOT,
        runOpts: { providerImpl: makeProvider() },
      });
      expect(spy).toHaveBeenCalledTimes(1);
      const votesArg = spy.mock.calls[0]![1];
      expect(votesArg).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });

  it("with no prior archive entry the interface-parity gate passes trivially (null incumbent, nothing to diverge from)", async () => {
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
      execFn: makeExecFn(),
      readFileFn: readFileFnFixture,
      hubCacheRoot: HUB_CACHE_ROOT,
      runOpts: { providerImpl: makeProvider() },
    });
    expect(result.promotion!.inputs.interfaceParity).toBe(true);
  });

  it("records each candidate's per-role componentVariantId as diagnostics only, never as the specimen id", async () => {
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
      execFn: makeExecFn(),
      readFileFn: readFileFnFixture,
      hubCacheRoot: HUB_CACHE_ROOT,
      runOpts: { providerImpl: makeProvider() },
    });
    const diag = result.diagnostics.componentVariantIds[WINNER.id]!;
    expect(diag.builder).not.toBe(WINNER.id);
    expect(diag.answerer).not.toBe(WINNER.id);
    expect(diag.builder).not.toBe(diag.answerer);
    expect(result.diagnostics.componentVariantIds[LOSER.id]).toBeDefined();
  });
});

// ── Task 2: CD-03 winner-only subgraph promotion, receipt identity ────────

describe("promoteWinnerSubgraphs — CD-03 winner-only promotion (Task 2)", () => {
  it("promotes one artifact per promotion-half query under the winner's namespaced directory, sha256-verified against the handoff record", async () => {
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
      archive: { root: archiveRoot, slot: "cd03-slot" },
      execFn: makeExecFn(),
      readFileFn: readFileFnFixture,
      hubCacheRoot: HUB_CACHE_ROOT,
      runOpts: { providerImpl: makeProvider() },
    });

    expect(result.promoted).toHaveLength(result.promotionRun!.handoffRecords.length);
    for (const p of result.promoted) {
      expect(existsSync(p.artifactPath)).toBe(true);
      const bytes = readFileSync(p.artifactPath);
      const actualSha256 = createHash("sha256").update(bytes).digest("hex");
      expect(actualSha256).toBe(p.sha256);
      const handoff = result.promotionRun!.handoffRecords.find((h) => h.queryId === p.queryId)!;
      expect(p.sha256).toBe(handoff.artifactSha256);
    }
  });

  it("no file anywhere under the archive root contains a losing candidate's specimen id in its path", async () => {
    const archiveRoot = scratchDir();
    await runCollaborativeRound({
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
      archive: { root: archiveRoot, slot: "cd03-no-loser-slot" },
      execFn: makeExecFn(),
      readFileFn: readFileFnFixture,
      hubCacheRoot: HUB_CACHE_ROOT,
      runOpts: { providerImpl: makeProvider() },
    });
    const allFiles = walkFiles(archiveRoot);
    expect(allFiles.length).toBeGreaterThan(0);
    for (const f of allFiles) expect(f).not.toContain(LOSER.id);
  });

  it("refuses a promotion whose source artifact was tampered after the handoff record was written, naming the query id and both digests", async () => {
    const runDir = scratchDir();
    const archiveRoot = scratchDir();
    const receipt = mintCollaborativeReceipt();
    const promotionRun = await runCollaborativeBattery({
      candidate: WINNER,
      tasks: [TASKS[1]!], // t-1002, queryId 1002
      batteryIdPrefix: "tamper-test",
      artifactDir: join(runDir, "promotion", WINNER.id),
      scoringOutputDir: join(runDir, "promotion", WINNER.id, "scoring"),
      receipt,
      gateThreshold: 0.05,
      kbNeighborhoodFn,
      poolManifest: POOL_MANIFEST,
      fingerprintManifest: FINGERPRINT_MANIFEST,
      warmUp: { queryId: 1001, predDict: { "11": 1 } },
      execFn: makeExecFn(),
      readFileFn: readFileFnFixture,
      hubCacheRoot: HUB_CACHE_ROOT,
      runOpts: { providerImpl: makeProvider() },
    });

    const handoff = promotionRun.handoffRecords[0]!;
    const tamperedBytes = Buffer.from("tampered bytes, not the hashed-at-handoff artifact");
    writeFileSync(handoff.artifactPath, tamperedBytes);
    const observedSha256 = createHash("sha256").update(tamperedBytes).digest("hex");

    let thrown: Error | null = null;
    try {
      promoteWinnerSubgraphs({
        archiveRoot,
        slot: "tamper-slot",
        winnerVariantId: "abc123abc123abcd",
        promotionRun,
      });
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown).not.toBeNull();
    // Names the query id and BOTH digests -- the recorded (handoff) digest
    // and the observed (post-tamper) digest.
    expect(thrown!.message).toContain(String(handoff.queryId));
    expect(thrown!.message).toContain(handoff.artifactSha256);
    expect(thrown!.message).toContain(observedSha256);
  });

  it("refuses a slot name containing a traversal sequence before any directory is created", async () => {
    const runDir = scratchDir();
    const archiveRoot = scratchDir();
    const receipt = mintCollaborativeReceipt();
    const promotionRun = await runCollaborativeBattery({
      candidate: WINNER,
      tasks: [TASKS[1]!],
      batteryIdPrefix: "traversal-test",
      artifactDir: join(runDir, "promotion", WINNER.id),
      scoringOutputDir: join(runDir, "promotion", WINNER.id, "scoring"),
      receipt,
      gateThreshold: 0.05,
      kbNeighborhoodFn,
      poolManifest: POOL_MANIFEST,
      fingerprintManifest: FINGERPRINT_MANIFEST,
      warmUp: { queryId: 1001, predDict: { "11": 1 } },
      execFn: makeExecFn(),
      readFileFn: readFileFnFixture,
      hubCacheRoot: HUB_CACHE_ROOT,
      runOpts: { providerImpl: makeProvider() },
    });

    let thrown: Error | null = null;
    try {
      promoteWinnerSubgraphs({
        archiveRoot,
        slot: "../../evil",
        winnerVariantId: "abc123abc123abcd",
        promotionRun,
      });
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown).not.toBeNull();
    // WR-03: asserts on the guard's own label and its path-traversal
    // wording, taken verbatim from taxonomy.ts's assertSafePathSegment --
    // never merely that something threw.
    expect(thrown!.message).toContain("component slot");
    expect(thrown!.message).toMatch(/path-traversal guard/);
    // Nothing was created under archiveRoot -- the guard fires before mkdirSync.
    expect(readdirSync(archiveRoot)).toHaveLength(0);
  });

  it("threads receipt and attempt object identity from the bridge/runner through to the round result (D-10/SC-3)", async () => {
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
      archive: { root: archiveRoot, slot: "identity-slot" },
      execFn: makeExecFn(),
      readFileFn: readFileFnFixture,
      hubCacheRoot: HUB_CACHE_ROOT,
      runOpts: { providerImpl: makeProvider() },
    });

    expect(Object.is(result.receipt, result.promotionRun!.answererBattery.receipt)).toBe(true);
    expect(Object.is(result.receipt, result.promotionRun!.fitnessRun.receipt)).toBe(true);
    // Index-aligned identity, exactly as the acceptance criterion states:
    // Object.is(result.promoted[i].attempt, winnerRunRecord.attempts[i]).
    expect(result.promoted.length).toBe(result.promotionRun!.attempts.length);
    for (let i = 0; i < result.promoted.length; i++) {
      expect(Object.is(result.promoted[i]!.attempt, result.promotionRun!.attempts[i]!)).toBe(true);
    }
  });

  it("a refused round creates no promoted-artifact directory while still appending its archive entry", async () => {
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
      incumbentFrontmatter: "plain text with no frontmatter delimiter at all",
      incumbentFitness: null,
      diversityFloor: 0,
      archive: { root: archiveRoot, slot: "refused-cd03-slot" },
      execFn: makeExecFn(),
      readFileFn: readFileFnFixture,
      hubCacheRoot: HUB_CACHE_ROOT,
      runOpts: { providerImpl: makeProvider() },
    });

    expect(result.promotion!.verdict.promote).toBe(false);
    expect(result.promoted).toEqual([]);
    expect(existsSync(join(componentDir(archiveRoot, "refused-cd03-slot"), "subgraphs"))).toBe(false);
    const entries = readComponentArchive(archiveRoot, "refused-cd03-slot");
    expect(entries).toHaveLength(1);
  });
});

// ── Task 3: SC-2 verbatim-reuse proof, reward-transform arithmetic ────────

describe("evalReward transform arithmetic (Task 3, RESEARCH Pitfall 4)", () => {
  it("equals 0.45 * meanHit1 + 0.25 for the D-09 adapter's zero-coverage/mutation/codeHealth shape", () => {
    for (const meanHit1 of [0, 0.5, 1]) {
      const adapterResult: EvalResult = {
        specimen: "s",
        passedGate: true,
        testPassRate: meanHit1,
        coverage: 0,
        mutationScore: 0,
        codeHealth: 0,
        hackFindings: [],
      };
      expect(evalReward(adapterResult)).toBeCloseTo(0.45 * meanHit1 + 0.25, 12);
    }
  });

  it("is NOT equal to the raw mean hit@1 at a mid-range value", () => {
    const adapterResult: EvalResult = {
      specimen: "s",
      passedGate: true,
      testPassRate: 0.5,
      coverage: 0,
      mutationScore: 0,
      codeHealth: 0,
      hackFindings: [],
    };
    expect(evalReward(adapterResult)).not.toBe(0.5);
  });

  it("is strictly monotone increasing in mean hit@1", () => {
    const lower: EvalResult = {
      specimen: "a",
      passedGate: true,
      testPassRate: 0.3,
      coverage: 0,
      mutationScore: 0,
      codeHealth: 0,
      hackFindings: [],
    };
    const higher: EvalResult = { ...lower, specimen: "b", testPassRate: 0.7 };
    expect(evalReward(higher)).toBeGreaterThan(evalReward(lower));
  });
});

describe("SC-2 verbatim reuse — imports and gate vocabulary (Task 3)", () => {
  const shellSource = readFileSync(
    join(repoRoot, "src", "foundry", "collaborative-tournament-shell.ts"),
    "utf8",
  );

  it("imports select/evalReward, promoteComponentWinner, and the archive functions from their canonical modules", () => {
    expect(shellSource).toContain('from "../selection.js"');
    expect(shellSource).toContain('from "./component-tournament.js"');
    expect(shellSource).toContain('from "../harness.js"');
  });

  it("a refused verdict's failed array contains only strings from promotionGate's own named vocabulary", async () => {
    const PROMOTION_GATE_VOCABULARY = new Set([
      "does-not-beat-incumbent",
      "hack-findings-on-own-outputs",
      "seal-integrity-drift",
      "interface-parity-broken",
      "generation-variance-collapsed",
      "judge-rubric-not-calibrated",
      "fitness-lineage-not-exogenous",
    ]);
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
      incumbentFrontmatter: "plain text with no frontmatter delimiter at all",
      incumbentFitness: null,
      diversityFloor: 0,
      archive: { root: archiveRoot, slot: "vocab-slot" },
      execFn: makeExecFn(),
      readFileFn: readFileFnFixture,
      hubCacheRoot: HUB_CACHE_ROOT,
      runOpts: { providerImpl: makeProvider() },
    });
    expect(result.promotion!.verdict.failed.length).toBeGreaterThan(0);
    for (const reason of result.promotion!.verdict.failed) {
      expect(PROMOTION_GATE_VOCABULARY.has(reason)).toBe(true);
    }
  });
});

// ── T-23-08: a round in which no pair produces a valid artifact ──────────

describe("runCollaborativeRound tolerates a pair whose handoffs all fail (T-23-08)", () => {
  it("completes the round with no winner and no promotion instead of crashing on a zero-task answerer battery", async () => {
    const archiveRoot = scratchDir();
    // Every builder response is unparseable, for every candidate and every
    // query -- the live shape Plan 23-06's probe measured (0/30 structurally
    // valid artifacts). Before this fix, `makeBattery`'s zero-task refusal
    // propagated out of the runner and killed the whole round here.
    const brokenBuilderProvider: Provider = {
      kind: "openai",
      baseUrl: "http://test-provider.invalid",
      async chat(req: ChatRequest): Promise<ChatResponse> {
        return {
          text: "```path=subgraph.json\nNOT VALID JSON{{{\n```",
          model: req.model,
          usage: ZERO_USAGE,
        };
      },
    };

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
      archive: { root: archiveRoot, slot: "all-handoffs-failed-slot" },
      execFn: makeExecFn(),
      readFileFn: readFileFnFixture,
      hubCacheRoot: HUB_CACHE_ROOT,
      runOpts: { providerImpl: brokenBuilderProvider },
    });

    // A pair with no valid artifacts scores 0, fails the accuracy gate, and
    // is eliminated before ranking -- so the round is a no-winner round, and
    // the promotion/archive half never runs.
    expect(result.winner).toBeNull();
    expect(result.promotion).toBeNull();
    expect(result.promotionRun).toBeNull();
    expect(result.archiveEntry).toBeNull();
    expect(result.promoted).toEqual([]);

    // Each search run is an ordinary record the shell could aggregate:
    // every task counted, every hit@1 zero, the answerer pass marked skipped.
    for (const candidate of [WINNER, LOSER]) {
      const run = result.searchRuns.get(candidate.id)!;
      expect(run.answererBatterySkipped).toEqual({ reason: "all-handoffs-failed" });
      expect(run.outcomes).toHaveLength(2); // the search half of four tasks
      for (const o of run.outcomes) expect(o.hit1).toBe(0);
      expect(run.fitnessRun.result.testPassRate).toBe(0);
    }
  });
});

describe("runCollaborativeRound tolerates a query whose KB neighbourhood refuses (T-23-08)", () => {
  it("records the refusing query as one miss and still completes the round, selecting and promoting a winner", async () => {
    const archiveRoot = scratchDir();
    // Query 1001 is the first in ascending order, so it lands in the search
    // half -- the exact position query 1384 held in the live selection pool
    // when its FA-7 empty-seed refusal killed the whole round at T+82s.
    const refusingNeighbourhoodFn = (queryId: number): KbNeighborhood => {
      if (queryId === 1001) {
        throw new CollaborativeRunnerError(
          `kbNeighborhoodFn: neighbourhood extraction for query ${queryId} produced invalid output -- ` +
            `the helper found no seed entity for this query -- no KB node name matched the query text ` +
            `via query-text seeding (FA-7) (an empty seed set is a refusal, never an empty-but-successful neighbourhood)`,
        );
      }
      return kbNeighborhoodFn(queryId);
    };

    const result = await runCollaborativeRound({
      candidates: [WINNER, LOSER],
      tasks: TASKS,
      runDir: scratchDir(),
      gateThreshold: 0.05,
      kbNeighborhoodFn: refusingNeighbourhoodFn,
      poolManifest: POOL_MANIFEST,
      fingerprintManifest: FINGERPRINT_MANIFEST,
      warmUp: { queryId: 1002, predDict: { "21": 1 } },
      incumbentFrontmatter: null,
      incumbentFitness: null,
      diversityFloor: 0,
      archive: { root: archiveRoot, slot: "refusing-neighbourhood-slot" },
      execFn: makeExecFn(),
      readFileFn: readFileFnFixture,
      hubCacheRoot: HUB_CACHE_ROOT,
      runOpts: { providerImpl: makeProvider() },
    });

    expect(result.winner).toBe(WINNER.id);
    const winnerSearchRun = result.searchRuns.get(WINNER.id)!;
    const refused = winnerSearchRun.outcomes.find((o) => o.queryId === 1001)!;
    expect(refused.handoffOutcome.kind).toBe("neighbourhood-refused");
    expect(refused.hit1).toBe(0);
    // The refusal costs one query, not the round: the other search-half
    // query still scored, and the promotion half ran to a verdict.
    expect(winnerSearchRun.outcomes).toHaveLength(2);
    expect(winnerSearchRun.outcomes.find((o) => o.queryId === 1003)!.hit1).toBe(1);
    expect(result.promotionRun).not.toBeNull();
    expect(result.archiveEntry).not.toBeNull();
  });
});
