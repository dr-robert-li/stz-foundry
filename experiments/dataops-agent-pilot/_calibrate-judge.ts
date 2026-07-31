/**
 * BUILD + RUN the blind judge-calibration battery for sliceType "component".
 *
 * Why this exists: `calibrationGate` is fail-closed on `blindAccuracyBucket`,
 * and that battery was never authored — so `rubricCalibrated` refused every
 * promotion in both tournament rounds, and one of the seven gates has never
 * once been observed to PASS. A gate that can only refuse is untested in the
 * affirmative.
 *
 * Ground truth is the CONSTRUCTED EXOGENOUS ORACLE, not an opinion: pairs are
 * drawn from the recorded round-1 tournament state, where each candidate's
 * fitness was measured against answer-first facts computed before any
 * candidate existed. The judge sees the two agent definitions and never the
 * scores.
 *
 * ── Two-phase, and the order is the discipline
 *
 *   phase 1 (`--build`): construct the pairs, print + persist the battery hash,
 *                        COMMIT it. The hash covers pair identity and ground
 *                        truth only — never verdicts — so it is computable
 *                        before the judge runs and re-computable after.
 *   phase 2 (`--run`):   run the judge over the frozen battery, score, emit the
 *                        profile. Refuses if the battery hash has moved.
 *
 * Skipping phase 1 would make "the set was fixed in advance" an assertion
 * rather than a fact, which is the rubric-shopping this whole layer refuses.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  scoreCalibrationBattery,
  batteryHash,
  MIN_DISCRIMINABLE_GAP,
  type BlindPair,
} from "../../src/judge-calibration.js";
import { createProvider } from "../../src/foundry/provider.js";

const HERE = new URL(".", import.meta.url).pathname;
const ROUND1_STATE = join(HERE, "tournament-state.json");
const BATTERY_PATH = join(HERE, "judge-calibration-battery.json");
const RESULT_PATH = join(HERE, "judge-calibration-result.json");

/**
 * EXCLUDED MODELS — encoded so the exclusion cannot be quietly forgotten
 * (same posture as `NAIVE_ENSEMBLE_FORBIDDEN` in judge-reliability.ts).
 *
 * `wp-judge-v4` is finetuned for an unrelated domain (WordPress). Its name
 * reads like a general judge and it is not one. A first calibration run
 * against it produced exactly the artifacts a domain-mismatched model
 * produces — a fixed prior standing in for ranking, and a high rate of
 * unparseable verdicts concentrated on the pairs it got wrong — and those
 * scores are VOID as a judge assessment. Use a generalist model.
 */
const EXCLUDED_JUDGE_MODELS = ["wp-judge"];

/**
 * Default judge is CROSS-FAMILY from the candidate model.
 *
 * The tournament's candidates run on `qwen3.6`. Judging with that same model
 * would put ranking and execution in one family — the self-preference shape
 * the survey flags (RHO, `experiments/META-RSI-SURVEY.md`) — so the judge is a
 * different family by default. This also matches the repo's own v1.1
 * cross-family judge direction.
 *
 * Note the open question this makes measurable rather than assumed: granite
 * FLOOR-SATURATES as a candidate on this battery (0.000 on every arm), so it
 * demonstrably cannot DO the task. Whether it can nonetheless RANK definitions
 * for it is a different competency, and exactly what the blind battery exists
 * to find out. A "low" bucket here would be an informative result, not a
 * failure of the experiment.
 */
/**
 * The generalist judge candidates, in the order they are swept.
 *
 * All must be cross-family from the tournament's candidate model (`qwen3.6`),
 * so ranking and execution never sit in one family — the self-preference
 * shape the survey flags (RHO, `experiments/META-RSI-SURVEY.md`), and the
 * repo's own v1.1 cross-family judge direction.
 *
 * A model absent from `ollama list` is skipped with a note rather than
 * failing the sweep, so this list can name models that are still being pulled.
 */
export const JUDGE_CANDIDATES = [
  "granite4.1:30b",
  "nemotron3:33b",
  "gpt-oss:20b",
  "gemma4:31b",
];

const MODELS = (process.env.CALIB_MODELS ?? process.env.CALIB_MODEL ?? JUDGE_CANDIDATES.join(","))
  .split(",")
  .map((m) => m.trim())
  .filter((m) => m !== "");
for (const model of MODELS) {
  for (const banned of EXCLUDED_JUDGE_MODELS) {
    if (model.includes(banned)) {
      throw new Error(
        `[calibrate-judge] model ${JSON.stringify(model)} is excluded: ${banned} is finetuned for ` +
          `an unrelated domain and cannot serve as a general judge. Use a generalist model ` +
          `(one of: ${JUDGE_CANDIDATES.join(", ")}).`,
      );
    }
  }
}
const BASE_URL = process.env.CALIB_BASE_URL ?? "http://localhost:11434/v1";
const MIN_GAP = Number(process.env.CALIB_MIN_GAP ?? MIN_DISCRIMINABLE_GAP);

interface StoredBattery {
  sliceType: string;
  builtFrom: string;
  minGap: number;
  batteryHash: string;
  pairs: {
    pairId: string;
    oracleWinner: string;
    oracleLoser: string;
    gap: number;
    winnerPrompt: string;
    loserPrompt: string;
  }[];
}

/**
 * Every within-generation candidate pairing from the recorded round-1 state
 * whose oracle-fitness gap clears the floor.
 *
 * Pairs are drawn WITHIN a generation, never across seeds or generations:
 * two candidates from different warehouses were scored against different
 * facts, so "who scored higher" would conflate definition quality with
 * warehouse difficulty — which is exactly the confound the §3 run measured
 * (the same baseline scored 0.394 on one half and 0.833 on the other).
 */
function buildPairs(): StoredBattery {
  if (!existsSync(ROUND1_STATE)) {
    throw new Error(`no recorded tournament state at ${ROUND1_STATE} — nothing to build from`);
  }
  const state = JSON.parse(readFileSync(ROUND1_STATE, "utf8")) as {
    units: Record<string, { data: Record<string, unknown> }>;
  };

  const pairs: StoredBattery["pairs"] = [];
  for (const [unit, rec] of Object.entries(state.units)) {
    const m = unit.match(/^s(\d+)-gen(\d)$/);
    if (!m) continue;
    const rewards = rec.data.rewards as { id: string; reward: number }[] | undefined;
    const prompts = rec.data.prompts as Record<string, string> | undefined;
    if (!rewards || !prompts) continue;

    for (let i = 0; i < rewards.length; i++) {
      for (let j = i + 1; j < rewards.length; j++) {
        const a = rewards[i]!;
        const b = rewards[j]!;
        const gap = Math.abs(a.reward - b.reward);
        if (gap < MIN_GAP) continue;
        const [win, lose] = a.reward > b.reward ? [a, b] : [b, a];
        const winnerPrompt = prompts[win.id];
        const loserPrompt = prompts[lose.id];
        if (!winnerPrompt || !loserPrompt) continue;
        // Two candidates can carry byte-identical prompts (an unmutated pair);
        // asking a judge to rank identical text is unanswerable, not hard.
        if (winnerPrompt === loserPrompt) continue;
        pairs.push({
          pairId: `${unit}::${win.id}-vs-${lose.id}`,
          oracleWinner: `${unit}::${win.id}`,
          oracleLoser: `${unit}::${lose.id}`,
          gap,
          winnerPrompt,
          loserPrompt,
        });
      }
    }
  }

  return {
    sliceType: "component",
    builtFrom: "round-1 tournament-state.json (exogenous constructed oracle)",
    minGap: MIN_GAP,
    batteryHash: batteryHash(pairs),
    pairs,
  };
}

const JUDGE_SYSTEM = [
  "You rank AI agent system-prompt definitions for a data-extraction task.",
  "The task: given a messy CSV, recover a customer/month's distinct order count",
  "and total revenue in integer cents, and emit them as JSON.",
  "",
  "You will see two candidate definitions, A and B. Decide which one will",
  "produce more ACCURATE results on that task.",
  "Answer with exactly one character: A or B. No explanation.",
].join("\n");

/** One judge call. `swap` presents the same pair in the opposite order, which
 *  is the order-invariance perturbation `consistencyScore` measures. */
async function askJudge(
  provider: ReturnType<typeof createProvider>,
  model: string,
  winnerPrompt: string,
  loserPrompt: string,
  swap: boolean,
): Promise<"winner" | "loser" | null> {
  const [first, second] = swap ? [loserPrompt, winnerPrompt] : [winnerPrompt, loserPrompt];
  const res = await provider.chat({
    model,
    system: JUDGE_SYSTEM,
    messages: [{ role: "user", content: `Definition A:\n${first}\n\n---\n\nDefinition B:\n${second}` }],
  });
  // Last standalone A/B token wins — reasoning models restate the options
  // before committing, so a first-match would read the restatement.
  const matches = [...res.text.matchAll(/\b([AB])\b/g)];
  const pick = matches.length > 0 ? matches[matches.length - 1]![1] : null;
  if (pick === null) return null;
  const choseFirst = pick === "A";
  return swap ? (choseFirst ? "loser" : "winner") : choseFirst ? "winner" : "loser";
}

/** Installed model tags, so an absent candidate is SKIPPED with a note rather
 *  than failing the sweep — the list can name models still being pulled. */
async function listInstalledModels(): Promise<string[]> {
  const res = await fetch(`${BASE_URL.replace(/\/v1$/, "")}/api/tags`);
  const body = (await res.json()) as { models?: { name: string }[] };
  return (body.models ?? []).map((m) => m.name);
}

const main = async () => {
  const mode = process.argv.includes("--run") ? "run" : "build";

  if (mode === "build") {
    const battery = buildPairs();
    writeFileSync(BATTERY_PATH, JSON.stringify(battery, null, 2));
    console.log(`# Blind judge-calibration battery — sliceType "${battery.sliceType}"`);
    console.log(`  source:   ${battery.builtFrom}`);
    console.log(`  min gap:  ${battery.minGap} (below this the oracle cannot rank the pair)`);
    console.log(`  pairs:    ${battery.pairs.length}`);
    console.log(`  HASH:     ${battery.batteryHash}`);
    console.log(`\nWritten to ${BATTERY_PATH}.`);
    console.log("COMMIT THIS FILE before running --run. The hash is the pre-registration:");
    console.log("it covers pair identity and ground truth, never verdicts, so any edit to the");
    console.log("question set between build and run changes it and the run refuses.");
    return;
  }

  if (!existsSync(BATTERY_PATH)) {
    throw new Error(`no battery at ${BATTERY_PATH} — run --build first, and commit it`);
  }
  const battery = JSON.parse(readFileSync(BATTERY_PATH, "utf8")) as StoredBattery;
  const recomputed = batteryHash(battery.pairs);
  if (recomputed !== battery.batteryHash) {
    throw new Error(
      `battery hash mismatch — the question set changed after it was fixed.\n` +
        `  recorded:   ${battery.batteryHash}\n  recomputed: ${recomputed}`,
    );
  }
  console.log(`# Judge calibration — battery ${battery.pairs.length} pairs`);
  console.log(`  hash verified: ${battery.batteryHash}`);
  console.log(`  sweeping: ${MODELS.join(", ")}\n`);

  const provider = createProvider({ kind: "openai", baseUrl: BASE_URL });
  const installed = await listInstalledModels();
  const all: Record<string, unknown> = existsSync(RESULT_PATH)
    ? JSON.parse(readFileSync(RESULT_PATH, "utf8"))
    : {};

  for (const model of MODELS) {
    if (!installed.some((m) => m === model || m.startsWith(model.split(":")[0] + ":"))) {
      console.log(`  SKIP ${model} — not installed (still pulling?)`);
      continue;
    }
    if (all[model] && !process.env.CALIB_FORCE) {
      console.log(`  SKIP ${model} — already scored (set CALIB_FORCE=1 to redo)`);
      continue;
    }
    console.log(`\n## ${model}`);
    const scored: BlindPair[] = [];
    for (const [i, p] of battery.pairs.entries()) {
      const t0 = Date.now();
      const direct = await askJudge(provider, model, p.winnerPrompt, p.loserPrompt, false);
      const swapped = await askJudge(provider, model, p.winnerPrompt, p.loserPrompt, true);
      // An unparseable verdict is PASSED THROUGH as null, never dropped —
      // dropping them biases accuracy upward whenever abstention tracks
      // difficulty, which it measurably did on the voided first run.
      scored.push({
        pairId: p.pairId,
        oracleWinner: p.oracleWinner,
        oracleLoser: p.oracleLoser,
        gap: p.gap,
        judgeVerdict: direct === null ? null : direct === "winner" ? p.oracleWinner : p.oracleLoser,
        ...(swapped !== null
          ? { judgeVerdictSwapped: swapped === "winner" ? p.oracleWinner : p.oracleLoser }
          : {}),
      });
      console.log(
        `  [${i + 1}/${battery.pairs.length}] ${p.pairId}: judge=${direct ?? "ABSTAINED"} ` +
          `swapped=${swapped ?? "unparseable"} (${((Date.now() - t0) / 1000).toFixed(0)}s)`,
      );
    }
    try {
      // The scorer re-applies the gap filter itself, so an excluded pair
      // cannot sneak in via a hand-edited battery file.
      const result = scoreCalibrationBattery(battery.sliceType, scored, battery.minGap);
      all[model] = result;
      writeFileSync(RESULT_PATH, JSON.stringify(all, null, 2));
      console.log(
        `  => accuracy ${result.correct}/${result.scored} = ${result.accuracy.toFixed(3)} -> ` +
          `${result.bucket} (baseline ${result.baselineAccuracy.toFixed(3)}, abstentions ` +
          `${result.abstained}, consistency ${result.consistency.toFixed(3)})`,
      );
      for (const n of result.notes) console.log(`     note: ${n}`);
    } catch (e) {
      console.log(`  => REFUSED: ${(e as Error).message}`);
      all[model] = { error: (e as Error).message };
      writeFileSync(RESULT_PATH, JSON.stringify(all, null, 2));
    }
  }

  console.log(`\n## Comparison — sliceType "${battery.sliceType}"`);
  console.log("| judge | accuracy | baseline | beats? | abstained | consistency | bucket |");
  console.log("|---|---|---|---|---|---|---|");
  for (const [model, r] of Object.entries(all)) {
    const x = r as Record<string, number | string>;
    if (x.error !== undefined) {
      console.log(`| ${model} | — | — | — | — | — | refused |`);
      continue;
    }
    const beats = (x.accuracy as number) > (x.baselineAccuracy as number) ? "yes" : "**no**";
    console.log(
      `| ${model} | ${(x.accuracy as number).toFixed(3)} | ${(x.baselineAccuracy as number).toFixed(3)} | ` +
        `${beats} | ${x.abstained} | ${(x.consistency as number).toFixed(3)} | ${x.bucket} |`,
    );
  }
  const pending = MODELS.filter(
    (m) => !all[m] && !installed.some((i) => i === m || i.startsWith(m.split(":")[0] + ":")),
  );
  if (pending.length > 0) console.log(`\nstill not installed: ${pending.join(", ")}`);
};

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
