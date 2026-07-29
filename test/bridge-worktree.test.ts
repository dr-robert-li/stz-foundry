import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, realpathSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { runBridge } from "../src/bridge.js";
import { STZ_DIR } from "../src/taxonomy.js";
import type { SliceManifest } from "../src/types.js";

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

const wtRoot = (root: string, slice = "slice-01") =>
  join(root, STZ_DIR, "40-slices", slice, "worktrees");

// ── stdout capture (same fixture shape as test/bridge.test.ts) ──────────────

let root: string;
let captured: string;
const origWrite = process.stdout.write.bind(process.stdout);

beforeEach(() => {
  // `finalize` rebuilds the knowledge index at slice close and therefore selects
  // an embedding provider; pin the offline one so no test reaches a daemon.
  process.env.STZ_EMBED = "fallback";
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
  delete process.env.STZ_EMBED;
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

// ── task 2: teardown at every terminal path ────────────────────────────────

const manifest: SliceManifest = {
  id: "slice-01",
  name: "demo",
  contract: "export function run(input: Request): Result",
  donePredicates: [{ id: "schema", expr: "returns_schema(Result)", kind: "schema" }],
  traceTier: "minimal",
  complexity: 2,
  dependsOn: [],
  judge: { votesPerPair: 2 },
  summary: "worktree teardown demo",
};

describe("bridge teardown — every way a slice can end removes its worktrees", () => {
  /** Project root == target repo, which is the production shape. */
  async function slice(): Promise<string> {
    const repo = makeRepo();
    const manifestPath = join(repo, "m.json");
    await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
    captured = "";
    await runBridge(["begin", "--root", repo, "--manifest", manifestPath]);
    await create(repo, repo, "a");
    await create(repo, repo, "b");
    expect(worktreeCount(repo)).toBe(3);
    return repo;
  }

  function expectTornDown(repo: string): void {
    expect(worktreeCount(repo)).toBe(1);
    expect(existsSync(join(wtRoot(repo), "a"))).toBe(false);
    expect(existsSync(join(wtRoot(repo), "b"))).toBe(false);
  }

  it("bridge teardown after finalize", async () => {
    if (!hasGit) return;
    const repo = await slice();
    const intent = join(repo, "intent.json");
    const asbuilt = join(repo, "asbuilt.json");
    await writeFile(intent, JSON.stringify({ claims: ["exposes run()"] }), "utf8");
    await writeFile(asbuilt, JSON.stringify({ claims: ["exposes run()"] }), "utf8");

    captured = "";
    await runBridge(["finalize", "--root", repo, "--slice", "slice-01", "--intent", intent, "--asbuilt", asbuilt]);
    expectTornDown(repo);
  });

  it("bridge teardown after halt", async () => {
    if (!hasGit) return;
    const repo = await slice();
    // retryPolicy {0,0}: the first no-passers round is terminal.
    await writeFile(
      join(repo, STZ_DIR, "00-intent", "run-config.json"),
      JSON.stringify({ retryPolicy: { retries: 0, replans: 0 } }),
      "utf8",
    );
    captured = "";
    await runBridge(["escalate", "--root", repo, "--slice", "slice-01"]);
    expect(lastJSON<{ action: string }>().action).toBe("halt");
    expectTornDown(repo);
  });

  it("bridge teardown after slice-halt", async () => {
    if (!hasGit) return;
    const repo = await slice();
    captured = "";
    await runBridge([
      "slice-halt", "--root", repo, "--slice", "slice-01",
      "--reason", "Seal-crosscheck divergence — human decision required.",
    ]);
    expect(lastJSON<{ action: string }>().action).toBe("halt");
    expectTornDown(repo);
  });

  it("bridge teardown after slice-reset (crash-recovery reconciliation)", async () => {
    if (!hasGit) return;
    const repo = await slice();
    captured = "";
    await runBridge(["slice-reset", "--root", repo, "--slice", "slice-01"]);
    expectTornDown(repo);
  });

  it("bridge teardown skipped on retry — a retry round is not a slice close", async () => {
    if (!hasGit) return;
    const repo = await slice();
    captured = "";
    await runBridge(["escalate", "--root", repo, "--slice", "slice-01"]);
    expect(lastJSON<{ action: string }>().action).toBe("retry");
    expect(worktreeCount(repo)).toBe(3);
    expect(existsSync(join(wtRoot(repo), "a"))).toBe(true);
    expect(existsSync(join(wtRoot(repo), "b"))).toBe(true);
  });
});

// ── REQ-04, in-session half: the per-specimen run record ───────────────────

/**
 * The foundry runner builds a `SpecimenRunRecord` itself because it owns the
 * spawn loop. The in-session path does not — Claude Code owns the subagent, so
 * only it knows wall-clock and why a specimen stopped. Phase-1 verification
 * found criterion 4 was foundry-only: `grep -rln 'appendCall|writeAudit' src/`
 * returned exactly one file, and the bridge wrote no per-specimen timing, cost,
 * exit status or kill reason at all. These verbs close that.
 *
 * The design rule under test: the command supplies OBSERVATIONS (duration,
 * status, reason); the bridge DERIVES everything else (isolation, worktree path,
 * diff) so a command that thinks it got a worktree but silently degraded cannot
 * misreport it.
 */
interface RecordJSON {
  strategy: string;
  specimen: string;
  status: string;
  killReason: string | null;
  durationMs: number;
  isolation: string;
  worktreePath: string | null;
  diffFiles: string[] | null;
  slice: string;
  recorded: boolean;
}

describe("bridge specimen-record — REQ-04 on the in-session path", () => {
  it("derives isolation, worktree path and diff rather than trusting the caller", async () => {
    if (!hasGit) return;
    const repo = makeRepo();
    const wt = await create(root, repo, "a");
    expect(wt.mode).toBe("worktree");
    // The specimen edits a file in ITS worktree — the diff must be attributable.
    writeFileSync(join(wt.path, "src/a.ts"), "export const a = 2;\n", "utf8");

    captured = "";
    await runBridge([
      "specimen-record", "--root", root, "--target", repo,
      "--slice", "slice-01", "--specimen", "a",
      "--status", "ok", "--duration-ms", "1234",
    ]);
    const rec = lastJSON<RecordJSON>();

    expect(rec.specimen).toBe("a");
    expect(rec.status).toBe("ok");
    expect(rec.killReason).toBeNull();
    expect(rec.durationMs).toBe(1234);
    // Derived, not supplied — the caller passed neither of these.
    expect(rec.isolation).toBe("worktree");
    expect(rec.worktreePath).toBe(wt.path);
    expect(rec.diffFiles).toContain("src/a.ts");
  });

  it("reports directory isolation when the specimen never got a worktree", async () => {
    const notARepo = tempDir("stz-bwt-rec-plain-");
    await create(root, notARepo, "b");

    captured = "";
    await runBridge([
      "specimen-record", "--root", root, "--target", notARepo,
      "--slice", "slice-01", "--specimen", "b",
      "--status", "ok", "--duration-ms", "5",
    ]);
    const rec = lastJSON<RecordJSON>();

    // A degrade is reported, never silent (D3) — and diffFiles is honestly null
    // rather than an empty array that reads like "changed nothing".
    expect(rec.isolation).toBe("directory");
    expect(rec.worktreePath).toBeNull();
    expect(rec.diffFiles).toBeNull();
  });

  it("refuses a non-ok status with no reason — an unattributable outcome", async () => {
    captured = "";
    await runBridge([
      "specimen-record", "--root", root, "--target", root,
      "--slice", "slice-01", "--specimen", "c", "--status", "timeout",
    ]);
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it("records a killed specimen with its reason, and reads every record back", async () => {
    captured = "";
    await runBridge([
      "specimen-record", "--root", root, "--target", root,
      "--slice", "slice-01", "--specimen", "d",
      "--status", "timeout", "--kill-reason", "no result within 30000ms (stuck-killed)",
      "--duration-ms", "30000",
    ]);
    expect(lastJSON<RecordJSON>().killReason).toMatch(/stuck-killed/);

    captured = "";
    await runBridge([
      "specimen-record", "--root", root, "--target", root,
      "--slice", "slice-01", "--specimen", "e",
      "--status", "error", "--kill-reason", "threw: boom", "--duration-ms", "12",
    ]);

    captured = "";
    await runBridge(["specimen-records", "--root", root, "--target", root, "--slice", "slice-01"]);
    const all = lastJSON<{ slice: string; records: RecordJSON[] }>();

    // Every specimen recorded so far is retrievable per specimen after the run.
    const ids = all.records.map((r) => r.specimen);
    expect(ids).toContain("d");
    expect(ids).toContain("e");
    expect(all.records.find((r) => r.specimen === "e")!.status).toBe("error");
    // Append-only: a retry round stays visible rather than overwriting (N1).
    expect(all.records.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects a path-traversal specimen id", async () => {
    await expect(
      runBridge([
        "specimen-record", "--root", root, "--target", root,
        "--slice", "slice-01", "--specimen", "../../evil", "--status", "ok",
      ]),
    ).rejects.toThrow(/path-traversal guard/);
  });
});
