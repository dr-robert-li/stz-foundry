/**
 * Post-aggregation debug mode (cycle item 1) — unit, integration, functional.
 *
 * The repair loop: a shipped winner is wrong on behaviour the sealed suite never
 * exercised; the reproduced case is mined into a SEALED regression test
 * (twice-verified), the seal amended, and the affected slice + DAG dependents
 * reset to re-run against the sharpened suite.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  debugHarness,
  runDebugCases,
  verifyDebugCase,
  validateDebugCase,
  loadDebugCases,
  type DebugCase,
} from "../src/debug.js";
import { fullEval } from "../src/eval-runner.js";
import { transitiveDependents } from "../src/project.js";
import { runBridge } from "../src/bridge.js";
import { scaffold, STZ_DIR } from "../src/taxonomy.js";
import { seal } from "../src/seal.js";
import { freshState, saveState, statePath } from "../src/state.js";
import type { ProjectManifest } from "../src/types.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "stz-debugmode-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const write = (name: string, body: string) => {
  const p = join(dir, name);
  writeFileSync(p, body, "utf8");
  return p;
};

// f clamps negatives to 0; the WINNER forgot the clamp (wrong on f(-5)).
const WINNER = "export function f(n){ return n * 2; }\n";
const REFERENCE = "export function f(n){ return n < 0 ? 0 : n * 2; }\n";
const DEFECT: DebugCase = { fn: "f", input: "[-5]", expected: "0", note: "negatives must clamp to 0" };

// ── unit: harness + oracle + validation ──────────────────────────────────────

describe("debug-mode unit", () => {
  it("runDebugCases: correct impl passes, wrong impl fails", () => {
    const ref = write("ref.mjs", REFERENCE);
    const win = write("win.mjs", WINNER);
    expect(runDebugCases(ref, [DEFECT]).passRate).toBe(1);
    expect(runDebugCases(win, [DEFECT]).passRate).toBeLessThan(1);
  });

  it("debugHarness handles multi-arg and object equality", () => {
    const impl = write("obj.mjs", "export function add(a,b){return a+b;} export function pt(x,y){return {x,y};}\n");
    const cases: DebugCase[] = [
      { fn: "add", input: "[2,3]", expected: "5" },
      { fn: "pt", input: "[1,2]", expected: '{"x":1,"y":2}' },
    ];
    expect(runDebugCases(impl, cases).passRate).toBe(1);
  });

  it("verifyDebugCase: accepted only when winner FAILS and reference PASSES", () => {
    const ref = write("ref.mjs", REFERENCE);
    const win = write("win.mjs", WINNER);
    const ok = verifyDebugCase(win, ref, DEFECT);
    expect(ok.accepted).toBe(true);
    expect(ok.winnerFails).toBe(true);
    expect(ok.referencePasses).toBe(true);

    // winner already handles this case → rejected (not an uncaught defect)
    const passing: DebugCase = { fn: "f", input: "[3]", expected: "6" };
    expect(verifyDebugCase(win, ref, passing).accepted).toBe(false);

    // reference does not satisfy the stated expectation → rejected (mis-stated)
    const wrong: DebugCase = { fn: "f", input: "[-5]", expected: "999" };
    expect(verifyDebugCase(win, ref, wrong).accepted).toBe(false);
  });

  it("validateDebugCase rejects non-array input and bad JSON", () => {
    expect(validateDebugCase({ fn: "f", input: "5", expected: "1" })).toMatch(/ARRAY/);
    expect(validateDebugCase({ fn: "f", input: "[1", expected: "1" })).toMatch(/not valid JSON/);
    expect(validateDebugCase({ fn: "", input: "[1]", expected: "1" })).toMatch(/fn/);
    expect(validateDebugCase({ fn: "f", input: "[1]", expected: "1" })).toBeNull();
  });

  it("transitiveDependents: everything downstream, topo-ordered", () => {
    const slices = [
      { id: "a", name: "a", dependsOn: [] },
      { id: "b", name: "b", dependsOn: ["a"] },
      { id: "c", name: "c", dependsOn: ["b"] },
      { id: "d", name: "d", dependsOn: [] },
    ];
    expect(transitiveDependents(slices, "a")).toEqual(["b", "c"]);
    expect(transitiveDependents(slices, "b")).toEqual(["c"]);
    expect(transitiveDependents(slices, "c")).toEqual([]);
    expect(transitiveDependents(slices, "d")).toEqual([]);
  });
});

// ── integration: the mined case becomes a real gate check in fullEval ─────────

describe("debug-mode gate integration (fullEval)", () => {
  // A trivial sealed suite the wrong winner PASSES (the blind spot: it never
  // tests a negative input), so only the mined debug case can catch it.
  const SEALED =
    "const m = await import(process.argv[2]);\n" +
    "const ok = m.f(3) === 6;\n" +
    "console.log(JSON.stringify({ passed: ok?1:0, total: 1, passRate: ok?1:0 }));\n";

  it("wrong winner passes the sealed suite but FAILS once the debug case is sealed", () => {
    const sealedPath = write("sealed.mjs", SEALED);
    const win = write("win.mjs", WINNER);
    const casesPath = write("debug-cases.json", JSON.stringify([DEFECT]));

    // Without debug cases: the shipped winner passes the suite (blind spot).
    const before = fullEval(sealedPath, win);
    expect(before.testPassRate).toBe(1);
    expect(before.debugPassRate).toBe(1); // no cases → 1

    // With the mined case sealed: the same winner now fails the gate.
    const after = fullEval(sealedPath, win, undefined, casesPath);
    expect(after.testPassRate).toBe(1); // suite still green
    expect(after.debugPassRate).toBeLessThan(1); // but the regression case bites
    expect(after.debugCases).toBe(1);
  });

  it("a correct impl passes both the suite and the sealed debug case", () => {
    const sealedPath = write("sealed.mjs", SEALED);
    const ref = write("ref.mjs", REFERENCE);
    const casesPath = write("debug-cases.json", JSON.stringify([DEFECT]));
    const e = fullEval(sealedPath, ref, undefined, casesPath);
    expect(e.testPassRate).toBe(1);
    expect(e.debugPassRate).toBe(1);
  });
});

// ── functional: bridge debug-case end to end over an .stz tree ────────────────

describe("debug-mode functional (bridge debug-case + slice-reset)", () => {
  let captured: string;
  const origWrite = process.stdout.write.bind(process.stdout);
  beforeEach(() => {
    captured = "";
    (process.stdout.write as unknown as (s: string) => boolean) = (s: string) => {
      captured += s;
      return true;
    };
    process.exitCode = 0;
  });
  afterEach(() => {
    process.stdout.write = origWrite;
    process.exitCode = 0;
  });
  const out = <T,>(): T => JSON.parse(captured) as T;

  async function fixture(): Promise<{ win: string; ref: string }> {
    await scaffold(dir);
    const manifest: ProjectManifest = {
      schemaVersion: 1,
      projectId: "p",
      name: "p",
      summary: "",
      slices: [
        { id: "slice-a", name: "a", dependsOn: [] },
        { id: "slice-b", name: "b", dependsOn: ["slice-a"] },
      ],
    };
    mkdirSync(join(dir, STZ_DIR, "00-intent"), { recursive: true });
    writeFileSync(join(dir, STZ_DIR, "00-intent", "project.json"), JSON.stringify(manifest), "utf8");
    // A sealed held-out suite so seal-amend has a prior seal to amend.
    const hoDir = join(dir, STZ_DIR, "30-tests", "held-out", "slice-a");
    mkdirSync(hoDir, { recursive: true });
    writeFileSync(join(hoDir, "slice-a.test.mjs"), "console.log(JSON.stringify({passed:1,total:1,passRate:1}));\n", "utf8");
    await seal(dir);
    // Both slices have state (as if run) so the reset has something to remove.
    await saveState(dir, freshState("slice-a", 1, 1_000_000));
    await saveState(dir, freshState("slice-b", 1, 1_000_000));
    return { win: write("win.mjs", WINNER), ref: write("ref.mjs", REFERENCE) };
  }

  it("mines the defect, amends the seal, and resets the slice + dependents", async () => {
    const { win, ref } = await fixture();
    await runBridge([
      "debug-case", "--root", dir, "--slice", "slice-a",
      "--impl", win, "--reference", ref,
      "--fn", "f", "--input", "[-5]", "--expected", "0", "--note", "clamp negatives", "--apply",
    ]);
    expect(process.exitCode).toBe(0);
    const res = out<{ accepted: boolean; rerunSet: string[]; sealAmended: boolean; totalCases: number }>();
    expect(res.accepted).toBe(true);
    expect(res.sealAmended).toBe(true);
    expect(res.totalCases).toBe(1);
    expect(res.rerunSet).toEqual(["slice-a", "slice-b"]);

    // The sealed regression case is on disk under the slice's held-out tree.
    const casesPath = join(dir, STZ_DIR, "30-tests", "held-out", "slice-a", "debug-cases.json");
    expect(existsSync(casesPath)).toBe(true);
    expect(loadDebugCases(casesPath)).toHaveLength(1);

    // --apply reset both slices (state removed → they re-run).
    expect(existsSync(statePath(dir, "slice-a"))).toBe(false);
    expect(existsSync(statePath(dir, "slice-b"))).toBe(false);
  });

  it("rejects a case the winner already passes (not an uncaught defect)", async () => {
    const { win, ref } = await fixture();
    await runBridge([
      "debug-case", "--root", dir, "--slice", "slice-a",
      "--impl", win, "--reference", ref,
      "--fn", "f", "--input", "[3]", "--expected", "6",
    ]);
    expect(process.exitCode).toBe(1);
    expect(out<{ accepted: boolean }>().accepted).toBe(false);
    // No sealed case written on rejection.
    expect(existsSync(join(dir, STZ_DIR, "30-tests", "held-out", "slice-a", "debug-cases.json"))).toBe(false);
  });

  it("slice-reset --with-dependents resets the downstream set", async () => {
    await fixture();
    await runBridge(["slice-reset", "--root", dir, "--slice", "slice-a", "--with-dependents", "true"]);
    expect(out<{ reset: string[] }>().reset).toEqual(["slice-a", "slice-b"]);
    expect(existsSync(statePath(dir, "slice-a"))).toBe(false);
    expect(existsSync(statePath(dir, "slice-b"))).toBe(false);
  });
});
