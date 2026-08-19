/**
 * The customer-support oracle's contract, independence, and unaccepted-id
 * obligations (Phase 14 — Instrument build, Plan 14-02, Task 2, REQ-68;
 * `experiments/paired-comparison-arm/PAIRED-DESIGN-PREREG.md` rev 2 §4/F-33
 * — FROZEN).
 *
 * House rule (`test/foundry-battery-types.test.ts:44-51`): assert the
 * thrown message's CONTENT, never bare `.toThrow()`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateCustomerSupportTicket, CUSTOMER_SUPPORT_GENERATOR_ID } from "../src/foundry/customer-support-warehouse.js";
import { classifyCustomerSupportResponse, normalizeField, extractResolutionFields } from "../src/foundry/customer-support-oracle.js";
import { ACCEPTED_GENERATORS } from "../src/foundry/fixture-warehouse.js";
import { PAIRED_SEEDS } from "../experiments/paired-comparison-arm/_paired-constants.js";
import { REPO_ROOT } from "./helpers/import-graph.js";

const ticket = generateCustomerSupportTicket(PAIRED_SEEDS[0]!, 0);

function labelledResponse(action: string, category: string, parameter: string): string {
  return `action: ${action}\ncategory: ${category}\nparameter: ${parameter}`;
}

describe("the four outcome categories — exhaustive, mutually exclusive, all reachable (design §4)", () => {
  it("no-artifact: empty or whitespace-only text", () => {
    expect(classifyCustomerSupportResponse("", ticket.resolution).category).toBe("no-artifact");
    expect(classifyCustomerSupportResponse("   \n\t  ", ticket.resolution).category).toBe("no-artifact");
    expect(classifyCustomerSupportResponse("I looked into your order and it seems fine.", ticket.resolution).category).toBe(
      "no-artifact",
    );
  });

  it("non-scoreable: a partial or ambiguous labelled response", () => {
    expect(classifyCustomerSupportResponse(`action: ${ticket.resolution.action}`, ticket.resolution).category).toBe(
      "non-scoreable",
    );
    expect(
      classifyCustomerSupportResponse(
        `action: ${ticket.resolution.action}\naction: something-else\ncategory: ${ticket.resolution.category}\nparameter: ${ticket.resolution.parameter}`,
        ticket.resolution,
      ).category,
    ).toBe("non-scoreable");
  });

  it("resolution-mismatch: all three fields present, at least one value wrong", () => {
    const raw = labelledResponse(ticket.resolution.action, ticket.resolution.category, "not-the-real-parameter");
    expect(classifyCustomerSupportResponse(raw, ticket.resolution).category).toBe("resolution-mismatch");
  });

  it("resolution-match: all three fields present and equal under normalization", () => {
    const raw = labelledResponse(ticket.resolution.action, ticket.resolution.category, ticket.resolution.parameter);
    const result = classifyCustomerSupportResponse(raw, ticket.resolution);
    expect(result.category).toBe("resolution-match");
    expect(result.score).toBe(1);
  });

  it("every category maps to a binary score, and only resolution-match scores 1", () => {
    const categories = [
      classifyCustomerSupportResponse("", ticket.resolution),
      classifyCustomerSupportResponse(`action: ${ticket.resolution.action}`, ticket.resolution),
      classifyCustomerSupportResponse(labelledResponse(ticket.resolution.action, ticket.resolution.category, "x"), ticket.resolution),
      classifyCustomerSupportResponse(
        labelledResponse(ticket.resolution.action, ticket.resolution.category, ticket.resolution.parameter),
        ticket.resolution,
      ),
    ];
    expect(categories.map((c) => c.category)).toEqual(["no-artifact", "non-scoreable", "resolution-mismatch", "resolution-match"]);
    expect(categories.map((c) => c.score)).toEqual([0, 0, 0, 1]);
  });
});

describe("all-three-fields-required for a match (design §4)", () => {
  it("a correct action + category but a missing parameter label never matches", () => {
    const raw = `action: ${ticket.resolution.action}\ncategory: ${ticket.resolution.category}`;
    expect(classifyCustomerSupportResponse(raw, ticket.resolution).category).toBe("non-scoreable");
  });
});

describe("case-insensitive LABEL rule (design §4)", () => {
  it("ACTION/Category/PARAMETER labels in any case are recognized", () => {
    const raw = `ACTION: ${ticket.resolution.action}\nCaTeGoRy: ${ticket.resolution.category}\nPARAMETER: ${ticket.resolution.parameter}`;
    expect(classifyCustomerSupportResponse(raw, ticket.resolution).category).toBe("resolution-match");
  });
});

describe("ambiguous-duplicate-label rule reduces to non-scoreable", () => {
  it("two different values under the same label makes the whole response non-scoreable, not a pick-one guess", () => {
    const raw = `action: ${ticket.resolution.action}\ncategory: ${ticket.resolution.category}\nparameter: ${ticket.resolution.parameter}\nparameter: something-else`;
    expect(classifyCustomerSupportResponse(raw, ticket.resolution).category).toBe("non-scoreable");
  });
});

describe("normalizeField — the three PERMITTED transformations (F-33)", () => {
  it("lower-cases", () => {
    expect(normalizeField("ADJUST-CHARGE")).toBe("adjust-charge");
  });
  it("trims leading/trailing whitespace", () => {
    expect(normalizeField("  49.00  ")).toBe("49.00");
  });
  it("collapses internal whitespace runs to a single space", () => {
    expect(normalizeField("order   total   discrepancy")).toBe("order total discrepancy");
  });
});

describe("normalizeField — the three EXPLICITLY-FORBIDDEN transformations do NOT occur", () => {
  it("a stemmed value does not match (e.g. 'adjusting' vs 'adjust')", () => {
    expect(normalizeField("adjusting-charge")).not.toBe(normalizeField("adjust-charge"));
  });
  it("a synonym does not match (e.g. 'fix-charge' vs 'adjust-charge')", () => {
    expect(normalizeField("fix-charge")).not.toBe(normalizeField("adjust-charge"));
  });
  it("a substring does not match (e.g. 'charge' vs 'adjust-charge')", () => {
    expect(normalizeField("charge")).not.toBe(normalizeField("adjust-charge"));
  });
  it("end to end: an appended-digit (stemmed-like) parameter value scores resolution-mismatch, never resolution-match", () => {
    const stemmed = labelledResponse(ticket.resolution.action, ticket.resolution.category, `${ticket.resolution.parameter}0`);
    expect(classifyCustomerSupportResponse(stemmed, ticket.resolution).category).not.toBe("resolution-match");
  });

  it("end to end: a STRICT SUBSTRING of the real action (dropping its leading character) scores resolution-mismatch, never resolution-match — this is the case a substring-relaxed equivalence rule would wrongly accept", () => {
    const substringAction = ticket.resolution.action.slice(1);
    expect(substringAction).not.toBe(ticket.resolution.action);
    const raw = labelledResponse(substringAction, ticket.resolution.category, ticket.resolution.parameter);
    expect(classifyCustomerSupportResponse(raw, ticket.resolution).category).not.toBe("resolution-match");
  });
});

describe("extractResolutionFields — no-artifact vs non-scoreable distinction", () => {
  it("zero recognizable labelled lines is no-artifact, not non-scoreable", () => {
    expect(extractResolutionFields("nothing recognizable here").outcome).toBe("no-artifact");
  });
  it("at least one recognized label but not all three is non-scoreable, not no-artifact", () => {
    expect(extractResolutionFields("action: adjust-charge").outcome).toBe("non-scoreable");
  });
});

// ── Independence guard (T-14-08) ────────────────────────────────────────────

const oracleSource = readFileSync(join(REPO_ROOT, "src/foundry/customer-support-oracle.ts"), "utf8");
const warehouseSource = readFileSync(join(REPO_ROOT, "src/foundry/customer-support-warehouse.ts"), "utf8");

/** Extracts the named import list from a `from "<specifier>"` clause,
 *  stripping `type ` markers on individual names (`import { type Foo, Bar }`
 *  and `import type { Foo, Bar }` both reduce to their bare names). */
function importedNamesFrom(source: string, specifierSuffix: string): string[] {
  const re = new RegExp(`import\\s+(type\\s+)?\\{([^}]*)\\}\\s+from\\s+["'][^"']*${specifierSuffix}[^"']*["']`);
  const m = re.exec(source);
  if (!m) throw new Error(`[independence guard] no import of "${specifierSuffix}" found`);
  return m[2]!
    .split(",")
    .map((s) => s.trim().replace(/^type\s+/, ""))
    .filter((s) => s.length > 0);
}

describe("F-08/T-14-08 mechanical independence — the oracle's import list from the generator module (design §4)", () => {
  it("the oracle imports ONLY field-name literals/types from customer-support-warehouse.ts — no function", () => {
    const names = importedNamesFrom(oracleSource, "customer-support-warehouse");
    expect(names.length).toBeGreaterThan(0);
    expect(names).not.toContain("generateCustomerSupportTicket");
    // Every imported name is one of the field-label/type exports — never a
    // callable renderer/derivation function.
    const permitted = new Set(["RESOLUTION_FIELD_LABELS", "CustomerSupportResolution", "ResolutionFieldLabel"]);
    for (const name of names) {
      expect(permitted.has(name)).toBe(true);
    }
  });

  it("DISCRIMINATION CONTROL: the same extractor, run against a deliberately-broken import line, DOES report the forbidden function name", () => {
    const violatingSource = `import { generateCustomerSupportTicket, RESOLUTION_FIELD_LABELS } from "./customer-support-warehouse.js";`;
    const names = importedNamesFrom(violatingSource, "customer-support-warehouse");
    expect(names).toContain("generateCustomerSupportTicket");
  });

  it("neither module's own normalization/extraction logic calls a helper from the other file (source-level: the oracle never imports the generator's ticket-rendering internals, and the generator never imports the oracle at all)", () => {
    expect(warehouseSource).not.toMatch(/from\s+["'][^"']*customer-support-oracle["']/);
  });

  it("neither module imports any receipt- or battery-construction helper (comment-stripped negative check)", () => {
    const strip = (src: string) =>
      src
        .split("\n")
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join("\n");
    const forbidden = /acceptedGeneratorReceipt|requireGeneratorRooted|makeBattery|makeSplitBattery|admitVerticalBattery/;
    expect(strip(oracleSource)).not.toMatch(forbidden);
    expect(strip(warehouseSource)).not.toMatch(forbidden);
  });
});

// ── Unaccepted-id assertion (T-14-03) ───────────────────────────────────────

describe(`${CUSTOMER_SUPPORT_GENERATOR_ID} — deliberately unaccepted (T-14-03)`, () => {
  it("is absent from ACCEPTED_GENERATORS (a test, not a grep)", () => {
    expect(ACCEPTED_GENERATORS.has(CUSTOMER_SUPPORT_GENERATOR_ID)).toBe(false);
  });
});
