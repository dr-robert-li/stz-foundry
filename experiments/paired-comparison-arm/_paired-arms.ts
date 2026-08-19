/**
 * The paired-round arm-slot/checkpoint core (Phase 14 — Instrument build,
 * Plan 14-01, REQ-68/REQ-69). Importable, side-effect-free study core —
 * mirrors `_dualfix-arms.ts`'s own two-file split
 * (`_dualfix-arms.ts`/`_dualfix-study.ts`): a later plan's driver imports
 * and drives this file; this file never reads `TOURNEY_STATE` or any other
 * environment variable itself. Copied IN SHAPE from `_dualfix-arms.ts` —
 * never pulled in from it, or from any other prior study's own driver files
 * (`14-RESEARCH.md` §7): the shape is re-derived here, exactly as the
 * paired-round pattern requires.
 *
 * RECEIPT-FREE BY CONSTRUCTION, in the same terms `_dualfix-arms.ts` states
 * it: tickets here are built through `customer-support-warehouse.ts`'s one
 * direct builder (`generateCustomerSupportTicket`) only — this file never
 * mints an `OracleReceipt` or a branded battery value, and pulls in nothing
 * from `battery-types.ts` or `fixture-warehouse.ts`.
 *
 * INDEPENDENT-ORACLE SCORING, NEVER SELF-GRADED. `runArmOnPairingUnit`
 * below is the ONE place in this file that calls
 * `classifyCustomerSupportResponse` — both arm slots route through it,
 * scored identically and independently.
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
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
import { PAIRED_MODEL, PAIRED_TIMEOUT_MS, PAIRED_MAX_PROMPT_CHARS } from "./_paired-constants.js";
import type { Provider } from "../../src/foundry/provider.js";

// ── the two arm slots ────────────────────────────────────────────────────

export const PAIRED_ARM_SLOTS = Object.freeze(["W", "B"] as const);
export type PairedArmSlot = (typeof PAIRED_ARM_SLOTS)[number];

/** A pairing unit's own identity — `${seed}:${taskIndex}`, distinct from
 *  the checkpoint key below (which additionally folds in the arm). */
export function pairingUnitId(seed: number, taskIndex: number): string {
  return `${seed}:${taskIndex}`;
}

/** `${arm}:${pairingUnitId}` — so the two arms' results for one pairing
 *  unit can never collide in the checkpoint state map. */
export function pairedUnitKey(arm: PairedArmSlot, unitId: string): string {
  return `${arm}:${unitId}`;
}

/** A `CandidateAgent`-shaped value — the agent definition text a plan-14-05
 *  committed artifact supplies for W and B alike; this file never invents
 *  one. Deliberately not pulled in from `agent-runner.ts`: this file's own
 *  import surface stays minimal, per the receipt-free rule above. */
export interface PairedAgentDefinition {
  id: string;
  systemPrompt: string;
}

export interface PairedArmResult {
  arm: PairedArmSlot;
  unitId: string;
  /** `ok` never means "correct" — it means the harness got a complete
   *  answer; the oracle's own `category`/`score` below is the correctness
   *  read. */
  status: "ok" | "timeout" | "error";
  failureReason?: string;
  rawText: string;
  oracleCategory: CustomerSupportOracleCategory;
  score: 0 | 1;
  inputTokens: number;
  outputTokens: number;
  wallMs: number;
}

/** Exported so a test can assert a truncated prompt ends with this exact
 *  string, rather than duplicating the literal (mirrors
 *  `DUALFIX_TRUNCATION_MARKER`). */
export const PAIRED_TRUNCATION_MARKER = "\n…[paired-round prompt truncated at PAIRED_MAX_PROMPT_CHARS]";

/** Cuts `text` to `PAIRED_MAX_PROMPT_CHARS`, appending a visible marker —
 *  never a silent cut. Applied identically to both arm slots. */
function truncatePairedPrompt(text: string): string {
  if (text.length <= PAIRED_MAX_PROMPT_CHARS) return text;
  const budget = PAIRED_MAX_PROMPT_CHARS - PAIRED_TRUNCATION_MARKER.length;
  return text.slice(0, Math.max(budget, 0)) + PAIRED_TRUNCATION_MARKER;
}

/**
 * The IDENTICAL task prompt both arm slots see for one pairing unit: the
 * ticket text, both closed vocabularies shown verbatim (so neither arm
 * guesses the allowed label wording), and the three-label output contract
 * (`RESOLUTION_FIELD_LABELS`, the same literals the oracle's own extraction
 * step reads). Truncated at the pinned character bound.
 */
export function buildPairedTaskPrompt(ticket: CustomerSupportTicket): { system: string; user: string } {
  const system =
    "You are a customer-support agent triaging a single support ticket. Respond with EXACTLY three " +
    "labelled lines, one per line, in this form and no other text: " +
    RESOLUTION_FIELD_LABELS.map((label) => `${label}: <value>`).join(", ") +
    `. Allowed "action" values: ${CUSTOMER_SUPPORT_ACTIONS.join(", ")}. Allowed "category" values: ` +
    `${CUSTOMER_SUPPORT_CATEGORIES.join(", ")}. The "parameter" value is a dollar amount, two decimal places.`;

  const user = truncatePairedPrompt(`Ticket:\n${ticket.ticketText}`);
  return { system, user };
}

export interface RunArmOnPairingUnitOptions {
  taskTimeoutMs?: number;
}

/**
 * Runs ONE arm slot on ONE pairing unit: builds the identical task prompt
 * (both slots, one call each), passes the pinned model explicitly (never a
 * provider default), truncates at the pinned character bound, then scores
 * the raw response through the independent oracle — the sole call site for
 * `classifyCustomerSupportResponse` in this file.
 */
export async function runArmOnPairingUnit(
  ticket: CustomerSupportTicket,
  unitId: string,
  arm: PairedArmSlot,
  agentDefinition: PairedAgentDefinition,
  provider: Provider,
  opts: RunArmOnPairingUnitOptions = {},
): Promise<PairedArmResult> {
  const taskTimeoutMs = opts.taskTimeoutMs ?? PAIRED_TIMEOUT_MS;
  const { user } = buildPairedTaskPrompt(ticket);

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
    const attempt = provider.chat({
      model: PAIRED_MODEL,
      system: agentDefinition.systemPrompt,
      messages: [{ role: "user", content: user }],
    });
    // See `_dualfix-arms.ts` WR-08: a late-rejecting `attempt` after the
    // timer already won the race must not surface as an unhandled
    // rejection — attach a no-op catch purely to mark it handled.
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
    arm,
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

// ── the pair classifier — §5's win/loss/tie rule, plain integer comparison ─

export type PairOutcome = "win" | "loss" | "tie";

/** §5: WIN iff W scores 1 and B scores 0; LOSS iff W scores 0 and B scores
 *  1; TIE iff both score identically. Plain integer equality — the score
 *  type is binary, never a graded value, so no tolerance clause applies. */
export function classifyPair(scoreW: 0 | 1, scoreB: 0 | 1): PairOutcome {
  if (scoreW === scoreB) return "tie";
  return scoreW > scoreB ? "win" : "loss";
}

// ── the checkpoint contract (copied in shape from `_dualfix-arms.ts`, state
// path taken as an explicit PARAMETER — no module-level env read here; a
// later plan's driver owns `TOURNEY_STATE`) ────────────────────────────────

export interface PairedState {
  units: Record<string, PairedArmResult>;
  retries: string[];
  runConfig?: Record<string, unknown>;
}

export function loadState(statePath: string): PairedState {
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8")) as Partial<PairedState>;
    return { units: parsed.units ?? {}, retries: parsed.retries ?? [], runConfig: parsed.runConfig };
  } catch (e) {
    // ENOENT is the ONLY case for which "no state yet, start fresh" is
    // correct — every other failure (corrupt/truncated JSON, EACCES, a
    // typo'd state path resolving to an unrelated existing file) must not
    // be swallowed into empty state, mirroring `_dualfix-arms.ts`'s own
    // WR-09 rationale.
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return { units: {}, retries: [] };
    throw e;
  }
}

/** Atomic tmp+rename, so a kill mid-write cannot leave a truncated state
 *  (T-14-04). */
export function saveState(statePath: string, state: PairedState): void {
  writeFileSync(`${statePath}.tmp`, JSON.stringify(state, null, 2));
  renameSync(`${statePath}.tmp`, statePath);
}

/** Runs `key` once, ever — a cached entry short-circuits `work` entirely
 *  (a resumed run does not repeat the inference). */
export async function once(
  statePath: string,
  state: PairedState,
  key: string,
  work: () => Promise<PairedArmResult>,
): Promise<PairedArmResult> {
  const cached = state.units[key];
  if (cached) return cached;
  const result = await work();
  state.units[key] = result;
  saveState(statePath, state);
  return result;
}

export type { CustomerSupportTicket };
export { generateCustomerSupportTicket };
