import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import { readFileSync } from "node:fs";

// Phase 23, Plan 23-01 (REQ-81). D-15's sibling freeze-ancestry guard for the
// gate module (`src/foundry/collaborative-ablation-gate.ts`).
//
// This file is a SIBLING of `test/collab-design-freeze.test.ts`, never an
// extension of it. `test/collab-design-freeze.test.ts`'s own
// `WATCHED_IMPL_PATHS` array is checked against the frozen design's own §9
// text (its "watched-path / §9 agreement" describe block), and §9 pins
// exactly the four Phase 20-22 module names -- `collaborative-admission.ts`,
// `collaborative-scoring-bridge.ts`, `collaborative-runner.ts`,
// `collaborative-tournament-shell.ts`. Adding this module's basename to
// that array would either fail immediately (the array is checked against
// §9's own text, which does not name this file) or require editing §9
// itself -- a substantive amendment to a frozen document, requiring a new
// five-lane panel round, exactly what D-15 says to avoid
// (`.planning/phases/23-ablation-gate-powered-stark-round/23-CONTEXT.md`
// D-15). This file instead re-derives the same
// `git merge-base --is-ancestor` ancestry mechanism as its own guard, pinned
// to the same freeze commit, and never touches `WATCHED_IMPL_PATHS`.
//
// The freeze-commit constant, `isAncestorOf` and `commitsTouching` below are
// COPIED from `test/collab-design-freeze.test.ts`, not imported -- each test
// file re-derives its own guard independently, per this project's own
// copy-in-shape convention for freeze/ancestry machinery.

const FREEZE_COMMIT = "3569d25642d4fd5702d36715da99ec2853f681c7";
const GATE_MODULE_REL_PATH = "src/foundry/collaborative-ablation-gate.ts";
const DESIGN_FREEZE_TEST_REL_PATH = "test/collab-design-freeze.test.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function gitBinaryAvailable(): boolean {
  try {
    execFileSync("git", ["--version"], { cwd: repoRoot, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const GIT_AVAILABLE = gitBinaryAvailable();

function isAncestorOf(commit: string, target: string): boolean {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", commit, target], {
      cwd: repoRoot,
      stdio: "pipe",
    });
    return true;
  } catch (err: unknown) {
    // Exit status 1 from `--is-ancestor` is a clean, well-defined "not an
    // ancestor" -- a legitimate false. Any other failure (unresolvable
    // commit, git itself erroring) must still surface as a thrown,
    // test-failing error rather than being swallowed into the same
    // `false`, matching `test/collab-design-freeze.test.ts`'s own
    // fail-loud discipline exactly.
    if ((err as { status?: number }).status === 1) return false;
    throw err;
  }
}

function isAncestorOfHead(commit: string): boolean {
  return isAncestorOf(commit, "HEAD");
}

function commitsTouching(relPath: string): string[] {
  return execFileSync("git", ["log", "--format=%H", "--", relPath], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter((s) => s.length > 0);
}

describe("collaborative-ablation-gate.ts freeze ancestry (D-15, sibling guard)", () => {
  it.skipIf(!GIT_AVAILABLE)(
    GIT_AVAILABLE
      ? `the freeze commit ${FREEZE_COMMIT} resolves and is an ancestor of HEAD`
      : "skipped: git binary is unavailable in this environment",
    () => {
      expect(isAncestorOfHead(FREEZE_COMMIT)).toBe(true);
    },
  );

  it.skipIf(!GIT_AVAILABLE)(
    GIT_AVAILABLE
      ? "every commit touching the gate module has the freeze commit as a git ancestor"
      : "skipped: git binary is unavailable in this environment",
    () => {
      const commits = commitsTouching(GATE_MODULE_REL_PATH);
      // The module must already be committed at the point this test runs --
      // an empty list here would let the loop below vacuously pass, which
      // would silently defeat the guard the moment the module went
      // uncommitted for any reason. Assert explicitly rather than let a
      // zero-iteration loop read as green.
      expect(commits.length, `${GATE_MODULE_REL_PATH}: no commits found touching this path`).toBeGreaterThan(0);

      for (const commit of commits) {
        if (!isAncestorOf(FREEZE_COMMIT, commit)) {
          throw new Error(
            `${GATE_MODULE_REL_PATH}@${commit}: this commit does not have freeze commit ` +
              `${FREEZE_COMMIT} as an ancestor -- a pre-freeze implementation commit landed ` +
              `on the gate module`,
          );
        }
      }
    },
  );
});

describe("frozen design's own watched-path list is untouched (D-15)", () => {
  it(
    "test/collab-design-freeze.test.ts's WATCHED_IMPL_PATHS still holds exactly four entries, and none names the gate module",
    () => {
      const designFreezeTestPath = join(repoRoot, DESIGN_FREEZE_TEST_REL_PATH);
      const source = readFileSync(designFreezeTestPath, "utf8");

      // Extract the array by locating its declaration and its closing
      // bracket in the file text, rather than importing the test module
      // (this file must read collab-design-freeze.test.ts's own source,
      // never execute it as a module).
      const declarationMatch = source.match(/const WATCHED_IMPL_PATHS = \[([\s\S]*?)\];/);
      if (!declarationMatch) {
        throw new Error(
          `${DESIGN_FREEZE_TEST_REL_PATH}: could not locate a "const WATCHED_IMPL_PATHS = [ ... ];" ` +
            `declaration in this file's source text`,
        );
      }
      const arrayBody = declarationMatch[1]!;
      const entries = Array.from(arrayBody.matchAll(/"([^"]+)"/g)).map((m) => m[1]!);

      expect(entries.length).toBe(4);

      const gateModuleBasename = basename(GATE_MODULE_REL_PATH);
      for (const entry of entries) {
        expect(entry.endsWith(gateModuleBasename)).toBe(false);
      }
    },
  );
});
