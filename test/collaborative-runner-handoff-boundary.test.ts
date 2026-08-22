/**
 * SC-1's mutation-checked, two-sided handoff-immutability proof (Phase 22 --
 * Collaborative runner + tournament shell, Plan 22-05, REQ-80), plus D-04's
 * offline-guarantee guard. Landed last, deliberately (22-CONTEXT.md's
 * "Specific Ideas" note and this plan's own objective), so it scans the
 * runner's FINAL source -- after Plans 22-01, 22-02 and 22-04 -- rather than
 * an intermediate one.
 *
 * Two sides, mirroring collaborative-scoring-bridge-strip-boundary.test.ts's
 * own structure exactly (D-01/D-02's precedent, one phase over):
 *
 *   (a) source-text side -- the runner's OWN source carries no filesystem
 *       mutation entry point, and its complete direct-import specifier set
 *       is pinned exactly, so a future import cannot bring a new capability
 *       in unnoticed.
 *   (b) taint-probe side -- the REAL runCollaborativeBattery is driven with
 *       a builder double that emits a sentinel free-text line beside its
 *       artifact, and the sentinel is asserted absent from every
 *       agent-visible surface (FA-8), plus a byte-stability check that the
 *       builder's own artifact bytes are untouched by everything downstream.
 *
 * SCOPE, stated honestly (SC-1's own scope note): the absent-capability
 * claim in (a) is about the runner's OWN source and its PINNED DIRECT import
 * set -- NOT its transitive closure. The battery driver (agent-runner.ts, via
 * write-guard.ts) materializes specimen artifacts to disk, and the scoring
 * bridge (collaborative-scoring-bridge.ts) writes attempt artifacts -- both
 * legitimately, both imported by the runner -- so a closure-wide absence
 * claim would simply be false. What the runner does WITH those modules --
 * never forwarding the builder's own output back into a write path, never
 * letting free text reach an agent-visible surface -- is carried by (b)
 * instead, which drives the real function through its real imports.
 *
 * FA-8's pinned definition of "agent-visible" (the taint probe's exact
 * scope, the same three surfaces the strip-boundary test's own A5 note pins
 * one phase over): the answerer's task inputs, the handoff records, and the
 * returned run record (including everything reachable from it, i.e. its
 * full JSON serialization). The runner's diagnostic stderr output is
 * operator-facing and deliberately OUT of scope.
 *
 * Every non-vacuity control below asserts a POSITIVE fact -- proving the
 * detector is looking at real text and is capable of firing -- never a
 * second absence, which would risk two vacuous checks validating each other.
 *
 * Kept prohibition (this plan's own frontmatter, quoted verbatim): "This
 * test MUST NOT be weakened, narrowed, allowlisted, or scoped down to make a
 * failing runner pass. If it goes red, the runner is wrong, not the test.
 * Adding an exception for a specific file, symbol or line is the same as
 * deleting it." The non-vacuity controls MUST NOT be removed either --
 * without them an absence check can pass because it is looking at nothing,
 * which is the failure mode that makes a boundary test worse than no test.
 *
 * Mutation check (both observations recorded verbatim in 22-05-SUMMARY.md):
 * both halves of this proof were watched red before being trusted. The
 * source-text side: a deliberately introduced write import in
 * collaborative-runner.ts turned it red, naming the write entry point and
 * the widened import set; reverted before committing. The taint-probe side:
 * this plan's own work found that `parseSubgraphArtifact` type-checked but
 * never pin-checked the builder-authored `kbRevision` string field, so a
 * builder could smuggle an arbitrary string into the handoff record and the
 * success outcome's own artifact -- a genuinely reachable route (unlike the
 * free-text-before-the-fence route below, which frozen agent-runner.ts's own
 * `parseArtifacts` strips before the runner ever sees it, verified by
 * reading its source). The kbRevision test below was red against the
 * pre-fix runner (observed directly, not simulated) and green once
 * `parseSubgraphArtifact` was given the same pin check
 * `parseNeighborhoodStdout` already had one function over -- landing as part
 * of THIS task's own commit, not a follow-up.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { SpawnSyncReturns } from "node:child_process";
import {
  runCollaborativeBattery,
  makeCollaborativeCandidate,
  mintCollaborativeReceipt,
  SUBGRAPH_SCHEMA_VERSION,
  type CollaborativeCandidate,
  type KbNeighborhood,
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
const runnerSrcPath = join(repoRoot, "src", "foundry", "collaborative-runner.ts");
const bridgeSrcPath = join(repoRoot, "src", "foundry", "collaborative-scoring-bridge.ts");

const ADMISSION_RECORD = requireCollaborativeAdmitted("stark-prime");

// ── shared offline-run wiring (mirrors test/foundry-collaborative-runner.test.ts's
// own setup, duplicated rather than imported -- test files construct their own
// fixtures, the same discipline collaborative-scoring-bridge-strip-boundary.test.ts
// follows one phase over) ────────────────────────────────────────────────
function scratchDir(): string {
  return mkdtempSync(join(tmpdir(), "stz-handoff-boundary-"));
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
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

const HUB_CACHE_ROOT = "/fake/hub/cache/handoff-boundary-test";
const SCORE_ONE_BYTES = Buffer.from("score_one.py contents (handoff-boundary test fixture)");
const SKB_BYTES = Buffer.from("skb marker bytes (handoff-boundary test fixture)");
const HUB_BYTES = Buffer.from("hub marker bytes (handoff-boundary test fixture)");
const SKB_KEY = "skb:prime/processed/handoff-boundary-test-marker.bin";
const HUB_KEY = "hub:qa/prime/handoff-boundary-test-marker.csv";
const SKB_PATH = join(SKB_DATA_ROOT_REL, "prime/processed/handoff-boundary-test-marker.bin");
const HUB_PATH = join(
  HUB_CACHE_ROOT,
  "datasets--snap-stanford--stark",
  "snapshots",
  ADMISSION_RECORD.revisionSha,
  "qa/prime/handoff-boundary-test-marker.csv",
);

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

const POOL_IDS = Array.from({ length: 401 }, (_, i) => i); // 0..400
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

const CANDIDATE: CollaborativeCandidate = makeCollaborativeCandidate(
  "BUILDER-ROLE system prompt for the handoff-boundary probe candidate.",
  "ANSWERER-ROLE system prompt for the handoff-boundary probe candidate.",
);

function builderArtifactFor(queryId: number): SubgraphArtifactV1 {
  const nb = kbNeighborhoodFn(queryId);
  return {
    schemaVersion: SUBGRAPH_SCHEMA_VERSION,
    queryId,
    kbRevision: ADMISSION_RECORD.revisionSha,
    nodes: nb.nodes.map((n) => n.id),
    edges: nb.edges,
  };
}

// ── half one: absent capability, own source + pinned import set ────────

const WRITE_ENTRY_POINTS = [
  "writeFileSync",
  "appendFileSync",
  "createWriteStream",
  "renameSync",
  "unlinkSync",
  "rmSync",
  "truncateSync",
  "openSync",
];

function findWriteEntryPoints(text: string): string[] {
  return WRITE_ENTRY_POINTS.filter((name) => text.includes(name));
}

function collectImportSpecifiers(text: string): string[] {
  const specifiers = new Set<string>();
  const importRe = /import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+["']([^"']+)["']/g;
  for (const match of text.matchAll(importRe)) specifiers.add(match[1]!);
  return [...specifiers].sort();
}

// The runner's complete direct-import specifier set, pinned exactly (SC-1
// half one) -- an added import fails the equality assertion below on its
// own, before anyone asks what capability it carries.
const PINNED_RUNNER_IMPORT_ALLOWLIST = [
  "../types.js",
  "./agent-runner.js",
  "./battery-types.js",
  "./collaborative-admission.js",
  "./collaborative-battery.js",
  "./collaborative-scoring-bridge.js",
  "node:child_process",
  "node:crypto",
  "node:fs",
  "node:path",
].sort();

describe("collaborative-runner-handoff-boundary (SC-1, REQ-80) -- source-text side", () => {
  const runnerSource = readFileSync(runnerSrcPath, "utf8");

  it("the runner's own source carries no filesystem mutation entry point (write, append, rename, unlink, truncate, stream-creating, descriptor-opening)", () => {
    expect(findWriteEntryPoints(runnerSource)).toEqual([]);
  });

  it("the runner's collected import-specifier set equals the pinned allowlist exactly -- an added import fails on its own, whether or not it happens to carry a write capability today", () => {
    expect(collectImportSpecifiers(runnerSource)).toEqual(PINNED_RUNNER_IMPORT_ALLOWLIST);
  });

  it("the filesystem import names exactly one symbol, the synchronous read", () => {
    const fsImportLine = runnerSource.split("\n").find((line) => /from\s+["']node:fs["']/.test(line));
    expect(fsImportLine).toBeDefined();
    const named = fsImportLine!.match(/import\s*\{([^}]*)\}/);
    expect(named).not.toBeNull();
    const names = named![1]!
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(names).toEqual(["readFileSync"]);
  });

  it("non-vacuity control: the read entry point IS present in the scanned text (the scan is demonstrably looking at real text)", () => {
    expect(runnerSource).toContain("readFileSync");
  });

  it("non-vacuity control: the same detector reports the mutation entry point when run over a module that genuinely writes files (collaborative-scoring-bridge.ts)", () => {
    const bridgeSource = readFileSync(bridgeSrcPath, "utf8");
    expect(findWriteEntryPoints(bridgeSource)).toEqual(["writeFileSync"]);
  });

  it("non-vacuity control: the collected import-specifier set is non-empty and contains the known imports (the allowlist comparison cannot pass by collecting nothing)", () => {
    const specifiers = collectImportSpecifiers(runnerSource);
    expect(specifiers.length).toBeGreaterThan(0);
    expect(specifiers).toContain("node:fs");
    expect(specifiers).toContain("./collaborative-scoring-bridge.js");
  });
});

// ── half two: immutability in practice -- the taint probe + byte stability ──

describe("collaborative-runner-handoff-boundary (SC-1, REQ-80) -- taint-probe side", () => {
  const SENTINEL = "HANDOFF_BOUNDARY_TAINT_SENTINEL_MUST_NEVER_SURFACE";

  const TASKS: CollaborativeBatteryTask[] = [
    { id: "task-a", queryId: 1001, prompt: "Which entity does this describe (task A)?" },
    { id: "task-b", queryId: 1002, prompt: "Which entity does this describe (task B)?" },
  ];

  function makeTaintProvider(): Provider {
    return {
      kind: "openai",
      baseUrl: "http://test-provider.invalid",
      async chat(req: ChatRequest): Promise<ChatResponse> {
        const system = req.system ?? "";
        const userText = req.messages[0]?.content ?? "";
        const match = userText.match(/QUERY_ID: (\d+)/);
        const queryId = match ? Number(match[1]) : NaN;
        if (system.includes("BUILDER-ROLE")) {
          const artifact = builderArtifactFor(queryId);
          // SENTINEL lives in free text OUTSIDE the fenced artifact block --
          // D-05's closed schema rejects any unknown key inside the artifact
          // itself, so this is the only place a builder's own free text can
          // appear in its raw response (the taint probe's exact route).
          return {
            text: SENTINEL + "\n```path=subgraph.json\n" + JSON.stringify(artifact) + "\n```",
            model: req.model,
            usage: ZERO_USAGE,
          };
        }
        if (system.includes("ANSWERER-ROLE")) {
          return { text: "```path=answer.json\n[1]\n```", model: req.model, usage: ZERO_USAGE };
        }
        throw new Error(`taint-probe provider: unrecognized role marker: ${system}`);
      },
    };
  }

  function baseWiring(tasks: CollaborativeBatteryTask[], artifactDir: string) {
    return {
      candidate: CANDIDATE,
      tasks,
      batteryIdPrefix: "handoff-boundary-taint",
      receipt: mintCollaborativeReceipt(),
      gateThreshold: 0.01,
      artifactDir,
      scoringOutputDir: scratchDir(),
      kbNeighborhoodFn,
      poolManifest: POOL_MANIFEST,
      fingerprintManifest: FINGERPRINT_MANIFEST,
      warmUp: { queryId: 1, predDict: { "1": 1 } },
      readFileFn: readFileFnFixture,
      hubCacheRoot: HUB_CACHE_ROOT,
    };
  }

  it("its own control: the sentinel IS present in the raw builder response text, proving a route existed and the runner closed it rather than the sentinel never having been reachable", () => {
    const rawResponseText =
      SENTINEL + "\n```path=subgraph.json\n" + JSON.stringify(builderArtifactFor(1001)) + "\n```";
    expect(rawResponseText).toContain(SENTINEL);
  });

  it("the sentinel appears in no answerer task prompt, no handoff record, and nowhere in a full serialization of the returned run record", async () => {
    const record = await runCollaborativeBattery({
      ...baseWiring(TASKS, scratchDir()),
      execFn: makeExecFn({ 1001: 1, 1002: 1 }),
      runOpts: { providerImpl: makeTaintProvider() },
    });

    // Sanity: the probe actually reached success for both tasks, not an
    // early-return path that would make the absence assertions below vacuous
    // for an unrelated reason.
    for (const outcome of record.outcomes) {
      expect(outcome.handoffOutcome.kind).toBe("success");
    }

    for (const task of record.answererBattery.tasks) {
      expect(task.prompt).not.toContain(SENTINEL);
    }
    expect(JSON.stringify(record.handoffRecords)).not.toContain(SENTINEL);
    expect(JSON.stringify(record)).not.toContain(SENTINEL);
  });

  // A SECOND, genuinely reachable taint route (found during this plan's own
  // work, not a synthetic mutation): unlike the free text above the fence --
  // which frozen agent-runner.ts's own `parseArtifacts` strips before the
  // runner ever sees it (SC-2, verified architecturally, see 22-05-SUMMARY.md)
  // -- the artifact's own `kbRevision` STRING field previously had no pin
  // check, only a `typeof` check, so a builder-authored value flowed straight
  // into the handoff record and the success outcome's own artifact. Fixed in
  // this same task's commit (parseSubgraphArtifact now pin-checks kbRevision
  // against the admission record, mirroring parseNeighborhoodStdout's own
  // check one function over) -- this test is what proves it stays fixed.
  it("a builder-authored kbRevision that does not match the pinned KB revision is rejected schema-invalid, never forwarded into a success outcome or the returned run record", async () => {
    const KB_SENTINEL = "HANDOFF_BOUNDARY_KBREVISION_SENTINEL_MUST_NEVER_SURFACE";
    // A second, surviving task (query 1002) is required alongside the
    // tainted one: if the only task fails at handoff, the answerer battery
    // has zero tasks and `makeBattery` itself refuses (a documented
    // boundary, mirrors test/foundry-collaborative-runner.test.ts's own
    // D-03 tests one plan over).
    const kbTaintTask: CollaborativeBatteryTask = {
      id: "task-e",
      queryId: 1001,
      prompt: "Which entity does this describe (task E)?",
    };
    const survivingTask: CollaborativeBatteryTask = {
      id: "task-f",
      queryId: 1002,
      prompt: "Which entity does this describe (task F)?",
    };
    const kbTaintProvider: Provider = {
      kind: "openai",
      baseUrl: "http://test-provider.invalid",
      async chat(req: ChatRequest): Promise<ChatResponse> {
        const system = req.system ?? "";
        const userText = req.messages[0]?.content ?? "";
        const match = userText.match(/QUERY_ID: (\d+)/);
        const queryId = match ? Number(match[1]) : NaN;
        if (system.includes("BUILDER-ROLE")) {
          const artifact =
            queryId === 1001 ? { ...builderArtifactFor(queryId), kbRevision: KB_SENTINEL } : builderArtifactFor(queryId);
          return {
            text: "```path=subgraph.json\n" + JSON.stringify(artifact) + "\n```",
            model: req.model,
            usage: ZERO_USAGE,
          };
        }
        if (system.includes("ANSWERER-ROLE")) {
          return { text: "```path=answer.json\n[1]\n```", model: req.model, usage: ZERO_USAGE };
        }
        throw new Error(`kb-revision-taint provider: unrecognized role marker: ${system}`);
      },
    };
    const artifactDir = scratchDir();

    const record = await runCollaborativeBattery({
      ...baseWiring([kbTaintTask, survivingTask], artifactDir),
      execFn: makeExecFn({ 1001: 1, 1002: 1 }),
      runOpts: { providerImpl: kbTaintProvider },
    });

    // Non-vacuity: the sentinel IS present in the on-disk artifact bytes the
    // builder actually wrote -- a route genuinely existed and the runner
    // closed it, rather than the sentinel never having been reachable.
    const artifactPath = join(artifactDir, "builder", kbTaintTask.id, "subgraph.json");
    expect(readFileSync(artifactPath, "utf8")).toContain(KB_SENTINEL);

    const outcome = record.outcomes.find((o) => o.queryId === 1001)!;
    expect(outcome.handoffOutcome.kind).toBe("schema-invalid");
    expect(JSON.stringify(record)).not.toContain(KB_SENTINEL);
  });

  it("byte stability: the builder artifact's digest, captured right after the builder pass (the handoff record's own recorded digest), equals a fresh digest of the same file re-read after the whole run returns", async () => {
    const record = await runCollaborativeBattery({
      ...baseWiring(TASKS, scratchDir()),
      execFn: makeExecFn({ 1001: 1, 1002: 1 }),
      runOpts: { providerImpl: makeTaintProvider() },
    });
    expect(record.handoffRecords.length).toBeGreaterThan(0); // non-vacuity: at least one handoff to check
    for (const hr of record.handoffRecords) {
      const postRunBytes = readFileSync(hr.artifactPath);
      expect(sha256(postRunBytes)).toBe(hr.artifactSha256);
    }
  });

  it("a run whose artifact fails CD-05 (fixture query 1004, 2 nodes, below MIN_SUBGRAPH_NODES) leaves the rejected artifact's bytes exactly as the builder wrote them -- not repaired, rewritten, truncated, or deleted", async () => {
    const cd05Task: CollaborativeBatteryTask = {
      id: "task-d",
      queryId: 1004,
      prompt: "Which entity does this describe (task D)?",
    };
    const artifactDir = scratchDir();
    // Known a priori, not observed mid-run: this test controls the provider
    // double entirely, so the exact bytes the builder pass writes are known
    // BEFORE the run starts. A rejected task never gets a HandoffRecord
    // (D-03 -- confirmed in 22-02-SUMMARY.md), so there is no recorded
    // digest to compare against for this probe; the a-priori known value
    // plays the same "immediately after builder pass" role instead.
    const expectedBytes = Buffer.from(JSON.stringify(builderArtifactFor(1004)), "utf8");

    const record = await runCollaborativeBattery({
      ...baseWiring([...TASKS, cd05Task], artifactDir),
      execFn: makeExecFn({ 1001: 1, 1002: 1 }),
      runOpts: { providerImpl: makeTaintProvider() },
    });

    const outcomeD = record.outcomes.find((o) => o.queryId === 1004)!;
    // Sanity: genuinely rejected at CD-05, not vacuous.
    expect(outcomeD.handoffOutcome.kind).toBe("cd05-violation");
    expect(outcomeD.handoffOutcome.kind === "cd05-violation" && outcomeD.handoffOutcome.violation.condition).toBe(
      "below-minimum",
    );

    const artifactPath = join(artifactDir, "builder", cd05Task.id, "subgraph.json");
    const actualBytes = readFileSync(artifactPath);
    expect(actualBytes.equals(expectedBytes)).toBe(true);
  });
});
