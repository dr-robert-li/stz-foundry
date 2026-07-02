/**
 * Stage-0 earn instrument (Foundry rebuild): the identity rebrand is complete
 * and the release pipeline can never overwrite the upstream npm package.
 * See experiments/foundry-progression/stage-0.md.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PACKAGE_NAME, STZ_VERSION } from "../src/version.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

describe("foundry identity (stage 0)", () => {
  it("the package is stz-foundry at version >= 1.0.0", () => {
    expect(PACKAGE_NAME).toBe("stz-foundry");
    const major = Number(STZ_VERSION.split(".")[0]);
    expect(major).toBeGreaterThanOrEqual(1);
  });

  it("all three bin names resolve to the same entrypoint", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.bin.stz).toBe("bin/stz.mjs");
    expect(pkg.bin["stz-f"]).toBe("bin/stz.mjs");
    expect(pkg.bin["stz-foundry"]).toBe("bin/stz.mjs");
  });

  it("the release workflow guards against publishing the upstream package", () => {
    const wf = read(".github/workflows/release.yml");
    // the name guard must exist and pin the new package name
    expect(wf).toContain('if [ "$NAME" != "stz-foundry" ]');
    // and no step may reference the upstream package as a publish target
    expect(wf).not.toContain("npmjs.com/package/slice-tournament-zoo");
  });

  it("live docs carry no upstream identity refs (stage 6 staleness sweep)", () => {
    // Historical records (CHANGELOG, docs/PAPER.md, experiments/) intentionally
    // keep the upstream name as provenance; every LIVE doc must not.
    // docs/CLAUDE.md is deliberately gitignored (local-only notes) — it cannot
    // be guarded here or CI fails on the missing file.
    for (const rel of [
      "README.md",
      "CONTRIBUTING.md",
      "src/README.md",
      "docs/development/local-and-testing.md",
    ]) {
      expect(read(rel), rel).not.toContain("slice-tournament-zoo");
    }
  });

  it("update remediation commands point at the new package", () => {
    // registryLatestUrl and the printed `npm i -g` remediation both derive from
    // PACKAGE_NAME; a stale literal anywhere in update.ts would reintroduce the
    // typosquat/wrong-package failure version.ts exists to prevent.
    const src = read("src/update.ts");
    expect(src).not.toContain("slice-tournament-zoo");
  });
});
