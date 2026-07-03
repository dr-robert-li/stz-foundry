/**
 * Sealed end-to-end integration/functional gate (cycle item 4) — unit + functional.
 *
 * The composition-level gate: the assembled artifact must satisfy the sealed
 * integration suite in full (greenfield: against project intent), and brownfield
 * additionally must preserve every promised source export.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkExportsPresent, runIntegrationGate } from "../src/integration.js";
import { runBridge } from "../src/bridge.js";
import { scaffold, STZ_DIR } from "../src/taxonomy.js";

let dir: string;
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "stz-integ-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const write = (name: string, body: string) => {
  const p = join(dir, name);
  writeFileSync(p, body, "utf8");
  return p;
};

// Assembled artifacts + a composition-level suite that checks they work together.
const ENTRY_OK = "export function add(a,b){return a+b;} export function sub(a,b){return a-b;}\n";
const ENTRY_BROKEN = "export function add(a,b){return a+b;}\n"; // sub dropped
const SUITE =
  "const m = await import(process.argv[2]);\n" +
  "let passed = 0, total = 0;\n" +
  "const ck = (c) => { total++; if (c) passed++; };\n" +
  "ck(m.add(2,3) === 5); ck(m.sub(5,2) === 3);\n" + // composition: both used together
  "const passRate = passed/total;\n" +
  "console.log(JSON.stringify({ passed, total, passRate }));\n" +
  "process.exit(passRate === 1 ? 0 : 1);\n";

// ── unit ─────────────────────────────────────────────────────────────────────

describe("integration-gate unit", () => {
  it("checkExportsPresent finds present + missing exports on the assembled entry", () => {
    const ok = write("ok.mjs", ENTRY_OK);
    expect(checkExportsPresent(ok, ["add", "sub"])).toEqual({ present: ["add", "sub"], missing: [] });
    const broken = write("broken.mjs", ENTRY_BROKEN);
    expect(checkExportsPresent(broken, ["add", "sub"]).missing).toEqual(["sub"]);
  });

  it("runIntegrationGate: passes only when the suite is green AND no preserved export dropped", () => {
    const suite = write("suite.mjs", SUITE);
    const ok = write("ok.mjs", ENTRY_OK);
    const broken = write("broken.mjs", ENTRY_BROKEN);

    // greenfield: composition works
    expect(runIntegrationGate(suite, ok).passed).toBe(true);
    // composition broken → suite fails → gate fails
    expect(runIntegrationGate(suite, broken).passed).toBe(false);
    // brownfield: suite green but a preserved export was dropped → gate fails
    const r = runIntegrationGate(suite, ok, ["add", "legacyApi"]);
    expect(r.suite.passRate).toBe(1);
    expect(r.preservedMissing).toEqual(["legacyApi"]);
    expect(r.passed).toBe(false);
  });
});

// ── functional: bridge integration-gate ──────────────────────────────────────

describe("integration-gate functional (bridge)", () => {
  let captured: string;
  const origWrite = process.stdout.write.bind(process.stdout);
  beforeEach(async () => {
    await scaffold(dir);
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

  it("greenfield: composed slices work together → PASS, writes integration.md", async () => {
    const suite = write("suite.mjs", SUITE);
    const entry = write("entry.mjs", ENTRY_OK);
    await runBridge(["integration-gate", "--root", dir, "--suite", suite, "--entry", entry]);
    expect(process.exitCode).toBe(0);
    expect(out<{ passed: boolean }>().passed).toBe(true);
    const doc = readFileSync(join(dir, STZ_DIR, "90-audit", "integration.md"), "utf8");
    expect(doc).toContain("✅ PASS");
  });

  it("broken composition → FAIL, exit 1", async () => {
    const suite = write("suite.mjs", SUITE);
    const entry = write("entry.mjs", ENTRY_BROKEN);
    await runBridge(["integration-gate", "--root", dir, "--suite", suite, "--entry", entry]);
    expect(process.exitCode).toBe(1);
    expect(out<{ passed: boolean }>().passed).toBe(false);
  });

  it("brownfield source-preservation: a dropped preserved export FAILS even with a green suite", async () => {
    const suite = write("suite.mjs", SUITE);
    const entry = write("entry.mjs", ENTRY_OK); // suite passes...
    await runBridge([
      "integration-gate", "--root", dir, "--suite", suite, "--entry", entry,
      "--preserved", '["add","sub","removedPublicApi"]',
    ]);
    expect(process.exitCode).toBe(1); // ...but a promised export is gone
    expect(out<{ passed: boolean; preservedMissing: string[] }>().preservedMissing).toEqual(["removedPublicApi"]);
  });
});
