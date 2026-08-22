/**
 * The env-gated live smoke (Phase 22 -- Collaborative runner + tournament
 * shell, Plan 22-04, D-04/D-11). Opt-in evidence, NEVER a CI gate: every
 * test in this file is gated on `STZ_LIVE_STARK` via `it.skipIf`, so an
 * unset variable yields skipped tests -- never a failure, a thrown error,
 * or a slow path. This is the ONLY test file in the repository permitted
 * to touch the real provisioned Python toolchain, the real STaRK data, or
 * the network, and it must be run manually
 * (`STZ_LIVE_STARK=1 npx vitest run test/collaborative-runner-live-smoke.test.ts`,
 * from the main checkout so the repo-relative venv/data paths resolve --
 * mirrors 21-04's own live-probe precedent) before Phase 23 commits a
 * multi-hour detached round to the assumption that the real seams honour
 * the offline fixture contract.
 *
 * This is the FIRST committed end-to-end exercise of `runScoringPreflight`
 * against a real environment since Plan 21-05's version-probe fix
 * (`21-05-SUMMARY.md`) -- its report is asserted here, not assumed.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runCollaborativeBattery,
  makeCollaborativeCandidate,
  makeDefaultKbNeighborhoodFn,
  mintCollaborativeReceipt,
  SUBGRAPH_SCHEMA_VERSION,
  type CollaborativeCandidate,
  type KbNeighborhood,
} from "../src/foundry/collaborative-runner.js";
import { buildCollaborativeBattery } from "../src/foundry/collaborative-battery.js";
import {
  runScoringPreflight,
  parsePoolManifest,
  parseFingerprintManifest,
} from "../src/foundry/collaborative-scoring-bridge.js";
import { requireCollaborativeAdmitted } from "../src/foundry/collaborative-admission.js";
import type { ChatRequest, ChatResponse, Provider } from "../src/foundry/provider.js";

const LIVE = process.env.STZ_LIVE_STARK === "1";
const LIVE_TEST_TIMEOUT_MS = 300_000;

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
// The two committed manifests only -- no synthetic fixture is read by this
// file (a single literal so it is grep-checkable as one contiguous path).
const FIXTURE_STARK_DIR_REL = "test/fixtures/stark";

const ADMISSION_RECORD = requireCollaborativeAdmitted("stark-prime");

function scratchDir(): string {
  return mkdtempSync(join(tmpdir(), "stz-collab-live-smoke-"));
}

function readManifestJson(filename: string): unknown {
  return JSON.parse(readFileSync(join(repoRoot, FIXTURE_STARK_DIR_REL, filename), "utf8"));
}

// Real, committed manifests -- module-scope construction is a pure local
// file read (no network, no venv), safe regardless of STZ_LIVE_STARK.
const POOL_MANIFEST = parsePoolManifest(readManifestJson("prime-pool-manifest.json"));
const FINGERPRINT_MANIFEST = parseFingerprintManifest(readManifestJson("fingerprint-manifest.json"));

// The real, committed selection pool -- 75 gold-free tasks (query_id +
// prompt only, D-08). Reading it is a pure local file read too.
const REAL_TASKS = buildCollaborativeBattery();

// The real dispatch, constructed once. Constructing the factory has no
// side effect; only CALLING the returned function spawns a subprocess.
const liveNeighborhoodFn = makeDefaultKbNeighborhoodFn();
const neighborhoodCache = new Map<number, KbNeighborhood>();

/** Memoized so concern 2 (below) and concern 3's internal
 *  `runCollaborativeBattery` call (further below) do not re-spend a live
 *  subprocess call for the same query id within one manual run. */
function cachedLiveNeighborhoodFn(queryId: number): KbNeighborhood {
  const cached = neighborhoodCache.get(queryId);
  if (cached) return cached;
  const startedAt = Date.now();
  const nb = liveNeighborhoodFn(queryId);
  const wallMs = Date.now() - startedAt;
  // eslint-disable-next-line no-console
  console.error(`[live-smoke] wall time for neighbourhood extraction (query ${queryId}): ${wallMs}ms`);
  neighborhoodCache.set(queryId, nb);
  return nb;
}

/**
 * A connected, in-bounds subgraph carved out of the real neighbourhood via
 * a plain BFS from the neighbourhood's own first seed -- guarantees CD-05's
 * connectivity and node-count bounds without needing gold or a real
 * builder LLM call (this smoke tests the SEAMS, not model quality; the
 * provider below stays a deterministic double).
 */
function connectedSubgraphFromNeighborhood(
  nb: KbNeighborhood,
  targetSize: number,
): { nodes: number[]; edges: [number, number, number][] } {
  const adjacency = new Map<number, number[]>();
  for (const n of nb.nodes) adjacency.set(n.id, []);
  for (const [src, dst] of nb.edges) {
    adjacency.get(src)?.push(dst);
    adjacency.get(dst)?.push(src);
  }
  const start = nb.seeds[0]!;
  const visited = new Set<number>([start]);
  const queue = [start];
  while (queue.length > 0 && visited.size < targetSize) {
    const current = queue.shift()!;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (visited.size >= targetSize) break;
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  const nodes = [...visited].sort((a, b) => a - b);
  const nodeSet = new Set(nodes);
  const edges = nb.edges.filter(([src, dst]) => nodeSet.has(src) && nodeSet.has(dst));
  return { nodes, edges };
}

const ZERO_USAGE = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 };

/** Scripted, deterministic provider double -- real subgraph data (from the
 *  cached live neighbourhood function), no real LLM call. Same role-marker
 *  idiom as the offline runner test's own `makeProvider`. */
function makeLiveProvider(): Provider {
  return {
    kind: "openai",
    baseUrl: "http://test-provider.invalid",
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const system = req.system ?? "";
      const userText = req.messages[0]?.content ?? "";
      const match = userText.match(/QUERY_ID: (\d+)/);
      const queryId = match ? Number(match[1]) : NaN;
      if (system.includes("BUILDER-ROLE")) {
        const nb = cachedLiveNeighborhoodFn(queryId);
        const { nodes, edges } = connectedSubgraphFromNeighborhood(nb, 20);
        const artifact = {
          schemaVersion: SUBGRAPH_SCHEMA_VERSION,
          queryId,
          kbRevision: ADMISSION_RECORD.revisionSha,
          nodes,
          edges,
        };
        return {
          text: "```path=subgraph.json\n" + JSON.stringify(artifact) + "\n```",
          model: req.model,
          usage: ZERO_USAGE,
        };
      }
      if (system.includes("ANSWERER-ROLE")) {
        const nb = cachedLiveNeighborhoodFn(queryId);
        const { nodes } = connectedSubgraphFromNeighborhood(nb, 20);
        // No gold, no LLM: an arbitrary ranked slice of the subgraph's own
        // node ids. hit@1 is not expected to be 1 -- this smoke proves the
        // wire, not model quality.
        return {
          text: "```path=answer.json\n" + JSON.stringify(nodes.slice(0, 5)) + "\n```",
          model: req.model,
          usage: ZERO_USAGE,
        };
      }
      throw new Error(`live-smoke provider: system prompt has no recognized role marker: ${system}`);
    },
  };
}

describe("collaborative-runner-live-smoke (Plan 22-04 Task 3, opt-in, STZ_LIVE_STARK)", () => {
  it.skipIf(!LIVE)(
    "1. real preflight: runScoringPreflight against the committed manifests and the real venv",
    () => {
      const outputDir = scratchDir();
      const report = runScoringPreflight({
        fingerprintManifest: FINGERPRINT_MANIFEST,
        poolManifest: POOL_MANIFEST,
        outputDir,
        warmUp: { queryId: REAL_TASKS[0]!.queryId, predDict: { "0": 1.0 } },
      });
      expect(report.fingerprintOk).toBe(true);
      expect(report.warmUpAttempt.outcome.outcome).toBe("scored");
      // eslint-disable-next-line no-console
      console.error(`[live-smoke] wall time for preflight warm-up: ${report.warmUpWallTimeMs}ms`);
    },
    LIVE_TEST_TIMEOUT_MS,
  );

  it.skipIf(!LIVE)(
    "2. real neighbourhood helper: makeDefaultKbNeighborhoodFn() over 1-2 real query ids",
    () => {
      const queryIds = REAL_TASKS.slice(0, 2).map((t) => t.queryId);
      for (const queryId of queryIds) {
        // A thrown error here (the empty-seed refusal) IS the FA-7 finding
        // this smoke is designed to surface -- never caught and papered
        // over with a fallback.
        const nb = cachedLiveNeighborhoodFn(queryId);
        expect(nb.queryId).toBe(queryId);
        // parseNeighborhoodStdout already refused a revision mismatch
        // inside the dispatch -- reaching this line proves the echoed
        // revision matched the pin.
        expect(nb.seeds.length).toBeGreaterThan(0);
        expect(nb.nodes.length).toBeGreaterThan(0);
        expect(nb.nodes.length).toBeLessThanOrEqual(400);
        for (const node of nb.nodes) {
          expect(node.label.length).toBeGreaterThan(0);
        }
      }
    },
    LIVE_TEST_TIMEOUT_MS,
  );

  it.skipIf(!LIVE)(
    "3. real end-to-end scoring: runCollaborativeBattery with the real neighbourhood fn and the real scoring seam",
    async () => {
      const task = REAL_TASKS[0]!;
      const candidate: CollaborativeCandidate = makeCollaborativeCandidate(
        "BUILDER-ROLE system prompt for the live-smoke candidate.",
        "ANSWERER-ROLE system prompt for the live-smoke candidate.",
      );
      const record = await runCollaborativeBattery({
        candidate,
        tasks: [task],
        batteryIdPrefix: "collab-live-smoke",
        receipt: mintCollaborativeReceipt(),
        // Must be in (0, 1] -- makeBattery refuses 0 as a vacuous-pass gate.
        // This smoke tests the seams, not model quality, so a low-but-valid
        // threshold is used; hit@1 is not expected to be 1.
        gateThreshold: 0.01,
        artifactDir: scratchDir(),
        scoringOutputDir: scratchDir(),
        kbNeighborhoodFn: cachedLiveNeighborhoodFn,
        poolManifest: POOL_MANIFEST,
        fingerprintManifest: FINGERPRINT_MANIFEST,
        warmUp: { queryId: task.queryId, predDict: { "0": 1.0 } },
        runOpts: { providerImpl: makeLiveProvider() },
        // No execFn/readFileFn/hubCacheRoot override -- every seam here is
        // the REAL default (real spawnSync, real fs reads), which is the
        // whole point of this smoke.
      });

      expect(record.preflight.fingerprintOk).toBe(true);
      expect(record.outcomes).toHaveLength(1);
      expect(record.outcomes[0]!.handoffOutcome.kind).toBe("success");
      expect(record.attempts).toHaveLength(1);
      expect(record.attempts[0]!.outcome.outcome).toBe("scored");
      expect(record.fitnessRun.result.specimen).toBe(candidate.id);
      // eslint-disable-next-line no-console
      console.error(
        `[live-smoke] wall time for end-to-end scoring (query ${task.queryId}): ${record.attempts[0]!.wallTimeMs}ms`,
      );
    },
    LIVE_TEST_TIMEOUT_MS,
  );
});
