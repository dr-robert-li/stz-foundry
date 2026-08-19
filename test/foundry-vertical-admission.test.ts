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
  type AdmissionRecord,
} from "../src/foundry/vertical-admission.js";
import {
  generateWarehouse,
  buildTasks,
  acceptedGeneratorReceipt,
  DATA_OPS_GENERATOR_ID,
  ACCEPTED_GENERATORS,
} from "../src/foundry/fixture-warehouse.js";
import { CUSTOMER_SUPPORT_GENERATOR_ID } from "../src/foundry/customer-support-warehouse.js";

const ALL_VERTICALS: Vertical[] = [
  "data-ops",
  "bi-analytics",
  "performance-marketing",
  "customer-support",
  "revops-gtm-exec-strategy",
];

// customer-support is admitted as of Phase 14 Plan 04 (REQ-68) — it is no
// longer a NON_ADMITTED vertical for the purposes of this array-driven sweep.
const NON_ADMITTED_VERTICALS: Vertical[] = ["performance-marketing", "revops-gtm-exec-strategy"];

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

  it("bi-analytics: admitted, oracle class names execution + construction (REQ-50)", () => {
    const record = admitVertical("bi-analytics");
    expect(record.verdict).toBe("admitted");
    expect(record.oracleClass).toContain("execution");
    expect(record.oracleClass).toContain("construction");
    expect(record.note).toContain("REQ-50");
  });

  it("performance-marketing: pending, oracle class names replay, note records the horizon cap", () => {
    const record = admitVertical("performance-marketing");
    expect(record.verdict).toBe("pending");
    expect(record.oracleClass).toBe("replay");
    expect(record.note.toLowerCase()).toContain("horizon");
  });

  it("customer-support: admitted (REQ-68), oracle class still names replay + construction, note cites the freeze commit and the replay-checkable scoping — never a study verdict label", () => {
    const record = admitVertical("customer-support");
    expect(record.verdict).toBe("admitted");
    expect(record.oracleClass).toContain("replay");
    expect(record.oracleClass).toContain("construction");
    expect(record.note).toContain("REQ-68");
    expect(record.note).toContain("2f9e6095dc6e20bcc8196a293397f7ec07f8c704");
    expect(record.note).toContain("replay-checkable subset only");
    expect(record.note).toContain("never the full ticket-resolution task");
    expect(record.note).not.toMatch(/SUPERIOR|INDISTINGUISHABLE|paired round|paired-round/);
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

  it("returns the record for bi-analytics (admitted, REQ-50)", () => {
    const record = requireAdmitted("bi-analytics");
    expect(record.verdict).toBe("admitted");
  });

  it("throws VerticalRefusedError for performance-marketing, naming the vertical, its verdict, and its oracle class", () => {
    const err = thrown(() => requireAdmitted("performance-marketing"));
    expect(err).toBeInstanceOf(VerticalRefusedError);
    expect(err.message).toContain("performance-marketing");
    expect(err.message).toContain("pending");
    expect(err.message).toContain("replay");
  });

  it("returns the record for customer-support (admitted, REQ-68)", () => {
    const record = requireAdmitted("customer-support");
    expect(record.verdict).toBe("admitted");
  });

  it("throws VerticalRefusedError for revops-gtm-exec-strategy, naming the vertical, its verdict, and its oracle class", () => {
    const err = thrown(() => requireAdmitted("revops-gtm-exec-strategy"));
    expect(err).toBeInstanceOf(VerticalRefusedError);
    expect(err.message).toContain("revops-gtm-exec-strategy");
    expect(err.message).toContain("refused");
    expect(err.message).toContain("none fast");
  });

  it("each of the three refusal messages names ONLY its own vertical's verdict — one message cannot cover all three", () => {
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

  it("refuses performance-marketing too — a pending vertical is not silently treated as admitted", () => {
    const err = thrown(() => admitVerticalBattery("performance-marketing", validDraft()));
    expect(err).toBeInstanceOf(VerticalRefusedError);
    expect(err.message).toContain("performance-marketing");
  });

  // customer-support is admitted as of Phase 14 Plan 04 (REQ-68); its own
  // refusal-through-the-real-path case no longer applies here — see the
  // `admitVertical`/`requireAdmitted` describe blocks above for its
  // admitted-state coverage. No `admitVerticalBattery("customer-support", ...)`
  // success-path test is added: constructing a customer-support battery would
  // require an `OracleReceipt`, and this phase's own generator is
  // deliberately unaccepted (PD-1, `CUSTOMER_SUPPORT_GENERATOR_ID` absent
  // from `ACCEPTED_GENERATORS`, asserted below) — exercising that path here
  // would brush the "no acceptance-requiring route" prohibition for no
  // must-have this plan states.

  it("admits bi-analytics through the real construction path now that it is admitted (REQ-50 activation)", () => {
    const draft = validDraft();
    const battery = admitVerticalBattery("bi-analytics", draft);
    expect(battery.tasks.length).toBe(draft.tasks.length);
  });
});

describe("the admission table is sealed at RUNTIME, not merely typed readonly", () => {
  // `ReadonlyMap` is a compile-time convention. Before sealing, a holder of the
  // exported reference could `.set("revops-gtm-exec-strategy", {verdict:
  // "admitted", ...})` and walk past `requireAdmitted` without ever supplying an
  // override, a judge, or a config key — REQ-27's guarantee would have been a
  // convention rather than a guard, which is exactly v1.18.0's found gap one
  // altitude down.
  const mutable = () => VERTICAL_ADMISSION as unknown as Map<Vertical, AdmissionRecord>;

  it("set() on the admission table throws", () => {
    const e = thrown(() =>
      mutable().set("revops-gtm-exec-strategy", {
        vertical: "revops-gtm-exec-strategy",
        verdict: "admitted",
        oracleClass: "forged",
        mechanism: "forged",
        note: "forged",
      }),
    );
    expect(e.message).toContain("sealed");
  });

  it("delete() and clear() on the admission table throw", () => {
    expect(thrown(() => mutable().delete("data-ops")).message).toContain("sealed");
    expect(thrown(() => mutable().clear()).message).toContain("sealed");
  });

  it("a refused vertical CANNOT be admitted by rewriting the table — the real path still refuses", () => {
    // The bypass attempt and the real-path consequence, in one test: even after
    // trying to flip the row, requireAdmitted still refuses.
    try {
      mutable().set("revops-gtm-exec-strategy", {
        vertical: "revops-gtm-exec-strategy",
        verdict: "admitted",
        oracleClass: "forged",
        mechanism: "forged",
        note: "forged",
      });
    } catch {
      /* expected — sealed */
    }
    expect(admitVertical("revops-gtm-exec-strategy").verdict).toBe("refused");
    expect(thrown(() => requireAdmitted("revops-gtm-exec-strategy")).message).toContain("refused");
  });

  it("an admission record cannot be mutated in place either", () => {
    const record = admitVertical("revops-gtm-exec-strategy");
    expect(() => {
      (record as { verdict: string }).verdict = "admitted";
    }).toThrow();
    expect(admitVertical("revops-gtm-exec-strategy").verdict).toBe("refused");
  });
});

describe("customer-support admission (Phase 14 Plan 04, REQ-68) — build evidence only, F-19", () => {
  it("the other four rows are byte-identical to their pre-edit state — this plan touches ONLY the customer-support row", () => {
    expect(admitVertical("data-ops")).toEqual({
      vertical: "data-ops",
      verdict: "admitted",
      oracleClass: "execution + construction",
      mechanism: "dbt tests, data-diff, SQL vs fixture warehouse",
      note: "Pilot — first",
    });
    expect(admitVertical("bi-analytics")).toEqual({
      vertical: "bi-analytics",
      verdict: "admitted",
      oracleClass: "execution + construction",
      mechanism:
        "candidate SQL executed in-process against a frozen per-seed star-schema warehouse, result " +
        "set diffed against the answer-first precomputed known answer",
      note: "REQ-50 — admitted per the frozen BI-BATTERY-DESIGN.md rev 2 (freeze commit c950e4d)",
    });
    expect(admitVertical("performance-marketing")).toEqual({
      vertical: "performance-marketing",
      verdict: "pending",
      oracleClass: "replay",
      mechanism: "replayed campaign logs vs held-out actuals",
      note: "Later; horizon-capped",
    });
    expect(admitVertical("revops-gtm-exec-strategy")).toEqual({
      vertical: "revops-gtm-exec-strategy",
      verdict: "refused",
      oracleClass: "none fast",
      mechanism:
        "only resolvable forecasts (probabilistic predictions scored ex post, Brier) — exogenous but weeks-lagged",
      note: "Refused until a forecast-mode oracle is built",
    });
  });

  it("the acceptance table (ACCEPTED_GENERATORS) still does not contain the new generator id — admission and acceptance are independent axes", () => {
    expect(ACCEPTED_GENERATORS.has(CUSTOMER_SUPPORT_GENERATOR_ID)).toBe(false);
  });
});
