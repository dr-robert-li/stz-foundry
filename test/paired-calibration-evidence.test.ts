import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Plan 15-01, Task 2 (REQ-73). Reads the three committed calibration-verdict
// artifacts off disk and binds every figure the Phase-15 amendment will cite
// (`.planning/HANDOVER-phase15-amended-run.md` §2) to a literal in this file.
// Every number below is read from the artifact and compared against a
// literal — never computed or rounded in this test.
//
// This test's value is narrow, stated once here as it is in the calibration
// script's own header: it is not a claim that the calibration dry-run was
// well-designed, only that the numbers the rev-3 amendment quotes are the
// numbers the committed artifacts actually carry, so a later reader can
// check a citation without a session transcript.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

interface ConfigAccounting {
  config: string;
  attempted: number;
  scoreable: number;
  matched: number;
  matchRate: number;
}

interface CalibrationVerdict {
  complete: boolean;
  accounting: ConfigAccounting[];
  runConfig: { model: string; modelDigestLine: string };
}

function readVerdict(fileName: string): CalibrationVerdict {
  return JSON.parse(readFileSync(join(repoRoot, "experiments/paired-comparison-arm", fileName), "utf8")) as CalibrationVerdict;
}

function findConfig(verdict: CalibrationVerdict, config: string): ConfigAccounting {
  const row = verdict.accounting.find((c) => c.config === config);
  if (!row) throw new Error(`[paired-calibration-evidence] no accounting row for config ${config}`);
  return row;
}

describe("calibration-dryrun-verdict.gptoss.json — gpt-oss:latest on the standard battery (§2 gradient zone)", () => {
  const verdict = readVerdict("calibration-dryrun-verdict.gptoss.json");

  it("completion flag is true", () => {
    expect(verdict.complete).toBe(true);
  });

  it("model and digest are gpt-oss:latest / 17052f91a42e", () => {
    expect(verdict.runConfig.model).toBe("gpt-oss:latest");
    expect(verdict.runConfig.modelDigestLine).toContain("17052f91a42e");
  });

  it("per-config scored counts match the handover's figures, read literally off the artifact", () => {
    expect(findConfig(verdict, "C0")).toEqual({ config: "C0", attempted: 10, scoreable: 9, matched: 7, matchRate: 0.7 });
    expect(findConfig(verdict, "C1")).toEqual({ config: "C1", attempted: 10, scoreable: 9, matched: 9, matchRate: 0.9 });
    expect(findConfig(verdict, "C2")).toEqual({ config: "C2", attempted: 10, scoreable: 10, matched: 8, matchRate: 0.8 });
    expect(findConfig(verdict, "C3")).toEqual({ config: "C3", attempted: 10, scoreable: 8, matched: 7, matchRate: 0.7 });
    expect(findConfig(verdict, "C4")).toEqual({ config: "C4", attempted: 10, scoreable: 10, matched: 10, matchRate: 1 });
    expect(findConfig(verdict, "C5")).toEqual({ config: "C5", attempted: 10, scoreable: 10, matched: 7, matchRate: 0.7 });
  });
});

describe("calibration-dryrun-verdict.gptoss-c6.json — gpt-oss:latest, C6 explicit-contract micro-check", () => {
  const verdict = readVerdict("calibration-dryrun-verdict.gptoss-c6.json");

  it("completion flag is true", () => {
    expect(verdict.complete).toBe(true);
  });

  it("model and digest are gpt-oss:latest / 17052f91a42e", () => {
    expect(verdict.runConfig.model).toBe("gpt-oss:latest");
    expect(verdict.runConfig.modelDigestLine).toContain("17052f91a42e");
  });

  it("C6 clears its own configuration outright: 10/10 matched", () => {
    expect(findConfig(verdict, "C6")).toEqual({ config: "C6", attempted: 10, scoreable: 10, matched: 10, matchRate: 1 });
  });
});

describe("calibration-dryrun-verdict.qwen36.json — qwen3.6:latest saturates every configuration", () => {
  const verdict = readVerdict("calibration-dryrun-verdict.qwen36.json");

  it("completion flag is true", () => {
    expect(verdict.complete).toBe(true);
  });

  it("model and digest are qwen3.6:latest / 07d35212591f", () => {
    expect(verdict.runConfig.model).toBe("qwen3.6:latest");
    expect(verdict.runConfig.modelDigestLine).toContain("07d35212591f");
  });

  it("every one of the six configurations matches all 10 attempted units", () => {
    for (const config of ["C0", "C1", "C2", "C3", "C4", "C5"]) {
      expect(findConfig(verdict, config)).toEqual({ config, attempted: 10, scoreable: 10, matched: 10, matchRate: 1 });
    }
  });
});
