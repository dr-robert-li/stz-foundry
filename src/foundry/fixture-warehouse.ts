/**
 * The fixture-warehouse generator (Phase 1 — Data-ops pilot battery, Plan
 * 01-01 tracer, REQ-22/REQ-23/REQ-26). Answer-first, per D2: ground-truth
 * `WarehouseFact`s are computed FIRST, from the seeded PRNG, before any
 * `RawOrderRow` exists — the raw rows are DERIVED from the facts, never the
 * reverse. `generateWarehouse` is a pure function of `(seed: number)` with
 * no `Provider`/`CandidateAgent`/network parameter anywhere in its
 * signature — the compile-time half of REQ-24 (RESEARCH's own framing); the
 * import-graph half and the discrimination control land in Plan 01-03.
 *
 * `runAgentBattery`'s candidate loop is a SINGLE `provider.chat()` call per
 * task (`agent-runner.ts:353-357`) — no tool-use loop, no filesystem the
 * candidate can browse. ponytail: the warehouse is therefore toy-scale and
 * embedded verbatim in `BatteryTask.prompt`, not a real explorable
 * warehouse. Upgrade trigger: a candidate loop that can browse files.
 */
import { mulberry32 } from "../harness.js";
import { admitVerticalBattery } from "./vertical-admission.js";
import type { AgentBattery, BatteryTask, OracleReceipt } from "./battery-types.js";
import type { PredicateCheck } from "../contract/contract-types.js";

/** Names the ACCEPTED GENERATOR — never an instance, never a seed (D4/REQ-23).
 *  Renaming this string orphans any prior record that cites it (reversibility
 *  note, 01-01-PLAN.md task 1). */
export const DATA_OPS_GENERATOR_ID = "data-ops-fixture-warehouse-generator-v1";

/** The encoded human-acceptance event: generator id -> the human identity who
 *  accepted it. This map IS the acceptance event for this phase; a later
 *  phase's blocking checkpoint is where a human actually performs one for a
 *  NEW generator id (Plan 01-05). */
export const ACCEPTED_GENERATORS: ReadonlyMap<string, string> = new Map([
  [DATA_OPS_GENERATOR_ID, "Dr. Robert Li"],
]);

const receiptMemo = new Map<string, OracleReceipt>();

/**
 * Mint (once) or return the memoized `OracleReceipt` for an accepted
 * generator id — every call for the same id returns the SAME frozen object
 * reference (REQ-23), so every battery this generator emits shares one
 * receipt, never a re-derived look-alike. Throws when the id is not in
 * `ACCEPTED_GENERATORS`. This is the sole acceptance construction point;
 * `validateReceipt` (already invoked inside `makeBattery`) remains the sole
 * human/agent-role GATE — this function does not duplicate that check.
 */
export function acceptedGeneratorReceipt(generatorId: string): OracleReceipt {
  const existing = receiptMemo.get(generatorId);
  if (existing) return existing;
  const acceptedBy = ACCEPTED_GENERATORS.get(generatorId);
  if (acceptedBy === undefined) {
    throw new Error(
      `[foundry:fixture-warehouse] generator ${JSON.stringify(generatorId)} is not in ` +
        `ACCEPTED_GENERATORS — only an accepted generator may mint an OracleReceipt`,
    );
  }
  const receipt: OracleReceipt = Object.freeze({
    kind: "constructed",
    acceptedBy,
    lineage: Object.freeze([`constructed:${generatorId}`]) as string[],
  });
  receiptMemo.set(generatorId, receipt);
  return receipt;
}

/** THE ANSWER KEY. Computed first, from the seeded PRNG, before any row
 *  exists (D2). */
export interface WarehouseFact {
  customerId: string;
  month: string;
  orderCount: number;
  revenueCents: number;
}

/** Derived FROM a `WarehouseFact` — never the reverse. */
export interface RawOrderRow {
  orderId: string;
  customerId: string;
  rawDate: string;
  rawAmount: string;
  amountBackup: string;
}

export interface FixtureWarehouse {
  seed: number;
  generatorId: string;
  facts: WarehouseFact[];
  rows: RawOrderRow[];
  csv: string;
}

const MONTHS_2026 = [
  "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
  "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12",
];

/** Bare cents, dollars, or dollars-with-symbol — the three formats the
 *  candidate must normalize (D2's "genuine transformation to reverse"). */
function formatAmount(cents: number, formatIdx: number): string {
  const dollars = (cents / 100).toFixed(2);
  switch (formatIdx) {
    case 0:
      return String(cents);
    case 1:
      return dollars;
    default:
      return `$${dollars}`;
  }
}

/**
 * Turns the magnitude argument (RESEARCH: "every field <=5 digits, the total
 * is always >=6 digits") into an enforced invariant rather than a comment.
 * Throws on any digit-boundary match of a fact's `revenueCents` inside the
 * emitted csv — the answer key must never cross into what the candidate
 * receives (T-01-03).
 */
function assertAnswerNotLeaked(warehouse: FixtureWarehouse): void {
  for (const fact of warehouse.facts) {
    const needle = String(fact.revenueCents);
    const re = new RegExp(`(?<!\\d)${needle}(?!\\d)`);
    if (re.test(warehouse.csv)) {
      throw new Error(
        `[foundry:fixture-warehouse] answer key leaked: revenueCents ${needle} for ` +
          `${fact.customerId}/${fact.month} appears verbatim in the generated csv`,
      );
    }
  }
}

/**
 * Pure function of a seed, arity 1 (REQ-24's compile-time guard — no
 * `Provider`/`CandidateAgent`/clock parameter anywhere). Same seed
 * reproduces the warehouse exactly; different seeds produce different
 * warehouses (D3/N6). For the tracer: one customer, one month, an
 * `orderCount` in `[11, 20]`, per-row amounts in `[10_000, 99_999]` cents —
 * magnitude discipline load-bearing for `assertAnswerNotLeaked` above.
 * Messiness applied, each a transformation the candidate must reverse: one
 * verbatim-duplicated row (dedupe), three `rawAmount` render formats
 * (normalize), some rows with an empty `rawAmount` and the value carried in
 * `amountBackup` instead (recover). `rawDate` uses one ISO format for the
 * tracer; Plan 01-03 adds mixed formats and multiple months.
 */
export function generateWarehouse(seed: number): FixtureWarehouse {
  const rand = mulberry32(seed);
  const customerId = `cust-${1000 + Math.floor(rand() * 9000)}`;
  const month = MONTHS_2026[Math.floor(rand() * MONTHS_2026.length)]!;
  const orderCount = 11 + Math.floor(rand() * 10); // [11, 20]

  const amounts: number[] = [];
  for (let i = 0; i < orderCount; i++) {
    amounts.push(10_000 + Math.floor(rand() * 90_000)); // [10_000, 99_999]
  }
  const revenueCents = amounts.reduce((sum, cents) => sum + cents, 0);
  const facts: WarehouseFact[] = [{ customerId, month, orderCount, revenueCents }];

  const rows: RawOrderRow[] = [];
  for (let i = 0; i < orderCount; i++) {
    const orderId = `ord-${i + 1}`;
    const cents = amounts[i]!;
    const day = 1 + Math.floor(rand() * 28);
    const dayStr = day < 10 ? `0${day}` : `${day}`;
    const rawDate = `${month}-${dayStr}`;
    const formatIdx = Math.floor(rand() * 3);
    const carryInBackup = rand() < 0.3;
    const formatted = formatAmount(cents, formatIdx);
    const rawAmount = carryInBackup ? "" : formatted;
    const amountBackup = carryInBackup ? formatted : "";
    rows.push({ orderId, customerId, rawDate, rawAmount, amountBackup });
  }

  // (a) one row duplicated verbatim, same orderId — must be deduped.
  const dupIdx = Math.floor(rand() * orderCount);
  rows.push({ ...rows[dupIdx]! });

  const csvLines = ["orderId,customerId,rawDate,rawAmount,amountBackup"];
  for (const row of rows) {
    csvLines.push(`${row.orderId},${row.customerId},${row.rawDate},${row.rawAmount},${row.amountBackup}`);
  }

  const warehouse: FixtureWarehouse = {
    seed,
    generatorId: DATA_OPS_GENERATOR_ID,
    facts,
    rows,
    csv: csvLines.join("\n"),
  };
  assertAnswerNotLeaked(warehouse);
  return warehouse;
}

/**
 * One `BatteryTask` per (customer, month) group — the prompt embeds
 * `warehouse.csv` verbatim, states the messiness rules to reverse, and
 * specifies the required artifact exactly as `runAgentBattery`'s
 * `observeCheck` will parse it (`agent-runner.ts:231-259`): a fenced block
 * `path=answer.json` containing
 * `{"totals": {"<customerId>__<month>": {"orderCount": <n>, "revenueCents": <n>}}}`
 * — a double underscore between customerId and month because `observeCheck`
 * splits the dotted json-invariant path on `.`, and neither field contains a
 * literal `.`.
 */
export function buildTasks(warehouse: FixtureWarehouse): BatteryTask[] {
  const tasks: BatteryTask[] = [];
  for (const fact of warehouse.facts) {
    const groupKey = `${fact.customerId}__${fact.month}`;
    const taskId = `data-ops-fact-recovery-${groupKey}`;
    const prompt = [
      `You are given raw order data extracted from a data warehouse, for`,
      `customer ${fact.customerId} in month ${fact.month}. The data is messy:`,
      `- Some rows are exact duplicates (same orderId) and must be deduplicated.`,
      `- "rawAmount" is rendered in one of three formats: bare cents ("12345"),`,
      `  dollars ("123.45"), or dollars with a "$" prefix ("$123.45") —`,
      `  normalize all of them to integer cents before summing.`,
      `- Some rows have an empty "rawAmount"; the true amount is instead`,
      `  carried in "amountBackup", in one of the same three formats.`,
      ``,
      `CSV:`,
      "```csv",
      warehouse.csv,
      "```",
      ``,
      `Recover, for this customer/month, the DISTINCT order count and the`,
      `total revenue in cents. Respond with exactly one fenced code block:`,
      "```path=answer.json",
      `{"totals": {"${groupKey}": {"orderCount": <n>, "revenueCents": <n>}}}`,
      "```",
    ].join("\n");

    const checks: PredicateCheck[] = [
      {
        checkId: `${taskId}-order-count`,
        kind: "json-invariant",
        input: `answer.json#totals.${groupKey}.orderCount`,
        expect: JSON.stringify(fact.orderCount),
        description: `recovered orderCount for ${groupKey} matches the precomputed fact`,
      },
      {
        checkId: `${taskId}-revenue-cents`,
        kind: "json-invariant",
        input: `answer.json#totals.${groupKey}.revenueCents`,
        expect: JSON.stringify(fact.revenueCents),
        description: `recovered revenueCents for ${groupKey} matches the precomputed fact`,
      },
    ];

    tasks.push({ id: taskId, prompt, checks });
  }
  return tasks;
}

/**
 * `generateWarehouse` -> `buildTasks` -> draft with the accepted generator's
 * memoized receipt -> `admitVerticalBattery("data-ops", draft)`. There is no
 * other route from this module to `makeBattery` — this is the ONLY
 * construction path for the pilot battery (D1/REQ-27, Pitfall 4). Arity 2
 * (REQ-24's compile-time guard).
 */
export function generateFixtureBattery(seed: number, batteryId: string): AgentBattery {
  const warehouse = generateWarehouse(seed);
  const tasks = buildTasks(warehouse);
  const receipt = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_ID);
  const draft = { id: batteryId, tasks, receipt };
  return admitVerticalBattery("data-ops", draft);
}
