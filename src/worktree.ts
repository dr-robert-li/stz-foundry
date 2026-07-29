/**
 * Per-specimen git worktree isolation — the only place in `src/` that shells to git.
 *
 * Specimens now EDIT a shared repo (brownfield, v1.12.0), so N specimens need N
 * checkouts. `git worktree` provides that, but `git worktree add` materializes
 * EVERY tracked path — including `.stz/30-tests/held-out/`, the sealed answer
 * key — which hands each specimen an unsealed, unhashed copy that
 * `verifySeal(root)` cannot see. So the create sequence is load-bearing:
 *
 *   add --no-checkout --detach → sparse-checkout '/*' '!/.stz/' → checkout
 *
 * If the firewall step fails for any reason the partial worktree is rolled back
 * and the caller gets directory isolation — never an un-firewalled worktree.
 *
 * `--detach` (not a branch) because a worktree's auto-created branch survives
 * `worktree remove`, so a branch would grow a second teardown step that can fail
 * independently, for zero benefit.
 *
 * ponytail: one `git` process per operation, no batching and no caching. Fine at
 * N≤16 specimens per round; batch the per-worktree calls if a round ever spawns
 * hundreds.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { assertSafePathSegment, stzPath } from "./taxonomy.js";

export type WorktreeMode = "worktree" | "directory";

export interface WorktreeHandle {
  mode: WorktreeMode;
  /** Where the specimen must write. Usable regardless of `mode`. */
  path: string;
  name: string;
  /** Why the fallback happened; `null` on the worktree path. */
  reason: string | null;
}

export interface WorktreeEntry {
  path: string;
  head: string | null;
  detached: boolean;
  /** git's own staleness reason from `list --porcelain`, or `null` if live. */
  prunable: string | null;
}

// ── module-level reporting (mirrors lastIsolation() in src/sandbox.ts) ──────

let lastMode: WorktreeMode = "directory";
let lastReason: string | null = null;

/** The isolation the most recent `createWorktree` actually used (audit input). */
export function lastWorktreeMode(): WorktreeMode {
  return lastMode;
}

/** Why the last create degraded, or `null` if it did not. */
export function lastWorktreeReason(): string | null {
  return lastReason;
}

/** Reset the reporting accessors (tests only). */
export function _resetWorktreeState(): void {
  lastMode = "directory";
  lastReason = null;
}

// ── git invocation ─────────────────────────────────────────────────────────

interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

/** Invoke git with an argv ARRAY — no shell, so no injection surface. */
function git(argv: string[], cwd: string, env?: NodeJS.ProcessEnv): GitResult {
  try {
    const stdout = execFileSync("git", argv, {
      cwd,
      encoding: "utf8",
      env: env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, stdout, stderr: "" };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, stdout: err.stdout ?? "", stderr: String(err.stderr ?? err.message ?? "") };
  }
}

function mustGit(argv: string[], cwd: string, env?: NodeJS.ProcessEnv): string {
  const r = git(argv, cwd, env);
  if (!r.ok) throw new Error(firstLine(r.stderr) || `git ${argv[0]} failed`);
  return r.stdout;
}

function firstLine(s: string): string {
  return (s.split("\n").find((l) => l.trim() !== "") ?? "").trim();
}

// ── paths ──────────────────────────────────────────────────────────────────

/** Symlinked temp roots (macOS `/var` → `/private/var`) break prefix matching. */
function realOrResolve(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

function isInside(child: string, parent: string): boolean {
  const c = resolve(child);
  const p = resolve(parent);
  return c === p || c.startsWith(p + sep);
}

/** Where this slice's specimen worktrees live: `.stz/40-slices/<slice>/worktrees/`. */
export function worktreeRootPath(root: string, slice: string): string {
  assertSafePathSegment(slice, "slice id");
  return stzPath(root, join("40-slices", slice, "worktrees"));
}

/** One specimen's worktree path. Both segments are allowlisted before the join. */
export function worktreePathFor(root: string, slice: string, name: string): string {
  assertSafePathSegment(name, "worktree name");
  return join(worktreeRootPath(root, slice), name);
}

// ── create ─────────────────────────────────────────────────────────────────

let snapshotCounter = 0;

/**
 * Base commit for the worktree. A clean tree just uses HEAD; a dirty one gets a
 * non-destructive snapshot, because STZ never commits — on a multi-slice
 * brownfield run HEAD does not contain slice-01's merged winner, so a
 * HEAD-based worktree would hand slice-02's specimens a stale tree.
 *
 * The snapshot writes through a throwaway `GIT_INDEX_FILE`, so it mutates
 * nothing: not the real index, not `git status`, not the stash list, not a ref.
 * The resulting commit is dangling — a GC root only while a worktree HEAD points
 * at it, collectable after teardown.
 */
function snapshotBase(target: string): string {
  if (mustGit(["status", "--porcelain"], target).trim() === "") return "HEAD";
  const idx = join(tmpdir(), `stz-idx-${process.pid}-${snapshotCounter++}`);
  try {
    const env = { ...process.env, GIT_INDEX_FILE: idx };
    mustGit(["add", "-A"], target, env);
    const tree = mustGit(["write-tree"], target, env).trim();
    // No temp index here — commit-tree only needs the tree. gpgsign off so a
    // signing repo cannot block on a passphrase prompt.
    return mustGit(
      ["-c", "commit.gpgsign=false", "commit-tree", tree, "-p", "HEAD", "-m", "stz: specimen worktree base"],
      target,
    ).trim();
  } finally {
    rmSync(idx, { force: true });
  }
}

/**
 * Keep the worktree root out of the target's `git status` — otherwise diff
 * attribution is polluted and the snapshot's `git add -A` sweeps the worktrees
 * in. `.git/info/exclude` is repo-local and uncommitted; the user's committed
 * `.gitignore` is never touched.
 */
function ensureExcluded(target: string, wtRoot: string): void {
  const rel = relative(realOrResolve(target), wtRoot).split(sep).join("/");
  if (rel === "" || rel.startsWith("..")) return; // root outside the repo — nothing to exclude
  const common = git(["rev-parse", "--git-common-dir"], target).stdout.trim() || ".git";
  const infoDir = resolve(target, common, "info");
  const file = join(infoDir, "exclude");
  const line = `/${rel}/`;
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (current.split("\n").includes(line)) return; // grep-before-append: idempotent
  mkdirSync(infoDir, { recursive: true });
  const prefix = current === "" || current.endsWith("\n") ? current : `${current}\n`;
  writeFileSync(file, `${prefix}${line}\n`, "utf8");
}

/**
 * Create one firewalled, detached worktree for a specimen.
 *
 * Never throws. `fallbackDir` is required so callers never branch on mode: any
 * failure — no git, no repo, unborn HEAD, submodules, a failed step — returns
 * `{mode:"directory", path: fallbackDir, reason}` with the directory created.
 */
export function createWorktree(opts: {
  target: string;
  root: string;
  slice: string;
  name: string;
  fallbackDir: string;
}): WorktreeHandle {
  const { target, root, slice, name, fallbackDir } = opts;
  let wtPath = "";
  try {
    const rootDir = worktreePathFor(root, slice, name); // guards BOTH segments
    mkdirSync(join(rootDir, ".."), { recursive: true });
    const realRoot = realOrResolve(join(rootDir, ".."));
    wtPath = join(realRoot, name);
    // Belt on the allowlist: the delete target must be inside the slice's root.
    if (!isInside(wtPath, realRoot) || wtPath === realRoot) {
      throw new Error(`worktree path ${JSON.stringify(wtPath)} escapes ${JSON.stringify(realRoot)}`);
    }

    // 1. exclusion BEFORE any `git add -A` can sweep the worktree dirs in.
    ensureExcluded(target, realRoot);
    // 2. two different prior-run failures, two different fixes, both every time:
    //    a stale admin entry (prune) and a leftover directory (rmSync).
    git(["worktree", "prune"], target);
    rmSync(wtPath, { recursive: true, force: true });
    // 3. base commit — the current working tree, not just HEAD.
    const base = snapshotBase(target);
    // 4. register without materializing anything yet.
    mustGit(["worktree", "add", "--no-checkout", "--detach", wtPath, base], target);
    // 5. THE SEALED-SUITE FIREWALL. Per-worktree scoped: git auto-sets
    //    extensions.worktreeConfig, so the main worktree keeps its `.stz`.
    mustGit(["-C", wtPath, "sparse-checkout", "set", "--no-cone", "/*", "!/.stz/"], target);
    // 6. only now do files hit disk — and `.stz/` is not among them.
    mustGit(["-C", wtPath, "checkout"], target);

    return report({ mode: "worktree", path: wtPath, name, reason: null });
  } catch (e) {
    if (wtPath) {
      git(["worktree", "remove", "--force", "--force", wtPath], target);
      rmSync(wtPath, { recursive: true, force: true });
      git(["worktree", "prune"], target);
    }
    return fallback(fallbackDir, name, firstLine(String((e as Error).message ?? e)));
  }
}

function fallback(dir: string, name: string, reason: string): WorktreeHandle {
  mkdirSync(dir, { recursive: true });
  return report({ mode: "directory", path: dir, name, reason: reason || "worktree unavailable" });
}

function report(h: WorktreeHandle): WorktreeHandle {
  lastMode = h.mode;
  lastReason = h.reason;
  return h;
}

// ── list / destroy ─────────────────────────────────────────────────────────

/**
 * The slice's live worktrees, as git sees them. git already computes staleness
 * (`prunable <reason>`), so orphan detection is never hand-rolled from the
 * filesystem — which cannot tell "torn down" from "crashed mid-add" apart.
 */
export function listWorktrees(target: string, root: string, slice: string): WorktreeEntry[] {
  const base = realOrResolve(worktreeRootPath(root, slice));
  const out = git(["worktree", "list", "--porcelain"], target);
  if (!out.ok) return [];
  const entries: WorktreeEntry[] = [];
  let cur: WorktreeEntry | null = null;
  for (const line of out.stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (cur) entries.push(cur);
      cur = { path: line.slice("worktree ".length).trim(), head: null, detached: false, prunable: null };
    } else if (!cur) {
      continue;
    } else if (line.startsWith("HEAD ")) {
      cur.head = line.slice("HEAD ".length).trim();
    } else if (line.trim() === "detached") {
      cur.detached = true;
    } else if (line.startsWith("prunable")) {
      cur.prunable = line.slice("prunable".length).trim() || "prunable";
    }
  }
  if (cur) entries.push(cur);
  return entries.filter((e) => isInside(e.path, base));
}

/**
 * Remove every worktree for a slice. Idempotent and never throws — teardown has
 * to hold under the same posture that already tolerates a killed specimen
 * without aborting the round.
 */
export function destroyWorktrees(
  target: string,
  root: string,
  slice: string,
): { removed: string[]; pruned: boolean } {
  const removed: string[] = [];
  let base: string;
  try {
    base = realOrResolve(worktreeRootPath(root, slice));
  } catch {
    return { removed, pruned: false }; // unsafe slice id — nothing to touch
  }
  for (const e of listWorktrees(target, root, slice)) {
    // --force twice: a specimen worktree is ALWAYS dirty, and a locked one needs
    // the second. Exit 128 "is not a working tree" is what the idempotent second
    // call returns — that is SUCCESS, not failure.
    const r = git(["worktree", "remove", "--force", "--force", e.path], target);
    if (r.ok || /is not a working tree/.test(r.stderr)) removed.push(e.path);
    // Belt for a partially-added worktree, and only inside the slice's root.
    if (isInside(e.path, base)) rmSync(e.path, { recursive: true, force: true });
  }
  git(["worktree", "prune"], target);
  return { removed, pruned: true };
}
