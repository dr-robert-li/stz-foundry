/**
 * Execution sandbox for model-generated code (the eval seam, F7/F11 hardening).
 *
 * Every place STZ runs code a model wrote — the sealed harness, the smoke/self
 * checks, mutants, cross-references — goes through ONE choke point:
 * `spawnSync("node", [script, arg])`. On a trusted workstation that is fine; for
 * hostile or prompt-injectable input it is arbitrary code with the runner's own
 * filesystem, network, and process table. `hack-detector.ts` is a heuristic
 * layer, not isolation. This module is the isolation.
 *
 * Layered, default-deny (the denylist-escape lesson: a `/proc/self/root/...`
 * bypass defeats any block-list, so we allow-list instead), no single layer
 * trusted:
 *
 *   Linux   — bwrap (unprivileged user namespaces): read-only host, tmpfs /tmp,
 *             the impl/suite dirs bound read-only, the coverage dir bound
 *             read-write, `--unshare-all` (no network, private pid/ipc/uts).
 *             Wrapped in `prlimit` (address-space / file-size / cpu) and a
 *             private pid namespace so a memory- or fork-bomb dies at the caps
 *             or the wall-clock timeout instead of taking the host.
 *   macOS   — sandbox-exec (Seatbelt): deny network + deny file-write outside
 *             the coverage dir. (Deprecated by Apple but functional; the same
 *             primitive Claude Code uses.)
 *   other   — node --permission (the Node permission model): blocks fs-write
 *             and child_process, but NOT network. A DEGRADED fallback — emits a
 *             loud audit warning and never runs silently as if isolated.
 *
 * The chosen level is probed once (bwrap/sandbox-exec must actually work — a
 * nested-namespace or entitlement failure downgrades cleanly) and exposed via
 * `lastIsolation()` so the audit trail records what actually ran, never a
 * silent fallback. `STZ_SANDBOX=bwrap|sandbox-exec|node-permission|none|auto`
 * overrides; `none` is the pre-sandbox behaviour and must be chosen explicitly.
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { realpathSync } from "node:fs";
import { platform } from "node:os";
import { resolve, dirname } from "node:path";

export type Isolation = "bwrap" | "sandbox-exec" | "node-permission" | "none";

export interface SandboxOptions {
  /** Absolute dirs the sandboxed node may READ (suite, impl, mutants). */
  readDirs: string[];
  /** Absolute dirs it may WRITE (coverage output). Empty for read-only runs. */
  writeDirs?: string[];
  env?: NodeJS.ProcessEnv;
  /** Wall-clock kill (ms). Also drives the cpu-time rlimit. */
  timeout?: number;
}

// Resource ceilings — per-PROCESS rlimits only. RLIMIT_NPROC is deliberately
// NOT set: it is enforced per real-uid SYSTEM-WIDE (not per sandbox), so on a
// busy/shared-uid host (e.g. a CI runner whose user already holds >N processes)
// any thread/fork the sandboxed node needs hits the cap and crashes it. A fork
// bomb is instead contained by the private pid namespace (--unshare-pid), the
// address-space cap (a fork bomb OOMs fast), and the wall-clock timeout that
// kills the whole --die-with-parent tree.
// ponytail: no nproc rlimit; add a cgroup pids.max if fork-bomb latency matters.
const RLIMIT_AS_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB address space
const RLIMIT_FSIZE_BYTES = 128 * 1024 * 1024; // 128 MiB max file
const CPU_SLACK_SEC = 5;

let cached: Isolation | null = null;
let warned = false;
/** The isolation the most recent spawn actually used (audit input). */
let last: Isolation = "none";

function envOverride(): Isolation | "auto" | null {
  const v = (process.env.STZ_SANDBOX ?? "").trim().toLowerCase();
  if (v === "") return null;
  if (v === "bwrap" || v === "sandbox-exec" || v === "node-permission" || v === "none" || v === "auto")
    return v as Isolation | "auto";
  return null; // unknown value → ignore, fall through to auto-detect
}

/** True iff `tool --help`/probe exits cleanly (the tool exists AND works here). */
function probe(tool: string, args: string[]): boolean {
  try {
    const r = spawnSync(tool, args, { timeout: 5000, stdio: "ignore" });
    return r.status === 0 && !r.error;
  } catch {
    return false;
  }
}

/**
 * Decide the isolation level for this host, once. bwrap/sandbox-exec are only
 * chosen if they actually execute (unprivileged userns can be disabled, or we
 * may already be inside a sandbox that forbids nesting) — otherwise we downgrade
 * to the node permission model rather than pretend.
 */
export function detectIsolation(): Isolation {
  const forced = envOverride();
  if (forced && forced !== "auto") return forced;
  if (cached) return cached;

  if (platform() === "linux") {
    // A trivial fully-unshared sandbox must run for real; nested namespaces or
    // a hardened kernel can make bwrap present-but-unusable.
    if (probe("bwrap", ["--ro-bind", "/", "/", "--unshare-all", "--die-with-parent", "/bin/true"])) {
      cached = "bwrap";
      return cached;
    }
  } else if (platform() === "darwin") {
    if (probe("sandbox-exec", ["-p", "(version 1)(allow default)", "/usr/bin/true"])) {
      cached = "sandbox-exec";
      return cached;
    }
  }
  // Node's own permission model is always available on a modern Node; it is the
  // portable floor. It does NOT isolate the network — hence the loud warning.
  cached = "node-permission";
  return cached;
}

/** What the last spawn used — record this in the audit trail per run. */
export function lastIsolation(): Isolation {
  return last;
}

/** Reset the cached probe (tests only). */
export function _resetSandboxCache(): void {
  cached = null;
  warned = false;
  last = "none";
}

function warnDegraded(iso: Isolation): void {
  if (iso === "node-permission" && !warned) {
    warned = true;
    process.stderr.write(
      "⚠️  STZ sandbox: no OS isolation (bwrap/sandbox-exec) available — falling back to the " +
        "Node permission model, which does NOT block network access. Model-generated code can " +
        "still reach the network. Do not run untrusted or prompt-injectable input unattended on " +
        "this host. Set STZ_SANDBOX=none to acknowledge and silence, or install bubblewrap.\n",
    );
  }
}

function cpuLimitSec(timeout?: number): number {
  return Math.ceil((timeout ?? 20_000) / 1000) + CPU_SLACK_SEC;
}

/** Build the bwrap+prlimit argv wrapping `node <nodeArgs>`. */
function bwrapArgv(nodeArgs: string[], opts: SandboxOptions): string[] {
  const reads = [...new Set(opts.readDirs.map((d) => resolve(d)))];
  const writes = [...new Set((opts.writeDirs ?? []).map((d) => resolve(d)))];
  const argv = [
    "--ro-bind", "/", "/", // read-only host (node runtime + libs); no host tamper
    "--dev", "/dev",
    "--proc", "/proc",
    "--tmpfs", "/tmp",
    "--unshare-all", // no network, private pid/ipc/uts/cgroup/user
    "--die-with-parent",
    "--new-session",
  ];
  for (const d of reads) argv.push("--ro-bind", d, d);
  for (const d of writes) argv.push("--bind", d, d); // rw, overrides the ro `/` above
  // prlimit runs inside the namespace and execs node with the caps applied.
  argv.push(
    "prlimit",
    `--as=${RLIMIT_AS_BYTES}`,
    `--fsize=${RLIMIT_FSIZE_BYTES}`,
    `--cpu=${cpuLimitSec(opts.timeout)}`,
    "node",
    ...nodeArgs,
  );
  return argv;
}

/** Seatbelt profile: allow all except network + file-write outside writeDirs. */
function seatbeltProfile(writes: string[]): string {
  // Seatbelt matches kernel-resolved paths: on macOS tmpdir() lives under the
  // /var → /private/var symlink, so subpaths must be realpath'd to ever match.
  const writeAllows = writes
    .map((d) => `(subpath "${realpathSync(resolve(d))}")`)
    .join(" ");
  return (
    "(version 1)(allow default)" +
    "(deny network*)" +
    "(deny file-write*)" +
    (writeAllows ? `(allow file-write* ${writeAllows}(subpath "/private/tmp")(subpath "/dev"))` : "")
  );
}

/**
 * The permission-model flag: stabilized as `--permission` in Node 23; on Node
 * 20–22 it is `--experimental-permission`. Passing the wrong one is a fatal
 * "bad option", so pick by the running major version.
 */
function permissionFlag(): string {
  const major = Number(process.versions.node.split(".")[0]);
  return major >= 23 ? "--permission" : "--experimental-permission";
}

/** node permission-model flags: read the read+write dirs, write only the write dirs. */
function permissionArgs(opts: SandboxOptions): string[] {
  const reads = [...new Set([...opts.readDirs, ...(opts.writeDirs ?? [])].map((d) => resolve(d)))];
  const writes = [...new Set((opts.writeDirs ?? []).map((d) => resolve(d)))];
  const flags = [permissionFlag()];
  for (const d of reads) flags.push(`--allow-fs-read=${d}`);
  for (const d of writes) flags.push(`--allow-fs-write=${d}`);
  return flags;
}

/**
 * Run `node <nodeArgs>` under the best available sandbox. Drop-in for
 * `spawnSync("node", nodeArgs, {...})`: same return shape, same `encoding:"utf8"`.
 * `nodeArgs[last]` is conventionally the impl path; all script/impl dirs must be
 * listed in `readDirs` (a path not allow-listed is unreadable inside the box).
 */
export function sandboxedNode(nodeArgs: string[], opts: SandboxOptions): SpawnSyncReturns<string> {
  const iso = detectIsolation();
  last = iso;
  const spawnOpts = { encoding: "utf8" as const, timeout: opts.timeout, env: opts.env ?? process.env };

  if (iso === "bwrap") {
    return spawnSync("bwrap", bwrapArgv(nodeArgs, opts), spawnOpts);
  }
  if (iso === "sandbox-exec") {
    return spawnSync(
      "sandbox-exec",
      ["-p", seatbeltProfile(opts.writeDirs ?? []), "node", ...nodeArgs],
      spawnOpts,
    );
  }
  if (iso === "node-permission") {
    warnDegraded(iso);
    return spawnSync("node", [...permissionArgs(opts), ...nodeArgs], spawnOpts);
  }
  // iso === "none": explicit opt-out, pre-sandbox behaviour.
  return spawnSync("node", nodeArgs, spawnOpts);
}

/** Convenience: the read dirs implied by a set of file paths (their parents). */
export function dirsOf(...paths: string[]): string[] {
  return [...new Set(paths.map((p) => dirname(resolve(p))))];
}
