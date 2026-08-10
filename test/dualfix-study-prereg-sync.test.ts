import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  DUALFIX_STUDY_SEEDS,
  DUALFIX_LEVEL_ID,
  DUALFIX_CORPUS_TARGET_N,
  DUALFIX_CORPUS_MIN_N,
  DUALFIX_STAGE_B_MARGIN_NUM,
  DUALFIX_STAGE_B_MARGIN_DEN,
  DUALFIX_ERROR_BUDGET_NUM,
  DUALFIX_ERROR_BUDGET_DEN,
} from "../experiments/dualfix-study/_dualfix-arms.js";
import { MAX_DUALFIX_PROMPT_CHARS } from "../src/foundry/dualfix.js";

// Plan 11-05 (REQ-61/REQ-62, T-11-09). This test reads the FROZEN prereg's §9
// pinned-constants table off disk — never a duplicated copy of the numbers —
// and compares every row against the exported symbol it names. Per D-18, a
// mismatch is resolved by correcting the CODE constant; this document is
// never edited to match the code after its freeze commit (plan 11-04).

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const PREREG_REL_PATH = "experiments/dualfix-study/DUALFIX-STUDY-PREREG.md";
const preregText = readFileSync(join(repoRoot, PREREG_REL_PATH), "utf8");

// The nine pinned constants §9 mirrors, keyed by their exported symbol name —
// eight from `_dualfix-arms.ts`, one (the prompt-character bound) from
// `src/foundry/dualfix.ts`.
const PINNED_SYMBOLS: Record<string, unknown> = {
  DUALFIX_STUDY_SEEDS: [...DUALFIX_STUDY_SEEDS],
  DUALFIX_LEVEL_ID,
  DUALFIX_CORPUS_TARGET_N,
  DUALFIX_CORPUS_MIN_N,
  DUALFIX_STAGE_B_MARGIN_NUM,
  DUALFIX_STAGE_B_MARGIN_DEN,
  DUALFIX_ERROR_BUDGET_NUM,
  DUALFIX_ERROR_BUDGET_DEN,
  MAX_DUALFIX_PROMPT_CHARS,
};

function extractSection(text: string, heading: string, nextHeading: string): string {
  const start = text.indexOf(heading);
  if (start === -1) {
    throw new Error(`[prereg-sync] heading not found in ${PREREG_REL_PATH}: ${heading}`);
  }
  const end = text.indexOf(nextHeading, start);
  return end === -1 ? text.slice(start) : text.slice(start, end);
}

interface PinnedRow {
  value: unknown;
  symbol: string;
  file: string;
}

/**
 * Parses `| <value cell> | `SYMBOL` | `file` |` rows out of §9's markdown
 * table. The value cell's own backtick-quoted literal (a JSON-shaped array,
 * string, or number — never the trailing parenthetical annotation) is
 * `JSON.parse`d into the value this test compares against the runtime
 * export. The header/separator rows never match (neither has a
 * backtick-quoted symbol), so they are skipped without special-casing.
 */
function parsePinnedConstantsTable(section: string): PinnedRow[] {
  const rows: PinnedRow[] = [];
  const rowPattern = /^\|(.+?)\|\s*`([A-Za-z_][A-Za-z0-9_]*)`\s*\|\s*`([^`]+)`\s*\|\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(section)) !== null) {
    const valueCell = match[1] ?? "";
    const symbol = match[2] ?? "";
    const file = match[3] ?? "";
    const literalMatch = valueCell.match(/`([^`]+)`/);
    if (!literalMatch || !literalMatch[1]) {
      throw new Error(`[prereg-sync] §9 row for ${symbol} has no backtick-quoted literal value: "${valueCell}"`);
    }
    rows.push({ value: JSON.parse(literalMatch[1]), symbol, file });
  }
  return rows;
}

describe("DUALFIX prereg <-> code constant drift guard (T-11-09, D-18)", () => {
  const section = extractSection(preregText, "## §9 Pinned constants", "## §10");
  const rows = parsePinnedConstantsTable(section);
  const expectedSymbolNames = Object.keys(PINNED_SYMBOLS);

  it("parses exactly one §9 row per checked exported symbol (catches an added or dropped row)", () => {
    expect(rows.length).toBe(expectedSymbolNames.length);
  });

  for (const symbol of expectedSymbolNames) {
    it(`§9's pinned value for ${symbol} equals its exported runtime value`, () => {
      const row = rows.find((r) => r.symbol === symbol);
      expect(row, `§9 has no row naming exported symbol ${symbol}`).toBeDefined();
      expect(row!.value).toEqual(PINNED_SYMBOLS[symbol]);
    });
  }

  it("declares itself rev 2 and FROZEN (guards against a post-freeze revert of the status line)", () => {
    expect(preregText).toMatch(/\*\*Revision:\*\*\s*2\s*—\s*\*\*FROZEN/);
  });
});
