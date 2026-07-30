/**
 * The fixture-warehouse generator (Phase 1 — Data-ops pilot battery, Plans
 * 01-01/01-03, REQ-22/REQ-23/REQ-24/REQ-26). Answer-first, per D2: ground-truth
 * `WarehouseFact`s are computed FIRST, from the seeded PRNG, before any
 * `RawOrderRow` exists — the raw rows are DERIVED from the facts, never the
 * reverse. `generateWarehouse` is a pure function of `(seed: number)` with
 * no `Provider`/`CandidateAgent`/network parameter anywhere in its
 * signature — the compile-time half of REQ-24 (RESEARCH's own framing); the
 * import-graph half and the discrimination control live in
 * `test/foundry-fixture-warehouse.test.ts` / `test/fixtures/answer-key-violation.ts`
 * (Plan 01-03).
 *
 * `runAgentBattery`'s candidate loop is a SINGLE `provider.chat()` call per
 * task (`agent-runner.ts:353-357`) — no tool-use loop, no filesystem the
 * candidate can browse. ponytail: the warehouse is therefore toy-scale and
 * embedded verbatim in `BatteryTask.prompt`, not a real explorable
 * warehouse. Upgrade trigger: a candidate loop that can browse files.
 *
 * Plan 01-03 resolves RESEARCH's Open Question 2 in favour of TWO
 * independently-seeded warehouses for the search/promotion split
 * (`generateFixtureSplitBattery`/`derivePromotionSeed`), rather than one
 * shared warehouse with its task set merely partitioned. Task-id
 * disjointness alone (what `makeSplitBattery` already enforces) holds out
 * the SELECTION METRIC, but a candidate that overfits to one warehouse's
 * specific messy-data quirks (its exact date-format mix, its exact
 * duplicate placement) could still transfer within a single shared
 * warehouse in a way it would not across two warehouses generated from
 * independent seeds. Two independent warehouses buy the stronger Goodhart
 * bound at the cost of one extra `sha256` call.
 */
import { createHash } from "node:crypto";
import { mulberry32 } from "../harness.js";
import { admitVerticalBattery, sealTable } from "./vertical-admission.js";
import {
  makeSplitBattery,
  type AgentBattery,
  type BatteryTask,
  type OracleReceipt,
  type SplitBattery,
} from "./battery-types.js";
import type { PredicateCheck } from "../contract/contract-types.js";

/** Names the ACCEPTED GENERATOR — never an instance, never a seed (D4/REQ-23).
 *  Renaming this string orphans any prior record that cites it (reversibility
 *  note, 01-01-PLAN.md task 1). */
export const DATA_OPS_GENERATOR_ID = "data-ops-fixture-warehouse-generator-v1";

/**
 * The phase-3 battery revision (`experiments/dataops-agent-pilot/PILOT-RESULTS.md`).
 * Same warehouse generator, two changes to how candidates are asked and scored:
 * a non-prescriptive task prompt (`buildTasksV2`) and partial credit on
 * `revenueCents` (`GradedSpec`).
 *
 * It is a SEPARATE id on purpose. `ACCEPTED_GENERATORS` records a human
 * accepting a specific generator's behaviour; revising the prompt and the
 * scoring under the v1 id would silently redefine what that human accepted,
 * which is precisely the substitution `requireGeneratorRooted`'s
 * reference-identity step exists to refuse one level down.
 *
 * **It is deliberately absent from `ACCEPTED_GENERATORS`.** Until a human adds
 * it, `acceptedGeneratorReceipt(DATA_OPS_GENERATOR_V2_ID)` throws and no v2
 * battery can be constructed. That is the designed blocking checkpoint, not an
 * oversight — an agent adding its own generator to the accepted table would
 * make the acceptance event self-issued and worthless.
 */
export const DATA_OPS_GENERATOR_V2_ID = "data-ops-fixture-warehouse-generator-v2";

/** The encoded human-acceptance event: generator id -> the human identity who
 *  accepted it. This map IS the acceptance event for this phase; a later
 *  phase's blocking checkpoint is where a human actually performs one for a
 *  NEW generator id (Plan 01-05). */
export const ACCEPTED_GENERATORS: ReadonlyMap<string, string> = sealTable(
  new Map([[DATA_OPS_GENERATOR_ID, "Dr. Robert Li"]]),
  "the accepted-generator table",
);

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

/**
 * The id half of `receipt.lineage[0]` — carries NO acceptance opinion at
 * all (mirrors `resolveRootKind`'s deliberate "no exogeneity opinion"
 * split, `battery-types.ts:96-107`). Fails closed: an empty lineage names
 * no generator, and a `lineage[0]` with no `:`, an empty prefix, or an
 * empty id is not a `<kind>:<id>` pair — both throw, naming the offending
 * entry.
 */
export function rootGeneratorId(receipt: OracleReceipt): string {
  if (receipt.lineage.length === 0) {
    throw new Error(
      `[foundry:fixture-warehouse] receipt has empty lineage — a constructed receipt with no ` +
        `lineage names no generator`,
    );
  }
  const entry = receipt.lineage[0]!;
  const idx = entry.indexOf(":");
  if (idx <= 0 || idx === entry.length - 1) {
    throw new Error(
      `[foundry:fixture-warehouse] lineage root entry ${JSON.stringify(entry)} is not a ` +
        `"<kind>:<id>" pair`,
    );
  }
  return entry.slice(idx + 1);
}

/**
 * THIS PHASE's own construction discipline (D4) — `resolveRootKind`/
 * `validateReceipt` (already invoked inside `makeBattery`) parse a lineage
 * entry as an OPAQUE `<kind>:<id>` string and are structurally incapable of
 * telling a generator id from an instance id (`battery-types.ts:107-126`).
 * `makeBattery` does NOT already cover "the receipt traces to the accepted
 * generator, not an instance" — this function is what does.
 *
 * Three named sequential steps, never one compound boolean, so a mutation
 * can disable exactly one:
 *   1. `rootGeneratorId` — resolve the id half of `lineage[0]`.
 *   2. Membership — `ACCEPTED_GENERATORS.has(rootId)`; refuses an
 *      instance-rooted or unaccepted-generator lineage.
 *   3. Reference identity — `Object.is(receipt, acceptedGeneratorReceipt(rootId))`
 *      (the `component-tournament.ts:154` idiom one altitude down); a miss
 *      means a substituted, copied, or re-derived receipt carrying the
 *      right fields is still not the receipt the human accepted.
 *
 * `generatorId` names the EXPECTED accepted generator in every thrown
 * message, alongside the offending id `rootGeneratorId` resolved.
 */
export function requireGeneratorRooted(receipt: OracleReceipt, generatorId: string): void {
  const rootId = rootGeneratorId(receipt);
  if (!ACCEPTED_GENERATORS.has(rootId)) {
    throw new Error(
      `[foundry:fixture-warehouse] lineage root id ${JSON.stringify(rootId)} is not an accepted ` +
        `generator (expected ${JSON.stringify(generatorId)}; accepted: ` +
        `${[...ACCEPTED_GENERATORS.keys()].map((id) => JSON.stringify(id)).join(", ")})`,
    );
  }
  if (!Object.is(receipt, acceptedGeneratorReceipt(rootId))) {
    throw new Error(
      `[foundry:fixture-warehouse] receipt claiming root ${JSON.stringify(rootId)} (expected ` +
        `generator ${JSON.stringify(generatorId)}) is not the accepted generator's own receipt ` +
        `object — a substituted, copied, or re-derived receipt carrying the right fields is ` +
        `still not the receipt the human accepted`,
    );
  }
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

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
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

/** ISO (`2026-01-05`), slashed (`05/01/2026`), or month-name
 *  (`January 5, 2026`) — the second messiness transform Plan 01-03 adds:
 *  month bucketing genuinely requires normalizing `rawDate`, not just
 *  reading its `YYYY-MM` prefix. `monthLabel` is always `YYYY-MM`
 *  (`MONTHS_2026`'s own shape). */
function formatDate(monthLabel: string, dayStr: string, formatIdx: number): string {
  const [yearStr, monthStr] = monthLabel.split("-") as [string, string];
  switch (formatIdx) {
    case 0:
      return `${monthLabel}-${dayStr}`;
    case 1:
      return `${dayStr}/${monthStr}/${yearStr}`;
    default:
      return `${MONTH_NAMES[Number(monthStr) - 1]} ${Number(dayStr)}, ${yearStr}`;
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
 * reproduces the warehouse exactly; different seeds produce different fact
 * VALUES, not merely a different top-level id (D3/N6). Three `customerId`s
 * x two `month`s = six fact groups, all drawn from the ONE `mulberry32`
 * stream so a single seed replays the whole warehouse. Per-group
 * `orderCount` in `[11, 20]`, per-row amounts in `[10_000, 99_999]` cents —
 * the same magnitude discipline as the tracer, unchanged: every group total
 * is >=6 digits while every field stays <=5 digits, so `assertAnswerNotLeaked`
 * remains enforceable.
 *
 * Messiness, each a transformation the candidate must reverse: one
 * verbatim-duplicated row per group (dedupe), three `rawAmount` render
 * formats (normalize), some rows with an empty `rawAmount` and the value
 * carried in `amountBackup` instead (recover), and — new in Plan 01-03 —
 * three `rawDate` render formats (`formatDate` above) so month-bucketing
 * itself requires normalizing the date, not just reading its prefix.
 *
 * ponytail: `runAgentBattery`'s candidate loop is a SINGLE `provider.chat()`
 * call (`agent-runner.ts:353-357`) — the whole warehouse must fit in one
 * prompt string. Six groups x up to 21 rows (20 orders + 1 duplicate) is at
 * most 126 CSV lines, comfortably inside any local/hosted model's context
 * window at this row count. Upgrade trigger: a candidate loop that can read
 * files, if the pilot warehouse ever needs to grow beyond toy scale.
 */
export function generateWarehouse(seed: number): FixtureWarehouse {
  const rand = mulberry32(seed);

  const customerIds: string[] = [];
  while (customerIds.length < 3) {
    const cid = `cust-${1000 + Math.floor(rand() * 9000)}`;
    if (!customerIds.includes(cid)) customerIds.push(cid);
  }

  const months: string[] = [];
  while (months.length < 2) {
    const m = MONTHS_2026[Math.floor(rand() * MONTHS_2026.length)]!;
    if (!months.includes(m)) months.push(m);
  }

  const facts: WarehouseFact[] = [];
  // Rows carry a PRNG-derived sort key so the emitted order is stable AND
  // interleaves rows across customers/months — never grouped strictly by
  // (customerId, month) position, which would let a candidate infer month
  // bucketing from position instead of normalizing rawDate. Sorting by a
  // derived numeric key (never by object-key or Set iteration order, and
  // never by anything time-derived) is the class of determinism bug
  // `src/knowledge/embedder.ts`'s own `l2Normalize` doc comment names —
  // fixing iteration order rather than leaving it to insertion order.
  const sortableRows: { row: RawOrderRow; sortKey: number }[] = [];

  let groupIdx = 0;
  for (const customerId of customerIds) {
    for (const month of months) {
      const orderCount = 11 + Math.floor(rand() * 10); // [11, 20]
      const amounts: number[] = [];
      for (let i = 0; i < orderCount; i++) {
        amounts.push(10_000 + Math.floor(rand() * 90_000)); // [10_000, 99_999]
      }
      const revenueCents = amounts.reduce((sum, cents) => sum + cents, 0);
      facts.push({ customerId, month, orderCount, revenueCents });

      const groupRows: RawOrderRow[] = [];
      for (let i = 0; i < orderCount; i++) {
        const orderId = `ord-${groupIdx}-${i + 1}`;
        const cents = amounts[i]!;
        const day = 1 + Math.floor(rand() * 28);
        const dayStr = day < 10 ? `0${day}` : `${day}`;
        const dateFormatIdx = Math.floor(rand() * 3);
        const rawDate = formatDate(month, dayStr, dateFormatIdx);
        const amountFormatIdx = Math.floor(rand() * 3);
        const carryInBackup = rand() < 0.3;
        const formatted = formatAmount(cents, amountFormatIdx);
        const rawAmount = carryInBackup ? "" : formatted;
        const amountBackup = carryInBackup ? formatted : "";
        groupRows.push({ orderId, customerId, rawDate, rawAmount, amountBackup });
      }

      // one row per group duplicated verbatim, same orderId — must be deduped.
      const dupIdx = Math.floor(rand() * orderCount);
      groupRows.push({ ...groupRows[dupIdx]! });

      for (const row of groupRows) sortableRows.push({ row, sortKey: rand() });
      groupIdx++;
    }
  }

  sortableRows.sort((a, b) => a.sortKey - b.sortKey);
  const rows: RawOrderRow[] = sortableRows.map((r) => r.row);

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
 *
 * `taskIdPrefix` (default `""`, so every existing single-battery caller is
 * unaffected) makes task-id disjointness STRUCTURAL rather than coincidental
 * for `generateFixtureSplitBattery` below: two halves built from two
 * different battery ids get two different prefixes, so their task ids
 * cannot collide even if both warehouses happen to draw the same
 * `(customerId, month)` pair from their independent PRNG streams.
 */
export function buildTasks(warehouse: FixtureWarehouse, taskIdPrefix: string = ""): BatteryTask[] {
  const tasks: BatteryTask[] = [];
  for (const fact of warehouse.facts) {
    const groupKey = `${fact.customerId}__${fact.month}`;
    const taskId = `${taskIdPrefix}data-ops-fact-recovery-${groupKey}`;
    const prompt = [
      `You are given raw order data extracted from a data warehouse, for`,
      `customer ${fact.customerId} in month ${fact.month}. The data is messy:`,
      `- Some rows are exact duplicates (same orderId) and must be deduplicated.`,
      `- "rawAmount" is rendered in one of three formats: bare cents ("12345"),`,
      `  dollars ("123.45"), or dollars with a "$" prefix ("$123.45") —`,
      `  normalize all of them to integer cents before summing.`,
      `- Some rows have an empty "rawAmount"; the true amount is instead`,
      `  carried in "amountBackup", in one of the same three formats.`,
      `- "rawDate" is rendered in one of three formats: ISO ("2026-01-05"),`,
      `  slashed ("05/01/2026"), or a month name ("January 5, 2026") — normalize`,
      `  all of them to determine which month a row belongs to.`,
      `- Rows for other customers/months are interleaved in the same CSV; only`,
      `  count rows for customer ${fact.customerId} in month ${fact.month}.`,
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
 * Credit for `revenueCents` decays to 0 at 10% relative error.
 *
 * Chosen from the measured failure distribution, not picked for roundness: the
 * observed wrong answers in the completed separation gate sat at roughly 7.6%,
 * 15% and 18% below truth (`armprobe-qwen.log`), and the granite floor was
 * ~87% out. 10% therefore separates "did the transformation, slipped on a few
 * rows" from "did not do the transformation" — the distinction a search needs
 * and exact equality destroys. A candidate 87% out still scores 0.
 *
 * ponytail: one tolerance for the one graded quantity. Upgrade trigger: a
 * second graded field whose natural error scale differs.
 */
export const REVENUE_ZERO_AT = 0.10;

/**
 * The v2 task builder — same facts and same required artifact, two changes.
 *
 * 1. **The prompt no longer carries the methodology.** `buildTasks` (v1) spells
 *    out deduplication, all three amount formats, the backup column, all three
 *    date formats and the customer/month filter. The completed separation gate
 *    showed what that costs: "You are a helpful assistant" scored 0.778 against
 *    an explicit 5-step methodology's 0.833, because the task prompt had
 *    already said everything the system prompt could have added. A search over
 *    system-prompt text has no headroom when the task text is the answer key to
 *    the method. v2 states the GOAL and that the extract is messy, and leaves
 *    discovering the messiness to the candidate — which is the competence the
 *    battery is supposed to measure.
 * 2. **`revenueCents` carries partial credit** (`REVENUE_ZERO_AT`), so a
 *    near-miss outranks a wild miss and `testPassRate` stops being quantized to
 *    1/6. `orderCount` stays exact — it is a small integer where "close" is not
 *    a meaningful notion.
 *
 * The artifact shape is deliberately UNCHANGED and still spelled out, because
 * it is a parsing contract with `observeCheck`, not a hint about the task. The
 * gate measured that too: the minimal prompt's failures included dropped
 * fences, which is a formatting artifact, not a data-ops result.
 */
export function buildTasksV2(warehouse: FixtureWarehouse, taskIdPrefix: string = ""): BatteryTask[] {
  const tasks: BatteryTask[] = [];
  for (const fact of warehouse.facts) {
    const groupKey = `${fact.customerId}__${fact.month}`;
    const taskId = `${taskIdPrefix}data-ops-fact-recovery-${groupKey}`;
    const prompt = [
      `The CSV below is a raw extract from a data warehouse. It was assembled`,
      `from several upstream systems that did not agree on formats, and it`,
      `covers many customers and months.`,
      ``,
      `CSV:`,
      "```csv",
      warehouse.csv,
      "```",
      ``,
      `For customer ${fact.customerId} in month ${fact.month}, recover the`,
      `DISTINCT order count and the total revenue in integer cents.`,
      ``,
      `Respond with exactly one fenced code block:`,
      "```path=answer.json",
      `{"totals": {"${groupKey}": {"orderCount": <n>, "revenueCents": <n>}}}`,
      "```",
    ].join("\n");

    const revenueCheckId = `${taskId}-revenue-cents`;
    const checks: PredicateCheck[] = [
      {
        checkId: `${taskId}-order-count`,
        kind: "json-invariant",
        input: `answer.json#totals.${groupKey}.orderCount`,
        expect: JSON.stringify(fact.orderCount),
        description: `recovered orderCount for ${groupKey} matches the precomputed fact`,
      },
      {
        checkId: revenueCheckId,
        kind: "json-invariant",
        input: `answer.json#totals.${groupKey}.revenueCents`,
        expect: JSON.stringify(fact.revenueCents),
        description: `recovered revenueCents for ${groupKey} matches the precomputed fact`,
      },
    ];

    tasks.push({
      id: taskId,
      prompt,
      checks,
      grading: [{ checkId: revenueCheckId, kind: "relative-error", zeroAt: REVENUE_ZERO_AT }],
    });
  }
  return tasks;
}

/**
 * `generateWarehouse` -> `buildTasks` -> draft with the accepted generator's
 * memoized receipt -> `requireGeneratorRooted` (REQ-23) -> `admitVerticalBattery`
 * (REQ-27) -> `makeBattery`. There is no other route from this module to
 * `makeBattery` — this is the ONLY construction path for the pilot battery
 * (D1/REQ-27, Pitfall 4). Arity 2 (REQ-24's compile-time guard).
 */
export function generateFixtureBattery(seed: number, batteryId: string): AgentBattery {
  const warehouse = generateWarehouse(seed);
  const tasks = buildTasks(warehouse);
  const receipt = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_ID);
  requireGeneratorRooted(receipt, DATA_OPS_GENERATOR_ID);
  const draft = { id: batteryId, tasks, receipt };
  return admitVerticalBattery("data-ops", draft);
}

/**
 * The v2 construction path — identical to `generateFixtureBattery` except for
 * the generator id and `buildTasksV2`. Throws until a human adds
 * `DATA_OPS_GENERATOR_V2_ID` to `ACCEPTED_GENERATORS`; see that constant's doc
 * comment for why that is the design and not a gap.
 */
export function generateFixtureBatteryV2(seed: number, batteryId: string): AgentBattery {
  const warehouse = generateWarehouse(seed);
  const tasks = buildTasksV2(warehouse);
  const receipt = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_V2_ID);
  requireGeneratorRooted(receipt, DATA_OPS_GENERATOR_V2_ID);
  const draft = { id: batteryId, tasks, receipt };
  return admitVerticalBattery("data-ops", draft);
}

/**
 * `archiveSeed`'s own sha256-then-parseInt idiom (`src/harness.ts:171-174`
 * / `component-tournament.ts`'s citation of it), copied verbatim rather than
 * imported across altitudes: turn `seed` plus a fixed label into a second,
 * independent 32-bit seed. Stable across calls for the same `seed`, and
 * different from `seed` itself (`|"promotion"` is appended, never omitted).
 * One top-level seed still reproduces BOTH halves of the split battery
 * (N6 replay unaffected) even though the two halves draw from independent
 * PRNG streams.
 */
export function derivePromotionSeed(seed: number): number {
  const h = createHash("sha256").update(`${seed}|promotion`).digest("hex");
  return parseInt(h.slice(0, 8), 16);
}

/**
 * Two INDEPENDENTLY-seeded warehouses (see the module doc comment's
 * rationale) — `search` from `seed`, `promotion` from `derivePromotionSeed(seed)`
 * — each built through the SAME real construction path as
 * `generateFixtureBattery` (`admitVerticalBattery`, REQ-27), then handed to
 * the existing, unmodified `makeSplitBattery` for the pair-level disjoint-id
 * / disjoint-task-id guarantees (Phase 2, D-03/CONTEXT D3). Task ids embed
 * each half's own battery id (`buildTasks`'s `taskIdPrefix`), so
 * disjointness holds structurally even in the astronomically unlikely case
 * the two independent warehouses draw the same `(customerId, month)` pair.
 * Arity 1 (REQ-24's compile-time guard).
 */
export function generateFixtureSplitBattery(seed: number): SplitBattery {
  const promotionSeed = derivePromotionSeed(seed);
  const searchBatteryId = `data-ops-search-${seed}`;
  const promotionBatteryId = `data-ops-promotion-${seed}`;

  const searchWarehouse = generateWarehouse(seed);
  const promotionWarehouse = generateWarehouse(promotionSeed);

  const receipt = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_ID);
  requireGeneratorRooted(receipt, DATA_OPS_GENERATOR_ID);

  const searchTasks = buildTasks(searchWarehouse, `${searchBatteryId}::`);
  const promotionTasks = buildTasks(promotionWarehouse, `${promotionBatteryId}::`);

  const searchBattery = admitVerticalBattery("data-ops", {
    id: searchBatteryId,
    tasks: searchTasks,
    receipt,
  });
  const promotionBattery = admitVerticalBattery("data-ops", {
    id: promotionBatteryId,
    tasks: promotionTasks,
    receipt,
  });

  return makeSplitBattery(
    { id: searchBattery.id, tasks: searchBattery.tasks, receipt: searchBattery.receipt },
    { id: promotionBattery.id, tasks: promotionBattery.tasks, receipt: promotionBattery.receipt },
  );
}
