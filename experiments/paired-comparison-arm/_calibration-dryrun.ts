/**
 * CALIBRATION DRY-RUN — a carve-out DIAGNOSTIC script, NOT a prereg run
 * (2026-08-19, Dr. Robert Li). The v1.25.0 paired round ended
 * TERMINATED-UNDERPOWERED because the W-arm search battery had no gradient:
 * B scored 30/30 on the seed baseline (`PAIRED-STUDY-RESULTS.md`) — the
 * unmodified `customer-support-warehouse.ts` tickets are too easy for this
 * model, each solvable by single-step arithmetic once the `[Facts: k=v; …]`
 * footer is read. This script generates six harder ticket VARIANTS and
 * scores B's real systemPrompt against each, purely to find which configs
 * land B in a 30–80% match-rate gradient zone worth building a real search
 * battery against. It decides nothing, gates nothing, and is not read by
 * any prereg document.
 *
 * DOES NOT MODIFY: `customer-support-warehouse.ts`, `customer-support-oracle.ts`,
 * any frozen prereg doc, or `ACCEPTED_GENERATORS`. C1-C5 are ticket-TEXT
 * transformations built by string manipulation over what
 * `generateCustomerSupportTicket` already returns, or (C4 only) an entirely
 * self-contained synthetic ticket built inside this file. Nothing here is
 * imported by, or feeds back into, the real generator/oracle modules.
 *
 * REUSE, WITH THREE DOCUMENTED DEVIATIONS from the pattern `_ceiling-probe.ts`
 * and `_paired-study.ts` set:
 *
 *   1. Checkpoint state (`loadState`/`saveState`/`once`) is RE-DERIVED here,
 *      not imported from `_paired-arms.ts`. That module's `once`/`PairedState`
 *      are typed against `PairedArmResult`, whose fields (`arm: "W"|"B"`,
 *      no `config`/`expected`/`extracted`) don't carry what item 3 of this
 *      diagnostic's own brief asks for per unit (config, expected resolution,
 *      extracted proposal). Forcing that shape through the real type would
 *      either lose fields or require lying about them; a fresh ~20-line
 *      copy of the exact same tmp+rename/ENOENT-only-fallback shape avoids
 *      both. `pairingUnitId` and `buildPairedTaskPrompt` ARE reused directly
 *      — both are pure functions with no such coupling.
 *   2. C4's task prompt is NOT built via `buildPairedTaskPrompt`. That
 *      function's own `system` return (unused anyway — see point 3) and its
 *      `user` return assume the ticket needs no extra vocabulary beyond what
 *      B's own `systemPrompt` states. C4 introduces two actions outside the
 *      real six-action taxonomy, so its `user` message states the override
 *      contract explicitly (`buildC4UserPrompt` below) — otherwise B would
 *      have no way to know the new action names or the capped-fee rule.
 *   3. Scoring reuses `extractResolutionFields`/`normalizeField`/
 *      `RESOLUTION_FIELD_LABELS` — the actual judgement primitives — but not
 *      `classifyCustomerSupportResponse` itself, whose signature pins
 *      `knownResolution: CustomerSupportResolution` (a closed action union).
 *      C4's actions aren't in that union, so `classifyAgainstExpected` below
 *      re-implements the same few lines of match logic generically. This is
 *      diagnostics, not the generator↔oracle pair the zero-shared-helpers
 *      rule (`customer-support-oracle.ts` file doc) actually binds.
 *
 * SEEDS: 1501 (C0/C1/C2/C3 base tickets, task index 0-9; C5's SECOND ticket
 * per unit reuses 1501 at task index+10, i.e. 10-19 — still one seed, a
 * disjoint task-index range), 1502 (C4's fully self-contained synthetic
 * facts, task index 0-9), 1503 (C2/C3's distractor-value stream, task index
 * 0-9). All three are disjoint from every pinned seed block in this project:
 * DUALFIX 1201-1206, the paired battery 1301-1306, the ceiling probe 1399,
 * the tournament search/promotion halves 1401-1406.
 *
 * REAL INFERENCE: same provider construction as `_ceiling-probe.ts`
 * (`createProvider({kind:"openai", baseUrl:"http://localhost:11434/v1"})`,
 * `PAIRED_MODEL` = qwen3.6:latest, `PAIRED_TIMEOUT_MS` per unit, no sampler
 * overrides), strictly sequential, checkpointed after every unit (tmp+rename),
 * resumable (a cached key short-circuits `work` entirely on relaunch).
 *
 * MUST be launched through `_launch-probe.sh`, the sole sanctioned detached
 * launcher for this directory:
 *
 *   bash _launch-probe.sh _calibration-dryrun.ts calibration-dryrun-state.json calibration-dryrun.log
 *
 * SELF-CHECK: `npx tsx _calibration-dryrun.ts --selfcheck` runs fully
 * offline against a stub `Provider` (mirrors `test/paired-ceiling-probe.test.ts`'s
 * pattern) — never touches the network, never writes inside this directory
 * (its state file lives under a fresh `os.tmpdir()` mkdtemp).
 */
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mulberry32 } from "../../src/harness.js";
import {
  generateCustomerSupportTicket,
  RESOLUTION_FIELD_LABELS,
  type CustomerSupportTicket,
} from "../../src/foundry/customer-support-warehouse.js";
import { extractResolutionFields, normalizeField } from "../../src/foundry/customer-support-oracle.js";
import { pairingUnitId, buildPairedTaskPrompt } from "./_paired-arms.js";
import { extractAgentSystemPromptFromDefinitionFile } from "./_w-search.js";
import { PAIRED_MODEL as PAIRED_MODEL_DEFAULT, PAIRED_TIMEOUT_MS } from "./_paired-constants.js";
// Diagnostic-only override: CALIBRATION_MODEL selects the executor model for
// this dry-run (model-axis calibration); defaults to the pinned paired model.
const PAIRED_MODEL = process.env.CALIBRATION_MODEL || PAIRED_MODEL_DEFAULT;
const CALIBRATION_VERDICT_FILE = process.env.CALIBRATION_VERDICT_FILE || "calibration-dryrun-verdict.json";
import { createProvider, type Provider } from "../../src/foundry/provider.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CALIBRATION_BASE_URL = "http://localhost:11434/v1";

// ── diagnostic seed block — see file doc comment for the disjointness proof
export const CAL_SEED_BASE = 1501; // C0/C1/C2/C3 tickets + C5's primary half
export const CAL_SEED_C5_SECONDARY_OFFSET = 10; // C5's second half: taskIndex+10, same seed
export const CAL_SEED_C4 = 1502; // C4's self-contained synthetic facts
export const CAL_SEED_DISTRACTOR = 1503; // C2/C3's distractor-value stream
export const CAL_TASK_COUNT = 10;

export const CONFIGS = Object.freeze(["C0", "C1", "C2", "C3", "C4", "C5", "C6"] as const);
export type ConfigId = (typeof CONFIGS)[number];

interface ExpectedResolution {
  action: string;
  category: string;
  parameter: string;
}

export interface CalibrationUnit {
  config: ConfigId;
  seed: number;
  taskIndex: number;
  unitId: string;
  ticketText: string;
  expected: ExpectedResolution;
  userPrompt: string;
  /** C4's capped-late-fee-credit units only — whether the cap actually
   *  bound (`feeCap < rawFee`) for THIS unit. Undefined for every other
   *  config and for C4's net-refund units. */
  capBinds?: boolean;
}

function centsToDollarString(cents: number): string {
  return (cents / 100).toFixed(2);
}

// ── ticket-text surgery shared by C1/C2/C3 — no warehouse internals touched,
// only the PUBLIC `ticketText` string every generated ticket already carries.

const FOOTER_RE = /^([\s\S]*?)\s*\[Facts: ([^\]]*)\]\s*$/;

/** Splits a warehouse-rendered ticket into the prose body and the inner
 *  facts-list content (without the `Facts: ` label or the brackets). Throws
 *  on a ticket with no recognizable footer — every `generateCustomerSupportTicket`
 *  output has one, so a throw here means this file's own assumption about
 *  the renderer's shape broke, never a data-dependent branch to swallow. */
function splitFooter(ticketText: string): { body: string; factsInner: string } {
  const m = ticketText.match(FOOTER_RE);
  if (!m) throw new Error(`splitFooter: no [Facts: ...] footer found in: ${ticketText}`);
  return { body: m[1]!, factsInner: m[2]! };
}

/** Draws a dollar amount from `[minCents, minCents+spanCents)`, redrawing
 *  (same rng stream, so still deterministic) up to 5 times if it happens to
 *  render identically to `forbidden` — the anti-collision guarantee C2's
 *  own brief requires, made structural rather than merely improbable. */
function drawDistinctDollarString(rng: () => number, minCents: number, spanCents: number, forbidden: string): string {
  let str = centsToDollarString(minCents + Math.floor(rng() * spanCents));
  for (let guard = 0; str === forbidden && guard < 5; guard++) {
    str = centsToDollarString(minCents + Math.floor(rng() * spanCents));
  }
  return str;
}

interface Distractors {
  subtotalStr: string;
  loyaltyStr: string;
  previousOrderStr: string;
  sentence: string;
}

/** C2/C3's shared distractor computation — three plausible labeled facts
 *  plus one prose sentence, deterministic per `(seed, taskIndex)`, drawn
 *  from a stream disjoint from the ticket's own (`CAL_SEED_DISTRACTOR`, never
 *  `CAL_SEED_BASE`), so a distractor value's range has no relationship to
 *  the true parameter's range beyond the explicit anti-collision redraw. */
function computeDistractors(taskIndex: number, trueParameter: string): Distractors {
  const rng = mulberry32(CAL_SEED_DISTRACTOR * 1000 + taskIndex);
  const subtotalStr = drawDistinctDollarString(rng, 5000, 45000, trueParameter); // $50.00-$499.99
  const loyaltyStr = drawDistinctDollarString(rng, 500, 9500, trueParameter); // $5.00-$99.99
  const previousOrderStr = String(100000 + Math.floor(rng() * 900000)); // never dollar-shaped, no decimal point
  const sentence = `My subtotal before shipping was $${subtotalStr} and I have a loyalty credit of $${loyaltyStr} on file.`;
  return { subtotalStr, loyaltyStr, previousOrderStr, sentence };
}

// ── C0-C3: transformations of one shared base ticket per task index ────────

function buildTaskPromptFor(ticket: CustomerSupportTicket, ticketText: string): string {
  return buildPairedTaskPrompt({ ...ticket, ticketText }).user;
}

function renderC0ThroughC3(taskIndex: number): CalibrationUnit[] {
  const ticket = generateCustomerSupportTicket(CAL_SEED_BASE, taskIndex);
  const unitId = pairingUnitId(CAL_SEED_BASE, taskIndex);
  const { body } = splitFooter(ticket.ticketText);
  const distractors = computeDistractors(taskIndex, ticket.resolution.parameter);
  const { factsInner } = splitFooter(ticket.ticketText);
  const extraFacts = `subtotal=${distractors.subtotalStr}; loyaltyCredit=${distractors.loyaltyStr}; previousOrder=${distractors.previousOrderStr}`;

  const c0Text = ticket.ticketText;
  const c1Text = body;
  const c2Text = `${body} ${distractors.sentence} [Facts: ${factsInner}; ${extraFacts}]`;
  const c3Text = `${body} ${distractors.sentence}`;

  const common = { seed: CAL_SEED_BASE, taskIndex, unitId, expected: ticket.resolution as ExpectedResolution };
  return [
    { config: "C0", ...common, ticketText: c0Text, userPrompt: buildTaskPromptFor(ticket, c0Text) },
    { config: "C1", ...common, ticketText: c1Text, userPrompt: buildTaskPromptFor(ticket, c1Text) },
    { config: "C2", ...common, ticketText: c2Text, userPrompt: buildTaskPromptFor(ticket, c2Text) },
    { config: "C3", ...common, ticketText: c3Text, userPrompt: buildTaskPromptFor(ticket, c3Text) },
  ];
}

// ── C4: two self-contained two-step-arithmetic actions, defined ONLY here ──

/**
 * C4's own closed vocabulary — deliberately outside `CUSTOMER_SUPPORT_ACTIONS`
 * (see file doc comment, deviation 3: reusing a real action's label here
 * would make a two-step variant's score indistinguishable from the real
 * one-step action's score anywhere the two are later compared).
 */
export const C4_ACTIONS = Object.freeze(["capped-late-fee-credit", "net-refund-after-restocking"] as const);

function buildC4UserPrompt(ticketText: string): string {
  return (
    `NOTE: for this ticket only, ignore the action/category list stated above — use ONLY the following two ` +
    `actions instead:\n` +
    `- capped-late-fee-credit (category: shipping-service-mismatch): a per-day late-delivery credit ` +
    `(dailyLateFee x daysLate), capped at a stated maximum (feeCap). The parameter is whichever of those two ` +
    `amounts is SMALLER, two decimal places.\n` +
    `- net-refund-after-restocking (category: order-total-discrepancy): the parameter is the item price minus ` +
    `the restocking fee, two decimal places.\n` +
    `Respond with EXACTLY the same three-line format described above (${RESOLUTION_FIELD_LABELS.join("/")}), ` +
    `using one of the two action names above and its paired category.\n\n` +
    `Ticket:\n${ticketText}`
  );
}

function renderC4(taskIndex: number): CalibrationUnit {
  const rng = mulberry32(CAL_SEED_C4 * 1000 + taskIndex);
  const unitId = pairingUnitId(CAL_SEED_C4, taskIndex);
  const orderNumber = 100000 + Math.floor(rng() * 900000);

  if (taskIndex % 2 === 0) {
    // capped-late-fee-credit — deterministic bind/no-bind alternation by
    // position (0,2,4,6,8 -> position 0..4), not by an rng draw, so the
    // "cap binds for some, not others" property is guaranteed rather than
    // merely probable across only 5 slots.
    const dailyLateFeeCents = 300 + Math.floor(rng() * 700); // $3.00-$9.99
    const daysLate = 2 + Math.floor(rng() * 5); // 2-6
    const rawFeeCents = dailyLateFeeCents * daysLate;
    const position = taskIndex / 2;
    const capBinds = position % 2 === 0;
    const feeCapCents = capBinds
      ? Math.max(100, rawFeeCents - (50 + Math.floor(rng() * 200)))
      : rawFeeCents + (50 + Math.floor(rng() * 200));
    const parameterCents = Math.min(rawFeeCents, feeCapCents);

    const core =
      `Your stated policy credits $${centsToDollarString(dailyLateFeeCents)} for every day an order arrives ` +
      `late, up to a maximum credit of $${centsToDollarString(feeCapCents)} per order, and my order arrived ` +
      `${daysLate} days after the promised date.`;
    const footer =
      `Facts: order=${orderNumber}; dailyLateFee=${centsToDollarString(dailyLateFeeCents)}; daysLate=${daysLate}; ` +
      `feeCap=${centsToDollarString(feeCapCents)}`;
    const ticketText = `Order #${orderNumber}: ${core} Could someone please look into this and correct my account? [${footer}]`;
    const expected: ExpectedResolution = {
      action: "capped-late-fee-credit",
      category: "shipping-service-mismatch",
      parameter: centsToDollarString(parameterCents),
    };
    return { config: "C4", seed: CAL_SEED_C4, taskIndex, unitId, ticketText, expected, userPrompt: buildC4UserPrompt(ticketText), capBinds };
  }

  // net-refund-after-restocking — itemPrice/restockingFee ranges are
  // strictly disjoint ([3000,9999] vs [200,999]), so the difference can
  // never equal either stated fact (same proof shape as `adjust-charge`'s
  // own comment in `customer-support-warehouse.ts`).
  const itemPriceCents = 3000 + Math.floor(rng() * 7000); // $30.00-$99.99
  const restockingFeeCents = 200 + Math.floor(rng() * 800); // $2.00-$9.99
  const parameterCents = itemPriceCents - restockingFeeCents;
  const core =
    `I returned this item and was charged a $${centsToDollarString(restockingFeeCents)} restocking fee against ` +
    `the $${centsToDollarString(itemPriceCents)} item price.`;
  const footer = `Facts: order=${orderNumber}; itemPrice=${centsToDollarString(itemPriceCents)}; restockingFee=${centsToDollarString(restockingFeeCents)}`;
  const ticketText = `Order #${orderNumber}: ${core} Could someone please process my refund? [${footer}]`;
  const expected: ExpectedResolution = {
    action: "net-refund-after-restocking",
    category: "order-total-discrepancy",
    parameter: centsToDollarString(parameterCents),
  };
  return { config: "C4", seed: CAL_SEED_C4, taskIndex, unitId, ticketText, expected, userPrompt: buildC4UserPrompt(ticketText) };
}

// ── C5: compound ticket, two actions concatenated, resolve the FIRST ───────

const C5_RESOLVE_FIRST_INSTRUCTION = "\n\nResolve the FIRST issue stated in the ticket.";

function renderC5(taskIndex: number): CalibrationUnit {
  const primary = generateCustomerSupportTicket(CAL_SEED_BASE, taskIndex);
  const secondary = generateCustomerSupportTicket(CAL_SEED_BASE, taskIndex + CAL_SEED_C5_SECONDARY_OFFSET);
  const { body: primaryBody, factsInner: primaryFacts } = splitFooter(primary.ticketText);
  const { body: secondaryBody, factsInner: secondaryFacts } = splitFooter(secondary.ticketText);
  const ticketText = `${primaryBody} ${secondaryBody} [Facts: ${primaryFacts}; ${secondaryFacts}]`;
  const unitId = pairingUnitId(CAL_SEED_BASE, taskIndex);
  const userPrompt = buildTaskPromptFor(primary, ticketText) + C5_RESOLVE_FIRST_INSTRUCTION;
  return {
    config: "C5",
    seed: CAL_SEED_BASE,
    taskIndex,
    unitId,
    ticketText,
    expected: primary.resolution as ExpectedResolution,
    userPrompt,
  };
}

// ── C6: C4's two-step arithmetic ticket, footer stripped, distractor prose —
// the "hardest composite" the gpt-oss gradient check asked for. Distractor
// stream offset by +20 so C6's values never repeat C2/C3's for the same
// index (still deterministic, still collision-guarded against the true
// parameter). unitId reuses C4's (keys are config-prefixed, so distinct). ──

const CAL_C6_DISTRACTOR_OFFSET = 20;

function renderC6(taskIndex: number): CalibrationUnit {
  const base = renderC4(taskIndex);
  const { body } = splitFooter(base.ticketText);
  const distractors = computeDistractors(taskIndex + CAL_C6_DISTRACTOR_OFFSET, base.expected.parameter);
  const ticketText = `${body} ${distractors.sentence}`;
  return { ...base, config: "C6", ticketText, userPrompt: buildC4UserPrompt(ticketText) };
}

// ── the deterministic, total unit order — C0..C6, task index 0-9 within
// each — array position is the sole tie-break, never a content sort.
// CALIBRATION_ONLY (comma-separated config ids) filters the run to a
// subset — diagnostic knob for follow-up micro-checks. ────────────────────

export function generateCalibrationUnits(): CalibrationUnit[] {
  const units: CalibrationUnit[] = [];
  for (let taskIndex = 0; taskIndex < CAL_TASK_COUNT; taskIndex++) units.push(...renderC0ThroughC3(taskIndex));
  for (let taskIndex = 0; taskIndex < CAL_TASK_COUNT; taskIndex++) units.push(renderC4(taskIndex));
  for (let taskIndex = 0; taskIndex < CAL_TASK_COUNT; taskIndex++) units.push(renderC5(taskIndex));
  for (let taskIndex = 0; taskIndex < CAL_TASK_COUNT; taskIndex++) units.push(renderC6(taskIndex));
  return units;
}

function activeConfigs(): readonly ConfigId[] {
  const only = process.env.CALIBRATION_ONLY;
  if (!only) return CONFIGS;
  const wanted = only.split(",").map((c) => c.trim());
  const bad = wanted.filter((c) => !(CONFIGS as readonly string[]).includes(c));
  if (bad.length > 0) throw new Error(`CALIBRATION_ONLY names unknown configs: ${bad.join(",")}`);
  return CONFIGS.filter((c) => wanted.includes(c));
}

// ── scoring — reuses the oracle's own extraction/normalization primitives
// (deviation 3, file doc comment above); never re-imports `customer-support-
// warehouse.ts` internals ──────────────────────────────────────────────────

export type CalibrationOracleCategory = "no-artifact" | "non-scoreable" | "resolution-mismatch" | "resolution-match";

function classifyAgainstExpected(
  rawText: string,
  expected: ExpectedResolution,
): { category: CalibrationOracleCategory; extracted: Record<string, string> | null } {
  const extraction = extractResolutionFields(rawText);
  if (extraction.outcome === "no-artifact") return { category: "no-artifact", extracted: null };
  if (extraction.outcome === "non-scoreable") return { category: "non-scoreable", extracted: null };
  const matches = RESOLUTION_FIELD_LABELS.every(
    (label) => normalizeField(extraction.fields[label]) === normalizeField(expected[label]),
  );
  return { category: matches ? "resolution-match" : "resolution-mismatch", extracted: extraction.fields };
}

// ── checkpoint state — re-derived, not imported (deviation 1 above) ────────

export interface CalibrationUnitRecord {
  config: ConfigId;
  seed: number;
  taskIndex: number;
  status: "ok" | "timeout" | "error";
  failureReason?: string;
  rawText: string;
  extracted: Record<string, string> | null;
  expected: ExpectedResolution;
  oracleCategory: CalibrationOracleCategory;
  match: boolean;
  inputTokens: number;
  outputTokens: number;
  wallMs: number;
}

export interface CalibrationState {
  units: Record<string, CalibrationUnitRecord>;
  retries: string[];
  runConfig?: Record<string, unknown>;
}

export function loadCalibrationState(statePath: string): CalibrationState {
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8")) as Partial<CalibrationState>;
    return { units: parsed.units ?? {}, retries: parsed.retries ?? [], runConfig: parsed.runConfig };
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return { units: {}, retries: [] };
    throw e;
  }
}

export function saveCalibrationState(statePath: string, state: CalibrationState): void {
  writeFileSync(`${statePath}.tmp`, JSON.stringify(state, null, 2));
  renameSync(`${statePath}.tmp`, statePath);
}

export async function once(
  statePath: string,
  state: CalibrationState,
  key: string,
  work: () => Promise<CalibrationUnitRecord>,
): Promise<CalibrationUnitRecord> {
  const cached = state.units[key];
  if (cached) return cached;
  const result = await work();
  state.units[key] = result;
  saveCalibrationState(statePath, state);
  return result;
}

export async function onceWithHarnessRetry(
  statePath: string,
  state: CalibrationState,
  key: string,
  work: () => Promise<CalibrationUnitRecord>,
): Promise<CalibrationUnitRecord> {
  return once(statePath, state, key, async () => {
    let result = await work();
    if (result.status === "error") {
      state.retries.push(`${key}: harness-fault retry (${result.failureReason ?? "unknown error"})`);
      result = await work();
    }
    return result;
  });
}

// ── running one unit ─────────────────────────────────────────────────────

export async function runCalibrationUnit(
  unit: CalibrationUnit,
  systemPrompt: string,
  provider: Provider,
  taskTimeoutMs: number,
): Promise<CalibrationUnitRecord> {
  const startedAt = Date.now();
  let status: CalibrationUnitRecord["status"] = "ok";
  let failureReason: string | undefined;
  let rawText = "";
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const timer = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`task timeout after ${taskTimeoutMs}ms`)), taskTimeoutMs).unref(),
    );
    const attempt = provider.chat({ model: PAIRED_MODEL, system: systemPrompt, messages: [{ role: "user", content: unit.userPrompt }] });
    attempt.catch(() => {}); // WR-08 pattern (see `_paired-arms.ts`): mark a late rejection handled
    const res = await Promise.race([attempt, timer]);
    rawText = res.text;
    inputTokens = res.usage.inputTokens;
    outputTokens = res.usage.outputTokens;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    status = message.includes("task timeout") ? "timeout" : "error";
    failureReason = message;
  }

  const classified = classifyAgainstExpected(rawText, unit.expected);
  return {
    config: unit.config,
    seed: unit.seed,
    taskIndex: unit.taskIndex,
    status,
    ...(failureReason ? { failureReason } : {}),
    rawText,
    extracted: classified.extracted,
    expected: unit.expected,
    oracleCategory: classified.category,
    match: classified.category === "resolution-match",
    inputTokens,
    outputTokens,
    wallMs: Date.now() - startedAt,
  };
}

// ── per-config accounting ───────────────────────────────────────────────

export interface ConfigAccounting {
  config: ConfigId;
  attempted: number;
  scoreable: number;
  matched: number;
  /** matched / attempted (not /scoreable) — consistent with how
   *  PAIRED-STUDY-RESULTS.md reports B's own "30/30" against the total
   *  unit count, the number this dry-run's whole purpose is to find a
   *  gradient against. */
  matchRate: number;
}

export function computeConfigAccounting(units: Record<string, CalibrationUnitRecord>, config: ConfigId): ConfigAccounting {
  const results = Object.entries(units)
    .filter(([key]) => key.startsWith(`${config}:`))
    .map(([, r]) => r);
  const scoreable = results.filter((r) => r.oracleCategory === "resolution-mismatch" || r.oracleCategory === "resolution-match").length;
  const matched = results.filter((r) => r.match).length;
  return { config, attempted: results.length, scoreable, matched, matchRate: results.length > 0 ? matched / results.length : 0 };
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

function captureRunConfig(): Record<string, unknown> {
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
    seeds: { base: CAL_SEED_BASE, c4: CAL_SEED_C4, distractor: CAL_SEED_DISTRACTOR },
    tasksPerConfig: CAL_TASK_COUNT,
    clientConcurrency: 1,
    startedAt: new Date().toISOString(),
    unitOrder: "C0..C5, task index 0..9 within each config — deterministic, total, stable",
  };
}

function writeArtifact(filename: string, data: unknown): void {
  const p = join(SCRIPT_DIR, filename);
  writeFileSync(`${p}.tmp`, JSON.stringify(data, null, 2));
  renameSync(`${p}.tmp`, p);
}

async function main(): Promise<void> {
  const statePath = requireStatePath();
  console.log(`# CALIBRATION DRY-RUN — state: ${statePath} · model: ${PAIRED_MODEL} · configs: ${CONFIGS.join(",")} · units/config: ${CAL_TASK_COUNT}`);

  const state = loadCalibrationState(statePath);
  if (!state.runConfig) {
    state.runConfig = captureRunConfig();
    saveCalibrationState(statePath, state);
  }
  console.log(`run config: ${JSON.stringify(state.runConfig)}\n`);

  const systemPrompt = extractAgentSystemPromptFromDefinitionFile(readFileSync(join(SCRIPT_DIR, "_b-arm-definition.md"), "utf8"));
  const provider = createProvider({ kind: "openai", baseUrl: CALIBRATION_BASE_URL });

  const configs = activeConfigs();
  for (const unit of generateCalibrationUnits()) {
    if (!configs.includes(unit.config)) continue;
    const key = `${unit.config}:${unit.unitId}`;
    await onceWithHarnessRetry(statePath, state, key, () => runCalibrationUnit(unit, systemPrompt, provider, PAIRED_TIMEOUT_MS));
  }

  const accounting = configs.map((config) => computeConfigAccounting(state.units, config));
  writeArtifact(CALIBRATION_VERDICT_FILE, { complete: true, accounting, retries: state.retries, runConfig: state.runConfig });

  console.log("\n=> CALIBRATION DRY-RUN complete:");
  for (const a of accounting) {
    console.log(`   ${a.config}: ${a.matched}/${a.attempted} matched (${(a.matchRate * 100).toFixed(0)}%), ${a.scoreable} scoreable`);
  }
}

// ══════════════════════════════════ selfcheck ═══════════════════════════

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`[selfcheck] ${msg}`);
}

async function selfcheck(): Promise<void> {
  console.log("# CALIBRATION DRY-RUN SELF-CHECK");

  // (a) determinism: two independent generations are byte-identical.
  const unitsA = generateCalibrationUnits();
  const unitsB = generateCalibrationUnits();
  assert(JSON.stringify(unitsA) === JSON.stringify(unitsB), "determinism: two generations must be byte-identical");
  assert(unitsA.length === CONFIGS.length * CAL_TASK_COUNT, `expected ${CONFIGS.length * CAL_TASK_COUNT} units, got ${unitsA.length}`);
  console.log("  (a) determinism — OK (all units byte-identical across two generations)");

  // (b) C1 tickets contain no "[Facts:".
  for (const u of unitsA.filter((u) => u.config === "C1")) {
    assert(!u.ticketText.includes("[Facts:"), `C1 unit ${u.unitId} ticketText must not contain "[Facts:"`);
  }
  console.log("  (b) C1 footer-stripped — OK (no unit contains \"[Facts:\")");

  // (c) C2 distractor values never equal the true parameter.
  for (const u of unitsA.filter((u) => u.config === "C2")) {
    const m = u.ticketText.match(/\[Facts: ([^\]]*)\]$/);
    assert(m, `C2 unit ${u.unitId} must carry a [Facts: ...] footer`);
    const values = m![1]!.split("; ").map((p) => p.split("=")[1]!);
    for (const v of values) assert(v !== u.expected.parameter, `C2 unit ${u.unitId}: distractor value "${v}" must not equal true parameter "${u.expected.parameter}"`);
  }
  console.log("  (c) C2 distractor values distinct from true parameter — OK");

  // (d) C4 cap binds for some units and not others across the sweep.
  const c4Capped = unitsA.filter((u) => u.config === "C4" && u.capBinds !== undefined);
  assert(c4Capped.length === 5, `expected 5 capped-late-fee-credit C4 units, got ${c4Capped.length}`);
  assert(c4Capped.some((u) => u.capBinds === true), "C4: expected at least one unit where the cap binds");
  assert(c4Capped.some((u) => u.capBinds === false), "C4: expected at least one unit where the cap does not bind");
  console.log(`  (d) C4 cap binds for some, not others — OK (${c4Capped.filter((u) => u.capBinds).length}/${c4Capped.length} bind)`);

  // (e) C5 resolution equals the first action's.
  for (const u of unitsA.filter((u) => u.config === "C5")) {
    const primary = generateCustomerSupportTicket(CAL_SEED_BASE, u.taskIndex);
    assert(
      u.expected.action === primary.resolution.action && u.expected.category === primary.resolution.category && u.expected.parameter === primary.resolution.parameter,
      `C5 unit ${u.unitId}: expected resolution must equal the primary (first) ticket's own resolution`,
    );
  }
  console.log("  (e) C5 resolution == first action's — OK");

  // (f) state checkpoint round-trips, and resume skips completed units.
  const tmpStatePath = join(mkdtempSync(join(tmpdir(), "calibration-dryrun-selfcheck-")), "state.json");
  const systemPrompt = extractAgentSystemPromptFromDefinitionFile(readFileSync(join(SCRIPT_DIR, "_b-arm-definition.md"), "utf8"));
  const responseQueue = unitsA.map((u) => `action: ${u.expected.action}\ncategory: ${u.expected.category}\nparameter: ${u.expected.parameter}`);
  let qi = 0;
  const echoStub: Provider = {
    kind: "openai",
    baseUrl: "http://stub.invalid",
    async chat(req) {
      const text = responseQueue[qi++]!;
      return { text, model: req.model, usage: { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0 } };
    },
  };

  const state1 = loadCalibrationState(tmpStatePath);
  for (const unit of unitsA) {
    const key = `${unit.config}:${unit.unitId}`;
    await onceWithHarnessRetry(tmpStatePath, state1, key, () => runCalibrationUnit(unit, systemPrompt, echoStub, 5000));
  }
  assert(Object.keys(state1.units).length === CONFIGS.length * CAL_TASK_COUNT, `expected ${CONFIGS.length * CAL_TASK_COUNT} checkpointed units, got ${Object.keys(state1.units).length}`);
  for (const u of unitsA) assert(state1.units[`${u.config}:${u.unitId}`]?.match === true, `stub echo for ${u.config}:${u.unitId} must score as a match`);

  const reloaded = loadCalibrationState(tmpStatePath);
  assert(JSON.stringify(reloaded.units) === JSON.stringify(state1.units), "state checkpoint must round-trip byte-identically through save/load");

  let extraCalls = 0;
  const refusingStub: Provider = {
    kind: "openai",
    baseUrl: "http://stub.invalid",
    async chat() {
      extraCalls++;
      throw new Error("should not be called on resume — every unit is already checkpointed");
    },
  };
  const resumedState = loadCalibrationState(tmpStatePath);
  for (const unit of unitsA) {
    const key = `${unit.config}:${unit.unitId}`;
    await onceWithHarnessRetry(tmpStatePath, resumedState, key, () => runCalibrationUnit(unit, systemPrompt, refusingStub, 5000));
  }
  assert(extraCalls === 0, "resume must skip every completed unit — no chat() calls expected");
  console.log("  (f) state checkpoint round-trip + resume skip — OK");

  console.log("\n=> SELFCHECK PASSED");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selfcheck")) {
    selfcheck().catch((e) => {
      console.error("SELFCHECK FAILED:", e?.stack ?? e?.message ?? e);
      process.exit(1);
    });
  } else {
    main().catch((e) => {
      console.error("FAILED:", e?.stack ?? e?.message ?? e);
      process.exit(1);
    });
  }
}
