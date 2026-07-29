/**
 * Agent battery types + the fail-closed `OracleReceipt` construction gate
 * (Phase 1 — Agentic eval seam, Plan 01-01 tracer).
 *
 * `AgentBattery` is the task-battery analog of a contract `Predicate`, without
 * the `ContractState` lifecycle a battery task does not have (RESEARCH
 * "Battery shape"): `BatteryTask.checks` reuses `PredicateCheck` verbatim
 * (D-05/REQ-10) instead of redefining a check type.
 *
 * `makeBattery()` mirrors `humanAccept` (src/contract/contract-engine.ts) — a
 * fail-closed factory that throws on the concrete violation rather than
 * flagging one. A battery whose receipt lineage roots in `anchored-judge`
 * (an amortizer, never an exogenous source — CONTEXT D2) cannot exist as a
 * value.
 */
import type { PredicateCheck } from "../contract/contract-types.js";

export type OracleKind = "execution" | "constructed" | "replay" | "anchored-judge";

/** Provenance-style receipt (D-02/REQ-11): every battery, and every result
 *  derived from one, carries this so a fitness number traces to its oracle
 *  class and the human who accepted the generator. */
export interface OracleReceipt {
  kind: OracleKind;
  acceptedBy: string;
  lineage: string[];
}

export interface BatteryTask {
  id: string;
  /** What the candidate agent is asked to do (system+user prompt content). */
  prompt: string;
  checks: PredicateCheck[];
}

export interface AgentBattery {
  schemaVersion: 1;
  id: string;
  tasks: BatteryTask[];
  receipt: OracleReceipt;
}

/** The three legal sources of exogenous bits (docs/development/harness-factory.md
 *  § "the three legal sources of exogenous bits"). `anchored-judge` is
 *  deliberately excluded — it amortizes truth, it never creates it. */
export const EXOGENOUS_ROOT_KINDS: ReadonlySet<OracleKind> = new Set([
  "execution",
  "constructed",
  "replay",
]);

export class OracleReceiptError extends Error {
  constructor(message: string) {
    super(`[foundry:oracle-receipt] ${message}`);
    this.name = "OracleReceiptError";
  }
}

/**
 * Resolve the exogenous root kind of a receipt. Only the empty-lineage case
 * (root = receipt.kind) is implemented here — walking a non-empty `lineage`
 * to resolve a deeper root, the `acceptedBy` human gate, and the
 * zero-task/self-referential-lineage vacuity guards all land in plan 01-02.
 * This is a narrowing of the same function, not a different design.
 */
function resolveRootKind(receipt: OracleReceipt): OracleKind {
  return receipt.kind;
}

/**
 * The ONLY way to obtain an `AgentBattery` value (mirrors `humanAccept`,
 * src/contract/contract-engine.ts:72-97). Throws `OracleReceiptError` naming
 * the offending kind when the receipt's root is not an exogenous source —
 * never flag-and-continue (D-02, REQ-12).
 */
export function makeBattery(draft: {
  id: string;
  tasks: BatteryTask[];
  receipt: OracleReceipt;
}): AgentBattery {
  const rootKind = resolveRootKind(draft.receipt);
  if (!EXOGENOUS_ROOT_KINDS.has(rootKind)) {
    throw new OracleReceiptError(
      `battery "${draft.id}" receipt roots in "${rootKind}", which is not an ` +
        `exogenous source (must be one of ${[...EXOGENOUS_ROOT_KINDS].join(", ")}) — ` +
        `"anchored-judge" is an amortizer and can never be the sole exogenous root`,
    );
  }
  return { schemaVersion: 1, id: draft.id, tasks: draft.tasks, receipt: draft.receipt };
}
