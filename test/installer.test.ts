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
    mkdirSync(join(assetRoot, "hooks"), { recursive: true });
    writeFileSync(join(assetRoot, "hooks", "session-start.sh"), "#!/bin/bash\n");
    writeFileSync(join(assetRoot, "hooks", "held-out-guard.mjs"), "// guard\n");
    writeFileSync(join(assetRoot, "hooks", "hooks.json"), "{}\n"); // plugin manifest — must be skipped
    home = mkdtempSync(join(tmpdir(), "stz-home-"));
  });
  afterEach(() => {
    rmSync(assetRoot, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  it("planInstall enumerates .md commands (namespaced) + agents + hook scripts", () => {
    const dir = join(home, ".claude");
    const plan = planInstall(CC, dir, assetRoot);
    const tos = plan.ops.map((o) => o.to);
    expect(tos).toContain(join(dir, "commands", "stz-f", "pipeline.md"));
    expect(tos).toContain(join(dir, "commands", "stz-f", "run.md"));
    expect(tos).toContain(join(dir, "agents", "stz-judge.md"));
    expect(tos).toContain(join(dir, "hooks", "stz-f", "session-start.sh"));
    expect(tos).toContain(join(dir, "hooks", "stz-f", "held-out-guard.mjs"));
    expect(tos.some((t) => t.includes("notmd.txt"))).toBe(false); // non-md skipped
    expect(tos.some((t) => t.includes("hooks.json"))).toBe(false); // plugin manifest skipped
    expect(plan.settingsPath).toBe(join(dir, "settings.json"));
  });

  it("applyInstall copies files + writes a manifest; dry-run writes nothing", () => {
    const dir = join(home, ".claude");
    const plan = planInstall(CC, dir, assetRoot);

    // dry-run: nothing on disk (settings untouched too)
    const dry = applyInstall(plan, { dryRun: true });
    expect(dry.written.length).toBe(5);
    expect(existsSync(join(dir, "commands", "stz-f", "pipeline.md"))).toBe(false);
    expect(existsSync(join(dir, "settings.json"))).toBe(false);

    // real apply
    const res = applyInstall(plan);
    expect(existsSync(join(dir, "commands", "stz-f", "pipeline.md"))).toBe(true);
    expect(existsSync(join(dir, "agents", "stz-judge.md"))).toBe(true);
    expect(existsSync(join(dir, "hooks", "stz-f", "held-out-guard.mjs"))).toBe(true);
    const manifest = JSON.parse(readFileSync(res.manifestPath, "utf8"));
    expect(manifest.files).toHaveLength(5);
    expect(manifest.runtime).toBe("claude-code");
    expect(manifest.settings).toBe(join(dir, "settings.json"));
  });

  it("registers both hooks in settings.json with resolved paths — idempotently, preserving user content", () => {
    const dir = join(home, ".claude");
    // Pre-existing user settings with their own hook must survive.
    mkdirSync(dir, { recursive: true });
    const userGroup = { matcher: "Bash", hooks: [{ type: "command", command: "echo mine" }] };
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ model: "opus", hooks: { PreToolUse: [userGroup] } }, null, 2));

    applyInstall(planInstall(CC, dir, assetRoot));
    const read = () => JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"));
    let s = read();
    expect(s.model).toBe("opus"); // untouched
    expect(s.hooks.PreToolUse).toHaveLength(2); // user's + STZ's
    expect(s.hooks.PreToolUse[0].hooks[0].command).toBe("echo mine");
    expect(s.hooks.PreToolUse[1].hooks[0].command).toContain(join(dir, "hooks", "stz-f", "held-out-guard.mjs"));
    expect(s.hooks.SessionStart[0].hooks[0].command).toContain(join(dir, "hooks", "stz-f", "session-start.sh"));

    // Re-install: no duplicates.
    applyInstall(planInstall(CC, dir, assetRoot));
    s = read();
    expect(s.hooks.PreToolUse).toHaveLength(2);
    expect(s.hooks.SessionStart).toHaveLength(1);
  });

  it("resolves a user-chosen --config-dir and installs there", () => {
    const custom = join(home, "elsewhere", "cfg");
    const dir = resolveConfigDir(CC, { home, configDir: custom });
    applyInstall(planInstall(CC, dir, assetRoot));
    expect(existsSync(join(custom, "commands", "stz-f", "run.md"))).toBe(true);
  });

  it("uninstall removes manifest files + hook registrations, prunes namespaces, keeps user content", () => {
    const dir = join(home, ".claude");
    mkdirSync(dir, { recursive: true });
    const userGroup = { matcher: "Bash", hooks: [{ type: "command", command: "echo mine" }] };
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ model: "opus", hooks: { PreToolUse: [userGroup] } }, null, 2));
    applyInstall(planInstall(CC, dir, assetRoot));
    // a sibling user command must survive uninstall
    mkdirSync(join(dir, "commands"), { recursive: true });
    writeFileSync(join(dir, "commands", "my-own.md"), "# mine\n");

    const res = uninstall(dir);
    expect(res.removed.length).toBe(5);
    expect(res.settingsCleaned).toBe(true);
    expect(existsSync(join(dir, "commands", "stz-f"))).toBe(false); // namespace pruned
    expect(existsSync(join(dir, "hooks", "stz-f"))).toBe(false); // hook namespace pruned
    expect(existsSync(join(dir, "commands", "my-own.md"))).toBe(true); // untouched
    expect(existsSync(res.manifestPath)).toBe(false);
    // settings: STZ entries gone, user's hook + settings intact
    const s = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"));
    expect(s.model).toBe("opus");
    expect(s.hooks.PreToolUse).toHaveLength(1);
    expect(s.hooks.PreToolUse[0].hooks[0].command).toBe("echo mine");
    expect(s.hooks.SessionStart).toBeUndefined(); // emptied event removed
    // idempotent: second uninstall is a no-op
    expect(uninstall(dir).removed).toEqual([]);
  });
});
