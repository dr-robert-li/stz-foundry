/**
 * THE §6 PRE-REGISTERED CORRIDOR PROBE — the whole verdict pipeline, encoded
 * BEFORE any data exists (`BI-BATTERY-DESIGN.md` §5/§6/§7, Phase 9 Plan 09-01).
 *
 * ONE driver, TWO stages, selected by `BI_CORRIDOR_STAGE`:
 *
 *   - `pretest` — the §5 knob pretest SCREEN (REQ-54). BASELINE arm only,
 *     every `BI_GRID` point, seed `BI_PRETEST_SEED` (999) only, n=10/level.
 *     Coarse by design (F-09) — never a confirmatory measurement.
 *   - `probe`   — the §6 full verdict pipeline (REQ-55): both arms, every
 *     surviving grid point, the six stage-1 clauses, the gradient clause,
 *     selection, the §7 replicate/headroom procedure, stage 2, and the
 *     `QUALIFIED` / `FAILURE BRANCH` label.
 *
 * WHY IT DOES NOT IMPORT FROM `_bi-ceiling.ts`. That module calls `main()`
 * at top level (module load would launch the ceiling probe inside THIS
 * process). `once()`/`saveState`/`captureRunConfig`/the retry contract are
 * copied here VERBATIM IN SHAPE, never imported.
 *
 * WHY IT REUSES `_bi-score.ts` UNCHANGED. The corridor must be measured on
 * exactly the instrument the ceiling gate certified — same extraction, same
 * execution isolation, same graded score, same §4 instrumentation fields.
 * `git diff --quiet HEAD -- _bi-score.ts` staying clean is this plan's own
 * acceptance criterion.
 *
 * RECEIPT-FREE BY CONSTRUCTION (T-09-05). This driver calls `buildBiTasks`
 * directly, never `generateBiBattery` — it cannot mint an `OracleReceipt` or
 * write into `ACCEPTED_GENERATORS`. Acceptance (REQ-57) is Plan 09-02's own,
 * separately gated, pre-authorized commit.
 *
 *   BI_CORRIDOR_STAGE=pretest TOURNEY_STATE=bi-pretest-state.json \
 *     nohup ../../node_modules/.bin/tsx _bi-corridor.ts > bi-pretest.log 2>&1 &
 *   BI_CORRIDOR_STAGE=probe TOURNEY_STATE=bi-corridor-state.json \
 *     nohup ../../node_modules/.bin/tsx _bi-corridor.ts > bi-corridor.log 2>&1 &
 *
 * (In practice: launched through `_launch-probe.sh`, the sole sanctioned
 * detached launcher — never a bare `nohup ... &`.)
 */
import { execSync } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  biLevel,
  buildBiQuerySpecs,
  buildBiTasks,
  BI_GRID,
  BI_PRETEST_SEED,
  BI_STAGE1_SEEDS,
  BI_STAGE2_SEEDS,
  BI_TASKS_PER_SEED_PER_POINT,
  BI_TASK_TIMEOUT_MS,
  composeReferenceSql,
  generateBiWarehouse,
  type BiGridPoint,
  type BiLevelId,
} from "../../src/foundry/bi-warehouse.js";
import { executeSelect, materializeWarehouse, BI_ZERO_DECOMPOSITION_CATEGORIES, type BiCategory } from "../../src/foundry/bi-oracle.js";
import { mean, scoreBiProbeTasks, type BiProbeTaskInput, type BiProbeTaskResult } from "./_bi-score.js";

const MODEL = process.env.BI_MODEL ?? "qwen3.6:latest";
const TIMEOUT_MS = Number(process.env.BI_TIMEOUT_MS ?? BI_TASK_TIMEOUT_MS);
// Single ollama slot; client concurrency 1 (Phase-8 run config, pinned
// constants table).
const CONCURRENCY = Number(process.env.BI_CONCURRENCY ?? 1);
// Explicit, never defaulted — an omitted state path once pointed a re-run at
// the wrong round's data (`_bi-ceiling.ts`'s own note, one arm over).
const STATE_PATH = process.env.TOURNEY_STATE;
if (!STATE_PATH) throw new Error("TOURNEY_STATE must be set explicitly (no default state path)");

function requireStage(): "pretest" | "probe" {
  const v = process.env.BI_CORRIDOR_STAGE;
  if (v !== "pretest" && v !== "probe") {
    throw new Error(`BI_CORRIDOR_STAGE must be "pretest" or "probe" (got ${JSON.stringify(v)})`);
  }
  return v;
}
const STAGE = requireStage();

// Honoured ONLY when set — the Task 1 end-to-end smoke run. Absent in both
// real runs.
const SMOKE = process.env.BI_CORRIDOR_SMOKE === "1";

// Verdict/readout artifacts always land beside this script (experiments/
// bi-analytics-pilot/), regardless of the invoking process's cwd — the
// launcher `cd`s there, but a direct `tsx` invocation from the repo root
// (Task 1's smoke verify command) does not.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

// ── §8-pinned constants, named — never inline magic numbers ────────────────
const T_MULTIPLIER = 2.015; // §8: t5,0.95
const CORRIDOR_FLOOR = 0.3; // §8
const CORRIDOR_CEILING = 0.6; // §8
const S0_MINIMAL_FLOOR = 0.05; // §8
const GRADED_MINUS_EXACT_MARGIN = 0.1; // §8
const EXECUTES_BUT_WRONG_CEILING = 0.2; // §8
const DROP_BUDGET_CEILING = 0.1; // §8
const GRADIENT_FLOOR = 0.15; // §7/§8: the resolvable-gradient floor
const HEADROOM_MEAN_CEILING = 0.85; // §8
const REPLICATE_NOISE_MULTIPLIER = 3; // §8
const PRETEST_GRANULARITY_CEILING = 0.1; // §5/§8
/**
 * Rule-1 bugfix (found adjudicating the first pretest run, before any grid
 * commit): `meanGradedScore` is a mean of exact-rational per-task scores
 * (n/10), but two decimal literals like 0.7/0.8 have no exact binary64
 * representation, so `0.8 - 0.7` evaluates to `0.10000000000000009` in
 * IEEE754 — a ~1e-16 representation artifact, not a real measurement above
 * the ceiling. Without tolerance, a mathematically-exact 0.10 gap could
 * clear OR violate depending on which side of 0.10 the float noise happens
 * to land, which is exactly the F-09 boundary-case failure mode the design
 * warns this coarse screen cannot resolve — except here it is float noise,
 * not real noise. Tolerance borrows F-23's own precedent (`BI_NUMERIC_TOLERANCE`,
 * 1e-6) for absorbing binary64 round-trip noise in a numeric comparison — a
 * different mechanism (result-cell equality) but the same principle, applied
 * here by analogy since §5 pins no tolerance of its own. 1e-9 is generous
 * against the ~1e-16 noise scale and negligible against any real ≥1e-3
 * measurement difference, so it can only reclassify a true float-epsilon
 * artifact, never mask a genuine violation.
 */
const PRETEST_GRANULARITY_TOLERANCE = 1e-9;
// §8: "the first three of the six stage-1 seeds" — derived from the pinned
// stage-1 seed set rather than a second hardcoded literal.
const REPLICATE_PAIR_SEEDS: readonly number[] = BI_STAGE1_SEEDS.slice(0, 3);

/**
 * §9 gate condition 1 evidence, PINNED from `CEILING-PROBE.md` §6 — never
 * reparsed at run time. All four ORIGINAL grid points passed both conjuncts
 * of the format-stability/ceiling gate (`CEILING-PROBE.md` §6: "ALL FOUR
 * POINTS PASS").
 */
const CEILING_GATE_SURVIVING_POINTS: readonly BiLevelId[] = ["L1", "L2", "L3", "L4"];

/**
 * The four ORIGINAL grid levels, pinned as their own constant — the
 * TERMINATE/SUBDIVIDE decision rule below is DATA-DRIVEN off this constant
 * (never a driver edit): a violating adjacent pair with both endpoints in
 * this set has never been subdivided (routes to SUBDIVIDE); a violating pair
 * with either endpoint OUTSIDE this set was inserted BY a subdivision pass
 * and has already used its one permitted pass (F-34) — it routes to
 * TERMINATE. This is what keeps the driver's own commit ancestor of every
 * pretest data commit: no code edit is needed between pretest runs, only a
 * `BI_GRID` data edit in `bi-warehouse.ts`.
 */
const ORIGINAL_LEVEL_IDS: readonly BiLevelId[] = ["L1", "L2", "L3", "L4"];

/**
 * Phase-8-derived pin, carried forward BYTE-IDENTICAL to `_bi-ceiling.ts`'s
 * `BI_CEILING_SYSTEM_PROMPT` (`<pinned_constants>`, this plan): the design
 * names no separate system prompt for the corridor probe, and using the SAME
 * one for both arms is what makes the arm difference purely the user-prompt
 * guidance suffix and nothing else.
 */
export const BI_PROBE_SYSTEM_PROMPT = "You are a SQL assistant.";

/**
 * Phase-9-derived pin: the baseline arm's hand-engineered guidance, ONE
 * static module-level string, appended as a PURE SUFFIX to the arm-neutral
 * task prompt (design §6). Carries exactly the three elements §6 names —
 * column-name hints, a join-strategy suggestion, an explicit reminder to
 * check aggregation grouping — and nothing else: no filter value, no month
 * code, no reference SQL, no expected row or cell, no level-specific
 * instruction. Digit-free by construction (no example date, no sample
 * value) so it cannot coincidentally leak a filter or a cell across any
 * level. Written against the schema and the house SQL conventions only,
 * identical for every task, every level, every seed — the invariant
 * `buildUnitInputs` asserts below.
 */
export const BI_BASELINE_GUIDANCE = [
  `A few pointers before you write the query:`,
  `- Column names in this schema are self-describing (for example`,
  `  customer_name, segment, category, order_date) — match the question's`,
  `  business terms to the exact column name rather than guessing an`,
  `  abbreviation.`,
  `- When a dimension table is needed, join it on its declared`,
  `  primary/foreign key pair (fact_orders.customer_id to`,
  `  dim_customers.customer_id, or fact_orders.product_id to`,
  `  dim_products.product_id) rather than a derived or inferred join key.`,
  `- If the question asks for a total or a count broken down by one or more`,
  `  columns, double-check that every one of those columns appears in your`,
  `  GROUP BY clause, and only those columns — a missing or extra grouping`,
  `  column is one of the most common ways a correct-looking query returns`,
  `  the wrong rows.`,
].join("\n");

const ARMS = ["baseline", "s0-minimal"] as const;
type Arm = (typeof ARMS)[number];

/** F-60's citation: the equality obligation is already committed and
 *  test-enforced from Phase 8 over all nine seeds x all levels; recorded
 *  here rather than recomputed. If subdivision fires, Task 2 extends this
 *  same test's `LEVELS` arrays to cover the new level (§5), so the citation
 *  stays valid without a driver change. */
const F60_EQUALITY_SWEEP_CITATION = {
  file: "test/foundry-bi-warehouse.test.ts",
  describe: "the nine-seed equality sweep — precomputed === recomputed across 9 seeds × 5 levels × 10 tasks (design §3 F-23)",
  case: "450 task comparisons: every precomputed/recomputed pair is structurally equal under resultSetsEqual",
};

// ── checkpoint state (copied in shape from `_bi-ceiling.ts`) ────────────────

interface RetryLog {
  unitKey: string;
  taskId: string;
  reason: string;
  at: string;
}

interface RunConfig {
  ollamaVersion: string;
  modelDigestLine: string;
  samplerParams: string;
  ollamaNumParallel: string;
  clientConcurrency: number;
  taskOrder: string;
  taskTimeoutMs: number;
  systemPrompt: string;
  stage: "pretest" | "probe";
}

interface State {
  units: Record<string, BiProbeTaskResult[]>;
  retries: RetryLog[];
  runConfig?: RunConfig;
}

const loadState = (): State => {
  try {
    const parsed = JSON.parse(readFileSync(STATE_PATH!, "utf8")) as Partial<State>;
    return { units: parsed.units ?? {}, retries: parsed.retries ?? [], runConfig: parsed.runConfig };
  } catch {
    return { units: {}, retries: [] };
  }
};

/** Atomic tmp+rename, so a kill mid-write cannot leave a truncated state. */
const saveState = (state: State): void => {
  writeFileSync(`${STATE_PATH}.tmp`, JSON.stringify(state, null, 2));
  renameSync(`${STATE_PATH}.tmp`, STATE_PATH!);
};

/** Small, human-readable readout artifacts (the verdicts) — always written
 *  beside this script, atomically. */
function writeArtifact(filename: string, data: unknown): void {
  const p = join(SCRIPT_DIR, filename);
  writeFileSync(`${p}.tmp`, JSON.stringify(data, null, 2));
  renameSync(`${p}.tmp`, p);
}

function safeExec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch (e) {
    return `<unavailable: ${e instanceof Error ? e.message : String(e)}>`;
  }
}

/** §4: properties of the EXECUTED run, captured at run time, never pinned as
 *  a design constant. */
function captureRunConfig(): RunConfig {
  const ollamaVersion = safeExec("ollama --version");
  const listLine = safeExec("ollama list")
    .split("\n")
    .find((l) => l.startsWith(MODEL) || l.startsWith(MODEL.replace(/:latest$/, "")));
  return {
    ollamaVersion,
    modelDigestLine: listLine ?? `<not found in 'ollama list': ${MODEL}>`,
    samplerParams: "none sent (no temperature, no max_tokens override — provider/server default applies)",
    ollamaNumParallel: process.env.OLLAMA_NUM_PARALLEL ?? "<unset — server default>",
    clientConcurrency: CONCURRENCY,
    taskOrder:
      STAGE === "pretest"
        ? "pretest: BI_GRID order (ascending knobValue), baseline arm only, seed 999, task 0..9"
        : "probe: BI_GRID order (ascending knobValue), arm order baseline then s0-minimal within each point, seed order as pinned per stage, task 0..9",
    taskTimeoutMs: TIMEOUT_MS,
    systemPrompt: BI_PROBE_SYSTEM_PROMPT,
    stage: STAGE,
  };
}

// ── arm construction (design §6) ────────────────────────────────────────────

/** Fails loudly if the baseline prompt is ever anything OTHER than the
 *  s0-minimal prompt plus the ONE constant guidance suffix — the design's
 *  "structurally impossible to leak" invariant (§6), asserted at build time
 *  for every task built, not merely claimed. */
function assertBaselineIsPureSuffix(taskId: string, s0Prompt: string, baselinePrompt: string): void {
  const expected = `${s0Prompt}\n\n${BI_BASELINE_GUIDANCE}`;
  if (baselinePrompt !== expected) {
    throw new Error(`[bi-corridor] arm-purity invariant violated for ${taskId}: baseline prompt is not s0-minimal + BI_BASELINE_GUIDANCE`);
  }
}

/**
 * Builds the (arm-neutral prompt + arm-specific prefix)'d task/expected-result
 * inputs for one (seed, level, arm) unit. Mirrors `_bi-ceiling.ts`'s
 * `buildUnitInputs` shape: task/spec alignment assertion BEFORE the
 * reference computation, one shared reference-execution handle for all ten
 * tasks in a unit (candidate isolation only applies to the untrusted
 * model-authored artifact, scored in `_bi-score.ts`).
 */
function buildUnitInputs(seed: number, levelId: BiLevelId, arm: Arm): BiProbeTaskInput[] {
  const warehouse = generateBiWarehouse(seed);
  const specs = buildBiQuerySpecs(warehouse, levelId);
  // The arm-neutral prompt IS the s0-minimal prompt, byte-for-byte
  // (design §6): schema DDL, business question, §2 output-contract
  // instruction, nothing more.
  const s0Tasks = buildBiTasks(warehouse, levelId);
  if (s0Tasks.length !== specs.length || s0Tasks.length !== BI_TASKS_PER_SEED_PER_POINT) {
    throw new Error(
      `[bi-corridor] task/spec count mismatch for seed ${seed} level ${levelId}: ` +
        `${s0Tasks.length} tasks vs ${specs.length} specs (want ${BI_TASKS_PER_SEED_PER_POINT})`,
    );
  }

  const refDb = materializeWarehouse(warehouse);

  return s0Tasks.map((task, i) => {
    const spec = specs[i]!;
    const expectedTaskId = `bi-analytics-${levelId}-${spec.taskIndex}-${seed}`;
    if (task.id !== expectedTaskId) {
      throw new Error(
        `[bi-corridor] task/spec misalignment at index ${i}: task id ${JSON.stringify(task.id)} vs ` +
          `expected ${JSON.stringify(expectedTaskId)} — would grade this task against the wrong reference query`,
      );
    }
    const s0Prompt = task.prompt;
    const baselinePrompt = `${s0Prompt}\n\n${BI_BASELINE_GUIDANCE}`;
    assertBaselineIsPureSuffix(task.id, s0Prompt, baselinePrompt);

    const expected = executeSelect(refDb, composeReferenceSql(spec));
    const prompt = arm === "baseline" ? baselinePrompt : s0Prompt;
    return { task: { ...task, id: `${arm}-${task.id}`, prompt }, warehouse, expected };
  });
}

// ── the checkpoint contract (copied in shape from `_bi-ceiling.ts`) ─────────

/** Run `items` once per unit key, ever. Applies the §4 no-redraw rule: a
 *  HARNESS fault (`error`) is retried exactly once, logged in
 *  `state.retries` (never appended to the unit's own results array — every
 *  unit array stays exactly `BI_TASKS_PER_SEED_PER_POINT` long); a
 *  `timeout` at the bound is a measurement and is never retried. */
const once = async (state: State, key: string, items: BiProbeTaskInput[]): Promise<BiProbeTaskResult[]> => {
  const cached = state.units[key];
  if (cached) {
    console.log(`  [cached] ${key}`);
    return cached;
  }

  const results = await scoreBiProbeTasks(BI_PROBE_SYSTEM_PROMPT, items, {
    model: MODEL,
    taskTimeoutMs: TIMEOUT_MS,
    concurrency: CONCURRENCY,
  });

  const errorIdxs = results.map((r, i) => (r.status === "error" ? i : -1)).filter((i) => i >= 0);
  for (const i of errorIdxs) {
    const reason = results[i]!.failureReason ?? "unknown harness error";
    console.log(`  !! harness fault on ${results[i]!.taskId} (${reason}) — retrying once`);
    state.retries.push({ unitKey: key, taskId: results[i]!.taskId, reason, at: new Date().toISOString() });
    const [retried] = await scoreBiProbeTasks(BI_PROBE_SYSTEM_PROMPT, [items[i]!], {
      model: MODEL,
      taskTimeoutMs: TIMEOUT_MS,
      concurrency: 1,
    });
    results[i] = retried!;
  }

  state.units[key] = results;
  saveState(state);
  return results;
};

/** Per-task status BEFORE any aggregate — the milestone's standing rule; two
 *  harness faults have already masqueraded as capability results on the
 *  prior arm. */
function reportPerTaskStatus(results: BiProbeTaskResult[]): void {
  const nonOk = results.filter((r) => r.status !== "ok");
  if (nonOk.length > 0) {
    console.log(
      `  !! ${nonOk.length}/${results.length} not ok: ` +
        nonOk.map((r) => `${r.taskId}=${r.status}(${r.failureReason ?? "-"})`).join(", "),
    );
  } else {
    console.log(`  all ${results.length} ok`);
  }
}

function categoryCounts(results: BiProbeTaskResult[]): Record<BiCategory, number> {
  const counts = Object.fromEntries(BI_ZERO_DECOMPOSITION_CATEGORIES.map((c) => [c, 0])) as Record<BiCategory, number>;
  for (const r of results) counts[r.category] = (counts[r.category] ?? 0) + 1;
  return counts;
}

function rollupAllStatuses(units: Record<string, BiProbeTaskResult[]>): { ok: number; timeout: number; error: number; total: number } {
  let ok = 0,
    timeout = 0,
    error = 0,
    total = 0;
  for (const results of Object.values(units)) {
    for (const r of results) {
      total++;
      if (r.status === "ok") ok++;
      else if (r.status === "timeout") timeout++;
      else error++;
    }
  }
  return { ok, timeout, error, total };
}

function biLevelKnobValue(id: BiLevelId): number {
  return biLevel(id).knobValue;
}

// ═══════════════════════ STAGE `pretest` — §5 screen ═══════════════════════

interface PretestLevelSummary {
  levelId: BiLevelId;
  knobValue: number;
  n: number;
  meanGradedScore: number;
  exactRate: number;
  categoryCounts: Record<BiCategory, number>;
  statusRollup: { ok: number; timeout: number; error: number };
}

function summarizePretestLevel(point: BiGridPoint, results: BiProbeTaskResult[]): PretestLevelSummary {
  return {
    levelId: point.id,
    knobValue: point.knobValue,
    n: results.length,
    meanGradedScore: mean(results.map((r) => r.gradedScore)),
    exactRate: results.length > 0 ? results.filter((r) => r.exact).length / results.length : 0,
    categoryCounts: categoryCounts(results),
    statusRollup: {
      ok: results.filter((r) => r.status === "ok").length,
      timeout: results.filter((r) => r.status === "timeout").length,
      error: results.filter((r) => r.status === "error").length,
    },
  };
}

interface PretestPair {
  left: BiLevelId;
  right: BiLevelId;
  deltaMean: number;
  clearsCeiling: boolean;
  postSubdivision: boolean;
}

function printPretestTables(levels: PretestLevelSummary[], pairs: PretestPair[]): void {
  console.log("\n## PRETEST per-level table (§5)");
  console.log("| level | knob | n | mean | exact | no-artifact | non-exec | exec-wrong | correct |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const l of levels) {
    console.log(
      `| ${l.levelId} | ${l.knobValue} | ${l.n} | ${l.meanGradedScore.toFixed(3)} | ${l.exactRate.toFixed(3)} | ` +
        `${l.categoryCounts["no-artifact"]} | ${l.categoryCounts["non-executable-artifact"]} | ` +
        `${l.categoryCounts["executes-but-wrong"]} | ${l.categoryCounts["correct"]} |`,
    );
  }
  console.log("\n## PRETEST adjacent-pair table (0.10 granularity ceiling)");
  console.log("| left | right | |Δmean| | clears 0.10 | post-subdivision pair |");
  console.log("|---|---|---|---|---|");
  for (const p of pairs) {
    console.log(`| ${p.left} | ${p.right} | ${p.deltaMean.toFixed(3)} | ${p.clearsCeiling ? "yes" : "NO"} | ${p.postSubdivision ? "yes" : "no"} |`);
  }
}

async function runPretestStage(state: State): Promise<void> {
  console.log("# BI CORRIDOR — §5 PRETEST SCREEN (REQ-54, coarse per F-09)");
  console.log(`seed: ${BI_PRETEST_SEED} · levels: ${BI_GRID.map((p) => p.id).join(", ")} · n/level: ${BI_TASKS_PER_SEED_PER_POINT}`);

  const levels: PretestLevelSummary[] = [];
  for (const point of BI_GRID) {
    const items = buildUnitInputs(BI_PRETEST_SEED, point.id, "baseline");
    const key = `pretest-${point.id}-s${BI_PRETEST_SEED}`;
    console.log(`\n## ${key} (${items.length} tasks)`);
    const results = await once(state, key, items);
    reportPerTaskStatus(results);
    levels.push(summarizePretestLevel(point, results));
  }

  // Completeness: the verdict is written ONLY once every level's unit is
  // fully present — its existence is itself the completion signal.
  const complete = levels.every((l) => l.n === BI_TASKS_PER_SEED_PER_POINT);
  if (!complete) {
    console.log("\npretest incomplete — not every level has a full sample yet; no verdict written this run.");
    return;
  }

  const pairs: PretestPair[] = [];
  for (let i = 0; i < BI_GRID.length - 1; i++) {
    const left = BI_GRID[i]!.id;
    const right = BI_GRID[i + 1]!.id;
    const leftSummary = levels.find((l) => l.levelId === left)!;
    const rightSummary = levels.find((l) => l.levelId === right)!;
    const deltaMean = Math.abs(leftSummary.meanGradedScore - rightSummary.meanGradedScore);
    pairs.push({
      left,
      right,
      deltaMean,
      clearsCeiling: deltaMean <= PRETEST_GRANULARITY_CEILING + PRETEST_GRANULARITY_TOLERANCE,
      postSubdivision: !ORIGINAL_LEVEL_IDS.includes(left) || !ORIGINAL_LEVEL_IDS.includes(right),
    });
  }

  const violating = pairs.filter((p) => !p.clearsCeiling);
  let outcome: "SCREEN PASS" | "SUBDIVIDE" | "TERMINATE";
  if (violating.length === 0) outcome = "SCREEN PASS";
  else if (violating.some((p) => p.postSubdivision)) outcome = "TERMINATE";
  else outcome = "SUBDIVIDE";

  printPretestTables(levels, pairs);
  console.log(`\nPRETEST SCREEN OUTCOME: ${outcome}`);

  const verdict = {
    stage: "pretest" as const,
    seed: BI_PRETEST_SEED,
    tasksPerLevel: BI_TASKS_PER_SEED_PER_POINT,
    gridSize: BI_GRID.length,
    levels,
    pairs,
    outcome,
    screenCaveat:
      "F-09: this is a coarse SCREEN over n=10/level on a single pinned seed — it catches only LARGE " +
      "granularity violations, never a boundary case near the 0.10 ceiling itself. Final confirmation is " +
      "the full six-seed stage-1 grid's own seed-clustered estimate (§6), not this screen.",
    retries: state.retries,
    runConfig: state.runConfig,
  };
  writeArtifact("bi-pretest-verdict.json", verdict);
  console.log(`\nwrote bi-pretest-verdict.json — outcome ${outcome}.`);

  if (outcome === "TERMINATE") {
    // The pipeline HAS reached its verdict, at the screen, without ever
    // running stage 1 — without this artifact the §10 screen exit would
    // strand Plan 09-02 with no entry point (design action text).
    const corridorVerdict = {
      complete: true,
      verdict: "FAILURE BRANCH" as const,
      failureStage: "pretest" as const,
      selectedPoint: null,
      unitsEvaluated: [] as string[],
      evidence: "experiments/bi-analytics-pilot/PRETEST-SCREEN.md",
      note:
        "§10 terminal exit at the pretest screen — a violating adjacent pair persisted after its one " +
        "permitted §5 subdivision pass (F-34). The instrument line terminates here; stage 1 never ran.",
    };
    writeArtifact("bi-corridor-verdict.json", corridorVerdict);
    console.log("\nTERMINATE — bi-corridor-verdict.json written with failureStage 'pretest'. No stage-1 launch.");
  }
}

// ═══════════════════════ STAGE `probe` — §6 verdict pipeline ═══════════════

interface SurvivingPoint {
  id: BiLevelId;
  survivingBy: "gate" | "inherited-from-subdivision";
}

/** Every point actually in the committed grid at probe-run time. A point
 *  outside `CEILING_GATE_SURVIVING_POINTS` can only exist because §5
 *  subdivision inserted it between two originals that both passed the gate
 *  (design §6: "A subdivided level inherits the surviving status of the
 *  pair it was inserted into") — recorded explicitly rather than silently
 *  folded into the gate-evidence set. Order matches `BI_GRID` (ascending
 *  knobValue), never re-sorted. */
function survivingPoints(): SurvivingPoint[] {
  return BI_GRID.map((p) => ({
    id: p.id,
    survivingBy: CEILING_GATE_SURVIVING_POINTS.includes(p.id) ? "gate" : "inherited-from-subdivision",
  }));
}

interface SeedClusteredStats {
  seedMeans: number[];
  mean: number;
  sd: number;
  ciLow: number;
  ciHigh: number;
}

/** §6 THE ESTIMATOR, PINNED: the unit of replication is the SEED. Per-task
 *  pooling is excluded by name. Sample sd (n-1 denominator) is the Phase-9
 *  reading pinned here — §8 names the t-multiplier and the ASSUMED sd used
 *  for the resolvable-gradient-floor derivation, but not which sd estimator
 *  to apply to the REALIZED seed-mean sample; n-1 is the standard unbiased
 *  choice paired with a Student-t critical value. */
function seedClusteredStats(perSeedResults: BiProbeTaskResult[][]): SeedClusteredStats {
  const seedMeans = perSeedResults.map((rs) => mean(rs.map((r) => r.gradedScore)));
  const n = seedMeans.length;
  const m = mean(seedMeans);
  const variance = n > 1 ? seedMeans.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  const se = n > 0 ? sd / Math.sqrt(n) : 0;
  const halfWidth = T_MULTIPLIER * se;
  return { seedMeans, mean: m, sd, ciLow: m - halfWidth, ciHigh: m + halfWidth };
}

interface ArmReport {
  n: number;
  pooledMean: number;
  exactRate: number;
  executesButWrongRate: number;
  dropRate: number;
  stats: SeedClusteredStats;
}

function armReport(perSeedResults: BiProbeTaskResult[][]): ArmReport {
  const pooled = perSeedResults.flat();
  const counts = categoryCounts(pooled);
  const n = pooled.length;
  return {
    n,
    pooledMean: mean(pooled.map((r) => r.gradedScore)),
    exactRate: n > 0 ? pooled.filter((r) => r.exact).length / n : 0,
    executesButWrongRate: n > 0 ? counts["executes-but-wrong"] / n : 0,
    dropRate: n > 0 ? (counts["no-artifact"] + counts["non-executable-artifact"]) / n : 0,
    stats: seedClusteredStats(perSeedResults),
  };
}

interface ClauseResult {
  value?: number;
  pass: boolean;
  [k: string]: unknown;
}

interface Stage1PointReport {
  pointId: BiLevelId;
  arms: Record<Arm, ArmReport>;
  clauses: {
    clause1_baselineCiInCorridor: { ciLow: number; ciHigh: number; pass: boolean };
    clause2_s0MinimalFloor: { value: number; pass: boolean };
    clause3_gradedMinusExactMargin: { value: number; pass: boolean };
    clause4_executesButWrong: { baseline: ClauseResult; s0Minimal: ClauseResult; pass: boolean };
    clause5_dropBudget: { baseline: ClauseResult; s0Minimal: ClauseResult; pass: boolean };
    clause6_armOrder: { pooledOrderOk: boolean; positiveSeedCount: number; signOk: boolean; pass: boolean };
    allSixPass: boolean;
  };
}

/** §6 STAGE-1 ACCEPTANCE, all six clauses, each computed and recorded
 *  separately — never collapsed. */
function computeStage1PointReport(point: SurvivingPoint, unitsByPointArm: Record<string, BiProbeTaskResult[][]>): Stage1PointReport {
  const baseline = armReport(unitsByPointArm[`${point.id}|baseline`]!);
  const s0Minimal = armReport(unitsByPointArm[`${point.id}|s0-minimal`]!);

  const clause1_baselineCiInCorridor = {
    ciLow: baseline.stats.ciLow,
    ciHigh: baseline.stats.ciHigh,
    pass: baseline.stats.ciLow >= CORRIDOR_FLOOR && baseline.stats.ciHigh <= CORRIDOR_CEILING,
  };
  const clause2_s0MinimalFloor = { value: s0Minimal.pooledMean, pass: s0Minimal.pooledMean >= S0_MINIMAL_FLOOR };
  const clause3Value = baseline.pooledMean - baseline.exactRate;
  const clause3_gradedMinusExactMargin = { value: clause3Value, pass: clause3Value >= GRADED_MINUS_EXACT_MARGIN };

  const c4Baseline = { value: baseline.executesButWrongRate, pass: baseline.executesButWrongRate <= EXECUTES_BUT_WRONG_CEILING };
  const c4S0 = { value: s0Minimal.executesButWrongRate, pass: s0Minimal.executesButWrongRate <= EXECUTES_BUT_WRONG_CEILING };
  const clause4_executesButWrong = { baseline: c4Baseline, s0Minimal: c4S0, pass: c4Baseline.pass && c4S0.pass };

  const c5Baseline = { value: baseline.dropRate, pass: baseline.dropRate <= DROP_BUDGET_CEILING };
  const c5S0 = { value: s0Minimal.dropRate, pass: s0Minimal.dropRate <= DROP_BUDGET_CEILING };
  const clause5_dropBudget = { baseline: c5Baseline, s0Minimal: c5S0, pass: c5Baseline.pass && c5S0.pass };

  let positiveSeedCount = 0;
  for (let i = 0; i < baseline.stats.seedMeans.length; i++) {
    if (baseline.stats.seedMeans[i]! - s0Minimal.stats.seedMeans[i]! > 0) positiveSeedCount++;
  }
  const pooledOrderOk = baseline.pooledMean > s0Minimal.pooledMean;
  const signOk = positiveSeedCount >= 5;
  const clause6_armOrder = { pooledOrderOk, positiveSeedCount, signOk, pass: pooledOrderOk && signOk };

  const allSixPass =
    clause1_baselineCiInCorridor.pass &&
    clause2_s0MinimalFloor.pass &&
    clause3_gradedMinusExactMargin.pass &&
    clause4_executesButWrong.pass &&
    clause5_dropBudget.pass &&
    clause6_armOrder.pass;

  return {
    pointId: point.id,
    arms: { baseline, "s0-minimal": s0Minimal },
    clauses: {
      clause1_baselineCiInCorridor,
      clause2_s0MinimalFloor,
      clause3_gradedMinusExactMargin,
      clause4_executesButWrong,
      clause5_dropBudget,
      clause6_armOrder,
      allSixPass,
    },
  };
}

interface GradientStep {
  lower: BiLevelId;
  higher: BiLevelId;
  lowerMean: number;
  higherMean: number;
  diff: number; // lowerMean - higherMean; expected POSITIVE (F-36 direction)
  credited: boolean; // diff >= GRADIENT_FLOOR, correct direction
  wrongDirectionFalsification: boolean; // diff <= -GRADIENT_FLOOR — Disclosure-3 falsification
}

/** §6 THE GRADIENT CLAUSE, over the surviving grid in ascending-knobValue
 *  order (F-59: "adjacent" = nearest SURVIVING neighbour). */
function computeGradientSteps(sortedSurvivingIds: BiLevelId[], baselineMeanByPoint: Record<string, number>): GradientStep[] {
  const steps: GradientStep[] = [];
  for (let i = 0; i < sortedSurvivingIds.length - 1; i++) {
    const lower = sortedSurvivingIds[i]!;
    const higher = sortedSurvivingIds[i + 1]!;
    const lowerMean = baselineMeanByPoint[lower]!;
    const higherMean = baselineMeanByPoint[higher]!;
    const diff = lowerMean - higherMean;
    steps.push({
      lower,
      higher,
      lowerMean,
      higherMean,
      diff,
      credited: diff >= GRADIENT_FLOOR,
      wrongDirectionFalsification: diff <= -GRADIENT_FLOOR,
    });
  }
  return steps;
}

/**
 * Phase-9 reading (disclosed, not fully specified by the frozen text): a
 * point passes the gradient clause iff it has at least one surviving
 * neighbour (F-59) AND at least one step touching it is CREDITED — i.e. the
 * point participates in at least one demonstrable, correctly-directed
 * >=0.15 behavioural separation. A point with no surviving neighbour in
 * either direction cannot be evaluated and fails outright.
 */
function gradientClauseForPoint(pointId: BiLevelId, steps: GradientStep[]): { pass: boolean; touchingSteps: GradientStep[] } {
  const touching = steps.filter((s) => s.lower === pointId || s.higher === pointId);
  return { pass: touching.length > 0 && touching.some((s) => s.credited), touchingSteps: touching };
}

interface ReplicateResult {
  pairs: { seed: number; a: number; b: number; diff: number }[];
  maxNoise: number;
}

/** §7 THE REPLICATE-PAIR NOISE PROCEDURE: three baseline replicate pairs (six
 *  runs) on the first three of the six stage-1 seeds — TWO INDEPENDENT runs
 *  per seed on the SAME task set, so `once()` cannot alias them onto one
 *  another or onto the stage-1 unit (distinct `rep-a-`/`rep-b-` keys). */
async function runReplicatePairs(state: State, pointId: BiLevelId): Promise<ReplicateResult> {
  const pairs: ReplicateResult["pairs"] = [];
  for (const seed of REPLICATE_PAIR_SEEDS) {
    const items = buildUnitInputs(seed, pointId, "baseline");
    const keyA = `rep-a-${pointId}-s${seed}`;
    const keyB = `rep-b-${pointId}-s${seed}`;
    console.log(`\n## ${keyA} (${items.length} tasks)`);
    const resultsA = await once(state, keyA, items);
    reportPerTaskStatus(resultsA);
    console.log(`\n## ${keyB} (${items.length} tasks)`);
    const resultsB = await once(state, keyB, items);
    reportPerTaskStatus(resultsB);
    const a = mean(resultsA.map((r) => r.gradedScore));
    const b = mean(resultsB.map((r) => r.gradedScore));
    pairs.push({ seed, a, b, diff: Math.abs(a - b) });
  }
  const maxNoise = Math.max(...pairs.map((p) => p.diff));
  return { pairs, maxNoise };
}

interface HeadroomResult {
  measuredNoise: number;
  requiredHeadroom: number;
  actualHeadroom: number;
  headroomRuleOk: boolean;
  meanCeilingOk: boolean;
  pass: boolean;
}

/** §7 THE HEADROOM CLAUSE: two INDEPENDENT checks, not known to agree in
 *  advance — the 3x rule against the ACTUALLY MEASURED replicate noise,
 *  never the §5 assumed sd. */
function evaluateHeadroom(replicate: ReplicateResult, baselinePooledMean: number): HeadroomResult {
  const requiredHeadroom = REPLICATE_NOISE_MULTIPLIER * replicate.maxNoise;
  const actualHeadroom = 1 - baselinePooledMean;
  const headroomRuleOk = actualHeadroom >= requiredHeadroom;
  const meanCeilingOk = baselinePooledMean <= HEADROOM_MEAN_CEILING;
  return { measuredNoise: replicate.maxNoise, requiredHeadroom, actualHeadroom, headroomRuleOk, meanCeilingOk, pass: headroomRuleOk && meanCeilingOk };
}

interface Stage2Result {
  pointId: BiLevelId;
  baselinePooledMean: number;
  pooledMeanInCorridor: boolean;
  perSeedSign: { seed: number; baselineMean: number; s0Mean: number; positive: boolean }[];
  signAllFreshSeedsPositive: boolean;
  baselineExecutesButWrongRate: number;
  s0ExecutesButWrongRate: number;
  executesButWrongOk: boolean;
  baselineDropRate: number;
  s0DropRate: number;
  dropBudgetOk: boolean;
  pass: boolean;
}

/** §6 STAGE 2, its own explicit rule rather than a re-run of stage 1: fresh
 *  seeds, both arms, n=30/arm, at the selected point. */
async function runStage2(state: State, pointId: BiLevelId): Promise<Stage2Result> {
  const perArmResults: Record<Arm, BiProbeTaskResult[]> = { baseline: [], "s0-minimal": [] };
  const perArmPerSeed: Record<Arm, Record<number, BiProbeTaskResult[]>> = { baseline: {}, "s0-minimal": {} };
  for (const arm of ARMS) {
    for (const seed of BI_STAGE2_SEEDS) {
      const items = buildUnitInputs(seed, pointId, arm);
      const key = `s2-${arm}-${pointId}-s${seed}`;
      console.log(`\n## ${key} (${items.length} tasks)`);
      const results = await once(state, key, items);
      reportPerTaskStatus(results);
      perArmResults[arm].push(...results);
      perArmPerSeed[arm][seed] = results;
    }
  }

  const baselinePooled = perArmResults.baseline;
  const s0Pooled = perArmResults["s0-minimal"];
  const baselinePooledMean = mean(baselinePooled.map((r) => r.gradedScore));
  const pooledMeanInCorridor = baselinePooledMean >= CORRIDOR_FLOOR && baselinePooledMean <= CORRIDOR_CEILING;

  const perSeedSign: Stage2Result["perSeedSign"] = [];
  let signAllFreshSeedsPositive = true;
  for (const seed of BI_STAGE2_SEEDS) {
    const bm = mean(perArmPerSeed.baseline[seed]!.map((r) => r.gradedScore));
    const sm = mean(perArmPerSeed["s0-minimal"][seed]!.map((r) => r.gradedScore));
    const positive = bm - sm > 0;
    if (!positive) signAllFreshSeedsPositive = false;
    perSeedSign.push({ seed, baselineMean: bm, s0Mean: sm, positive });
  }

  const baselineCounts = categoryCounts(baselinePooled);
  const s0Counts = categoryCounts(s0Pooled);
  const baselineExecutesButWrongRate = baselinePooled.length > 0 ? baselineCounts["executes-but-wrong"] / baselinePooled.length : 0;
  const s0ExecutesButWrongRate = s0Pooled.length > 0 ? s0Counts["executes-but-wrong"] / s0Pooled.length : 0;
  const baselineDropRate =
    baselinePooled.length > 0 ? (baselineCounts["no-artifact"] + baselineCounts["non-executable-artifact"]) / baselinePooled.length : 0;
  const s0DropRate = s0Pooled.length > 0 ? (s0Counts["no-artifact"] + s0Counts["non-executable-artifact"]) / s0Pooled.length : 0;

  const executesButWrongOk = baselineExecutesButWrongRate <= EXECUTES_BUT_WRONG_CEILING && s0ExecutesButWrongRate <= EXECUTES_BUT_WRONG_CEILING;
  const dropBudgetOk = baselineDropRate <= DROP_BUDGET_CEILING && s0DropRate <= DROP_BUDGET_CEILING;
  const pass = pooledMeanInCorridor && signAllFreshSeedsPositive && executesButWrongOk && dropBudgetOk;

  return {
    pointId,
    baselinePooledMean,
    pooledMeanInCorridor,
    perSeedSign,
    signAllFreshSeedsPositive,
    baselineExecutesButWrongRate,
    s0ExecutesButWrongRate,
    executesButWrongOk,
    baselineDropRate,
    s0DropRate,
    dropBudgetOk,
    pass,
  };
}

interface SelectionAttempt {
  pointId: BiLevelId;
  replicate: ReplicateResult;
  headroom: HeadroomResult;
  stage2?: Stage2Result;
  outcome: "selected" | "headroom-failed" | "stage2-failed";
}

function printStage1Table(reports: Stage1PointReport[]): void {
  console.log("\n## STAGE-1 per-point per-arm table (§6)");
  console.log("| point | arm | n | pooled mean | seed CI | exact | exec-wrong | drop |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const r of reports) {
    for (const arm of ARMS) {
      const a = r.arms[arm];
      console.log(
        `| ${r.pointId} | ${arm} | ${a.n} | ${a.pooledMean.toFixed(3)} | [${a.stats.ciLow.toFixed(3)}, ${a.stats.ciHigh.toFixed(3)}] | ` +
          `${a.exactRate.toFixed(3)} | ${a.executesButWrongRate.toFixed(3)} | ${a.dropRate.toFixed(3)} |`,
      );
    }
  }
  console.log("\n## STAGE-1 six-clause table");
  console.log("| point | c1 CI⊆corridor | c2 s0≥0.05 | c3 margin≥0.10 | c4 wrong≤0.20 | c5 drop≤0.10 | c6 arm order | ALL SIX |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const r of reports) {
    const c = r.clauses;
    console.log(
      `| ${r.pointId} | ${c.clause1_baselineCiInCorridor.pass ? "PASS" : "FAIL"} | ${c.clause2_s0MinimalFloor.pass ? "PASS" : "FAIL"} | ` +
        `${c.clause3_gradedMinusExactMargin.pass ? "PASS" : "FAIL"} | ${c.clause4_executesButWrong.pass ? "PASS" : "FAIL"} | ` +
        `${c.clause5_dropBudget.pass ? "PASS" : "FAIL"} | ${c.clause6_armOrder.pass ? "PASS" : "FAIL"} | ${c.allSixPass ? "PASS" : "FAIL"} |`,
    );
  }
}

function printGradientTable(steps: GradientStep[]): void {
  console.log("\n## GRADIENT table (§6, floor 0.15, expected direction: lower knob mean > higher knob mean)");
  console.log("| lower | higher | lowerMean | higherMean | diff | credited | wrong-direction falsification |");
  console.log("|---|---|---|---|---|---|---|");
  for (const s of steps) {
    console.log(
      `| ${s.lower} | ${s.higher} | ${s.lowerMean.toFixed(3)} | ${s.higherMean.toFixed(3)} | ${s.diff.toFixed(3)} | ` +
        `${s.credited ? "yes" : "no"} | ${s.wrongDirectionFalsification ? "YES" : "no"} |`,
    );
  }
}

function printSelectionAttempts(attempts: SelectionAttempt[]): void {
  console.log("\n## SELECTION / replicate-headroom / stage-2 attempts (§6/§7, priority order)");
  for (const a of attempts) {
    console.log(
      `- ${a.pointId}: replicate maxNoise=${a.replicate.maxNoise.toFixed(3)}, headroom required=${a.headroom.requiredHeadroom.toFixed(3)} ` +
        `actual=${a.headroom.actualHeadroom.toFixed(3)} meanCeilingOk=${a.headroom.meanCeilingOk} pass=${a.headroom.pass} -> ${a.outcome}` +
        (a.stage2 ? ` (stage2 pass=${a.stage2.pass})` : ""),
    );
  }
}

async function runProbeStage(state: State): Promise<void> {
  console.log("# BI CORRIDOR — §6 full verdict pipeline (REQ-55)");
  const points = survivingPoints();
  console.log(`surviving points: ${points.map((p) => `${p.id}(${p.survivingBy})`).join(", ")}`);

  // 2. Stage 1 — both arms x every surviving point x six stage-1 seeds.
  const stage1UnitsByPointArm: Record<string, BiProbeTaskResult[][]> = {};
  for (const point of points) {
    for (const arm of ARMS) {
      const perSeed: BiProbeTaskResult[][] = [];
      for (const seed of BI_STAGE1_SEEDS) {
        const items = buildUnitInputs(seed, point.id, arm);
        const key = `s1-${arm}-${point.id}-s${seed}`;
        console.log(`\n## ${key} (${items.length} tasks)`);
        const results = await once(state, key, items);
        reportPerTaskStatus(results);
        perSeed.push(results);
      }
      stage1UnitsByPointArm[`${point.id}|${arm}`] = perSeed;
    }
  }

  // 3-4. The estimator + the six stage-1 clauses, per point.
  const pointReports = points.map((p) => computeStage1PointReport(p, stage1UnitsByPointArm));
  printStage1Table(pointReports);

  // 5. The gradient clause, over surviving points in BI_GRID order.
  const sortedIds = points.map((p) => p.id);
  const baselineMeanByPoint = Object.fromEntries(pointReports.map((r) => [r.pointId, r.arms.baseline.pooledMean])) as Record<
    BiLevelId,
    number
  >;
  const gradientSteps = computeGradientSteps(sortedIds, baselineMeanByPoint);
  printGradientTable(gradientSteps);
  const pointGradient = Object.fromEntries(points.map((p) => [p.id, gradientClauseForPoint(p.id, gradientSteps)])) as Record<
    BiLevelId,
    { pass: boolean; touchingSteps: GradientStep[] }
  >;

  // 6. Selection among qualifiers — fewest structural operations first.
  const qualifiers = pointReports
    .filter((r) => r.clauses.allSixPass && pointGradient[r.pointId]!.pass)
    .map((r) => r.pointId)
    .sort((a, b) => biLevelKnobValue(a) - biLevelKnobValue(b));
  console.log(`\nstage-1 + gradient qualifiers, priority order: ${qualifiers.length ? qualifiers.join(", ") : "(none)"}`);

  // 7-8. Replicate/headroom then stage 2, walking priority order; any
  // failure moves to the next qualifier, once each; exhaustion -> §10.
  const selectionAttempts: SelectionAttempt[] = [];
  let selectedPoint: BiLevelId | null = null;
  for (const pointId of qualifiers) {
    const replicate = await runReplicatePairs(state, pointId);
    const report = pointReports.find((r) => r.pointId === pointId)!;
    const headroom = evaluateHeadroom(replicate, report.arms.baseline.pooledMean);
    if (!headroom.pass) {
      selectionAttempts.push({ pointId, replicate, headroom, outcome: "headroom-failed" });
      continue;
    }
    const stage2 = await runStage2(state, pointId);
    if (!stage2.pass) {
      selectionAttempts.push({ pointId, replicate, headroom, stage2, outcome: "stage2-failed" });
      continue;
    }
    selectionAttempts.push({ pointId, replicate, headroom, stage2, outcome: "selected" });
    selectedPoint = pointId;
    break;
  }
  printSelectionAttempts(selectionAttempts);

  // 9. The verdict label.
  const verdictLabel: "QUALIFIED" | "FAILURE BRANCH" = selectedPoint !== null ? "QUALIFIED" : "FAILURE BRANCH";
  const perTaskStatusRollup = rollupAllStatuses(state.units);
  const unitsEvaluated = Object.keys(state.units);
  const totalTasks = Object.values(state.units).reduce((s, arr) => s + arr.length, 0);

  const verdict = {
    complete: true,
    verdict: verdictLabel,
    selectedPoint,
    unitsEvaluated,
    survivingPoints: points,
    formatStabilityGateCitation: {
      file: "experiments/bi-analytics-pilot/CEILING-PROBE.md",
      note: "§9 gate condition 1 — cited, not re-run; all four original points passed both conjuncts (CEILING-PROBE.md §6).",
    },
    stage1: {
      seeds: BI_STAGE1_SEEDS,
      tasksPerSeedPerPoint: BI_TASKS_PER_SEED_PER_POINT,
      points: pointReports,
    },
    gradient: { floor: GRADIENT_FLOOR, steps: gradientSteps, perPoint: pointGradient },
    qualifiers,
    selectionAttempts,
    f60EqualitySweepCitation: F60_EQUALITY_SWEEP_CITATION,
    perTaskStatusRollup,
    totalUnits: unitsEvaluated.length,
    totalTasks,
    runConfig: state.runConfig,
  };
  writeArtifact("bi-corridor-verdict.json", verdict);
  console.log(`\n=> CORRIDOR VERDICT: ${verdictLabel}${selectedPoint ? ` at ${selectedPoint}` : ""}`);
}

// ═══════════════════════════════ SMOKE MODE ════════════════════════════════

/**
 * Task 1's end-to-end proof: ONE baseline task and ONE s0-minimal task, both
 * sent through the REAL provider, then the SAME clause/gradient/headroom
 * machinery the real runs use is exercised over that degenerate (n=1 seed)
 * data so every layer — arm construction, scoring, checkpoint state, clause
 * evaluation, verdict serialisation — is proven end to end. Writes NO
 * artifact under `experiments/` (that is real-run-only); the scratch state
 * file at `TOURNEY_STATE` is left for the caller to inspect and delete.
 */
async function runSmoke(state: State): Promise<void> {
  console.log("# SMOKE MODE (BI_CORRIDOR_SMOKE=1) — one real call per arm, full pipeline exercised, no probe artifact written.");
  const point = BI_GRID[0]!;
  const seed = BI_STAGE1_SEEDS[0]!;

  const baselineItems = buildUnitInputs(seed, point.id, "baseline").slice(0, 1);
  const s0Items = buildUnitInputs(seed, point.id, "s0-minimal").slice(0, 1);
  const baselineResults = await once(state, `smoke-baseline-${point.id}-s${seed}`, baselineItems);
  const s0Results = await once(state, `smoke-s0-minimal-${point.id}-s${seed}`, s0Items);

  for (const [arm, results] of [["baseline", baselineResults] as const, ["s0-minimal", s0Results] as const]) {
    const r = results[0]!;
    console.log(`  ${arm}: category=${r.category} gradedScore=${r.gradedScore} wallMs=${r.wallMs} rawTextLen=${r.rawText.length}`);
    if (!r.rawText || r.rawText.length === 0) throw new Error(`[smoke] ${arm} returned empty rawText`);
    if (!(BI_ZERO_DECOMPOSITION_CATEGORIES as readonly string[]).includes(r.category)) {
      throw new Error(`[smoke] ${arm} category ${r.category} is not one of the four §4 categories`);
    }
    if (typeof r.gradedScore !== "number" || Number.isNaN(r.gradedScore)) throw new Error(`[smoke] ${arm} gradedScore is not numeric`);
    if (!(r.wallMs > 0)) throw new Error(`[smoke] ${arm} wallMs is not positive`);
  }

  // Exercise the clause/gradient/headroom machinery over this degenerate
  // n=1-seed data — proving it computes a verdict object without throwing.
  const baselineStats = seedClusteredStats([baselineResults]);
  const s0Stats = seedClusteredStats([s0Results]);
  const baselinePooledMean = mean(baselineResults.map((r) => r.gradedScore));
  const s0PooledMean = mean(s0Results.map((r) => r.gradedScore));

  const clause1 = { ciLow: baselineStats.ciLow, ciHigh: baselineStats.ciHigh, pass: baselineStats.ciLow >= CORRIDOR_FLOOR && baselineStats.ciHigh <= CORRIDOR_CEILING };
  const clause2 = { value: s0PooledMean, pass: s0PooledMean >= S0_MINIMAL_FLOOR };
  const exactRate = baselineResults.filter((r) => r.exact).length / baselineResults.length;
  const clause3 = { value: baselinePooledMean - exactRate, pass: baselinePooledMean - exactRate >= GRADED_MINUS_EXACT_MARGIN };
  const gradientSteps = computeGradientSteps([point.id], { [point.id]: baselinePooledMean });
  const replicate: ReplicateResult = { pairs: [{ seed, a: baselinePooledMean, b: baselinePooledMean, diff: 0 }], maxNoise: 0 };
  const headroom = evaluateHeadroom(replicate, baselinePooledMean);
  const positiveSeedCount = baselineStats.seedMeans[0]! - s0Stats.seedMeans[0]! > 0 ? 1 : 0;
  const clause6 = { pooledOrderOk: baselinePooledMean > s0PooledMean, positiveSeedCount, pass: baselinePooledMean > s0PooledMean };

  const smokeVerdict = {
    smoke: true,
    computedWithoutThrowing: true,
    clauses: { clause1, clause2, clause3, clause6 },
    gradientSteps,
    headroom,
  };
  console.log("\nsmoke verdict object (degenerate n=1 data, computed without throwing):");
  console.log(JSON.stringify(smokeVerdict, null, 2));
  console.log(`\nSMOKE PASSED. Scratch state at ${STATE_PATH} holds both arms' results — delete it manually after inspection.`);
}

// ════════════════════════════════ main ═════════════════════════════════════

const main = async () => {
  console.log("# BI CORRIDOR DRIVER — §5 pretest screen / §6 full verdict pipeline");
  console.log(`stage: ${STAGE} · model: ${MODEL} · state: ${STATE_PATH}` + (SMOKE ? " · SMOKE MODE" : ""));

  const state = loadState();
  if (!state.runConfig) {
    state.runConfig = captureRunConfig();
    saveState(state);
  }
  console.log(`run config: ${JSON.stringify(state.runConfig)}\n`);

  if (SMOKE) {
    await runSmoke(state);
    return;
  }

  if (STAGE === "pretest") {
    await runPretestStage(state);
  } else {
    await runProbeStage(state);
  }
};

main().catch((e) => {
  console.error("FAILED:", e?.stack ?? e?.message ?? e);
  process.exit(1);
});
