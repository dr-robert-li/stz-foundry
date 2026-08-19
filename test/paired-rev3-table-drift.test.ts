import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  deriveRev3Table,
  REV3_BATTERY_SIZE,
} from "../experiments/paired-comparison-arm/_rev3-critical-values.js";
import { PAIRED_MIN_DISCORDANT_FLOOR } from "../experiments/paired-comparison-arm/_paired-constants.js";

// Plan 15-04, Task 3 (REQ-71, adjudication GF-11). test/paired-rev3-derivation.test.ts
// already proves the DERIVATION function `deriveRev3Table()` is internally
// correct and matches the frozen rev-2 table on the shared 20-60 range. That
// leaves a gap this test closes: nothing previously read §12's own
// hand-transcribed 71-row markdown table off disk and checked it, row by
// row, against that derivation for the widened range (61-90) — the exact
// hand-transcription-error risk §9's own drift-guard provenance row names
// for the rev-2 table, now applied to the rev-3 table this amendment adds.
// Mirrors test/paired-critical-value-drift.test.ts's own
// read-the-frozen-document-off-disk pattern, scoped to §12's own table.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const PREREG_REL_PATH = "experiments/paired-comparison-arm/PAIRED-DESIGN-PREREG.md";
const preregText = readFileSync(join(repoRoot, PREREG_REL_PATH), "utf8");

function extractSection(text: string, heading: string, nextHeading: string | null): string {
  const start = text.indexOf(heading);
  if (start === -1) throw new Error(`[paired-rev3-table-drift] heading not found: ${heading}`);
  if (nextHeading === null) return text.slice(start);
  const end = text.indexOf(nextHeading, start);
  return end === -1 ? text.slice(start) : text.slice(start, end);
}

const FLOOR = PAIRED_MIN_DISCORDANT_FLOOR; // 20, unchanged rev-2 pin
const SIZE = REV3_BATTERY_SIZE; // 90, the frozen rev-3 battery size

// §12 is the last section in the document, so there is no "next heading" to
// stop at — scope the scan to everything from the §12 heading to EOF, which
// also excludes §9's own 41-row table entirely (a separate, already-guarded
// table `test/paired-critical-value-drift.test.ts` owns).
const section12 = extractSection(preregText, "## §12 Amendment (rev 3)", null);

describe("rev-3 §12 critical-value table drift guard (adjudication GF-11)", () => {
  const rowPattern = /^\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*$/gm;
  const docRows: Array<{ nd: number; c: number; ndMinusC: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(section12)) !== null) {
    docRows.push({ nd: Number(match[1]), c: Number(match[2]), ndMinusC: Number(match[3]) });
  }

  it(`parses exactly ${SIZE - FLOOR + 1} rows off disk (catches a dropped or duplicated row)`, () => {
    expect(docRows).toHaveLength(SIZE - FLOOR + 1);
    expect(docRows.map((r) => r.nd)).toEqual(Array.from({ length: SIZE - FLOOR + 1 }, (_, i) => FLOOR + i));
  });

  it("every one of the 71 transcribed §12 rows matches deriveRev3Table() on all three columns", () => {
    const derived = deriveRev3Table();
    const derivedByNd = new Map(derived.map((row) => [row.nd, row]));
    for (const row of docRows) {
      const expected = derivedByNd.get(row.nd);
      expect(expected, `no derived row for n_d=${row.nd}`).toBeDefined();
      expect(row.c, `n_d=${row.nd} c(n_d) column`).toBe(expected!.c);
      expect(row.ndMinusC, `n_d=${row.nd} n_d-c(n_d) column`).toBe(row.nd - expected!.c);
    }
  });

  it("the derivation itself is exactly as long as the transcribed table (no size mismatch masking a row-level match)", () => {
    expect(deriveRev3Table()).toHaveLength(docRows.length);
  });
});
