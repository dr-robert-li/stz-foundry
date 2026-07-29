import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  createWorktree,
  destroyWorktrees,
  lastWorktreeMode,
  lastWorktreeReason,
  _resetWorktreeState,
} from "../src/worktree.js";

/**
 * The sealed held-out suite is tracked in an STZ target repo, so a naive
 * `git worktree add` hands every specimen an unsealed copy of the answer key.
 * These tests assert the firewall (sparse-checkout excluding `/.stz/`) holds,
 * that N specimens edit the same tracked file without colliding, that teardown
 * leaves the operator's repo exactly as found, and that every failure degrades
 * to directory isolation instead of throwing.
 *
 * When `git` is absent the worktree assertions are replaced by the fallback
 * assertion rather than skipped — that path is REQ-05 and must hold everywhere.
 */

const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };

const g = (cwd: string, ...a: string[]): string =>
  execFileSync("git", a, { cwd, env: GIT_ENV, encoding: "utf8" });

const hasGit = ((): boolean => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const dirs: string[] = [];

function tempDir(tag = "stz-wt-"): string {
  // realpath: macOS hands back /var/... for a /private/var/... temp dir, and the
  // containment assertions compare resolved paths.
  const d = realpathSync(mkdtempSync(join(tmpdir(), tag)));
  dirs.push(d);
  return d;
}

function makeRepo(files: Record<string, string>): string {
  const d = tempDir();
  g(d, "-c", "init.defaultBranch=main", "init", "-q", ".");
  g(d, "config", "user.email", "t@t");
  g(d, "config", "user.name", "t");
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(d, p)), { recursive: true });
    writeFileSync(join(d, p), c, "utf8");
  }
  g(d, "add", "-A");
  g(d, "-c", "commit.gpgsign=false", "commit", "-qm", "init");
  return d;
}

const SEALED = ".stz/30-tests/held-out/suite.mjs";
const REPO = { [SEALED]: "export const answer = 42;\n", "src/a.ts": "export const a = 1;\n" };

function create(target: string, name: string) {
  return createWorktree({
    target,
    root: target,
    slice: "slice-01",
    name,
    fallbackDir: join(target, "fallback", name),
  });
}

/** REQ-05: with no git (or no repo) the caller still gets a usable directory. */
function expectDirectoryFallback(): void {
  const d = tempDir("stz-wt-nogit-");
  const h = createWorktree({
    target: d,
    root: d,
    slice: "slice-01",
    name: "s0",
    fallbackDir: join(d, "fb"),
  });
  expect(h.mode).toBe("directory");
  expect(existsSync(h.path)).toBe(true);
}

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe("specimen worktrees", () => {
  beforeEach(() => _resetWorktreeState());

  it("sealed suite not exposed to the specimen", () => {
    if (!hasGit) return expectDirectoryFallback();
    const target = makeRepo(REPO);
    const h = create(target, "s0");

    expect(h.mode).toBe("worktree");
    expect(existsSync(join(h.path, ".stz"))).toBe(false);
    expect(existsSync(join(h.path, "src/a.ts"))).toBe(true);
  });

  it("teardown removes the worktree and leaves the target repo clean", () => {
    if (!hasGit) return expectDirectoryFallback();
    const target = makeRepo(REPO);
    const h = create(target, "s0");
    expect(h.mode).toBe("worktree");

    const res = destroyWorktrees(target, target, "slice-01");

    expect(res.removed).toHaveLength(1);
    expect(existsSync(h.path)).toBe(false);
    expect(
      g(target, "worktree", "list", "--porcelain")
        .split("\n")
        .filter((l) => l.startsWith("worktree ")),
    ).toHaveLength(1);
    expect(g(target, "status", "--porcelain").trim()).toBe("");
  });

  it("tracer: a specimen edits its worktree, the main tree is untouched, teardown is clean", () => {
    if (!hasGit) return expectDirectoryFallback();
    const target = makeRepo(REPO);
    const h = create(target, "s0");
    expect(h.mode).toBe("worktree");

    writeFileSync(join(h.path, "src/a.ts"), "export const a = 2;\n", "utf8");

    expect(g(h.path, "diff", "--name-only").trim().split("\n")).toEqual(["src/a.ts"]);
    expect(readFileSync(join(target, "src/a.ts"), "utf8")).toBe("export const a = 1;\n");

    destroyWorktrees(target, target, "slice-01");
    expect(g(target, "status", "--porcelain").trim()).toBe("");
  });

  it("snapshot base mutates nothing the operator owns", () => {
    if (!hasGit) return expectDirectoryFallback();
    const target = makeRepo({ ...REPO, "src/b.ts": "export const b = 1;\n" });

    // Dirty BOTH ways: the worktree differs from the index (untracked new file)
    // AND the index differs from HEAD (staged modification). The temp-index
    // snapshot touches both, so one alone would not exercise it.
    writeFileSync(join(target, "src/new.ts"), "export const n = 42;\n", "utf8");
    writeFileSync(join(target, "src/b.ts"), "export const b = 2;\n", "utf8");
    g(target, "add", "src/b.ts");

    const before = {
      status: g(target, "status", "--porcelain"),
      index: g(target, "ls-files", "-s"),
      stash: g(target, "stash", "list"),
      refs: g(target, "for-each-ref"),
    };
    expect(before.status.trim()).not.toBe("");

    const h = create(target, "s0");
    expect(h.mode).toBe("worktree");

    // "mutates nothing" in executable form.
    expect(g(target, "status", "--porcelain")).toBe(before.status);
    expect(g(target, "ls-files", "-s")).toBe(before.index);
    expect(g(target, "stash", "list")).toBe(before.stash);
    expect(g(target, "for-each-ref")).toBe(before.refs);

    // …and the snapshot was actually USED. Without this the test passes against
    // an implementation that silently degraded to HEAD (Pitfall 1).
    expect(readFileSync(join(h.path, "src/new.ts"), "utf8")).toBe("export const n = 42;\n");
    expect(readFileSync(join(h.path, "src/b.ts"), "utf8")).toBe("export const b = 2;\n");

    destroyWorktrees(target, target, "slice-01");
    expect(g(target, "status", "--porcelain")).toBe(before.status);
  });

  it("isolation: three worktrees edit the same tracked file without colliding", () => {
    if (!hasGit) return expectDirectoryFallback();
    const target = makeRepo(REPO);
    const handles = ["s0", "s1", "s2"].map((n) => create(target, n));
    for (const h of handles) expect(h.mode).toBe("worktree");

    // Write the way a specimen would — straight to disk, no STZ API. The point
    // is git's per-worktree index (`.git/worktrees/<n>/index`) making three
    // concurrent editors collision-free.
    handles.forEach((h, i) =>
      writeFileSync(join(h.path, "src/a.ts"), `export const a = ${i + 10};\n`, "utf8"),
    );

    handles.forEach((h, i) => {
      expect(g(h.path, "diff", "--name-only").trim().split("\n")).toEqual(["src/a.ts"]);
      expect(readFileSync(join(h.path, "src/a.ts"), "utf8")).toBe(`export const a = ${i + 10};\n`);
    });
    expect(readFileSync(join(target, "src/a.ts"), "utf8")).toBe(REPO["src/a.ts"]);
    expect(g(target, "status", "--porcelain").trim()).toBe("");

    destroyWorktrees(target, target, "slice-01");
  });

  it("no branches: the branch set is identical before creates and after teardown", () => {
    if (!hasGit) return expectDirectoryFallback();
    const target = makeRepo(REPO);
    const before = g(target, "branch", "--list");

    for (const n of ["s0", "s1", "s2"]) expect(create(target, n).mode).toBe("worktree");
    destroyWorktrees(target, target, "slice-01");

    // Detached HEAD means no branch was ever created, so REQ-03's "branches
    // pruned" clause is vacuously true — and directly assertable.
    expect(g(target, "branch", "--list")).toBe(before);
  });

  it("naive worktree add exposes the sealed suite", () => {
    if (!hasGit) return expectDirectoryFallback();
    const target = makeRepo(REPO);
    const naive = join(tempDir("stz-wt-naive-"), "leak");

    // DELIBERATE NEGATIVE CONTROL — the unmitigated path, asserting the THREAT
    // rather than our code. It must NOT be copied into src/: it is here so the
    // suite fails loudly if a future refactor drops the sparse-checkout firewall
    // or git changes checkout semantics.
    g(target, "worktree", "add", naive, "HEAD");
    try {
      expect(existsSync(join(naive, SEALED))).toBe(true);
    } finally {
      g(target, "worktree", "remove", "--force", "--force", naive);
    }
  });

  it("reports which isolation actually ran", () => {
    if (!hasGit) return expectDirectoryFallback();
    const target = makeRepo(REPO);
    create(target, "s0");

    expect(lastWorktreeMode()).toBe("worktree");
    expect(lastWorktreeReason()).toBeNull();
  });

  // These three need no git repo at all — that is the point of REQ-05, so they
  // run and pass whether or not git is installed.
  it("fallback: not a git repository", () => {
    const d = tempDir("stz-wt-plain-");
    const h = createWorktree({
      target: d,
      root: d,
      slice: "slice-01",
      name: "s0",
      fallbackDir: join(d, "fb"),
    });

    expect(h.mode).toBe("directory");
    expect(existsSync(h.path)).toBe(true); // usable — the caller never branches
    expect(h.reason).toBeTruthy();
    if (hasGit) expect(h.reason).toMatch(/not a git repository/i);
  });

  it("fallback: unborn HEAD", () => {
    if (!hasGit) return expectDirectoryFallback();
    const d = tempDir("stz-wt-unborn-");
    g(d, "-c", "init.defaultBranch=main", "init", "-q", ".");

    const h = createWorktree({
      target: d,
      root: d,
      slice: "slice-01",
      name: "s0",
      fallbackDir: join(d, "fb"),
    });

    expect(h.mode).toBe("directory");
    expect(h.reason).toMatch(/unborn HEAD/i);
    expect(existsSync(h.path)).toBe(true);
  });

  it("fallback reported: the degrade is never silent", () => {
    const plain = tempDir("stz-wt-report-");
    createWorktree({
      target: plain,
      root: plain,
      slice: "slice-01",
      name: "s0",
      fallbackDir: join(plain, "fb"),
    });
    expect(lastWorktreeMode()).toBe("directory");
    expect(lastWorktreeReason()).toBeTruthy();

    _resetWorktreeState();
    expect(lastWorktreeMode()).toBe("directory");
    expect(lastWorktreeReason()).toBeNull();

    if (!hasGit) return;
    create(makeRepo(REPO), "s0");
    expect(lastWorktreeMode()).toBe("worktree");
    expect(lastWorktreeReason()).toBeNull();
  });

  it("idempotent: destroyWorktrees is safe to call twice", () => {
    if (!hasGit) return expectDirectoryFallback();
    const target = makeRepo(REPO);
    for (const n of ["s0", "s1"]) expect(create(target, n).mode).toBe("worktree");

    expect(destroyWorktrees(target, target, "slice-01").removed).toHaveLength(2);
    // The second call is exactly the exit-128 "is not a working tree" case.
    expect(destroyWorktrees(target, target, "slice-01")).toEqual({ removed: [], pruned: true });
  });

  it("reconcile orphan: a crashed worktree is reclaimed by the next create", () => {
    if (!hasGit) return expectDirectoryFallback();
    const target = makeRepo(REPO);
    const h = create(target, "s0");
    expect(h.mode).toBe("worktree");

    rmSync(h.path, { recursive: true, force: true }); // crash: dir gone, admin entry stays
    expect(g(target, "worktree", "list", "--porcelain")).toMatch(/prunable/);

    const again = create(target, "s0");

    expect(again.mode).toBe("worktree");
    expect(g(target, "worktree", "list", "--porcelain")).not.toMatch(/prunable/);
    destroyWorktrees(target, target, "slice-01");
  });
});
