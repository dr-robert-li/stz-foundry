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

const MODEL = process.env.CALIB_MODEL ?? "qwen3.6:latest";
for (const banned of EXCLUDED_JUDGE_MODELS) {
  if (MODEL.includes(banned)) {
    throw new Error(
      `[calibrate-judge] model ${JSON.stringify(MODEL)} is excluded: ${banned} is finetuned for an ` +
        `unrelated domain and cannot serve as a general judge. Use a generalist model ` +
        `(e.g. qwen3.6:latest).`,
    );
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
  winnerPrompt: string,
  loserPrompt: string,
  swap: boolean,
): Promise<"winner" | "loser" | null> {
  const [first, second] = swap ? [loserPrompt, winnerPrompt] : [winnerPrompt, loserPrompt];
  const res = await provider.chat({
    model: MODEL,
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
  console.log(`# Judge calibration — model=${MODEL} pairs=${battery.pairs.length}`);
  console.log(`  battery hash verified: ${battery.batteryHash}\n`);

  const provider = createProvider({ kind: "openai", baseUrl: BASE_URL });
  const scored: BlindPair[] = [];
  for (const [i, p] of battery.pairs.entries()) {
    const t0 = Date.now();
    const direct = await askJudge(provider, p.winnerPrompt, p.loserPrompt, false);
    const swapped = await askJudge(provider, p.winnerPrompt, p.loserPrompt, true);
    // An unparseable verdict is PASSED THROUGH as null, never dropped. Two
    // runs over this same frozen battery abstained on 1 and 4 pairs, and three
    // of those four were pairs the judge had answered wrong on the other run —
    // excluding them lifted accuracy 0.722 -> 0.933 with no improvement in
    // judging. The scorer counts null as incorrect.
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

  // NOTE: the scorer re-applies the gap filter itself, so an excluded pair
  // cannot sneak in via a hand-edited battery file.
  const result = scoreCalibrationBattery(battery.sliceType, scored, battery.minGap);
  writeFileSync(RESULT_PATH, JSON.stringify({ model: MODEL, ...result }, null, 2));

  console.log(`\n## Result — judge "${MODEL}" on sliceType "${result.sliceType}"`);
  console.log(`  scored ${result.scored} pairs (${result.dropped} dropped as indiscriminable)`);
  console.log(
    `  accuracy    ${result.correct}/${result.scored} = ${result.accuracy.toFixed(3)} -> ${result.bucket} ` +
      `(trivial-preference baseline ${result.baselineAccuracy.toFixed(3)}, abstentions ${result.abstained})`,
  );
  console.log(`  consistency ${result.consistency.toFixed(3)}`);
  for (const n of result.notes) console.log(`  note: ${n}`);
  console.log(`\n  profile entry: ${JSON.stringify(result.entry)}`);
  console.log(
    result.bucket === "low"
      ? "  => judge REFUSED for promotion steering. Correct: a coin-flip ranker must not steer."
      : "  => judge is calibrated for this slice type on this battery.",
  );
};

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
