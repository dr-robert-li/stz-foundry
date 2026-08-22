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
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
  parseSubgraphArtifact,
  verifyHandoffAtRead,
  describeHandoffOutcome,
  validateSubgraphAgainstNeighborhood,
  HANDOFF_OUTCOME_KINDS,
  MIN_SUBGRAPH_NODES,
  MAX_SUBGRAPH_NODES,
  SUBGRAPH_SCHEMA_VERSION,
  type CollaborativeCandidate,
  type KbNeighborhood,
  type RunCollaborativeBatteryArgs,
  type SubgraphArtifactV1,
  type HandoffOutcome,
  type HandoffRecord,
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
        };
        // BUILDER_SENTINEL lives in free text OUTSIDE the fenced artifact
        // block -- D-05's closed schema now rejects any unknown key inside
        // the artifact itself, so this is the only place a builder's own
        // free text can appear in its raw response (D-06's frozen-inputs
        // case: this text must never reach the answerer, the handoff
        // record, or the returned run record).
        return {
          text:
            BUILDER_SENTINEL + "\n```path=subgraph.json\n" + JSON.stringify(artifact) + "\n```",
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
      const matching = record.attempts.find((a) => a.attemptId === outcome.attempt!.attemptId);
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
    expect(Object.keys(outcomeA.attempt!.submittedPredDict)).toHaveLength(20);
    expect(outcomeA.attempt!.submittedPredDict["300"]).toBeDefined();
    expect(outcomeA.attempt!.submittedPredDict["not-an-integer"]).toBeUndefined();
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

// ── D-05: closed schema — parseSubgraphArtifact ─────────────────────────

describe("parseSubgraphArtifact — D-05 closed, ids-only schema (Plan 22-02 Task 1)", () => {
  const validRaw = {
    schemaVersion: SUBGRAPH_SCHEMA_VERSION,
    queryId: 1001,
    kbRevision: ADMISSION_RECORD.revisionSha,
    nodes: [11, 12],
    edges: [[11, 12, 1]],
  };

  it("accepts a valid, closed artifact", () => {
    const result = parseSubgraphArtifact(validRaw);
    expect(result.ok).toBe(true);
  });

  it("rejects an artifact carrying one extra key, naming that key", () => {
    const result = parseSubgraphArtifact({ ...validRaw, freeText: "smuggled" });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.violation).toContain("freeText");
  });

  it("rejects a wrong schemaVersion, naming both found and expected", () => {
    const result = parseSubgraphArtifact({ ...validRaw, schemaVersion: 2 });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.violation).toContain("2");
    expect(!result.ok && result.violation).toContain(String(SUBGRAPH_SCHEMA_VERSION));
  });

  it("rejects a non-integer node id, naming its position", () => {
    const result = parseSubgraphArtifact({ ...validRaw, nodes: [11, 12.5] });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.violation).toContain("position 1");
  });

  it("rejects a non-integer relation id inside an edge triple", () => {
    const result = parseSubgraphArtifact({ ...validRaw, edges: [[11, 12, 1.5]] });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.violation).toMatch(/edge/);
  });

  it("rejects an edge triple of the wrong length", () => {
    const result = parseSubgraphArtifact({ ...validRaw, edges: [[11, 12]] });
    expect(result.ok).toBe(false);
  });

  it("rejects an edge whose source is absent from the artifact's own node list, naming that id", () => {
    const result = parseSubgraphArtifact({ ...validRaw, edges: [[99, 12, 1]] });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.violation).toContain("99");
  });

  it("rejects an edge whose destination is absent from the artifact's own node list, naming that id", () => {
    const result = parseSubgraphArtifact({ ...validRaw, edges: [[11, 98, 1]] });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.violation).toContain("98");
  });
});

// ── D-08: HandoffOutcome — named, exhaustive, fail-closed ───────────────

describe("HandoffOutcome — D-08 named outcome vocabulary (Plan 22-02 Task 1)", () => {
  it("HANDOFF_OUTCOME_KINDS enumerates every member exactly once", () => {
    expect(HANDOFF_OUTCOME_KINDS.length).toBeGreaterThan(0);
    expect(new Set(HANDOFF_OUTCOME_KINDS).size).toBe(HANDOFF_OUTCOME_KINDS.length);
  });

  it("describeHandoffOutcome produces a non-empty, distinct description for every kind", () => {
    const sampleByKind: Record<string, HandoffOutcome> = {
      success: {
        kind: "success",
        artifact: {
          schemaVersion: SUBGRAPH_SCHEMA_VERSION,
          queryId: 1001,
          kbRevision: ADMISSION_RECORD.revisionSha,
          nodes: [11],
          edges: [],
        },
      },
      "artifact-absent": { kind: "artifact-absent", path: "/tmp/nowhere" },
      unparseable: { kind: "unparseable", reason: "not-json", path: "/tmp/nowhere" },
      "schema-invalid": { kind: "schema-invalid", violation: "bad field" },
      "record-absent": { kind: "record-absent", queryId: 1001 },
      "record-corrupt": { kind: "record-corrupt", violation: "missing attemptId" },
      "hash-mismatch": { kind: "hash-mismatch", recordedSha256: "aaa", observedSha256: "bbb" },
      "cd05-violation": {
        kind: "cd05-violation",
        violation: { condition: "below-minimum", nodeCount: 2 },
      },
      "bridge-non-success": { kind: "bridge-non-success", scoringOutcomeKind: "timeout" },
    };
    expect(Object.keys(sampleByKind).sort()).toEqual([...HANDOFF_OUTCOME_KINDS].sort());
    const descriptions = HANDOFF_OUTCOME_KINDS.map((kind) => describeHandoffOutcome(sampleByKind[kind]!));
    for (const d of descriptions) {
      expect(d.length).toBeGreaterThan(0);
    }
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it("artifact-absent, record-absent, record-corrupt and hash-mismatch are four distinct outcome kinds", () => {
    const dir = mkdtempSync(join(tmpdir(), "stz-collab-handoff-"));

    // artifact-absent: record points at a path that was never written.
    const absentPath = join(dir, "never-written.json");
    const absentRecord: HandoffRecord = {
      queryId: 1,
      attemptId: "a1",
      definitionHash: "d1",
      kbRevision: "rev",
      artifactPath: absentPath,
      artifactSha256: "irrelevant",
    };
    const artifactAbsent = verifyHandoffAtRead(1, absentRecord);
    expect(artifactAbsent.kind).toBe("artifact-absent");

    // record-absent: no record was ever recorded for this query.
    const recordAbsent = verifyHandoffAtRead(2, undefined);
    expect(recordAbsent.kind).toBe("record-absent");

    // record-corrupt: the record itself is missing a required binding.
    const corruptRecord = { ...absentRecord, attemptId: "" } as HandoffRecord;
    const recordCorrupt = verifyHandoffAtRead(3, corruptRecord);
    expect(recordCorrupt.kind).toBe("record-corrupt");

    // hash-mismatch: a real file on disk whose bytes disagree with the
    // record's recorded digest.
    const mismatchPath = join(dir, "artifact.json");
    const realArtifact = {
      schemaVersion: SUBGRAPH_SCHEMA_VERSION,
      queryId: 4,
      kbRevision: "rev",
      nodes: [1, 2],
      edges: [[1, 2, 1]],
    };
    writeFileSync(mismatchPath, JSON.stringify(realArtifact));
    const mismatchRecord: HandoffRecord = {
      queryId: 4,
      attemptId: "a4",
      definitionHash: "d4",
      kbRevision: "rev",
      artifactPath: mismatchPath,
      artifactSha256: "0".repeat(64), // deliberately wrong
    };
    const hashMismatch = verifyHandoffAtRead(4, mismatchRecord);
    expect(hashMismatch.kind).toBe("hash-mismatch");

    const kinds = [artifactAbsent.kind, recordAbsent.kind, recordCorrupt.kind, hashMismatch.kind];
    expect(new Set(kinds).size).toBe(4);
  });

  it("verifyHandoffAtRead returns success with the parsed artifact for a genuine matching record", () => {
    const dir = mkdtempSync(join(tmpdir(), "stz-collab-handoff-ok-"));
    const path = join(dir, "artifact.json");
    const artifact: SubgraphArtifactV1 = {
      schemaVersion: SUBGRAPH_SCHEMA_VERSION,
      queryId: 5,
      kbRevision: "rev",
      nodes: [1, 2],
      edges: [[1, 2, 1]],
    };
    const bytes = Buffer.from(JSON.stringify(artifact));
    writeFileSync(path, bytes);
    const record: HandoffRecord = {
      queryId: 5,
      attemptId: "a5",
      definitionHash: "d5",
      kbRevision: "rev",
      artifactPath: path,
      artifactSha256: createHash("sha256").update(bytes).digest("hex"),
    };
    const result = verifyHandoffAtRead(5, record);
    expect(result.kind).toBe("success");
    expect(result.kind === "success" && result.artifact.queryId).toBe(5);
  });
});

// ── D-03: fail-closed task = scored 0, run continues ────────────────────

describe("runCollaborativeBattery — D-03 per-task fail-closed, run continues (Plan 22-02 Task 1)", () => {
  it("a task whose builder never emits an artifact is scored 0 and never reaches the bridge, while the other task still scores", async () => {
    const { provider } = makeProvider({ 1002: [21] }); // task-a (1001) gets no answer entry either
    // Override the builder response so task-a's builder emits nothing usable.
    const noArtifactProvider: Provider = {
      kind: "openai",
      baseUrl: "http://test-provider.invalid",
      async chat(req: ChatRequest): Promise<ChatResponse> {
        const system = req.system ?? "";
        const userText = req.messages[0]?.content ?? "";
        const match = userText.match(/QUERY_ID: (\d+)/);
        const queryId = match ? Number(match[1]) : NaN;
        if (system.includes("BUILDER-ROLE") && queryId === 1001) {
          return { text: "no artifact here", model: req.model, usage: ZERO_USAGE };
        }
        return provider.chat(req);
      },
    };
    let scoreCalls = 0;
    const countingExecFn: ScoringExecFn = (file, args, opts) => {
      const inner = makeExecFn({ 1002: 1 });
      if (args[0] !== "-c") scoreCalls++;
      return inner(file, args, opts);
    };
    const record = await runCollaborativeBattery(
      baseArgs({ execFn: countingExecFn, runOpts: { providerImpl: noArtifactProvider } }),
    );
    expect(record.outcomes).toHaveLength(2);
    const outcomeA = record.outcomes.find((o) => o.queryId === 1001)!;
    const outcomeB = record.outcomes.find((o) => o.queryId === 1002)!;
    expect(outcomeA.hit1).toBe(0);
    expect(outcomeA.attempt).toBeUndefined();
    expect(outcomeA.handoffOutcome.kind).toBe("artifact-absent");
    expect(outcomeB.attempt).toBeDefined();
    // The preflight's own warm-up call (D-11) also goes through this execFn,
    // so the total is 1 (warm-up) + 1 (task-b) -- task-a's failed handoff
    // never reaches the bridge at all.
    expect(scoreCalls).toBe(2);
  });

  it("an artifact carrying an unknown key is rejected schema-invalid at handoff, not scored, run continues", async () => {
    const badKeyProvider: Provider = {
      kind: "openai",
      baseUrl: "http://test-provider.invalid",
      async chat(req: ChatRequest): Promise<ChatResponse> {
        const system = req.system ?? "";
        const userText = req.messages[0]?.content ?? "";
        const match = userText.match(/QUERY_ID: (\d+)/);
        const queryId = match ? Number(match[1]) : NaN;
        if (system.includes("BUILDER-ROLE") && queryId === 1001) {
          const artifact = {
            schemaVersion: SUBGRAPH_SCHEMA_VERSION,
            queryId,
            kbRevision: ADMISSION_RECORD.revisionSha,
            nodes: [11, 12],
            edges: [[11, 12, 1]],
            extra: "smuggled free text",
          };
          return {
            text: "```path=subgraph.json\n" + JSON.stringify(artifact) + "\n```",
            model: req.model,
            usage: ZERO_USAGE,
          };
        }
        const { provider } = makeProvider({ 1002: [21] });
        return provider.chat(req);
      },
    };
    const record = await runCollaborativeBattery(
      baseArgs({ execFn: makeExecFn({ 1002: 1 }), runOpts: { providerImpl: badKeyProvider } }),
    );
    const outcomeA = record.outcomes.find((o) => o.queryId === 1001)!;
    expect(outcomeA.handoffOutcome.kind).toBe("schema-invalid");
    expect(outcomeA.hit1).toBe(0);
    expect(record.outcomes).toHaveLength(2);
  });

  it("unparseable bytes (not JSON) and a JSON value that is not an object both yield the unparseable outcome, distinguishing the two reasons", async () => {
    // A third, surviving task (query 1003, present in the fixture) is
    // required here: if every task in the run fails at handoff, the
    // answerer battery has zero tasks and `makeBattery` itself refuses
    // (a documented boundary, not something this test exercises).
    const taskC: CollaborativeBatteryTask = {
      id: "task-c",
      queryId: 1003,
      prompt: "Which entity does this describe (task C)?",
    };
    const { provider: normalProvider } = makeProvider({ 1003: [31] });
    const malformedProvider: Provider = {
      kind: "openai",
      baseUrl: "http://test-provider.invalid",
      async chat(req: ChatRequest): Promise<ChatResponse> {
        const system = req.system ?? "";
        const userText = req.messages[0]?.content ?? "";
        const match = userText.match(/QUERY_ID: (\d+)/);
        const queryId = match ? Number(match[1]) : NaN;
        if (system.includes("BUILDER-ROLE") && queryId === 1001) {
          return {
            text: "```path=subgraph.json\nNOT VALID JSON{{{\n```",
            model: req.model,
            usage: ZERO_USAGE,
          };
        }
        if (system.includes("BUILDER-ROLE") && queryId === 1002) {
          return {
            text: "```path=subgraph.json\n[1,2,3]\n```",
            model: req.model,
            usage: ZERO_USAGE,
          };
        }
        return normalProvider.chat(req);
      },
    };
    const record = await runCollaborativeBattery(
      baseArgs({
        tasks: [...TASKS, taskC],
        execFn: makeExecFn({ 1003: 1 }),
        runOpts: { providerImpl: malformedProvider },
      }),
    );
    const outcomeA = record.outcomes.find((o) => o.queryId === 1001)!;
    const outcomeB = record.outcomes.find((o) => o.queryId === 1002)!;
    const outcomeC = record.outcomes.find((o) => o.queryId === 1003)!;
    expect(outcomeA.handoffOutcome.kind).toBe("unparseable");
    expect(outcomeA.handoffOutcome.kind === "unparseable" && outcomeA.handoffOutcome.reason).toBe("not-json");
    expect(outcomeB.handoffOutcome.kind).toBe("unparseable");
    expect(outcomeB.handoffOutcome.kind === "unparseable" && outcomeB.handoffOutcome.reason).toBe("not-object");
    expect(outcomeC.attempt).toBeDefined();
  });
});

// ── D-07/CD-05: structural bounds (Plan 22-02 Task 2) ───────────────────

function chainOfNodes(n: number): { artifact: SubgraphArtifactV1; neighborhood: KbNeighborhood } {
  const nodes = Array.from({ length: n }, (_, i) => i + 1);
  const edges: [number, number, number][] = [];
  for (let i = 0; i < n - 1; i++) edges.push([nodes[i]!, nodes[i + 1]!, 1]);
  const artifact: SubgraphArtifactV1 = {
    schemaVersion: SUBGRAPH_SCHEMA_VERSION,
    queryId: 9001,
    kbRevision: "rev",
    nodes,
    edges,
  };
  const neighborhood: KbNeighborhood = {
    queryId: 9001,
    seeds: nodes.length > 0 ? [nodes[0]!] : [],
    nodes: nodes.map((id) => ({ id, label: `n${id}`, type: "gene" })),
    edges,
    relationNames: { "1": "linked" },
  };
  return { artifact, neighborhood };
}

describe("validateSubgraphAgainstNeighborhood — CD-05 structural bounds (Plan 22-02 Task 2)", () => {
  it(`rejects exactly ${MIN_SUBGRAPH_NODES - 1} nodes as below-minimum`, () => {
    const { artifact, neighborhood } = chainOfNodes(MIN_SUBGRAPH_NODES - 1);
    const result = validateSubgraphAgainstNeighborhood(artifact, neighborhood);
    if (result.ok) throw new Error("expected failure");
    expect(result.violation.condition).toBe("below-minimum");
  });

  it(`accepts exactly ${MIN_SUBGRAPH_NODES} nodes`, () => {
    const { artifact, neighborhood } = chainOfNodes(MIN_SUBGRAPH_NODES);
    expect(validateSubgraphAgainstNeighborhood(artifact, neighborhood).ok).toBe(true);
  });

  it(`accepts exactly ${MAX_SUBGRAPH_NODES} nodes`, () => {
    const { artifact, neighborhood } = chainOfNodes(MAX_SUBGRAPH_NODES);
    expect(validateSubgraphAgainstNeighborhood(artifact, neighborhood).ok).toBe(true);
  });

  it(`rejects ${MAX_SUBGRAPH_NODES + 1} nodes as above-maximum`, () => {
    const { artifact, neighborhood } = chainOfNodes(MAX_SUBGRAPH_NODES + 1);
    const result = validateSubgraphAgainstNeighborhood(artifact, neighborhood);
    if (result.ok) throw new Error("expected failure");
    expect(result.violation.condition).toBe("above-maximum");
  });

  it("rejects a disconnected subgraph, naming a node from the orphaned component", () => {
    const artifact: SubgraphArtifactV1 = {
      schemaVersion: SUBGRAPH_SCHEMA_VERSION,
      queryId: 9002,
      kbRevision: "rev",
      nodes: [1, 2, 3, 4],
      edges: [[1, 2, 1]],
    };
    const neighborhood: KbNeighborhood = {
      queryId: 9002,
      seeds: [1],
      nodes: [1, 2, 3, 4].map((id) => ({ id, label: `n${id}`, type: "gene" })),
      edges: artifact.edges,
      relationNames: { "1": "linked" },
    };
    const result = validateSubgraphAgainstNeighborhood(artifact, neighborhood);
    if (result.ok) throw new Error("expected failure");
    expect(result.violation.condition).toBe("disconnected");
    if (result.violation.condition !== "disconnected") throw new Error("wrong condition");
    expect([3, 4]).toContain(result.violation.unreachableNodeId);
  });

  it("rejects a node id outside the pre-extracted neighbourhood, naming that id -- against the runner-held neighbourhood, not the artifact's own self-consistency", () => {
    const artifact: SubgraphArtifactV1 = {
      schemaVersion: SUBGRAPH_SCHEMA_VERSION,
      queryId: 9003,
      kbRevision: "rev",
      nodes: [1, 2, 3],
      edges: [
        [1, 2, 1],
        [2, 3, 1],
      ],
    };
    const neighborhood: KbNeighborhood = {
      queryId: 9003,
      seeds: [1],
      nodes: [1, 2].map((id) => ({ id, label: `n${id}`, type: "gene" })), // 3 is deliberately absent
      edges: [[1, 2, 1]],
      relationNames: { "1": "linked" },
    };
    const result = validateSubgraphAgainstNeighborhood(artifact, neighborhood);
    if (result.ok) throw new Error("expected failure");
    expect(result.violation.condition).toBe("outside-neighborhood");
    if (result.violation.condition !== "outside-neighborhood") throw new Error("wrong condition");
    expect(result.violation.nodeId).toBe(3);
  });

  it("treats edges as undirected for connectivity (FA-5): a subgraph whose edges all point INTO the BFS start node is connected", () => {
    const artifact: SubgraphArtifactV1 = {
      schemaVersion: SUBGRAPH_SCHEMA_VERSION,
      queryId: 9004,
      kbRevision: "rev",
      nodes: [1, 2, 3],
      edges: [
        [2, 1, 1],
        [3, 1, 1],
      ], // both edges point INTO node 1, the walk's own starting node
    };
    const neighborhood: KbNeighborhood = {
      queryId: 9004,
      seeds: [1],
      nodes: [1, 2, 3].map((id) => ({ id, label: `n${id}`, type: "gene" })),
      edges: artifact.edges,
      relationNames: { "1": "linked" },
    };
    expect(validateSubgraphAgainstNeighborhood(artifact, neighborhood).ok).toBe(true);
  });
});

describe("runCollaborativeBattery — CD-05 wired at handoff, D-03 denominator (Plan 22-02 Task 2)", () => {
  it("a four-task run with one CD-05 failure (below-minimum, fixture query 1004 has 2 nodes) yields testPassRate exactly 0.75, and the scoring seam records exactly three real task calls", async () => {
    const taskC: CollaborativeBatteryTask = {
      id: "task-c",
      queryId: 1003,
      prompt: "Which entity does this describe (task C)?",
    };
    const taskD: CollaborativeBatteryTask = {
      id: "task-d",
      queryId: 1004,
      prompt: "Which entity does this describe (task D)?",
    };
    const { provider } = makeProvider({ 1001: [11], 1002: [21], 1003: [31] });
    let scoreCalls = 0;
    const countingExecFn: ScoringExecFn = (file, args, opts) => {
      const inner = makeExecFn({ 1001: 1, 1002: 1, 1003: 1 });
      if (args[0] !== "-c") scoreCalls++;
      return inner(file, args, opts);
    };
    const record = await runCollaborativeBattery(
      baseArgs({
        tasks: [...TASKS, taskC, taskD],
        execFn: countingExecFn,
        runOpts: { providerImpl: provider },
      }),
    );
    expect(record.outcomes).toHaveLength(4);
    expect(record.fitnessRun.result.testPassRate).toBe(0.75);
    const outcomeD = record.outcomes.find((o) => o.queryId === 1004)!;
    expect(outcomeD.handoffOutcome.kind).toBe("cd05-violation");
    expect(outcomeD.handoffOutcome.kind === "cd05-violation" && outcomeD.handoffOutcome.violation.condition).toBe(
      "below-minimum",
    );
    expect(outcomeD.hit1).toBe(0);
    expect(outcomeD.attempt).toBeUndefined();
    // 1 preflight warm-up call + 3 real per-task calls -- task-d's failed
    // handoff never reaches the bridge at all.
    expect(scoreCalls).toBe(4);
  });
});

// ── D-06: frozen inputs, the early behavioural half of SC-1 (Task 2) ────

describe("runCollaborativeBattery — D-06 frozen inputs (Plan 22-02 Task 2)", () => {
  it("the builder's free-text sentinel appears in no answerer task prompt and nowhere in the returned run record", async () => {
    const { provider } = makeProvider({ 1001: [11], 1002: [21] });
    const record = await runCollaborativeBattery(
      baseArgs({ execFn: makeExecFn({ 1001: 1, 1002: 1 }), runOpts: { providerImpl: provider } }),
    );
    for (const task of record.answererBattery.tasks) {
      expect(task.prompt).not.toContain(BUILDER_SENTINEL);
    }
    expect(JSON.stringify(record)).not.toContain(BUILDER_SENTINEL);
  });
});
