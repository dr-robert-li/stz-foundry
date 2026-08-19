/**
 * The customer-support generator's full-taxonomy + fidelity obligations
 * (Phase 14 — Instrument build, Plan 14-02, Task 1, REQ-68). Sweeps every
 * unit of every seed block `_paired-constants.ts` pins — the six paired
 * seeds, the probe seed, and the six tournament seeds — 130 units total.
 *
 * House rule (`test/foundry-battery-types.test.ts:44-51`): assert the
 * thrown message's CONTENT, never bare `.toThrow()`.
 */
import { describe, it, expect } from "vitest";
import {
  generateCustomerSupportTicket,
  CUSTOMER_SUPPORT_ACTIONS,
  CUSTOMER_SUPPORT_CATEGORIES,
  CUSTOMER_SUPPORT_ACTION_META,
  type CustomerSupportCategoryLabel,
} from "../src/foundry/customer-support-warehouse.js";
import { renderTicketIndependent, extractSituationFields } from "./fixtures/customer-support-ticket-fidelity.js";
import {
  PAIRED_SEEDS,
  PAIRED_TASKS_PER_SEED,
  CEILING_PROBE_SEED,
  CEILING_PROBE_TASK_COUNT,
  TOURNAMENT_SEARCH_SEEDS,
  TOURNAMENT_PROMOTION_SEEDS,
} from "../experiments/paired-comparison-arm/_paired-constants.js";

/** Every seed block pinned for this phase, with its own task count — never
 *  a re-typed literal, all imported from `_paired-constants.ts`. */
const SEED_BLOCKS: ReadonlyArray<{ seed: number; taskCount: number }> = [
  ...PAIRED_SEEDS.map((seed) => ({ seed, taskCount: PAIRED_TASKS_PER_SEED })),
  { seed: CEILING_PROBE_SEED, taskCount: CEILING_PROBE_TASK_COUNT },
  ...[...TOURNAMENT_SEARCH_SEEDS, ...TOURNAMENT_PROMOTION_SEEDS].map((seed) => ({ seed, taskCount: PAIRED_TASKS_PER_SEED })),
];

const EXPECTED_SWEEP_SIZE =
  PAIRED_SEEDS.length * PAIRED_TASKS_PER_SEED +
  CEILING_PROBE_TASK_COUNT +
  (TOURNAMENT_SEARCH_SEEDS.length + TOURNAMENT_PROMOTION_SEEDS.length) * PAIRED_TASKS_PER_SEED;

function sweep(): ReturnType<typeof generateCustomerSupportTicket>[] {
  const tickets: ReturnType<typeof generateCustomerSupportTicket>[] = [];
  for (const { seed, taskCount } of SEED_BLOCKS) {
    for (let taskIndex = 0; taskIndex < taskCount; taskIndex++) {
      tickets.push(generateCustomerSupportTicket(seed, taskIndex));
    }
  }
  return tickets;
}

describe("determinism (design §1)", () => {
  it("generating the same seed/taskIndex twice returns byte-identical ticket text and a deep-equal resolution", () => {
    const first = generateCustomerSupportTicket(PAIRED_SEEDS[0]!, 0);
    const second = generateCustomerSupportTicket(PAIRED_SEEDS[0]!, 0);
    expect(second.ticketText).toBe(first.ticketText);
    expect(second.resolution).toEqual(first.resolution);
    expect(second.facts).toEqual(first.facts);
    expect(second.templateIndex).toBe(first.templateIndex);
  });
});

describe("action-to-category-to-parameter-type wellformedness (task 1 behavior)", () => {
  it("every closed action pairs with exactly one declared category and one declared parameter type", () => {
    expect(CUSTOMER_SUPPORT_ACTIONS.length).toBeGreaterThanOrEqual(6);
    expect(CUSTOMER_SUPPORT_CATEGORIES.length).toBeGreaterThanOrEqual(4);
    for (const action of CUSTOMER_SUPPORT_ACTIONS) {
      const meta = CUSTOMER_SUPPORT_ACTION_META[action];
      expect(meta).toBeDefined();
      expect(CUSTOMER_SUPPORT_CATEGORIES).toContain(meta.category);
      expect(["monetary", "lookup"]).toContain(meta.parameterType);
    }
  });

  it("every declared category is actually reachable by at least one action", () => {
    const reachable = new Set<CustomerSupportCategoryLabel>(CUSTOMER_SUPPORT_ACTIONS.map((a) => CUSTOMER_SUPPORT_ACTION_META[a].category));
    for (const category of CUSTOMER_SUPPORT_CATEGORIES) {
      expect(reachable.has(category)).toBe(true);
    }
  });
});

describe(`the full seeded sweep — ${EXPECTED_SWEEP_SIZE} units across every pinned seed block`, () => {
  it(`sweep size is exactly ${EXPECTED_SWEEP_SIZE}`, () => {
    expect(sweep().length).toBe(EXPECTED_SWEEP_SIZE);
  });

  it("every ticket's parameter matches its declared parameter type's shape", () => {
    for (const ticket of sweep()) {
      const meta = CUSTOMER_SUPPORT_ACTION_META[ticket.resolution.action];
      if (meta.parameterType === "monetary") {
        expect(ticket.resolution.parameter).toMatch(/^\d+\.\d{2}$/);
      } else {
        expect(typeof ticket.resolution.parameter).toBe("string");
        expect(ticket.resolution.parameter.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("ticket-fidelity — the fields extracted from the generator's own ticket text equal the fields extracted from an independently re-rendered ticket, field for field (task 1, REQ-68)", () => {
  it("across the full sweep, both extractions agree with each other and with the true resolution", () => {
    let compared = 0;
    for (const ticket of sweep()) {
      const fromGenerator = extractSituationFields(ticket.ticketText);
      const independentText = renderTicketIndependent(ticket.resolution.action, ticket.facts);
      const fromIndependent = extractSituationFields(independentText);

      expect(fromGenerator).toEqual(ticket.resolution);
      expect(fromIndependent).toEqual(ticket.resolution);
      expect(fromGenerator).toEqual(fromIndependent);
      compared++;
    }
    expect(compared).toBe(EXPECTED_SWEEP_SIZE);
  });
});

describe("template independence — F-32's mitigation", () => {
  it("every template appears with at least two distinct categories across the full sweep", () => {
    const categoriesByTemplate = new Map<number, Set<CustomerSupportCategoryLabel>>();
    for (const ticket of sweep()) {
      const set = categoriesByTemplate.get(ticket.templateIndex) ?? new Set<CustomerSupportCategoryLabel>();
      set.add(ticket.resolution.category);
      categoriesByTemplate.set(ticket.templateIndex, set);
    }
    // Every template index that exists in the vocabulary must have been
    // drawn at least once across 130 units, and each seen with >= 2
    // distinct categories.
    expect(categoriesByTemplate.size).toBeGreaterThanOrEqual(3);
    for (const [, categories] of categoriesByTemplate) {
      expect(categories.size).toBeGreaterThanOrEqual(2);
    }
  });

  it("template choice does not deterministically follow from category (at least one category is rendered by more than one template)", () => {
    const templatesByCategory = new Map<CustomerSupportCategoryLabel, Set<number>>();
    for (const ticket of sweep()) {
      const set = templatesByCategory.get(ticket.resolution.category) ?? new Set<number>();
      set.add(ticket.templateIndex);
      templatesByCategory.set(ticket.resolution.category, set);
    }
    const anyMultiTemplateCategory = [...templatesByCategory.values()].some((set) => set.size >= 2);
    expect(anyMultiTemplateCategory).toBe(true);
  });
});

describe("derivable-but-unstated parameter (design §4)", () => {
  it("no ticket's rendered text states a negative dollar amount", () => {
    for (const ticket of sweep()) {
      expect(ticket.ticketText).not.toContain("$-");
    }
  });
});
