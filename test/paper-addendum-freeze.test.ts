import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Phase 17, Plan 01, Task 1 (REQ-84, T-17-01). Binds SC3 (docs/PAPER.md's existing
// §1-§15 body is byte-preserved) to a mechanical check, adapting the
// test/paired-rev2-freeze.test.ts git-blob-diff idiom from a fixed-blob equality
// check to an additive-diff-shape check: the file DOES change this phase (Part III
// is appended), so the invariant is "only append, never delete or reword", not
// "byte-identical". Reads the diff out of git against the pinned pre-phase commit
// rather than the working tree's own history, so a squash/rebase can never silently
// satisfy it.

const PRE_PHASE_COMMIT = "07d265bd64ad7254bf09993e2d3c7338735288b2";
const PAPER_REL_PATH = "docs/PAPER.md";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function gitAvailable(): boolean {
  try {
    execFileSync("git", ["--version"], { cwd: repoRoot, stdio: "pipe" });
    execFileSync("git", ["cat-file", "-e", PRE_PHASE_COMMIT], { cwd: repoRoot, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const GIT_AVAILABLE = gitAvailable();

function getDiffLines(): string[] {
  const diff = execFileSync(
    "git",
    ["diff", "--unified=0", PRE_PHASE_COMMIT, "--", PAPER_REL_PATH],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return diff.split("\n");
}

describe("Part III append-only guard (REQ-84)", () => {
  it.skipIf(!GIT_AVAILABLE)(
    GIT_AVAILABLE
      ? "docs/PAPER.md gained Part III without deleting a single line of the existing body"
      : "skipped: git is unavailable in this environment (cannot resolve the pinned pre-phase commit) — not a failure of the append-only claim itself",
    () => {
      const lines = getDiffLines();

      // Test 1: the append-only invariant. A deletion line is any output line whose
      // first character is '-', after removing exactly the file-header line by full
      // string equality against "--- a/docs/PAPER.md". Do NOT filter by a "---"
      // prefix — a deleted markdown horizontal rule renders as "----" in a unified
      // diff and a prefix filter would silently swallow it.
      const deletionLines = lines.filter(
        (line) => line.startsWith("-") && line !== "--- a/docs/PAPER.md",
      );
      expect(deletionLines).toEqual([]);

      // Test 2: the shape invariant. Exactly two hunk headers — the byline insertion
      // and the end-of-file append. This is the same diff shape the Part II commit
      // produced, and it also catches a stray insertion dropped into the middle of
      // §1-§15, which the zero-deletion check alone would not.
      const hunkHeaders = lines.filter((line) => line.startsWith("@@"));
      expect(hunkHeaders).toHaveLength(2);

      // Test 3: the anti-vacuous invariant. Among added lines, at least one begins
      // with the Part III top-level heading marker and at least one is the exact
      // Part III byline line. Without this the suite would pass green before any
      // content exists.
      const addedLines = lines.filter(
        (line) => line.startsWith("+") && line !== "+++ b/docs/PAPER.md",
      );
      expect(addedLines.some((line) => line.startsWith("+# Part III"))).toBe(true);
      expect(
        addedLines.includes(
          "+*Part III addendum: STZ Foundry follow-up results (stz-foundry 1.27.0), 2026-08 — §16*",
        ),
      ).toBe(true);
    },
  );
});
