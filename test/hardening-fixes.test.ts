/**
 * Hardening fixes (production-readiness pass):
 *   #4 unbounded fan-out — maxParallelSlices throttle + run-level wall-clock cap
 *   #5 temperamental local-model path — test-author preflight fails fast
 *   #6 retryPolicy telemetry — recovery-vs-burn numbers per run
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSpecimens } from "../src/foundry/spawn.js";
import { runSlice } from "../src/mock/orchestrator.js";
import { MockModelLayer, defaultMockConfig, alwaysFailConfig, type MockConfig } from "../src/mock/mock.js";
import { normalizeRunConfig } from "../src/project.js";
import { preflightTestAuthor, FoundryPreflightError } from "../src/foundry/runner.js";
import { FoundryModelLayer } from "../src/foundry/model-layer.js";
import type { ChatRequest, ChatResponse, Provider } from "../src/foundry/provider.js";
import type { Specimen, SpecimenOutput } from "../src/mock/interfaces.js";
import type { SliceManifest } from "../src/types.js";

const tmp = () => mkdtempSync(join(tmpdir(), "stz-hardening-"));
const MANIFEST: SliceManifest = {
  id: "slice-h",
  name: "h",
  contract: "export function run(x: number): number",
  donePredicates: [{ id: "p", expr: "run(1) === 1", kind: "test" }],
  traceTier: "minimal",
  complexity: 1,
  dependsOn: [],
  judge: { votesPerPair: 1 },
  summary: "hardening",
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── #4a: run-level wall-clock deadline in the specimen pool ──────────────────

describe("#4 spawn pool honours a run-level deadline", () => {
  it("skips specimens not yet started once the deadline has passed", async () => {
    const slow: Specimen = {
      implement: async (_m, strategy): Promise<SpecimenOutput> => {
        await sleep(40);
        return { specimen: "a", files: { "impl.mjs": "" }, strategy };
      },
    };
    // Pool of 1, deadline 50ms out: first specimen (40ms) runs, the rest are
    // past the deadline before they start → reported killed:timeout.
    const r = await spawnSpecimens(slow, MANIFEST, ["s1", "s2", "s3"], null, {
      concurrency: 1,
      deadlineMs: Date.now() + 50,
    });
    expect(r.outputs.length).toBeGreaterThanOrEqual(1);
    expect(r.killed.length).toBeGreaterThanOrEqual(1);
    expect(r.killed.every((k) => k.reason === "timeout")).toBe(true);
  });
});

// ── #4b: run-level wall-clock halt in the orchestrator loop ──────────────────

describe("#4 orchestrator halts on the run wall-clock cap", () => {
  it("halts a would-be-looping run instead of burning to the token cap", async () => {
    const root = tmp();
    try {
      // alwaysFail + generous retryPolicy would loop; a 1ms run cap halts it.
      const model = new MockModelLayer(alwaysFailConfig());
      const res = await runSlice({
        root,
        manifest: MANIFEST,
        model,
        n: 2,
        retryPolicy: { retries: 99, replans: 99 },
        runWallClockMs: 1,
      });
      expect(res.halted).toBe(true);
      expect(res.state.events.some((e) => e.kind === "run-wall-clock-halt")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ── #4c: config throttle knobs are validated + clamped ───────────────────────

describe("#4 maxParallelSlices / runWallClockMs config", () => {
  it("defaults are present and sane", () => {
    const c = normalizeRunConfig(undefined);
    expect(c.maxParallelSlices).toBe(3);
    expect(c.runWallClockMs).toBe(0);
  });
  it("clamps maxParallelSlices to [1,16] and rejects non-numeric", () => {
    expect(normalizeRunConfig({ maxParallelSlices: 99 } as never).maxParallelSlices).toBe(16);
    expect(normalizeRunConfig({ maxParallelSlices: 0 } as never).maxParallelSlices).toBe(1);
    expect(() => normalizeRunConfig({ maxParallelSlices: "x" } as never)).toThrow(/maxParallelSlices/);
  });
  it("rejects a negative runWallClockMs, accepts 0 and positive", () => {
    expect(() => normalizeRunConfig({ runWallClockMs: -5 } as never)).toThrow(/runWallClockMs/);
    expect(normalizeRunConfig({ runWallClockMs: 60000 } as never).runWallClockMs).toBe(60000);
  });
});

// ── #6: retryPolicy telemetry ────────────────────────────────────────────────

/** Round 0 all-fail, round 1 a passer → the run RECOVERS after one retry. */
function recoverAfterRetryConfig(): MockConfig {
  const c = defaultMockConfig();
  return {
    ...c,
    profilesByRound: [
      [
        { specimen: "a", strategy: "s1", passGate: false, testPassRate: 0.3, coverage: 0.4, mutationScore: 0.6 },
        { specimen: "b", strategy: "s2", passGate: false, testPassRate: 0.3, coverage: 0.4, mutationScore: 0.6 },
      ],
      [
        { specimen: "a", strategy: "s1", passGate: true, testPassRate: 1, coverage: 0.9, mutationScore: 0.1 },
        { specimen: "b", strategy: "s2", passGate: true, testPassRate: 1, coverage: 0.9, mutationScore: 0.2 },
      ],
    ],
  };
}

describe("#6 retryPolicy telemetry", () => {
  it("first-round win: no escalations, all tokens in round 1", async () => {
    const root = tmp();
    try {
      const res = await runSlice({ root, manifest: MANIFEST, model: new MockModelLayer(), n: 4 });
      expect(res.halted).toBe(false);
      expect(res.retryTelemetry.outcome).toBe("first-round");
      expect(res.retryTelemetry.escalations).toEqual([]);
      expect(res.retryTelemetry.tokensAfterRound1).toBe(0);
      expect(res.retryTelemetry.tokensRound1).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("recovered: extra round produced the winner, and its cost is recorded", async () => {
    const root = tmp();
    try {
      const res = await runSlice({
        root,
        manifest: MANIFEST,
        model: new MockModelLayer(recoverAfterRetryConfig()),
        n: 2,
        retryPolicy: { retries: 2, replans: 1 },
      });
      expect(res.halted).toBe(false);
      expect(res.retryTelemetry.outcome).toBe("recovered");
      expect(res.retryTelemetry.recoveredAfterEscalation).toBe(true);
      expect(res.retryTelemetry.escalations).toContain("retry");
      expect(res.retryTelemetry.tokensAfterRound1).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("halted: budget burned across retries + replans, no recovery", async () => {
    const root = tmp();
    try {
      const res = await runSlice({
        root,
        manifest: MANIFEST,
        model: new MockModelLayer(alwaysFailConfig()),
        n: 2,
        retryPolicy: { retries: 1, replans: 1 },
      });
      expect(res.halted).toBe(true);
      expect(res.retryTelemetry.outcome).toBe("halted");
      expect(res.retryTelemetry.recoveredAfterEscalation).toBe(false);
      expect(res.retryTelemetry.escalations).toEqual(["retry", "replan"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ── #5: test-author preflight ────────────────────────────────────────────────

const CANARY_HARNESS = `\`\`\`js
const m = await import(process.argv[2]);
let passed = 0, total = 0;
function check(f){ total++; try { if (f()) passed++; } catch {} }
check(() => m.inc(1) === 2);
check(() => m.inc(0) === 1);
check(() => m.inc(-1) === 0);
const passRate = passed/total;
console.log(JSON.stringify({ passed, total, passRate }));
process.exit(passRate === 1 ? 0 : 1);
\`\`\``;
const CANARY_REF_GOOD = "```js\nexport function inc(n){ return n + 1; }\n```";
const CANARY_REF_BAD = "```js\nexport default function inc(n){ return n + 1; }\n```"; // no NAMED export

/** A provider that returns a valid harness, and a reference chosen by `refOk`. */
function canaryProvider(refOk: boolean): Provider {
  return {
    kind: "openai",
    baseUrl: "http://canary.invalid",
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const sys = req.system ?? "";
      const isReference = /REFERENCE implementation/.test(sys);
      const content = isReference ? (refOk ? CANARY_REF_GOOD : CANARY_REF_BAD) : CANARY_HARNESS;
      return { text: content, model: req.model, usage: { inputTokens: 10, outputTokens: 10, cacheReadInputTokens: 0 } };
    },
  };
}

function layerWith(provider: Provider): FoundryModelLayer {
  const rm = { provider, model: "canary" };
  return new FoundryModelLayer({
    roles: { testAuthor: rm, strategist: rm, specimen: rm, judge: rm, documenter: rm, planner: rm },
  });
}

// ── #2: held-out ownership guard hook (code prevention, not prose) ───────────

const GUARD = fileURLToPath(new URL("../hooks/held-out-guard.mjs", import.meta.url));
function guard(payload: object): number {
  const r = spawnSync("node", [GUARD], { input: JSON.stringify(payload), encoding: "utf8" });
  return r.status ?? -1;
}
const bash = (command: string) => ({ tool_name: "Bash", tool_input: { command } });

describe("#2 held-out ownership guard", () => {
  it("BLOCKS the reference-b deletion incident and its variants", () => {
    expect(guard(bash("rm -rf .stz/30-tests/held-out/reference-b"))).toBe(2);
    expect(guard(bash("mv .stz/30-tests/held-out/reference /tmp/x"))).toBe(2);
    expect(guard(bash("find .stz/30-tests/held-out -name reference-b -delete"))).toBe(2);
    expect(guard(bash("echo x > .stz/30-tests/held-out/sealed.mjs"))).toBe(2);
  });
  it("ALLOWS sanctioned amend, reads, non-held-out deletes, Write, and bad input", () => {
    expect(guard(bash("stz bridge seal-amend --reason fix .stz/30-tests/held-out"))).toBe(0);
    expect(guard(bash("cat .stz/30-tests/held-out/sealed.mjs"))).toBe(0);
    expect(guard(bash("rm -rf .stz/40-slices/tmp"))).toBe(0);
    expect(guard({ tool_name: "Write", tool_input: { file_path: ".stz/30-tests/held-out/reference-b/x.mjs" } })).toBe(0);
  });
});

describe("#5 test-author preflight", () => {
  it("passes when the test-author authors a valid sealed harness for the canary", async () => {
    await expect(preflightTestAuthor(layerWith(canaryProvider(true)))).resolves.toBeUndefined();
  });

  it("fails FAST with actionable guidance when the test-author is too weak", async () => {
    await expect(preflightTestAuthor(layerWith(canaryProvider(false)))).rejects.toBeInstanceOf(
      FoundryPreflightError,
    );
    await expect(preflightTestAuthor(layerWith(canaryProvider(false)))).rejects.toThrow(
      /promote a stronger model to the `testAuthor` role/,
    );
  });
});
