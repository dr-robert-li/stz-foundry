/**
 * THE DETACHED DUALFIX PROPERTY-STUDY DRIVER (Phase 11 — Study prereg +
 * build, Plan 11-02, REQ-62's operational half), governed by
 * `DUALFIX-STUDY-PREREG.md`.
 *
 * Copied IN SHAPE from `../bi-analytics-pilot/_bi-corridor.ts` — the env
 * contract's throw-on-missing-`TOURNEY_STATE`, `SCRIPT_DIR` via
 * `fileURLToPath`, the atomic tmp+rename `loadState`/`saveState`/
 * `writeArtifact` trio, `safeExec`, `captureRunConfig`, `once()`'s
 * harness-fault retry path, and the `main()` structure. This file NEVER
 * imports `_bi-corridor.ts` — every one of those pieces is re-derived here
 * against the DUALFIX two-arm core instead.
 *
 * RECEIPT-FREE BY CONSTRUCTION (T-11-07): all warehouse/task context comes
 * from `_dualfix-arms.ts`'s direct-builder route (`generateBiWarehouse` /
 * `buildBiQuerySpecs` / `composeReferenceSql`, never `generateBiBattery`).
 * This driver has no import of the battery-generating entry point, so it
 * cannot mint an `OracleReceipt` or write into `ACCEPTED_GENERATORS`.
 *
 * MUST be launched through `_launch-probe.sh` — the sole sanctioned
 * detached launcher — never a bare backgrounded `nohup ... &`:
 *
 *   bash _launch-probe.sh _dualfix-study.ts dualfix-study-state.json dualfix-study.log
 *
 * (`DUALFIX_CORPUS` and any other env override must already be exported in
 * the launching shell — the launcher only sets `TOURNEY_STATE` itself,
 * exactly as `_bi-analytics-pilot/_launch-probe.sh` does for `BI_CORRIDOR_STAGE`.)
 *
 * TESTABILITY NOTE: unlike `_bi-corridor.ts`, the required-env-var throws
 * (`TOURNEY_STATE`, `DUALFIX_CORPUS`) live INSIDE `main()`, not at module
 * top level, and `main()` itself only runs when this file is executed
 * directly (the `import.meta.url === file://process.argv[1]` guard at the
 * bottom, precedented in `experiments/swebench-pilot/eval-adapter.mjs:296`).
 * The checkpoint/ordering/accounting/termination logic is factored into
 * exported pure functions below (`validateCorpusEntries`, `buildUnitOrder`,
 * `onceWithHarnessRetry`, `runStudyUnits`, `computeArmAccounting`,
 * `isUnderpowered`, `isErrorBudgetExceeded`) so this module stays
 * import-safe for `test/dualfix-study-driver.test.ts`, which imports them
 * directly without setting either env var and without a provider/process.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createProvider } from "../../src/foundry/provider.js";
import { buildDualfixRepairPrompt, type DualfixInput } from "../../src/foundry/dualfix.js";
import { BI_TASK_TIMEOUT_MS } from "../../src/foundry/bi-warehouse.js";
import {
  DUALFIX_ARMS,
  DUALFIX_CORPUS_MIN_N,
  DUALFIX_ERROR_BUDGET_NUM,
  DUALFIX_ERROR_BUDGET_DEN,
  dualfixUnitKey,
  loadState,
  saveState,
  once,
  runArmOnCandidate,
  buildNaiveRetryPrompt,
  type DualfixArm,
  type DualfixArmResult,
  type DualfixState,
  type DualfixCorpusEntry,
} from "./_dualfix-arms.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

const DUALFIX_MODEL = process.env.DUALFIX_MODEL ?? "qwen3.6:latest";
const DUALFIX_BASE_URL = process.env.DUALFIX_BASE_URL ?? "http://localhost:11434/v1";
const DUALFIX_TIMEOUT_MS = Number(process.env.DUALFIX_TIMEOUT_MS ?? BI_TASK_TIMEOUT_MS);
// Single Ollama inference slot — D-13's operational sibling.
const DUALFIX_CONCURRENCY = Number(process.env.DUALFIX_CONCURRENCY ?? 1);
// Honoured ONLY when "1" — the end-to-end smoke path; absent in the real run.
const DUALFIX_SMOKE = process.env.DUALFIX_SMOKE === "1";

// Explicit, never defaulted — an omitted state path once pointed a re-run at
// the wrong round's data (`_bi-corridor.ts`'s own stated reason).
function requireStatePath(): string {
  const v = process.env.TOURNEY_STATE;
  if (!v) throw new Error("TOURNEY_STATE must be set explicitly (no default state path)");
  return v;
}

// D-13: no default corpus path — Phase 11 ships no corpus, on purpose
// (RESEARCH Pitfall 3: keeps Phase 11 free of study data before the prereg
// freeze). Phase 12 builds the corpus file this reads.
function requireCorpusPath(): string {
  const v = process.env.DUALFIX_CORPUS;
  if (!v) {
    throw new Error(
      "DUALFIX_CORPUS must be set explicitly — Phase 11 ships no corpus file; Phase 12 builds it (D-13). No default path.",
    );
  }
  if (!existsSync(v)) {
    throw new Error(`DUALFIX_CORPUS file not found: ${v} — Phase 11 ships no corpus file; Phase 12 builds it (D-13).`);
  }
  return v;
}

/** Small, human-readable readout artifacts (run config / verdict) — always
 *  written beside this script, atomically (tmp + rename). */
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

// A dummy, refusal-free input used only to pull each arm's fixed `system`
// string out of its prompt builder — neither builder's `system` text depends
// on the input's content (dualfixMutate's refusal check runs on the
// category, never on the built system string).
const DUALFIX_SYSTEM_PROMPT_PROBE_INPUT: DualfixInput = {
  question: "",
  failedArtifact: null,
  failureCategory: "no-artifact",
  engineError: null,
};

/** Properties of the EXECUTED run, captured at run time, never pinned as a
 *  design constant — mirrors `_bi-corridor.ts:259-278`, extended with the
 *  corpus/arm/system-prompt fields this study needs. */
function captureRunConfig(corpusPath: string, corpusRaw: string, corpusEntryCount: number): Record<string, unknown> {
  const ollamaVersion = safeExec("ollama --version");
  const listLine = safeExec("ollama list")
    .split("\n")
    .find((l) => l.startsWith(DUALFIX_MODEL) || l.startsWith(DUALFIX_MODEL.replace(/:latest$/, "")));
  return {
    ollamaVersion,
    modelDigestLine: listLine ?? `<not found in 'ollama list': ${DUALFIX_MODEL}>`,
    samplerParams: "none sent (no temperature, no max_tokens override — provider/server default applies)",
    ollamaNumParallel: process.env.OLLAMA_NUM_PARALLEL ?? "<unset — server default>",
    clientConcurrency: DUALFIX_CONCURRENCY,
    taskTimeoutMs: DUALFIX_TIMEOUT_MS,
    corpusPath,
    corpusByteLength: Buffer.byteLength(corpusRaw, "utf8"),
    corpusEntryCount,
    arms: DUALFIX_ARMS,
    dualfixSystemPrompt: buildDualfixRepairPrompt(DUALFIX_SYSTEM_PROMPT_PROBE_INPUT).system,
    naiveRetrySystemPrompt: buildNaiveRetryPrompt(DUALFIX_SYSTEM_PROMPT_PROBE_INPUT).system,
    taskOrder:
      "corpus array order, then DUALFIX_ARMS order (dualfix, naive-retry) within each entry — " +
      "deterministic, total, and stable; the corpus array index breaks any tie",
  };
}

// ── corpus loading + validation (pure; exported for the offline test) ──────

const REQUIRED_CORPUS_SCALAR_FIELDS = [
  "seed",
  "levelId",
  "taskIndex",
  "taskId",
  "question",
  "rawText",
  "category",
  "gradedScore",
] as const;

/** Validates a parsed JSON value against `DualfixCorpusEntry`'s shape.
 *  Refuses loudly on a malformed record rather than skipping it (T-11-06) —
 *  a skipped entry would silently shrink D-12's denominator, which the
 *  prereg forbids. Pure — takes the already-parsed value, never touches the
 *  filesystem, so a test can exercise it against an in-memory array. */
export function validateCorpusEntries(raw: unknown): DualfixCorpusEntry[] {
  if (!Array.isArray(raw)) throw new Error(`[dualfix-study] DUALFIX_CORPUS must be a JSON array, got ${typeof raw}`);
  return raw.map((entry, i) => {
    if (typeof entry !== "object" || entry === null) throw new Error(`[dualfix-study] corpus entry ${i} is not an object`);
    const e = entry as Record<string, unknown>;
    for (const field of REQUIRED_CORPUS_SCALAR_FIELDS) {
      if (e[field] === undefined || e[field] === null) {
        throw new Error(`[dualfix-study] corpus entry ${i} missing required field "${field}"`);
      }
    }
    if (!("artifact" in e)) throw new Error(`[dualfix-study] corpus entry ${i} missing "artifact" (string or null)`);
    if (!("engineError" in e)) throw new Error(`[dualfix-study] corpus entry ${i} missing "engineError" (string or null)`);
    return e as unknown as DualfixCorpusEntry;
  });
}

/** Reads `DUALFIX_CORPUS` from disk, parses it, and validates it. */
export function loadCorpus(path: string): DualfixCorpusEntry[] {
  return validateCorpusEntries(JSON.parse(readFileSync(path, "utf8")));
}

// ── the deterministic, total, resumable unit order ──────────────────────
// Corpus array order, then DUALFIX_ARMS order within each entry — never a
// sort by any content field, so the array index IS the tie-break by
// construction (no two ordered units can compare equal on "everything but
// array position" without literally sharing that position).

export interface OrderedUnit {
  corpusIndex: number;
  arm: DualfixArm;
  taskId: string;
  unitKey: string;
}

export function buildUnitOrder(corpus: DualfixCorpusEntry[]): OrderedUnit[] {
  const order: OrderedUnit[] = [];
  corpus.forEach((entry, corpusIndex) => {
    for (const arm of DUALFIX_ARMS) {
      order.push({ corpusIndex, arm, taskId: entry.taskId, unitKey: dualfixUnitKey(arm, entry.taskId) });
    }
  });
  return order;
}

// ── D-08: the harness-fault retry, distinct from the naive-retry CONTROL
// ARM. `state.retries` (the harness-fault ledger) and `dualfixUnitKey`'s
// `"naive-retry"` arm literal (the control arm's identifier) are two
// different fields/identifiers by construction — a harness retry NEVER
// writes into `state.units` under a second key, and the control arm's own
// unit is NEVER logged into `state.retries` just for being that arm. ───────

/** Wraps `once()`'s work function with the D-08 harness-fault retry: a
 *  `status === "error"` result is retried at MOST once, logged into
 *  `state.retries`, and never appended to the unit's own result — the
 *  checkpoint map still holds exactly one `DualfixArmResult` per key. A
 *  `timeout` is a measurement, never retried. */
export async function onceWithHarnessRetry(
  statePath: string,
  state: DualfixState,
  key: string,
  work: () => Promise<DualfixArmResult>,
): Promise<DualfixArmResult> {
  return once(statePath, state, key, async () => {
    let result = await work();
    if (result.status === "error") {
      state.retries.push(`${key}: harness-fault retry (${result.failureReason ?? "unknown error"})`);
      result = await work();
    }
    return result;
  });
}

/** The main iteration loop, factored out so a test can drive it with a stub
 *  `runUnit` and assert call order/resume behaviour without a provider. */
export async function runStudyUnits(
  statePath: string,
  state: DualfixState,
  corpus: DualfixCorpusEntry[],
  runUnit: (arm: DualfixArm, entry: DualfixCorpusEntry) => Promise<DualfixArmResult>,
): Promise<void> {
  for (const entry of corpus) {
    for (const arm of DUALFIX_ARMS) {
      const key = dualfixUnitKey(arm, entry.taskId);
      await onceWithHarnessRetry(statePath, state, key, () => runUnit(arm, entry));
    }
  }
}

// ── D-12: per-arm accounting — the denominator rule ─────────────────────

export interface ArmAccounting {
  arm: DualfixArm;
  attempted: number;
  ok: number;
  timeout: number;
  error: number;
  repaired: number;
  /** Primary rate (the pre-registered gate reads this): repaired over EVERY
   *  attempted unit — a `timeout`/`error` unit counts as a non-repair,
   *  never as an exclusion from the denominator. Recorded as an exact
   *  integer pair, never a pre-rounded float. */
  primaryRepairRate: { num: number; den: number };
  /** `ok`-only sensitivity figure — reported alongside the primary rate,
   *  never substituted for it. */
  okRepairRate: { num: number; den: number };
}

export function computeArmAccounting(units: Record<string, DualfixArmResult>, arm: DualfixArm): ArmAccounting {
  const results = Object.values(units).filter((r) => r.arm === arm);
  const attempted = results.length;
  const ok = results.filter((r) => r.status === "ok").length;
  const timeout = results.filter((r) => r.status === "timeout").length;
  const error = results.filter((r) => r.status === "error").length;
  const repaired = results.filter((r) => r.repaired).length;
  const okRepaired = results.filter((r) => r.status === "ok" && r.repaired).length;
  return {
    arm,
    attempted,
    ok,
    timeout,
    error,
    repaired,
    primaryRepairRate: { num: repaired, den: attempted },
    okRepairRate: { num: okRepaired, den: ok },
  };
}

// ── D-11: the termination clauses, driven by the pinned constants ───────

export function isUnderpowered(corpusLength: number): boolean {
  return corpusLength < DUALFIX_CORPUS_MIN_N;
}

export function isErrorBudgetExceeded(errorCount: number, attemptedCount: number): boolean {
  return errorCount * DUALFIX_ERROR_BUDGET_DEN > attemptedCount * DUALFIX_ERROR_BUDGET_NUM;
}

// ══════════════════════════════════ main ════════════════════════════════

async function main(): Promise<void> {
  const statePath = requireStatePath();
  const corpusPath = requireCorpusPath();
  console.log(
    `# DUALFIX STUDY DRIVER — state: ${statePath} · corpus: ${corpusPath} · model: ${DUALFIX_MODEL}` +
      (DUALFIX_SMOKE ? " · SMOKE MODE" : ""),
  );

  const corpusRaw = readFileSync(corpusPath, "utf8");
  const corpus = loadCorpus(corpusPath);

  const state = loadState(statePath);
  if (!state.runConfig) {
    state.runConfig = captureRunConfig(corpusPath, corpusRaw, corpus.length);
    saveState(statePath, state);
  }
  // Persisted BEFORE any unit runs — the milestone's standing rule.
  writeArtifact("dualfix-study-runconfig.json", state.runConfig);
  console.log(`run config: ${JSON.stringify(state.runConfig)}\n`);

  const provider = createProvider({ kind: "openai", baseUrl: DUALFIX_BASE_URL });
  const runUnit = (arm: DualfixArm, entry: DualfixCorpusEntry) =>
    runArmOnCandidate(arm, entry, provider, DUALFIX_MODEL, { taskTimeoutMs: DUALFIX_TIMEOUT_MS });

  if (DUALFIX_SMOKE) {
    const smokeEntry = corpus[0];
    if (!smokeEntry) throw new Error("[dualfix-study] SMOKE mode requires at least one corpus entry");
    for (const arm of DUALFIX_ARMS) {
      const key = dualfixUnitKey(arm, smokeEntry.taskId);
      const result = await onceWithHarnessRetry(statePath, state, key, () => runUnit(arm, smokeEntry));
      console.log(
        `  ${arm}: status=${result.status} category=${result.category} gradedScore=${result.gradedScore} repaired=${result.repaired}`,
      );
    }
    console.log("\nSMOKE PASSED — no verdict artifact written (smoke mode).");
    return;
  }

  // D-11's underpowered clause — checked BEFORE either arm runs.
  if (isUnderpowered(corpus.length)) {
    writeArtifact("dualfix-study-verdict.json", {
      complete: true,
      outcome: "UNDERPOWERED",
      observedCorpusN: corpus.length,
      requiredMinN: DUALFIX_CORPUS_MIN_N,
      note: "terminated before either arm ran (D-11) — the corpus does not meet DUALFIX_CORPUS_MIN_N",
    });
    console.log(`\nUNDERPOWERED — ${corpus.length} < ${DUALFIX_CORPUS_MIN_N}. dualfix-study-verdict.json written; no unit run.`);
    return;
  }

  // The deterministic, total, resumable order: corpus array order, then
  // DUALFIX_ARMS order within each entry.
  await runStudyUnits(statePath, state, corpus, runUnit);

  // Counts ONLY — the Stage-B inequality (REQ-66) is Phase 12's own gate,
  // read from STUDY-RESULTS.md's own recorded arithmetic, never evaluated
  // here.
  const armAccounting = Object.fromEntries(DUALFIX_ARMS.map((arm) => [arm, computeArmAccounting(state.units, arm)])) as Record<
    DualfixArm,
    ArmAccounting
  >;
  const outcome: "COMPLETE" | "ERROR-BUDGET-EXCEEDED" = DUALFIX_ARMS.some((arm) =>
    isErrorBudgetExceeded(armAccounting[arm].error, armAccounting[arm].attempted),
  )
    ? "ERROR-BUDGET-EXCEEDED"
    : "COMPLETE";

  writeArtifact("dualfix-study-verdict.json", {
    complete: true,
    outcome,
    corpusEntryCount: corpus.length,
    arms: armAccounting,
    retries: state.retries,
    runConfig: state.runConfig,
  });
  console.log(`\n=> DUALFIX STUDY OUTCOME: ${outcome}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error("FAILED:", e?.stack ?? e?.message ?? e);
    process.exit(1);
  });
}
