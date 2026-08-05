/**
 * The v3 fixture-warehouse generator — `experiments/dataops-agent-pilot/V3-BATTERY-DESIGN.md`
 * revision 2, as reviewed by the 5-model cross-AI panel (`V3-REVIEWS.md`).
 *
 * WHY A THIRD GENERATOR. Rounds 1 and 2 both returned GATE NOT MET, and round
 * 2 established why: the method change worked (Goodharting vanished,
 * diff-in-diff −0.15/+0.004/0.000) but the INSTRUMENT has no headroom —
 * baselines sat at 0.92–0.94 against noise floors of 0.004–0.153. A battery
 * that every arm nearly aces cannot rank arms. The design inequality
 * `(1 − baseline) ≥ 3 × noise` puts the target baseline corridor at 0.35–0.55,
 * and v3 exists to move the instrument into it by adding reasoning levers,
 * not parsing traps.
 *
 * THE LEVERS (design §2/§3). L1 duplicate resolution by `updatedAt` with a
 * total tie rule; L2 reference validation (refunds/adjustments count only when
 * their `origOrderId` survived the earlier pipeline steps); L3 month
 * attribution by `paymentDate` while a decoy `orderDate` is present; L4 (grid
 * reserve) larger groups. The v2 amount-format zoo is retained UNCHANGED and
 * still undocumented in the prompt — it is frozen v2 messiness, not a new
 * lever (design S4). The v2 *date*-format zoo is deliberately gone: dates are
 * ISO-only in both columns, so L3 measures which column governs bucketing,
 * never date parsing.
 *
 * ANSWER-FIRST, still (D2). Every `WarehouseFact` is computed from the seeded
 * PRNG in pass 1, before a single row exists; pass 2 DERIVES rows from those
 * facts. Conflicts, refunds, adjustments and dangling references are all
 * emitted downstream of an answer that is already fixed, so no row can ever
 * talk the answer key into agreeing with it.
 *
 * WHY THIS FILE AND NOT `fixture-warehouse.ts`. The acceptance machinery
 * (`ACCEPTED_GENERATORS`, `acceptedGeneratorReceipt`, `requireGeneratorRooted`)
 * and every generator id stay single-sourced in `fixture-warehouse.ts` and are
 * imported here; only the v3 warehouse and task construction live in this
 * module. Splitting the other way — a second copy of the acceptance table —
 * is the failure mode the reference-identity check exists to refuse.
 *
 * The INDEPENDENT REFERENCE INTERPRETER that checks this generator's arithmetic
 * (design S2, the panel's strongest novel finding) is deliberately NOT here and
 * shares no helper with it: `test/fixtures/v3-reference-interpreter.ts`.
 */
import { mulberry32 } from "../harness.js";
import { admitVerticalBattery } from "./vertical-admission.js";
import {
  DATA_OPS_GENERATOR_V3_ID,
  DATA_OPS_GENERATOR_V31_ID,
  REVENUE_ZERO_AT,
  acceptedGeneratorReceipt,
  derivePromotionSeed,
  requireGeneratorRooted,
  type WarehouseFact,
} from "./fixture-warehouse.js";
import {
  makeSplitBattery,
  type AgentBattery,
  type BatteryTask,
  type SplitBattery,
} from "./battery-types.js";
import type { PredicateCheck } from "../contract/contract-types.js";

/**
 * One PRE-REGISTERED grid point. Point values, never ranges (claude's review
 * finding: a range is not reproducible, and choosing inside it after seeing
 * probe results is difficulty-shopping — qwen C4).
 *
 * `conflictFraction` and `refundRate` are COUNTS-per-group after rounding, not
 * Bernoulli rates: `round(fraction × groupSize)` rows exactly. A coin flip
 * would make the pre-registered knob a distribution rather than a setting, and
 * would let two seeds at the same grid point differ in difficulty for reasons
 * the grid does not name.
 */
export interface V3Knobs {
  readonly id: string;
  /** L1: share of a group's orders that get a conflicting duplicate row. */
  readonly conflictFraction: number;
  /** L2: share of a group's orders that get a valid whole-order refund. Also
   *  governs the adjustment count and the dangling-reference count — see
   *  `ADJUSTMENT_RATIO` / `DANGLING_RATIO`. 0 turns L2 off entirely. */
  readonly refundRate: number;
  /** L3: emit the decoy `orderDate` column alongside `paymentDate`. */
  readonly dualDates: boolean;
  /** L4 reserve: group size. */
  readonly groupSizeMin: number;
  readonly groupSizeMax: number;
}

/**
 * THE PRE-REGISTERED GRID (design §3.1), committed in `V3-BATTERY-DESIGN.md`
 * rev 2 before any probe inference was run. G1–G3 give the 2×2 factorial
 * coverage of L1/L2 that qwen I2 asked for; G4 adds L3; G5 is the L4 reserve
 * that only enters if no earlier point qualifies.
 *
 * The ladder is monotone: each point inherits the previous point's knobs
 * except where the design names a change.
 */
export const V3_GRID: readonly V3Knobs[] = Object.freeze([
  Object.freeze({ id: "G1", conflictFraction: 0.5, refundRate: 0.0, dualDates: false, groupSizeMin: 11, groupSizeMax: 20 }),
  Object.freeze({ id: "G2", conflictFraction: 0.5, refundRate: 0.1, dualDates: false, groupSizeMin: 11, groupSizeMax: 20 }),
  Object.freeze({ id: "G3", conflictFraction: 1.0, refundRate: 0.15, dualDates: false, groupSizeMin: 11, groupSizeMax: 20 }),
  Object.freeze({ id: "G4", conflictFraction: 1.0, refundRate: 0.15, dualDates: true, groupSizeMin: 11, groupSizeMax: 20 }),
  Object.freeze({ id: "G5", conflictFraction: 1.0, refundRate: 0.15, dualDates: true, groupSizeMin: 30, groupSizeMax: 30 }),
]) as readonly V3Knobs[];

/** Resolve a grid point by id, or throw naming the whole grid. */
export function v3Knobs(gridPointId: string): V3Knobs {
  const point = V3_GRID.find((k) => k.id === gridPointId);
  if (!point) {
    throw new Error(
      `[foundry:fixture-warehouse-v3] unknown grid point ${JSON.stringify(gridPointId)} ` +
        `(grid: ${V3_GRID.map((k) => k.id).join(", ")})`,
    );
  }
  return point;
}

/**
 * STRUCTURAL CONSTANTS — deliberately NOT grid knobs, so they cannot be tuned
 * against probe results. Each is stated here because the design fixes the
 * lever but not the proportion, and an unstated proportion is a tuning knob
 * hiding in the generator.
 */
/** Adjustment rows per group = `round(refundRate × groupSize)`, same as refunds:
 *  L2 is one lever, and its two row kinds move together. */
const ADJUSTMENT_RATIO = 1;
/** Dangling (invalid) reference rows per group = valid refunds × 1. L2 has no
 *  lever at all unless invalid references exist to be rejected; 1:1 makes half
 *  of all reference rows in a group invalid. */
const DANGLING_RATIO = 1;
/** L3 decoy strength: share of a group's order rows whose `orderDate` falls in
 *  the OTHER selected month. The design states 20–40%; a probe needs a point
 *  value, so this is the midpoint. */
const ORDER_DATE_SKEW = 0.3;
/** Frozen v2 messiness, unchanged: share of rows whose amount is carried in
 *  `amountBackup` with `rawAmount` left empty. */
const BACKUP_SHARE = 0.3;

/**
 * Order amounts. The floor is 30_000 rather than v2's 10_000 so the answer-key
 * magnitude invariant survives L2: every field stays ≤5 digits while every
 * group's NET `revenueCents` stays ≥6 digits even in the worst draw (smallest
 * group, largest refunds, most negative adjustments) — see
 * `assertMagnitudeInvariant`. Without the raise, a heavily-refunded 11-order
 * group could land on a 5-digit net and collide with a field value, which
 * `assertAnswerNotLeakedV3` would (correctly) refuse — at generation time, on
 * a seed we had already committed to.
 */
const AMOUNT_MIN = 30_000;
/** Order amounts stop at 79_999, not 99_999, so a conflict decoy can always be
 *  made STRICTLY LARGER than the truth (up to +20_000) while still rendering
 *  in ≤5 digits. Without the headroom, an order drawn at the ceiling would
 *  have no larger decoy available and the L1 leak guarantee below would hold
 *  only on average. */
const AMOUNT_MAX = 79_999;
/** The ≤5-digit ceiling a decoy may reach. */
const DECOY_MAX = 99_999;
/** Adjustment magnitude, capped at 10_000 for the same invariant. */
const ADJUSTMENT_MIN = 1_000;
const ADJUSTMENT_MAX = 10_000;

const MONTHS_2026 = [
  "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
  "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12",
];

export type LedgerRowType = "order" | "refund" | "adjustment";

/** Derived FROM a `WarehouseFact` — never the reverse. */
export interface RawLedgerRow {
  orderId: string;
  customerId: string;
  type: LedgerRowType;
  /** `""` for `order` rows. */
  origOrderId: string;
  /** `""` when the grid point has `dualDates: false` (column omitted). */
  orderDate: string;
  paymentDate: string;
  updatedAt: string;
  rawAmount: string;
  amountBackup: string;
}

export interface FixtureWarehouseV3 {
  seed: number;
  generatorId: string;
  knobs: V3Knobs;
  facts: WarehouseFact[];
  rows: RawLedgerRow[];
  csv: string;
}

/** Bare cents, dollars, or dollars-with-symbol — v2's zoo, unchanged, with the
 *  sign always rendered leftmost so a negative adjustment has one spelling per
 *  format rather than two. */
function formatAmount(cents: number, formatIdx: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  switch (formatIdx) {
    case 0:
      return `${sign}${abs}`;
    case 1:
      return `${sign}${(abs / 100).toFixed(2)}`;
    default:
      return `${sign}$${(abs / 100).toFixed(2)}`;
  }
}

/** `YYYY-MM` + day -> ISO date. Days are drawn in [1, 28] so no month-length
 *  case exists. */
function isoDate(monthLabel: string, day: number): string {
  return `${monthLabel}-${day < 10 ? `0${day}` : day}`;
}

/** ISO date shifted by whole days, ISO out. Pure; no clock is read. */
function shiftDays(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The magnitude discipline as an enforced invariant rather than a comment: no
 * field may reach 6 digits and no group's net revenue may fall below 6 digits.
 * Both halves matter — the first keeps `assertAnswerNotLeakedV3`'s
 * digit-boundary search meaningful, the second keeps a net answer from
 * colliding with a field value by construction.
 */
function assertMagnitudeInvariant(warehouse: FixtureWarehouseV3): void {
  for (const fact of warehouse.facts) {
    if (fact.revenueCents < 100_000) {
      throw new Error(
        `[foundry:fixture-warehouse-v3] magnitude invariant violated: net revenueCents ` +
          `${fact.revenueCents} for ${fact.customerId}/${fact.month} is under 6 digits — the ` +
          `answer key can no longer be kept clear of the ≤5-digit field values`,
      );
    }
  }
}

/**
 * Throws on any digit-boundary match of a fact's `revenueCents` inside the
 * emitted csv — the answer key must never cross into what the candidate
 * receives (T-01-03, unchanged in intent from v1/v2).
 */
function assertAnswerNotLeakedV3(warehouse: FixtureWarehouseV3): void {
  for (const fact of warehouse.facts) {
    const needle = String(fact.revenueCents);
    const re = new RegExp(`(?<!\\d)${needle}(?!\\d)`);
    if (re.test(warehouse.csv)) {
      throw new Error(
        `[foundry:fixture-warehouse-v3] answer key leaked: revenueCents ${needle} for ` +
          `${fact.customerId}/${fact.month} appears verbatim in the generated csv`,
      );
    }
  }
}

/** Deterministic count for a per-group fraction knob. */
function countFor(fraction: number, groupSize: number): number {
  return Math.round(fraction * groupSize);
}

/**
 * Fisher-Yates over `[0, n)`, drawing EXACTLY `n - 1` times.
 *
 * Never `sort(() => rand() - 0.5)`: that comparator is inconsistent (so the
 * permutation is biased) and, worse here, the number of comparisons — and
 * therefore the number of PRNG draws consumed — is an implementation detail of
 * whichever engine sorts. A seed would replay differently under a different V8,
 * which is the same class of determinism bug `src/knowledge/embedder.ts`'s
 * `l2Normalize` doc comment names: never let iteration order be decided by
 * something outside the seed.
 */
function shuffledIndices(n: number, rand: () => number): number[] {
  const out = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

interface GroupPlan {
  customerId: string;
  month: string;
  orderIds: string[];
  amounts: number[];
  /** Indices into `orderIds` that carry a valid whole-order refund. */
  refunded: number[];
  /** Indices into `orderIds` that carry a valid adjustment, with its signed delta. */
  adjusted: { index: number; delta: number }[];
  /** Indices into `orderIds` that get a conflicting duplicate, with its shape
   *  and (for shape 0) whether the decoy is forced above the true amount. */
  conflicted: { index: number; shape: 0 | 1 | 2; forceLarger: boolean }[];
}

/**
 * Pure function of `(seed, knobs)` — no `Provider`/`CandidateAgent`/clock
 * parameter anywhere (REQ-24's compile-time guard, extended by one CONFIG
 * argument because the grid point is exactly what a calibration probe varies).
 *
 * FIVE customers × TWO months = 10 fact groups, 10 tasks per half (design S1,
 * unanimous across the panel): the exact-rate quantum drops from 0.167 to
 * 0.10, below the worst measured noise floor, so a single random slip stops
 * outweighing a real difference.
 *
 * Two passes over one `mulberry32` stream, so one seed replays the whole
 * warehouse:
 *   Pass 1 — plan every group and COMPUTE ITS FACT. No row exists yet.
 *   Pass 2 — derive rows from the plans, including dangling references that
 *            need the other groups' order ids to point at.
 */
export function generateWarehouseV3(seed: number, knobs: V3Knobs): FixtureWarehouseV3 {
  const rand = mulberry32(seed);

  const customerIds: string[] = [];
  while (customerIds.length < 5) {
    const cid = `cust-${1000 + Math.floor(rand() * 9000)}`;
    if (!customerIds.includes(cid)) customerIds.push(cid);
  }

  const months: string[] = [];
  while (months.length < 2) {
    const m = MONTHS_2026[Math.floor(rand() * MONTHS_2026.length)]!;
    if (!months.includes(m)) months.push(m);
  }

  // ---- pass 1: answer first ------------------------------------------------
  const plans: GroupPlan[] = [];
  const facts: WarehouseFact[] = [];
  let groupIdx = 0;
  for (const customerId of customerIds) {
    for (const month of months) {
      const span = knobs.groupSizeMax - knobs.groupSizeMin + 1;
      const groupSize = knobs.groupSizeMin + Math.floor(rand() * span);

      const orderIds: string[] = [];
      const amounts: number[] = [];
      for (let i = 0; i < groupSize; i++) {
        orderIds.push(`ord-${groupIdx}-${i + 1}`);
        amounts.push(AMOUNT_MIN + Math.floor(rand() * (AMOUNT_MAX - AMOUNT_MIN + 1)));
      }

      // Refunds, adjustments and conflicts select DISTINCT order indices by
      // drawing from a shuffled index list — never by rejection sampling,
      // which would make the PRNG stream length data-dependent and break
      // replay across grid points.
      const shuffled = shuffledIndices(groupSize, rand);
      const refundCount = countFor(knobs.refundRate, groupSize);
      const adjustCount = countFor(knobs.refundRate * ADJUSTMENT_RATIO, groupSize);
      const refunded = shuffled.slice(0, refundCount);
      const adjusted = shuffled.slice(refundCount, refundCount + adjustCount).map((index) => {
        const magnitude = ADJUSTMENT_MIN + Math.floor(rand() * (ADJUSTMENT_MAX - ADJUSTMENT_MIN + 1));
        return { index, delta: rand() < 0.5 ? magnitude : -magnitude };
      });

      const conflictCount = countFor(knobs.conflictFraction, groupSize);
      const conflictOrder = shuffledIndices(groupSize, rand);
      // The first two conflicts in every group have FIXED shapes, and the
      // rest are drawn. That is what makes L1's leak checks a guarantee
      // rather than an average: the group is certain to contain both a stale
      // row whose amount is LARGER than the truth (so "take the largest
      // amount per orderId" is wrong) and a tie whose decoy is SMALLER (so
      // "take the smallest" is wrong too). Neither heuristic can stand in for
      // comparing the timestamps. Every grid point has conflictCount >= 6, so
      // both slots always exist. The shape is drawn unconditionally so the
      // PRNG stream length never depends on which shapes were forced.
      const conflicted = conflictOrder.slice(0, conflictCount).map((index, k) => {
        const drawn = Math.floor(rand() * 3) as 0 | 1 | 2;
        return {
          index,
          shape: k === 0 ? (0 as const) : k === 1 ? (1 as const) : drawn,
          forceLarger: k === 0,
        };
      });

      const gross = amounts.reduce((sum, cents) => sum + cents, 0);
      const refundTotal = refunded.reduce((sum, i) => sum + amounts[i]!, 0);
      const adjustTotal = adjusted.reduce((sum, a) => sum + a.delta, 0);

      facts.push({
        customerId,
        month,
        orderCount: groupSize,
        revenueCents: gross - refundTotal + adjustTotal,
      });
      plans.push({ customerId, month, orderIds, amounts, refunded, adjusted, conflicted });
      groupIdx++;
    }
  }

  // ---- pass 2: derive rows from the fixed answers --------------------------
  const allOrderIds = plans.flatMap((p) => p.orderIds);
  const sortable: { row: RawLedgerRow; sortKey: number }[] = [];
  const push = (row: RawLedgerRow) => sortable.push({ row, sortKey: rand() });

  plans.forEach((plan, planIdx) => {
    const otherMonth = plan.month === months[0] ? months[1]! : months[0]!;
    const conflictByIndex = new Map(plan.conflicted.map((c) => [c.index, c]));
    const adjustByIndex = new Map(plan.adjusted.map((a) => [a.index, a.delta]));
    const refundedSet = new Set(plan.refunded);

    const skewCount = countFor(ORDER_DATE_SKEW, plan.orderIds.length);
    const skewed = new Set(shuffledIndices(plan.orderIds.length, rand).slice(0, skewCount));

    plan.orderIds.forEach((orderId, i) => {
      const cents = plan.amounts[i]!;
      const day = 1 + Math.floor(rand() * 28);
      const paymentDate = isoDate(plan.month, day);
      // L3's decoy: `orderDate` lands in the OTHER selected month, so a
      // candidate that buckets by `orderDate` does not merely lose the row —
      // it files it under the other task, producing a specifically wrong
      // answer rather than a randomly wrong one.
      const orderDate = knobs.dualDates
        ? isoDate(skewed.has(i) ? otherMonth : plan.month, 1 + Math.floor(rand() * 28))
        : "";
      const updatedAt = shiftDays(paymentDate, 1 + Math.floor(rand() * 20));
      const formatIdx = Math.floor(rand() * 3);
      const inBackup = rand() < BACKUP_SHARE;
      const rendered = formatAmount(cents, formatIdx);

      const trueRow: RawLedgerRow = {
        orderId,
        customerId: plan.customerId,
        type: "order",
        origOrderId: "",
        orderDate,
        paymentDate,
        updatedAt,
        rawAmount: inBackup ? "" : rendered,
        amountBackup: inBackup ? rendered : "",
      };
      push(trueRow);

      const conflict = conflictByIndex.get(i);
      if (conflict !== undefined) {
        const { shape } = conflict;
        if (shape === 2) {
          // Identical on both keys — byte-identical by construction, so the
          // tie rule never meets an undefined case (design S3 step 2c).
          push({ ...trueRow });
        } else {
          // A decoy amount LARGER than the truth half the time. Without that,
          // "take the largest amount for each orderId" is a shortcut that
          // scores 1.0 without ever comparing a timestamp — the exact silent
          // difficulty deflation claude's leak-check finding names.
          // Drawn for both shapes even though shape 1 does not consult it, so
          // the PRNG stream length does not depend on which shape came up.
          const decoyLarger = rand() < 0.5 || conflict.forceLarger;
          const decoyCents =
            shape === 1
              ? // tie on `updatedAt` -> the rule breaks it by LARGEST amount,
                // so the decoy must be strictly smaller than the truth.
                10_000 + Math.floor(rand() * (cents - 10_000))
              : decoyLarger
                ? Math.min(DECOY_MAX, cents + 1 + Math.floor(rand() * 20_000))
                : Math.max(10_000, cents - 1 - Math.floor(rand() * 20_000));
          const decoyFormat = Math.floor(rand() * 3);
          const decoyBackup = rand() < BACKUP_SHARE;
          const decoyRendered = formatAmount(decoyCents, decoyFormat);
          push({
            orderId,
            customerId: plan.customerId,
            type: "order",
            origOrderId: "",
            orderDate,
            paymentDate,
            // shape 0 -> strictly staler; shape 1 -> exact tie.
            updatedAt: shape === 0 ? shiftDays(updatedAt, -(1 + Math.floor(rand() * 15))) : updatedAt,
            rawAmount: decoyBackup ? "" : decoyRendered,
            amountBackup: decoyBackup ? decoyRendered : "",
          });
        }
      }
    });

    if (knobs.refundRate > 0) {
      plan.refunded.forEach((i, n) => {
        const day = 1 + Math.floor(rand() * 28);
        const paymentDate = isoDate(plan.month, day);
        const rendered = formatAmount(plan.amounts[i]!, Math.floor(rand() * 3));
        push({
          orderId: `rfd-${planIdx}-${n + 1}`,
          customerId: plan.customerId,
          type: "refund",
          origOrderId: plan.orderIds[i]!,
          orderDate: knobs.dualDates ? isoDate(plan.month, 1 + Math.floor(rand() * 28)) : "",
          paymentDate,
          updatedAt: shiftDays(paymentDate, 1 + Math.floor(rand() * 20)),
          rawAmount: rendered,
          amountBackup: "",
        });
      });

      plan.adjusted.forEach((a, n) => {
        const day = 1 + Math.floor(rand() * 28);
        const paymentDate = isoDate(plan.month, day);
        const rendered = formatAmount(a.delta, Math.floor(rand() * 3));
        push({
          orderId: `adj-${planIdx}-${n + 1}`,
          customerId: plan.customerId,
          type: "adjustment",
          origOrderId: plan.orderIds[a.index]!,
          orderDate: knobs.dualDates ? isoDate(plan.month, 1 + Math.floor(rand() * 28)) : "",
          paymentDate,
          updatedAt: shiftDays(paymentDate, 1 + Math.floor(rand() * 20)),
          rawAmount: rendered,
          amountBackup: "",
        });
      });

      // L2's lever. Every dangling row passes steps 2–4 — right customer,
      // right payment month — and fails ONLY step 5. Half of them name a real
      // order that belongs to a different group (the "surviving SET, not the
      // whole file" reading the panel asked to be made formal), half name an
      // order id that exists nowhere.
      const danglingCount = plan.refunded.length * DANGLING_RATIO;
      for (let n = 0; n < danglingCount; n++) {
        const day = 1 + Math.floor(rand() * 28);
        const paymentDate = isoDate(plan.month, day);
        const foreign = allOrderIds[Math.floor(rand() * allOrderIds.length)]!;
        const isForeign = n % 2 === 0;
        const origOrderId =
          isForeign && !plan.orderIds.includes(foreign) ? foreign : `ord-${900 + planIdx}-${n + 1}`;
        const magnitude = AMOUNT_MIN + Math.floor(rand() * (AMOUNT_MAX - AMOUNT_MIN + 1));
        push({
          orderId: `rfd-${planIdx}-x${n + 1}`,
          customerId: plan.customerId,
          type: "refund",
          origOrderId,
          orderDate: knobs.dualDates ? isoDate(plan.month, 1 + Math.floor(rand() * 28)) : "",
          paymentDate,
          updatedAt: shiftDays(paymentDate, 1 + Math.floor(rand() * 20)),
          rawAmount: formatAmount(magnitude, Math.floor(rand() * 3)),
          amountBackup: "",
        });
      }
    }
  });

  // Row order is shuffled by a PRNG key INDEPENDENT of `updatedAt` (design
  // S6): "the last row wins" must not be a substitute for comparing
  // timestamps, and "the first row wins" must not be either.
  sortable.sort((a, b) => a.sortKey - b.sortKey);
  const rows = sortable.map((s) => s.row);

  const header = ["orderId", "customerId"];
  if (knobs.refundRate > 0) header.push("type", "origOrderId");
  if (knobs.dualDates) header.push("orderDate");
  header.push("paymentDate", "updatedAt", "rawAmount", "amountBackup");

  const csvLines = [header.join(",")];
  for (const row of rows) {
    const cells = [row.orderId, row.customerId];
    if (knobs.refundRate > 0) cells.push(row.type, row.origOrderId);
    if (knobs.dualDates) cells.push(row.orderDate);
    cells.push(row.paymentDate, row.updatedAt, row.rawAmount, row.amountBackup);
    csvLines.push(cells.join(","));
  }

  const warehouse: FixtureWarehouseV3 = {
    seed,
    generatorId: DATA_OPS_GENERATOR_V3_ID,
    knobs,
    facts,
    rows,
    csv: csvLines.join("\n"),
  };
  assertMagnitudeInvariant(warehouse);
  assertAnswerNotLeakedV3(warehouse);
  return warehouse;
}

/**
 * The published rule text — the SAME numbered pipeline the generator and the
 * independent interpreter implement (design S3). Stating it is a reversal of
 * v2's non-prescriptive prompt, and a deliberate one: with L1/L2/L3 in play, a
 * silent rule set would measure rule-GUESSING, which is neither the competence
 * under study nor stable across arms. What stays unstated is the amount-format
 * zoo — frozen v2 messiness the candidate must still discover for itself.
 */
function pipelineText(knobs: V3Knobs, customerId: string, month: string): string[] {
  const steps: string[] = [
    `1. Parse every row. All dates are ISO 8601 (YYYY-MM-DD), one timezone, no`,
    `   time component.`,
    `2. Resolve duplicates: rows sharing an "orderId" collapse to ONE row — keep`,
    `   the row with the latest "updatedAt"; if several tie on "updatedAt", keep`,
    `   the one with the largest amount; rows identical on both are exact`,
    `   duplicates of each other.`,
  ];
  steps.push(
    knobs.dualDates
      ? `3. Attribute every surviving row to a month using "paymentDate". The`
      : `3. Attribute every surviving row to a month using "paymentDate".`,
  );
  if (knobs.dualDates) {
    steps.push(`   "orderDate" column is never used for attribution.`);
  }
  steps.push(`4. Keep only rows for customer ${customerId} in payment month ${month}.`);
  if (knobs.refundRate > 0) {
    steps.push(
      `5. Validate references: a row of type "refund" or "adjustment" counts ONLY`,
      `   if its "origOrderId" names an order that survived steps 2-4. Refunds`,
      `   are whole-order, at most one per order, and never exceed the order`,
      `   amount. Adjustments carry a signed amount.`,
      `6. Aggregate: "orderCount" is the number of distinct surviving rows of`,
      `   type "order"; "revenueCents" is their total minus every valid refund,`,
      `   plus or minus every valid adjustment, in integer cents.`,
    );
  } else {
    steps.push(
      `5. Aggregate: "orderCount" is the number of distinct surviving rows;`,
      `   "revenueCents" is their total, in integer cents.`,
    );
  }
  return steps;
}

/**
 * One `BatteryTask` per (customer, month) group — 10 per warehouse (design S1).
 * The required artifact is byte-identical to v1/v2's: it is a parsing contract
 * with `observeCheck`, not a hint about the task, and the separation gate
 * already measured what happens when candidates improvise fences.
 *
 * `orderCount` stays exact; `revenueCents` carries partial credit at
 * `REVENUE_ZERO_AT` — both frozen from v2 (design §1), because round 3 changes
 * the battery and nothing else.
 */
export function buildTasksV3(warehouse: FixtureWarehouseV3, taskIdPrefix: string = ""): BatteryTask[] {
  const tasks: BatteryTask[] = [];
  for (const fact of warehouse.facts) {
    const groupKey = `${fact.customerId}__${fact.month}`;
    const taskId = `${taskIdPrefix}data-ops-fact-recovery-${groupKey}`;
    const prompt = [
      `The CSV below is a raw ledger extract from a data warehouse. It was`,
      `assembled from several upstream systems that did not agree on formats,`,
      `and it covers many customers and months.`,
      ``,
      `Apply exactly this pipeline, in this order:`,
      ...pipelineText(warehouse.knobs, fact.customerId, fact.month),
      ``,
      `CSV:`,
      "```csv",
      warehouse.csv,
      "```",
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
 * The v3.1 task builder (`V3.1-BATTERY-DESIGN.md` §1) — `buildTasksV3` plus
 * the ONE pre-registered mitigation: each task declares the fence alias
 * `json` → `answer.json`, honoured by `parseArtifactsForTask` in the shared
 * scoring seam. Explicit `path=` blocks always win; ambiguity fails closed;
 * the strict contract stays measurable as a secondary endpoint because the
 * alias is applied at parse time, never by rewriting the response. The
 * prompt is BYTE-IDENTICAL to v3's — the mitigation is scoring, not
 * prompting, which is what makes it arm-symmetric by construction.
 */
export function buildTasksV3_1(warehouse: FixtureWarehouseV3, taskIdPrefix: string = ""): BatteryTask[] {
  return buildTasksV3(warehouse, taskIdPrefix).map((task) => ({
    ...task,
    fenceAlias: { info: "json", path: "answer.json" },
  }));
}

/**
 * The v3 construction path. Throws until a human adds `DATA_OPS_GENERATOR_V3_ID`
 * to `ACCEPTED_GENERATORS` — the acceptance event has to come from Dr. Robert
 * Li in session, because an agent adding its own generator to the accepted
 * table makes the acceptance self-issued and worthless.
 */
export function generateFixtureBatteryV3(
  seed: number,
  batteryId: string,
  knobs: V3Knobs,
): AgentBattery {
  const warehouse = generateWarehouseV3(seed, knobs);
  const tasks = buildTasksV3(warehouse);
  const receipt = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_V3_ID);
  requireGeneratorRooted(receipt, DATA_OPS_GENERATOR_V3_ID);
  return admitVerticalBattery("data-ops", { id: batteryId, tasks, receipt });
}

/**
 * The v3 split battery — two INDEPENDENTLY-seeded warehouses at the SAME grid
 * point, the same `admitVerticalBattery` path, the same `makeSplitBattery`
 * pair-level disjointness. The promotion half must stay genuinely held out;
 * that is structural here, never a caller remembering to hold something back.
 */
export function generateFixtureSplitBatteryV3(seed: number, knobs: V3Knobs): SplitBattery {
  const promotionSeed = derivePromotionSeed(seed);
  const searchBatteryId = `data-ops-v3-${knobs.id}-search-${seed}`;
  const promotionBatteryId = `data-ops-v3-${knobs.id}-promotion-${seed}`;

  const receipt = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_V3_ID);
  requireGeneratorRooted(receipt, DATA_OPS_GENERATOR_V3_ID);

  const searchBattery = admitVerticalBattery("data-ops", {
    id: searchBatteryId,
    tasks: buildTasksV3(generateWarehouseV3(seed, knobs), `${searchBatteryId}::`),
    receipt,
  });
  const promotionBattery = admitVerticalBattery("data-ops", {
    id: promotionBatteryId,
    tasks: buildTasksV3(generateWarehouseV3(promotionSeed, knobs), `${promotionBatteryId}::`),
    receipt,
  });

  return makeSplitBattery(
    { id: searchBattery.id, tasks: searchBattery.tasks, receipt: searchBattery.receipt },
    { id: promotionBattery.id, tasks: promotionBattery.tasks, receipt: promotionBattery.receipt },
  );
}

/**
 * The v3.1 construction paths — identical in structure to v3's, differing
 * only in the generator id and `buildTasksV3_1`. Both throw until the human
 * acceptance of `DATA_OPS_GENERATOR_V31_ID` exists.
 */
export function generateFixtureBatteryV3_1(
  seed: number,
  batteryId: string,
  knobs: V3Knobs,
): AgentBattery {
  const warehouse = generateWarehouseV3(seed, knobs);
  const tasks = buildTasksV3_1(warehouse);
  const receipt = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_V31_ID);
  requireGeneratorRooted(receipt, DATA_OPS_GENERATOR_V31_ID);
  return admitVerticalBattery("data-ops", { id: batteryId, tasks, receipt });
}

export function generateFixtureSplitBatteryV3_1(seed: number, knobs: V3Knobs): SplitBattery {
  const promotionSeed = derivePromotionSeed(seed);
  const searchBatteryId = `data-ops-v3.1-${knobs.id}-search-${seed}`;
  const promotionBatteryId = `data-ops-v3.1-${knobs.id}-promotion-${seed}`;

  const receipt = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_V31_ID);
  requireGeneratorRooted(receipt, DATA_OPS_GENERATOR_V31_ID);

  const searchBattery = admitVerticalBattery("data-ops", {
    id: searchBatteryId,
    tasks: buildTasksV3_1(generateWarehouseV3(seed, knobs), `${searchBatteryId}::`),
    receipt,
  });
  const promotionBattery = admitVerticalBattery("data-ops", {
    id: promotionBatteryId,
    tasks: buildTasksV3_1(generateWarehouseV3(promotionSeed, knobs), `${promotionBatteryId}::`),
    receipt,
  });

  return makeSplitBattery(
    { id: searchBattery.id, tasks: searchBattery.tasks, receipt: searchBattery.receipt },
    { id: promotionBattery.id, tasks: promotionBattery.tasks, receipt: promotionBattery.receipt },
  );
}
