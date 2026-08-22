/**
 * The collaborative-mode battery loader (Phase 20 — Collaborative admission
 * axis battery, Plan 20-01, REQ-79). Seeded here as the end-to-end happy-path
 * proof of the tracer slice: sealed table → require gate → 75 gold-free tasks
 * keyed by their own `query_id`. Expanded into the full D-13 contract suite by
 * Plan 20-02.
 *
 * House rule (mirrors `test/foundry-vertical-admission.test.ts`): every
 * throwing assertion inspects the thrown message's content, never a bare
 * `.toThrow()`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCollaborativeBattery,
  tasksFromFixture,
  taskForQueryId,
  CollaborativeBatteryRefusedError,
} from "../src/foundry/collaborative-battery.js";
import { requireCollaborativeAdmitted } from "../src/foundry/collaborative-admission.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = join(repoRoot, "test", "fixtures", "stark");

function loadFixture(name: string): { meta: Record<string, unknown>; pairs: unknown[] } {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8"));
}

function thrown(fn: () => unknown): Error {
  try {
    fn();
  } catch (e) {
    return e as Error;
  }
  throw new Error("expected fn to throw, it did not");
}

describe("requireCollaborativeAdmitted — the pin and lineage the loader reads (D-04)", () => {
  it("returns the stark-prime record with the pinned revisionSha, lineage, and acceptedBy", () => {
    const record = requireCollaborativeAdmitted("stark-prime");
    expect(record.revisionSha).toBe("88269e23e90587f99476c5dd74e235a0877e69be");
    expect(record.lineage).toBe("constructed:stark-prime");
    expect(record.acceptedBy).toBe("dr-robert-li");
  });
});

describe("buildCollaborativeBattery — the end-to-end tracer slice", () => {
  it("returns 75 tasks, each queryId matching its fixture pair, no duplicate ids", () => {
    const tasks = buildCollaborativeBattery();
    const fixture = loadFixture("prime-selection.json");
    expect(tasks.length).toBe(75);
    tasks.forEach((task, i) => {
      expect(task.queryId).toBe((fixture.pairs[i] as { query_id: number }).query_id);
    });
    expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length);
  });

  it("the first task's queryId is 97 and its id is the stark-prime:97 form — a fixed, externally-checkable value", () => {
    const tasks = buildCollaborativeBattery();
    expect(tasks[0]!.queryId).toBe(97);
    expect(tasks[0]!.id).toBe("stark-prime:97");
  });

  it("no task carries an answer_ids field, anywhere in the serialised list (D-08)", () => {
    const tasks = buildCollaborativeBattery();
    expect(JSON.stringify(tasks)).not.toContain("answer_ids");
    for (const task of tasks) {
      expect(Object.keys(task)).not.toContain("answer_ids");
    }
  });
});

describe("tasksFromFixture — the heldout pool is refused, never loaded (D-05, D-06)", () => {
  it("throws CollaborativeBatteryRefusedError naming the offending pool value", () => {
    const heldout = loadFixture("prime-heldout.json");
    const err = thrown(() => tasksFromFixture(heldout as never));
    expect(err).toBeInstanceOf(CollaborativeBatteryRefusedError);
    expect(err.message).toContain("heldout");
  });

  it("a two-pair fixture with pool \"selection\" returns two tasks keyed by their own query_ids", () => {
    const fixture = {
      meta: { pool: "selection" },
      pairs: [
        { query_id: 1, query: "first", answer_ids: [1] },
        { query_id: 2, query: "second", answer_ids: [2] },
      ],
    };
    const tasks = tasksFromFixture(fixture as never);
    expect(tasks.length).toBe(2);
    expect(tasks[0]!.queryId).toBe(1);
    expect(tasks[1]!.queryId).toBe(2);
    expect(tasks[0]!.id).toBe("stark-prime:1");
  });

  it("a pair with a non-numeric query_id is refused, naming the pair position", () => {
    const fixture = {
      meta: { pool: "selection" },
      pairs: [
        { query_id: 1, query: "first", answer_ids: [1] },
        { query_id: "not-a-number", query: "second", answer_ids: [2] },
      ],
    };
    const err = thrown(() => tasksFromFixture(fixture as never));
    expect(err).toBeInstanceOf(CollaborativeBatteryRefusedError);
    expect(err.message).toContain("1");
  });

  it("a pair with empty query text is refused", () => {
    const fixture = {
      meta: { pool: "selection" },
      pairs: [{ query_id: 1, query: "", answer_ids: [1] }],
    };
    const err = thrown(() => tasksFromFixture(fixture as never));
    expect(err).toBeInstanceOf(CollaborativeBatteryRefusedError);
    expect(err.message).toContain("0");
  });
});

describe("buildCollaborativeBattery — byte-stable across loads (D-07)", () => {
  it("two consecutive calls serialise to byte-identical JSON, not merely deep-equal objects", () => {
    const first = JSON.stringify(buildCollaborativeBattery());
    const second = JSON.stringify(buildCollaborativeBattery());
    expect(first).toBe(second);
  });
});

describe("buildCollaborativeBattery — the 75-task census against the fixture's own query_id set", () => {
  it("the constructed queryId set equals the fixture's query_id set, both size 75, and meta.sample_size agrees", () => {
    const fixture = loadFixture("prime-selection.json") as {
      meta: { sample_size: number };
      pairs: { query_id: number }[];
    };
    const tasks = buildCollaborativeBattery();
    const taskIds = new Set(tasks.map((t) => t.queryId));
    const fixtureIds = new Set(fixture.pairs.map((p) => p.query_id));
    expect(taskIds.size).toBe(75);
    expect(fixtureIds.size).toBe(75);
    expect(taskIds).toStrictEqual(fixtureIds);
    expect(fixture.meta.sample_size).toBe(75);
  });
});

describe("tasksFromFixture — fails closed on a malformed fixture shape, never a raw TypeError (WR-01)", () => {
  it("a fixture with pairs but no meta object is refused, naming the missing meta", () => {
    const err = thrown(() => tasksFromFixture({ pairs: [] } as never));
    expect(err).toBeInstanceOf(CollaborativeBatteryRefusedError);
    expect(err.message).toContain("meta");
  });

  it("a fixture with meta but no pairs array is refused, naming the missing pairs", () => {
    const err = thrown(() => tasksFromFixture({ meta: { pool: "selection" } } as never));
    expect(err).toBeInstanceOf(CollaborativeBatteryRefusedError);
    expect(err.message).toContain("pairs");
  });
});

describe("tasksFromFixture — the pool guard is an allowlist, not a denylist of one value (D-06)", () => {
  it("refuses a pool value that is neither \"selection\" nor \"heldout\"", () => {
    const fixture = {
      meta: { pool: "unanticipated-third-value" },
      pairs: [],
    };
    const err = thrown(() => tasksFromFixture(fixture as never));
    expect(err).toBeInstanceOf(CollaborativeBatteryRefusedError);
    expect(err.message).toContain("unanticipated-third-value");
  });
});

describe("buildCollaborativeBattery — routed through the admission record's own selectionFixturePath, not a path of its own (D-04)", () => {
  it("equals tasksFromFixture applied to the fixture parsed from requireCollaborativeAdmitted(\"stark-prime\").selectionFixturePath — an entry point that stopped consulting the record fails here", () => {
    const record = requireCollaborativeAdmitted("stark-prime");
    const fixture = JSON.parse(readFileSync(join(repoRoot, record.selectionFixturePath), "utf8"));
    const expected = tasksFromFixture(fixture);
    const actual = buildCollaborativeBattery();
    expect(actual).toStrictEqual(expected);
  });
});

describe("taskForQueryId — defined failures on both ends of the query_id lookup (D-13)", () => {
  it("returns the task whose queryId matches the requested id", () => {
    const tasks = buildCollaborativeBattery();
    const task = taskForQueryId(tasks, 97);
    expect(task.queryId).toBe(97);
    expect(task.id).toBe("stark-prime:97");
  });

  it("throws naming the id when no task carries it — never resolved to undefined", () => {
    const tasks = buildCollaborativeBattery();
    const err = thrown(() => taskForQueryId(tasks, -1));
    expect(err).toBeInstanceOf(CollaborativeBatteryRefusedError);
    expect(err.message).toContain("-1");
  });

  it("throws naming the match count when more than one task carries the requested id — never the first match", () => {
    const tasks = [
      { id: "a", queryId: 5, prompt: "x" },
      { id: "b", queryId: 5, prompt: "y" },
    ];
    const err = thrown(() => taskForQueryId(tasks, 5));
    expect(err).toBeInstanceOf(CollaborativeBatteryRefusedError);
    expect(err.message).toContain("5");
    expect(err.message).toContain("2");
  });
});
