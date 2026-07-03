/**
 * Unified user-selects installer (ROADMAP §7).
 *
 * `npm i -g stz-foundry` is the ONE installation interface: `stz install`
 * registers STZ's `/stz-f:*` commands and agents into any supported agent
 * harness, at a location the user chooses — the gsd-core `runtime-homes` model.
 *
 * No hardcoded path. A runtime → config-home registry resolves each host's
 * target from a descriptor kind (`dot-home` ~/.claude, `xdg` ~/.config/<name>),
 * and the user overrides the default, most-specific first:
 *   1. `--config-dir <path>`  (+ `--project` scope → <projectRoot>/.claude)
 *   2. a per-runtime env var (STZ_CONFIG_DIR, or the host's own)
 *   3. the registry default for that runtime
 *
 * Every write is recorded in a manifest under the target so `uninstall`/`update`
 * touch exactly the same files; `--dry-run` prints the plan and writes nothing.
 * Idempotent and reversible by construction.
 */
import { readdirSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { STZ_VERSION } from "./version.js";

export type DescriptorKind = "dot-home" | "xdg";

export interface RuntimeDescriptor {
  name: string;
  displayName: string;
  kind: DescriptorKind;
  /** dot-home: dirname under $HOME (".claude"); xdg: subdir under config home. */
  home: string;
  /** Per-runtime env override for the config dir (highest env precedence). */
  envVar?: string;
  /** Where STZ commands land under the config dir (subdir → command namespace). */
  commandsSubdir: string;
  /** Where STZ agents land under the config dir. */
  agentsSubdir: string;
  /** true = assets are applied; false = detected + reported, adapter pending. */
  supported: boolean;
}

/** The runtime registry — the single source of truth for install targets. */
export const RUNTIMES: RuntimeDescriptor[] = [
  {
    name: "claude-code",
    displayName: "Claude Code",
    kind: "dot-home",
    home: ".claude",
    envVar: "CLAUDE_CONFIG_DIR",
    commandsSubdir: join("commands", "stz-f"),
    agentsSubdir: "agents",
    supported: true,
  },
  // Detected + reported today; asset adapters land with the runtime work (§
  // "Additional agentic-coding runtimes"). Listed so `--all` and detection are
  // honest about what exists on the host.
  { name: "codex", displayName: "OpenAI Codex CLI", kind: "dot-home", home: ".codex", commandsSubdir: join("commands", "stz-f"), agentsSubdir: "agents", supported: false },
  { name: "opencode", displayName: "OpenCode", kind: "xdg", home: "opencode", commandsSubdir: join("commands", "stz-f"), agentsSubdir: "agents", supported: false },
  { name: "pi", displayName: "Pi", kind: "dot-home", home: ".pi", commandsSubdir: join("commands", "stz-f"), agentsSubdir: "agents", supported: false },
];

export function runtimeByName(name: string): RuntimeDescriptor | undefined {
  return RUNTIMES.find((r) => r.name === name);
}

/** Expand a leading ~ to the home directory. */
export function expandTilde(p: string, home: string): string {
  if (p === "~") return home;
  if (p.startsWith("~/")) return join(home, p.slice(2));
  return p;
}

export interface ResolveOpts {
  home: string;
  env?: NodeJS.ProcessEnv;
  /** --config-dir: an explicit target (wins over everything). */
  configDir?: string;
  /** --project scope: install into <projectRoot>/<home> instead of the home dir. */
  scope?: "global" | "project";
  projectRoot?: string;
}

/** The runtime's DEFAULT config dir (no user overrides) — used for detection. */
export function defaultConfigDir(rt: RuntimeDescriptor, home: string, env: NodeJS.ProcessEnv = {}): string {
  if (rt.kind === "xdg") {
    const base = env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.trim() ? env.XDG_CONFIG_HOME : join(home, ".config");
    return join(base, rt.home);
  }
  return join(home, rt.home); // dot-home
}

/**
 * Resolve the install target for a runtime under the user's overrides, most
 * specific first: `--config-dir` → `--project` scope → env (STZ_CONFIG_DIR, then
 * the runtime's own env var) → the registry default.
 */
export function resolveConfigDir(rt: RuntimeDescriptor, o: ResolveOpts): string {
  const env = o.env ?? {};
  if (o.configDir) return expandTilde(o.configDir, o.home);
  if (o.scope === "project") return join(o.projectRoot ?? process.cwd(), rt.home);
  if (env.STZ_CONFIG_DIR && env.STZ_CONFIG_DIR.trim()) return expandTilde(env.STZ_CONFIG_DIR, o.home);
  if (rt.envVar && env[rt.envVar] && env[rt.envVar]!.trim()) return expandTilde(env[rt.envVar]!, o.home);
  return defaultConfigDir(rt, o.home, env);
}

/** Runtimes whose DEFAULT config dir exists on this host (best-effort detection). */
export function detectRuntimes(home: string, env: NodeJS.ProcessEnv = {}): RuntimeDescriptor[] {
  return RUNTIMES.filter((rt) => existsSync(defaultConfigDir(rt, home, env)));
}

export interface FileOp {
  from: string;
  to: string;
}
export interface InstallPlan {
  runtime: string;
  configDir: string;
  supported: boolean;
  ops: FileOp[];
  manifestPath: string;
}

const MANIFEST_REL = join(".stz-install", "manifest.json");
const listMd = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).sort() : [];

/**
 * Compute the file operations to install STZ's command + agent surface into
 * `configDir`. Pure — no writes — so `--dry-run` and the apply path share it.
 * `assetRoot` is the package root that ships `commands/` and `agents/`.
 */
export function planInstall(rt: RuntimeDescriptor, configDir: string, assetRoot: string): InstallPlan {
  const ops: FileOp[] = [];
  const cmdSrc = join(assetRoot, "commands");
  for (const f of listMd(cmdSrc)) ops.push({ from: join(cmdSrc, f), to: join(configDir, rt.commandsSubdir, f) });
  const agentSrc = join(assetRoot, "agents");
  for (const f of listMd(agentSrc)) ops.push({ from: join(agentSrc, f), to: join(configDir, rt.agentsSubdir, f) });
  return { runtime: rt.name, configDir, supported: rt.supported, ops, manifestPath: join(configDir, MANIFEST_REL) };
}

export interface ApplyResult {
  runtime: string;
  configDir: string;
  written: string[];
  dryRun: boolean;
  manifestPath: string;
}

/** Execute a plan. `dryRun` writes nothing. Records a manifest for uninstall/update. */
export function applyInstall(plan: InstallPlan, opts: { dryRun?: boolean } = {}): ApplyResult {
  const written: string[] = [];
  if (!opts.dryRun) {
    for (const op of plan.ops) {
      mkdirSync(join(op.to, ".."), { recursive: true });
      copyFileSync(op.from, op.to);
      written.push(op.to);
    }
    mkdirSync(join(plan.manifestPath, ".."), { recursive: true });
    writeFileSync(
      plan.manifestPath,
      JSON.stringify({ version: STZ_VERSION, runtime: plan.runtime, files: written }, null, 2) + "\n",
      "utf8",
    );
  } else {
    for (const op of plan.ops) written.push(op.to);
  }
  return { runtime: plan.runtime, configDir: plan.configDir, written, dryRun: !!opts.dryRun, manifestPath: plan.manifestPath };
}

export interface UninstallResult {
  removed: string[];
  manifestPath: string;
}

/**
 * Reverse an install: read the manifest and remove exactly the files it wrote
 * (plus the now-empty stz-f command namespace dir), then the manifest itself.
 */
export function uninstall(configDir: string): UninstallResult {
  const manifestPath = join(configDir, MANIFEST_REL);
  if (!existsSync(manifestPath)) return { removed: [], manifestPath };
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { files: string[] };
  const removed: string[] = [];
  for (const f of manifest.files ?? []) {
    if (existsSync(f)) {
      rmSync(f, { force: true });
      removed.push(f);
    }
  }
  // Prune the stz-f command namespace dir if we emptied it.
  const nsDir = join(configDir, "commands", "stz-f");
  if (existsSync(nsDir) && readdirSync(nsDir).length === 0) rmSync(nsDir, { recursive: true, force: true });
  rmSync(manifestPath, { force: true });
  const installDir = join(configDir, ".stz-install");
  if (existsSync(installDir) && readdirSync(installDir).length === 0) rmSync(installDir, { recursive: true, force: true });
  return { removed, manifestPath };
}

/** Which runtimes a `--harness`/`--all` selection resolves to. */
export function selectRuntimes(sel: { harness?: string; all?: boolean }): RuntimeDescriptor[] {
  if (sel.all) return RUNTIMES.filter((r) => r.supported);
  if (sel.harness) {
    const rt = runtimeByName(sel.harness);
    return rt ? [rt] : [];
  }
  return [runtimeByName("claude-code")!]; // default
}
