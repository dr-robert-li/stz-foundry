/**
 * v3.1 tests — the ONE pre-registered mitigation (`V3.1-BATTERY-DESIGN.md`
 * §1) and nothing else. The alias semantics here are the semantics the prereg
 * commits to; a divergence between this file and that document is a bug in
 * THIS file.
 */
import { describe, expect, it } from "vitest";
import { parseArtifacts, parseArtifactsForTask } from "../src/foundry/agent-runner.js";
import {
  buildTasksV3,
  buildTasksV3_1,
  generateFixtureBatteryV3_1,
  generateFixtureSplitBatteryV3_1,
  generateWarehouseV3,
  v3Knobs,
} from "../src/foundry/fixture-warehouse-v3.js";
import { ACCEPTED_GENERATORS, DATA_OPS_GENERATOR_V31_ID } from "../src/foundry/fixture-warehouse.js";

const ALIAS_TASK = { fenceAlias: { info: "json", path: "answer.json" } };
const NO_ALIAS_TASK = {};

const fence = (info: string, body: string) => `\`\`\`${info}\n${body}\n\`\`\``;
const ANSWER = `{"totals": {"c__m": {"orderCount": 3, "revenueCents": 127500}}}`;

describe("parseArtifactsForTask — the v3.1 alias semantics, fail-closed", () => {
  it("rule 1: an explicit path= block wins and the alias is never consulted", () => {
    const text = fence("path=answer.json", ANSWER) + "\n" + fence("json", `{"decoy": true}`);
    const files = parseArtifactsForTask(text, ALIAS_TASK);
    expect(files["answer.json"]).toBe(ANSWER);
  });

  it("rule 2: exactly one bare json fence maps to the alias path", () => {
    const files = parseArtifactsForTask(fence("json", ANSWER), ALIAS_TASK);
    expect(files["answer.json"]).toBe(ANSWER);
  });

  it("info string matching is lowercased and trimmed — JSON and ' json ' match", () => {
    expect(parseArtifactsForTask(fence("JSON", ANSWER), ALIAS_TASK)["answer.json"]).toBe(ANSWER);
    expect(parseArtifactsForTask(fence("  json  ", ANSWER), ALIAS_TASK)["answer.json"]).toBe(ANSWER);
  });

  it("an info string that merely CONTAINS json does not match", () => {
    expect(parseArtifactsForTask(fence("jsonc", ANSWER), ALIAS_TASK)["answer.json"]).toBeUndefined();
    expect(parseArtifactsForTask(fence("json path=other.json", ANSWER), ALIAS_TASK)["answer.json"]).toBeUndefined();
  });

  it("several bare json fences are ambiguous and fail closed to no artifact", () => {
    const text = fence("json", ANSWER) + "\n" + fence("json", `{"other": 1}`);
    expect(parseArtifactsForTask(text, ALIAS_TASK)["answer.json"]).toBeUndefined();
  });

  it("zero matching fences yield no artifact", () => {
    expect(parseArtifactsForTask("no fences at all", ALIAS_TASK)).toEqual({});
    expect(parseArtifactsForTask(fence("python", ANSWER), ALIAS_TASK)).toEqual({});
  });

  it("a task WITHOUT an alias parses byte-identically to parseArtifacts", () => {
    // The v1/v2/v3 guarantee: this field's absence means the seam IS the old
    // parser. Checked over every shape this suite exercises.
    for (const text of [
      fence("json", ANSWER),
      fence("path=answer.json", ANSWER),
      fence("json", ANSWER) + "\n" + fence("json", ANSWER),
      "prose only",
      fence("path=a.json", "{}") + fence("json", "{}"),
    ]) {
      expect(parseArtifactsForTask(text, NO_ALIAS_TASK)).toEqual(parseArtifacts(text));
    }
  });

  it("an aliased artifact with an unparseable body still observes to nothing", () => {
    // Rule 3: invalid JSON counts as no usable artifact downstream —
    // observeCheck's json-invariant returns undefined for it, so every check
    // fails. Verified at the parse layer here: the body maps, and the
    // decision that it is unusable belongs to observeCheck, unchanged.
    const files = parseArtifactsForTask(fence("json", "not json at all"), ALIAS_TASK);
    expect(files["answer.json"]).toBe("not json at all");
  });
});

describe("buildTasksV3_1 — the v3.1 battery is v3 plus the alias, nothing else", () => {
  it("every task declares exactly the pre-registered alias", () => {
    const w = generateWarehouseV3(7, v3Knobs("G2"));
    for (const task of buildTasksV3_1(w)) {
      expect(task.fenceAlias).toEqual({ info: "json", path: "answer.json" });
    }
  });

  it("prompts, checks and grading are byte-identical to v3's", () => {
    const w = generateWarehouseV3(7, v3Knobs("G2"));
    const v3 = buildTasksV3(w);
    const v31 = buildTasksV3_1(w);
    expect(v31.length).toBe(v3.length);
    v31.forEach((task, i) => {
      const { fenceAlias, ...rest } = task;
      expect(rest).toEqual(v3[i]);
    });
  });

  it("construction is blocked until the human acceptance exists", () => {
    expect(ACCEPTED_GENERATORS.has(DATA_OPS_GENERATOR_V31_ID)).toBe(false);
    expect(() => generateFixtureBatteryV3_1(7, "b", v3Knobs("G2"))).toThrow(/not in ACCEPTED_GENERATORS/);
    expect(() => generateFixtureSplitBatteryV3_1(7, v3Knobs("G2"))).toThrow(/not in ACCEPTED_GENERATORS/);
  });
});
