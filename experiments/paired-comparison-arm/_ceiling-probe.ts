/**
 * THE PRE-ROUND INSTRUMENT-HEALTH PROBE (Phase 14 — Instrument build, Plan
 * 14-04, REQ-68; `PAIRED-DESIGN-PREREG.md` rev 2 §6 Clause 1's own
 * pre-round build-gate obligation, PD-4). Answers one question before any
 * inference budget is spent on the real 60-unit battery: can this
 * instrument's extraction contract be satisfied at all against the real
 * inference slot? A format or extraction confound caught here costs one
 * short probe; caught after the round it costs the whole battery, which
 * §4's no-redraw rule forbids ever re-drawing.
 *
 * A SINGLE NEUTRAL DIAGNOSTIC ARM — not W, not B, neither of which exists
 * at this point in the phase (14-05 has not run). The probe's own system
 * prompt states only the output contract and the two published
 * vocabularies (`buildProbePrompt` below); it is never `_paired-arms.ts`'s
 * `buildPairedTaskPrompt`, which is the real round's own arm-slot prompt.
 *
 * TWO MODES, both run for every probe ticket:
 *   - `answer-visible` — shown its own resolution verbatim, asked only to
 *     restate it under the three labels. Isolates whether the FORMAT
 *     contract is satisfiable from whether the model knows the answer.
 *     Its scoreable count is what this probe's own floor gates on.
 *   - `normal` — sees only the ticket. Recorded and reported as an
 *     UNQUALIFIED difficulty reading, no pass/fail attached — a difficulty
 *     number this early would be a corridor requirement wearing a
 *     different name, which this design bars at the root (D-05).
 *
 * DRAWS FROM THE PROBE SEED ONLY (`CEILING_PROBE_SEED`, 1399) — never from
 * the paired battery's own six seeds (1301-1306): the answer-visible mode
 * shows a resolution verbatim, and §4's no-redraw rule forbids a pairing
 * unit ever being re-drawn once seen.
 *
 * CHECKPOINT CORE REUSED, NEVER RE-IMPLEMENTED. `loadState`/`saveState`/
 * `once`/`pairingUnitId` are imported UNCHANGED from `_paired-arms.ts` —
 * this file writes no parallel state-persistence logic of its own. Those
 * functions are typed against `PairedState`/`PairedArmResult`, whose `arm`
 * field is `PairedArmSlot` ("W" | "B") — a type this probe has no real use
 * for (there is no W or B arm yet, PD-4). Every persisted unit below sets
 * `arm: "W"` as a FIXED, VESTIGIAL placeholder satisfying that type only —
 * it is never read for its own meaning anywhere in this file, and it never
 * varies with `mode` (a fixed dummy is less likely to be misread as
 * meaningful arm data than one that happened to track `mode`). The REAL
 * discriminator is the checkpoint KEY itself, `${mode}:${unitId}`
 * (`probeUnitKey` below) — so `ceiling-probe-state.json`'s own keys read
 * `answer-visible:`/`normal:`, never `W:`/`B:`, which would misleadingly
 * imply a study arm ran before the round, exactly what PD-4 denies.
 *
 * STRICTLY SEQUENTIAL — one request in flight at a time, no concurrency
 * knob anywhere in this file (unlike `_dualfix-study.ts`, which rejects a
 * non-1 override at startup, this file never offers the knob at all: there
 * is one local inference slot, and the plain sequential loop below is the
 * only execution shape that exists here).
 *
 * MUST be launched through `_launch-probe.sh` — the sole sanctioned
 * detached launcher for this experiment directory — never a bare
 * backgrounded `nohup ... &`:
 *
 *   bash _launch-probe.sh _ceiling-probe.ts ceiling-probe-state.json ceiling-probe.log
 *
 * TESTABILITY: the required-env-var throw (`TOURNEY_STATE`) and every
 * `ollama`/network call live INSIDE `main()`, which only runs behind the
 * `import.meta.url === file://process.argv[1]` guard at the bottom — this
 * module is import-safe for `test/paired-ceiling-probe.test.ts`, which
 * drives every exported function directly against a stub `Provider`.
 */
import { execSync } from "node:child_process";
import { renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateCustomerSupportTicket,
  CUSTOMER_SUPPORT_ACTIONS,
  CUSTOMER_SUPPORT_CATEGORIES,
  RESOLUTION_FIELD_LABELS,
  type CustomerSupportTicket,
} from "../../src/foundry/customer-support-warehouse.js";
import {
  classifyCustomerSupportResponse,
  type CustomerSupportOracleCategory,
} from "../../src/foundry/customer-support-oracle.js";
import {
  loadState,
  saveState,
  once,
  pairingUnitId,
  type PairedState,
  type PairedArmResult,
} from "./_paired-arms.js";
import {
  CEILING_PROBE_SEED,
  CEILING_PROBE_TASK_COUNT,
  CEILING_PROBE_SCOREABLE_FLOOR,
  PAIRED_MODEL,
  PAIRED_TIMEOUT_MS,
  PAIRED_MAX_PROMPT_CHARS,
} from "./_paired-constants.js";
import { createProvider, type Provider } from "../../src/foundry/provider.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CEILING_PROBE_BASE_URL = "http://localhost:11434/v1";

// ── model/shape/artifact-path resolution (Plan 15-06, REQ-72) — ONE
// resolution point, called once near `main()`'s entry; everything
// downstream consumes the resolved values as explicit arguments, never
// re-reading `process.env` itself. Pure over the `env` argument (defaults
// to `process.env`), so a test can resolve against a plain object with
// zero global state — mirrors `_calibration-dryrun.ts`'s own
// `CALIBRATION_MODEL`/`CALIBRATION_VERDICT_FILE` env-seam precedent, the
// established convention for this directory's detached scripts. ─────────

export interface CeilingProbeRunOptions {
  /** Executor model — defaults to the rev-2 pinned `PAIRED_MODEL`. */
  model?: string;
  /** Verdict artifact filename — defaults to today's literal
   *  `ceiling-probe-verdict.json`. */
  verdictFile?: string;
  /** Probe seed — defaults to `CEILING_PROBE_SEED`. */
  seed?: number;
  /** Tasks per probe run — defaults to `CEILING_PROBE_TASK_COUNT`. */
  taskCount?: number;
  /** Answer-visible scoreable-count pass floor — defaults to
   *  `CEILING_PROBE_SCOREABLE_FLOOR`. */
  scoreableFloor?: number;
}

export function resolveCeilingProbeRunOptions(env: NodeJS.ProcessEnv = process.env): Required<CeilingProbeRunOptions> {
  return {
    model: env.PAIRED_PROBE_MODEL || PAIRED_MODEL,
    verdictFile: env.PAIRED_PROBE_VERDICT_FILE || "ceiling-probe-verdict.json",
    seed: env.PAIRED_PROBE_SEED ? Number(env.PAIRED_PROBE_SEED) : CEILING_PROBE_SEED,
    taskCount: env.PAIRED_PROBE_TASK_COUNT ? Number(env.PAIRED_PROBE_TASK_COUNT) : CEILING_PROBE_TASK_COUNT,
    scoreableFloor: env.PAIRED_PROBE_SCOREABLE_FLOOR ? Number(env.PAIRED_PROBE_SCOREABLE_FLOOR) : CEILING_PROBE_SCOREABLE_FLOOR,
  };
}

/** The digest lookup, extracted as a pure function of the resolved model
 *  and an `ollama list` transcript — so a test can pin "the digest is
 *  looked up for the RESOLVED model, not the default one" (T-15-24)
 *  offline, without a real `ollama` call. */
export function findModelDigestLine(model: string, ollamaListOutput: string): string {
  const line = ollamaListOutput.split("\n").find((l) => l.startsWith(model) || l.startsWith(model.replace(/:latest$/, "")));
  return line ?? `<not found in 'ollama list': ${model}>`;
}

// ── the two probe modes ─────────────────────────────────────────────────

export const PROBE_MODES = Object.freeze(["answer-visible", "normal"] as const);
export type ProbeMode = (typeof PROBE_MODES)[number];

/** `${mode}:${unitId}` — the checkpoint key's own mode discriminator (see
 *  the file doc comment above on why this, not the vestigial `arm` field,
 *  is what a reader should trust). */
export function probeUnitKey(mode: ProbeMode, unitId: string): string {
  return `${mode}:${unitId}`;
}

// ── prompt construction — the probe's own minimal instruction, never
// `_paired-arms.ts`'s `buildPairedTaskPrompt` ───────────────────────────

export const CEILING_PROBE_TRUNCATION_MARKER = "\n…[ceiling-probe prompt truncated at PAIRED_MAX_PROMPT_CHARS]";

/** Cuts `text` to `PAIRED_MAX_PROMPT_CHARS`, appending a visible marker —
 *  never a silent cut. `_paired-arms.ts`'s own truncation helper is not
 *  exported, so this is written fresh, applying the same pinned bound both
 *  modes below are truncated against — what clears here is what the real
 *  round will run under. */
function truncateProbePrompt(text: string): string {
  if (text.length <= PAIRED_MAX_PROMPT_CHARS) return text;
  const budget = PAIRED_MAX_PROMPT_CHARS - CEILING_PROBE_TRUNCATION_MARKER.length;
  return text.slice(0, Math.max(budget, 0)) + CEILING_PROBE_TRUNCATION_MARKER;
}

/**
 * The probe's own system prompt: the three-label output contract plus both
 * closed vocabularies, shown verbatim — the same contract the real round
 * imposes, stated independently of either arm's own agent definition
 * (neither exists yet). `answer-visible` shows the resolution verbatim in
 * the USER message and asks only for the restatement; `normal` shows only
 * the ticket.
 */
export function buildProbePrompt(ticket: CustomerSupportTicket, mode: ProbeMode): { system: string; user: string } {
  const system =
    "You are a diagnostic instrument-health check for a customer-support ticket triage task. Respond with EXACTLY " +
    "three labelled lines, one per line, in this form and no other text: " +
    RESOLUTION_FIELD_LABELS.map((label) => `${label}: <value>`).join(", ") +
    `. Allowed "action" values: ${CUSTOMER_SUPPORT_ACTIONS.join(", ")}. Allowed "category" values: ` +
    `${CUSTOMER_SUPPORT_CATEGORIES.join(", ")}.`;

  const user =
    mode === "answer-visible"
      ? truncateProbePrompt(
          `The correct resolution for this support ticket is: action: ${ticket.resolution.action}; ` +
            `category: ${ticket.resolution.category}; parameter: ${ticket.resolution.parameter}. Restate this exact ` +
            `resolution using EXACTLY the three labelled lines described above — no other text.`,
        )
      : truncateProbePrompt(`Ticket:\n${ticket.ticketText}`);

  return { system, user };
}

// ── running one probe unit ──────────────────────────────────────────────

export interface RunProbeUnitOptions {
  taskTimeoutMs?: number;
  /** The executor model for this call. Omitted resolves to the rev-2
   *  pinned `PAIRED_MODEL` — every existing caller that never sets this
   *  field keeps rev-2 behaviour byte-for-byte (Plan 15-06, REQ-72). */
  model?: string;
}

/**
 * Runs ONE mode on ONE probe ticket: builds this file's own prompt (never
 * `buildPairedTaskPrompt`), passes the resolved model explicitly (the
 * `model` option if given, else the rev-2 pinned `PAIRED_MODEL`), truncates
 * at the pinned character bound, then scores the raw response through the
 * SAME independent oracle the real round uses — `classifyCustomerSupportResponse`
 * is the sole scoring entry point, imported, never re-implemented.
 */
export async function runProbeUnit(
  ticket: CustomerSupportTicket,
  unitId: string,
  mode: ProbeMode,
  provider: Provider,
  opts: RunProbeUnitOptions = {},
): Promise<PairedArmResult> {
  const taskTimeoutMs = opts.taskTimeoutMs ?? PAIRED_TIMEOUT_MS;
  const model = opts.model ?? PAIRED_MODEL;
  const { system, user } = buildProbePrompt(ticket, mode);

  const startedAt = Date.now();
  let status: PairedArmResult["status"] = "ok";
  let failureReason: string | undefined;
  let rawText = "";
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const timer = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`task timeout after ${taskTimeoutMs}ms`)), taskTimeoutMs).unref(),
    );
    const attempt = provider.chat({ model, system, messages: [{ role: "user", content: user }] });
    // See `_dualfix-arms.ts` WR-08 / `_paired-arms.ts`: a late-rejecting
    // `attempt` after the timer already won the race must not surface as an
    // unhandled rejection — attach a no-op catch purely to mark it handled.
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

  const result = classifyCustomerSupportResponse(rawText, ticket.resolution);

  return {
    // Vestigial type-compat field only — see the file doc comment. Fixed,
    // never varies with `mode`; never read back anywhere in this file.
    arm: "W",
    unitId,
    status,
    ...(failureReason ? { failureReason } : {}),
    rawText,
    oracleCategory: result.category,
    score: result.score,
    inputTokens,
    outputTokens,
    wallMs: Date.now() - startedAt,
  };
}

// ── the harness-fault retry, driver-local (mirrors `_dualfix-study.ts`'s
// own `onceWithHarnessRetry`, wrapping the imported, unchanged `once`) ───

/** A `status === "error"` result is retried at MOST once, logged into
 *  `state.retries`, and never appended as a second entry — the checkpoint
 *  map still holds exactly one result per key. A `timeout` is a
 *  measurement, never retried (§6's harness-fault carve-out distinguishes a
 *  harness fault from either outcome). */
export async function onceWithHarnessRetry(
  statePath: string,
  state: PairedState,
  key: string,
  work: () => Promise<PairedArmResult>,
): Promise<PairedArmResult> {
  return once(statePath, state, key, async () => {
    let result = await work();
    if (result.status === "error") {
      state.retries.push(`${key}: harness-fault retry (${result.failureReason ?? "unknown error"})`);
      result = await work();
    }
    return result;
  });
}

// ── the deterministic, total, resumable unit order ──────────────────────

export interface ProbeOrderedUnit {
  taskIndex: number;
  mode: ProbeMode;
  unitId: string;
  key: string;
}

export interface ProbeUnitOrderOptions {
  seed?: number;
  taskCount?: number;
}

/** Task index 0..N-1, `answer-visible` then `normal` within each task index
 *  — never a sort by content, so array position IS the tie-break. Seed and
 *  task count resolve from `opts` first and the rev-2 pinned constants
 *  second — an existing caller that passes nothing gets exactly today's
 *  behaviour (Plan 15-06, REQ-72). */
export function buildProbeUnitOrder(opts: ProbeUnitOrderOptions = {}): ProbeOrderedUnit[] {
  const seed = opts.seed ?? CEILING_PROBE_SEED;
  const taskCount = opts.taskCount ?? CEILING_PROBE_TASK_COUNT;
  const order: ProbeOrderedUnit[] = [];
  for (let taskIndex = 0; taskIndex < taskCount; taskIndex++) {
    const unitId = pairingUnitId(seed, taskIndex);
    for (const mode of PROBE_MODES) {
      order.push({ taskIndex, mode, unitId, key: probeUnitKey(mode, unitId) });
    }
  }
  return order;
}

/** The main iteration loop, factored out so a test can drive it with a stub
 *  `runUnit` and assert call order/resume behaviour without a provider.
 *  `opts` threads the same seed/task-count shape through to
 *  `buildProbeUnitOrder` and ticket generation — resolved once, never
 *  re-read from a module-level mutable. */
export async function runProbeUnits(
  statePath: string,
  state: PairedState,
  runUnit: (ticket: CustomerSupportTicket, unitId: string, mode: ProbeMode) => Promise<PairedArmResult>,
  opts: ProbeUnitOrderOptions = {},
): Promise<void> {
  const seed = opts.seed ?? CEILING_PROBE_SEED;
  for (const { taskIndex, mode, unitId, key } of buildProbeUnitOrder(opts)) {
    const ticket = generateCustomerSupportTicket(seed, taskIndex);
    await onceWithHarnessRetry(statePath, state, key, () => runUnit(ticket, unitId, mode));
  }
}

// ── per-mode accounting — the mode is read from the CHECKPOINT KEY'S own
// prefix, never from the vestigial `arm` field ──────────────────────────

export interface ProbeModeAccounting {
  mode: ProbeMode;
  attempted: number;
  byCategory: Record<CustomerSupportOracleCategory, number>;
  /** resolution-mismatch + resolution-match — what the answer-visible
   *  mode's own floor gates on. */
  scoreable: number;
  /** resolution-match only. */
  matched: number;
}

export function computeProbeModeAccounting(units: Record<string, PairedArmResult>, mode: ProbeMode): ProbeModeAccounting {
  const prefix = `${mode}:`;
  const results = Object.entries(units)
    .filter(([key]) => key.startsWith(prefix))
    .map(([, result]) => result);
  const byCategory: Record<CustomerSupportOracleCategory, number> = {
    "no-artifact": 0,
    "non-scoreable": 0,
    "resolution-mismatch": 0,
    "resolution-match": 0,
  };
  for (const r of results) byCategory[r.oracleCategory]++;
  const scoreable = byCategory["resolution-mismatch"] + byCategory["resolution-match"];
  return { mode, attempted: results.length, byCategory, scoreable, matched: byCategory["resolution-match"] };
}

/** The pass decision: a plain integer comparison, never a rate or a
 *  float — answer-visible mode's own scoreable count against the pinned
 *  floor. */
export function evaluateProbePass(answerVisibleScoreable: number, floor: number): boolean {
  return answerVisibleScoreable >= floor;
}

// ══════════════════════════════════ main ════════════════════════════════

function requireStatePath(): string {
  const v = process.env.TOURNEY_STATE;
  if (!v) throw new Error("TOURNEY_STATE must be set explicitly (no default state path)");
  return v;
}

function safeExec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch (e) {
    return `<unavailable: ${e instanceof Error ? e.message : String(e)}>`;
  }
}

/** Properties of the EXECUTED run, captured at run time, never pinned as a
 *  design constant — mirrors `_dualfix-study.ts`'s `captureRunConfig`. Takes
 *  the RESOLVED run options — the digest lookup below must look up the
 *  resolved model, never the default one (T-15-24), so this is never called
 *  with a bare default. */
function captureRunConfig(resolved: Required<CeilingProbeRunOptions>): Record<string, unknown> {
  const ollamaVersion = safeExec("ollama --version");
  const modelDigestLine = findModelDigestLine(resolved.model, safeExec("ollama list"));
  return {
    model: resolved.model,
    modelDigestLine,
    ollamaVersion,
    samplerParams: "none sent (no temperature, no max_tokens override — provider/server default applies)",
    timeoutMs: PAIRED_TIMEOUT_MS,
    promptBoundChars: PAIRED_MAX_PROMPT_CHARS,
    seed: resolved.seed,
    taskCount: resolved.taskCount,
    clientConcurrency: 1,
    startedAt: new Date().toISOString(),
    taskOrder: "task index 0..N-1, answer-visible mode then normal mode within each task index — deterministic, total, stable",
  };
}

/** Small, human-readable artifact — always written beside this script,
 *  atomically (tmp + rename). */
function writeArtifact(filename: string, data: unknown): void {
  const p = join(SCRIPT_DIR, filename);
  writeFileSync(`${p}.tmp`, JSON.stringify(data, null, 2));
  renameSync(`${p}.tmp`, p);
}

async function main(): Promise<void> {
  const statePath = requireStatePath();
  const resolved = resolveCeilingProbeRunOptions();
  console.log(
    `# CEILING PROBE — state: ${statePath} · model: ${resolved.model} · seed: ${resolved.seed} · ` +
      `tasks: ${resolved.taskCount} · scoreable floor: ${resolved.scoreableFloor} · verdict: ${resolved.verdictFile}`,
  );

  const state = loadState(statePath);
  if (!state.runConfig) {
    state.runConfig = captureRunConfig(resolved);
    saveState(statePath, state);
  }
  console.log(`run config: ${JSON.stringify(state.runConfig)}\n`);

  const provider = createProvider({ kind: "openai", baseUrl: CEILING_PROBE_BASE_URL });
  const runUnit = (ticket: CustomerSupportTicket, unitId: string, mode: ProbeMode) =>
    runProbeUnit(ticket, unitId, mode, provider, { taskTimeoutMs: PAIRED_TIMEOUT_MS, model: resolved.model });

  await runProbeUnits(statePath, state, runUnit, { seed: resolved.seed, taskCount: resolved.taskCount });

  const answerVisible = computeProbeModeAccounting(state.units, "answer-visible");
  const normal = computeProbeModeAccounting(state.units, "normal");
  const pass = evaluateProbePass(answerVisible.scoreable, resolved.scoreableFloor);

  // Written ONLY here — after the full deterministic unit order is
  // exhausted. Nothing else in this file, or in the phase, may treat the
  // probe as finished on any other signal (never wall-clock, never a log
  // tail).
  writeArtifact(resolved.verdictFile, {
    complete: true,
    pass,
    seed: resolved.seed,
    taskCount: resolved.taskCount,
    scoreableFloor: resolved.scoreableFloor,
    accounting: { answerVisible, normal },
    retries: state.retries,
    runConfig: state.runConfig,
  });
  console.log(
    `\n=> CEILING PROBE: ${pass ? "PASS" : "FAIL"} (answer-visible scoreable ` +
      `${answerVisible.scoreable} vs floor ${resolved.scoreableFloor}; normal-mode matched ` +
      `${normal.matched}/${normal.attempted}, an unqualified reading, no pass/fail attached)`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error("FAILED:", e?.stack ?? e?.message ?? e);
    process.exit(1);
  });
}
