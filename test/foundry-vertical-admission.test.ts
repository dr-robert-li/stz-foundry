/**
 * The vertical-admission gate (Phase 1 — Data-ops pilot battery, Plan
 * 01-02, REQ-27). Every throwing assertion checks the thrown message's
 * CONTENT, never bare `.toThrow()` (RESEARCH Pitfall 2, house rule from
 * `test/foundry-battery-types.test.ts`'s `thrown()` idiom).
 *
 * Two kinds of test live here and neither substitutes for the other
 * (RESEARCH Pitfall 4): "isolated" tests call `admitVertical`/
 * `requireAdmitted` directly and prove the table is right; "real path"
 * tests call `admitVerticalBattery` — the ONLY construction entry point
 * this phase's code uses — with an otherwise-valid draft, and prove the
 * table is actually CONSULTED there. Mutation M1 in this plan's SUMMARY
 * shows the isolated tests stay green while a real-path-only bug turns
 * only the real-path test red — that asymmetry is the whole point.
 */
import { describe, it, expect } from "vitest";
import {
  VERTICAL_ADMISSION,
  VerticalRefusedError,
  admitVertical,
  requireAdmitted,
  admitVerticalBattery,
  type Vertical,
} from "../src/foundry/vertical-admission.js";
import {
  generateWarehouse,
  buildTasks,
  acceptedGeneratorReceipt,
  DATA_OPS_GENERATOR_ID,
} from "../src/foundry/fixture-warehouse.js";

const ALL_VERTICALS: Vertical[] = [
  "data-ops",
  "bi-analytics",
  "performance-marketing",
  "customer-support",
  "revops-gtm-exec-strategy",
];

const NON_ADMITTED_VERTICALS: Vertical[] = [
  "bi-analytics",
  "performance-marketing",
  "customer-support",
  "revops-gtm-exec-strategy",
];

function thrown(fn: () => unknown): Error {
  try {
    fn();
  } catch (e) {
    return e as Error;
  }
  throw new Error("expected fn to throw, it did not");
}

/** A real, otherwise-completely-legal draft — a generator-rooted receipt
 *  from `acceptedGeneratorReceipt`, real `buildTasks` output (well-formed
 *  tasks each with real checks). Used by the real-path tests so a refusal
 *  can only be attributed to the admission step, never to a shape
 *  violation that would have thrown anyway. */
function validDraft() {
  const warehouse = generateWarehouse(1);
  const tasks = buildTasks(warehouse);
  const receipt = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_ID);
  return { id: "vertical-admission-real-path-draft", tasks, receipt };
}

describe("VERTICAL_ADMISSION — the complete five-row table", () => {
  it("has exactly five rows, keyed by the full Vertical union (a dropped row cannot pass silently)", () => {
    expect(VERTICAL_ADMISSION.size).toBe(5);
    expect(new Set(VERTICAL_ADMISSION.keys())).toEqual(new Set(ALL_VERTICALS));
  });
});

describe("admitVertical — the five-row posture (docs/development/harness-factory.md's table, transcribed)", () => {
  it("data-ops: admitted, oracle class names execution + construction", () => {
    const record = admitVertical("data-ops");
    expect(record.verdict).toBe("admitted");
    expect(record.oracleClass).toContain("execution");
    expect(record.oracleClass).toContain("construction");
  });

  it("bi-analytics: pending, oracle class names construction", () => {
    const record = admitVertical("bi-analytics");
    expect(record.verdict).toBe("pending");
    expect(record.oracleClass).toBe("construction");
  });

  it("performance-marketing: pending, oracle class names replay, note records the horizon cap", () => {
    const record = admitVertical("performance-marketing");
    expect(record.verdict).toBe("pending");
    expect(record.oracleClass).toBe("replay");
    expect(record.note.toLowerCase()).toContain("horizon");
  });

  it("customer-support: pending, oracle class names replay + construction, note records rubricCalibrated is mandatory", () => {
    const record = admitVertical("customer-support");
    expect(record.verdict).toBe("pending");
    expect(record.oracleClass).toContain("replay");
    expect(record.oracleClass).toContain("construction");
    expect(record.note).toContain("rubricCalibrated");
  });

  it("revops-gtm-exec-strategy: refused, oracle class records no fast oracle and that only resolvable forecasts would qualify", () => {
    const record = admitVertical("revops-gtm-exec-strategy");
    expect(record.verdict).toBe("refused");
    expect(record.oracleClass.toLowerCase()).toContain("none fast");
    expect(record.mechanism.toLowerCase()).toContain("resolvable forecasts");
  });
});

describe("admitVertical — unknown id fails closed (never defaults to admitted or pending)", () => {
  it("an id absent from the table throws, naming the unknown id and listing the known ones", () => {
    const err = thrown(() => admitVertical("bi" as Vertical));
    expect(err).toBeInstanceOf(VerticalRefusedError);
    expect(err.message).toContain("bi");
    for (const known of ALL_VERTICALS) {
      expect(err.message).toContain(known);
    }
  });
});

describe("requireAdmitted — the separate throw step", () => {
  it("returns the record for data-ops (the only admitted vertical)", () => {
    const record = requireAdmitted("data-ops");
    expect(record.verdict).toBe("admitted");
  });

  it("throws VerticalRefusedError for bi-analytics, naming the vertical, its verdict, and its oracle class", () => {
    const err = thrown(() => requireAdmitted("bi-analytics"));
    expect(err).toBeInstanceOf(VerticalRefusedError);
    expect(err.message).toContain("bi-analytics");
    expect(err.message).toContain("pending");
    expect(err.message).toContain("construction");
  });

  it("throws VerticalRefusedError for performance-marketing, naming the vertical, its verdict, and its oracle class", () => {
    const err = thrown(() => requireAdmitted("performance-marketing"));
    expect(err).toBeInstanceOf(VerticalRefusedError);
    expect(err.message).toContain("performance-marketing");
    expect(err.message).toContain("pending");
    expect(err.message).toContain("replay");
  });

  it("throws VerticalRefusedError for customer-support, naming the vertical, its verdict, and its oracle class", () => {
    const err = thrown(() => requireAdmitted("customer-support"));
    expect(err).toBeInstanceOf(VerticalRefusedError);
    expect(err.message).toContain("customer-support");
    expect(err.message).toContain("pending");
    expect(err.message).toContain("replay");
  });

  it("throws VerticalRefusedError for revops-gtm-exec-strategy, naming the vertical, its verdict, and its oracle class", () => {
    const err = thrown(() => requireAdmitted("revops-gtm-exec-strategy"));
    expect(err).toBeInstanceOf(VerticalRefusedError);
    expect(err.message).toContain("revops-gtm-exec-strategy");
    expect(err.message).toContain("refused");
    expect(err.message).toContain("none fast");
  });

  it("each of the four refusal messages names ONLY its own vertical's verdict — one message cannot cover all four", () => {
    const messages = NON_ADMITTED_VERTICALS.map((v) => thrown(() => requireAdmitted(v)).message);
    const uniqueMessages = new Set(messages);
    expect(uniqueMessages.size).toBe(NON_ADMITTED_VERTICALS.length);
  });
});

describe("no exported function here takes an override, judge profile, or config key (structural arity control)", () => {
  it("admitVertical takes exactly one parameter", () => {
    expect(admitVertical.length).toBe(1);
  });

  it("requireAdmitted takes exactly one parameter", () => {
    expect(requireAdmitted.length).toBe(1);
  });

  it("admitVerticalBattery takes exactly two parameters (vertical, draft) — no third override parameter", () => {
    expect(admitVerticalBattery.length).toBe(2);
  });
});

describe("admitVerticalBattery — the refusal fires on the REAL construction path, not only in isolation (D8, RESEARCH Pitfall 4)", () => {
  it("refuses revops-gtm-exec-strategy through the real construction entry point, with an otherwise-completely-legal draft", () => {
    const err = thrown(() => admitVerticalBattery("revops-gtm-exec-strategy", validDraft()));
    expect(err).toBeInstanceOf(VerticalRefusedError);
    expect(err.message).toContain("revops-gtm-exec-strategy");
  });

  it("discrimination control: the SAME draft admitted under data-ops returns a real battery — proving the refusal above was not caused by an invalid draft", () => {
    const draft = validDraft();
    const battery = admitVerticalBattery("data-ops", draft);
    expect(battery.tasks.length).toBe(draft.tasks.length);
  });

  it("refuses bi-analytics too — a pending vertical is not silently treated as admitted", () => {
    const err = thrown(() => admitVerticalBattery("bi-analytics", validDraft()));
    expect(err).toBeInstanceOf(VerticalRefusedError);
    expect(err.message).toContain("bi-analytics");
  });
});
