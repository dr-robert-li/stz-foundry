/**
 * The prebuilt `dist/` distribution contract (ROADMAP hardening item).
 *
 * Before this, `bin/stz.mjs` always shelled out to `npx tsx src/cli.ts`, so a
 * fresh environment needed Node 20+ **and network** for the first `stz` call,
 * and `tsx` was a runtime dependency of a package that otherwise ships zero.
 *
 * These tests are deliberately fast: they do NOT run `tsc`. The real emit is
 * exercised by `npm run build` + a `node dist/cli.js` smoke in CI, because a
 * multi-second compile has no business in a 3.5s unit suite. What is asserted
 * here is the part that silently rots: the entrypoint's preference order, and
 * the package.json fields that decide what actually reaches a consumer.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(
  execFileSync(process.execPath, ["-e", "process.stdout.write(require('fs').readFileSync('package.json','utf8'))"], {
    cwd: repoRoot,
    encoding: "utf8",
  }),
) as Record<string, any>;

/**
 * A throwaway package layout: the REAL `bin/stz.mjs` next to a stub `dist/cli.js`
 * that prints a marker. If the entrypoint prefers the build, the marker appears
 * and no `tsx` is involved — which is the whole point.
 */
function fakePackage(withDist: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), "stz-dist-"));
  mkdirSync(join(dir, "bin"), { recursive: true });
  copyFileSync(join(repoRoot, "bin", "stz.mjs"), join(dir, "bin", "stz.mjs"));
  mkdirSync(join(dir, "src"), { recursive: true });
  // A source entry that must NOT run when dist/ is present.
  writeFileSync(join(dir, "src", "cli.ts"), 'console.log("FROM-SOURCE-TSX");\n', "utf8");
  if (withDist) {
    mkdirSync(join(dir, "dist"), { recursive: true });
    writeFileSync(join(dir, "dist", "cli.js"), 'console.log("FROM-DIST");\n', "utf8");
  }
  return dir;
}

describe("bin/stz.mjs prefers the prebuilt dist over tsx", () => {
  it("runs dist/cli.js in-process when the build is present", () => {
    const dir = fakePackage(true);
    try {
      const out = execFileSync(process.execPath, [join(dir, "bin", "stz.mjs")], { encoding: "utf8" });
      expect(out).toContain("FROM-DIST");
      expect(out).not.toContain("FROM-SOURCE-TSX");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("needs neither npx nor tsx on PATH when the build is present", () => {
    const dir = fakePackage(true);
    try {
      // PATH stripped to nothing: `npx` is unreachable. The published path must
      // still work, because it never spawns anything. This is the assertion that
      // actually proves the runtime dependency is gone — a test that merely
      // checks output would pass even if it had shelled out.
      const out = execFileSync(process.execPath, [join(dir, "bin", "stz.mjs")], {
        encoding: "utf8",
        // PATH emptied so `npx` is unreachable; node itself is invoked by
        // absolute path (process.execPath) so the test still has an interpreter.
        env: { ...process.env, PATH: "" },
      });
      expect(out).toContain("FROM-DIST");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("still falls back to the tsx source path in a checkout with no dist", () => {
    const dir = fakePackage(false);
    try {
      // The source-available repo is meant to work with `git clone` and no build
      // step, so the fallback is a feature, not dead code.
      const out = execFileSync(process.execPath, [join(dir, "bin", "stz.mjs")], {
        encoding: "utf8",
        timeout: 60_000,
      });
      expect(out).toContain("FROM-SOURCE-TSX");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the published package ships the build and no runtime dependency", () => {
  it("declares no runtime dependencies at all", () => {
    // tsx moved to devDependencies; nothing replaced it. A future `dependencies`
    // block is a deliberate decision, so make it fail here first.
    const deps = pkg.dependencies ?? {};
    expect(Object.keys(deps)).toEqual([]);
    expect(Object.keys(pkg.devDependencies)).toContain("tsx");
  });

  it("includes dist/ in files and points exports at it", () => {
    expect(pkg.files).toContain("dist");
    // src/ still ships: it is the source-available template repo, and the tsx
    // fallback in bin/stz.mjs resolves against it.
    expect(pkg.files).toContain("src");
    expect(pkg.exports["."].import).toBe("./dist/index.js");
    expect(pkg.exports["."].types).toBe("./dist/index.d.ts");
  });

  it("builds before publishing, so dist can never be stale or missing", () => {
    expect(pkg.scripts.build).toContain("tsconfig.build.json");
    // The guard that matters: publishing without a build would ship an exports
    // map pointing at files that do not exist.
    expect(pkg.scripts.prepublishOnly).toContain("npm run build");
    expect(pkg.scripts.prepublishOnly).toContain("npm test");
    expect(pkg.scripts.prepublishOnly).toContain("npm run typecheck");
  });
});
