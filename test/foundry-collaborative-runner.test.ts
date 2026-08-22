/**
 * Contract suite for `runCollaborativeBattery` (Phase 22 -- Collaborative
 * runner + tournament shell, Plan 22-01 tracer, REQ-80), driven entirely
 * through three injected seams -- a `providerImpl` double keying its
 * response off the candidate's own system-prompt role marker, a
 * `kbNeighborhoodFn` reading the synthetic fixture, and a `ScoringExecFn`
 * double -- no venv, no network, no real STaRK. Every throwing assertion
 * checks the thrown message's CONTENT, never a bare `.toThrow()` with no
 * argument -- same house rule as `test/foundry-collaborative-scoring-bridge.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { SpawnSyncReturns } from "node:child_process";
import {
  runCollaborativeBattery,
  makeCollaborativeCandidate,
  canonicalSubgraphBytes,
  hashSubgraphArtifact,
  SUBGRAPH_SCHEMA_VERSION,
  type CollaborativeCandidate,
  type KbNeighborhood,
  type RunCollaborativeBatteryArgs,
  type SubgraphArtifactV1,
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
import type { ChatRequest, ChatResponse, Provider } from "../src/foundry/provider.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const ADMISSION_RECORD = requireCollaborativeAdmitted("stark-prime");

function thrown(fn: () => unknown): Error {
  try {
    fn();
  } catch (e) {
    return e as Error;
  }
  throw new Error("expected fn to throw, it did not");
}

async function thrownAsync(fn: () => Promise<unknown>): Promise<Error> {
  try {
    await fn();
  } catch (e) {
    return e as Error;
  }
  throw new Error("expected fn to reject, it did not");
}

function scratchDir(): string {
  return mkdtempSync(join(tmpdir(), "stz-collab-runner-"));
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

// ── synthetic fixture load ──────────────────────────────────────────────

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

// ── preflight fixture (mirrors test/foundry-collaborative-scoring-bridge.test.ts's
// Task 2 pattern: synthetic fingerprint manifest + injected readFileFn/hubCacheRoot,
// so no real venv/cache file is ever touched) ───────────────────────────
const HUB_CACHE_ROOT = "/fake/hub/cache/runner-test";
const SCORE_ONE_BYTES = Buffer.from("score_one.py contents (runner test fixture)");
const SKB_BYTES = Buffer.from("skb marker bytes (runner test fixture)");
const HUB_BYTES = Buffer.from("hub marker bytes (runner test fixture)");
const SKB_KEY = "skb:prime/processed/runner-test-marker.bin";
const HUB_KEY = "hub:qa/prime/runner-test-marker.csv";
const SKB_PATH = join(SKB_DATA_ROOT_REL, "prime/processed/runner-test-marker.bin");
const HUB_PATH = join(
  HUB_CACHE_ROOT,
  "datasets--snap-stanford--stark",
  "snapshots",
  ADMISSION_RECORD.revisionSha,
  "qa/prime/runner-test-marker.csv",
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

const POOL_IDS = Array.from({ length: 401 }, (_, i) => i); // 0..400, covers every id these tests submit
const POOL_MANIFEST: PoolManifest = {
  kb: "prime",
  hfRevision: ADMISSION_RECORD.revisionSha,
  form: "explicit",
  count: POOL_IDS.length,
  min: 0,
  max: 400,
  idListSha256: idListDigest([...POOL_IDS].sort((a, b) => a - b)),
  ids: POOL_IDS,
};

function makeExecFn(hit1ByQueryId: Record<number, number>): ScoringExecFn {
  return (_file, args) => {
    if (args[0] === "-c") {
      return fakeResult({ stdout: "3.11.15\n2.13.0\n1.1.0\n" });
    }
    const queryId = Number(args[2]);
    const hit1 = hit1ByQueryId[queryId] ?? 1;
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
const BUILDER_SENTINEL = "BUILDER_FREE_TEXT_SENTINEL_MUST_NOT_LEAK_TO_ANSWERER";

/** Test provider double: keys off the candidate's own system-prompt role
 *  marker (same idiom as test/foundry-component-tournament.test.ts's
 *  WINNING/LOSING marker), and off a QUERY_ID line the runner's own prompt
 *  builders embed in the user message. */
function makeProvider(answerListsByQueryId: Record<number, unknown[]>): {
  provider: Provider;
  callCount: () => number;
} {
  let calls = 0;
  const provider: Provider = {
    kind: "openai",
    baseUrl: "http://test-provider.invalid",
    async chat(req: ChatRequest): Promise<ChatResponse> {
      calls++;
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
          note: BUILDER_SENTINEL,
        };
        return {
          text: "```path=subgraph.json\n" + JSON.stringify(artifact) + "\n```",
          model: req.model,
          usage: ZERO_USAGE,
        };
      }
      if (system.includes("ANSWERER-ROLE")) {
        const list = answerListsByQueryId[queryId] ?? [];
        return {
          text: "```path=answer.json\n" + JSON.stringify(list) + "\n```",
          model: req.model,
          usage: ZERO_USAGE,
        };
      }
      throw new Error(`test provider: system prompt has no recognized role marker: ${system}`);
    },
  };
  return { provider, callCount: () => calls };
}

const CANDIDATE: CollaborativeCandidate = makeCollaborativeCandidate(
  "BUILDER-ROLE system prompt for the collaborative candidate under test.",
  "ANSWERER-ROLE system prompt for the collaborative candidate under test.",
);

const TASKS: CollaborativeBatteryTask[] = [
  { id: "task-a", queryId: 1001, prompt: "Which entity does this describe (task A)?" },
  { id: "task-b", queryId: 1002, prompt: "Which entity does this describe (task B)?" },
];

function buildCd01RankedList(): unknown[] {
  const list: unknown[] = ["not-an-integer", 300, 300];
  for (let i = 0; i < 22; i++) list.push(301 + i); // 301..322, 22 distinct ids
  return list; // total raw entries = 25
}

function baseArgs(overrides: Partial<RunCollaborativeBatteryArgs> = {}): RunCollaborativeBatteryArgs {
  return {
    candidate: CANDIDATE,
    tasks: TASKS,
    batteryIdPrefix: "collab-test",
    receipt: {
      kind: "constructed",
      acceptedBy: ADMISSION_RECORD.acceptedBy,
      lineage: [ADMISSION_RECORD.lineage, `constructed:hf:snap-stanford/stark@${ADMISSION_RECORD.revisionSha}`],
    },
    gateThreshold: 0.05,
    artifactDir: scratchDir(),
    scoringOutputDir: scratchDir(),
    kbNeighborhoodFn,
    poolManifest: POOL_MANIFEST,
    fingerprintManifest: FINGERPRINT_MANIFEST,
    warmUp: { queryId: 1, predDict: { "1": 1 } },
    readFileFn: readFileFnFixture,
    hubCacheRoot: HUB_CACHE_ROOT,
    ...overrides,
  };
}

// ── Task 2: runCollaborativeBattery end to end ──────────────────────────

describe("runCollaborativeBattery — end to end, offline (Task 2)", () => {
  it("runs one candidate pair through preflight, both passes, handoff, and bridge scoring", async () => {
    const { provider } = makeProvider({
      1001: buildCd01RankedList(),
      1002: [21],
    });
    const record = await runCollaborativeBattery(
      baseArgs({
        execFn: makeExecFn({ 1001: 0, 1002: 1 }),
        runOpts: { providerImpl: provider },
      }),
    );
    expect(record.preflight.fingerprintOk).toBe(true);
    expect(record.attempts).toHaveLength(2);
    expect(record.outcomes).toHaveLength(2);
    expect(record.handoffRecords).toHaveLength(2);
  });

  it("threads the SAME receipt object through both battery mints and the fitness run", async () => {
    const { provider } = makeProvider({ 1001: [11], 1002: [21] });
    const receipt = {
      kind: "constructed" as const,
      acceptedBy: ADMISSION_RECORD.acceptedBy,
      lineage: [ADMISSION_RECORD.lineage, `constructed:hf:snap-stanford/stark@${ADMISSION_RECORD.revisionSha}`],
    };
    const record = await runCollaborativeBattery(
      baseArgs({
        receipt,
        execFn: makeExecFn({ 1001: 1, 1002: 1 }),
        runOpts: { providerImpl: provider },
      }),
    );
    // `makeBattery` defensively copies the receipt at mint time
    // (battery-types.ts's `Object.freeze({...draft.receipt, lineage: [...]})`),
    // so `builderBattery.receipt`/`answererBattery.receipt` are each their
    // OWN frozen copy, never `Object.is`-identical to the caller's original
    // `receipt` object or to each other — see collaborative-runner.ts's own
    // doc comment on `fitnessRun` for the full reasoning. What must hold
    // instead (and does): both battery mints are deep-equal to the receipt
    // that was passed in, and the fitness run's receipt is the SAME object
    // as the answerer battery's own — the identity `promoteComponentWinner`'s
    // frozen `provenanceOk` gate actually requires.
    expect(record.builderBattery.receipt).toEqual(receipt);
    expect(record.answererBattery.receipt).toEqual(receipt);
    expect(Object.is(record.fitnessRun.receipt, record.answererBattery.receipt)).toBe(true);
  });

  it("carries the bridge's own ScoringAttempt objects unmodified — identity, not deep equality", async () => {
    const { provider } = makeProvider({ 1001: [11], 1002: [21] });
    const record = await runCollaborativeBattery(
      baseArgs({ execFn: makeExecFn({ 1001: 1, 1002: 1 }), runOpts: { providerImpl: provider } }),
    );
    for (const outcome of record.outcomes) {
      const matching = record.attempts.find((a) => a.attemptId === outcome.attempt.attemptId);
      expect(Object.is(outcome.attempt, matching)).toBe(true);
    }
  });

  it("the adapter EvalResult's testPassRate is the mean per-outcome hit@1, with coverage/mutationScore/codeHealth all exactly 0 as own properties", async () => {
    const { provider } = makeProvider({ 1001: [11], 1002: [21] });
    const record = await runCollaborativeBattery(
      baseArgs({ execFn: makeExecFn({ 1001: 0, 1002: 1 }), runOpts: { providerImpl: provider } }),
    );
    const mean = record.outcomes.reduce((s, o) => s + o.hit1, 0) / record.outcomes.length;
    expect(record.fitnessRun.result.testPassRate).toBe(mean);
    expect(record.fitnessRun.result.testPassRate).toBe(0.5);
    expect(Object.hasOwn(record.fitnessRun.result, "coverage")).toBe(true);
    expect(Object.hasOwn(record.fitnessRun.result, "mutationScore")).toBe(true);
    expect(Object.hasOwn(record.fitnessRun.result, "codeHealth")).toBe(true);
    expect(record.fitnessRun.result.coverage).toBe(0);
    expect(record.fitnessRun.result.mutationScore).toBe(0);
    expect(record.fitnessRun.result.codeHealth).toBe(0);
  });

  it("the fitness result differs from the driver's own answerer result for a candidate whose structural checks pass but hit@1 is not 1 (D-09)", async () => {
    const { provider } = makeProvider({ 1001: [11], 1002: [21] });
    const record = await runCollaborativeBattery(
      baseArgs({ execFn: makeExecFn({ 1001: 0, 1002: 1 }), runOpts: { providerImpl: provider } }),
    );
    expect(record.answererRun.result.testPassRate).toBe(1); // both structural checks pass
    expect(record.fitnessRun.result.testPassRate).toBe(0.5); // real hit@1 mean
    expect(record.fitnessRun.result.testPassRate).not.toBe(record.answererRun.result.testPassRate);
  });

  it("a preflight failure throws before any provider call is recorded (D-11)", async () => {
    const { provider, callCount } = makeProvider({ 1001: [11], 1002: [21] });
    const badFingerprint = { ...FINGERPRINT_MANIFEST, pythonVersion: "9.9.9-mismatch" };
    const err = await thrownAsync(() =>
      runCollaborativeBattery(
        baseArgs({
          fingerprintManifest: badFingerprint,
          execFn: makeExecFn({ 1001: 1, 1002: 1 }),
          runOpts: { providerImpl: provider },
        }),
      ),
    );
    expect(err.message).toContain("pythonVersion");
    expect(callCount()).toBe(0);
  });

  it("the answerer's rendered prompt carries a fixture-only label and never the builder's free-text sentinel (D-06)", async () => {
    const { provider } = makeProvider({ 1001: [11], 1002: [21] });
    const record = await runCollaborativeBattery(
      baseArgs({ execFn: makeExecFn({ 1001: 1, 1002: 1 }), runOpts: { providerImpl: provider } }),
    );
    const answererTaskA = record.answererBattery.tasks.find((t) => t.id === "task-a")!;
    expect(answererTaskA.prompt).toContain("Fixture-Node-Alpha");
    expect(answererTaskA.prompt).not.toContain(BUILDER_SENTINEL);
  });

  it("a ranked list of 25 raw entries submits exactly 20 predDict entries, dropping a non-integer entry and a repeated id (CD-01)", async () => {
    const { provider } = makeProvider({ 1001: buildCd01RankedList(), 1002: [21] });
    const record = await runCollaborativeBattery(
      baseArgs({ execFn: makeExecFn({ 1001: 0, 1002: 1 }), runOpts: { providerImpl: provider } }),
    );
    const outcomeA = record.outcomes.find((o) => o.queryId === 1001)!;
    expect(Object.keys(outcomeA.attempt.submittedPredDict)).toHaveLength(20);
    expect(outcomeA.attempt.submittedPredDict["300"]).toBeDefined();
    expect(outcomeA.attempt.submittedPredDict["not-an-integer"]).toBeUndefined();
  });

  it("the handoff record carries all four D-08 bindings and its recorded sha256 equals the artifact file's own bytes", async () => {
    const { provider } = makeProvider({ 1001: [11], 1002: [21] });
    const record = await runCollaborativeBattery(
      baseArgs({ execFn: makeExecFn({ 1001: 1, 1002: 1 }), runOpts: { providerImpl: provider } }),
    );
    const handoffA = record.handoffRecords.find((h) => h.queryId === 1001)!;
    expect(handoffA.attemptId.length).toBeGreaterThan(0);
    expect(handoffA.definitionHash).toBe(CANDIDATE.id);
    expect(handoffA.kbRevision).toBe(ADMISSION_RECORD.revisionSha);
    const onDiskBytes = readFileSync(handoffA.artifactPath);
    expect(handoffA.artifactSha256).toBe(createHash("sha256").update(onDiskBytes).digest("hex"));
  });
});

// ── D-13: hash-of-hashes candidate id ───────────────────────────────────

describe("makeCollaborativeCandidate — D-13 hash-of-hashes over full digests", () => {
  it("matches sha256(sha256(builder) || sha256(answerer)) truncated to 16 hex, builder-then-answerer, over FULL 32-byte digests", () => {
    const builderPrompt = "builder prompt text";
    const answererPrompt = "answerer prompt text";
    const candidate = makeCollaborativeCandidate(builderPrompt, answererPrompt);
    const builderDigest = createHash("sha256").update(builderPrompt).digest();
    const answererDigest = createHash("sha256").update(answererPrompt).digest();
    const expected = createHash("sha256")
      .update(Buffer.concat([builderDigest, answererDigest]))
      .digest("hex")
      .slice(0, 16);
    expect(candidate.id).toBe(expected);
    expect(candidate.id).toHaveLength(16);
  });

  it("two prompt pairs that would collide under naive delimited concatenation produce distinct ids", () => {
    // The sec8-cited collision: ("a|", "bc") vs ("a", "|bc") under naive "|"
    // concatenation both produce "a||bc". Hash-of-hashes over fixed-length
    // digests has no delimiter boundary at all, so they must differ here.
    const pairA = makeCollaborativeCandidate("a|", "bc");
    const pairB = makeCollaborativeCandidate("a", "|bc");
    expect(pairA.id).not.toBe(pairB.id);
  });
});

// ── D-05: canonical serialization + hash ────────────────────────────────

describe("canonicalSubgraphBytes / hashSubgraphArtifact — D-05 ratified canonical form", () => {
  const base: SubgraphArtifactV1 = {
    schemaVersion: SUBGRAPH_SCHEMA_VERSION,
    queryId: 1001,
    kbRevision: ADMISSION_RECORD.revisionSha,
    nodes: [15, 11, 13],
    edges: [
      [13, 14, 1],
      [11, 12, 1],
    ],
  };

  it("produces a fixed key order and sorted arrays regardless of input array order", () => {
    const bytes = canonicalSubgraphBytes(base);
    const text = bytes.toString("utf8");
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["schemaVersion", "queryId", "kbRevision", "nodes", "edges"]);
    expect(parsed.nodes).toEqual([11, 13, 15]);
    expect(parsed.edges).toEqual([
      [11, 12, 1],
      [13, 14, 1],
    ]);
  });

  it("hashes identically for two artifacts differing only in node/edge array order", () => {
    const reordered: SubgraphArtifactV1 = {
      ...base,
      nodes: [...base.nodes].reverse(),
      edges: [...base.edges].reverse(),
    };
    expect(hashSubgraphArtifact(base)).toBe(hashSubgraphArtifact(reordered));
  });
});
