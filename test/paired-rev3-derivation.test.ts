import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  deriveCriticalValue,
  deriveRev3Table,
  renderRev3TableMarkdown,
  REV3_BATTERY_SIZE,
} from "../experiments/paired-comparison-arm/_rev3-critical-values.js";
import { PAIRED_MIN_DISCORDANT_FLOOR } from "../experiments/paired-comparison-arm/_paired-constants.js";

// Plan 15-02, Task 1 (REQ-71). Proves the rev-3 critical-value derivation
// (a) is the exact combinatorial condition §5 states, in arbitrary-precision
// integer arithmetic, (b) reproduces the frozen rev-2 table exactly on the
// range the two tables share — a table nobody may edit used as a
// correctness oracle for the widened derivation before it is trusted
// anywhere new, and (c) emits exactly the row shape the amendment's §12
// table needs. Mirrors test/paired-critical-value-drift.test.ts's own
// read-the-frozen-document-off-disk pattern.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const PREREG_REL_PATH = "experiments/paired-comparison-arm/PAIRED-DESIGN-PREREG.md";
const preregText = readFileSync(join(repoRoot, PREREG_REL_PATH), "utf8");
const scriptSourcePath = join(repoRoot, "experiments/paired-comparison-arm/_rev3-critical-values.ts");
const scriptSource = readFileSync(scriptSourcePath, "utf8");

function extractSection(text: string, heading: string, nextHeading: string): string {
  const start = text.indexOf(heading);
  if (start === -1) throw new Error(`[paired-rev3-derivation] heading not found: ${heading}`);
  const end = text.indexOf(nextHeading, start);
  return end === -1 ? text.slice(start) : text.slice(start, end);
}

const FLOOR = PAIRED_MIN_DISCORDANT_FLOOR; // 20, unchanged rev-2 pin
const SIZE = REV3_BATTERY_SIZE; // 90, the proposed rev-3 battery size

describe("rev-3 critical-value derivation (Plan 15-02, REQ-71)", () => {
  it(`returns, for every discordant-pair count from the pinned floor (${FLOOR}) to the new battery size (${SIZE}) inclusive, the smallest integer satisfying the frozen §5 condition`, () => {
    const table = deriveRev3Table();
    expect(table.map((r) => r.nd)).toEqual(Array.from({ length: SIZE - FLOOR + 1 }, (_, i) => FLOOR + i));
    for (const row of table) {
      expect(row.c, `n_d=${row.nd}`).toBe(deriveCriticalValue(row.nd));
    }
  });

  it("on the range the rev-2 table already covers (20-60), every derived value equals the value the frozen document states, read off disk", () => {
    const section9 = extractSection(preregText, "## §9 Pinned constants", "## §10");
    const rowPattern = /^\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*$/gm;
    const docRows = new Map<number, { c: number; ndMinusC: number }>();
    let match: RegExpExecArray | null;
    while ((match = rowPattern.exec(section9)) !== null) {
      docRows.set(Number(match[1]), { c: Number(match[2]), ndMinusC: Number(match[3]) });
    }
    // The frozen document's own table covers n_d 20-60 (41 rows) — the
    // overlap this correctness oracle checks against.
    expect(docRows.size).toBe(41);

    const table = deriveRev3Table();
    let overlapChecked = 0;
    for (const row of table) {
      if (!docRows.has(row.nd)) continue;
      const frozen = docRows.get(row.nd)!;
      expect(row.c, `n_d=${row.nd} c(n_d)`).toBe(frozen.c);
      expect(row.ndMinusC, `n_d=${row.nd} n_d-c(n_d)`).toBe(frozen.ndMinusC);
      overlapChecked++;
    }
    expect(overlapChecked).toBe(41);
  });

  it(`the emitted row count equals the new battery size (${SIZE}) minus the floor (${FLOOR}) plus one`, () => {
    const table = deriveRev3Table();
    expect(table).toHaveLength(SIZE - FLOOR + 1);
    expect(table).toHaveLength(71);
  });

  it("uses arbitrary-precision integers end to end — no exponentiation, logarithm, or division through a floating-point value", () => {
    const codeOnly = scriptSource
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");
    expect(codeOnly).not.toMatch(/Math\.(pow|log|exp|round)/);
    // Division only ever appears as exact BigInt division inside binomialRow
    // (`/ BigInt(k)`) — never a `/` applied to a plain number literal that
    // would silently coerce through a float.
    expect(codeOnly).not.toMatch(/[)\]a-zA-Z0-9_]\s*\/\s*\d+(?!n)\b/);
  });

  it("the emitted markdown rows have three integer columns in the frozen table's own order, with the third equal to the first minus the second on every row", () => {
    const table = deriveRev3Table();
    const rendered = renderRev3TableMarkdown(table);
    const lines = rendered.split("\n");
    expect(lines).toHaveLength(71);
    const rowPattern = /^\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|$/;
    for (const line of lines) {
      const m = rowPattern.exec(line);
      expect(m, `line does not match the three-integer-column shape: ${line}`).not.toBeNull();
      const nd = Number(m![1]);
      const c = Number(m![2]);
      const ndMinusC = Number(m![3]);
      expect(ndMinusC).toBe(nd - c);
    }
  });
});
