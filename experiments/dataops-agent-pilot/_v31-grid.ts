/**
 * v3.1 PROBE DRIVER — implements `V3.1-BATTERY-DESIGN.md` (the prereg,
 * commit 59dfb46) EXACTLY: format-stability gate → stage 1 → predeclared
 * selection → noise/headroom → stage 2. Every constant below is the
 * document's; a divergence is a bug here, never a reinterpretation there.
 *
 *   TOURNEY_STATE=v31-grid-state.json nohup npx tsx _v31-grid.ts > v31-grid.log 2>&1 &
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { buildTasksV3_1, generateWarehouseV3, v3Knobs, type V3Knobs } from "../../src/foundry/fixture-warehouse-v3.js";
import { derivePromotionSeed } from "../../src/foundry/fixture-warehouse.js";
import { ARMS_V3 } from "./_v3-arms.js";
import { mean, scoreProbeTasks, type ProbeTaskResult } from "./_v3-score.js";

const MODEL = process.env.V3_MODEL ?? "qwen3.6:latest";
const TIMEOUT_MS = Number(process.env.V3_TIMEOUT_MS ?? 3_600_000);
const STATE_PATH = process.env.TOURNEY_STATE;
if (!STATE_PATH) throw new Error("TOURNEY_STATE must be set explicitly (no default state path)");

// ── THE PREREG CONSTANTS (§4). Not env-tunable on purpose.
const POINTS = ["G1", "G2", "G3", "G4"];
const STAGE1_SEEDS = [7, 42, 1234, 11, 101, 2027];
const STAGE2_SEEDS = [13, 77, 3001];
const GATE_SEEDS = [7, 42];
const CORRIDOR_LO = 0.3;
const CORRIDOR_HI = 0.6;
const FLOOR_MIN = 0.05;
const GRADIENT_MIN = 0.1;
const DROP_MAX = 0.1;
const T5_90 = 2.015;
const HEADROOM_MULTIPLE = 3;
const NOISE_PAIRS = 3;
const GATE_SCORE_MIN = 0.95;
const STRICT_GAP_DISCLOSURE = 0.15;

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

/**
 * Run a unit once, with the §3 retry rule applied INSIDE the unit before it
 * is checkpointed: tasks that died to a HARNESS fault (`error`) are retried
 * exactly once and the retry is logged; `timeout` is a measurement and is
 * never retried.
 */
const once = async (
  state: State,
  key: string,
  tasks: ReturnType<typeof buildTasksV3_1>,
  systemPrompt: string,
): Promise<ProbeTaskResult[]> => {
  const cached = state.units[key];
  if (cached) {
    console.log(`  [cached] ${key}`);
    return cached;
  }
  let results = await scoreProbeTasks(systemPrompt, tasks, { model: MODEL, taskTimeoutMs: TIMEOUT_MS });
  const errored = results.map((r, i) => ({ r, i })).filter((x) => x.r.status === "error");
  if (errored.length > 0) {
    console.log(`  !! ${key}: retrying ${errored.length} harness-fault task(s) once: ` +
      errored.map((x) => x.r.taskId.slice(-24)).join(", "));
    for (const { i } of errored) {
      const rerun = await scoreProbeTasks(systemPrompt, [tasks[i]!], { model: MODEL, taskTimeoutMs: TIMEOUT_MS });
      results = results.map((r, j) => (j === i ? { ...rerun[0]!, failureReason: `${rerun[0]!.failureReason ?? ""}(retry of harness fault)` } : r));
    }
  }
  state.units[key] = results;
  saveState(state);
  return results;
};

const report = (key: string, rs: ProbeTaskResult[]): void => {
  const nonOk = rs.filter((r) => r.status !== "ok");
  if (nonOk.length > 0) {
    console.log(`  !! ${key}: ${nonOk.length}/${rs.length} NOT OK — ` +
      nonOk.map((r) => `${r.taskId.slice(-20)}=${r.status}`).join(", "));
  }
  const drops = rs.filter((r) => !r.hasArtifact).length;
  const strict = rs.filter((r) => r.strictArtifact).length;
  console.log(`  ${key}: graded=${mean(rs.map((r) => r.score)).toFixed(3)} ` +
    `exact=${(rs.filter((r) => r.exact).length / rs.length).toFixed(3)} ` +
    `drops=${drops}/${rs.length} strict=${strict}/${rs.length} ` +
    `medWallS=${Math.round(([...rs].map((r) => r.wallMs).sort((a, b) => a - b)[Math.floor(rs.length / 2)] ?? 0) / 1000)}`);
};

/** Seed-clustered t 90% CI (§4, the pinned estimator): t on the per-seed means. */
const seedCi = (seedMeans: number[]): { mean: number; lo: number; hi: number } => {
  const m = mean(seedMeans);
  const sd = Math.sqrt(seedMeans.reduce((a, x) => a + (x - m) ** 2, 0) / (seedMeans.length - 1));
  const half = T5_90 * sd / Math.sqrt(seedMeans.length);
  return { mean: m, lo: m - half, hi: m + half };
};

interface ArmData {
  bySeed: Map<number, ProbeTaskResult[]>;
  all: ProbeTaskResult[];
}
const armData = (): ArmData => ({ bySeed: new Map(), all: [] });

const main = async () => {
  console.log("# v3.1 PROBE — prereg V3.1-BATTERY-DESIGN.md (59dfb46)");
  console.log(`model: ${MODEL} · taskTimeoutMs: ${TIMEOUT_MS} · state: ${STATE_PATH}\n`);
  const state = loadState();

  // ── FORMAT-STABILITY GATE (§4): answer-given, relaxed scoring.
  console.log("## FORMAT-STABILITY GATE\n");
  const gatePassed: string[] = [];
  for (const pointId of POINTS) {
    const knobs = v3Knobs(pointId);
    const rs: ProbeTaskResult[] = [];
    for (const seed of GATE_SEEDS) {
      const warehouse = generateWarehouseV3(seed, knobs);
      const tasks = buildTasksV3_1(warehouse).map((task, i) => {
        const fact = warehouse.facts[i]!;
        if (!task.id.endsWith(`${fact.customerId}__${fact.month}`)) {
          throw new Error(`task/fact misalignment at ${i}`);
        }
        return {
          ...task,
          prompt: [
            task.prompt, ``,
            `The correct values have already been computed for you:`,
            `  orderCount = ${fact.orderCount}`,
            `  revenueCents = ${fact.revenueCents}`,
            `Report exactly these values in the required JSON block.`,
          ].join("\n"),
        };
      });
      const key = `gate-${pointId}-s${seed}`;
      const unit = await once(state, key, tasks, BASELINE.systemPrompt);
      report(key, unit);
      rs.push(...unit);
    }
    const drops = rs.filter((r) => !r.hasArtifact).length;
    const m = mean(rs.map((r) => r.score));
    const pass = drops === 0 && m >= GATE_SCORE_MIN;
    console.log(`  => ${pointId}: drops=${drops}/${rs.length} mean=${m.toFixed(3)} — ${pass ? "GATE PASS" : "GATE FAIL (point excluded)"}\n`);
    if (pass) gatePassed.push(pointId);
  }
  if (gatePassed.length === 0) {
    console.log("=> ALL POINTS FAIL THE FORMAT GATE. The content-driven premise is falsified.");
    console.log("   TERMINATION per §4/§6/§8. Write the terminal report.");
    return;
  }

  // ── STAGE 1 (§4): gate-passing points × both arms × 6 seeds.
  console.log("\n## STAGE 1\n");
  const data = new Map<string, { baseline: ArmData; floor: ArmData }>();
  for (const pointId of gatePassed) {
    const knobs = v3Knobs(pointId);
    const point = { baseline: armData(), floor: armData() };
    for (const [arm, sink] of [[BASELINE, point.baseline], [FLOOR_ARM, point.floor]] as const) {
      for (const seed of STAGE1_SEEDS) {
        const key = `s1-${pointId}-${arm.id}-s${seed}`;
        const unit = await once(state, key, buildTasksV3_1(generateWarehouseV3(seed, knobs)), arm.systemPrompt);
        report(key, unit);
        sink.bySeed.set(seed, unit);
        sink.all.push(...unit);
      }
    }
    data.set(pointId, point);
  }

  const evaluate = (pointId: string) => {
    const d = data.get(pointId)!;
    const bSeedMeans = STAGE1_SEEDS.map((s) => mean(d.baseline.bySeed.get(s)!.map((r) => r.score)));
    const fSeedMeans = STAGE1_SEEDS.map((s) => mean(d.floor.bySeed.get(s)!.map((r) => r.score)));
    const ci = seedCi(bSeedMeans);
    const floorMean = mean(d.floor.all.map((r) => r.score));
    const gradient = mean(d.baseline.all.map((r) => r.score)) - mean(d.baseline.all.map((r) => (r.exact ? 1 : 0)));
    const dropB = d.baseline.all.filter((r) => !r.hasArtifact).length / d.baseline.all.length;
    const dropF = d.floor.all.filter((r) => !r.hasArtifact).length / d.floor.all.length;
    const signPositive = STAGE1_SEEDS.filter((_, i) => bSeedMeans[i]! - fSeedMeans[i]! > 0).length;
    const armOrder = ci.mean > floorMean && signPositive >= 5;
    const ok =
      ci.lo >= CORRIDOR_LO && ci.hi <= CORRIDOR_HI &&
      floorMean >= FLOOR_MIN && gradient >= GRADIENT_MIN &&
      dropB <= DROP_MAX && dropF <= DROP_MAX && armOrder;
    return { ci, floorMean, gradient, dropB, dropF, signPositive, ok };
  };

  console.log("\n## STAGE 1 RESULT\n");
  console.log("| point | baseline mean | seed-t 90% CI | s0 | gradient | dropB | dropF | sign+ | qualifies |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  const qualifiers: string[] = [];
  for (const pointId of gatePassed) {
    const q = evaluate(pointId);
    if (q.ok) qualifiers.push(pointId);
    console.log(`| ${pointId} | ${q.ci.mean.toFixed(3)} | [${q.ci.lo.toFixed(3)}, ${q.ci.hi.toFixed(3)}] | ` +
      `${q.floorMean.toFixed(3)} | ${q.gradient.toFixed(3)} | ${q.dropB.toFixed(2)} | ${q.dropF.toFixed(2)} | ` +
      `${q.signPositive}/6 | ${q.ok ? "YES" : "no"} |`);
  }
  if (qualifiers.length === 0) {
    console.log("\n=> NO STAGE-1 QUALIFIER. TERMINATION per §6. Write the terminal report.");
    return;
  }

  // ── SELECTION (§4): predeclared priority = grid order (fewest levers first).
  // Then noise/headroom; failure falls through the priority order, once each.
  console.log("\n## NOISE / HEADROOM + STAGE 2 (priority order: " + qualifiers.join(" > ") + ")\n");
  for (const pointId of qualifiers) {
    const knobs = v3Knobs(pointId);
    const d = data.get(pointId)!;

    // Noise: 3 baseline replicate pairs on the seed-7 promotion half; noise
    // = MAX |pair difference| (conservative).
    const promoSeed = derivePromotionSeed(7);
    const promoTasks = buildTasksV3_1(generateWarehouseV3(promoSeed, knobs));
    const diffs: number[] = [];
    for (let p = 1; p <= NOISE_PAIRS; p++) {
      const a = await once(state, `noise-${pointId}-p${p}a`, promoTasks, BASELINE.systemPrompt);
      const b = await once(state, `noise-${pointId}-p${p}b`, promoTasks, BASELINE.systemPrompt);
      report(`noise-${pointId}-p${p}a`, a);
      report(`noise-${pointId}-p${p}b`, b);
      diffs.push(Math.abs(mean(a.map((r) => r.score)) - mean(b.map((r) => r.score))));
    }
    const noise = Math.max(...diffs);
    const baselineMean = mean(d.baseline.all.map((r) => r.score));
    const headroom = 1 - baselineMean;
    const holds = headroom >= HEADROOM_MULTIPLE * noise;
    console.log(`  ${pointId}: noise pairs [${diffs.map((x) => x.toFixed(3)).join(", ")}] max=${noise.toFixed(3)} ` +
      `headroom=${headroom.toFixed(3)} needs>=${(HEADROOM_MULTIPLE * noise).toFixed(3)} — ${holds ? "HOLDS" : "FAILS"}`);
    if (!holds) {
      console.log(`  => ${pointId} fails headroom; next point in priority order.\n`);
      continue;
    }

    // Stage 2 (§4): confirmation on fresh seeds, its own explicit rule.
    let s2ok = true;
    const s2b: ProbeTaskResult[] = [];
    const s2bSeedMeans: number[] = [];
    const s2fSeedMeans: number[] = [];
    const s2f: ProbeTaskResult[] = [];
    for (const seed of STAGE2_SEEDS) {
      const kb = `s2-${pointId}-s2-strong-s${seed}`;
      const kf = `s2-${pointId}-s0-minimal-s${seed}`;
      const ub = await once(state, kb, buildTasksV3_1(generateWarehouseV3(seed, knobs)), BASELINE.systemPrompt);
      const uf = await once(state, kf, buildTasksV3_1(generateWarehouseV3(seed, knobs)), FLOOR_ARM.systemPrompt);
      report(kb, ub);
      report(kf, uf);
      s2b.push(...ub);
      s2f.push(...uf);
      s2bSeedMeans.push(mean(ub.map((r) => r.score)));
      s2fSeedMeans.push(mean(uf.map((r) => r.score)));
    }
    const s2mean = mean(s2b.map((r) => r.score));
    const s2signs = STAGE2_SEEDS.filter((_, i) => s2bSeedMeans[i]! - s2fSeedMeans[i]! > 0).length;
    const s2dropB = s2b.filter((r) => !r.hasArtifact).length / s2b.length;
    const s2dropF = s2f.filter((r) => !r.hasArtifact).length / s2f.length;
    s2ok = s2mean >= CORRIDOR_LO && s2mean <= CORRIDOR_HI && s2signs === 3 && s2dropB <= DROP_MAX && s2dropF <= DROP_MAX;
    console.log(`  ${pointId} stage 2: mean=${s2mean.toFixed(3)} signs=${s2signs}/3 dropB=${s2dropB.toFixed(2)} ` +
      `dropF=${s2dropF.toFixed(2)} — ${s2ok ? "CONFIRMED" : "FAILS"}`);
    if (!s2ok) {
      console.log(`  => ${pointId} fails stage 2; next point in priority order.\n`);
      continue;
    }

    // §5 disclosure at the candidate point.
    const strictMean = (rs: ProbeTaskResult[]) =>
      mean(rs.map((r) => (r.strictArtifact ? r.score : 0)));
    const gapB = baselineMean - strictMean(d.baseline.all);
    const gapF = mean(d.floor.all.map((r) => r.score)) - strictMean(d.floor.all);
    const asym = Math.abs(gapB - gapF);
    console.log(`\n  §5 strict-gap: baseline=${gapB.toFixed(3)} s0=${gapF.toFixed(3)} |asym|=${asym.toFixed(3)}` +
      (asym > STRICT_GAP_DISCLOSURE
        ? " — EXCEEDS 0.15: MANDATORY DISCLOSURE in the acceptance briefing."
        : " — within 0.15."));

    console.log(`\n=> CANDIDATE FOR HUMAN ACCEPTANCE: ${pointId} under DATA_OPS_GENERATOR_V31_ID.`);
    console.log(`   NOTHING IS FROZEN BY THIS SCRIPT. Dr. Robert Li accepts in session or does not.`);
    return;
  }

  console.log("\n=> PRIORITY ORDER EXHAUSTED (headroom/stage-2 failures). TERMINATION per §6.");
};

main().catch((e) => {
  console.error("FAILED:", e?.stack ?? e?.message ?? e);
  process.exit(1);
});
