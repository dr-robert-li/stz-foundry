import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Plan 15-04, Task 3 (REQ-71, T-15-17). Binds the rev-2 byte-freeze claim to a
// check: rev 2 stays retrievable byte-for-byte at its own freeze commit
// forever, even though the same path now carries a rev-3 amendment entry at
// HEAD. "Frozen" means retrievability at the freeze commit, never an
// inability to edit the file afterward (§12's own ancestry paragraph states
// this explicitly) — this test is the mechanical proof of that claim,
// reading the hash out of git rather than out of the working tree, so a
// working-tree edit can never silently satisfy it.

const REV2_FREEZE_COMMIT = "2f9e6095dc6e20bcc8196a293397f7ec07f8c704";
const REV2_FROZEN_BLOB = "d68eebb7d47e389745f919d8f975bcd8b45d6349";
const PREREG_REL_PATH = "experiments/paired-comparison-arm/PAIRED-DESIGN-PREREG.md";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function gitAvailable(): boolean {
  try {
    execFileSync("git", ["--version"], { cwd: repoRoot, stdio: "pipe" });
    execFileSync("git", ["cat-file", "-e", REV2_FREEZE_COMMIT], { cwd: repoRoot, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const GIT_AVAILABLE = gitAvailable();

describe("rev-2 byte-freeze guard (T-15-17)", () => {
  it.skipIf(!GIT_AVAILABLE)(
    GIT_AVAILABLE
      ? `the blob for ${PREREG_REL_PATH} at the rev-2 freeze commit ${REV2_FREEZE_COMMIT} is still ${REV2_FROZEN_BLOB}`
      : "skipped: git is unavailable in this environment (cannot resolve the rev-2 freeze commit) — not a failure of the freeze claim itself",
    () => {
      const blobHash = execFileSync(
        "git",
        ["rev-parse", `${REV2_FREEZE_COMMIT}:${PREREG_REL_PATH}`],
        { cwd: repoRoot, encoding: "utf8" },
      ).trim();
      expect(blobHash).toBe(REV2_FROZEN_BLOB);
    },
  );
});
