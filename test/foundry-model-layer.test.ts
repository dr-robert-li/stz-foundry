/**
 * Stage-2 earn instrument (Foundry rebuild): the FoundryModelLayer drives the
 * REAL per-slice pipeline end-to-end over the provider seam — with the REAL
 * eval runner (executed sealed suite, V8 coverage, source mutation, hack
 * detection) doing the gating. The provider is scripted (deterministic canned
 * completions routed by role), so this proves the plumbing and the gate, not
 * any model's intelligence. The live-model half of the earn is the Ollama run
 * recorded in experiments/foundry-progression/stage-2.md.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatRequest, ChatResponse, Provider } from "../src/foundry/provider.js";
import { FoundryModelLayer, extractCode } from "../src/foundry/model-layer.js";
import { runSlice } from "../src/mock/orchestrator.js";
import type { SliceManifest } from "../src/types.js";

// ── canned role outputs ────────────────────────────────────────────────────

const SEALED_HARNESS = `\`\`\`js
const impl = await import(process.argv[2]);
const clamp = impl.clamp;
let passed = 0;
let total = 0;
function check(name, fn) {
  total++;
  try { if (fn()) passed++; } catch { /* failed */ }
}
check("mid", () => clamp(5, 0, 10) === 5);
check("below", () => clamp(-1, 0, 10) === 0);
check("above", () => clamp(11, 0, 10) === 10);
check("at-lo", () => clamp(0, 0, 10) === 0);
check("at-hi", () => clamp(10, 0, 10) === 10);
check("negative-range", () => clamp(-5, -10, -1) === -5);
check("rejects-inverted", () => {
  try { clamp(1, 5, 0); return false; } catch (e) { return e instanceof RangeError; }
});
const passRate = passed / total;
console.log(JSON.stringify({ passed, total, passRate }));
process.exit(passRate === 1 ? 0 : 1);
\`\`\``;

const IMPL_BASIC = `\`\`\`js
export function clamp(x, lo, hi) {
  if (lo > hi) throw new RangeError("lo > hi");
  return Math.min(Math.max(x, lo), hi);
}
\`\`\``;

const IMPL_VERBOSE = `\`\`\`js
export function clamp(x, lo, hi) {
  if (lo > hi) throw new RangeError("inverted range");
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}
\`\`\``;

// Planted defect: ignores the upper bound — MUST be culled by the executed suite.
const IMPL_BROKEN = `\`\`\`js
export function clamp(x, lo, hi) {
  if (lo > hi) throw new RangeError("lo > hi");
  if (x < lo) return lo;
  return x;
}
\`\`\``;

/** Deterministic provider: routes on the role marker in the system prompt. */
class ScriptedProvider implements Provider {
  readonly kind = "openai" as const;
  readonly baseUrl = "scripted://local";
  calls: Array<{ system: string; user: string }> = [];

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const system = req.system ?? "";
    const user = req.messages[0]?.content ?? "";
    this.calls.push({ system, user });
    const text = this.route(system, user);
    return {
      text,
      model: req.model,
      usage: { inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 0 },
    };
  }

  private route(system: string, user: string): string {
    if (system.includes("test author")) return SEALED_HARNESS;
    if (system.includes("strategy-diversification"))
      return "clamp-basic\nclamp-verbose\nclamp-broken";
    if (system.includes("competing implementer")) {
      if (user.includes("clamp-basic")) return IMPL_BASIC;
      if (user.includes("clamp-verbose")) return IMPL_VERBOSE;
      return IMPL_BROKEN;
    }
    if (system.includes("pairwise judge")) {
      // Deterministic preference: the Math.min/Math.max formulation.
      const aPart = user.slice(user.indexOf("Implementation A"), user.indexOf("Implementation B"));
      return aPart.includes("Math.min") ? "A" : "B";
    }
    if (system.includes("documenter"))
      return "- implements the clamp contract\n- rejects inverted ranges with RangeError";
    if (system.includes("planner"))
      return "- implements the clamp contract\n- rejects inverted ranges with RangeError";
    throw new Error(`scripted provider: unknown role\n${system}`);
  }
}

const MANIFEST: SliceManifest = {
  id: "slice-foundry-e2e",
  name: "clamp",
  contract:
    "export function clamp(x: number, lo: number, hi: number): number — returns x clamped into " +
    "[lo, hi]; throws RangeError when lo > hi.",
  donePredicates: [{ id: "clamp-mid", expr: "clamp(5,0,3) === 3", kind: "test" }],
  traceTier: "minimal",
  complexity: 1,
  dependsOn: [],
  judge: { votesPerPair: 1 },
  summary: "Foundry stage-2 e2e earn slice: clamp over a scripted provider.",
};

describe("FoundryModelLayer e2e over the real pipeline (stage 2)", () => {
  it("runs the tournament with real evals; the planted-broken specimen is culled; a correct one wins", async () => {
    const root = mkdtempSync(join(tmpdir(), "stz-foundry-e2e-"));
    try {
      const provider = new ScriptedProvider();
      const role = { provider, model: "scripted-1" };
      const layer = new FoundryModelLayer({
        roles: {
          testAuthor: role,
          strategist: role,
          specimen: role,
          judge: role,
          documenter: role,
          planner: role,
        },
        donePredicates: MANIFEST.donePredicates,
        complexity: 1,
      });

      const result = await runSlice({ root, manifest: MANIFEST, model: layer, n: 3 });

      // Selection: broken specimen (c) culled by the EXECUTED sealed suite;
      // the judge-preferred correct specimen (a = clamp-basic) wins.
      expect(result.halted).toBe(false);
      expect(result.winner).toBe("a");
      expect(result.judgment!.ranking).not.toContain("c");
      const culled = result.judgment!.advantages.find((x) => x.specimen === "c");
      expect(culled).toBeDefined();

      // The audit tree materialized (tournament, spec-diff, pressure, journal).
      const stz = join(root, ".stz");
      for (const rel of [
        "40-slices/slice-foundry-e2e/tournament.md",
        "40-slices/slice-foundry-e2e/spec-diff.md",
        "50-pressure/slice-foundry-e2e/pressure.md",
        "90-audit/journal.md",
      ]) {
        expect(existsSync(join(stz, rel)), rel).toBe(true);
      }
      // The pressure log records the broken specimen's real gate failure.
      const pressure = readFileSync(join(stz, "50-pressure/slice-foundry-e2e/pressure.md"), "utf8");
      expect(pressure).toContain("specimen-c");
      expect(pressure).toMatch(/testPassRate=0\.\d+/);

      // Provider usage was accumulated for every LLM role call (stage-4 input).
      expect(layer.usage.length).toBeGreaterThanOrEqual(7); // author+strategist+3 specimens+judge+documenter+planner
      const roles = new Set(layer.usage.map((u) => u.role));
      for (const r of ["testAuthor", "strategist", "specimen", "judge", "documenter", "planner"]) {
        expect(roles.has(r), r).toBe(true);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);
});

describe("extractCode (stage 2)", () => {
  it("pulls the first fenced block", () => {
    expect(extractCode("prose\n```js\nconst a = 1;\n```\nmore")).toBe("const a = 1;\n");
  });
  it("falls back to the whole text when unfenced", () => {
    expect(extractCode("  const b = 2;  ")).toBe("const b = 2;\n");
  });
});
