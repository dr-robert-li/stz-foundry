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

/**
 * Optional PARTIAL CREDIT for one check, consumed by `gradeTask`
 * (`src/foundry/grade.ts`) — never by `evalCheck`.
 *
 * The separation gate (`experiments/dataops-agent-pilot/PILOT-RESULTS.md`)
 * measured why this exists: with exact-integer equality on a 6-digit
 * `revenueCents` and 6 binary tasks, `testPassRate` is quantized to 0.167 and
 * a near-miss scores identically to a wild miss. The entire measured spread
 * between a minimal and a strong system prompt (0.111) was smaller than one
 * scale point, so there was no gradient for a tournament to climb.
 *
 * This is deliberately NOT a change to `PredicateCheck`/`evalCheck`. Contract
 * pass/fail is a trust boundary — a predicate either holds or it does not, and
 * a "78% satisfied" contract is not a contract. Grading is a SELECTION signal
 * at the foundry altitude only: `pass` stays exact, and `passedGate` still
 * requires every check exact.
 */
export interface GradedSpec {
  /** Must name a check in the same task's `checks` — enforced by `makeBattery`. */
  checkId: string;
  /** Relative error, the only kind so far. ponytail: one kind, one branch.
   *  Upgrade trigger: a battery whose answer is not a scalar number. */
  kind: "relative-error";
  /** Credit decays linearly from 1 at exact to 0 at this relative error.
   *  Must be > 0 — enforced by `makeBattery`. */
  zeroAt: number;
}

export interface BatteryTask {
  id: string;
  /** What the candidate agent is asked to do (system+user prompt content). */
  prompt: string;
  checks: PredicateCheck[];
  /** Absent (the default, and every v1 task) => the task scores binary, exactly
   *  as before. Present => `gradeTask` scores it continuously. */
  grading?: GradedSpec[];
}

/** Type-only nominal brand. It has no runtime representation, so it costs
 *  nothing at runtime and cannot be forged in TypeScript: an object literal
 *  with the right fields does NOT satisfy `AgentBattery`, because a caller
 *  outside this module cannot name this symbol. Only `makeBattery` — which
 *  runs the receipt gate first — can mint the branded value.
 *
 *  This is what makes "no receipt, no battery" structural rather than a
 *  convention. Without it, `AgentBattery` was a plain structural interface and
 *  a hand-built literal rooted only in `anchored-judge` scored clean. */
declare const VALIDATED_BATTERY: unique symbol;

export interface AgentBattery {
  schemaVersion: 1;
  id: string;
  tasks: BatteryTask[];
  receipt: OracleReceipt;
  /**
   * Optional stage-1 gate bar: `passedGate` requires
   * `testPassRate >= (gateThreshold ?? 1)`. Absent ⇒ 1 — the existing
   * perfection bar, byte-identical.
   *
   * Declared at CONSTRUCTION, validated by `makeBattery`, frozen after — it
   * travels with the (human-accepted, receipt-rooted) instrument, never with
   * whoever happens to be running a selection. The measured reason it exists
   * (experiments/dataops-agent-pilot/PILOT-RESULTS.md): at the
   * agent-definition altitude fitness is a graded competence score no model
   * reaches 1.0 on, and the §3 run's perfection bar admitted a candidate
   * exactly once — on the seed whose battery was saturated and carried zero
   * selection signal. A perfection gate at that altitude selects FOR
   * uninformative batteries. The bar stays 1 by default because at the code
   * altitude it is correct: shipping code that fails its own tests is not
   * acceptable.
   */
  gateThreshold?: number;
  /** Brand — see `VALIDATED_BATTERY`. Never present at runtime. */
  readonly [VALIDATED_BATTERY]: true;
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
  gateThreshold?: number;
}): AgentBattery {
  const id = draft.id.trim();
  if (id === "") {
    throw new BatteryShapeError(`battery id must be non-empty`);
  }

  validateReceipt(draft.receipt, id);

  // Gate-threshold shape guard. Out-of-range values are refused at
  // construction, not clamped at use: a threshold of 0 (or below) makes
  // `passedGate` vacuously true for any run — the α→0 shape — and one above
  // 1 makes it vacuously false; NaN would poison the comparison silently.
  if (draft.gateThreshold !== undefined) {
    const t = draft.gateThreshold;
    if (!Number.isFinite(t) || t <= 0 || t > 1) {
      throw new BatteryShapeError(
        `battery "${id}" gateThreshold ${t} is invalid — must be a finite number in (0, 1]; ` +
          `0 would pass every run vacuously, >1 would fail every run vacuously`,
      );
    }
  }

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
    // Grading shape guards, each its own named `if`. A spec naming a check
    // that does not exist would silently never fire — the task would look
    // graded and score binary, which is the quiet-wrong-answer shape this
    // repo's guards exist to refuse. A non-positive `zeroAt` would divide
    // credit by zero and hand out `Infinity`/`NaN` as fitness.
    const gradedIds = new Set<string>();
    for (const spec of task.grading ?? []) {
      if (!checkIds.has(spec.checkId)) {
        throw new BatteryShapeError(
          `battery "${id}" task "${taskId}" grades unknown checkId "${spec.checkId}" — a grading ` +
            `spec naming no check would silently never fire (known: ${[...checkIds].join(", ")})`,
        );
      }
      if (gradedIds.has(spec.checkId)) {
        throw new BatteryShapeError(
          `battery "${id}" task "${taskId}" has duplicate grading spec for checkId ` +
            `"${spec.checkId}" — two credits for one check`,
        );
      }
      gradedIds.add(spec.checkId);
      if (!(spec.zeroAt > 0) || !Number.isFinite(spec.zeroAt)) {
        throw new BatteryShapeError(
          `battery "${id}" task "${taskId}" grading for "${spec.checkId}" has zeroAt ` +
            `${spec.zeroAt} — must be a finite number > 0`,
        );
      }
    }
    frozenTasks.push(
      Object.freeze({
        id: taskId,
        prompt: task.prompt,
        checks: Object.freeze([...task.checks]) as PredicateCheck[],
        // Absent stays absent — a task without grading must remain binary,
        // never silently acquire an empty grading array that a later reader
        // would mistake for "graded, but nothing graded".
        ...(task.grading ? { grading: Object.freeze(task.grading.map((s) => Object.freeze({ ...s }))) as GradedSpec[] } : {}),
      }),
    );
  }

  // The one cast that mints the brand. It is safe precisely here and nowhere
  // else: every gate above has already run on this value.
  return Object.freeze({
    schemaVersion: 1,
    id,
    tasks: Object.freeze(frozenTasks) as BatteryTask[],
    receipt: Object.freeze({
      ...draft.receipt,
      lineage: Object.freeze([...draft.receipt.lineage]) as string[],
    }) as OracleReceipt,
    // Absent stays absent — a battery without a declared threshold must not
    // silently acquire an explicit 1, which a later reader would mistake for
    // a deliberate declaration rather than the default.
    ...(draft.gateThreshold !== undefined ? { gateThreshold: draft.gateThreshold } : {}),
  }) as AgentBattery;
}

// ── search/promotion split (Phase 2, D-03/CONTEXT D3) ──────────────────────

/**
 * The Goodhart-bound battery split: `search` is available for hill-climbing,
 * `promotion` is held out for final selection ONLY (RESEARCH — the
 * generalization gap of searched agents grows with search horizon,
 * arXiv:2606.11045). Each half is independently `makeBattery()`-validated —
 * fail-closed on its own, not just as a pair.
 */
export interface SplitBattery {
  search: AgentBattery;
  promotion: AgentBattery;
}

/**
 * Construct a `SplitBattery` from two drafts, each independently run through
 * `makeBattery`'s full gate FIRST — a pair-level check never runs before a
 * per-half gate, so neither guard below can mask a per-half violation (a
 * zero-task or non-exogenous half still throws exactly as `makeBattery`
 * alone would). Then two separate pair-level checks (Phase 2, D-03/CONTEXT
 * D3), each its own named `if`, never one compound boolean:
 *
 *   1. distinct battery id — two halves sharing an id would otherwise
 *      silently defeat the whole point of a held-out promotion set.
 *   2. disjoint task-id sets — a task present in both halves means the
 *      "held-out" promotion set is silently the SAME set as the search set,
 *      one of the two named vacuity shapes this split exists to prevent.
 */
export function makeSplitBattery(
  searchDraft: { id: string; tasks: BatteryTask[]; receipt: OracleReceipt },
  promotionDraft: { id: string; tasks: BatteryTask[]; receipt: OracleReceipt },
): SplitBattery {
  const search = makeBattery(searchDraft);
  const held = makeBattery(promotionDraft);
  if (search.id === held.id) {
    throw new BatteryShapeError(
      `split battery halves share id "${search.id}" — search and promotion must be independently identifiable`,
    );
  }
  const searchTaskIds = new Set(search.tasks.map((t) => t.id));
  for (const task of held.tasks) {
    if (searchTaskIds.has(task.id)) {
      throw new BatteryShapeError(
        `split battery task id "${task.id}" appears in both "${search.id}" (search) and "${held.id}" ` +
          `(promotion) — a task present in both halves means the held-out promotion set is silently the ` +
          `same set as the search set, defeating the Goodhart bound this split exists to enforce`,
      );
    }
  }
  return { search, promotion: held };
}

/**
 * The seventh promotion gate's exogeneity step (Phase 2, D-02/CONTEXT D2),
 * modelled on `calibrationGate` (src/judge-reliability.ts): a function taking
 * REAL evidence — never a CLI-trusted boolean (PATTERNS Analog A is the shape
 * this must not become). Fail-closed: an absent receipt, or one whose
 * lineage doesn't parse, is a refusal, never a pass.
 *
 * Deliberately does NOT re-invoke `validateReceipt`'s human-gate/lineage-
 * integrity checks — those are already enforced at construction time
 * (`makeBattery`) for every receipt this gate sees via a real `BatteryRun`.
 * Re-running them here would make the resolve-then-check idiom below
 * unmutable-to-fail (any receipt that reaches this point past a full
 * `validateReceipt` call is, by that same function's own internal logic,
 * already guaranteed exogenous — a redundant re-check the mutation-check in
 * Task 2 would find is dead code, exactly RESEARCH Pitfall 1's vacuous-gate
 * shape). Keeping this function's OWN resolve/check pair as the sole
 * decision point keeps it genuinely, independently mutation-provable.
 * ponytail: a raw CLI-supplied receipt (bridge.ts `harnessPromote --receipt`)
 * that must also reject a non-human acceptor needs its own `validateReceipt`
 * call at that call site. Upgrade trigger: a forged-acceptor bug report
 * against the CLI path specifically.
 */
export function exogenousLineageGate(
  receipt: OracleReceipt | undefined,
  contextId: string,
): { exogenous: boolean; reason: string } {
  if (!receipt) {
    return {
      exogenous: false,
      reason: `no receipt supplied for "${contextId}" — fail-closed: an absent receipt is a refusal, not a pass`,
    };
  }
  // Two named sequential steps, never one compound boolean — mirrors
  // validateReceipt's own exogeneity step above (resolve, then check
  // membership), the mutation-checkable guard idiom this repo already uses.
  let rootKind: OracleKind;
  try {
    rootKind = resolveRootKind(receipt);
  } catch (e) {
    return { exogenous: false, reason: e instanceof Error ? e.message : String(e) };
  }
  if (!EXOGENOUS_ROOT_KINDS.has(rootKind)) {
    return {
      exogenous: false,
      reason: `receipt for "${contextId}" roots in "${rootKind}", which is not an exogenous source`,
    };
  }
  return { exogenous: true, reason: `receipt for "${contextId}" roots in exogenous kind "${rootKind}"` };
}
