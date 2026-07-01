/**
 * Stage-3 earn instrument (Foundry rebuild): specimens actually run
 * concurrently (measured wall-clock), the pool bound is respected, a stuck
 * specimen is killed without aborting the round, a crashing specimen is
 * contained, output order is scheduling-independent (N6), and the whole thing
 * composes with the real per-slice pipeline (killed specimen → journal event,
 * tournament completes with survivors).
 * See experiments/foundry-progression/stage-3.md.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSpecimens } from "../src/foundry/spawn.js";
import type { Specimen, SpecimenOutput } from "../src/mock/interfaces.js";
import type { SliceManifest } from "../src/types.js";
import { MockModelLayer, defaultMockConfig } from "../src/mock/mock.js";
import { runSlice } from "../src/mock/orchestrator.js";

const MANIFEST: SliceManifest = {
  id: "slice-spawn",
  name: "spawn-test",
  contract: "export function run(x: number): number",
  donePredicates: [{ id: "p", expr: "run(1) === 1", kind: "test" }],
  traceTier: "minimal",
  complexity: 1,
  dependsOn: [],
  judge: { votesPerPair: 1 },
  summary: "stage-3 spawn earn",
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function delayedSpecimen(delays: Record<string, number>, hang?: string[]): Specimen {
  let ordinal = 0;
  return {
    implement: async (_m, strategy, _r): Promise<SpecimenOutput> => {
      const id = "abcdefgh"[ordinal++]!;
      if (hang?.includes(strategy)) await new Promise<never>(() => {});
      await sleep(delays[strategy] ?? 0);
      return { specimen: id, files: { "impl.mjs": `// ${strategy}\n` }, strategy };
    },
  };
}

describe("spawnSpecimens (stage 3)", () => {
  it("runs specimens concurrently: wall-clock ≈ slowest, not the sum", async () => {
    const delays = { s1: 100, s2: 100, s3: 100, s4: 100 };
    const t0 = Date.now();
    const r = await spawnSpecimens(delayedSpecimen(delays), MANIFEST, ["s1", "s2", "s3", "s4"], null);
    const elapsed = Date.now() - t0;
    expect(r.outputs).toHaveLength(4);
    expect(elapsed).toBeLessThan(250); // sum would be 400ms
  });

  it("respects the concurrency bound (pool of 1 ⇒ sequential)", async () => {
    const delays = { s1: 60, s2: 60, s3: 60 };
    const t0 = Date.now();
    const r = await spawnSpecimens(delayedSpecimen(delays), MANIFEST, ["s1", "s2", "s3"], null, {
      concurrency: 1,
    });
    const elapsed = Date.now() - t0;
    expect(r.outputs).toHaveLength(3);
    expect(elapsed).toBeGreaterThanOrEqual(170); // must be ~sum, not ~max
  });

  it("stuck specimen is killed at the deadline; survivors complete the round", async () => {
    const r = await spawnSpecimens(
      delayedSpecimen({ ok1: 10, ok2: 10 }, ["stuck"]),
      MANIFEST,
      ["ok1", "stuck", "ok2"],
      null,
      { timeoutMs: 150 },
    );
    expect(r.outputs.map((o) => o.strategy)).toEqual(["ok1", "ok2"]);
    expect(r.killed).toHaveLength(1);
    expect(r.killed[0]).toMatchObject({ strategy: "stuck", reason: "timeout" });
  });

  it("a crashing specimen is contained as killed:error", async () => {
    const crashing: Specimen = {
      implement: async (_m, strategy) => {
        if (strategy === "boom") throw new Error("segfault-ish");
        return { specimen: "a", files: {}, strategy };
      },
    };
    const r = await spawnSpecimens(crashing, MANIFEST, ["ok", "boom"], null);
    expect(r.outputs).toHaveLength(1);
    expect(r.killed[0]).toMatchObject({ strategy: "boom", reason: "error", detail: "segfault-ish" });
  });

  it("output order is input order even when completion order inverts (N6)", async () => {
    // First strategy is the slowest — it must still come out first.
    const delays = { slow: 120, mid: 60, fast: 5 };
    const r = await spawnSpecimens(delayedSpecimen(delays), MANIFEST, ["slow", "mid", "fast"], null);
    expect(r.outputs.map((o) => o.strategy)).toEqual(["slow", "mid", "fast"]);
  });
});

describe("spawn layer composed with the real pipeline (stage 3)", () => {
  it("a stuck specimen is journaled and the tournament completes with survivors", async () => {
    const root = mkdtempSync(join(tmpdir(), "stz-spawn-e2e-"));
    try {
      const mock = new MockModelLayer(defaultMockConfig());
      // Wrap the mock's specimen: the "batch-based" strategy hangs forever.
      const model = {
        ...(mock as object),
        elicitor: mock.elicitor,
        testAuthor: mock.testAuthor,
        strategist: mock.strategist,
        evalRunner: mock.evalRunner,
        judge: mock.judge,
        documenter: mock.documenter,
        planner: mock.planner,
        nextRound: () => mock.nextRound(),
        specimen: {
          implement: async (m: SliceManifest, strategy: string, r: string | null) => {
            if (strategy === "batch-based") await new Promise<never>(() => {});
            return mock.specimen.implement(m, strategy, r);
          },
        },
      };
      const result = await runSlice({
        root,
        manifest: { ...MANIFEST, id: "slice-spawn-e2e", judge: { votesPerPair: 2 } },
        model,
        n: 4,
        specimenTimeoutMs: 200,
      });
      // batch-based (specimen c in the default profiles) never materialized;
      // the tournament still selected a winner from the survivors.
      expect(result.halted).toBe(false);
      expect(result.winner).toBe("a");
      const kill = result.state.events.find((e) => e.kind === "specimen-killed");
      expect(kill).toBeDefined();
      expect(kill!.detail).toContain("batch-based");
      expect(kill!.detail).toContain("timeout");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
