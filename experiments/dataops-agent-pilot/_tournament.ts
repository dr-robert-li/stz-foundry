/**
 * THE PHASE-5 GATE TOURNAMENT — `PREREG.md` §3, run for real.
 *
 * Preconditions, both now satisfied and neither assumed:
 *   - the v2 separation gate PASSED (spread 0.422 > 2 SE, ordering
 *     sign-consistent across all three seeds — `PILOT-RESULTS.md`);
 *   - `DATA_OPS_GENERATOR_V2_ID` is human-accepted.
 *
 * §3's decision rule, verbatim: GATE MET iff `W_promotion > B_promotion` on a
 * battery whose separation gate showed `0 < rate < 1`, across >=3 seeds, with
 * the search->promotion gap recorded and not pathological — a win on search
 * that vanishes on promotion is Goodharting and counts as NOT met.
 *
 * ── Why this drives the primitives instead of calling runComponentTournament
 *
 * `runComponentTournament` composes exactly these primitives in exactly this
 * order, but it is one atomic `await`: a machine failure 9 hours into a seed
 * loses the whole seed. This driver runs the SAME primitives
 * (`runSearchGeneration`, `reflectMutate`, `promoteComponentWinner`) under the
 * SAME two bounded caps (`onGeneration`, `onReflection`) and checkpoints after
 * every unit, so a crash loses at most one battery run (~1h). The divergence is
 * deliberate, is recorded in PILOT-RESULTS.md, and is the only one.
 *
 * ── Resumability
 *
 * Every unit of work writes its result to `tournament-state.json` via an
 * atomic tmp+rename before the next unit starts. Re-running the script picks up
 * exactly where it stopped: completed units are replayed from state, never
 * re-inferred. Candidate system prompts are persisted too, so a resumed run
 * continues the real mutation lineage rather than restarting it.
 *
 * ── Honesty note on the seventh promotion gate
 *
 * `promoteComponentWinner`'s `rubricCalibrated` input is fail-closed and there
 * is no calibrated judge profile for this slice type, so the shipped
 * promotion gate will REFUSE regardless of merit. That is correct behaviour and
 * is recorded as-is. It does not affect §3's measurement, which is computed
 * from the two real `evalReward` numbers (`W_promotion` vs `B_promotion`) — the
 * verdict and the measurement are reported separately, never conflated.
 */
import { readFileSync, writeFileSync, renameSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { generateFixtureSplitBatteryV2 } from "../../src/foundry/fixture-warehouse.js";
import { runAgentBattery, type CandidateAgent } from "../../src/foundry/agent-runner.js";
import {
  runSearchGeneration,
  promoteComponentWinner,
} from "../../src/foundry/component-tournament.js";
import { buildReflectionTrace, reflectMutate, initialReflection, onReflection } from "../../src/foundry/reflective-mutation.js";
import { createProvider } from "../../src/foundry/provider.js";
import { evalReward } from "../../src/selection.js";
import { onGeneration, initialMeta } from "../../src/harness.js";
import type { SpecimenId } from "../../src/types.js";
import type { JudgeReliabilityProfile } from "../../src/judge-reliability.js";
import { ARMS } from "./_arms.js";

const HERE = new URL(".", import.meta.url).pathname;
const STATE_PATH = join(HERE, process.env.TOURNEY_STATE ?? "tournament-state.json");
const LOG_PATH = join(HERE, process.env.TOURNEY_LOG ?? "tournament-progress.log");

const MODEL = process.env.TOURNEY_MODEL ?? "qwen3.6:latest";
const SEEDS = (process.env.TOURNEY_SEEDS ?? "7,42,1234").split(",").map((s) => Number(s.trim()));
const MAX_GENERATIONS = Number(process.env.TOURNEY_GENERATIONS ?? 2);
const TIMEOUT_MS = Number(process.env.TOURNEY_TIMEOUT_MS ?? 3_600_000);
const BASE_URL = process.env.TOURNEY_BASE_URL ?? "http://localhost:11434/v1";

const runOpts = {
  provider: { kind: "openai" as const, baseUrl: BASE_URL, model: MODEL },
  concurrency: 1,
  taskTimeoutMs: TIMEOUT_MS,
};

/** A real agent-definition: frontmatter block + body. `reflectMutate` rewrites
 *  only the BODY and structurally re-attaches this frontmatter, so a mutation
 *  can never re-declare the tool allowlist. */
const frontmatter = ["---", "name: data-ops-analyst", "tools: []", "---"].join("\n");
const definition = (body: string) => `${frontmatter}\n${body}`;

/** BASELINE B = the strongest HAND-WRITTEN prompt (the separation gate's
 *  `s2-strong`, mean 0.747). Deliberately not the minimal arm: beating a
 *  strawman would prove nothing, and §3 asks whether search beats what you
 *  would otherwise ship. */
const BASELINE: CandidateAgent = {
  id: "baseline-s2-strong" as SpecimenId,
  systemPrompt: definition(ARMS.find((a) => a.id === "s2-strong")!.systemPrompt),
};

/** Generation 0 population: the three separation-gate arms plus one variant,
 *  so the search starts with real diversity rather than four copies of one
 *  prompt (which would collapse the variance floor and make reflection
 *  produce near-identical children). B itself is IN the population — if the
 *  human baseline simply wins, that is a legitimate null, not a bug. */
const seedPopulation = (): CandidateAgent[] => [
  ...ARMS.map((a) => ({ id: `cand-${a.id}` as SpecimenId, systemPrompt: definition(a.systemPrompt) })),
  {
    id: "cand-s3-verify" as SpecimenId,
    systemPrompt: definition(
      [
        "You are a data-ops engineer. Work the problem in two passes.",
        "Pass 1: derive the answer.",
        "Pass 2: re-derive it independently and reconcile any disagreement before answering.",
        "Report only the final reconciled figures in the requested format.",
      ].join("\n"),
    ),
  },
];

interface UnitRecord {
  unit: string;
  finishedAt: string;
  elapsedMs: number;
  data: Record<string, unknown>;
}

interface State {
  schemaVersion: 1;
  startedAt: string;
  config: Record<string, unknown>;
  units: Record<string, UnitRecord>;
}

function loadState(): State {
  if (existsSync(STATE_PATH)) {
    const parsed = JSON.parse(readFileSync(STATE_PATH, "utf8")) as State;
    log(`RESUME — ${Object.keys(parsed.units).length} units already complete`);
    return parsed;
  }
  return {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    config: { model: MODEL, seeds: SEEDS, maxGenerations: MAX_GENERATIONS, timeoutMs: TIMEOUT_MS },
    units: {},
  };
}

/** Atomic: write a tmp file then rename. A crash mid-write leaves the previous
 *  good state intact rather than a truncated JSON file that would make the run
 *  unresumable — the exact failure this whole mechanism exists to survive. */
function saveState(state: State): void {
  const tmp = `${STATE_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, STATE_PATH);
}

function log(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  appendFileSync(LOG_PATH, line + "\n");
}

/** Run `unit` unless state already has it. Every completed unit is persisted
 *  before the next begins. */
async function once(
  state: State,
  unit: string,
  fn: () => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const existing = state.units[unit];
  if (existing) {
    log(`SKIP ${unit} (already complete)`);
    return existing.data;
  }
  log(`START ${unit}`);
  const t0 = Date.now();
  const data = await fn();
  const elapsedMs = Date.now() - t0;
  state.units[unit] = { unit, finishedAt: new Date().toISOString(), elapsedMs, data };
  saveState(state);
  log(`DONE  ${unit} in ${(elapsedMs / 60000).toFixed(1)}min :: ${JSON.stringify(data).slice(0, 220)}`);
  return data;
}

async function scoreOn(
  agent: CandidateAgent,
  battery: Parameters<typeof runAgentBattery>[1],
): Promise<{ reward: number; testPassRate: number; passedGate: boolean }> {
  const run = await runAgentBattery(agent, battery, runOpts);
  return {
    reward: evalReward(run.result),
    testPassRate: run.result.testPassRate,
    passedGate: run.result.passedGate,
  };
}

const main = async () => {
  const state = loadState();
  log(`# PREREG §3 tournament — model=${MODEL} seeds=${SEEDS.join(",")} generations=${MAX_GENERATIONS}`);

  const mutationProvider = createProvider({ kind: "openai", baseUrl: BASE_URL });
  // No calibrated judge profile exists for this slice type. Supplied empty and
  // reported honestly rather than fabricated — see the module doc comment.
  const judgeProfile: JudgeReliabilityProfile = { schemaVersion: 1, perSliceType: [] };

  const perSeed: Record<number, Record<string, unknown>> = {};

  for (const seed of SEEDS) {
    const split = generateFixtureSplitBatteryV2(seed);

    // ── Baseline B, on BOTH halves. B_promotion is what W must beat.
    const bSearch = await once(state, `s${seed}-baseline-search`, async () =>
      scoreOn(BASELINE, split.search),
    );
    const bPromotion = await once(state, `s${seed}-baseline-promotion`, async () =>
      scoreOn(BASELINE, split.promotion),
    );

    // ── NOISE CONTROL. The identical BASELINE prompt, scored a SECOND time on
    //    the SAME promotion half. Nothing differs but the model's own
    //    run-to-run variation, so |rep - orig| is a direct sample of the noise
    //    floor on the half the §3 decision turns on.
    //
    //    This exists because `beatsIncumbent` is a bare `>`: any epsilon wins.
    //    An accidental control earlier in this run (BASELINE vs the identical
    //    `cand-s2-strong`, same search battery) differed by 0.13 testPassRate —
    //    larger than most plausible search gains. Without measuring that, a
    //    narrow `W > B` is indistinguishable from the model having a good day,
    //    and promoting on it is how a relative gate ratchets on noise.
    const bPromotionRep = await once(state, `s${seed}-baseline-promotion-replicate`, async () =>
      scoreOn(BASELINE, split.promotion),
    );

    // ── Bounded search on the SEARCH half only. The promotion half is never
    //    in scope inside this loop — `runSearchGeneration` takes a plain
    //    AgentBattery, so that is structural, not discipline.
    let meta = initialMeta(MAX_GENERATIONS);
    let reflection = initialReflection();
    let candidates = seedPopulation();
    let bestSearchFitness = -Infinity;
    let best: { id: string; systemPrompt: string; reward: number } | null = null;
    let haltNote = "loop completed without a cap firing";

    for (let gen = 0; gen < MAX_GENERATIONS; gen++) {
      // Candidate prompts are persisted so a resumed run continues the real
      // lineage instead of silently restarting from generation 0.
      const genData = await once(state, `s${seed}-gen${gen}`, async () => {
        const result = await runSearchGeneration(candidates, split.search, runOpts);
        const rewards = [...result.runs.entries()].map(([id, run]) => ({
          id: String(id),
          reward: evalReward(run.result),
          testPassRate: run.result.testPassRate,
        }));
        const traces: Record<string, string> = {};
        for (const [id, run] of result.runs) traces[String(id)] = buildReflectionTrace(run);
        return {
          rewards,
          winner: result.judgment.winner === null ? null : String(result.judgment.winner),
          prompts: Object.fromEntries(candidates.map((c) => [String(c.id), c.systemPrompt])),
          traces,
        };
      });

      const rewards = genData.rewards as { id: string; reward: number; testPassRate: number }[];
      const prompts = genData.prompts as Record<string, string>;
      const traces = genData.traces as Record<string, string>;
      for (const r of rewards) {
        if (best === null || r.reward > best.reward) {
          best = { id: r.id, systemPrompt: prompts[r.id]!, reward: r.reward };
        }
      }
      const bestThisGen = Math.max(...rewards.map((r) => r.reward));
      const advanced = onGeneration(meta, bestThisGen > bestSearchFitness);
      bestSearchFitness = Math.max(bestSearchFitness, bestThisGen);
      meta = advanced.next;
      if (advanced.action === "halt") {
        haltNote = `search-horizon: ${advanced.note}`;
        log(`HALT ${haltNote}`);
        break;
      }
      if (gen === MAX_GENERATIONS - 1) break;

      // ── Reflection: mutate every candidate from ITS OWN trace, under the
      //    reflection-budget cap. A trace with no failures refuses, which is
      //    correct — a reflection is never spent on a content-free prompt.
      const mutated = await once(state, `s${seed}-mutate${gen}`, async () => {
        const next: Record<string, string> = {};
        for (const cand of candidates) {
          const trace = traces[String(cand.id)] ?? "";
          const step = onReflection(reflection);
          reflection = step.next;
          if (step.action === "halt" || trace.trim() === "") {
            next[String(cand.id)] = cand.systemPrompt;
            continue;
          }
          try {
            const child = await reflectMutate(cand, trace, mutationProvider, { model: MODEL });
            next[String(cand.id)] = child.systemPrompt;
          } catch (e) {
            log(`  mutation refused for ${String(cand.id)}: ${(e as Error).message.slice(0, 120)}`);
            next[String(cand.id)] = cand.systemPrompt;
          }
        }
        return { prompts: next };
      });
      const nextPrompts = mutated.prompts as Record<string, string>;
      candidates = candidates.map((c) => ({ ...c, systemPrompt: nextPrompts[String(c.id)] ?? c.systemPrompt }));
    }

    if (best === null) {
      log(`!! seed ${seed}: no candidate produced a reward — skipping promotion`);
      perSeed[seed] = { error: "no candidate scored" };
      continue;
    }

    // ── The ONE promotion evaluation, on the held-out half.
    const winner: CandidateAgent = { id: best.id as SpecimenId, systemPrompt: best.systemPrompt };
    const wPromotion = await once(state, `s${seed}-winner-promotion`, async () =>
      scoreOn(winner, split.promotion),
    );

    const wSearchReward = best.reward;
    const wPromReward = wPromotion.reward as number;
    const bPromReward = bPromotion.reward as number;
    // §3's sign convention: search minus promotion. POSITIVE means the searched
    // agent generalizes WORSE than it searched — the Goodhart direction.
    const gap = wSearchReward - wPromReward;
    const beatsBaseline = wPromReward > bPromReward;

    const bPromRepReward = bPromotionRep.reward as number;
    const noiseSample = Math.abs(bPromRepReward - bPromReward);

    perSeed[seed] = {
      winnerId: best.id,
      B_search: bSearch.reward,
      B_promotion: bPromReward,
      B_promotion_replicate: bPromRepReward,
      noiseSample,
      W_search: wSearchReward,
      W_promotion: wPromReward,
      searchPromotionGap: gap,
      beatsBaseline,
      haltNote,
      winnerPrompt: best.systemPrompt,
    };
    log(
      `SEED ${seed} RESULT :: B_prom=${bPromReward.toFixed(4)} W_prom=${wPromReward.toFixed(4)} ` +
        `W_search=${wSearchReward.toFixed(4)} gap=${gap.toFixed(4)} beatsBaseline=${beatsBaseline}`,
    );

    state.units[`s${seed}-summary`] = {
      unit: `s${seed}-summary`,
      finishedAt: new Date().toISOString(),
      elapsedMs: 0,
      data: perSeed[seed]!,
    };
    saveState(state);
  }

  // ── §3 decision, computed from the real numbers, never asserted.
  const summaries = SEEDS.map((s) => perSeed[s]).filter((x) => x && !x.error) as Record<string, unknown>[];
  log("\n## PREREG §3 decision");
  if (summaries.length < 3) {
    log(`GATE NOT MET — only ${summaries.length} seeds produced a result; §3 requires >=3.`);
    return;
  }
  const wins = summaries.filter((s) => s.beatsBaseline === true).length;
  const gaps = summaries.map((s) => s.searchPromotionGap as number);
  const goodharting = summaries.filter(
    (s) => (s.W_search as number) > (s.B_search as number) && (s.W_promotion as number) <= (s.B_promotion as number),
  ).length;

  // ── The noise floor, MEASURED. Each seed re-scored the identical baseline
  //    prompt on the identical promotion half; the spread between those two is
  //    pure run-to-run variation. A "win" narrower than this is the model
  //    having a good day, not a better agent definition.
  const noise = summaries.map((s) => s.noiseSample as number).filter((n) => Number.isFinite(n));
  const margin = noise.length > 0 ? Math.max(...noise) : 0;
  const winsWithMargin = summaries.filter(
    (s) => (s.W_promotion as number) > (s.B_promotion as number) + margin,
  ).length;

  log(`seeds=${summaries.length} winsOnPromotion=${wins} goodhartingSeeds=${goodharting}`);
  log(`search->promotion gaps: [${gaps.map((g) => g.toFixed(4)).join(" ")}]`);
  log(`identical-prompt noise samples: [${noise.map((n) => n.toFixed(4)).join(" ")}] -> margin=${margin.toFixed(4)}`);
  log(`wins clearing the noise margin: ${winsWithMargin}/${summaries.length}`);

  // Difference-in-differences, because the two halves are NOT equally hard
  // (seed 7: the same baseline scored 0.394 search vs 0.833 promotion). Reading
  // the raw search->promotion gap against zero would mistake half-difficulty
  // for Goodharting. B's own gap is the offset; only W's EXCESS over it is
  // attributable to search.
  const dind = summaries.map(
    (s) =>
      ((s.W_search as number) - (s.W_promotion as number)) -
      ((s.B_search as number) - (s.B_promotion as number)),
  );
  log(`Goodhart excess-gap vs baseline (diff-in-diff): [${dind.map((d) => d.toFixed(4)).join(" ")}]`);

  if (goodharting > 0) {
    log("GATE NOT MET — measured Goodharting: a win on search that vanished on promotion (§3).");
  } else if (winsWithMargin === summaries.length) {
    log("GATE MET on the §3 arithmetic — W_promotion beat B_promotion by more than the measured");
    log("      noise floor on every seed.");
  } else if (wins === summaries.length) {
    log(`GATE NOT MET — W_promotion > B_promotion on all ${wins} seeds, but only ${winsWithMargin} cleared`);
    log("      the measured noise margin. A bare `>` here would be promoting on run-to-run variation:");
    log("      that is how a relative gate ratchets on noise, and it is not a gain.");
  } else {
    log(`GATE NOT MET — W_promotion beat B_promotion on ${wins}/${summaries.length} seeds; §3 needs all.`);
  }
  log("NOTE: the shipped promotion gate additionally requires a calibrated judge profile, which");
  log("      does not exist for this slice type — it refuses independently of the above.");
};

main().catch((e) => {
  log(`FAILED: ${e?.stack ?? e?.message ?? e}`);
  process.exit(1);
});
