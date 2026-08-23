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
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { SpawnSyncReturns } from "node:child_process";
import {
  runCollaborativeBattery,
  makeCollaborativeCandidate,
  buildAnswererTaskPrompt,
  canonicalSubgraphBytes,
  hashSubgraphArtifact,
  parseSubgraphArtifact,
  verifyHandoffAtRead,
  describeHandoffOutcome,
  validateSubgraphAgainstNeighborhood,
  makeDefaultKbNeighborhoodFn,
  parseNeighborhoodStdout,
  HANDOFF_OUTCOME_KINDS,
  MIN_SUBGRAPH_NODES,
  MAX_SUBGRAPH_NODES,
  MAX_SUBGRAPH_EDGES,
  SUBGRAPH_SCHEMA_VERSION,
  NEIGHBORHOOD_ONE_REL,
  NEIGHBORHOOD_HOPS,
  NEIGHBORHOOD_MAX_NODES,
  NEIGHBORHOOD_MAX_BUFFER_BYTES,
  NEIGHBOURHOOD_EMPTY_SEED_MARKER,
  CollaborativeRunnerError,
  type CollaborativeCandidate,
  type KbNeighborhood,
  type KbNeighborhoodFn,
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
  runScoringPreflight,
  type FingerprintManifest,
  type PoolManifest,
  type ScoringExecFn,
  type RunScoringPreflightArgs,
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
    expect(record.builderBattery).toBeDefined();
    expect(record.builderBattery!.receipt).toEqual(receipt);
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

  it("two byte-different, semantically-identical serializations produce DIFFERENT raw digests but the SAME hashSubgraphArtifact (WR-05/D-05's replay/audit property)", () => {
    const reordered: SubgraphArtifactV1 = {
      ...base,
      nodes: [...base.nodes].reverse(),
      edges: [...base.edges].reverse(),
    };
    const rawBytes1 = Buffer.from(JSON.stringify(base));
    const rawBytes2 = Buffer.from(JSON.stringify(reordered, null, 2)); // differing whitespace too
    const rawDigest1 = createHash("sha256").update(rawBytes1).digest("hex");
    const rawDigest2 = createHash("sha256").update(rawBytes2).digest("hex");
    expect(rawDigest1).not.toBe(rawDigest2);
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

  // ── CR-01a/T-22-12: duplicate node ids padded past MIN_SUBGRAPH_NODES ──

  it("rejects a nodes array containing a duplicate id, naming the field (CR-01a)", () => {
    const result = parseSubgraphArtifact({ ...validRaw, nodes: [11, 12, 11] });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.violation).toContain("nodes");
  });

  // ── CR-01b: the edge list is bounded at the schema layer ────────────────

  it("rejects an edges array containing a repeated [src, dst, rel] triple, naming the triple (CR-01b)", () => {
    const result = parseSubgraphArtifact({
      ...validRaw,
      edges: [
        [11, 12, 1],
        [11, 12, 1],
      ],
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.violation).toContain("11");
    expect(!result.ok && result.violation).toContain("12");
  });

  it("rejects an edges array longer than MAX_SUBGRAPH_EDGES, naming the count and the cap (CR-01b)", () => {
    // Every generated triple must be distinct so this fails on the CAP, not
    // the duplicate-triple check -- vary the relation id per entry.
    const overCapEdges: [number, number, number][] = Array.from(
      { length: MAX_SUBGRAPH_EDGES + 1 },
      (_, i) => [11, 12, i + 1],
    );
    const result = parseSubgraphArtifact({ ...validRaw, edges: overCapEdges });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.violation).toContain(String(overCapEdges.length));
    expect(!result.ok && result.violation).toContain(String(MAX_SUBGRAPH_EDGES));
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
      // T-23-08: added deliberately with the union's new member -- this
      // assertion pins the kind list, so growing the union without a sample
      // here is a failing test, by design.
      "neighbourhood-refused": {
        kind: "neighbourhood-refused",
        queryId: 1384,
        reason: "the helper found no seed entity for this query -- no KB node name matched the query text",
      },
      "artifact-unreadable": { kind: "artifact-unreadable", path: "/tmp/nowhere-readable", code: "EISDIR" },
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
      canonicalSha256: "c1",
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
      canonicalSha256: "c4",
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
      kbRevision: ADMISSION_RECORD.revisionSha,
      nodes: [1, 2],
      edges: [[1, 2, 1]],
    };
    const bytes = Buffer.from(JSON.stringify(artifact));
    writeFileSync(path, bytes);
    const record: HandoffRecord = {
      queryId: 5,
      attemptId: "a5",
      definitionHash: "d5",
      kbRevision: ADMISSION_RECORD.revisionSha,
      artifactPath: path,
      artifactSha256: createHash("sha256").update(bytes).digest("hex"),
      canonicalSha256: "c5",
    };
    const result = verifyHandoffAtRead(5, record);
    expect(result.kind).toBe("success");
    expect(result.kind === "success" && result.artifact.queryId).toBe(5);
  });

  // ── WR-01/WR-02: verifyHandoffAtRead validates BOTH identity bindings ──

  it("a record whose own queryId disagrees with the requested queryId is record-corrupt, naming both numbers (WR-02)", () => {
    const dir = mkdtempSync(join(tmpdir(), "stz-collab-handoff-recordid-"));
    const path = join(dir, "artifact.json");
    const artifact: SubgraphArtifactV1 = {
      schemaVersion: SUBGRAPH_SCHEMA_VERSION,
      queryId: 9,
      kbRevision: ADMISSION_RECORD.revisionSha,
      nodes: [1, 2],
      edges: [[1, 2, 1]],
    };
    const bytes = Buffer.from(JSON.stringify(artifact));
    writeFileSync(path, bytes);
    const record: HandoffRecord = {
      queryId: 9, // the record's own (trusted) binding
      attemptId: "a9",
      definitionHash: "d9",
      kbRevision: ADMISSION_RECORD.revisionSha,
      artifactPath: path,
      artifactSha256: createHash("sha256").update(bytes).digest("hex"),
      canonicalSha256: "c9",
    };
    const result = verifyHandoffAtRead(4, record); // requested a DIFFERENT queryId
    expect(result.kind).toBe("record-corrupt");
    expect(result.kind === "record-corrupt" && result.violation).toContain("9");
    expect(result.kind === "record-corrupt" && result.violation).toContain("4");
  });

  it("the existing missing-binding corrupt-record case still resolves on the missing binding even when the record is ALSO mis-keyed -- binding presence runs first (FA-C)", () => {
    // Mirrors the pre-existing corrupt-record fixture above: attemptId is
    // empty (missing binding) AND record.queryId (1) disagrees with the
    // requested queryId (3). The missing-binding check must win.
    const dir = mkdtempSync(join(tmpdir(), "stz-collab-handoff-both-"));
    const path = join(dir, "never-written.json");
    const record: HandoffRecord = {
      queryId: 1,
      attemptId: "",
      definitionHash: "d1",
      kbRevision: "rev",
      artifactPath: path,
      artifactSha256: "irrelevant",
      canonicalSha256: "c1b",
    };
    const result = verifyHandoffAtRead(3, record);
    expect(result.kind).toBe("record-corrupt");
    expect(result.kind === "record-corrupt" && result.violation).toContain("attemptId");
  });

  it("an artifact whose own queryId field disagrees with the requested queryId is schema-invalid, naming the field and both numbers (WR-01)", () => {
    const dir = mkdtempSync(join(tmpdir(), "stz-collab-handoff-artifactid-"));
    const path = join(dir, "artifact.json");
    const artifact: SubgraphArtifactV1 = {
      schemaVersion: SUBGRAPH_SCHEMA_VERSION,
      queryId: 999, // the artifact's OWN claimed queryId -- builder-controlled, wrong
      kbRevision: ADMISSION_RECORD.revisionSha,
      nodes: [1, 2],
      edges: [[1, 2, 1]],
    };
    const bytes = Buffer.from(JSON.stringify(artifact));
    writeFileSync(path, bytes);
    const record: HandoffRecord = {
      queryId: 6, // the record's own (trusted) binding -- matches the request
      attemptId: "a6",
      definitionHash: "d6",
      kbRevision: ADMISSION_RECORD.revisionSha,
      artifactPath: path,
      artifactSha256: createHash("sha256").update(bytes).digest("hex"),
      canonicalSha256: "c6",
    };
    const result = verifyHandoffAtRead(6, record);
    expect(result.kind).toBe("schema-invalid");
    expect(result.kind === "schema-invalid" && result.violation).toContain("queryId");
    expect(result.kind === "schema-invalid" && result.violation).toContain("999");
    expect(result.kind === "schema-invalid" && result.violation).toContain("6");
  });

  // ── WR-04: an unreadable path is not reported as an absent one ─────────

  it("a record whose artifactPath resolves to a DIRECTORY yields artifact-unreadable (not artifact-absent), carrying the path and a non-empty errno code (WR-04)", () => {
    const dir = mkdtempSync(join(tmpdir(), "stz-collab-handoff-unreadable-"));
    const unreadablePath = join(dir, "not-a-file");
    mkdirSync(unreadablePath);
    const record: HandoffRecord = {
      queryId: 7,
      attemptId: "a7",
      definitionHash: "d7",
      kbRevision: ADMISSION_RECORD.revisionSha,
      artifactPath: unreadablePath,
      artifactSha256: "irrelevant",
      canonicalSha256: "c7",
    };
    const result = verifyHandoffAtRead(7, record);
    expect(result.kind).toBe("artifact-unreadable");
    expect(result.kind === "artifact-unreadable" && result.path).toBe(unreadablePath);
    expect(result.kind === "artifact-unreadable" && result.code.length).toBeGreaterThan(0);
  });

  // ── WR-05: canonicalSha256 is a required handoff-record binding ────────

  it("a record whose canonicalSha256 is empty is record-corrupt, named like every other missing binding (WR-05)", () => {
    const dir = mkdtempSync(join(tmpdir(), "stz-collab-handoff-canonical-"));
    const path = join(dir, "artifact.json");
    const artifact: SubgraphArtifactV1 = {
      schemaVersion: SUBGRAPH_SCHEMA_VERSION,
      queryId: 8,
      kbRevision: ADMISSION_RECORD.revisionSha,
      nodes: [1, 2],
      edges: [[1, 2, 1]],
    };
    const bytes = Buffer.from(JSON.stringify(artifact));
    writeFileSync(path, bytes);
    const record: HandoffRecord = {
      queryId: 8,
      attemptId: "a8",
      definitionHash: "d8",
      kbRevision: ADMISSION_RECORD.revisionSha,
      artifactPath: path,
      artifactSha256: createHash("sha256").update(bytes).digest("hex"),
      canonicalSha256: "",
    };
    const result = verifyHandoffAtRead(8, record);
    expect(result.kind).toBe("record-corrupt");
    expect(result.kind === "record-corrupt" && result.violation).toContain("canonicalSha256");
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
    // A third, surviving task (query 1003, present in the fixture) keeps
    // this test on the ordinary path: if every task in the run failed at
    // handoff the run would take the all-miss branch instead (T-23-08,
    // covered by its own tests below), which is not what this test is about.
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

  // ── CR-02/T-22-12: artifact edges verified against the KB's real edges ──

  it("rejects a fabricated relation between two real, in-neighbourhood, connected nodes -- a relation id the neighbourhood never records at all (CR-02)", () => {
    const neighborhood: KbNeighborhood = {
      queryId: 9005,
      seeds: [1],
      nodes: [1, 2, 3].map((id) => ({ id, label: `n${id}`, type: "gene" })),
      edges: [
        [1, 2, 1],
        [2, 3, 2],
      ],
      relationNames: { "1": "assoc", "2": "part" },
    };
    const artifact: SubgraphArtifactV1 = {
      schemaVersion: SUBGRAPH_SCHEMA_VERSION,
      queryId: 9005,
      kbRevision: "rev",
      nodes: [1, 2, 3],
      edges: [
        [1, 2, 1],
        [2, 3, 2],
        [1, 3, 99], // fabricated: relation 99 never recorded between 1 and 3
      ],
    };
    const result = validateSubgraphAgainstNeighborhood(artifact, neighborhood);
    if (result.ok) throw new Error("expected failure");
    expect(result.violation.condition).toBe("fabricated-edge");
    if (result.violation.condition !== "fabricated-edge") throw new Error("wrong condition");
    expect(result.violation.src).toBe(1);
    expect(result.violation.dst).toBe(3);
    expect(result.violation.relationId).toBe(99);
  });

  it("rejects a wrong relation between two nodes that ARE adjacent in the neighbourhood, using a relation id that is real elsewhere (CR-02)", () => {
    const neighborhood: KbNeighborhood = {
      queryId: 9006,
      seeds: [1],
      nodes: [1, 2, 3].map((id) => ({ id, label: `n${id}`, type: "gene" })),
      edges: [
        [1, 2, 1],
        [2, 3, 2],
      ],
      relationNames: { "1": "assoc", "2": "part" },
    };
    const artifact: SubgraphArtifactV1 = {
      schemaVersion: SUBGRAPH_SCHEMA_VERSION,
      queryId: 9006,
      kbRevision: "rev",
      nodes: [1, 2, 3],
      edges: [
        [1, 2, 1],
        [2, 3, 1], // real nodes, really adjacent (via relation 2) -- but relation 1 is wrong here
      ],
    };
    const result = validateSubgraphAgainstNeighborhood(artifact, neighborhood);
    if (result.ok) throw new Error("expected failure");
    expect(result.violation.condition).toBe("fabricated-edge");
    if (result.violation.condition !== "fabricated-edge") throw new Error("wrong condition");
    expect(result.violation.src).toBe(2);
    expect(result.violation.dst).toBe(3);
    expect(result.violation.relationId).toBe(1);
  });

  it("accepts an artifact edge listed in the opposite orientation to the neighbourhood's own triple (FA-E, undirected comparison)", () => {
    const neighborhood: KbNeighborhood = {
      queryId: 9007,
      seeds: [11],
      nodes: [11, 12, 13].map((id) => ({ id, label: `n${id}`, type: "gene" })),
      edges: [
        [11, 12, 1],
        [12, 13, 2],
      ],
      relationNames: { "1": "assoc", "2": "part" },
    };
    const artifact: SubgraphArtifactV1 = {
      schemaVersion: SUBGRAPH_SCHEMA_VERSION,
      queryId: 9007,
      kbRevision: "rev",
      nodes: [11, 12, 13],
      edges: [
        [12, 11, 1], // opposite orientation to the neighbourhood's [11, 12, 1]
        [12, 13, 2],
      ],
    };
    expect(validateSubgraphAgainstNeighborhood(artifact, neighborhood).ok).toBe(true);
  });

  it("describeHandoffOutcome renders a fabricated-edge violation to a non-empty string naming the two node ids and the relation id", () => {
    const description = describeHandoffOutcome({
      kind: "cd05-violation",
      violation: { condition: "fabricated-edge", src: 7, dst: 8, relationId: 42 },
    });
    expect(description.length).toBeGreaterThan(0);
    expect(description).toContain("7");
    expect(description).toContain("8");
    expect(description).toContain("42");
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

  it("a builder-padded artifact (a real 2-node subgraph repeating one id to read as 3) resolves to schema-invalid, not cd05-violation -- proof the duplicate-id rejection precedes the count check (CR-01a/T-22-12), while other tasks still score", async () => {
    const taskD: CollaborativeBatteryTask = {
      id: "task-d",
      queryId: 1004,
      prompt: "Which entity does this describe (task D)?",
    };
    const { provider: normalProvider } = makeProvider({ 1001: [11], 1002: [21], 1004: [41] });
    const paddedNodeProvider: Provider = {
      kind: "openai",
      baseUrl: "http://test-provider.invalid",
      async chat(req: ChatRequest): Promise<ChatResponse> {
        const system = req.system ?? "";
        const userText = req.messages[0]?.content ?? "";
        const match = userText.match(/QUERY_ID: (\d+)/);
        const queryId = match ? Number(match[1]) : NaN;
        if (system.includes("BUILDER-ROLE") && queryId === 1004) {
          // Fixture 1004 really has 2 nodes (41, 42) -- padding 41 a second
          // time reads as 3 entries (>= MIN_SUBGRAPH_NODES) under a raw
          // array-length count, the exact CR-01a bypass.
          const artifact = {
            schemaVersion: SUBGRAPH_SCHEMA_VERSION,
            queryId,
            kbRevision: ADMISSION_RECORD.revisionSha,
            nodes: [41, 42, 41],
            edges: [[41, 42, 3]],
          };
          return {
            text: "```path=subgraph.json\n" + JSON.stringify(artifact) + "\n```",
            model: req.model,
            usage: ZERO_USAGE,
          };
        }
        return normalProvider.chat(req);
      },
    };
    const record = await runCollaborativeBattery(
      baseArgs({
        tasks: [...TASKS, taskD],
        execFn: makeExecFn({ 1001: 1, 1002: 1, 1004: 1 }),
        runOpts: { providerImpl: paddedNodeProvider },
      }),
    );
    const outcomeD = record.outcomes.find((o) => o.queryId === 1004)!;
    expect(outcomeD.handoffOutcome.kind).toBe("schema-invalid");
    expect(outcomeD.hit1).toBe(0);
    expect(outcomeD.attempt).toBeUndefined();
    const outcomeA = record.outcomes.find((o) => o.queryId === 1001)!;
    const outcomeB = record.outcomes.find((o) => o.queryId === 1002)!;
    expect(outcomeA.attempt).toBeDefined();
    expect(outcomeB.attempt).toBeDefined();
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

// ── WR-05/IN-03: canonicalSha256 recorded, task-id guarded (Plan 22-06 Task 3) ──

describe("runCollaborativeBattery — WR-05 canonicalSha256 recorded, IN-03 task-id guard (Plan 22-06 Task 3)", () => {
  it("every surviving handoff record's canonicalSha256 equals hashSubgraphArtifact over the verified artifact, and artifactSha256 still equals the on-disk raw bytes' own digest (WR-05/FA-A)", async () => {
    const { provider } = makeProvider({ 1001: [11], 1002: [21] });
    const record = await runCollaborativeBattery(
      baseArgs({ execFn: makeExecFn({ 1001: 1, 1002: 1 }), runOpts: { providerImpl: provider } }),
    );
    expect(record.handoffRecords.length).toBeGreaterThan(0);
    for (const handoff of record.handoffRecords) {
      const onDiskBytes = readFileSync(handoff.artifactPath);
      expect(handoff.artifactSha256).toBe(createHash("sha256").update(onDiskBytes).digest("hex"));
      const parsedArtifact: unknown = JSON.parse(onDiskBytes.toString("utf8"));
      const schemaResult = parseSubgraphArtifact(parsedArtifact);
      expect(schemaResult.ok).toBe(true);
      expect(handoff.canonicalSha256).toBe(schemaResult.ok ? hashSubgraphArtifact(schemaResult.artifact) : undefined);
    }
  });

  it("rejects a task whose id contains a traversal sequence, naming the id, before any provider call is made (IN-03)", async () => {
    const { provider, callCount } = makeProvider({});
    const badTask: CollaborativeBatteryTask = {
      id: "../evil",
      queryId: 1001,
      prompt: "Which entity does this describe?",
    };
    const err = await thrownAsync(() =>
      runCollaborativeBattery(baseArgs({ tasks: [badTask], runOpts: { providerImpl: provider } })),
    );
    expect(err.message).toContain("../evil");
    expect(callCount()).toBe(0);
  });

  it("accepts the real pool's stark-prime:<query_id> task id shape (FA-B)", async () => {
    const realIdTask: CollaborativeBatteryTask = {
      id: "stark-prime:1001",
      queryId: 1001,
      prompt: "Which entity does this describe?",
    };
    const { provider } = makeProvider({ 1001: [11] });
    const record = await runCollaborativeBattery(
      baseArgs({ tasks: [realIdTask], execFn: makeExecFn({ 1001: 1 }), runOpts: { providerImpl: provider } }),
    );
    expect(record.outcomes).toHaveLength(1);
  });
});

// ── D-11: preflight cadence — once, before anything is spent (Task 3) ───

describe("runCollaborativeBattery — D-11 preflight cadence (Plan 22-02 Task 3)", () => {
  it("invokes the preflight exactly once, regardless of task count", async () => {
    const { provider } = makeProvider({ 1001: [11], 1002: [21] });
    let preflightCalls = 0;
    const preflightFn = (a: RunScoringPreflightArgs) => {
      preflightCalls++;
      return runScoringPreflight(a);
    };
    await runCollaborativeBattery(
      baseArgs({
        preflightFn,
        execFn: makeExecFn({ 1001: 1, 1002: 1 }),
        runOpts: { providerImpl: provider },
      }),
    );
    expect(preflightCalls).toBe(1);
  });

  it("the run record's preflight report carries the SAME warm-up ScoringAttempt object the seam produced, by identity", async () => {
    const { provider } = makeProvider({ 1001: [11], 1002: [21] });
    let captured: ReturnType<typeof runScoringPreflight> | undefined;
    const preflightFn = (a: RunScoringPreflightArgs) => {
      const report = runScoringPreflight(a);
      captured = report;
      return report;
    };
    const record = await runCollaborativeBattery(
      baseArgs({
        preflightFn,
        execFn: makeExecFn({ 1001: 1, 1002: 1 }),
        runOpts: { providerImpl: provider },
      }),
    );
    expect(captured).toBeDefined();
    expect(Object.is(record.preflight, captured)).toBe(true);
    expect(Object.is(record.preflight.warmUpAttempt, captured!.warmUpAttempt)).toBe(true);
  });

  it("a preflight failure propagates as a thrown error naming the condition, converted into no per-task outcome", async () => {
    const { provider } = makeProvider({ 1001: [11], 1002: [21] });
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
  });

  it("a zero-task run is refused before the preflight is called, naming the empty-task condition, with zero preflight calls recorded", async () => {
    let preflightCalls = 0;
    const preflightFn = (a: RunScoringPreflightArgs) => {
      preflightCalls++;
      return runScoringPreflight(a);
    };
    const err = await thrownAsync(() =>
      runCollaborativeBattery(baseArgs({ tasks: [], preflightFn })),
    );
    expect(err.message).toContain("tasks is empty");
    expect(preflightCalls).toBe(0);
  });
});

// ── D-05: no-subgraph condition (Plan 23-02 Task 1) ─────────────────────

describe("runCollaborativeBattery — D-05 no-subgraph condition (Plan 23-02 Task 1)", () => {
  const ONE_TASK: CollaborativeBatteryTask[] = [
    { id: "task-a", queryId: 1001, prompt: "Which entity does this describe (task A)?" },
  ];

  function neighbourhoodSpy(): { fn: KbNeighborhoodFn; callCount: () => number } {
    let calls = 0;
    return {
      fn: (queryId: number) => {
        calls++;
        return kbNeighborhoodFn(queryId);
      },
      callCount: () => calls,
    };
  }

  it("a one-task no-subgraph run returns a run record with one outcome carrying the same field set as a graph-condition outcome", async () => {
    const { provider: noSubgraphProvider } = makeProvider({ 1001: [11] });
    const noSubgraphRecord = await runCollaborativeBattery(
      baseArgs({
        tasks: ONE_TASK,
        arm: "no-subgraph",
        execFn: makeExecFn({ 1001: 1 }),
        runOpts: { providerImpl: noSubgraphProvider },
      }),
    );
    const { provider: graphProvider } = makeProvider({ 1001: [11] });
    const graphRecord = await runCollaborativeBattery(
      baseArgs({
        tasks: ONE_TASK,
        arm: "graph",
        execFn: makeExecFn({ 1001: 1 }),
        runOpts: { providerImpl: graphProvider },
      }),
    );
    expect(noSubgraphRecord.outcomes).toHaveLength(1);
    expect(graphRecord.outcomes).toHaveLength(1);
    expect(Object.keys(noSubgraphRecord.outcomes[0]!).sort()).toEqual(
      Object.keys(graphRecord.outcomes[0]!).sort(),
    );
  });

  it("calls the injected neighbourhood function zero times under the no-subgraph condition", async () => {
    const { provider } = makeProvider({ 1001: [11] });
    const spy = neighbourhoodSpy();
    await runCollaborativeBattery(
      baseArgs({
        tasks: ONE_TASK,
        arm: "no-subgraph",
        kbNeighborhoodFn: spy.fn,
        execFn: makeExecFn({ 1001: 1 }),
        runOpts: { providerImpl: provider },
      }),
    );
    expect(spy.callCount()).toBe(0);
  });

  it("makes exactly one provider battery call under the no-subgraph condition, not two", async () => {
    const { provider, callCount } = makeProvider({ 1001: [11] });
    await runCollaborativeBattery(
      baseArgs({
        tasks: ONE_TASK,
        arm: "no-subgraph",
        execFn: makeExecFn({ 1001: 1 }),
        runOpts: { providerImpl: provider },
      }),
    );
    expect(callCount()).toBe(1);
  });

  it("builderRun and builderBattery are absent under the no-subgraph condition and present under the graph condition", async () => {
    const { provider: noSubgraphProvider } = makeProvider({ 1001: [11] });
    const noSubgraphRecord = await runCollaborativeBattery(
      baseArgs({
        tasks: ONE_TASK,
        arm: "no-subgraph",
        execFn: makeExecFn({ 1001: 1 }),
        runOpts: { providerImpl: noSubgraphProvider },
      }),
    );
    expect(noSubgraphRecord.builderBattery).toBeUndefined();
    expect(noSubgraphRecord.builderRun).toBeUndefined();

    const { provider: graphProvider } = makeProvider({ 1001: [11] });
    const graphRecord = await runCollaborativeBattery(
      baseArgs({
        tasks: ONE_TASK,
        arm: "graph",
        execFn: makeExecFn({ 1001: 1 }),
        runOpts: { providerImpl: graphProvider },
      }),
    );
    expect(graphRecord.builderBattery).toBeDefined();
    expect(graphRecord.builderRun).toBeDefined();
  });

  it("a zero-task no-subgraph run throws before the injected provider is called", async () => {
    const { provider, callCount } = makeProvider({});
    const err = await thrownAsync(() =>
      runCollaborativeBattery(
        baseArgs({ tasks: [], arm: "no-subgraph", runOpts: { providerImpl: provider } }),
      ),
    );
    expect(err.message).toContain("tasks is empty");
    expect(callCount()).toBe(0);
  });
});

// ── D-05: prompt parity + default preservation (Plan 23-02 Task 2) ──────

describe("runCollaborativeBattery — D-05 prompt parity + default preservation (Plan 23-02 Task 2)", () => {
  const PARITY_TASK: CollaborativeBatteryTask = {
    id: "task-a",
    queryId: 1001,
    prompt: "Which entity does this describe (task A)?",
  };

  const EMPTY_ARTIFACT: SubgraphArtifactV1 = {
    schemaVersion: SUBGRAPH_SCHEMA_VERSION,
    queryId: 1001,
    kbRevision: ADMISSION_RECORD.revisionSha,
    nodes: [],
    edges: [],
  };
  const EMPTY_NEIGHBOURHOOD: KbNeighborhood = {
    queryId: 1001,
    seeds: [],
    nodes: [],
    edges: [],
    relationNames: {},
  };

  function threeNodeArtifact(): SubgraphArtifactV1 {
    return {
      schemaVersion: SUBGRAPH_SCHEMA_VERSION,
      queryId: 1001,
      kbRevision: ADMISSION_RECORD.revisionSha,
      nodes: [11, 12, 13],
      edges: [
        [11, 12, 1],
        [12, 13, 2],
      ],
    };
  }

  /** A SECOND, DIFFERENT non-empty artifact -- same task/neighbourhood, a
   *  disjoint node/edge set. Used (with `threeNodeArtifact`) to derive the
   *  template's true artifact-independent boundary WITHOUT ever rendering
   *  the no-subgraph condition -- see `templateBoundary` below for why this
   *  avoids the tautology a graph-vs-null-only comparison would risk. */
  function twoNodeArtifact(): SubgraphArtifactV1 {
    return {
      schemaVersion: SUBGRAPH_SCHEMA_VERSION,
      queryId: 1001,
      kbRevision: ADMISSION_RECORD.revisionSha,
      nodes: [14, 15],
      edges: [[14, 15, 3]],
    };
  }

  /**
   * Splits two renders into (shared prefix, divergent middle, shared
   * suffix) purely structurally -- by walking matching lines forward from
   * the start and backward from the end -- rather than by hardcoding the
   * shared template's prose.
   */
  function splitStructuralParity(a: string, b: string) {
    const linesA = a.split("\n");
    const linesB = b.split("\n");
    let prefixLen = 0;
    while (
      prefixLen < linesA.length &&
      prefixLen < linesB.length &&
      linesA[prefixLen] === linesB[prefixLen]
    ) {
      prefixLen++;
    }
    let suffixLen = 0;
    while (
      suffixLen < linesA.length - prefixLen &&
      suffixLen < linesB.length - prefixLen &&
      linesA[linesA.length - 1 - suffixLen] === linesB[linesB.length - 1 - suffixLen]
    ) {
      suffixLen++;
    }
    return {
      prefixLen,
      suffixLen,
      prefixA: linesA.slice(0, prefixLen).join("\n"),
      prefixB: linesB.slice(0, prefixLen).join("\n"),
      suffixA: linesA.slice(linesA.length - suffixLen).join("\n"),
      suffixB: linesB.slice(linesB.length - suffixLen).join("\n"),
      middleA: linesA.slice(prefixLen, linesA.length - suffixLen),
      middleB: linesB.slice(prefixLen, linesB.length - suffixLen),
    };
  }

  /**
   * Derives the shared template's artifact-independent prefix/suffix from
   * TWO DIFFERENT NON-EMPTY artifacts (never from the no-subgraph render
   * itself). This is the tautology guard: if a boundary were instead
   * derived by diffing the graph render directly against the null render,
   * a bug that changed the outer template ONLY for the empty-artifact case
   * would just shift where the two renders first diverge -- the "boundary"
   * would silently move to swallow the bug, and the parity assertion below
   * would still pass. Deriving the boundary from two non-empty variants
   * instead means the reference boundary can only ever reflect genuine
   * artifact-independent template text, so it stays a fixed target the
   * null render's own prefix/suffix must still hit.
   */
  function templateBoundary() {
    const refA = buildAnswererTaskPrompt(PARITY_TASK, threeNodeArtifact(), kbNeighborhoodFn(1001));
    const refB = buildAnswererTaskPrompt(PARITY_TASK, twoNodeArtifact(), kbNeighborhoodFn(1001));
    return { refA, refB, ...splitStructuralParity(refA, refB) };
  }

  it("the graph and no-subgraph renders are identical before the subgraph block and from the emit instruction onward, and are not equal overall", () => {
    const boundary = templateBoundary();
    // non-degenerate boundary: the derived shared prefix/suffix are not
    // accidentally the whole string or empty.
    expect(boundary.prefixLen).toBeGreaterThan(0);
    expect(boundary.suffixLen).toBeGreaterThan(0);
    expect(boundary.prefixA).toContain(PARITY_TASK.prompt);
    expect(boundary.prefixA).toContain("QUERY_ID: 1001");
    expect(boundary.suffixA).toContain("most likely answer first");

    const nullPrompt = buildAnswererTaskPrompt(PARITY_TASK, EMPTY_ARTIFACT, EMPTY_NEIGHBOURHOOD);
    const nullLines = nullPrompt.split("\n");
    const nullPrefix = nullLines.slice(0, boundary.prefixLen).join("\n");
    const nullSuffix = nullLines.slice(nullLines.length - boundary.suffixLen).join("\n");
    expect(nullPrefix).toBe(boundary.prefixA);
    expect(nullSuffix).toBe(boundary.suffixA);
    expect(boundary.refA).not.toBe(nullPrompt);
  });

  it("the no-subgraph render contains the task's own question text and its query-id line", () => {
    const nullPrompt = buildAnswererTaskPrompt(PARITY_TASK, EMPTY_ARTIFACT, EMPTY_NEIGHBOURHOOD);
    expect(nullPrompt).toContain(PARITY_TASK.prompt);
    expect(nullPrompt).toContain("QUERY_ID: 1001");
  });

  it("the no-subgraph render contains no node line and no edge line", () => {
    const nullPrompt = buildAnswererTaskPrompt(PARITY_TASK, EMPTY_ARTIFACT, EMPTY_NEIGHBOURHOOD);
    expect(nullPrompt).not.toMatch(/id=\d+/);
    expect(nullPrompt).not.toMatch(/-\[.*\]->/);
  });

  it("the no-subgraph render's subgraph block (the segment between the independently-derived template boundary) is empty of id-bearing node lines and edge lines", () => {
    const boundary = templateBoundary();
    const nullPrompt = buildAnswererTaskPrompt(PARITY_TASK, EMPTY_ARTIFACT, EMPTY_NEIGHBOURHOOD);
    const nullLines = nullPrompt.split("\n");
    const nullMiddle = nullLines.slice(boundary.prefixLen, nullLines.length - boundary.suffixLen);
    expect(nullMiddle.length).toBeGreaterThan(0);
    for (const line of nullMiddle) {
      expect(line).not.toMatch(/id=\d+/);
      expect(line).not.toMatch(/-\[.*\]->/);
    }
  });

  it("omitting the arm field and passing the graph member explicitly produce equal outcomes (deterministic fields) for the same inputs, and the no-subgraph member differs in exactly the expected way", async () => {
    function comparableOutcomes(record: Awaited<ReturnType<typeof runCollaborativeBattery>>) {
      return record.outcomes.map((o) => ({
        queryId: o.queryId,
        hit1: o.hit1,
        diagnostics: o.diagnostics,
        handoffOutcome: o.handoffOutcome,
        attemptOutcome: o.attempt?.outcome,
        submittedPredDict: o.attempt?.submittedPredDict,
      }));
    }

    const { provider: omittedProvider } = makeProvider({ 1001: [11] });
    const omittedRecord = await runCollaborativeBattery(
      baseArgs({
        tasks: [PARITY_TASK],
        execFn: makeExecFn({ 1001: 1 }),
        runOpts: { providerImpl: omittedProvider },
      }),
    );
    const { provider: graphProvider } = makeProvider({ 1001: [11] });
    const graphRecord = await runCollaborativeBattery(
      baseArgs({
        tasks: [PARITY_TASK],
        arm: "graph",
        execFn: makeExecFn({ 1001: 1 }),
        runOpts: { providerImpl: graphProvider },
      }),
    );
    expect(comparableOutcomes(omittedRecord)).toEqual(comparableOutcomes(graphRecord));
    expect(omittedRecord.builderBattery).toBeDefined();
    expect(omittedRecord.builderRun).toBeDefined();
    expect(graphRecord.builderBattery).toBeDefined();
    expect(graphRecord.builderRun).toBeDefined();

    let neighbourhoodCalls = 0;
    const spyFn: KbNeighborhoodFn = (queryId) => {
      neighbourhoodCalls++;
      return kbNeighborhoodFn(queryId);
    };
    const { provider: nullProvider } = makeProvider({ 1001: [11] });
    const nullRecord = await runCollaborativeBattery(
      baseArgs({
        tasks: [PARITY_TASK],
        arm: "no-subgraph",
        kbNeighborhoodFn: spyFn,
        execFn: makeExecFn({ 1001: 1 }),
        runOpts: { providerImpl: nullProvider },
      }),
    );
    expect(nullRecord.builderBattery).toBeUndefined();
    expect(nullRecord.builderRun).toBeUndefined();
    expect(neighbourhoodCalls).toBe(0);
  });

  it("under the no-subgraph condition, a non-completing answerer (no parseable ranked list) still yields an outcome with hit1 of zero and a named non-success outcome, present in the outcomes array", async () => {
    const { provider } = makeProvider({ 1001: [] }); // no parseable ranked-list entries
    const record = await runCollaborativeBattery(
      baseArgs({
        tasks: [PARITY_TASK],
        arm: "no-subgraph",
        execFn: makeExecFn({ 1001: 0 }),
        runOpts: { providerImpl: provider },
      }),
    );
    expect(record.outcomes).toHaveLength(1);
    expect(record.outcomes[0]!.hit1).toBe(0);
    expect(record.outcomes[0]!.handoffOutcome.kind).not.toBe("success");
    expect(record.outcomes.some((o) => o.queryId === PARITY_TASK.queryId)).toBe(true);
  });

  it("the no-subgraph condition's actual answerer prompt (run through runCollaborativeBattery) equals the shared renderer's direct output on an empty artifact and empty neighbourhood -- proving the branch calls buildAnswererTaskPrompt itself rather than assembling its own copy", async () => {
    const { provider } = makeProvider({ 1001: [11] });
    const record = await runCollaborativeBattery(
      baseArgs({
        tasks: [PARITY_TASK],
        arm: "no-subgraph",
        execFn: makeExecFn({ 1001: 1 }),
        runOpts: { providerImpl: provider },
      }),
    );
    const actualPrompt = record.answererBattery.tasks.find((t) => t.id === PARITY_TASK.id)!.prompt;
    const expectedPrompt = buildAnswererTaskPrompt(PARITY_TASK, EMPTY_ARTIFACT, EMPTY_NEIGHBOURHOOD);
    expect(actualPrompt).toBe(expectedPrompt);
  });
});

// ── Plan 22-04 Task 2: the real dispatch behind the seam ────────────────

const NEIGHBORHOOD_HAPPY_STDOUT = JSON.stringify({
  kb: "prime",
  queryId: 42,
  revision: ADMISSION_RECORD.revisionSha,
  seeds: [1, 2],
  nodes: [
    { id: 1, label: "Node A", type: "drug" },
    { id: 2, label: "Node B", type: "gene/protein" },
  ],
  edges: [[1, 2, 3]],
  relationNames: { "3": "target" },
});

describe("parseNeighborhoodStdout — field-by-field validation (Plan 22-04 Task 2)", () => {
  it("parses well-formed stdout into the same KbNeighborhood shape the fixtures satisfy", () => {
    const result = parseNeighborhoodStdout(NEIGHBORHOOD_HAPPY_STDOUT);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.neighborhood).toEqual({
      queryId: 42,
      seeds: [1, 2],
      nodes: [
        { id: 1, label: "Node A", type: "drug" },
        { id: 2, label: "Node B", type: "gene/protein" },
      ],
      edges: [[1, 2, 3]],
      relationNames: { "3": "target" },
    });
  });

  it("rejects stdout that is not valid JSON, naming the parse condition", () => {
    const result = parseNeighborhoodStdout("not json at all");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a violation");
    expect(result.violation).toContain("did not parse as JSON");
  });

  it("rejects a non-object JSON value", () => {
    const result = parseNeighborhoodStdout("[1,2,3]");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a violation");
    expect(result.violation).toContain("must be a JSON object");
  });

  it("rejects an echoed revision that differs from the pin, naming both", () => {
    const raw = JSON.stringify({
      kb: "prime",
      queryId: 42,
      revision: "deadbeef",
      seeds: [1],
      nodes: [{ id: 1, label: "A", type: "drug" }],
      edges: [],
      relationNames: {},
    });
    const result = parseNeighborhoodStdout(raw);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a violation");
    expect(result.violation).toContain("deadbeef");
    expect(result.violation).toContain(ADMISSION_RECORD.revisionSha);
  });

  it("rejects a node record whose id is not an integer", () => {
    const raw = JSON.stringify({
      kb: "prime",
      queryId: 42,
      revision: ADMISSION_RECORD.revisionSha,
      seeds: [1],
      nodes: [{ id: 1.5, label: "A", type: "drug" }],
      edges: [],
      relationNames: {},
    });
    const result = parseNeighborhoodStdout(raw);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a violation");
    expect(result.violation).toContain("non-integer");
  });

  it("rejects a malformed edge triple", () => {
    const raw = JSON.stringify({
      kb: "prime",
      queryId: 42,
      revision: ADMISSION_RECORD.revisionSha,
      seeds: [1],
      nodes: [{ id: 1, label: "A", type: "drug" }],
      edges: [[1, 2]],
      relationNames: {},
    });
    const result = parseNeighborhoodStdout(raw);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a violation");
    expect(result.violation).toContain("integer triple");
  });

  it("an empty seed set is a named refusal, not an empty-but-successful neighbourhood", () => {
    const raw = JSON.stringify({
      kb: "prime",
      queryId: 42,
      revision: ADMISSION_RECORD.revisionSha,
      seeds: [],
      reason: "no KB node name matched the query text",
    });
    const result = parseNeighborhoodStdout(raw);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a violation");
    expect(result.violation).toContain("no seed entity");
    expect(result.violation).toContain("no KB node name matched the query text");
  });
});

describe("makeDefaultKbNeighborhoodFn — the real dispatch behind the seam (Plan 22-04 Task 2)", () => {
  it("returns a parsed neighbourhood when the exec seam returns well-formed JSON on exit code zero", () => {
    const execFn: ScoringExecFn = () => fakeResult({ stdout: NEIGHBORHOOD_HAPPY_STDOUT });
    const fn = makeDefaultKbNeighborhoodFn({ execFn });
    const nb = fn(42);
    expect(nb.queryId).toBe(42);
    expect(nb.seeds).toEqual([1, 2]);
    expect(nb.nodes).toHaveLength(2);
    expect(nb.edges).toEqual([[1, 2, 3]]);
  });

  it("the exec seam receives an argv array asserted element by element, revision compared to the admission record", () => {
    let capturedFile: string | undefined;
    let capturedArgv: string[] | undefined;
    const execFn: ScoringExecFn = (file, args) => {
      capturedFile = file;
      capturedArgv = args;
      return fakeResult({ stdout: NEIGHBORHOOD_HAPPY_STDOUT });
    };
    makeDefaultKbNeighborhoodFn({ execFn })(42);
    expect(capturedFile).toBe(VENV_PYTHON_REL);
    expect(capturedArgv).toEqual([
      NEIGHBORHOOD_ONE_REL,
      "prime",
      "42",
      "--hf-revision",
      ADMISSION_RECORD.revisionSha,
      "--hops",
      String(NEIGHBORHOOD_HOPS),
      "--cap",
      String(NEIGHBORHOOD_MAX_NODES),
    ]);
    expect(capturedArgv?.[4]).toBe(requireCollaborativeAdmitted("stark-prime").revisionSha);
  });

  it("a timeout produces a named refusal and never reaches the stdout parser", () => {
    const execFn: ScoringExecFn = () =>
      fakeResult({
        error: Object.assign(new Error("spawnSync ETIMEDOUT"), { code: "ETIMEDOUT" }) as NodeJS.ErrnoException,
        signal: "SIGTERM",
        stdout: "this would fail to parse as JSON",
      });
    const err = thrown(() => makeDefaultKbNeighborhoodFn({ execFn })(42));
    expect(err.message).toContain("timed out");
    expect(err.message).not.toContain("did not parse as JSON");
  });

  it("a signal termination produces a named refusal distinct from timeout, and never reaches the stdout parser", () => {
    const execFn: ScoringExecFn = () =>
      fakeResult({ signal: "SIGKILL", stdout: "this would fail to parse as JSON" });
    const err = thrown(() => makeDefaultKbNeighborhoodFn({ execFn })(42));
    expect(err.message).toContain("SIGKILL");
    expect(err.message).not.toContain("did not parse as JSON");
  });

  it("a spawn error (process unreachable) produces a named refusal naming the process condition", () => {
    const execFn: ScoringExecFn = () =>
      fakeResult({
        error: Object.assign(new Error("spawnSync ENOENT"), { code: "ENOENT" }) as NodeJS.ErrnoException,
        status: null,
        stdout: "this would fail to parse as JSON",
      });
    const err = thrown(() => makeDefaultKbNeighborhoodFn({ execFn })(42));
    expect(err.message).toContain("could not be reached");
    expect(err.message).toContain("ENOENT");
    expect(err.message).not.toContain("did not parse as JSON");
  });

  it("a non-zero exit produces a named refusal carrying a bounded stderr tail, and never reaches the stdout parser", () => {
    const execFn: ScoringExecFn = () =>
      fakeResult({ status: 1, stderr: "Traceback: something broke", stdout: "this would fail to parse as JSON" });
    const err = thrown(() => makeDefaultKbNeighborhoodFn({ execFn })(42));
    expect(err.message).toContain("exited with code 1");
    expect(err.message).toContain("Traceback: something broke");
    expect(err.message).not.toContain("did not parse as JSON");
  });

  it("an empty-seed helper response surfaces as a named refusal through the dispatch, not an empty neighbourhood", () => {
    const raw = JSON.stringify({
      kb: "prime",
      queryId: 42,
      revision: ADMISSION_RECORD.revisionSha,
      seeds: [],
      reason: "no KB node name matched the query text",
    });
    const execFn: ScoringExecFn = () => fakeResult({ stdout: raw });
    const err = thrown(() => makeDefaultKbNeighborhoodFn({ execFn })(42));
    expect(err.message).toContain("no seed entity");
  });

  // Regression (Phase 23 Plan 06 continuation #3): Node's spawnSync default
  // maxBuffer is 1 MiB; a live query's neighbourhood was measured at
  // 2,168,562 bytes and silently SIGTERM'd every relaunch until this fix.
  it("passes an explicit maxBuffer at or above NEIGHBORHOOD_MAX_BUFFER_BYTES to the exec seam", () => {
    let capturedOpts: { input: string; timeout: number; encoding: "utf8"; maxBuffer?: number } | undefined;
    const execFn: ScoringExecFn = (file, args, opts) => {
      capturedOpts = opts;
      return fakeResult({ stdout: NEIGHBORHOOD_HAPPY_STDOUT });
    };
    makeDefaultKbNeighborhoodFn({ execFn })(42);
    expect(capturedOpts?.maxBuffer).toBeDefined();
    expect(capturedOpts!.maxBuffer!).toBeGreaterThanOrEqual(NEIGHBORHOOD_MAX_BUFFER_BYTES);
  });

  it("an ENOBUFS exec result (maxBuffer overrun) is classified as a buffer-cap refusal naming the cap, never a bare signal-terminated message -- ENOBUFS also sets `signal`, the same trap ETIMEDOUT sets", () => {
    const execFn: ScoringExecFn = () =>
      fakeResult({
        error: Object.assign(new Error("spawnSync ENOBUFS"), { code: "ENOBUFS" }) as NodeJS.ErrnoException,
        signal: "SIGTERM",
        stdout: "this would fail to parse as JSON",
      });
    const err = thrown(() => makeDefaultKbNeighborhoodFn({ execFn })(42));
    expect(err.message).toContain(String(NEIGHBORHOOD_MAX_BUFFER_BYTES));
    expect(err.message).not.toContain("killed by signal");
    expect(err.message).not.toContain("did not parse as JSON");
  });
});

// ── T-23-08: a KB-neighbourhood refusal is one task's miss ──────────────

/** The exact message shape `makeDefaultKbNeighborhoodFn` throws for FA-7's
 *  empty-seed refusal (asserted against the real dispatch in the
 *  empty-seed test above, so this double cannot drift silently). */
function seedRefusalError(queryId: number): CollaborativeRunnerError {
  return new CollaborativeRunnerError(
    `kbNeighborhoodFn: neighbourhood extraction for query ${queryId} produced invalid output -- ` +
      `the helper ${NEIGHBOURHOOD_EMPTY_SEED_MARKER} -- no KB node name matched the query text via ` +
      `query-text seeding (FA-7) (an empty seed set is a refusal, never an empty-but-successful neighbourhood)`,
  );
}

const TASK_C: CollaborativeBatteryTask = {
  id: "task-c",
  queryId: 1003,
  prompt: "Which entity does this describe (task C)?",
};

describe("kbNeighborhoodFn refusal is a per-task miss, never a battery crash (T-23-08)", () => {
  it("one refusing query out of three is recorded as neighbourhood-refused with hit@1 0, and the other two run normally", async () => {
    const { provider } = makeProvider({ 1001: [11], 1003: [31] });
    const refusingFn = (queryId: number): KbNeighborhood => {
      if (queryId === 1002) throw seedRefusalError(1002);
      return kbNeighborhoodFn(queryId);
    };
    const record = await runCollaborativeBattery(
      baseArgs({
        tasks: [...TASKS, TASK_C],
        kbNeighborhoodFn: refusingFn,
        execFn: makeExecFn({ 1001: 1, 1003: 1 }),
        runOpts: { providerImpl: provider },
      }),
    );

    // D-03's denominator is not gamed: the refused task is still counted.
    expect(record.outcomes).toHaveLength(3);
    const refused = record.outcomes.find((o) => o.queryId === 1002)!;
    expect(refused.handoffOutcome.kind).toBe("neighbourhood-refused");
    expect(refused.hit1).toBe(0);
    expect(refused.attempt).toBeUndefined();
    if (refused.handoffOutcome.kind === "neighbourhood-refused") {
      expect(refused.handoffOutcome.queryId).toBe(1002);
      expect(refused.handoffOutcome.reason).toContain(NEIGHBOURHOOD_EMPTY_SEED_MARKER);
    }
    for (const queryId of [1001, 1003]) {
      const ok = record.outcomes.find((o) => o.queryId === queryId)!;
      expect(ok.handoffOutcome.kind).toBe("success");
      expect(ok.hit1).toBe(1);
    }
    // The refused task never reaches the builder, so it is not a battery
    // task and no artifact of it is ever looked for.
    expect(record.builderBattery!.tasks.map((t) => t.id)).toEqual(["task-a", "task-c"]);
    expect(record.answererBattery.tasks.map((t) => t.id)).toEqual(["task-a", "task-c"]);
    expect(record.handoffRecords.map((h) => h.queryId)).toEqual([1001, 1003]);
  });

  it("the refused task keeps its own kind -- it is never overwritten by the artifact-absent read of a builder output that was never produced", async () => {
    const { provider } = makeProvider({ 1001: [11] });
    const record = await runCollaborativeBattery(
      baseArgs({
        kbNeighborhoodFn: (queryId: number) => {
          if (queryId === 1002) throw seedRefusalError(1002);
          return kbNeighborhoodFn(queryId);
        },
        execFn: makeExecFn({ 1001: 1 }),
        runOpts: { providerImpl: provider },
      }),
    );
    expect(record.outcomes.find((o) => o.queryId === 1002)!.handoffOutcome.kind).toBe("neighbourhood-refused");
  });

  it("every OTHER kbNeighborhoodFn failure mode stays a hard error -- a timeout, a signal kill and a non-seed parse violation are environment faults, not one query's miss", async () => {
    const { provider } = makeProvider({ 1001: [11], 1002: [21] });
    const messages = [
      "kbNeighborhoodFn: neighbourhood extraction for query 1002 timed out after 900000ms",
      "kbNeighborhoodFn: neighbourhood extraction for query 1002 was killed by signal SIGTERM",
      "kbNeighborhoodFn: neighbourhood extraction for query 1002 produced invalid output -- field \"nodes\" must be an array",
    ];
    for (const message of messages) {
      await expect(
        runCollaborativeBattery(
          baseArgs({
            kbNeighborhoodFn: (queryId: number) => {
              if (queryId === 1002) throw new CollaborativeRunnerError(message);
              return kbNeighborhoodFn(queryId);
            },
            execFn: makeExecFn({}),
            runOpts: { providerImpl: provider },
          }),
        ),
      ).rejects.toThrow(CollaborativeRunnerError);
    }
  });

  it("the no-subgraph null arm never calls kbNeighborhoodFn at all -- a refusing extractor cannot affect the null arm's pairing", async () => {
    const { provider } = makeProvider({ 1001: [11], 1002: [21] });
    let calls = 0;
    const record = await runCollaborativeBattery(
      baseArgs({
        arm: "no-subgraph",
        kbNeighborhoodFn: (queryId: number) => {
          calls++;
          throw seedRefusalError(queryId);
        },
        execFn: makeExecFn({ 1001: 1, 1002: 1 }),
        runOpts: { providerImpl: provider },
      }),
    );
    expect(calls).toBe(0);
    expect(record.outcomes).toHaveLength(2);
    for (const o of record.outcomes) expect(o.handoffOutcome.kind).toBe("success");
  });
});

// ── T-23-08: an all-failed run returns an all-miss record ───────────────

/** Builder emits bytes that cannot parse, for every query -- so every task
 *  fails at hash-at-handoff and nothing survives to the answerer. Counts
 *  answerer-role calls so a skipped pass can be proven to be skipped. */
function makeAllHandoffsFailProvider(): { provider: Provider; answererCalls: () => number } {
  let answererCalls = 0;
  const provider: Provider = {
    kind: "openai",
    baseUrl: "http://test-provider.invalid",
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const system = req.system ?? "";
      if (system.includes("ANSWERER-ROLE")) answererCalls++;
      return {
        text: "```path=subgraph.json\nNOT VALID JSON{{{\n```",
        model: req.model,
        usage: ZERO_USAGE,
      };
    },
  };
  return { provider, answererCalls: () => answererCalls };
}

describe("all handoffs failed yields an all-miss record, never a zero-task battery refusal (T-23-08)", () => {
  it("returns a well-formed record with every task recorded as a miss instead of throwing, and dispatches no answerer call", async () => {
    const { provider, answererCalls } = makeAllHandoffsFailProvider();
    const record = await runCollaborativeBattery(
      baseArgs({ execFn: makeExecFn({}), runOpts: { providerImpl: provider } }),
    );

    expect(record.answererBatterySkipped).toEqual({ reason: "all-handoffs-failed" });
    expect(answererCalls()).toBe(0);
    expect(record.outcomes).toHaveLength(TASKS.length);
    for (const o of record.outcomes) {
      expect(o.handoffOutcome.kind).toBe("unparseable");
      expect(o.hit1).toBe(0);
      expect(o.attempt).toBeUndefined();
    }
    // Nothing that did not happen is fabricated: no scoring attempt, no
    // handoff record, no answerer task result, no specimen record.
    expect(record.attempts).toEqual([]);
    expect(record.handoffRecords).toEqual([]);
    expect(record.answererRun.tasks).toEqual([]);
    expect(record.answererRun.records).toEqual([]);
    // The adapter fitness is an honest zero and cannot clear the gate.
    expect(record.fitnessRun.result.testPassRate).toBe(0);
    expect(record.fitnessRun.result.passedGate).toBe(false);
    // The shell reads both of these on the promotion path -- the battery is
    // a real receipt-rooted mint over the run's own task ids, and the
    // fitness run carries that battery's OWN receipt object (D-10/SC-3).
    expect(record.answererBattery.tasks.map((t) => t.id)).toEqual(TASKS.map((t) => t.id));
    expect(Object.is(record.fitnessRun.receipt, record.answererBattery.receipt)).toBe(true);
    expect(Object.is(record.answererRun.receipt, record.answererBattery.receipt)).toBe(true);
  });

  it("a run in which EVERY neighbourhood refuses returns the same all-miss record with no builder pass and no provider call at all", async () => {
    const { provider, answererCalls } = makeAllHandoffsFailProvider();
    const record = await runCollaborativeBattery(
      baseArgs({
        kbNeighborhoodFn: (queryId: number) => {
          throw seedRefusalError(queryId);
        },
        execFn: makeExecFn({}),
        runOpts: { providerImpl: provider },
      }),
    );
    expect(record.answererBatterySkipped).toEqual({ reason: "all-handoffs-failed" });
    expect(record.builderBattery).toBeUndefined();
    expect(record.builderRun).toBeUndefined();
    expect(answererCalls()).toBe(0);
    expect(record.outcomes).toHaveLength(TASKS.length);
    for (const o of record.outcomes) expect(o.handoffOutcome.kind).toBe("neighbourhood-refused");
    expect(record.fitnessRun.result.testPassRate).toBe(0);
  });

  it("non-vacuity control: a healthy run carries no answererBatterySkipped marker and does dispatch its answerer pass", async () => {
    const { provider } = makeProvider({ 1001: [11], 1002: [21] });
    const record = await runCollaborativeBattery(
      baseArgs({ execFn: makeExecFn({ 1001: 1, 1002: 1 }), runOpts: { providerImpl: provider } }),
    );
    expect(record.answererBatterySkipped).toBeUndefined();
    expect(record.answererRun.tasks).toHaveLength(TASKS.length);
  });
});
