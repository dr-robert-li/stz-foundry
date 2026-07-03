/**
 * Stage-5 earn instrument (Foundry rebuild): the standalone runner loads and
 * validates foundry.json (fail-closed on secrets-in-config, unknown providers,
 * missing env keys), builds the role map with default+override semantics, and
 * drives a full tournament end-to-end over a REAL in-process HTTP endpoint —
 * audit tree + real-usage cost report written, caps honored.
 * See experiments/foundry-progression/stage-5.md.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadFoundryConfig, buildRoles, runFoundry } from "../src/foundry/runner.js";
import type { SliceManifest } from "../src/types.js";

const servers: Server[] = [];
const dirs: string[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "stz-runner-"));
  dirs.push(d);
  return d;
}

function writeConfig(dir: string, cfg: unknown): string {
  const p = join(dir, "foundry.json");
  writeFileSync(p, JSON.stringify(cfg), "utf8");
  return p;
}

const BASE_CFG = {
  providers: { local: { kind: "openai", baseUrl: "http://127.0.0.1:9" } },
  roles: { default: { provider: "local", model: "m1" } },
};

describe("loadFoundryConfig validation (stage 5)", () => {
  it("rejects an embedded apiKey (configs must stay secret-free)", () => {
    const p = writeConfig(tmp(), {
      ...BASE_CFG,
      providers: { local: { kind: "openai", baseUrl: "http://x", apiKey: "sk-oops" } },
    });
    expect(() => loadFoundryConfig(p)).toThrow(/embeds an apiKey/);
  });

  it("rejects a role referencing an unknown provider", () => {
    const p = writeConfig(tmp(), {
      ...BASE_CFG,
      roles: { default: { provider: "nope", model: "m" } },
    });
    expect(() => loadFoundryConfig(p)).toThrow(/unknown provider "nope"/);
  });

  it("rejects a named-but-unset key env var (fail-closed)", () => {
    const p = writeConfig(tmp(), {
      ...BASE_CFG,
      providers: { hosted: { kind: "anthropic", baseUrl: "http://x", apiKeyEnv: "STZ_TEST_UNSET_KEY" } },
      roles: { default: { provider: "hosted", model: "m" } },
    });
    expect(() => loadFoundryConfig(p, {})).toThrow(/STZ_TEST_UNSET_KEY, which is unset/);
  });

  it("builds roles with default + per-role override", () => {
    const p = writeConfig(tmp(), {
      ...BASE_CFG,
      roles: {
        default: { provider: "local", model: "m1" },
        judge: { provider: "local", model: "m2", maxTokens: 64 },
      },
    });
    const { config, providers } = loadFoundryConfig(p);
    const roles = buildRoles(config, providers);
    expect(roles.specimen.model).toBe("m1");
    expect(roles.judge.model).toBe("m2");
    expect(roles.judge.maxTokens).toBe(64);
  });
});

// ── e2e over a real HTTP endpoint ──────────────────────────────────────────

const SEALED = `const impl = await import(process.argv[2]);
let passed = 0, total = 0;
function check(fn) { total++; try { if (fn()) passed++; } catch {} }
check(() => impl.double(2) === 4);
check(() => impl.double(-3) === -6);
check(() => impl.double(0) === 0);
const passRate = passed / total;
console.log(JSON.stringify({ passed, total, passRate }));
process.exit(passRate === 1 ? 0 : 1);`;

function route(system: string, user: string): string {
  if (system.includes("REFERENCE implementation"))
    return "```js\nexport function double(x) { return x + x; }\n```";
  if (system.includes("test author")) return "```js\n" + SEALED + "\n```";
  if (system.includes("strategy-diversification")) return "arith\nbitshift";
  if (system.includes("competing implementer")) {
    return user.includes("bitshift")
      ? "```js\nexport function double(x) { return x * 2; } // shift-flavoured\n```"
      : "```js\nexport function double(x) { return x + x; }\n```";
  }
  if (system.includes("pairwise judge")) return "A";
  if (system.includes("documenter") || system.includes("planner"))
    return "- doubles its numeric input";
  return "?";
}

async function fakeLlmServer(): Promise<string> {
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw);
      const sys = body.messages.find((m: { role: string }) => m.role === "system")?.content ?? "";
      const user = body.messages.find((m: { role: string }) => m.role === "user")?.content ?? "";
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          model: body.model,
          choices: [{ message: { role: "assistant", content: route(sys, user) } }],
          usage: { prompt_tokens: 120, completion_tokens: 40 },
        }),
      );
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address() as { port: number };
  return `http://127.0.0.1:${addr.port}`;
}

const MANIFEST: SliceManifest = {
  id: "slice-runner-e2e",
  name: "double",
  contract: "export function double(x: number): number — returns 2x.",
  donePredicates: [{ id: "d", expr: "double(2) === 4", kind: "test" }],
  traceTier: "minimal",
  complexity: 1,
  dependsOn: [],
  judge: { votesPerPair: 1 },
  summary: "stage-5 runner e2e",
};

describe("runFoundry e2e (stage 5)", () => {
  it("runs a full tournament from config over HTTP; audit tree + cost report written", async () => {
    const root = tmp();
    const url = await fakeLlmServer();
    const configPath = writeConfig(root, {
      providers: { local: { kind: "openai", baseUrl: url } },
      roles: { default: { provider: "local", model: "fake-model" } },
      pricing: { "fake-model": { inputPerMTok: 1, outputPerMTok: 2 } },
      caps: { maxTokens: 100_000 },
      n: 2,
      votesPerPair: 1,
      specimenTimeoutMs: 30_000,
      // This e2e exercises the tournament; the preflight canary (a different
      // contract) has its own dedicated test with a canary-aware mock.
      preflight: false,
    });

    const { result, cost } = await runFoundry({ root, configPath, manifest: MANIFEST });

    expect(result.halted).toBe(false);
    expect(result.winner).toBe("a"); // judge says A; both pass the executed gate
    expect(cost.calls).toBeGreaterThanOrEqual(7);
    expect(cost.inputTokens).toBe(cost.calls * 120);
    expect(cost.usd).toBeCloseTo((cost.calls * 120 * 1 + cost.calls * 40 * 2) / 1e6);
    expect(cost.unpricedModels).toEqual([]);

    const report = readFileSync(join(root, ".stz", "90-audit", "foundry-cost.md"), "utf8");
    expect(report).toContain("# Foundry cost — slice-runner-e2e");
    expect(report).toContain("**priced spend:**");
    // #2 model tiers: the report classifies each role's model by tier.
    expect(report).toContain("## Model tiers");
    expect(report).toMatch(/\*\*specimen:\*\* `fake-model` \(unknown\)/);
    expect(report).toMatch(/\*\*specimen:\*\* 2 call\(s\)/);
    expect(existsSync(join(root, ".stz", "40-slices", "slice-runner-e2e", "tournament.md"))).toBe(true);
  }, 60_000);
});

// ── stage-5 live-earn hardening: generated-code validators + bounded re-ask ─

import { checkEsmSyntax, harnessSelfCheck, contractExportNames, FoundryModelLayer } from "../src/foundry/model-layer.js";
import type { ChatRequest as CR, ChatResponse as CResp, Provider as Prov } from "../src/foundry/provider.js";

describe("generated-code validators (stage 5 hardening)", () => {
  it("checkEsmSyntax rejects TypeScript annotations and duplicate exports", () => {
    expect(checkEsmSyntax("export function f(s: string): string { return s; }\n")).toBeTruthy();
    expect(
      checkEsmSyntax("export function f(a) { return a; }\nexport function f(b) { return b; }\n"),
    ).toBeTruthy();
    expect(checkEsmSyntax("export function f(a) { return a; }\n")).toBeNull();
  });

  it("harnessSelfCheck rejects a harness that cannot run under Node (the live deno-import failure)", () => {
    const bad = 'import { x } from "https://deno.land/std/x.ts";\nconsole.log(JSON.stringify({passed:0,total:1,passRate:0}));\n';
    expect(harnessSelfCheck(bad, ["f"])).toBeTruthy();
  });

  it("harnessSelfCheck accepts a wire-contract harness even when the dummy fails its tests", () => {
    const ok = `const impl = await import(process.argv[2]);
let passed = 0, total = 1;
try { if (impl.f(1) === 2) passed++; } catch {}
console.log(JSON.stringify({ passed, total, passRate: passed / total }));
process.exit(passed === total ? 0 : 1);
`;
    expect(harnessSelfCheck(ok, ["f"])).toBeNull();
  });

  it("contractExportNames pulls function names from a contract string", () => {
    expect(contractExportNames("export function slugify(s: string): string — ...")).toEqual(["slugify"]);
  });

  it("a TS-emitting specimen gets exactly one re-ask, then the corrected code ships", async () => {
    let calls = 0;
    const flaky: Prov = {
      kind: "openai",
      baseUrl: "scripted://",
      async chat(_req: CR): Promise<CResp> {
        calls++;
        const text =
          calls === 1
            ? "```js\nexport function f(s: string): string { return s; }\n```"
            : "```js\nexport function f(s) { return s; }\n```";
        return { text, model: "m", usage: { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0 } };
      },
    };
    const role = { provider: flaky, model: "m" };
    const layer = new FoundryModelLayer({
      roles: { testAuthor: role, strategist: role, specimen: role, judge: role, documenter: role, planner: role },
    });
    const out = await layer.specimen.implement(
      { id: "s", name: "f", contract: "export function f(s)", donePredicates: [], traceTier: "minimal", complexity: 1, dependsOn: [], judge: { votesPerPair: 1 }, summary: "" },
      "strategy-x",
      null,
    );
    expect(calls).toBe(2);
    expect(out.files["impl.mjs"]).toBe("export function f(s) { return s; }\n");
  });
});

describe("reference smoke gate (stage 5 hardening)", () => {
  it("rejects an over-strict harness (invented expectation) and accepts a faithful one", async () => {
    const { referenceSmokeCheck } = await import("../src/foundry/model-layer.js");
    const ref = "export function f(x) { return x + 1; }\n";
    const faithful = `const impl = await import(process.argv[2]);
let passed = 0, total = 1;
try { if (impl.f(1) === 2) passed++; } catch {}
console.log(JSON.stringify({ passed, total, passRate: passed / total }));
process.exit(passed === total ? 0 : 1);
`;
    const overStrict = faithful.replace("impl.f(1) === 2", "impl.f(1) === 99");
    expect(referenceSmokeCheck(faithful, ref)).toBeNull();
    expect(referenceSmokeCheck(overStrict, ref)).toContain("reference implementation FAILED");
  });
});
