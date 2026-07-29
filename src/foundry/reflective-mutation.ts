/**
 * GEPA-style bounded reflective prompt mutation (Phase 2 — Component
 * tournaments, Plan 02-04, D-04/CONTEXT D4).
 *
 * A prompt-text specimen is mutated FROM the execution trace of a prior
 * battery run — the failing checks' expected/actual/description and any
 * task-level failure reason — never by blind substitution (arXiv:2507.19457:
 * reflective evolution beats GRPO-style RL at ~35x fewer rollouts). The trace
 * is bounded (`MAX_REFLECTION_TRACE_CHARS`) and the number of reflections is
 * bounded (`onReflection`'s FSM); exceeding either halts and surfaces rather
 * than truncating silently (the same kill-switch posture as every other cap
 * in this codebase — nothing here auto-rewrites its own guard).
 */
import type { BatteryRun, CandidateAgent } from "./agent-runner.js";
import { DEFAULT_BATTERY_MODEL } from "./agent-runner.js";
import type { Provider } from "./provider.js";
import type { FoundryCostMeter } from "./cost.js";

/**
 * `evalCheck` (src/contract/predicate-eval.ts) writes this literal into
 * `CheckResult.actual` when a check had no observation at all. Not exported
 * from that module (out of this plan's `files_modified`), so duplicated here
 * deliberately — the two strings must stay in sync; a grep for the literal
 * would catch drift.
 */
const NO_OBSERVATION_SENTINEL = "<no-observation>";

/**
 * Primary bound on the runaway-token loop the security domain names (T-02-05):
 * a candidate's own output flows into the NEXT generation's mutation prompt,
 * so an unbounded concatenation compounds across generations. Exported (not
 * an inline literal) so a caller/test can assert against the same number the
 * truncation logic enforces — the same posture as `agent-runner.ts`'s
 * `AGENT_BATTERY_COVERAGE_SENTINEL`/`AGENT_BATTERY_MUTATION_SENTINEL`.
 */
export const MAX_REFLECTION_TRACE_CHARS = 4000;

/** Exported so a test can assert a truncated trace ends with this exact
 *  string, rather than duplicating the literal. */
export const TRUNCATION_MARKER = "\n…[reflection trace truncated at MAX_REFLECTION_TRACE_CHARS]";

/** Cut `full` to fit `MAX_REFLECTION_TRACE_CHARS`, at a whole-line boundary,
 *  with a visible marker appended — never a silent cut. */
function truncateTrace(full: string): string {
  if (full.length <= MAX_REFLECTION_TRACE_CHARS) return full;
  const budget = MAX_REFLECTION_TRACE_CHARS - TRUNCATION_MARKER.length;
  let cut = full.slice(0, Math.max(0, budget));
  const lastNewline = cut.lastIndexOf("\n");
  if (lastNewline > 0) cut = cut.slice(0, lastNewline);
  return cut + TRUNCATION_MARKER;
}

/**
 * Build the reflection prompt's substrate from a `BatteryRun` — pure,
 * deterministic, iterates `run.tasks` then each task's `checks` in array
 * order (N6). Emits a section per FAILING task only:
 *  - a non-`ok` task (timeout/error) renders its `failureReason`;
 *  - a scored task renders each FAILING check's id/description/expected/
 *    actual, skipping passing checks;
 *  - a check with no observation renders distinguishably from a check that
 *    produced a wrong value (RESEARCH Pitfall 5's own distinction: "produced
 *    nothing" and "produced the wrong thing" call for different mutations).
 * A run with zero failures produces `""` — the caller-recognisable
 * empty-of-failures signal `reflectMutate` refuses to spend a reflection on.
 */
export function buildReflectionTrace(run: BatteryRun): string {
  const lines: string[] = [];
  for (const task of run.tasks) {
    if (task.status !== "ok") {
      lines.push(`Task ${task.taskId} (${task.status}): ${task.failureReason ?? "no reason recorded"}`);
      continue;
    }
    const failing = task.checks.filter((c) => !c.pass);
    if (failing.length === 0) continue;
    lines.push(`Task ${task.taskId}:`);
    for (const c of failing) {
      const actualDesc =
        c.actual === NO_OBSERVATION_SENTINEL
          ? "produced NOTHING (no observation was made)"
          : `produced the WRONG VALUE: ${JSON.stringify(c.actual)}`;
      lines.push(`  - [${c.checkId}] ${c.description}: expected ${JSON.stringify(c.expected)}, ${actualDesc}`);
    }
  }
  return truncateTrace(lines.join("\n"));
}

// ── the reflection-budget FSM — a small sibling of harness.ts's onGeneration,
// following the identical {next, action} halt-and-surface idiom, and
// escalation.ts's withinCap -1-means-unbounded convention. NOT a fork of
// either — a separate, independently-exceedable cap (D-04/RESEARCH Pitfall
// 4): the search horizon (onGeneration, reused verbatim in
// component-tournament.ts) and the reflection budget (this FSM) must each
// halt and surface with their OWN named reason, so a test can tell which
// cap fired. ────────────────────────────────────────────────────────────────

/** Default reflection budget when a caller supplies none — generous enough
 *  to mutate every candidate across `MAX_GENERATIONS_DEFAULT` (harness.ts)
 *  generations without being the incidental cap in an untuned scenario. */
export const DEFAULT_REFLECTION_BUDGET = 10;

export interface ReflectionState {
  used: number;
  cap: number;
}

/** `-1` means unbounded, matching `escalation.ts`'s `withinCap` convention. */
function withinReflectionCap(used: number, cap: number): boolean {
  return cap === -1 || used < cap;
}

export function initialReflection(cap: number = DEFAULT_REFLECTION_BUDGET): ReflectionState {
  return { used: 0, cap };
}

export type ReflectionAction =
  | { type: "reflect"; note: string }
  | { type: "halt"; note: string };

/**
 * Advance the reflection-budget FSM. Pure (N6). Below the cap: increment
 * `used`, return the reflect action. At the cap: halt, with a note naming the
 * reflection budget AND the cap value explicitly — the specificity a test
 * needs to prove THIS cap fired, not the search horizon.
 */
export function onReflection(s: ReflectionState): { next: ReflectionState; action: ReflectionAction } {
  if (!withinReflectionCap(s.used, s.cap)) {
    return {
      next: s,
      action: {
        type: "halt",
        note: `Reflection budget exhausted (cap=${s.cap}, used=${s.used}); halting rather than mutating further.`,
      },
    };
  }
  const used = s.used + 1;
  return {
    next: { ...s, used },
    action: { type: "reflect", note: `Reflecting (${used}/${s.cap === -1 ? "unbounded" : s.cap}).` },
  };
}

// ── the mutation call itself ────────────────────────────────────────────────

export class ReflectionRefusedError extends Error {
  constructor(message: string) {
    super(`[foundry:reflective-mutation] ${message}`);
    this.name = "ReflectionRefusedError";
  }
}

/**
 * The YAML frontmatter block between the leading `---` delimiter and the
 * next `---` line, or `""` when absent. Moved here from
 * `component-tournament.ts` (this plan's own `<action>` — "or move that
 * helper here if the import direction is cleaner"): `component-tournament.ts`
 * needs to import `buildReflectionTrace`/`reflectMutate`/the budget FSM from
 * THIS module (02-04 task 2), so this module cannot import back from
 * `component-tournament.ts` without a cycle. `component-tournament.ts`
 * re-exports this symbol so its existing importers are unaffected.
 */
export function agentFrontmatter(text: string): string {
  const lines = text.split("\n");
  if ((lines[0] ?? "").trim() !== "---") return "";
  const end = lines.slice(1).findIndex((l) => l.trim() === "---");
  if (end === -1) return "";
  return lines.slice(1, end + 1).join("\n");
}

/** Everything after the closing frontmatter delimiter, or the whole text
 *  when there is no frontmatter. The mirror half of `agentFrontmatter`. */
function agentBody(text: string): string {
  const lines = text.split("\n");
  if ((lines[0] ?? "").trim() !== "---") return text;
  const end = lines.slice(1).findIndex((l) => l.trim() === "---");
  if (end === -1) return text;
  return lines.slice(1 + end + 1).join("\n");
}

export interface ReflectMutateOptions {
  model?: string;
  costMeter?: FoundryCostMeter;
}

/**
 * One bounded, metered mutation call. Asks `provider` to rewrite the parent
 * agent-definition's BODY to fix the failures named in `trace`, then
 * structurally re-attaches the PARENT's own frontmatter block — a mutation
 * cannot re-declare the agent's tool allowlist even if the model tries
 * (T-02-13). `component-tournament.ts`'s `interfaceParity` gate is retained
 * as defense in depth for definitions arriving by other routes (a
 * caller-supplied candidate, a future phase-3 assembly step) — the same
 * posture phase 1 settled on when `runAgentBattery` re-validated a receipt
 * the brand already guaranteed. Neither half is redundant; do not delete
 * either as dead code.
 *
 * Refuses (throws `ReflectionRefusedError`) when `trace` carries no
 * failures — a reflection is never spent on a content-free prompt.
 */
export async function reflectMutate(
  parent: CandidateAgent,
  trace: string,
  provider: Provider,
  opts: ReflectMutateOptions = {},
): Promise<CandidateAgent> {
  if (trace.trim() === "") {
    throw new ReflectionRefusedError(
      "refusing to spend a reflection on a trace with no failures — nothing to fix",
    );
  }

  const frontmatterBlock = agentFrontmatter(parent.systemPrompt);
  const parentBody = agentBody(parent.systemPrompt);
  const model = opts.model ?? DEFAULT_BATTERY_MODEL;

  const res = await provider.chat({
    model,
    system:
      "You are revising an AI agent's system-prompt BODY to fix the failures listed in the " +
      "execution trace below. Return ONLY the replacement body text — no frontmatter block, " +
      "no code fences, no commentary.",
    messages: [
      {
        role: "user",
        content: `Current agent body:\n${parentBody}\n\nExecution trace — fix these failures:\n${trace}`,
      },
    ],
  });

  // Same call shape agent-runner.ts's implement() closure uses: meter when
  // supplied, so mutation spend goes through the existing governance rather
  // than around it (CONTEXT N5/N9). Never short-circuited on a cap breach —
  // FoundryCostMeter.add records before it throws, matching the rest of the
  // codebase's "audit trail survives the halt" posture.
  if (opts.costMeter) {
    opts.costMeter.add("reflective-mutation", model, res.usage, parent.id);
  }

  // Never executed or evaluated (ASVS V10) — `res.text` only ever flows into
  // `agentBody` (a string transform) and the returned `CandidateAgent`,
  // itself only ever consumed by a future `provider.chat` call.
  const mutatedBody = agentBody(res.text);
  const systemPrompt = frontmatterBlock
    ? `---\n${frontmatterBlock}\n---\n${mutatedBody}`
    : mutatedBody;

  return { id: parent.id, systemPrompt };
}
