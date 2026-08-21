import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import { existsSync } from "node:fs";

// Plan 19-05, Task 3 (REQ-76, T-19-23/T-19-24/T-19-25/T-19-26/T-19-28). Pins the
// commit that landed COLLAB-DESIGN.md's 35 adjudicated findings (Plan 19-05, Task 2)
// as the C-01 design freeze (D-08). "Frozen" here means two things at once, both
// mechanically checked below, not just one: the design document is retrievable
// byte-for-byte at the freeze commit forever (the blob-pin guard), AND the working
// tree has not silently drifted from that frozen text since (the worktree-diff
// guard) — a history-only blob pin would not catch a post-freeze edit that leaves
// the freeze commit itself untouched. Changing the constants below to accommodate a
// design-doc edit is the visible cost D-08's amendment protocol intends: either a
// new five-lane panel round, or a documented, bounded amendment entry (§1's own
// text), never a silent rewrite of these values.

const FREEZE_COMMIT = "3569d25642d4fd5702d36715da99ec2853f681c7";
const FROZEN_DESIGN_BLOB = "ca363b8d51efa77c0653b8ac63569104917e6e30";
const FROZEN_REVIEWS_BLOB = "8a2c676d32e83499fe40480af1f0185ad7bc083f";
const DESIGN_REL_PATH = "experiments/collab-design/COLLAB-DESIGN.md";
const REVIEWS_REL_PATH = "experiments/collab-design/COLLAB-DESIGN-REVIEWS.md";
// Line count of COLLAB-DESIGN-REVIEWS.md AT FREEZE_COMMIT (identical to the
// worktree today, since no drift exists yet). Used to pin where a legitimate
// amendment hunk is allowed to land — strictly after the frozen ledger's last
// line (WR-01: adapts the phase-17 append-only idiom from a fixed hunk count
// to a fixed hunk *position*, since this ledger's amendment hunk count is 0
// today and becomes N>=1 only once an amendment is actually appended).
const FROZEN_REVIEWS_LINE_COUNT = 904;

// The module filenames COLLAB-DESIGN.md §9 pins for Phases 20-22 (REQ-78/79/80),
// as repository-relative paths under src/foundry/ (REQ-79's own sibling-placement
// precedent beside vertical-admission.ts). Today none of these files exist — the
// forward-ancestry block below is vacuous over this list until Phase 20 lands the
// first one.
const WATCHED_IMPL_PATHS = [
  "src/foundry/collaborative-admission.ts",
  "src/foundry/collaborative-scoring-bridge.ts",
  "src/foundry/collaborative-runner.ts",
  "src/foundry/collaborative-tournament-shell.ts",
];

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// Only "git binary is missing" is a defensible skip. "git is present but
// FREEZE_COMMIT is unresolvable" (a shallow CI checkout, a history rewrite) must
// NOT collapse into the same skip path — that is exactly the tamper/shallow-clone
// scenario T-19-25 names, so every check below that touches FREEZE_COMMIT is left
// to throw and fail the test rather than being probed and skipped here (the CR-01
// hardening: the pinned commit is never probed inside this availability check).
function gitBinaryAvailable(): boolean {
  try {
    execFileSync("git", ["--version"], { cwd: repoRoot, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const GIT_AVAILABLE = gitBinaryAvailable();

function blobAt(commit: string, relPath: string): string {
  return execFileSync("git", ["rev-parse", `${commit}:${relPath}`], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

function worktreeDiffLines(commit: string, relPath: string): string[] {
  // Force the canonical a/ b/ header prefixes via -c, regardless of the executing
  // environment's diff.noprefix/diff.mnemonicPrefix config (the WR-02 hardening) —
  // an empty-diff check doesn't hardcode header text the way the phase-17 append-only
  // guard does, but a config-dependent header would still make this diff's shape
  // environment-dependent, which the -c overrides remove.
  const diff = execFileSync(
    "git",
    [
      "-c", "diff.noprefix=false",
      "-c", "diff.mnemonicPrefix=false",
      "diff", "--unified=0", commit, "--", relPath,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return diff.split("\n").filter((line) => line.length > 0);
}

function isAncestorOf(commit: string, target: string): boolean {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", commit, target], {
      cwd: repoRoot,
      stdio: "pipe",
    });
    return true;
  } catch (err: unknown) {
    // Exit status 1 from `--is-ancestor` is a clean, well-defined "not an ancestor"
    // — a legitimate false. Any other failure (unresolvable commit, git itself
    // erroring) must still surface as a thrown, test-failing error rather than being
    // swallowed into the same `false`, matching the fail-loud discipline this file
    // uses throughout for a pinned-but-unresolvable commit.
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

function frozenDesignText(): string {
  return execFileSync("git", ["show", `${FREEZE_COMMIT}:${DESIGN_REL_PATH}`], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

describe("C-01 design freeze guard (REQ-76, D-08)", () => {
  it.skipIf(!GIT_AVAILABLE)(
    GIT_AVAILABLE
      ? "COLLAB-DESIGN.md and COLLAB-DESIGN-REVIEWS.md are still byte-identical to their pinned blobs at the freeze commit"
      : "skipped: git binary is unavailable in this environment",
    () => {
      expect(blobAt(FREEZE_COMMIT, DESIGN_REL_PATH)).toBe(FROZEN_DESIGN_BLOB);
      expect(blobAt(FREEZE_COMMIT, REVIEWS_REL_PATH)).toBe(FROZEN_REVIEWS_BLOB);
    },
  );

  // The design document is fully frozen: no future edit is legitimate short of a
  // new five-lane panel round, so a plain empty-diff assertion is the correct guard.
  it.skipIf(!GIT_AVAILABLE)(
    GIT_AVAILABLE
      ? "the working tree has not drifted from COLLAB-DESIGN.md as it stood at the freeze commit"
      : "skipped: git binary is unavailable in this environment",
    () => {
      expect(worktreeDiffLines(FREEZE_COMMIT, DESIGN_REL_PATH)).toEqual([]);
    },
  );

  // WR-01: COLLAB-DESIGN-REVIEWS.md is append-only, not immutable — §1's amendment
  // protocol allows a future note appended after the ledger's frozen tail, so a
  // plain empty-diff assertion (as used for the design doc above) would wrongly
  // fail a legitimate amendment. Adapts the phase-17 append-only idiom
  // (test/paper-addendum-freeze.test.ts): zero deletion lines, and any hunk must
  // land strictly after FROZEN_REVIEWS_LINE_COUNT — so an appended note passes but
  // a mutation anywhere in the existing 904 ledger lines (a flipped verdict, a
  // deleted entry, an edited count) fails.
  it.skipIf(!GIT_AVAILABLE)(
    GIT_AVAILABLE
      ? "COLLAB-DESIGN-REVIEWS.md only gains appended content after its frozen tail — no deletion or modification of existing lines"
      : "skipped: git binary is unavailable in this environment",
    () => {
      const lines = worktreeDiffLines(FREEZE_COMMIT, REVIEWS_REL_PATH);

      // Deletion lines: any '-'-prefixed line other than the file-header line,
      // matched by full string equality (not a "---" prefix — the ledger contains
      // markdown horizontal rules that render as "----" and must not be mistaken
      // for the header).
      const deletionLines = lines.filter(
        (line) => line.startsWith("-") && line !== `--- a/${REVIEWS_REL_PATH}`,
      );
      expect(deletionLines).toEqual([]);

      // Hunk position: zero hunks today (no drift); any future hunk must start
      // strictly after the frozen tail, i.e. its old-file line number is
      // FROZEN_REVIEWS_LINE_COUNT (insertion after the last frozen line, unified
      // diff's "@@ -N,0 +M" form for a pure insertion at old-file line N).
      const hunkHeaders = lines.filter((line) => line.startsWith("@@"));
      for (const header of hunkHeaders) {
        expect(header.startsWith(`@@ -${FROZEN_REVIEWS_LINE_COUNT},0 +`)).toBe(true);
      }
    },
  );
});

describe("watched-path / §9 agreement (T-19-26)", () => {
  it.skipIf(!GIT_AVAILABLE)(
    GIT_AVAILABLE
      ? "WATCHED_IMPL_PATHS is non-empty and every entry's basename appears in the frozen design document's §9"
      : "skipped: git binary is unavailable in this environment",
    () => {
      expect(WATCHED_IMPL_PATHS.length).toBeGreaterThan(0);
      const designText = frozenDesignText();
      for (const path of WATCHED_IMPL_PATHS) {
        expect(designText.includes(basename(path))).toBe(true);
      }
    },
  );
});

describe("forward ancestry (ROADMAP SC-3, T-19-28)", () => {
  it.skipIf(!GIT_AVAILABLE)(
    GIT_AVAILABLE
      ? `the freeze commit ${FREEZE_COMMIT} is an ancestor of HEAD`
      : "skipped: git binary is unavailable in this environment",
    () => {
      expect(isAncestorOfHead(FREEZE_COMMIT)).toBe(true);
    },
  );

  // Per-commit, strict-ancestry check (D-11): HEAD-ancestry alone (the block
  // above) is transitively true for the whole history the moment any commit
  // lands on a freeze-descended branch, so it would still pass for a pre-freeze
  // implementation commit merged in afterwards — exactly the scenario ROADMAP
  // SC-3 exists to exclude. This block instead walks each existing watched
  // path's own `git log` and checks every commit individually. `--is-ancestor`
  // is reflexive (a commit is trivially its own ancestor), so an ancestry check
  // alone would let the freeze commit count as its own strict predecessor;
  // pairing it with an explicit inequality against FREEZE_COMMIT is what makes
  // the claim strict, as D-11 requires.
  it.skipIf(!GIT_AVAILABLE)(
    GIT_AVAILABLE
      ? "every commit touching an existing watched path has the freeze commit as a strict ancestor"
      : "skipped: git binary is unavailable in this environment",
    () => {
      for (const path of WATCHED_IMPL_PATHS) {
        if (!existsSync(join(repoRoot, path))) continue;
        for (const commit of commitsTouching(path)) {
          if (commit === FREEZE_COMMIT) {
            throw new Error(
              `${path}@${commit}: this commit IS the freeze commit, which is not a ` +
                `strict ancestor of itself — --is-ancestor is reflexive, so this ` +
                `inequality is required, not redundant with the ancestry check below`,
            );
          }
          if (!isAncestorOf(FREEZE_COMMIT, commit)) {
            throw new Error(
              `${path}@${commit}: this commit does not have freeze commit ` +
                `${FREEZE_COMMIT} as an ancestor — a pre-freeze implementation ` +
                `commit landed on a §9-pinned collaborative module path`,
            );
          }
        }
      }
    },
  );
});
