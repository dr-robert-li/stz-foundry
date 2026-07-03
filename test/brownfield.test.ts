/**
 * Brownfield codebase support (cycle item 3) — unit, integration, functional.
 *
 * Explore an existing codebase into a structured map, then anchor slices to real
 * code locations so a hallucinated path (or a preserved export that isn't there)
 * is caught before any specimen runs.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  extractExports,
  isTestFile,
  exploreCodebase,
  checkAnchor,
  type SliceAnchor,
} from "../src/brownfield.js";
import { runBridge } from "../src/bridge.js";
import { scaffold, STZ_DIR } from "../src/taxonomy.js";

let dir: string;
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "stz-brown-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const put = (rel: string, body: string) => {
  const p = join(dir, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, body, "utf8");
};

// ── unit ─────────────────────────────────────────────────────────────────────

describe("brownfield unit", () => {
  it("extractExports: JS/TS named, class, const, export{}, default, commonjs", () => {
    const src =
      "export function login(u){} export class Session {} export const VERSION = 1;\n" +
      "function helper(){} export { helper as help };\n" +
      "module.exports.legacy = 1; export default login;\n";
    const ex = extractExports(src, "typescript");
    expect(ex).toEqual(expect.arrayContaining(["login", "Session", "VERSION", "help", "legacy", "default"]));
    expect(ex).not.toContain("helper"); // only the aliased export name
  });

  it("extractExports: Python top-level def/class, skips _private", () => {
    const src = "def public():\n    pass\nclass Widget:\n    pass\ndef _private():\n    pass\n";
    expect(extractExports(src, "python").sort()).toEqual(["Widget", "public"]);
  });

  it("isTestFile recognises the conventional names", () => {
    expect(isTestFile("src/auth.test.ts")).toBe(true);
    expect(isTestFile("src/auth.spec.js")).toBe(true);
    expect(isTestFile("tests/thing.py")).toBe(true);
    expect(isTestFile("test_widget.py")).toBe(true);
    expect(isTestFile("src/auth.ts")).toBe(false);
  });

  it("exploreCodebase maps files, exports, tests, public surface; skips node_modules", () => {
    put("src/auth.ts", "export function login(u){ return u; }\n");
    put("src/index.ts", "export { login } from './auth.js';\nexport const NAME = 'app';\n");
    put("src/auth.test.ts", "import { login } from './auth.js';\n");
    put("node_modules/dep/index.js", "export function nope(){}\n"); // must be skipped
    put("README.md", "# not source\n");

    const map = exploreCodebase(dir);
    expect(map.summary.fileCount).toBe(3); // 3 source files, README + node_modules excluded
    expect(map.files.find((f) => f.path === "src/auth.ts")?.exports).toContain("login");
    expect(map.testFiles).toEqual(["src/auth.test.ts"]);
    expect(map.publicSurface).toEqual(expect.arrayContaining(["login", "NAME"])); // from index.ts
    expect(map.files.some((f) => f.path.includes("node_modules"))).toBe(false);
  });

  it("checkAnchor: edit must point at existing files + exports; add must not collide", () => {
    put("src/auth.ts", "export function login(u){}\n");
    const map = exploreCodebase(dir);

    // valid edit
    const ok: SliceAnchor = { sliceId: "s1", mode: "edit", targetFiles: ["src/auth.ts"], preservedExports: ["login"] };
    expect(checkAnchor(map, ok).ok).toBe(true);

    // dangling file
    const dangling: SliceAnchor = { sliceId: "s2", mode: "edit", targetFiles: ["src/nope.ts"] };
    const d = checkAnchor(map, dangling);
    expect(d.ok).toBe(false);
    expect(d.danglingFiles).toEqual(["src/nope.ts"]);

    // preserved export that doesn't exist
    const badExport: SliceAnchor = { sliceId: "s3", mode: "edit", targetFiles: ["src/auth.ts"], preservedExports: ["logout"] };
    expect(checkAnchor(map, badExport).danglingExports).toEqual(["logout"]);

    // add colliding with an existing file
    const collide: SliceAnchor = { sliceId: "s4", mode: "add", targetFiles: ["src/auth.ts"] };
    expect(checkAnchor(map, collide).collidingFiles).toEqual(["src/auth.ts"]);

    // add of a genuinely new file is fine
    const add: SliceAnchor = { sliceId: "s5", mode: "add", targetFiles: ["src/new.ts"] };
    expect(checkAnchor(map, add).ok).toBe(true);
  });
});

// ── integration + functional: bridge explore + anchor-check ──────────────────

describe("brownfield bridge (explore + anchor-check)", () => {
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

  it("explore writes the map, then anchor-check passes a real anchor and fails a dangling one", async () => {
    await scaffold(dir);
    put("src/auth.ts", "export function login(u){ return u; }\nexport function logout(){}\n");
    put("src/index.ts", "export { login, logout } from './auth.js';\n");
    put("src/auth.test.ts", "// test\n");

    // explore
    await runBridge(["explore", "--root", dir, "--target", dir]);
    const summary = out<{ fileCount: number; publicSurface: string[] }>();
    expect(summary.fileCount).toBeGreaterThanOrEqual(3);
    expect(summary.publicSurface).toEqual(expect.arrayContaining(["login", "logout"]));
    expect(existsSync(join(dir, STZ_DIR, "10-research", "codebase-map.json"))).toBe(true);

    // valid anchor → ok, exit 0
    captured = "";
    const goodAnchor = join(dir, "anchor-ok.json");
    writeFileSync(goodAnchor, JSON.stringify({ sliceId: "add-2fa", mode: "edit", targetFiles: ["src/auth.ts"], preservedExports: ["login"] }));
    await runBridge(["anchor-check", "--root", dir, "--anchor", goodAnchor]);
    expect(process.exitCode).toBe(0);
    expect(out<{ ok: boolean }>().ok).toBe(true);

    // dangling anchor → invalid, exit 1
    captured = "";
    process.exitCode = 0;
    const badAnchor = join(dir, "anchor-bad.json");
    writeFileSync(badAnchor, JSON.stringify({ sliceId: "ghost", mode: "edit", targetFiles: ["src/ghost.ts"] }));
    await runBridge(["anchor-check", "--root", dir, "--anchor", badAnchor]);
    expect(process.exitCode).toBe(1);
    expect(out<{ ok: boolean; danglingFiles: string[] }>().danglingFiles).toEqual(["src/ghost.ts"]);
  });

  it("anchor-check errors clearly when no map has been produced yet", async () => {
    await scaffold(dir);
    writeFileSync(join(dir, "a.json"), JSON.stringify({ sliceId: "x", mode: "edit", targetFiles: ["y.ts"] }));
    await runBridge(["anchor-check", "--root", dir, "--anchor", join(dir, "a.json")]);
    expect(process.exitCode).toBe(1);
  });
});
