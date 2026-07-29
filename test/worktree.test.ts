import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import {
  createWorktree,
  destroyWorktrees,
  worktreeRootPath,
  lastWorktreeMode,
  lastWorktreeReason,
  _resetWorktreeState,
} from "../src/worktree.js";
import { seal, verifySeal } from "../src/seal.js";
import { createHash } from "node:crypto";
import { runSlice } from "../src/mock/orchestrator.js";
import { MockModelLayer, defaultMockConfig } from "../src/mock/mock.js";
import type { Specimen } from "../src/mock/interfaces.js";
import type { SliceManifest } from "../src/types.js";

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

// ── the round itself: create → use → destroy, on every exit (phase 01 plan 04) ─

/**
 * These drive the REAL `runSlice` rather than `createWorktree` directly. The
 * unit tests above prove the git seam; these prove the orchestrator reaches it,
 * fills the run record, and tears down on the unhappy exits too — which is where
 * cleanup is normally forgotten.
 */

const SLICE = "slice-wt-round";
const NAME = "wtslice";
/** The file the mock specimen edits (tracked) and the hack file it adds (new). */
const EDITED = `src/${NAME}.ts`;
const HACK = `src/${NAME}.hack.ts`;

const ROUND_MANIFEST: SliceManifest = {
  id: SLICE,
  name: NAME,
  contract: "export function run(x: number): number",
  donePredicates: [{ id: "p", expr: "run(1) === 1", kind: "test" }],
  traceTier: "minimal",
  complexity: 1,
  dependsOn: [],
  judge: { votesPerPair: 1 },
  summary: "worktree-isolated round",
};

/**
 * The wrapped-mock harness from test/foundry-spawn.test.ts, with one seam: the
 * specimen. Two consumers of a small fixture is still not enough to justify a
 * shared test-helper module.
 */
function wrapMock(wrap?: (base: Specimen["implement"]) => Specimen["implement"]) {
  const mock = new MockModelLayer(defaultMockConfig());
  const base: Specimen["implement"] = (m, s, r) => mock.specimen.implement(m, s, r);
  return {
    elicitor: mock.elicitor,
    testAuthor: mock.testAuthor,
    strategist: mock.strategist,
    evalRunner: mock.evalRunner,
    judge: mock.judge,
    documenter: mock.documenter,
    planner: mock.planner,
    nextRound: () => mock.nextRound(),
    specimen: { implement: wrap ? wrap(base) : base },
  };
}

/** A repo whose tracked source is exactly what the mock specimen rewrites. */
function makeRoundRepo(): string {
  return makeRepo({ ...REPO, [EDITED]: "export const x = 0;\n" });
}

/** Live `worktree ` lines as git sees them — 1 means only the main worktree. */
function liveWorktrees(target: string): string[] {
  return g(target, "worktree", "list", "--porcelain")
    .split("\n")
    .filter((l) => l.startsWith("worktree "));
}

describe("worktree-isolated round (REQ-01/REQ-03/REQ-04)", () => {
  beforeEach(() => _resetWorktreeState());

  it("teardown after kill: the round still completes and no worktree survives", async () => {
    if (!hasGit) return expectDirectoryFallback();
    const root = makeRoundRepo();

    const result = await runSlice({
      root,
      manifest: ROUND_MANIFEST,
      model: wrapMock((base) => async (m, strategy, r) => {
        if (strategy === "batch-based") await new Promise<never>(() => {});
        return base(m, strategy, r);
      }),
      n: 4,
      specimenTimeoutMs: 200,
    });

    // The CONJUNCTION is the point: asserting only "no worktrees left" would
    // pass against an implementation that aborts the round to guarantee it,
    // which is exactly the N4 posture CONTEXT D-04 says teardown must hold under.
    expect(result.halted).toBe(false);
    expect(result.winner).not.toBeNull();
    expect(result.state.events.some((e) => e.kind === "specimen-killed")).toBe(true);
    expect(result.records.find((x) => x.strategy === "batch-based")!.status).toBe("timeout");
    expect(liveWorktrees(root)).toHaveLength(1);
    expect(readdirSync(worktreeRootPath(root, SLICE))).toEqual([]);
  }, 30_000);

  it("teardown after crash: a throwing specimen leaves no worktree behind", async () => {
    if (!hasGit) return expectDirectoryFallback();
    const root = makeRoundRepo();

    const result = await runSlice({
      root,
      manifest: ROUND_MANIFEST,
      model: wrapMock((base) => async (m, strategy, r) => {
        if (strategy === "batch-based") throw new Error("segfault-ish");
        return base(m, strategy, r);
      }),
      n: 4,
    });

    expect(result.halted).toBe(false);
    const crashed = result.records.find((x) => x.strategy === "batch-based")!;
    expect(crashed.status).toBe("error");
    expect(crashed.killReason).toBe("segfault-ish");
    expect(liveWorktrees(root)).toHaveLength(1);
    expect(readdirSync(worktreeRootPath(root, SLICE))).toEqual([]);
  }, 30_000);

  it("ephemeral scope: the worktrees go, the audit record and its diffs stay", async () => {
    if (!hasGit) return expectDirectoryFallback();
    const root = makeRoundRepo();

    const result = await runSlice({ root, manifest: ROUND_MANIFEST, model: wrapMock(), n: 4 });

    expect(result.halted).toBe(false);
    // Ephemeral (CONTEXT D5): the scope is gone…
    expect(readdirSync(worktreeRootPath(root, SLICE))).toEqual([]);

    // …the durable record is not. Parse every line: an empty or truncated
    // ledger would sail past a bare existsSync.
    const jsonl = readFileSync(join(root, ".stz", "90-audit", "calls", `${SLICE}.jsonl`), "utf8");
    const calls = jsonl
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as { role: string; specimen?: string; durationMs?: number });
    expect(calls.length).toBeGreaterThan(0);
    // REQ-04's other half: the ledger carries per-specimen attribution + duration.
    const attributed = calls.filter((c) => c.specimen !== undefined);
    expect(attributed.length).toBeGreaterThan(0);
    expect(attributed.every((c) => typeof c.durationMs === "number" || c.role !== "specimen")).toBe(true);

    // REQ-04: attribution has to be retrievable PER SPECIMEN after the run —
    // a git-level diff (plan 01) is a weaker claim than the record carrying it.
    expect(result.records).toHaveLength(4);
    for (const rec of result.records) {
      expect(rec.isolation).toBe("worktree");
      expect(rec.worktreePath).toContain(join("worktrees"));
      // Profile `d` (recursive) also emits a hack file; git lists paths sorted.
      expect(rec.diffFiles).toEqual(rec.specimen === "d" ? [HACK, EDITED] : [EDITED]);
    }
  }, 30_000);

  it("fallback run completes: a non-repo root still reaches a winner", async () => {
    const root = tempDir("stz-wt-fallback-");

    const result = await runSlice({ root, manifest: ROUND_MANIFEST, model: wrapMock(), n: 4 });

    // REQ-05 must never cost a run: this is the regression anchor for that.
    expect(result.halted).toBe(false);
    expect(result.winner).toBe("a");
    expect(result.records).toHaveLength(4);
    for (const rec of result.records) {
      expect(rec.isolation).toBe("directory");
      expect(rec.worktreePath).toBeNull();
      expect(rec.diffFiles).toBeNull();
    }
    // …and the degrade is reported, not silent.
    const iso = result.state.events.find((e) => e.kind === "isolation")!;
    expect(iso.detail).toContain("directory isolation");
    expect(iso.detail).toContain("DEGRADED — ");
  }, 30_000);

  // ── T-01-13: a model-returned file path must not escape its destination ────

  const PROBE = "/tmp/stz-traversal-probe";
  const PAYLOADS = ["../../etc/x", PROBE, "a/../../x"];

  /**
   * Drive REAL payloads through `runSlice` — the point is that the shared write
   * helper resolves and rejects, so a mocked rejection would prove nothing.
   * And assert on the ABSENCE of the resolved escape target, not merely that
   * something threw: an implementation that writes first and throws afterwards
   * passes a throw-only assertion while still owning your filesystem.
   */
  async function expectTraversalRejected(root: string, payload: string): Promise<void> {
    const sliceDir = join(root, ".stz", "40-slices", SLICE);
    // Both destinations, so the assertion covers the shared helper rather than
    // whichever call site happens to run first.
    const bases = [join(sliceDir, "prototypes", "specimen-a"), join(sliceDir, "worktrees", "s0")];
    const escapeTargets = bases.map((b) => resolve(b, payload));

    await expect(
      runSlice({
        root,
        manifest: ROUND_MANIFEST,
        model: wrapMock((base) => async (m, strategy, r) => {
          const out = await base(m, strategy, r);
          return { ...out, files: { ...out.files, [payload]: "pwned\n" } };
        }),
        n: 2,
      }),
    ).rejects.toThrow(payload);

    for (const t of escapeTargets) expect(existsSync(t)).toBe(false);
    expect(existsSync(PROBE)).toBe(false);
  }

  it("specimen output path traversal is rejected before any write", async () => {
    try {
      for (const payload of PAYLOADS) {
        // Non-repo root: the prototype destination only. Needs no git, and it is
        // the call site that predates worktrees — the one a new-call-site-only
        // guard would leave open.
        await expectTraversalRejected(tempDir("stz-wt-trav-plain-"), payload);
        if (hasGit) await expectTraversalRejected(makeRoundRepo(), payload);
      }
    } finally {
      // A regression must not be able to leave a file behind in /tmp.
      rmSync(PROBE, { force: true });
    }
  }, 60_000);

  // ── ROADMAP criterion 3: the seal survives isolation (C3b + C3c) ──────────

  it("seal survives a worktree round and the suite was never written into one", async () => {
    const root = makeRepo(REPO);
    const suite = join(root, SEALED);
    // Same primitive src/seal.ts uses; hand-rolling a comparison would be a
    // second definition of "unchanged".
    const sha = () => createHash("sha256").update(readFileSync(suite)).digest("hex");
    const before = sha();

    expect((await seal(root)).sealed).toBe(true);
    expect(verifySeal(root)).toEqual({ sealed: true, ok: true, drift: [] });

    if (!hasGit) {
      // No git ⇒ the fallback round. There is no worktree to firewall, so the
      // only claim left is that the seal is untouched — assert it rather than
      // skip, so the test stays meaningful on a git-less host.
      const h = createWorktree({ target: root, root, slice: SLICE, name: "s0", fallbackDir: join(root, "fb") });
      expect(h.mode).toBe("directory");
      expect(verifySeal(root)).toEqual({ sealed: true, ok: true, drift: [] });
      expect(sha()).toBe(before);
      return;
    }

    const handles = ["s0", "s1", "s2"].map((n) =>
      createWorktree({ target: root, root, slice: SLICE, name: n, fallbackDir: join(root, "fb", n) }),
    );
    for (const h of handles) expect(h.mode).toBe("worktree");

    // Captured WHILE the worktrees are live. Asserting this after teardown would
    // prove only that cleanup removed the directory — "the sealed suite was
    // cleaned up" is a different, far weaker claim than "it was never written".
    const sealedSuiteInWorktree = handles.map((h) => existsSync(join(h.path, ".stz")));

    handles.forEach((h, i) =>
      writeFileSync(join(h.path, "src/a.ts"), `export const a = ${i};\n`, "utf8"),
    );
    destroyWorktrees(root, root, SLICE);

    expect(sealedSuiteInWorktree).toEqual([false, false, false]);
    expect(verifySeal(root)).toEqual({ sealed: true, ok: true, drift: [] });
    expect(sha()).toBe(before);
  }, 30_000);
});
