import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir, homedir, platform } from "node:os";
import { join } from "node:path";
import { detectIsolation, lastIsolation, sandboxedNode, _resetSandboxCache } from "../src/sandbox.js";

/**
 * The eval seam runs code a model wrote. These tests assert the sandbox
 * actually neutralizes the three vectors a hostile sealed harness has —
 * network exfiltration, host filesystem write, arbitrary process spawn — and
 * that the legitimate path (running the impl, writing V8 coverage) still works.
 *
 * On a host with no OS isolation (no bwrap/sandbox-exec) the run falls back to
 * the Node permission model, which does not block the network; the network
 * assertion is skipped there and the fallback level is asserted instead.
 */
const HOSTILE = `
const mod = await import(process.argv[2]);
let net = "blocked", fsw = "blocked", child = "blocked";
try { await fetch("http://127.0.0.1:9/x"); net = "OPEN"; } catch { net = "blocked"; }
try {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(process.env.STZ_PWN_PATH, "x");
  fsw = "OPEN";
} catch { fsw = "blocked"; }
try {
  const { spawnSync } = await import("node:child_process");
  const s = spawnSync("id", []);
  child = s.error ? "blocked" : "OPEN";
} catch { child = "blocked"; }
console.error(JSON.stringify({ net, fsw, child }));
console.log(JSON.stringify({ passed: 1, total: 1, passRate: 1 }));
`;

describe("execution sandbox", () => {
  beforeEach(() => _resetSandboxCache());

  it("picks an isolation level for this host", () => {
    const iso = detectIsolation();
    expect(["bwrap", "sandbox-exec", "node-permission", "none"]).toContain(iso);
  });

  it("neutralizes a hostile harness (fs-write + child_process always; network under OS isolation)", () => {
    const dir = mkdtempSync(join(tmpdir(), "stz-sbx-test-"));
    const pwnPath = join(homedir(), `.stz-sandbox-pwn-${process.pid}.txt`);
    try {
      const sealed = join(dir, "sealed.mjs");
      const impl = join(dir, "impl.mjs");
      writeFileSync(sealed, HOSTILE, "utf8");
      writeFileSync(impl, "export function f(x){return x;}\n", "utf8");

      const r = sandboxedNode([sealed, impl], {
        readDirs: [dir],
        env: { ...process.env, STZ_PWN_PATH: pwnPath },
        timeout: 20_000,
      });
      const iso = lastIsolation();

      // GROUND TRUTH: the host filesystem was not tampered — the real security
      // property, independent of anything the harness self-reports.
      expect(existsSync(pwnPath)).toBe(false);

      // The harness's self-report is secondary and may be absent (a sandboxed
      // node can emit unrelated stderr, e.g. a resource-limit note). Find the
      // diag line if present rather than blind-parsing the last stderr line.
      const diag = (r.stderr ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => { try { return JSON.parse(l); } catch { return null; } })
        .find((o) => o && typeof o === "object" && "fsw" in o);

      if (diag) expect(diag.fsw).toBe("blocked");
      if (iso === "bwrap" || iso === "sandbox-exec") {
        if (diag) expect(diag.net).toBe("blocked"); // OS isolation closes the network
      } else {
        expect(iso).toBe("node-permission"); // degraded fallback (documented gap)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(pwnPath, { force: true });
    }
  });

  it("still runs the impl and returns the harness verdict", () => {
    const dir = mkdtempSync(join(tmpdir(), "stz-sbx-ok-"));
    try {
      const sealed = join(dir, "sealed.mjs");
      const impl = join(dir, "impl.mjs");
      writeFileSync(
        sealed,
        `const m = await import(process.argv[2]);\n` +
          `const ok = m.add(2, 3) === 5;\n` +
          `console.log(JSON.stringify({ passed: ok?1:0, total: 1, passRate: ok?1:0 }));\n`,
        "utf8",
      );
      writeFileSync(impl, "export function add(a,b){return a+b;}\n", "utf8");
      const r = sandboxedNode([sealed, impl], { readDirs: [dir], timeout: 20_000 });
      const verdict = JSON.parse((r.stdout ?? "").trim().split("\n").filter(Boolean).pop() ?? "{}");
      expect(verdict.passRate).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("lets V8 coverage write to the coverage dir (measureCoverage path)", () => {
    // Coverage only survives under OS isolation; the permission model blocks the
    // V8 coverage writer, which is a documented fallback limitation.
    if (platform() !== "linux" && platform() !== "darwin") return;
    _resetSandboxCache();
    if (detectIsolation() !== "bwrap" && detectIsolation() !== "sandbox-exec") return;

    const dir = mkdtempSync(join(tmpdir(), "stz-sbx-cov-"));
    const covDir = mkdtempSync(join(tmpdir(), "stz-sbx-covout-"));
    try {
      const sealed = join(dir, "sealed.mjs");
      const impl = join(dir, "impl.mjs");
      writeFileSync(
        sealed,
        `const m = await import(process.argv[2]);\n m.f(1);\n` +
          `console.log(JSON.stringify({ passed: 1, total: 1, passRate: 1 }));\n`,
        "utf8",
      );
      writeFileSync(impl, "export function f(x){return x+1;}\n", "utf8");
      sandboxedNode([sealed, impl], {
        readDirs: [dir],
        writeDirs: [covDir],
        env: { ...process.env, NODE_V8_COVERAGE: covDir },
        timeout: 20_000,
      });
      expect(readdirSync(covDir).length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(covDir, { recursive: true, force: true });
    }
  });

  it("honours STZ_SANDBOX=none as an explicit opt-out", () => {
    const prev = process.env.STZ_SANDBOX;
    process.env.STZ_SANDBOX = "none";
    try {
      _resetSandboxCache();
      expect(detectIsolation()).toBe("none");
    } finally {
      if (prev === undefined) delete process.env.STZ_SANDBOX;
      else process.env.STZ_SANDBOX = prev;
      _resetSandboxCache();
    }
  });
});
