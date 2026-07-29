/**
 * Vertical admission (Phase 1 — Data-ops pilot battery, Plan 01-01, REQ-27).
 *
 * `docs/development/harness-factory.md` § "Vertical admission: oracles
 * decide" names five verticals and states their verdict in prose. D1 makes
 * that table a deterministic TypeScript decision instead — not documentation,
 * not agent judgement (architecture rule, CLAUDE.md).
 *
 * The single largest named risk in RESEARCH (Pitfall 4) is a refusal table
 * that is correct in isolation but never consulted on the real battery-
 * construction path. `admitVerticalBattery` closes that gap by being the
 * ONLY way this phase's code may construct a shipped `AgentBattery`: it
 * calls `requireAdmitted` first, then delegates to the existing, unmodified
 * `makeBattery`. There is no second, parallel path.
 */
import { makeBattery, type AgentBattery, type BatteryTask, type OracleReceipt } from "./battery-types.js";

/** The five verticals named in `docs/development/harness-factory.md`'s
 *  admission table. Plan 01-02 fills the remaining three rows of
 *  `VERTICAL_ADMISSION`; this type already names all five so a later plan
 *  cannot silently add a sixth without a type-level review. */
export type Vertical =
  | "data-ops"
  | "bi-analytics"
  | "performance-marketing"
  | "customer-support"
  | "revops-gtm-exec-strategy";

export type AdmissionVerdict = "admitted" | "pending" | "refused";

export interface AdmissionRecord {
  vertical: Vertical;
  verdict: AdmissionVerdict;
  oracleClass: string;
  mechanism: string;
  note: string;
}

/**
 * ponytail: only the two rows this plan's own code needs (`data-ops`
 * admitted, `revops-gtm-exec-strategy` refused) are seeded here — a
 * hardcoded literal, not loaded from config, mirroring
 * `EXOGENOUS_ROOT_KINDS`'s own small-literal-Set shape. Plan 01-02 adds
 * `bi-analytics` / `performance-marketing` / `customer-support` as
 * `"pending"` rows. An id absent from this map is refused by `admitVertical`
 * below regardless — absence is never treated as "pending" by default.
 */
export const VERTICAL_ADMISSION: ReadonlyMap<Vertical, AdmissionRecord> = new Map([
  [
    "data-ops",
    {
      vertical: "data-ops",
      verdict: "admitted",
      oracleClass: "execution + construction",
      mechanism: "dbt tests, data-diff, SQL vs fixture warehouse",
      note: "Pilot — first",
    },
  ],
  [
    "revops-gtm-exec-strategy",
    {
      vertical: "revops-gtm-exec-strategy",
      verdict: "refused",
      oracleClass: "none fast",
      mechanism:
        "only resolvable forecasts (probabilistic predictions scored ex post, Brier) — exogenous but weeks-lagged",
      note: "Refused until a forecast-mode oracle is built",
    },
  ],
]);

export class VerticalRefusedError extends Error {
  constructor(message: string) {
    super(`[foundry:vertical-admission] ${message}`);
    this.name = "VerticalRefusedError";
  }
}

/**
 * The LOOKUP step only — carries no admit/refuse opinion at all (mirrors
 * `resolveRootKind`'s deliberate "no exogeneity opinion" split,
 * `battery-types.ts:96-107`). An id absent from `VERTICAL_ADMISSION` throws;
 * it is never defaulted to `"admitted"` or `"pending"`.
 */
export function admitVertical(vertical: Vertical): AdmissionRecord {
  const record = VERTICAL_ADMISSION.get(vertical);
  if (!record) {
    throw new VerticalRefusedError(
      `vertical ${JSON.stringify(vertical)} is not in the admission table — an id absent from ` +
        `the table is never treated as admitted or pending`,
    );
  }
  return record;
}

/**
 * The separately-named THROW step (two named sequential steps, never one
 * compound boolean, so a mutation can disable exactly one — RESEARCH
 * Pitfall 2's mutation-checkable guard idiom). A refused vertical stays
 * refused: this function takes only the vertical name, no override, no
 * judge profile, no config key (mirrors `promoteComponentWinner`'s "accepts
 * NONE of the seven as a parameter" posture, `component-tournament.ts:115-121`).
 */
export function requireAdmitted(vertical: Vertical): AdmissionRecord {
  const record = admitVertical(vertical);
  if (record.verdict !== "admitted") {
    throw new VerticalRefusedError(
      `vertical ${JSON.stringify(vertical)} has verdict ${JSON.stringify(record.verdict)} ` +
        `(oracle class: ${record.oracleClass}) — no judge substitutes for a missing oracle; ` +
        `refusal is stated in the product, not papered over`,
    );
  }
  return record;
}

/**
 * The ONLY way this phase's code may construct a shipped `AgentBattery`.
 * Calls `requireAdmitted(vertical)` FIRST, then delegates to the existing,
 * unmodified `makeBattery(draft)`. Deleting the `requireAdmitted` call here
 * turns the "refused vertical cannot be built through the real path" test
 * red — that is the mutation check this function exists to survive.
 */
export function admitVerticalBattery(
  vertical: Vertical,
  draft: { id: string; tasks: BatteryTask[]; receipt: OracleReceipt },
): AgentBattery {
  requireAdmitted(vertical);
  return makeBattery(draft);
}
