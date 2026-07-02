/**
 * Bounded failure escalation (F14, R1 mitigation).
 *
 *   no passers → GRPO retry rounds (losers' pressure log as negative context)
 *             → replanning loops (failure analysis fed back into planning)
 *             → halt with a structured failure report.
 *
 * This FSM is the single source of truth for "are we allowed to try again?" —
 * the orchestrator must consult it and never loop on its own. The bounds are
 * policy-driven (run-config `retryPolicy`, persisted into slice state so the
 * FSM is replayable from state.json alone): `0` halts immediately, `n` bounds
 * that stage, `-1` never exhausts it (dangerous — only the token/USD hard
 * caps stop the run). Defaults preserve the earned ceiling: retries then
 * replans then halt.
 */
import type { EscalationStage, RetryPolicy } from "./types.js";

export interface EscalationState {
  stage: EscalationStage;
  retryCount: number;
  replanCount: number;
}

export const MAX_RETRIES = 1;
export const MAX_REPLANS = 1;

/** Engine default when no policy is configured — the earned 1 retry + 1 replan. */
export const DEFAULT_RETRY_POLICY: RetryPolicy = { retries: MAX_RETRIES, replans: MAX_REPLANS };

/** `-1` means unbounded; any other value is the cap itself. */
function withinCap(count: number, cap: number): boolean {
  return cap === -1 || count < cap;
}

export function initialEscalation(): EscalationState {
  return { stage: "normal", retryCount: 0, replanCount: 0 };
}

export type EscalationAction =
  | { type: "retry"; note: string }
  | { type: "replan"; note: string }
  | { type: "halt"; note: string };

/**
 * Given the current escalation state after a tournament produced no gate-passers,
 * decide the next action and return the advanced state. Pure function: same
 * input (state + policy) → same output (N6).
 */
export function onNoPassers(
  s: EscalationState,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): {
  next: EscalationState;
  action: EscalationAction;
} {
  if (withinCap(s.retryCount, policy.retries)) {
    return {
      next: { stage: "grpo-retry", retryCount: s.retryCount + 1, replanCount: s.replanCount },
      action: {
        type: "retry",
        note: "Re-running tournament with pressure log + K=4 surviving summaries as PDR refinement context.",
      },
    };
  }
  if (withinCap(s.replanCount, policy.replans)) {
    return {
      next: { stage: "replan", retryCount: s.retryCount, replanCount: s.replanCount + 1 },
      action: {
        type: "replan",
        note: "Re-entering planning phase with failure analysis from the prior round.",
      },
    };
  }
  return {
    next: { stage: "halted", retryCount: s.retryCount, replanCount: s.replanCount },
    action: {
      type: "halt",
      note: "Retry and replan budgets exhausted. Emitting structured failure report.",
    },
  };
}

/** True once no further attempts are permitted. */
export function isHalted(s: EscalationState): boolean {
  return s.stage === "halted";
}

/**
 * Drive the FSM to terminal state from a given start, recording the action
 * sequence. Used to prove the ceiling holds (test) and to dry-run the path.
 * Throws if a BOUNDED policy fails to terminate; unbounded (`-1`) policies
 * must not be traced (they never halt by design).
 */
export function escalationTrace(
  start = initialEscalation(),
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): EscalationAction[] {
  if (policy.retries === -1 || policy.replans === -1)
    throw new Error("escalationTrace: unbounded policy never terminates");
  const actions: EscalationAction[] = [];
  let s = start;
  // Bound the loop independently as a belt-and-suspenders guard; the FSM must
  // terminate in at most retries + replans + 1 steps.
  for (let guard = 0; guard < policy.retries + policy.replans + 5; guard++) {
    const { next, action } = onNoPassers(s, policy);
    actions.push(action);
    s = next;
    if (action.type === "halt") return actions;
  }
  throw new Error("escalation FSM failed to terminate — ceiling violated");
}
