/**
 * D-07's structural boundary enforcement (Phase 23 — Ablation gate & powered
 * STaRK round, Plan 23-03, REQ-81). This IS the enforcement mechanism the
 * head comment on `buildCollaborativeHeldoutBattery` (`src/foundry/collaborative-battery.ts`)
 * points a future reader to: the sealed heldout pool's evidentiary integrity
 * depends on the search half never having seen the verdict suite, and that
 * boundary must be structural, not conventional (T-23-12).
 *
 * A legitimate future importer is added to `SANCTIONED_PATHS` below in a
 * reviewed commit — never by weakening the scan itself. That list is the
 * audit answer to "which module opened the sealed pool" (T-23-15): one
 * reviewable value, not a grep.
 *
 * Two scans over the same file set:
 *  1. no search-side file names the heldout loader's export
 *     (`buildCollaborativeHeldoutBattery`);
 *  2. no search-side file names the sealed heldout fixture's path literal
 *     (`test/fixtures/stark/prime-heldout.json`) — closing the "read the
 *     fixture directly, skip the loader" bypass the export scan alone
 *     cannot see (T-23-12).
 *
 * Each scan carries its own non-vacuity control (a scan that silently
 * collected nothing must not pass).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const HELDOUT_LOADER_EXPORT = "buildCollaborativeHeldoutBattery";
const HELDOUT_FIXTURE_PATH = "test/fixtures/stark/prime-heldout.json";

// D-07's single sanctioned importer set, named here as a visible, reviewable
// value rather than a scattered set of conditions. Exactly two paths:
//   - collaborative-battery.ts: the loader's own module, the one legitimate
//     definition site.
//   - _collab-round.ts: the detached round driver (Plan 23-07), D-07's sole
//     sanctioned importer. Named here even before that file exists, so this
//     exclusion is already correct on the day the driver lands — the file
//     not yet existing simply means it is not part of `allTsFiles` yet.
// Adding a legitimate future importer means adding it here in a reviewed
// commit — never weakening the scan below.
const SANCTIONED_PATHS: readonly string[] = [
  join("src", "foundry", "collaborative-battery.ts"),
  join("experiments", "collab-round", "_collab-round.ts"),
];

// The fixture-path scan (below) carries one additional, narrower exclusion:
// `collaborative-admission.ts` is D-04's single typed home for
// `heldoutFixturePath` — its own doc comment states it "Records where Phase
// 23's heldout file lives and nothing more... No code in this phase may
// read this path." It declares the literal; it does not read the file
// (no `readFileSync`, no import of the loader). Excluded only from the
// fixture-path scan, not the export-name scan, so this module stays free to
// be caught if it ever grows an actual read.
const FIXTURE_PATH_SCAN_EXTRA_EXCLUSIONS: readonly string[] = [
  join("src", "foundry", "collaborative-admission.ts"),
];

function collectTsFiles(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

const allTsFiles = [...collectTsFiles(join(repoRoot, "src")), ...collectTsFiles(join(repoRoot, "experiments"))];

const searchSideFiles = allTsFiles.filter(
  (path) => !SANCTIONED_PATHS.includes(relative(repoRoot, path)),
);

function violations(files: string[], needle: string): string[] {
  const hits: string[] = [];
  for (const path of files) {
    const text = readFileSync(path, "utf8");
    if (text.includes(needle)) hits.push(relative(repoRoot, path));
  }
  return hits;
}

describe("collaborative-heldout-import-boundary (D-07, REQ-81) — the sealed pool's single door", () => {
  it("non-vacuity: the collected file list is non-empty and above a sane floor", () => {
    expect(allTsFiles.length).toBeGreaterThanOrEqual(20);
  });

  it("non-vacuity (positive control): the loader's own module DOES contain the heldout export name", () => {
    const loaderPath = join(repoRoot, "src", "foundry", "collaborative-battery.ts");
    const loaderText = readFileSync(loaderPath, "utf8");
    expect(loaderText).toContain(HELDOUT_LOADER_EXPORT);
  });

  it("non-vacuity (positive control): the admission module DOES contain the fixture path literal — the exclusion below is real, not a scan that found nothing", () => {
    const admissionPath = join(repoRoot, "src", "foundry", "collaborative-admission.ts");
    const admissionText = readFileSync(admissionPath, "utf8");
    expect(admissionText).toContain(HELDOUT_FIXTURE_PATH);
  });

  it("no search-side src/ or experiments/ file names the heldout loader's export — only the detached round driver may import it (D-07)", () => {
    const hits = violations(searchSideFiles, HELDOUT_LOADER_EXPORT);
    expect(
      hits,
      `the following file(s) name ${HELDOUT_LOADER_EXPORT} outside its own module — only the ` +
        `detached round driver may import the heldout loader (D-07): ${hits.join(", ")}`,
    ).toEqual([]);
  });

  it("no search-side src/ or experiments/ file names the sealed heldout fixture's path literal — a module cannot bypass the loader by reading the fixture directly (D-07)", () => {
    const fixturePathScanFiles = searchSideFiles.filter(
      (path) => !FIXTURE_PATH_SCAN_EXTRA_EXCLUSIONS.includes(relative(repoRoot, path)),
    );
    const hits = violations(fixturePathScanFiles, HELDOUT_FIXTURE_PATH);
    expect(
      hits,
      `the following file(s) name the sealed heldout fixture path ${HELDOUT_FIXTURE_PATH} directly, ` +
        `bypassing the loader (D-07): ${hits.join(", ")}`,
    ).toEqual([]);
  });
});
