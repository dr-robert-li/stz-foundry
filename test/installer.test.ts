/**
 * Unified user-selects installer (ROADMAP §7) — unit + functional.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  expandTilde,
  defaultConfigDir,
  resolveConfigDir,
  detectRuntimes,
  selectRuntimes,
  runtimeByName,
  planInstall,
  applyInstall,
  uninstall,
} from "../src/installer.js";

const CC = runtimeByName("claude-code")!;
const OC = runtimeByName("opencode")!;

describe("installer unit — location resolution (gsd-core model)", () => {
  it("expandTilde", () => {
    expect(expandTilde("~/x", "/home/u")).toBe("/home/u/x");
    expect(expandTilde("~", "/home/u")).toBe("/home/u");
    expect(expandTilde("/abs/x", "/home/u")).toBe("/abs/x");
  });

  it("defaultConfigDir: dot-home vs xdg (+ XDG_CONFIG_HOME override)", () => {
    expect(defaultConfigDir(CC, "/home/u")).toBe("/home/u/.claude");
    expect(defaultConfigDir(OC, "/home/u")).toBe("/home/u/.config/opencode");
    expect(defaultConfigDir(OC, "/home/u", { XDG_CONFIG_HOME: "/cfg" })).toBe("/cfg/opencode");
  });

  it("resolveConfigDir precedence: --config-dir > --project > STZ_CONFIG_DIR > runtime env > default", () => {
    const home = "/home/u";
    // explicit --config-dir wins over everything (tilde-expanded)
    expect(resolveConfigDir(CC, { home, configDir: "~/custom", env: { STZ_CONFIG_DIR: "/x", CLAUDE_CONFIG_DIR: "/y" } })).toBe("/home/u/custom");
    // project scope
    expect(resolveConfigDir(CC, { home, scope: "project", projectRoot: "/proj" })).toBe("/proj/.claude");
    // STZ_CONFIG_DIR beats the runtime's own env var
    expect(resolveConfigDir(CC, { home, env: { STZ_CONFIG_DIR: "/x", CLAUDE_CONFIG_DIR: "/y" } })).toBe("/x");
    // runtime env var
    expect(resolveConfigDir(CC, { home, env: { CLAUDE_CONFIG_DIR: "/y" } })).toBe("/y");
    // registry default
    expect(resolveConfigDir(CC, { home, env: {} })).toBe("/home/u/.claude");
  });

  it("detectRuntimes finds a runtime whose default config dir exists", () => {
    const home = mkdtempSync(join(tmpdir(), "stz-detect-"));
    try {
      mkdirSync(join(home, ".claude"), { recursive: true });
      const names = detectRuntimes(home).map((r) => r.name);
      expect(names).toContain("claude-code");
      expect(names).not.toContain("codex"); // no ~/.codex
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("selectRuntimes: default → claude-code; --all → supported only; --harness", () => {
    expect(selectRuntimes({}).map((r) => r.name)).toEqual(["claude-code"]);
    expect(selectRuntimes({ all: true }).every((r) => r.supported)).toBe(true);
    expect(selectRuntimes({ harness: "opencode" }).map((r) => r.name)).toEqual(["opencode"]);
    expect(selectRuntimes({ harness: "nope" })).toEqual([]);
  });
});

describe("installer functional — plan/apply/uninstall", () => {
  let assetRoot: string;
  let home: string;
  beforeEach(() => {
    assetRoot = mkdtempSync(join(tmpdir(), "stz-asset-"));
    mkdirSync(join(assetRoot, "commands"), { recursive: true });
    mkdirSync(join(assetRoot, "agents"), { recursive: true });
    writeFileSync(join(assetRoot, "commands", "pipeline.md"), "# pipeline\n");
    writeFileSync(join(assetRoot, "commands", "run.md"), "# run\n");
    writeFileSync(join(assetRoot, "commands", "notmd.txt"), "ignore me\n");
    writeFileSync(join(assetRoot, "agents", "stz-judge.md"), "# judge\n");
    home = mkdtempSync(join(tmpdir(), "stz-home-"));
  });
  afterEach(() => {
    rmSync(assetRoot, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  it("planInstall enumerates only .md commands (namespaced) + agents", () => {
    const dir = join(home, ".claude");
    const plan = planInstall(CC, dir, assetRoot);
    const tos = plan.ops.map((o) => o.to);
    expect(tos).toContain(join(dir, "commands", "stz-f", "pipeline.md"));
    expect(tos).toContain(join(dir, "commands", "stz-f", "run.md"));
    expect(tos).toContain(join(dir, "agents", "stz-judge.md"));
    expect(tos.some((t) => t.includes("notmd.txt"))).toBe(false); // non-md skipped
  });

  it("applyInstall copies files + writes a manifest; dry-run writes nothing", () => {
    const dir = join(home, ".claude");
    const plan = planInstall(CC, dir, assetRoot);

    // dry-run: nothing on disk
    const dry = applyInstall(plan, { dryRun: true });
    expect(dry.written.length).toBe(3);
    expect(existsSync(join(dir, "commands", "stz-f", "pipeline.md"))).toBe(false);

    // real apply
    const res = applyInstall(plan);
    expect(existsSync(join(dir, "commands", "stz-f", "pipeline.md"))).toBe(true);
    expect(existsSync(join(dir, "agents", "stz-judge.md"))).toBe(true);
    const manifest = JSON.parse(readFileSync(res.manifestPath, "utf8"));
    expect(manifest.files).toHaveLength(3);
    expect(manifest.runtime).toBe("claude-code");
  });

  it("resolves a user-chosen --config-dir and installs there", () => {
    const custom = join(home, "elsewhere", "cfg");
    const dir = resolveConfigDir(CC, { home, configDir: custom });
    applyInstall(planInstall(CC, dir, assetRoot));
    expect(existsSync(join(custom, "commands", "stz-f", "run.md"))).toBe(true);
  });

  it("uninstall removes exactly the manifest files + prunes the empty namespace", () => {
    const dir = join(home, ".claude");
    applyInstall(planInstall(CC, dir, assetRoot));
    // a sibling user command must survive uninstall
    mkdirSync(join(dir, "commands"), { recursive: true });
    writeFileSync(join(dir, "commands", "my-own.md"), "# mine\n");

    const res = uninstall(dir);
    expect(res.removed.length).toBe(3);
    expect(existsSync(join(dir, "commands", "stz-f"))).toBe(false); // namespace pruned
    expect(existsSync(join(dir, "commands", "my-own.md"))).toBe(true); // untouched
    expect(existsSync(res.manifestPath)).toBe(false);
    // idempotent: second uninstall is a no-op
    expect(uninstall(dir).removed).toEqual([]);
  });
});
