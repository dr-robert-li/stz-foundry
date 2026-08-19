/**
 * The customer-support ticket LEAK check (Phase 14 — Instrument build, Plan
 * 14-02, Task 2, REQ-68, T-14-05). Separate from the fidelity check on
 * purpose — that check asks whether the ticket DENOTES its resolution, this
 * one asks whether it GIVES IT AWAY; a single combined check would let one
 * failure hide behind the other's pass.
 *
 * Reuses `normalizeField` directly from the oracle module (the same
 * normalisation rule the oracle applies to a candidate's own response) —
 * this is deliberately the SAME rule, not an independently re-derived one:
 * the point of a leak check is "would the oracle's own match rule treat
 * this ticket text as already containing the answer," so it must use the
 * oracle's own normalisation, not a fresh guess at one.
 */
import { describe, it, expect } from "vitest";
import { generateCustomerSupportTicket } from "../src/foundry/customer-support-warehouse.js";
import { normalizeField } from "../src/foundry/customer-support-oracle.js";
import {
  PAIRED_SEEDS,
  PAIRED_TASKS_PER_SEED,
  CEILING_PROBE_SEED,
  CEILING_PROBE_TASK_COUNT,
  TOURNAMENT_SEARCH_SEEDS,
  TOURNAMENT_PROMOTION_SEEDS,
} from "../experiments/paired-comparison-arm/_paired-constants.js";

const SEED_BLOCKS: ReadonlyArray<{ seed: number; taskCount: number }> = [
  ...PAIRED_SEEDS.map((seed) => ({ seed, taskCount: PAIRED_TASKS_PER_SEED })),
  { seed: CEILING_PROBE_SEED, taskCount: CEILING_PROBE_TASK_COUNT },
  ...[...TOURNAMENT_SEARCH_SEEDS, ...TOURNAMENT_PROMOTION_SEEDS].map((seed) => ({ seed, taskCount: PAIRED_TASKS_PER_SEED })),
];

function sweep(): ReturnType<typeof generateCustomerSupportTicket>[] {
  const tickets: ReturnType<typeof generateCustomerSupportTicket>[] = [];
  for (const { seed, taskCount } of SEED_BLOCKS) {
    for (let taskIndex = 0; taskIndex < taskCount; taskIndex++) {
      tickets.push(generateCustomerSupportTicket(seed, taskIndex));
    }
  }
  return tickets;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Boundary-aware normalized-equal containment — the same idiom
 *  `test/foundry-bi-warehouse.test.ts`'s own `cellLeaked` uses, adapted for
 *  string field values: a value is "leaked" only if it occurs surrounded by
 *  non-alphanumeric characters (or text boundaries — sentence-final
 *  punctuation like "." is always a valid boundary, never excluded). A
 *  dollar-formatted parameter like "49.00" already cannot false-positive
 *  against an unrelated digit run like an order number ("4900123" contains
 *  no literal "." at all, so the substring match itself fails) without
 *  needing "." in the excluded boundary set — including it there would
 *  wrongly refuse to match a leak that happens to sit at the end of a
 *  sentence (e.g. "...action: escalate-repeat-defect."). */
function fieldLeaked(ticketText: string, fieldValue: string): boolean {
  const haystack = normalizeField(ticketText);
  const needle = normalizeField(fieldValue);
  if (needle.length === 0) return false;
  const pattern = new RegExp(`(?<![a-z0-9])${escapeRegExp(needle)}(?![a-z0-9])`);
  return pattern.test(haystack);
}

describe("leak check — no ticket states its own resolution's action, category, or parameter value (design §4, T-14-05)", () => {
  it("across the full pinned-seed sweep, no field value occurs in its own ticket text", () => {
    let checked = 0;
    for (const ticket of sweep()) {
      expect(fieldLeaked(ticket.ticketText, ticket.resolution.action)).toBe(false);
      expect(fieldLeaked(ticket.ticketText, ticket.resolution.category)).toBe(false);
      expect(fieldLeaked(ticket.ticketText, ticket.resolution.parameter)).toBe(false);
      checked++;
    }
    expect(checked).toBe(PAIRED_SEEDS.length * PAIRED_TASKS_PER_SEED + CEILING_PROBE_TASK_COUNT + 6 * PAIRED_TASKS_PER_SEED);
  });

  it("POSITIVE CONTROL: a deliberately leaky ticket text (containing its own parameter value verbatim) IS caught — the assertion above is not vacuously true", () => {
    const ticket = generateCustomerSupportTicket(PAIRED_SEEDS[0]!, 0);
    const leakyText = `${ticket.ticketText} By the way, the correction amount is ${ticket.resolution.parameter} dollars.`;
    expect(fieldLeaked(leakyText, ticket.resolution.parameter)).toBe(true);
  });

  it("POSITIVE CONTROL: a deliberately leaky ticket text (containing its own action label verbatim) IS caught", () => {
    const ticket = generateCustomerSupportTicket(PAIRED_SEEDS[1]!, 0);
    const leakyText = `${ticket.ticketText} Suggested action: ${ticket.resolution.action}.`;
    expect(fieldLeaked(leakyText, ticket.resolution.action)).toBe(true);
  });

  it("the boundary-aware check does not false-positive on a coincidental digit substring (e.g. a parameter value embedded inside a longer order number)", () => {
    // "49.00" must not be reported as leaked merely because the digits
    // "4900" appear inside an unrelated 6-digit order number like 490012.
    expect(fieldLeaked("Order #490012: unrelated ticket text.", "49.00")).toBe(false);
  });
});
