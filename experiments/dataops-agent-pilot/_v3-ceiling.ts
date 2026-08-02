/**
 * CEILING PROBE — step 4 of the v3 build sequence, and it runs BEFORE any
 * difficulty work (design §3.2, qwen I3).
 *
 * The question: handed the CSV, the published pipeline AND the answer itself,
 * can the model emit the required JSON artifact? If it cannot do that at 0.95,
 * then whatever the difficulty probe measures afterwards is a FORMAT confound
 * wearing a difficulty costume — the battery would be scoring compliance with
 * a fence, and every knob we turned would be tuning the wrong thing. v2 taught
 * this the expensive way: the minimal arm's failures included dropped fences,
 * which is a formatting artifact, not a data-ops result.
 *
 * Run at the two SCHEMA EXTREMES, not at one point: G1 has the narrowest CSV
 * (no `type`, no `origOrderId`, no `orderDate`) and the shortest prompt, G5 the
 * widest and longest. A format confound that only appears once the prompt is
 * long would be invisible at G1 alone, and one specific to the narrow schema
 * would be invisible at G5 alone.
 *
 *   TOURNEY_STATE=v3-ceiling-state.json nohup npx tsx _v3-ceiling.ts > v3-ceiling.log 2>&1 &
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { buildTasksV3, generateWarehouseV3, v3Knobs } from "../../src/foundry/fixture-warehouse-v3.js";
import { ARMS_V3 } from "./_v3-arms.js";
import { mean, scoreProbeTasks, type ProbeTaskResult } from "./_v3-score.js";

const MODEL = process.env.V3_MODEL ?? "qwen3.6:latest";
// qwen3.6 needs >= 3600000; 1200s once killed slow tasks and faked a
// capability floor (HANDOFF-V3 §2).
const TIMEOUT_MS = Number(process.env.V3_TIMEOUT_MS ?? 3_600_000);
const SEEDS = (process.env.V3_SEEDS ?? "7,42,1234").split(",").map((s) => Number(s.trim()));
const POINTS = (process.env.V3_POINTS ?? "G1,G5").split(",").map((s) => s.trim());
// Explicit, never defaulted: an omitted state path once pointed a re-run at
// the wrong round's data (HANDOFF-V3 §2).
const STATE_PATH = process.env.TOURNEY_STATE;
if (!STATE_PATH) throw new Error("TOURNEY_STATE must be set explicitly (no default state path)");

/** The bar. Below this, fix the format confound before touching a knob. */
const CEILING_TARGET = 0.95;

const BASELINE = ARMS_V3.find((a) => a.id === "s2-strong")!;

type State = { units: Record<string, ProbeTaskResult[]> };

const loadState = (): State => {
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8")) as State;
  } catch {
    return { units: {} };
  }
};

/** Atomic tmp+rename, so a kill mid-write cannot leave a truncated state. */
const saveState = (state: State): void => {
  writeFileSync(`${STATE_PATH}.tmp`, JSON.stringify(state, null, 2));
  renameSync(`${STATE_PATH}.tmp`, STATE_PATH);
};

/** Run `fn` once per unit key, ever — the checkpoint contract. */
const once = async (
  state: State,
  key: string,
  fn: () => Promise<ProbeTaskResult[]>,
): Promise<ProbeTaskResult[]> => {
  const cached = state.units[key];
  if (cached) {
    console.log(`  [cached] ${key}`);
    return cached;
  }
  const value = await fn();
  state.units[key] = value;
  saveState(state);
  return value;
};

const main = async () => {
  console.log("# v3 CEILING PROBE — can the model emit the artifact when handed the answer?");
  console.log(`model: ${MODEL} · seeds: ${SEEDS.join(", ")} · points: ${POINTS.join(", ")}`);
  console.log(`taskTimeoutMs: ${TIMEOUT_MS} · state: ${STATE_PATH} · target: >= ${CEILING_TARGET}\n`);

  const state = loadState();
  const byPoint = new Map<string, ProbeTaskResult[]>();

  for (const pointId of POINTS) {
    const knobs = v3Knobs(pointId);
    for (const seed of SEEDS) {
      const warehouse = generateWarehouseV3(seed, knobs);
      const tasks = buildTasksV3(warehouse);
      // `buildTasksV3` walks `warehouse.facts` in order, so index i of each
      // list is the same group. Asserted rather than assumed: a silent
      // misalignment would hand every task the wrong answer key and report a
      // format confound that does not exist.
      const withAnswers = tasks.map((task, i) => {
        const fact = warehouse.facts[i]!;
        if (!task.id.endsWith(`${fact.customerId}__${fact.month}`)) {
          throw new Error(`task/fact misalignment at ${i}: ${task.id} vs ${fact.customerId}/${fact.month}`);
        }
        return {
          ...task,
          prompt: [
            task.prompt,
            ``,
            `The correct values have already been computed for you:`,
            `  orderCount = ${fact.orderCount}`,
            `  revenueCents = ${fact.revenueCents}`,
            `Report exactly these values in the required JSON block.`,
          ].join("\n"),
        };
      });

      const key = `ceiling-${pointId}-s${seed}`;
      console.log(`\n## ${key} (${tasks.length} tasks)`);
      const results = await once(state, key, () => scoreProbeTasks(BASELINE.systemPrompt, withAnswers, {
        model: MODEL,
        taskTimeoutMs: TIMEOUT_MS,
      }));

      // Per-task status BEFORE any aggregate (HANDOFF-V3 §2).
      const nonOk = results.filter((r) => r.status !== "ok");
      if (nonOk.length > 0) {
        console.log(`  !! ${nonOk.length}/${results.length} not ok: ` +
          nonOk.map((r) => `${r.taskId}=${r.status}(${r.failureReason ?? "-"})`).join(", "));
      }
      const noArtifact = results.filter((r) => !r.hasArtifact).length;
      if (noArtifact > 0) console.log(`  !! ${noArtifact}/${results.length} produced NO artifact`);
      console.log(`  mean=${mean(results.map((r) => r.score)).toFixed(3)} ` +
        `exact=${results.filter((r) => r.exact).length}/${results.length} ` +
        `medianWallMs=${[...results].map((r) => r.wallMs).sort((a, b) => a - b)[Math.floor(results.length / 2)]}`);

      byPoint.set(pointId, [...(byPoint.get(pointId) ?? []), ...results]);
    }
  }

  console.log("\n\n## CEILING VERDICT\n");
  console.log("| point | n | not-ok | no-artifact | mean score | exact rate | verdict |");
  console.log("|---|---|---|---|---|---|---|");
  let allClear = true;
  for (const [pointId, results] of byPoint) {
    const m = mean(results.map((r) => r.score));
    const exactRate = results.filter((r) => r.exact).length / results.length;
    const ok = m >= CEILING_TARGET;
    if (!ok) allClear = false;
    console.log(
      `| ${pointId} | ${results.length} | ${results.filter((r) => r.status !== "ok").length} | ` +
        `${results.filter((r) => !r.hasArtifact).length} | ${m.toFixed(3)} | ${exactRate.toFixed(3)} | ` +
        `${ok ? "CLEAR" : "FORMAT CONFOUND"} |`,
    );
  }
  console.log(
    allClear
      ? `\n=> CEILING CLEAR at >= ${CEILING_TARGET}. The artifact contract is not the bottleneck;\n` +
          `   proceed to the pre-registered grid probe.`
      : `\n=> FORMAT CONFOUND. At least one point cannot reproduce a GIVEN answer at ${CEILING_TARGET}.\n` +
          `   Fix the format before any difficulty work — a knob turned now tunes the wrong thing.`,
  );
};

main().catch((e) => {
  console.error("FAILED:", e?.stack ?? e?.message ?? e);
  process.exit(1);
});
