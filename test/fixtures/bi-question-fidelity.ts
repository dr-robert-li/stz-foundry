/**
 * THE QUESTION-FIDELITY CHECK for the BI-analytics battery (Phase 8 —
 * Admission + build, Plan 08-01, REQ-53; `experiments/bi-analytics-pilot/BI-BATTERY-DESIGN.md`
 * rev 2 §3 F-20 — "the strongest [finding] the panel raised").
 *
 * WHAT THIS CLOSES. The equality obligation (`bi-reference-interpreter.ts`)
 * validates that the reference SQL's OWN computation is correct
 * (`precomputed === recomputed`), but nothing in the oracle validates that
 * the NATURAL-LANGUAGE QUESTION shown to the candidate (`renderQuestion`)
 * actually denotes that reference SQL. A misrendered question — the wrong
 * filter column named, the wrong grouping described — would leave the
 * equality obligation intact while the candidate is scored against a
 * question that does not match the query defining "correct." F-20 names
 * this gap as NOT closed by the design and requires Phase 8 to add its own
 * fidelity check: "an independent second question-rendering pass compared
 * against the first, or a human spot-audit sample." The standing autonomy
 * directive rules out mid-run human stops, so this file builds the first
 * form.
 *
 * IMPORT-CLEAN, exactly as `bi-reference-interpreter.ts` is: this file
 * imports NOTHING from `src/foundry/bi-warehouse.ts` or
 * `src/foundry/bi-oracle.ts` — not a helper, not a constant, not a type. It
 * declares its own duck type for the spec and never touches the SQL engine.
 *
 * `renderQuestionIndependent` is a SEPARATE, independently-written
 * rendering of the same spec — different prose, different sentence
 * ordering — but it emits the SAME labeled-footer convention
 * `bi-warehouse.ts`'s `renderQuestion` also emits (`Tables:`/`Filter:`/
 * `Grouped by:`/`Aggregate:`/`Return columns:`), so the ONE strict
 * `extractQuestionFields` below can parse EITHER rendering. The shared
 * FOOTER CONVENTION is the disclosed, spec-driven template exposure design
 * §3 F-21 already names (both implementations read the same grid-point
 * definition) — it is not a shared helper FUNCTION, and it is not what
 * this check's independence claim is scoped to close.
 */

interface DuckFilter {
  column: string;
  value: string;
}

interface DuckAggregate {
  fn: string;
  column: string;
  alias: string;
}

/** Duck-typed spec — structurally compatible with `BiQuerySpec`, never
 *  imported from it. */
export interface DuckQuerySpecLike {
  tables: string[];
  filter: DuckFilter;
  groupBy: string[] | null;
  aggregate: DuckAggregate | null;
  projection: string[];
}

/**
 * A second, independently-written rendering of `spec` — leads with a
 * different sentence shape from `bi-warehouse.ts`'s `renderQuestion`
 * ("A business user wants to know ..." rather than "For orders placed in
 * ... list/what is the total ...") but reports the same underlying fields
 * in the same labeled footer.
 */
export function renderQuestionIndependent(spec: DuckQuerySpecLike): string {
  const askedFor = spec.aggregate
    ? `the ${spec.aggregate.fn.toLowerCase()} of ${spec.aggregate.column}` +
      (spec.groupBy ? `, broken out by ${spec.groupBy.join(" then ")}` : "")
    : `these fields per order: ${spec.projection.join(", ")}`;
  const lede = `A business user wants to know, for the ${spec.filter.value} order window, ${askedFor}.`;

  const footer = [
    `Tables: ${spec.tables.join(", ")}.`,
    `Filter: ${spec.filter.column} = ${spec.filter.value}.`,
    `Grouped by: ${spec.groupBy ? spec.groupBy.join(", ") : "none"}.`,
    `Aggregate: ${spec.aggregate ? `${spec.aggregate.fn}(${spec.aggregate.column}) as ${spec.aggregate.alias}` : "none"}.`,
    `Return columns: ${spec.projection.join(", ")}.`,
  ].join(" ");

  return `${lede} ${footer}`;
}

export interface ExtractedQuestionFields {
  tables: string[];
  filterColumn: string;
  filterValue: string;
  groupBy: string[] | null;
  aggregateFn: string | null;
  aggregateColumn: string | null;
  aggregateAlias: string | null;
  projection: string[];
}

function parseListLine(question: string, label: string): string[] {
  const re = new RegExp(`${label}:\\s*(.+?)\\.`, "i");
  const m = re.exec(question);
  if (!m) throw new Error(`[bi-question-fidelity] missing ${JSON.stringify(`${label}:`)} line in ${JSON.stringify(question)}`);
  return m[1]!
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * A STRICT extractor — throws (never guesses) if a required labeled line
 * is missing or malformed, so a misrendered question fails LOUD rather
 * than silently comparing as "equal" via a lenient parse.
 */
export function extractQuestionFields(question: string): ExtractedQuestionFields {
  const tables = parseListLine(question, "Tables");

  const filterMatch = /Filter:\s*(\S+)\s*=\s*(.+?)\./i.exec(question);
  if (!filterMatch) {
    throw new Error(`[bi-question-fidelity] missing "Filter:" line in ${JSON.stringify(question)}`);
  }
  const filterColumn = filterMatch[1]!;
  const filterValue = filterMatch[2]!.trim();

  const groupedMatch = /Grouped by:\s*(.+?)\./i.exec(question);
  if (!groupedMatch) {
    throw new Error(`[bi-question-fidelity] missing "Grouped by:" line in ${JSON.stringify(question)}`);
  }
  const groupedRaw = groupedMatch[1]!.trim();
  const groupBy = groupedRaw.toLowerCase() === "none" ? null : groupedRaw.split(",").map((s) => s.trim());

  const aggMatch = /Aggregate:\s*(.+?)\./i.exec(question);
  if (!aggMatch) {
    throw new Error(`[bi-question-fidelity] missing "Aggregate:" line in ${JSON.stringify(question)}`);
  }
  const aggRaw = aggMatch[1]!.trim();
  let aggregateFn: string | null = null;
  let aggregateColumn: string | null = null;
  let aggregateAlias: string | null = null;
  if (aggRaw.toLowerCase() !== "none") {
    const m = /^([A-Za-z]+)\(([^)]+)\)\s+as\s+(\S+)$/i.exec(aggRaw);
    if (!m) {
      throw new Error(`[bi-question-fidelity] unparseable Aggregate clause ${JSON.stringify(aggRaw)}`);
    }
    aggregateFn = m[1]!.toUpperCase();
    aggregateColumn = m[2]!.trim();
    aggregateAlias = m[3]!.trim();
  }

  const projection = parseListLine(question, "Return columns");

  return { tables, filterColumn, filterValue, groupBy, aggregateFn, aggregateColumn, aggregateAlias, projection };
}
