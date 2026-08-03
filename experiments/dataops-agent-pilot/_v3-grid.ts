/**
 * PRE-REGISTERED GRID PROBE — step 5 of the v3 build sequence, implementing
 * `V3-BATTERY-DESIGN.md` §3.1–§3.6 exactly as committed BEFORE any probe
 * inference existed.
 *
 * WHAT IT DECIDES. Which of the five pre-registered knob settings, if any,
 * puts the battery inside the discriminating corridor. The design derives the
 * corridor from the headroom inequality `(1 − baseline) >= 3 × noise`, and
 * rounds 1–2 measured why it is needed: baselines of 0.92–0.94 leave a search
 * one task of headroom and no method can register in it.
 *
 * WHAT IT MAY NOT DO, and how each guard is enforced here rather than
 * remembered:
 *
 *   - No difficulty shopping (qwen C4). The grid is FIXED in `V3_GRID`, in the
 *     committed source, as point values. This script cannot invent a sixth
 *     point, and every point is run whether or not an earlier one already
 *     qualified — stopping early at the first qualifier is exactly the
 *     "first setting that lands in the corridor" rule the panel rejected.
 *   - Acceptance is INTERVAL-based (gpt-sol-pro C3): the baseline's 90% CI
 *     must sit INSIDE [0.30, 0.60]. A point estimate in the corridor on a wide
 *     interval does not qualify — that is a corridor picked by luck.
 *   - The FLOOR is measured in the same probe (gpt-oss #2, claude C4). s0
 *     runs alongside baseline at every point, so a floor collapse is caught
 *     here and not after acceptance.
 *   - The GRADIENT must survive (qwen C3, design S5): `mean(graded) −
 *     mean(exact) >= 0.10`, or partial credit has stopped doing the job the
 *     battery exists to provide.
 *   - NOISE is measured on v3 itself, inside the probe, BEFORE the freeze
 *     (claude C1 — the ordering bug in rev 1). The corridor is then re-checked
 *     against the measured v3 noise, never against v2's 0.153.
 *   - SELECTION is pre-registered (qwen I4): among qualifying points, the one
 *     with the smallest measured noise; ties broken toward FEWER levers.
 *
 * Two phases, because noise replicates are only run for qualifying points and
 * qualification is not known until every arm has been scored:
 *   Phase A — every point × {baseline, s0-minimal} × 3 seeds.
 *   Phase B — for each qualifying point, the baseline scored TWICE on one
 *             held-out promotion-half draw; noise = |rep1 − rep2|.
 *
 *   TOURNEY_STATE=v3-grid-state.json nohup npx tsx _v3-grid.ts > v3-grid.log 2>&1 &
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { buildTasksV3, generateWarehouseV3, V3_GRID } from "../../src/foundry/fixture-warehouse-v3.js";
import { derivePromotionSeed } from "../../src/foundry/fixture-warehouse.js";
import { ARMS_V3 } from "./_v3-arms.js";
import { mean, meanCi90, scoreProbeTasks, type ProbeTaskResult } from "./_v3-score.js";

const MODEL = process.env.V3_MODEL ?? "qwen3.6:latest";
const TIMEOUT_MS = Number(process.env.V3_TIMEOUT_MS ?? 3_600_000);
// In-flight requests. Only useful when the ollama server runs
// OLLAMA_NUM_PARALLEL >= the same value; see _v3-score.ts.
const CONCURRENCY = Number(process.env.V3_CONCURRENCY ?? 1);
const SEEDS = (process.env.V3_SEEDS ?? "7,42,1234").split(",").map((s) => Number(s.trim()));
/** The seed whose PROMOTION half carries the noise replicate. Held out from
 *  nothing here — the probe touches no blind data — but drawn from the
 *  promotion side so the measured noise is the noise on the half a §3
 *  decision actually turns on. */
const NOISE_SEED = Number(process.env.V3_NOISE_SEED ?? SEEDS[0]);
const POINTS = (process.env.V3_POINTS ?? V3_GRID.map((k) => k.id).join(",")).split(",").map((s) => s.trim());
const STATE_PATH = process.env.TOURNEY_STATE;
if (!STATE_PATH) throw new Error("TOURNEY_STATE must be set explicitly (no default state path)");

/** The pre-registered acceptance constants (design §3.3/§3.5). */
const CORRIDOR_LO = 0.3;
const CORRIDOR_HI = 0.6;
const FLOOR_MIN = 0.05;
const GRADIENT_MIN = 0.1;
/** The headroom inequality, re-checked against MEASURED v3 noise. */
const HEADROOM_MULTIPLE = 3;
/** v2's measured prompt length, for the comparability flag (design §3.6). */
const V2_INPUT_TOKENS = Number(process.env.V3_V2_TOKENS ?? 0);

const BASELINE = ARMS_V3.find((a) => a.id === "s2-strong")!;
const FLOOR_ARM = ARMS_V3.find((a) => a.id === "s0-minimal")!;

type State = { units: Record<string, ProbeTaskResult[]> };

const loadState = (): State => {
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8")) as State;
  } catch {
    return { units: {} };
  }
};

const saveState = (state: State): void => {
  writeFileSync(`${STATE_PATH}.tmp`, JSON.stringify(state, null, 2));
  renameSync(`${STATE_PATH}.tmp`, STATE_PATH);
};

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

/**
 * Report per-task status BEFORE any aggregate is read (HANDOFF-V3 §2). Two
 * harness faults — a timeout kill and an ollama-restart error burst — have
 * each already masqueraded as a capability result on this arm, and each was
 * caught only here. Returns true when the unit is clean enough to aggregate.
 */
function reportUnit(key: string, results: ProbeTaskResult[]): boolean {
  const nonOk = results.filter((r) => r.status !== "ok");
  const noArtifact = results.filter((r) => r.status === "ok" && !r.hasArtifact);
  if (nonOk.length > 0) {
    console.log(
      `  !! ${key}: ${nonOk.length}/${results.length} NOT OK — ` +
        nonOk.map((r) => `${r.taskId.slice(-24)}=${r.status}`).join(", "),
    );
  }
  // A `timeout` at the method's own 3600s bound is a LEGITIMATE 0 — the
  // tournament's spawn pool scores it identically — and the design treats
  // slow tasks as a review trigger (claude Q5c), never a disqualifier. Only
  // `error` (a harness fault: connection refused, ollama restart, kill) makes
  // a unit unclean, because an errored task's 0 is not a measurement. The
  // pre-registered acceptance rule (§3.3) knows nothing of timeouts, and an
  // extra-prereg cleanliness gate that silently discards a grid point would
  // be difficulty-shopping's mirror image.
  const errors = results.filter((r) => r.status === "error");
  if (noArtifact.length > 0) {
    console.log(`  !! ${key}: ${noArtifact.length}/${results.length} produced NO artifact (formatting)`);
  }
  const scores = results.map((r) => r.score);
  console.log(
    `  ${key}: graded=${mean(scores).toFixed(3)} exact=${(results.filter((r) => r.exact).length / results.length).toFixed(3)} ` +
      `inTok=${Math.round(mean(results.map((r) => r.inputTokens)))} ` +
      `medWallS=${Math.round(([...results].map((r) => r.wallMs).sort((a, b) => a - b)[Math.floor(results.length / 2)] ?? 0) / 1000)}`,
  );
  return errors.length === 0;
}

interface PointSummary {
  pointId: string;
  levers: number;
  baseline: ProbeTaskResult[];
  floor: ProbeTaskResult[];
  clean: boolean;
  noise?: number;
}

/** Lever count, for the pre-registered tie-break "fewer levers wins". */
const leverCount = (pointId: string): number => {
  const k = V3_GRID.find((g) => g.id === pointId)!;
  return 1 + (k.refundRate > 0 ? 1 : 0) + (k.dualDates ? 1 : 0) + (k.groupSizeMin >= 30 ? 1 : 0);
};

const main = async () => {
  console.log("# v3 PRE-REGISTERED GRID PROBE");
  console.log(`model: ${MODEL} · seeds: ${SEEDS.join(", ")} · points: ${POINTS.join(", ")}`);
  console.log(`noiseSeed: ${NOISE_SEED} (promotion half) · taskTimeoutMs: ${TIMEOUT_MS} · state: ${STATE_PATH}`);
  console.log(
    `acceptance: baseline 90% CI within [${CORRIDOR_LO}, ${CORRIDOR_HI}] AND s0 >= ${FLOOR_MIN} ` +
      `AND graded-exact >= ${GRADIENT_MIN}\n`,
  );

  const state = loadState();
  const summaries: PointSummary[] = [];

  // ── PHASE A — every point, both arms, every seed. No early exit.
  console.log("## PHASE A — arms\n");
  for (const pointId of POINTS) {
    const knobs = V3_GRID.find((k) => k.id === pointId);
    if (!knobs) throw new Error(`unknown grid point ${pointId} — the grid is fixed in V3_GRID`);
    const baseline: ProbeTaskResult[] = [];
    const floor: ProbeTaskResult[] = [];
    let clean = true;

    for (const [arm, sink] of [
      [BASELINE, baseline],
      [FLOOR_ARM, floor],
    ] as const) {
      for (const seed of SEEDS) {
        const key = `grid-${pointId}-${arm.id}-s${seed}`;
        const tasks = buildTasksV3(generateWarehouseV3(seed, knobs));
        const results = await once(state, key, () =>
          scoreProbeTasks(arm.systemPrompt, tasks, { model: MODEL, taskTimeoutMs: TIMEOUT_MS, concurrency: CONCURRENCY }),
        );
        if (!reportUnit(key, results)) clean = false;
        sink.push(...results);
      }
    }
    summaries.push({ pointId, levers: leverCount(pointId), baseline, floor, clean });
    console.log("");
  }

  // ── Qualification, on the pre-registered rule and nothing else.
  const qualifies = (s: PointSummary) => {
    const ci = meanCi90(s.baseline.map((r) => r.score));
    const floorMean = mean(s.floor.map((r) => r.score));
    const gradient = mean(s.baseline.map((r) => r.score)) - mean(s.baseline.map((r) => (r.exact ? 1 : 0)));
    return {
      ci,
      floorMean,
      gradient,
      ok: s.clean && ci.lo >= CORRIDOR_LO && ci.hi <= CORRIDOR_HI && floorMean >= FLOOR_MIN && gradient >= GRADIENT_MIN,
    };
  };

  console.log("\n## PHASE A RESULT\n");
  console.log("| point | levers | clean | timeouts | baseline mean | 90% CI | s0 mean | graded-exact | qualifies |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const s of summaries) {
    const q = qualifies(s);
    // Timeouts reported per point (claude Q5c's latency review trigger), never
    // used to disqualify — see reportUnit.
    const timeouts = [...s.baseline, ...s.floor].filter((r) => r.status === "timeout").length;
    console.log(
      `| ${s.pointId} | ${s.levers} | ${s.clean ? "yes" : "NO"} | ${timeouts} | ${q.ci.mean.toFixed(3)} | ` +
        `[${q.ci.lo.toFixed(3)}, ${q.ci.hi.toFixed(3)}] | ${q.floorMean.toFixed(3)} | ` +
        `${q.gradient.toFixed(3)} | ${q.ok ? "YES" : "no"} |`,
    );
  }

  const qualifying = summaries.filter((s) => qualifies(s).ok);
  if (qualifying.length === 0) {
    console.log(
      "\n=> NO QUALIFYING POINT. Per design §3.5 the L4 reserve (G5) enters; if it is already\n" +
        "   in this run and still fails, the outcome is a REDESIGN, publicly. Not a knob hunt.",
    );
    return;
  }

  // ── PHASE B — noise, on v3, before any freeze.
  console.log("\n## PHASE B — noise replicates on the promotion half (qualifying points only)\n");
  const promotionSeed = derivePromotionSeed(NOISE_SEED);
  for (const s of qualifying) {
    const knobs = V3_GRID.find((k) => k.id === s.pointId)!;
    const tasks = buildTasksV3(generateWarehouseV3(promotionSeed, knobs));
    const reps: number[] = [];
    for (const rep of [1, 2]) {
      const key = `noise-${s.pointId}-r${rep}`;
      const results = await once(state, key, () =>
        scoreProbeTasks(BASELINE.systemPrompt, tasks, { model: MODEL, taskTimeoutMs: TIMEOUT_MS, concurrency: CONCURRENCY }),
      );
      reportUnit(key, results);
      reps.push(mean(results.map((r) => r.score)));
    }
    s.noise = Math.abs(reps[0]! - reps[1]!);
    console.log(`  ${s.pointId}: rep1=${reps[0]!.toFixed(3)} rep2=${reps[1]!.toFixed(3)} noise=${s.noise.toFixed(3)}`);
  }

  // ── Headroom re-check against the MEASURED v3 noise, then selection.
  console.log("\n## PHASE B RESULT — headroom against measured v3 noise\n");
  console.log("| point | baseline | measured noise | headroom (1-baseline) | needs >= 3x noise | holds |");
  console.log("|---|---|---|---|---|---|");
  const survivors: PointSummary[] = [];
  for (const s of qualifying) {
    const baselineMean = mean(s.baseline.map((r) => r.score));
    const headroom = 1 - baselineMean;
    const needed = HEADROOM_MULTIPLE * s.noise!;
    const holds = headroom >= needed;
    if (holds) survivors.push(s);
    console.log(
      `| ${s.pointId} | ${baselineMean.toFixed(3)} | ${s.noise!.toFixed(3)} | ${headroom.toFixed(3)} | ` +
        `${needed.toFixed(3)} | ${holds ? "YES" : "no"} |`,
    );
  }

  if (survivors.length === 0) {
    console.log(
      "\n=> EVERY qualifying point FAILS the headroom inequality against its own measured noise.\n" +
        "   That is a result, not a setback: v3's noise is too large for the corridor the design\n" +
        "   derived from v2's. Record it and redesign — do not widen the corridor to fit.",
    );
    return;
  }

  // Pre-registered selection: smallest measured noise, ties -> fewer levers.
  survivors.sort((a, b) => a.noise! - b.noise! || a.levers - b.levers);
  const winner = survivors[0]!;

  console.log("\n## SELECTION (pre-registered: smallest measured noise; ties -> fewer levers)\n");
  console.log(`  => ${winner.pointId} — noise ${winner.noise!.toFixed(3)}, ${winner.levers} levers,`);
  console.log(`     baseline ${mean(winner.baseline.map((r) => r.score)).toFixed(3)}, s0 ${mean(winner.floor.map((r) => r.score)).toFixed(3)}`);

  const inTok = Math.round(mean(winner.baseline.map((r) => r.inputTokens)));
  console.log(`\n  prompt length: ${inTok} input tokens/task`);
  if (V2_INPUT_TOKENS > 0) {
    const delta = (inTok / V2_INPUT_TOKENS - 1) * 100;
    console.log(
      `  vs v2 (${V2_INPUT_TOKENS}): ${delta >= 0 ? "+" : ""}${delta.toFixed(0)}%` +
        (Math.abs(delta) > 30
          ? " — EXCEEDS 30%: record a comparability risk in PREREG-AMENDMENT-2 (design §3.6)."
          : " — within the 30% comparability band."),
    );
  } else {
    console.log("  (set V3_V2_TOKENS to the measured v2 prompt length to compute the comparability flag)");
  }

  console.log(
    `\n  NOTHING IS FROZEN BY THIS SCRIPT. The next step is a human acceptance of\n` +
      `  DATA_OPS_GENERATOR_V3_ID by Dr. Robert Li, in session, having been shown these numbers.\n` +
      `  Until that entry exists, every v3 construction path throws.`,
  );
};

main().catch((e) => {
  console.error("FAILED:", e?.stack ?? e?.message ?? e);
  process.exit(1);
});
