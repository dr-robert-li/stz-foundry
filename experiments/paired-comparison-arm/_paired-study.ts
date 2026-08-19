/**
 * THE DETACHED PAIRED-ROUND DRIVER (Phase 14 — Instrument build, Plan
 * 14-06, REQ-69), governed by `PAIRED-DESIGN-PREREG.md` rev 2 §4/§5/§6/§7 —
 * FROZEN, the pre-registration of record for this whole module.
 *
 * Copied IN SHAPE from `../dualfix-study/_dualfix-study.ts` and
 * `_ceiling-probe.ts` — the env contract's throw-on-missing-`TOURNEY_STATE`,
 * `SCRIPT_DIR` via `fileURLToPath`, the atomic tmp+rename
 * `writeArtifact`/`safeExec`/`captureRunConfig` trio, the harness-fault
 * retry wrapper, and the `main()` structure with its ESM direct-execution
 * guard. This file re-derives that shape fresh — it never imports either
 * prior study's own driver module.
 *
 * ORCHESTRATION AND EVIDENCE ASSEMBLY, NOT NEW DECISION LOGIC. Reused by
 * import, never re-implemented: the generator, the oracle-scoring arm-run
 * function, the prompt builder, the checkpoint core (`loadState`/
 * `saveState`/`once`/`pairingUnitId`/`pairedUnitKey`) and the two arm slots
 * from `_paired-arms.ts`; the per-unit accounting function, the block
 * classifier and the pinned decision gate from `_paired-gate.ts`; the
 * results-report writer from `_paired-report.ts` (called by 14-06's own
 * later task, not this file). The one small extraction helper this file
 * reuses from `_w-search.ts` (`extractAgentSystemPromptFromDefinitionFile`)
 * is the exact convention both `_b-arm-definition.md` and
 * `_w-arm-definition.md` name as what "the real paired round's" driver uses
 * — re-deriving it here would risk a second, silently-diverging convention
 * for reading the same committed files.
 *
 * ONE REQUEST IN FLIGHT AT A TIME, ALWAYS. There is a single local
 * inference slot; every unit in the deterministic order below is awaited
 * fully before the next one starts. No batching knob, no second execution
 * stream, no env override — the equal-treatment invariant (`PAIRED-DESIGN-
 * PREREG.md` §3) depends on both arms meeting the same slot conditions,
 * which a second in-flight request would break.
 *
 * MUST be launched through `_launch-probe.sh` — the sole sanctioned
 * detached launcher for this experiment directory — never a bare
 * backgrounded `nohup ... &`:
 *
 *   bash _launch-probe.sh _paired-study.ts paired-study-state.json paired-study.log
 *
 * TESTABILITY: the required-env-var throw (`TOURNEY_STATE`) and every
 * `git`/`ollama`/network call live INSIDE `main()`, which only runs behind
 * the `import.meta.url === file://process.argv[1]` guard at the bottom —
 * this module is import-safe for `test/paired-study-driver.test.ts`, which
 * drives every exported pure/stubbed function directly, without a provider
 * or a real git/process call.
 */
import { execSync } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PAIRED_ARM_SLOTS,
  pairingUnitId,
  pairedUnitKey,
  runArmOnPairingUnit,
  loadState,
  saveState,
  once,
  generateCustomerSupportTicket,
  type PairedArmSlot,
  type PairedAgentDefinition,
  type PairedArmResult,
  type PairedState,
  type CustomerSupportTicket,
} from "./_paired-arms.js";
import {
  accountPairedUnits,
  classifyBlock,
  evaluatePairedGate,
  type PairedAccounting,
  type PairedUnitAccountingInput,
  type PairedOracleCategory,
  type PairedStudyOutcome,
} from "./_paired-gate.js";
import { type PairedReportUnitRecord } from "./_paired-report.js";
import {
  PAIRED_SEEDS,
  PAIRED_TASKS_PER_SEED,
  PAIRED_HEALTH_GATE_FLOOR,
  PAIRED_MIN_DISCORDANT_FLOOR,
  PAIRED_DROP_BUDGET_CEILING,
  PAIRED_ATTEMPT_DISCIPLINE,
  PAIRED_MODEL,
  PAIRED_TIMEOUT_MS,
  PAIRED_MAX_PROMPT_CHARS,
} from "./_paired-constants.js";
import { extractAgentSystemPromptFromDefinitionFile } from "./_w-search.js";
import { createProvider, type Provider } from "../../src/foundry/provider.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PAIRED_STUDY_BASE_URL = "http://localhost:11434/v1";
const PAIRED_RUNCONFIG_PATH_FROM_REPO_ROOT = "experiments/paired-comparison-arm";

// ── the deterministic, total, resumable unit order — §4: "seed block
// ascending, then task index within seed, then arm slot within pairing
// unit" ─────────────────────────────────────────────────────────────────

export interface PairedStudyOrderedUnit {
  seed: number;
  taskIndex: number;
  unitId: string;
  arm: PairedArmSlot;
  key: string;
}

/** `PAIRED_SEEDS` is already ascending; `PAIRED_ARM_SLOTS` is already
 *  `["W", "B"]` — neither is re-sorted here, both are read in their own
 *  pinned order, never a content-derived sort. */
export function buildPairedStudyUnitOrder(): PairedStudyOrderedUnit[] {
  const order: PairedStudyOrderedUnit[] = [];
  for (const seed of PAIRED_SEEDS) {
    for (let taskIndex = 0; taskIndex < PAIRED_TASKS_PER_SEED; taskIndex++) {
      const unitId = pairingUnitId(seed, taskIndex);
      for (const arm of PAIRED_ARM_SLOTS) {
        order.push({ seed, taskIndex, unitId, arm, key: pairedUnitKey(arm, unitId) });
      }
    }
  }
  return order;
}

// ── the harness-fault retry, driver-local (mirrors `_dualfix-study.ts`'s
// own `onceWithHarnessRetry` and `_ceiling-probe.ts`'s copy of the same
// shape, wrapping the imported, unchanged `once`) ──────────────────────

/** A `status === "error"` result is retried at MOST once, logged into
 *  `state.retries`, and never appended as a second entry — the checkpoint
 *  map still holds exactly one result per key. A `timeout` is a
 *  measurement, never retried (§6's harness-fault carve-out distinguishes a
 *  harness fault from either outcome; a wrong, unlabelled, or empty answer
 *  is an arm outcome, never retried here). */
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

/** The main iteration loop, factored out so a test can drive it with a stub
 *  `runUnit` and assert call order/resume behaviour without a provider.
 *  §4: the ticket for a given `(seed, taskIndex)` is generated fresh for
 *  each of the two arm slots — `generateCustomerSupportTicket` is a pure
 *  function of its two integer arguments (its own doc comment: "called
 *  twice returns byte-identical output"), so this is never a re-draw, and
 *  both arms receive byte-identical ticket text by construction. */
export async function runPairedStudyUnits(
  statePath: string,
  state: PairedState,
  runUnit: (ticket: CustomerSupportTicket, unitId: string, arm: PairedArmSlot) => Promise<PairedArmResult>,
): Promise<void> {
  for (const { seed, taskIndex, unitId, arm, key } of buildPairedStudyUnitOrder()) {
    const ticket = generateCustomerSupportTicket(seed, taskIndex);
    await onceWithHarnessRetry(statePath, state, key, () => runUnit(ticket, unitId, arm));
  }
}

// ── qualification — §6's three clauses, evaluated in a FIXED, documented
// order so the same final accounting always terminates into the same named
// state regardless of how many clauses it happens to breach at once ─────

const SCOREABLE_CATEGORIES: ReadonlySet<PairedOracleCategory> = new Set(["resolution-mismatch", "resolution-match"]);

function isScoreable(category: PairedOracleCategory): boolean {
  return SCOREABLE_CATEGORIES.has(category);
}

/** §6 Clause 1's own joint condition: a pairing unit counts toward the
 *  instrument-health floor only when BOTH arms land scoreable on that SAME
 *  unit — `accountPairedUnits`'s own `armW`/`armB` counts are marginal
 *  (per-arm), never joint, so this is computed separately here. */
export function computeJointScoreableCount(units: readonly PairedUnitAccountingInput[]): number {
  return units.filter((u) => isScoreable(u.categoryW) && isScoreable(u.categoryB)).length;
}

/**
 * §6's own clause order — Clause 1 (instrument-health gate), Clause 2
 * (minimum-discordant-pairs floor), Clause 3 (per-arm drop-budget ceiling)
 * — evaluated in exactly that order, first breach wins. This is a fixed,
 * documented choice (the frozen design names the three clauses in this
 * order but does not itself state a multi-breach precedence rule): a
 * battery that happens to breach more than one clause at once always
 * terminates into the SAME named state, never varying by which clause a
 * reader happens to check first.
 */
export function evaluatePairedQualification(accounting: PairedAccounting, jointScoreableCount: number): PairedStudyOutcome {
  if (jointScoreableCount < PAIRED_HEALTH_GATE_FLOOR) return "TERMINATED-HEALTH-GATE-FAILED";
  if (accounting.discordantCount < PAIRED_MIN_DISCORDANT_FLOOR) return "TERMINATED-UNDERPOWERED";
  const armWUnscoreable = accounting.armW["no-artifact"] + accounting.armW["non-scoreable"];
  const armBUnscoreable = accounting.armB["no-artifact"] + accounting.armB["non-scoreable"];
  if (armWUnscoreable > PAIRED_DROP_BUDGET_CEILING || armBUnscoreable > PAIRED_DROP_BUDGET_CEILING) {
    return "TERMINATED-DROP-BUDGET-BREACHED";
  }
  return "COMPLETE";
}

// ── assembling the accounting/report inputs from the final checkpoint map ──

/** Throws loudly (never silently shrinks a clause denominator) when a
 *  pairing unit is missing either arm's result — this must only ever be
 *  called after `runPairedStudyUnits` has exhausted the full order. */
export function buildAccountingInputs(units: Record<string, PairedArmResult>): PairedUnitAccountingInput[] {
  const inputs: PairedUnitAccountingInput[] = [];
  for (const seed of PAIRED_SEEDS) {
    for (let taskIndex = 0; taskIndex < PAIRED_TASKS_PER_SEED; taskIndex++) {
      const unitId = pairingUnitId(seed, taskIndex);
      const w = units[pairedUnitKey("W", unitId)];
      const b = units[pairedUnitKey("B", unitId)];
      if (!w || !b) {
        throw new Error(
          `[paired-study] missing result(s) for pairing unit ${unitId}: W=${w ? "present" : "MISSING"} B=${b ? "present" : "MISSING"} ` +
            `— accounting requires all 120 arm-on-unit results to be final`,
        );
      }
      inputs.push({ seed, categoryW: w.oracleCategory, categoryB: b.oracleCategory });
    }
  }
  return inputs;
}

/** Same completeness discipline as `buildAccountingInputs`, projecting only
 *  the five report-facing fields — `rawText` stays in the state file only,
 *  never copied into the (much smaller, human-read) verdict artifact. */
export function buildReportUnitRecords(units: Record<string, PairedArmResult>): PairedReportUnitRecord[] {
  return buildPairedStudyUnitOrder().map(({ unitId, arm, key }) => {
    const result = units[key];
    if (!result) throw new Error(`[paired-study] missing result for ${key} — cannot build report unit records`);
    return { unitId, arm, status: result.status, oracleCategory: result.oracleCategory, score: result.score };
  });
}

// ── reading both arm definitions from their committed files, and validating
// the run-config file loudly rather than coercing or skipping a bad field ──

export interface PairedRunConfigArmEntry {
  commit: string;
  definitionFile: string;
}

export interface PairedRunConfigArms {
  W: PairedRunConfigArmEntry;
  B: PairedRunConfigArmEntry;
}

/** Validates `paired-runconfig.json`'s own `arms.W`/`arms.B` shape — a
 *  missing or malformed field throws rather than being coerced or skipped,
 *  because a silently skipped/defaulted arm identity would falsify §3's
 *  own pinning mechanism this whole instrument leans on. */
export function validatePairedRunConfigArms(raw: unknown): PairedRunConfigArms {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("[paired-study] paired-runconfig.json is not an object");
  }
  const armsRaw = (raw as Record<string, unknown>).arms;
  if (typeof armsRaw !== "object" || armsRaw === null) {
    throw new Error('[paired-study] paired-runconfig.json missing "arms"');
  }
  const armsObj = armsRaw as Record<string, unknown>;
  const result = {} as PairedRunConfigArms;
  for (const slot of PAIRED_ARM_SLOTS) {
    const entry = armsObj[slot];
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`[paired-study] paired-runconfig.json arms.${slot} is missing or not an object`);
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.commit !== "string" || e.commit.length === 0) {
      throw new Error(`[paired-study] paired-runconfig.json arms.${slot}.commit must be a non-empty string, got ${JSON.stringify(e.commit)}`);
    }
    if (typeof e.definitionFile !== "string" || e.definitionFile.length === 0) {
      throw new Error(
        `[paired-study] paired-runconfig.json arms.${slot}.definitionFile must be a non-empty string, got ${JSON.stringify(e.definitionFile)}`,
      );
    }
    result[slot] = { commit: e.commit, definitionFile: e.definitionFile };
  }
  return result;
}

function loadArmCommitsFromRunConfigFile(): PairedRunConfigArms {
  const raw = JSON.parse(readFileSync(join(SCRIPT_DIR, "paired-runconfig.json"), "utf8"));
  return validatePairedRunConfigArms(raw);
}

/** Reads the EXACT committed blob at `commit:path` — never the working-tree
 *  file — so a run always operates on the frozen content the commit hash
 *  actually names, immune to any later, uncommitted edit of the same path.
 *  Throws loudly (via `execSync`) if the commit or path is bad. */
function readCommittedArmDefinitionSystemPrompt(commit: string, definitionFile: string): string {
  const markdown = execSync(`git show ${commit}:${PAIRED_RUNCONFIG_PATH_FROM_REPO_ROOT}/${definitionFile}`, { encoding: "utf8" });
  return extractAgentSystemPromptFromDefinitionFile(markdown);
}

/** WR-03-style resume guard (mirrors `_dualfix-study.ts`'s
 *  `assertCorpusPinned`): if `paired-runconfig.json` on disk now names
 *  different commit hashes than what a PRIOR run of this driver already
 *  pinned into `state.runConfig`, the arm identities changed between a
 *  crash and a resume — refuse rather than silently measuring a different
 *  pair of arms under one checkpoint file. No-ops on a first run (nothing
 *  pinned yet). */
export function assertArmCommitsPinned(runConfig: Record<string, unknown> | undefined, freshArmCommits: { W: string; B: string }): void {
  if (!runConfig) return;
  const pinned = runConfig.armCommits as { W?: string; B?: string } | undefined;
  if (!pinned || pinned.W !== freshArmCommits.W || pinned.B !== freshArmCommits.B) {
    throw new Error(
      `[paired-study] arm-commit drift detected on resume: state.runConfig pinned armCommits=${JSON.stringify(pinned)}, ` +
        `but paired-runconfig.json now names armCommits=${JSON.stringify(freshArmCommits)} — arm identities must not change between resumes`,
    );
  }
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
 *  design constant — mirrors `_dualfix-study.ts`'s/`_ceiling-probe.ts`'s
 *  own `captureRunConfig`. */
function captureRunConfig(armCommits: PairedRunConfigArms): Record<string, unknown> {
  const ollamaVersion = safeExec("ollama --version");
  const listLine = safeExec("ollama list")
    .split("\n")
    .find((l) => l.startsWith(PAIRED_MODEL) || l.startsWith(PAIRED_MODEL.replace(/:latest$/, "")));
  return {
    model: PAIRED_MODEL,
    modelDigestLine: listLine ?? `<not found in 'ollama list': ${PAIRED_MODEL}>`,
    ollamaVersion,
    samplerParams: "none sent (no temperature, no max_tokens override — provider/server default applies)",
    timeoutMs: PAIRED_TIMEOUT_MS,
    promptBoundChars: PAIRED_MAX_PROMPT_CHARS,
    seeds: PAIRED_SEEDS,
    tasksPerSeed: PAIRED_TASKS_PER_SEED,
    attemptDiscipline: PAIRED_ATTEMPT_DISCIPLINE,
    armCommits: { W: armCommits.W.commit, B: armCommits.B.commit },
    armDefinitionFiles: { W: armCommits.W.definitionFile, B: armCommits.B.definitionFile },
    startedAt: new Date().toISOString(),
    taskOrder:
      "seed block ascending (PAIRED_SEEDS order), then task index within seed, then arm slot within pairing unit " +
      "(W then B, PAIRED_ARM_SLOTS order) — deterministic, total, stable",
    executionOrder: "one request in flight at a time — no batching, no second execution stream, no override",
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
  console.log(
    `# PAIRED STUDY DRIVER — state: ${statePath} · model: ${PAIRED_MODEL} · seeds: ${PAIRED_SEEDS.join(",")} · tasks/seed: ${PAIRED_TASKS_PER_SEED}`,
  );

  const runConfigArms = loadArmCommitsFromRunConfigFile();
  const state = loadState(statePath);
  if (!state.runConfig) {
    state.runConfig = captureRunConfig(runConfigArms);
    saveState(statePath, state);
  } else {
    assertArmCommitsPinned(state.runConfig, { W: runConfigArms.W.commit, B: runConfigArms.B.commit });
  }
  console.log(`run config: ${JSON.stringify(state.runConfig)}\n`);

  const agentDefinitions: Record<PairedArmSlot, PairedAgentDefinition> = {
    W: { id: "W", systemPrompt: readCommittedArmDefinitionSystemPrompt(runConfigArms.W.commit, runConfigArms.W.definitionFile) },
    B: { id: "B", systemPrompt: readCommittedArmDefinitionSystemPrompt(runConfigArms.B.commit, runConfigArms.B.definitionFile) },
  };

  const provider = createProvider({ kind: "openai", baseUrl: PAIRED_STUDY_BASE_URL });
  const runUnit = (ticket: CustomerSupportTicket, unitId: string, arm: PairedArmSlot) =>
    runArmOnPairingUnit(ticket, unitId, arm, agentDefinitions[arm], provider as Provider, { taskTimeoutMs: PAIRED_TIMEOUT_MS });

  await runPairedStudyUnits(statePath, state, runUnit);

  // Everything below runs ONLY after the full deterministic order (120
  // arm-on-unit results) is exhausted — `buildAccountingInputs` throws if
  // it is not.
  const accountingInputs = buildAccountingInputs(state.units);
  const accounting = accountPairedUnits(accountingInputs);
  const jointScoreableCount = computeJointScoreableCount(accountingInputs);
  const outcome = evaluatePairedQualification(accounting, jointScoreableCount);
  const blockClassifications = accounting.blocks.map((b) => classifyBlock(b.discordantWins, b.discordantLosses));
  const gateVerdict = evaluatePairedGate(outcome, accounting.discordantCount, accounting.winCount, blockClassifications);
  const unitRecords = buildReportUnitRecords(state.units);

  // Written ONCE — the only completion signal anything downstream may read.
  writeArtifact("paired-study-verdict.json", {
    complete: true,
    outcome: gateVerdict.outcome,
    ...(gateVerdict.decision ? { decision: gateVerdict.decision } : {}),
    ...(gateVerdict.downgradedFrom ? { downgradedFrom: gateVerdict.downgradedFrom } : {}),
    reason: gateVerdict.reason,
    jointScoreableCount,
    accounting: {
      armW: accounting.armW,
      armB: accounting.armB,
      winCount: accounting.winCount,
      lossCount: accounting.lossCount,
      tieCount: accounting.tieCount,
      discordantCount: accounting.discordantCount,
      blocks: accounting.blocks.map((b, i) => ({ ...b, classification: blockClassifications[i] })),
    },
    unitRecords,
    retries: state.retries,
    armCommits: { W: runConfigArms.W.commit, B: runConfigArms.B.commit },
    runConfig: state.runConfig,
  });
  console.log(`\n=> PAIRED STUDY OUTCOME: ${gateVerdict.outcome}${gateVerdict.decision ? ` (${gateVerdict.decision})` : ""}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error("FAILED:", e?.stack ?? e?.message ?? e);
    process.exit(1);
  });
}
