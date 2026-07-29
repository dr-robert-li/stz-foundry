import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { runBridge } from "../src/bridge.js";

/**
 * The in-session half of per-specimen isolation. `commands/run.md` must never
 * compute a worktree path or decide when to fall back (CLAUDE.md architecture
 * rule / CONTEXT D2) — so the bridge owns all of it and prints one JSON object
 * per verb. These tests pin that JSON contract and the four terminal paths that
 * have to tear worktrees down.
 *
 * When `git` is absent the worktree-mode assertions become fallback assertions
 * rather than skips — the degrade is REQ-05 and must hold everywhere.
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

function tempDir(tag = "stz-bwt-"): string {
  const d = realpathSync(mkdtempSync(join(tmpdir(), tag)));
  dirs.push(d);
  return d;
}

const SEALED = ".stz/30-tests/held-out/suite.mjs";
const REPO_FILES = { [SEALED]: "export const answer = 42;\n", "src/a.ts": "export const a = 1;\n" };

function makeRepo(files: Record<string, string> = REPO_FILES): string {
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

/** How many worktrees git itself knows about (the main one always counts). */
function worktreeCount(repo: string): number {
  return g(repo, "worktree", "list", "--porcelain")
    .split("\n")
    .filter((l) => l.startsWith("worktree ")).length;
}

// ── stdout capture (same fixture shape as test/bridge.test.ts) ──────────────

let root: string;
let captured: string;
const origWrite = process.stdout.write.bind(process.stdout);

beforeEach(() => {
  root = tempDir("stz-bwt-root-");
  captured = "";
  process.exitCode = undefined;
  (process.stdout.write as unknown as (s: string) => boolean) = (s: string) => {
    captured += s;
    return true;
  };
});
afterEach(() => {
  process.stdout.write = origWrite;
  process.exitCode = undefined;
});
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function lastJSON<T>(): T {
  return JSON.parse(captured) as T;
}

interface CreateJSON {
  mode: "worktree" | "directory";
  path: string;
  name: string;
  reason: string | null;
  slice: string;
  specimen: string;
}

async function create(rootDir: string, target: string, specimen: string): Promise<CreateJSON> {
  captured = "";
  await runBridge([
    "worktree-create", "--root", rootDir, "--target", target,
    "--slice", "slice-01", "--specimen", specimen,
  ]);
  return lastJSON<CreateJSON>();
}

// ── task 1: the three sibling verbs ────────────────────────────────────────

describe("bridge worktree verbs — the JSON contract commands/run.md consumes", () => {
  it("worktree-create in a real repo returns a firewalled worktree", async () => {
    if (!hasGit) {
      const j = await create(root, tempDir("stz-bwt-nogit-"), "a");
      expect(j.mode).toBe("directory");
      return;
    }
    const repo = makeRepo();
    const j = await create(root, repo, "a");

    expect(j.mode).toBe("worktree");
    expect(j.path.endsWith(join("worktrees", "a"))).toBe(true);
    expect(j.name).toBe("a");
    expect(j.reason).toBeNull();
    expect(j.slice).toBe("slice-01");
    expect(j.specimen).toBe("a");
    // The sealed answer key never lands on disk inside a specimen worktree.
    expect(existsSync(join(j.path, ".stz"))).toBe(false);
    expect(existsSync(join(j.path, "src/a.ts"))).toBe(true);
  });

  it("worktree-create falls back to a directory and reports why (exit 0)", async () => {
    const notARepo = tempDir("stz-bwt-plain-");
    const j = await create(root, notARepo, "a");

    expect(j.mode).toBe("directory");
    expect(j.reason).toBeTruthy();
    expect(existsSync(j.path)).toBe(true);
    // A fallback is a normal outcome, not an error.
    expect(process.exitCode).not.toBe(1);
  });

  it("worktree-create rejects a path-traversal slice id", async () => {
    await expect(
      runBridge([
        "worktree-create", "--root", root, "--target", root,
        "--slice", "../../etc", "--specimen", "a",
      ]),
    ).rejects.toThrow(/path-traversal guard/);
    // .stz/40-slices/../../etc → <root>/etc: nothing may be created there.
    expect(existsSync(join(root, "etc"))).toBe(false);
  });

  it("worktree-create rejects a path-traversal specimen id", async () => {
    await expect(
      runBridge([
        "worktree-create", "--root", root, "--target", root,
        "--slice", "slice-01", "--specimen", "../../evil",
      ]),
    ).rejects.toThrow(/path-traversal guard/);
    expect(existsSync(join(root, "evil"))).toBe(false);
  });

  it("worktree-list reports the slice's live worktrees", async () => {
    if (!hasGit) return;
    const repo = makeRepo();
    await create(root, repo, "a");
    await create(root, repo, "b");

    captured = "";
    await runBridge(["worktree-list", "--root", root, "--target", repo, "--slice", "slice-01"]);
    const j = lastJSON<{ slice: string; worktrees: { path: string; detached: boolean }[] }>();
    expect(j.slice).toBe("slice-01");
    expect(j.worktrees).toHaveLength(2);
    for (const w of j.worktrees) {
      expect(w.path).toBeTruthy();
      expect(w.detached).toBe(true);
    }
  });

  it("worktree-destroy removes every worktree and is idempotent", async () => {
    if (!hasGit) return;
    const repo = makeRepo();
    const a = await create(root, repo, "a");
    const b = await create(root, repo, "b");
    expect(worktreeCount(repo)).toBe(3);

    captured = "";
    await runBridge(["worktree-destroy", "--root", root, "--target", repo, "--slice", "slice-01"]);
    const first = lastJSON<{ slice: string; removed: string[]; pruned: boolean }>();
    expect(first.removed).toHaveLength(2);
    expect(worktreeCount(repo)).toBe(1);
    expect(existsSync(a.path)).toBe(false);
    expect(existsSync(b.path)).toBe(false);
    expect(process.exitCode).not.toBe(1);

    // Second call on an already-clean slice: empty, still exit 0.
    captured = "";
    await runBridge(["worktree-destroy", "--root", root, "--target", repo, "--slice", "slice-01"]);
    const second = lastJSON<{ removed: string[] }>();
    expect(second.removed).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });

  it("missing required args exit 1 rather than throwing", async () => {
    await runBridge(["worktree-create", "--root", root, "--slice", "slice-01"]);
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
    await runBridge(["worktree-list", "--root", root]);
    expect(process.exitCode).toBe(1);
  });
});
