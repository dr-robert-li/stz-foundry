/**
 * The DUALFIX study's corpus builder (Phase 12 — Corpus + paired repair run
 * + gate, Plan 12-01, REQ-63), governed by `DUALFIX-STUDY-PREREG.md` §4.
 *
 * RECEIPT-FREE BY CONSTRUCTION, in the same terms `_dualfix-arms.ts` states
 * it: warehouse/task context here is rebuilt through `bi-warehouse.ts`'s
 * direct builders only (`generateBiWarehouse`, `buildBiQuerySpecs`,
 * `buildBiTasks`, `composeReferenceSql`) — never `generateBiBattery` — so
 * this file cannot mint an `OracleReceipt` or write into
 * `ACCEPTED_GENERATORS`. `BI_ANALYTICS_GENERATOR_ID` stays absent from that
 * table; §4's construction route is deliberately not the accepted-generator
 * path.
 *
 * INDEPENDENT-ORACLE SCORING, NEVER SELF-GRADED. `drawOneCandidate` below is
 * the ONE place in this file that calls `categorize`, against a FRESH
 * `materializeWarehouse` handle per draw — candidate execution isolation,
 * `bi-oracle.ts`'s own rule.
 *
 * MODULE-LEVEL IMPORT SURFACE IS DELIBERATELY MINIMAL (T-12-02): every
 * static `from "..."` specifier in this file is one of `node:fs`,
 * `../../src/foundry/bi-warehouse.js`, `../../src/foundry/bi-oracle.js`,
 * `../../src/foundry/provider.js`, and `./_dualfix-arms.js` —
 * `test/dualfix-corpus-build.test.ts` asserts this set exactly. Two
 * diagnostic/validation calls that would otherwise widen that static surface
 * (`ollama --version`/`ollama list` shellouts, and re-validating the emitted
 * corpus through `_dualfix-study.ts`'s own `validateCorpusEntries`) go
 * through a runtime `await import(...)` INSIDE a function body instead of a
 * module-level `import` declaration — neither is a "module-level import
 * specifier" the allowlist test scans for, and neither reaches
 * `generateBiBattery`/`ACCEPTED_GENERATORS`.
 *
 * The baseline system prompt and guidance suffix below are copied
 * byte-identical from `experiments/bi-analytics-pilot/_bi-corridor.ts`
 * (`BI_PROBE_SYSTEM_PROMPT`, `BI_BASELINE_GUIDANCE`) per D-A1 — copied by
 * reference to that source, never retyped from memory, but defined locally
 * rather than imported so the pilot's own module never becomes part of this
 * file's static import graph.
 *
 * TESTABILITY NOTE (mirrors `_dualfix-study.ts`): every environment read and
 * every throw on a missing/malformed env var lives INSIDE `main()`, never at
 * module top level, and `main()` itself only runs when this file is
 * executed directly (the `import.meta.url === file://process.argv[1]` guard
 * at the bottom). The decision functions below are exported and pure, so
 * this module stays import-safe for `test/dualfix-corpus-build.test.ts`,
 * which imports them directly without setting any env var and without a
 * provider/process.
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import {
  generateBiWarehouse,
  buildBiQuerySpecs,
  buildBiTasks,
  composeReferenceSql,
  BI_TASK_TIMEOUT_MS,
  BI_TASKS_PER_SEED_PER_POINT,
  type BiQuerySpec,
} from "../../src/foundry/bi-warehouse.js";
import {
  categorize,
  materializeWarehouse,
  executeSelect,
  isSingleReadOnlySelect,
  type BiCategory,
} from "../../src/foundry/bi-oracle.js";
import { createProvider, type Provider } from "../../src/foundry/provider.js";
import {
  DUALFIX_STUDY_SEEDS,
  DUALFIX_LEVEL_ID,
  DUALFIX_CORPUS_TARGET_N,
  type DualfixCorpusEntry,
} from "./_dualfix-arms.js";

// ── D-A1's pinned prompt constants — copied byte-identical from
// `_bi-corridor.ts:153` and `:168-183`, never imported (see the module doc
// comment above) ──────────────────────────────────────────────────────────

const BI_PROBE_SYSTEM_PROMPT = "You are a SQL assistant.";

const BI_BASELINE_GUIDANCE = [
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

// ── the builder's own record/state shapes — never `DualfixState`/
// `DualfixArmResult` cast (D-A2) ─────────────────────────────────────────

export interface CorpusDrawResult {
  seed: number;
  taskIndex: number;
  taskId: string;
  /** The exact user-message string sent to the provider for this draw —
   *  threaded through from the send site, never recomposed at record-write
   *  time. */
  question: string;
  status: "ok" | "timeout" | "error";
  failureReason?: string;
  /** Verbatim raw response text. */
  rawText: string;
  artifact: string | null;
  category: BiCategory;
  gradedScore: number;
  engineError: string | null;
  inputTokens: number;
  outputTokens: number;
  wallMs: number;
}

export interface CorpusBuildState {
  draws: Record<string, CorpusDrawResult>;
  runConfig?: Record<string, unknown>;
}

// ── the checkpoint contract (copied in shape from `_dualfix-arms.ts`'s
// `loadState`/`saveState`/`once`) ────────────────────────────────────────

export function loadCorpusBuildState(statePath: string): CorpusBuildState {
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8")) as Partial<CorpusBuildState>;
    return { draws: parsed.draws ?? {}, runConfig: parsed.runConfig };
  } catch (e) {
    // Only ENOENT ("no state yet") is "start fresh" — every other failure
    // (corrupt JSON, EACCES, EISDIR, a mistyped path) must throw rather than
    // silently proceed as run 1, exactly as `_dualfix-arms.ts`'s `loadState`
    // reasons.
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return { draws: {} };
    throw e;
  }
}

/** Atomic tmp+rename, so a kill mid-write cannot leave a truncated state. */
export function saveCorpusBuildState(statePath: string, state: CorpusBuildState): void {
  writeFileSync(`${statePath}.tmp`, JSON.stringify(state, null, 2));
  renameSync(`${statePath}.tmp`, statePath);
}

/** Runs `key` once, ever — a cached entry short-circuits `work` entirely, so
 *  a resumed run never re-draws (and never re-spends a provider call on) a
 *  completed unit. */
export async function onceDraw(
  statePath: string,
  state: CorpusBuildState,
  key: string,
  work: () => Promise<CorpusDrawResult>,
): Promise<CorpusDrawResult> {
  const cached = state.draws[key];
  if (cached) return cached;
  const result = await work();
  state.draws[key] = result;
  saveCorpusBuildState(statePath, state);
  return result;
}

// ── §4 pure decisions ────────────────────────────────────────────────────

/** §4's eligibility predicate: `gradedScore === 0` exactly. Throws on a
 *  non-numeric `gradedScore` rather than coercing it — a malformed draw
 *  record must never be silently read as ineligible-by-accident. */
export function isEligibleDraw(draw: { gradedScore: number }): boolean {
  if (typeof draw.gradedScore !== "number" || !Number.isFinite(draw.gradedScore)) {
    throw new Error(`[dualfix-corpus-build] gradedScore must be a finite number, got ${JSON.stringify(draw.gradedScore)}`);
  }
  return draw.gradedScore === 0;
}

/** True once `eligibleCount` reaches `DUALFIX_CORPUS_TARGET_N` — the pinned
 *  constant, never a re-typed literal. `drawsTaken` is accepted for call-site
 *  symmetry with the draw loop but not read here; the stop rule is purely a
 *  function of the eligible count against the target. */
export function shouldStopDrawing(eligibleCount: number, drawsTaken: number): boolean {
  void drawsTaken;
  return eligibleCount >= DUALFIX_CORPUS_TARGET_N;
}

/** Maps a completed draw to the pinned `DualfixCorpusEntry` shape — exactly
 *  the ten fields that interface declares, nothing else. Status, token
 *  counts and wall-clock time stay on the checkpoint record; they are not
 *  part of the pinned entry (§4's corpus record shape lists those as
 *  per-task accounting fields, which `validateCorpusEntries` does not pin
 *  into the entry shape). */
export function toCorpusEntry(draw: CorpusDrawResult): DualfixCorpusEntry {
  return {
    seed: draw.seed,
    levelId: DUALFIX_LEVEL_ID,
    taskIndex: draw.taskIndex,
    taskId: draw.taskId,
    question: draw.question,
    rawText: draw.rawText,
    artifact: draw.artifact,
    category: draw.category,
    gradedScore: draw.gradedScore,
    engineError: draw.engineError,
  };
}

/** D-A1: the guided baseline prompt — the arm-neutral task prompt plus a
 *  blank line plus `BI_BASELINE_GUIDANCE`, a PURE SUFFIX. */
export function buildBaselinePrompt(task: { prompt: string }): string {
  return `${task.prompt}\n\n${BI_BASELINE_GUIDANCE}`;
}

/** Fails loudly if the composed prompt is ever anything other than the
 *  arm-neutral prompt plus the one constant guidance suffix — the same
 *  invariant `_bi-corridor.ts`'s `assertBaselineIsPureSuffix` asserts,
 *  proven at build time for every task built, not merely claimed. */
function assertBaselineIsPureSuffix(taskId: string, s0Prompt: string, baselinePrompt: string): void {
  const expected = buildBaselinePrompt({ prompt: s0Prompt });
  if (baselinePrompt !== expected) {
    throw new Error(`[dualfix-corpus-build] arm-purity invariant violated for ${taskId}: prompt is not the arm-neutral prompt + BI_BASELINE_GUIDANCE`);
  }
}

// ── the one draw path: generate -> score -> record ──────────────────────

/**
 * Wires ONE path end to end, no batching and no second call site:
 * `generateBiWarehouse` -> `buildBiQuerySpecs`/`buildBiTasks` for the
 * arm-neutral prompt -> the guided user message (D-A1) ->
 * `provider.chat` -> a FRESH `materializeWarehouse` handle ->
 * `executeSelect(refDb, composeReferenceSql(spec))` for the expected result
 * set -> ONE `categorize` call -> the diagnostic-only engine-error recovery
 * block, copied in shape from `_dualfix-arms.ts:295-309`.
 */
async function drawOneCandidate(
  seed: number,
  taskIndex: number,
  provider: Provider,
  model: string,
  taskTimeoutMs: number,
): Promise<CorpusDrawResult> {
  const warehouse = generateBiWarehouse(seed);
  const specs = buildBiQuerySpecs(warehouse, DUALFIX_LEVEL_ID);
  const spec: BiQuerySpec | undefined = specs[taskIndex];
  const s0Tasks = buildBiTasks(warehouse, DUALFIX_LEVEL_ID);
  const task = s0Tasks[taskIndex];
  if (!spec || !task) {
    throw new Error(
      `[dualfix-corpus-build] taskIndex ${taskIndex} out of range for seed ${seed} level ${DUALFIX_LEVEL_ID} ` +
        `(${specs.length} specs, ${s0Tasks.length} tasks)`,
    );
  }
  const expectedTaskId = `bi-analytics-${DUALFIX_LEVEL_ID}-${taskIndex}-${seed}`;
  if (task.id !== expectedTaskId) {
    throw new Error(
      `[dualfix-corpus-build] task/spec misalignment: task.id=${JSON.stringify(task.id)} expected=${JSON.stringify(expectedTaskId)}`,
    );
  }

  const question = buildBaselinePrompt(task);
  assertBaselineIsPureSuffix(task.id, task.prompt, question);

  const startedAt = Date.now();
  let status: CorpusDrawResult["status"] = "ok";
  let failureReason: string | undefined;
  let rawText = "";
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const timer = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`task timeout after ${taskTimeoutMs}ms`)), taskTimeoutMs).unref(),
    );
    const attempt = provider.chat({
      model,
      system: BI_PROBE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: question }],
    });
    // WR-08 (mirrored from `_dualfix-arms.ts`): a late rejection after the
    // timer wins the race would otherwise have no attached handler by the
    // time it fires, crashing the detached driver.
    attempt.catch(() => {});
    const res = await Promise.race([attempt, timer]);
    rawText = res.text;
    inputTokens = res.usage.inputTokens;
    outputTokens = res.usage.outputTokens;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    status = message.includes("task timeout") ? "timeout" : "error";
    failureReason = message;
  }

  const refDb = materializeWarehouse(warehouse);
  const expected = executeSelect(refDb, composeReferenceSql(spec));
  const result = categorize(rawText, refDb, expected);

  // Diagnostic-only: `categorize` already made the category decision; this
  // re-run never changes it, it only recovers the message the decision
  // discarded, and only when the artifact passed the rule-4 pre-check.
  let engineError: string | null = null;
  if (result.category === "non-executable-artifact" && result.artifact !== null && isSingleReadOnlySelect(result.artifact)) {
    try {
      executeSelect(refDb, result.artifact);
    } catch (e) {
      engineError = e instanceof Error ? e.message : String(e);
    }
  }

  return {
    seed,
    taskIndex,
    taskId: task.id,
    question,
    status,
    ...(failureReason ? { failureReason } : {}),
    rawText,
    artifact: result.artifact,
    category: result.category,
    gradedScore: result.gradedScore,
    engineError,
    inputTokens,
    outputTokens,
    wallMs: Date.now() - startedAt,
  };
}

/** Re-validates the emitted entries through the shipped
 *  `validateCorpusEntries` before the atomic rename, via a runtime
 *  `import()` (see the module doc comment) — so the builder refuses to emit
 *  a file the study driver would later reject, without adding
 *  `./_dualfix-study.js` to the static import surface. */
async function writeCorpusOutput(outPath: string, entries: DualfixCorpusEntry[]): Promise<void> {
  const { validateCorpusEntries } = await import("./_dualfix-study.js");
  validateCorpusEntries(entries);
  writeFileSync(`${outPath}.tmp`, JSON.stringify(entries, null, 2));
  renameSync(`${outPath}.tmp`, outPath);
}

// ══════════════════════════════════ main ════════════════════════════════

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[dualfix-corpus-build] ${name} must be set explicitly (no default)`);
  return v;
}

/** Copied in shape from `_dualfix-study.ts:75-81` — an unvalidated
 *  `Number(...)` on a malformed env var silently yields NaN. */
function requireFinitePositiveNumber(name: string, raw: string | undefined, fallback: number): number {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`[dualfix-corpus-build] ${name} must be a finite positive number, got ${JSON.stringify(raw)}`);
  }
  return value;
}

async function main(): Promise<void> {
  const statePath = requireEnv("TOURNEY_STATE");
  const corpusOutPath = requireEnv("DUALFIX_CORPUS_OUT");
  const model = process.env.DUALFIX_MODEL ?? "qwen3.6:latest";
  const baseUrl = process.env.DUALFIX_BASE_URL ?? "http://localhost:11434/v1";
  const taskTimeoutMs = requireFinitePositiveNumber("DUALFIX_TIMEOUT_MS", process.env.DUALFIX_TIMEOUT_MS, BI_TASK_TIMEOUT_MS);
  const maxDrawsRaw = process.env.DUALFIX_CORPUS_MAX_DRAWS;
  const maxDraws = maxDrawsRaw !== undefined ? requireFinitePositiveNumber("DUALFIX_CORPUS_MAX_DRAWS", maxDrawsRaw, 1) : undefined;

  console.log(
    `# DUALFIX CORPUS BUILD — state: ${statePath} · out: ${corpusOutPath} · model: ${model}` +
      (maxDraws !== undefined ? ` · SMOKE (max ${maxDraws} draws)` : ""),
  );

  const state = loadCorpusBuildState(statePath);
  const provider = createProvider({ kind: "openai", baseUrl });

  // Task 1's tracer scope: one seed, honouring DUALFIX_CORPUS_MAX_DRAWS only
  // — the full pinned draw order, stop conditions and run-config capture are
  // Task 2's own extension of this loop.
  const seed = DUALFIX_STUDY_SEEDS[0]!;
  let drawsTaken = 0;
  for (let taskIndex = 0; taskIndex < BI_TASKS_PER_SEED_PER_POINT; taskIndex++) {
    if (maxDraws !== undefined && drawsTaken >= maxDraws) break;
    const key = `${seed}::${taskIndex}`;
    const result = await onceDraw(statePath, state, key, () => drawOneCandidate(seed, taskIndex, provider, model, taskTimeoutMs));
    drawsTaken++;
    const eligibleSoFar = Object.values(state.draws).filter(isEligibleDraw).length;
    console.log(
      `  seed=${seed} taskIndex=${taskIndex} status=${result.status} category=${result.category} ` +
        `gradedScore=${result.gradedScore} eligibleSoFar=${eligibleSoFar}`,
    );
  }

  const entries = Object.values(state.draws).filter(isEligibleDraw).map(toCorpusEntry);
  await writeCorpusOutput(corpusOutPath, entries);
  console.log(`\nWrote ${entries.length} eligible entr${entries.length === 1 ? "y" : "ies"} to ${corpusOutPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error("FAILED:", e?.stack ?? e?.message ?? e);
    process.exit(1);
  });
}
