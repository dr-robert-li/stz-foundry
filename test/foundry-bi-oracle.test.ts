/**
 * The BI-analytics scoring contract (Phase 8 — Admission + build, Plan
 * 08-01, Task 2): §2 extraction, §3 graded score, §4 zero-decomposition.
 *
 * House rule (`test/foundry-battery-types.test.ts:44-51`): assert the
 * thrown message's CONTENT, never bare `.toThrow()`.
 */
import { describe, it, expect } from "vitest";
import { buildBiQuerySpecs, generateBiWarehouse, composeReferenceSql } from "../src/foundry/bi-warehouse.js";
import {
  materializeWarehouse,
  executeSelect,
  extractSqlArtifact,
  isSingleReadOnlySelect,
  gradedScore,
  categorize,
  BI_ACCEPTED_DIALECTS,
  BI_ZERO_DECOMPOSITION_CATEGORIES,
  type BiResultSet,
} from "../src/foundry/bi-oracle.js";

function fence(info: string, body: string): string {
  return "```" + info + "\n" + body + "\n```";
}

describe("extractSqlArtifact — §2 rules 1-2, in order, fail-closed", () => {
  it("rule 1: two ```sql blocks — the FIRST is the artifact", () => {
    const text = `${fence("sql", "SELECT 1")}\n\n${fence("sql", "SELECT 2")}`;
    expect(extractSqlArtifact(text)).toBe("SELECT 1");
  });

  it("rule 2: exactly one bare fence yields it", () => {
    const text = fence("", "SELECT 1");
    expect(extractSqlArtifact(text)).toBe("SELECT 1");
  });

  it("rule 2 ambiguity: zero fences yields no artifact", () => {
    expect(extractSqlArtifact("no fences here at all")).toBeNull();
  });

  it("rule 2 ambiguity: two bare fences yields no artifact", () => {
    const text = `${fence("", "SELECT 1")}\n\n${fence("", "SELECT 2")}`;
    expect(extractSqlArtifact(text)).toBeNull();
  });

  it("precedence: one ```sql block and one bare fence — the sql block wins", () => {
    const text = `${fence("", "SELECT 1")}\n\n${fence("sql", "SELECT 2")}`;
    expect(extractSqlArtifact(text)).toBe("SELECT 2");
  });
});

describe("isSingleReadOnlySelect — §2 rule 4's fail-closed pre-check", () => {
  it("a plain SELECT passes", () => {
    expect(isSingleReadOnlySelect("SELECT order_id FROM fact_orders")).toBe(true);
  });

  it("a leading WITH CTE resolving to one SELECT passes (the Phase-8-pinned boundary reading)", () => {
    expect(
      isSingleReadOnlySelect(
        "WITH totals AS (SELECT customer_id, SUM(quantity) AS q FROM fact_orders GROUP BY customer_id) " +
          "SELECT customer_id, q FROM totals",
      ),
    ).toBe(true);
  });

  it("INSERT is rejected", () => {
    expect(isSingleReadOnlySelect("INSERT INTO fact_orders (order_id) VALUES ('x')")).toBe(false);
  });

  it("UPDATE is rejected", () => {
    expect(isSingleReadOnlySelect("UPDATE fact_orders SET quantity = 0")).toBe(false);
  });

  it("DROP is rejected", () => {
    expect(isSingleReadOnlySelect("DROP TABLE fact_orders")).toBe(false);
  });

  it("a multi-statement artifact (SELECT ; DROP) is rejected", () => {
    expect(isSingleReadOnlySelect("SELECT 1; DROP TABLE fact_orders")).toBe(false);
  });

  it("a WITH clause whose CTE resolves to an INSERT is rejected (a leading WITH does not blanket-permit anything after it)", () => {
    expect(
      isSingleReadOnlySelect("WITH x AS (SELECT 1) INSERT INTO fact_orders (order_id) VALUES ('x')"),
    ).toBe(false);
  });

  it("a single trailing semicolon is tolerated", () => {
    expect(isSingleReadOnlySelect("SELECT 1;")).toBe(true);
  });
});

describe("categorize — rules 3/4 plus §3/§4, tied together", () => {
  const warehouse = generateBiWarehouse(101);
  const spec = buildBiQuerySpecs(warehouse, "L1")[0]!;
  const sql = composeReferenceSql(spec);

  function freshDb() {
    return materializeWarehouse(warehouse);
  }

  it("rule 3: a syntactically invalid (but rule-4-shaped) artifact is non-executable-artifact, never executes-but-wrong", () => {
    const db = freshDb();
    const expected = executeSelect(db, sql);
    const badSql = "SELECT order_id FROM fact_orders WHERE (";
    const result = categorize(fence("sql", badSql), db, expected);
    expect(result.category).toBe("non-executable-artifact");
  });

  it("rule 4: a DML artifact is non-executable-artifact AND leaves the warehouse row counts unchanged", () => {
    const db = freshDb();
    const expected = executeSelect(db, sql);
    const before = executeSelect(db, "SELECT COUNT(*) AS n FROM fact_orders").rows;
    const result = categorize(fence("sql", "INSERT INTO fact_orders (order_id) VALUES ('injected')"), db, expected);
    expect(result.category).toBe("non-executable-artifact");
    const after = executeSelect(db, "SELECT COUNT(*) AS n FROM fact_orders").rows;
    expect(after).toEqual(before);
  });

  it("no fenced block at all -> no-artifact", () => {
    const db = freshDb();
    const expected = executeSelect(db, sql);
    const result = categorize("I don't know the answer.", db, expected);
    expect(result.category).toBe("no-artifact");
  });

  it("the exact reference query -> correct, exact", () => {
    const db = freshDb();
    const expected = executeSelect(db, sql);
    const result = categorize(fence("sql", sql), db, expected);
    expect(result.category).toBe("correct");
    expect(result.exact).toBe(true);
    expect(result.gradedScore).toBe(1);
  });

  it("categorize(...) returns exactly one of the four named categories", () => {
    const db = freshDb();
    const expected = executeSelect(db, sql);
    const outcomes = [
      categorize("no fence", db, expected).category,
      categorize(fence("sql", "SELECT order_id FROM fact_orders WHERE ("), db, expected).category,
      categorize(fence("sql", "DROP TABLE fact_orders"), db, expected).category,
      categorize(fence("sql", sql), db, expected).category,
      categorize(fence("sql", "SELECT order_id FROM fact_orders"), db, expected).category,
    ];
    for (const outcome of outcomes) expect(BI_ZERO_DECOMPOSITION_CATEGORIES).toContain(outcome);
  });
});

describe("gradedScore — design §3", () => {
  it("identical multiset scores 1.0", () => {
    const rs: BiResultSet = { columns: ["a", "b"], rows: [[1, "x"], [2, "y"]] };
    expect(gradedScore(rs, rs)).toBe(1);
  });

  it("a wrong column projection scores exactly 0", () => {
    const expected: BiResultSet = { columns: ["a", "b"], rows: [[1, "x"]] };
    const actual: BiResultSet = { columns: ["a", "c"], rows: [[1, "x"]] };
    expect(gradedScore(expected, actual)).toBe(0);
  });

  it("an over-broad query (same columns, extra rows) drives the score toward 0 via the inflated denominator", () => {
    const expected: BiResultSet = { columns: ["a"], rows: [[1], [2]] };
    // "SELECT *" over an already-correctly-projected subset, but with the
    // filter dropped: same column set, ten times the rows.
    const actual: BiResultSet = { columns: ["a"], rows: [[1], [2], [3], [4], [5], [6], [7], [8], [9], [10]] };
    const score = gradedScore(expected, actual);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(0.5);
  });

  it("empty-expected + empty-actual scores 1.0", () => {
    const rs: BiResultSet = { columns: ["a"], rows: [] };
    expect(gradedScore(rs, rs)).toBe(1);
  });
});

describe("BI_ACCEPTED_DIALECTS / BI_ZERO_DECOMPOSITION_CATEGORIES — frozen literals", () => {
  it("the accepted-dialect literal has exactly two members", () => {
    expect(BI_ACCEPTED_DIALECTS.length).toBe(2);
  });

  it("the §4 category union has exactly four members", () => {
    expect(BI_ZERO_DECOMPOSITION_CATEGORIES.length).toBe(4);
    expect(new Set(BI_ZERO_DECOMPOSITION_CATEGORIES)).toEqual(
      new Set(["no-artifact", "non-executable-artifact", "executes-but-wrong", "correct"]),
    );
  });
});
