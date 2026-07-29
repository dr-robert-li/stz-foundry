/**
 * Agent battery types + the fail-closed `OracleReceipt` construction gate
 * (Phase 1 — Agentic eval seam, Plan 01-02 — the full six-trap guard).
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
 * value, and neither can a zero-task battery or a check-less task.
 */
import { AGENT_ROLE_IDENTITIES } from "../contract/contract-engine.js";
import type { PredicateCheck } from "../contract/contract-types.js";

export type OracleKind = "execution" | "constructed" | "replay" | "anchored-judge";

const ORACLE_KINDS: ReadonlySet<OracleKind> = new Set([
  "execution",
  "constructed",
  "replay",
  "anchored-judge",
]);

/** Provenance-style receipt (D-02/REQ-11): every battery, and every result
 *  derived from one, carries this so a fitness number traces to its oracle
 *  class and the human who accepted the generator.
 *
 *  ponytail: `lineage` is a FLAT, self-contained `<kind>:<id>` ancestry list.
 *  Entries resolve against nothing — there is no receipt store in this phase
 *  and N9 forbids adding one (RESEARCH open question 1 / assumption A2).
 *  "Machine-checkable" therefore means the root entry's KIND is parseable and
 *  checkable, which is exactly what `resolveRootKind` needs and no more.
 *  Upgrade trigger: a later phase gives lineage entries a resolvable store,
 *  turning lineage integrity into real cycle detection over a walked graph. */
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

export class BatteryShapeError extends Error {
  constructor(message: string) {
    super(`[foundry:battery] ${message}`);
    this.name = "BatteryShapeError";
  }
}

/**
 * Resolve the root `OracleKind` of a receipt's lineage. This function has NO
 * exogeneity opinion at all — that is a separate, sequential step
 * (`EXOGENOUS_ROOT_KINDS.has(...)`, in `validateReceipt` below) by design
 * (RESEARCH Pitfall 2: a validator whose logic is one compound boolean is the
 * review warning sign, independent of whether tests happen to pass).
 *
 * - `lineage` empty → the root is the receipt's own `kind`.
 * - otherwise → parse `lineage[0]`, splitting on the first `:`. Fail closed:
 *   an entry with no `:`, an empty prefix, an empty id, or a prefix outside
 *   `OracleKind` throws — an unparseable root is never treated as exogenous.
 */
export function resolveRootKind(receipt: OracleReceipt): OracleKind {
  if (receipt.lineage.length === 0) {
    return receipt.kind;
  }
  const entry = receipt.lineage[0]!;
  const idx = entry.indexOf(":");
  if (idx <= 0 || idx === entry.length - 1) {
    throw new OracleReceiptError(
      `lineage root entry ${JSON.stringify(entry)} is not a "<kind>:<id>" pair`,
    );
  }
  const prefix = entry.slice(0, idx);
  if (!ORACLE_KINDS.has(prefix as OracleKind)) {
    throw new OracleReceiptError(
      `lineage root entry ${JSON.stringify(entry)} has kind ${JSON.stringify(prefix)}, ` +
        `which is not a known OracleKind`,
    );
  }
  return prefix as OracleKind;
}

/** The id part of a flat lineage entry — everything after the first `:`, or
 *  the whole entry when there is no `:` (used only for the self-reference
 *  check, which must run even against a shape-malformed entry). */
function idPartOf(entry: string): string {
  const idx = entry.indexOf(":");
  return idx >= 0 ? entry.slice(idx + 1) : entry;
}

/**
 * Validate a receipt in full, in order: the human gate, lineage integrity,
 * then exogeneity. Throws `OracleReceiptError` naming the concrete violation
 * — never flag-and-continue (D-02, REQ-12).
 */
export function validateReceipt(receipt: OracleReceipt, batteryId: string): void {
  // 1. acceptedBy normalization + human gate (mirrors humanAccept,
  //    contract-engine.ts:72-97). An agent-role acceptor is exactly the
  //    in-loop synthesis the hard invariant forbids (D-02, REQ-11).
  const acceptor = receipt.acceptedBy.trim();
  if (acceptor === "") {
    throw new OracleReceiptError(
      `receipt for battery "${batteryId}" requires a non-empty human acceptedBy`,
    );
  }
  if (AGENT_ROLE_IDENTITIES.has(acceptor.toLowerCase())) {
    throw new OracleReceiptError(
      `acceptedBy "${receipt.acceptedBy}" is an agent role — only a human may accept an ` +
        `oracle receipt (the α>0 exogenous signal). Supply a real human identity.`,
    );
  }

  // 2. Lineage integrity. With a flat list, a cycle reduces to a repeat or a
  //    self-reference; there is no graph to walk (see the `lineage` field's
  //    ponytail comment for the upgrade trigger).
  const seen = new Set<string>();
  for (const entry of receipt.lineage) {
    if (seen.has(entry)) {
      throw new OracleReceiptError(
        `lineage contains a duplicate entry ${JSON.stringify(entry)} — self-referential lineage`,
      );
    }
    seen.add(entry);
    if (idPartOf(entry) === batteryId) {
      throw new OracleReceiptError(
        `lineage entry ${JSON.stringify(entry)} references battery id "${batteryId}" — ` +
          `self-referential lineage`,
      );
    }
  }

  // 3. Exogeneity — two named sequential steps, never one compound boolean.
  const rootKind = resolveRootKind(receipt);
  if (!EXOGENOUS_ROOT_KINDS.has(rootKind)) {
    throw new OracleReceiptError(
      `battery "${batteryId}" receipt roots in "${rootKind}", which is not an exogenous ` +
        `source (must be one of ${[...EXOGENOUS_ROOT_KINDS].join(", ")}) — "anchored-judge" ` +
        `is an amortizer and can never be the sole exogenous root`,
    );
  }
}

/**
 * The ONLY way to obtain an `AgentBattery` value (mirrors `humanAccept`,
 * src/contract/contract-engine.ts:72-97). Runs the receipt gate, then the
 * battery/task/check shape guards — each throwing `BatteryShapeError` naming
 * the concrete violation — then returns a frozen, defensively-copied value so
 * a validated battery cannot be mutated into an invalid one after the gate.
 */
export function makeBattery(draft: {
  id: string;
  tasks: BatteryTask[];
  receipt: OracleReceipt;
}): AgentBattery {
  const id = draft.id.trim();
  if (id === "") {
    throw new BatteryShapeError(`battery id must be non-empty`);
  }

  validateReceipt(draft.receipt, id);

  // A battery with no tasks trivially passes every candidate agent — the
  // α→0 shape at the construction altitude. Mirrors predicate-eval.ts:55's
  // check-set-level `checks.length > 0` spec-vacuity rule one level up.
  if (draft.tasks.length === 0) {
    throw new BatteryShapeError(
      `battery "${id}" has zero tasks — a battery with no tasks trivially passes every ` +
        `candidate agent`,
    );
  }

  const taskIds = new Set<string>();
  const frozenTasks: BatteryTask[] = [];
  for (const task of draft.tasks) {
    const taskId = task.id.trim();
    if (taskId === "") {
      throw new BatteryShapeError(`battery "${id}" has a task with an empty id`);
    }
    // runAgentBattery joins pool records back to tasks by id — duplicates
    // would silently mis-attribute a result.
    if (taskIds.has(taskId)) {
      throw new BatteryShapeError(`battery "${id}" has duplicate task id "${taskId}"`);
    }
    taskIds.add(taskId);
    if (task.prompt.trim() === "") {
      throw new BatteryShapeError(`battery "${id}" task "${taskId}" has an empty prompt`);
    }
    if (task.checks.length === 0) {
      throw new BatteryShapeError(
        `battery "${id}" task "${taskId}" has zero checks — a check-less task trivially passes`,
      );
    }
    // Observations is keyed by checkId — duplicates would silently collapse
    // two checks into one.
    const checkIds = new Set<string>();
    for (const check of task.checks) {
      if (checkIds.has(check.checkId)) {
        throw new BatteryShapeError(
          `battery "${id}" task "${taskId}" has duplicate checkId "${check.checkId}"`,
        );
      }
      checkIds.add(check.checkId);
    }
    frozenTasks.push(
      Object.freeze({
        id: taskId,
        prompt: task.prompt,
        checks: Object.freeze([...task.checks]) as PredicateCheck[],
      }),
    );
  }

  return Object.freeze({
    schemaVersion: 1,
    id,
    tasks: Object.freeze(frozenTasks) as BatteryTask[],
    receipt: Object.freeze({
      ...draft.receipt,
      lineage: Object.freeze([...draft.receipt.lineage]) as string[],
    }) as OracleReceipt,
  });
}
