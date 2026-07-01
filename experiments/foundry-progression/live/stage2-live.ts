/**
 * Stage-2 LIVE earn (Foundry rebuild): a real adversarial mini-tournament run
 * by the FoundryModelLayer against a LOCAL Ollama model over the OpenAI-compat
 * provider — $0 marginal API, no vendor CLI in the loop. The resulting .stz/
 * audit tree is copied next to this script as the permanent record.
 *
 *   npx tsx experiments/foundry-progression/live/stage2-live.ts [model]
 */
import { mkdirSync, rmSync, cpSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createProvider } from "../../../src/foundry/provider.js";
import { FoundryModelLayer } from "../../../src/foundry/model-layer.js";
import { runSlice } from "../../../src/mock/orchestrator.js";
import type { SliceManifest } from "../../../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const MODEL = process.argv[2] ?? "granite4.1:30b";

const provider = createProvider({
  kind: "openai",
  baseUrl: "http://localhost:11434/v1",
  maxAttempts: 2,
});

const role = { provider, model: MODEL, maxTokens: 2048, temperature: 0 };

const manifest: SliceManifest = {
  id: "slice-live-clamp",
  name: "clamp",
  contract:
    "export function clamp(x: number, lo: number, hi: number): number — returns x clamped into " +
    "[lo, hi]; throws RangeError when lo > hi.",
  donePredicates: [{ id: "clamp-mid", expr: "clamp(5,0,3) === 3", kind: "test" }],
  traceTier: "minimal",
  complexity: 1,
  dependsOn: [],
  judge: { votesPerPair: 1 },
  summary: `Foundry stage-2 LIVE earn: clamp tournament on local ${MODEL} via Ollama.`,
};

const layer = new FoundryModelLayer({
  roles: {
    testAuthor: role,
    strategist: role,
    specimen: role,
    judge: role,
    documenter: role,
    planner: role,
  },
  donePredicates: manifest.donePredicates,
  complexity: 1,
});

const root = join(here, "stage2-workdir");
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });

const t0 = Date.now();
console.log(`live tournament: model=${MODEL} n=2 votes/pair=1`);
try {
  const result = await runSlice({
    root,
    manifest,
    model: layer,
    n: 2,
    log: (m) => console.log(`  ${m}`),
  });
  const seconds = Math.round((Date.now() - t0) / 1000);
  const summary = {
    model: MODEL,
    seconds,
    winner: result.winner,
    halted: result.halted,
    faithful: result.faithful,
    rounds: result.rounds,
    ranking: result.judgment?.ranking ?? null,
    advantages: result.judgment?.advantages ?? null,
    llmCalls: layer.usage.length,
    tokens: layer.usage.reduce(
      (a, u) => ({ in: a.in + u.usage.inputTokens, out: a.out + u.usage.outputTokens }),
      { in: 0, out: 0 },
    ),
  };
  console.log(JSON.stringify(summary, null, 2));

  // Preserve the audit tree + summary as the earn record.
  const record = join(here, "stage2-stz-tree");
  rmSync(record, { recursive: true, force: true });
  if (existsSync(join(root, ".stz"))) cpSync(join(root, ".stz"), record, { recursive: true });
  writeFileSync(join(here, "stage2-result.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");
  process.exit(result.halted ? 2 : 0);
} catch (e) {
  console.error("live run failed:", e);
  process.exit(1);
}
