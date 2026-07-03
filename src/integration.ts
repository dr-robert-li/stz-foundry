/**
 * Sealed end-to-end integration + functional testing (cycle item 4).
 *
 * The per-slice sealed suite is unit-level: it proves each slice satisfies its
 * OWN contract. Nothing proved the composed slices work TOGETHER, or that a
 * brownfield change preserved end-to-end behaviour. This is that
 * composition-level gate — one suite authored per project, run after slice
 * aggregation, with the same anti-reward-hacking discipline as the per-slice
 * suites (authored blind to specimens, sealed by content hash, cross-referenced).
 *
 * It applies to BOTH project kinds; only the reference oracle it seals against
 * differs:
 *  - **Greenfield:** the suite is sealed against the project INTENT (the
 *    project-level done-predicates + the composed slice contracts) — it gates
 *    that the assembled artifact meets whole-project acceptance.
 *  - **Brownfield:** it ADDITIONALLY seals against existing SOURCE behaviour —
 *    every `preservedExport` the item-3 anchors promised must still resolve on
 *    the assembled entry point (a change that drops a public export fails the
 *    gate even if the new behaviour is correct).
 *
 * Deterministic core: the suite runs through the shared sandbox (same seam as
 * `runSealed`), and preserved-export presence is checked with a sandboxed probe.
 */
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { runSealed, type SealedResult } from "./eval-runner.js";
import { sandboxedNode } from "./sandbox.js";

/**
 * Which of `names` the module at `entryPath` still exports (as a value/function).
 * Sandboxed probe — the assembled artifact is model-produced code. Used for the
 * brownfield source-preservation check: a preserved public export that no longer
 * resolves is a broken contract with the existing callers.
 */
export function checkExportsPresent(entryPath: string, names: string[]): { present: string[]; missing: string[] } {
  if (names.length === 0) return { present: [], missing: [] };
  const abs = resolve(entryPath);
  const dir = mkdtempSync(join(tmpdir(), "stz-integ-probe-"));
  try {
    const probePath = join(dir, "probe.mjs");
    writeFileSync(
      probePath,
      `const m = await import(process.argv[2]);\n` +
        `const names = ${JSON.stringify(names)};\n` +
        `const present = names.filter((n) => m[n] !== undefined);\n` +
        `console.log(JSON.stringify({ present }));\n`,
      "utf8",
    );
    const r = sandboxedNode([probePath, abs], { readDirs: [dir, dirname(abs)], timeout: 20_000 });
    const last = (r.stdout ?? "").trim().split("\n").filter(Boolean).pop() ?? "";
    let present: string[] = [];
    try {
      present = (JSON.parse(last) as { present: string[] }).present ?? [];
    } catch {
      present = []; // an entry that fails to import preserves nothing
    }
    return { present, missing: names.filter((n) => !present.includes(n)) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export interface IntegrationResult {
  /** The composition-level sealed suite result against the assembled entry. */
  suite: SealedResult;
  /** Brownfield: preserved public exports that no longer resolve (empty greenfield). */
  preservedMissing: string[];
  /** The gate: the suite passes in full AND no preserved export was dropped. */
  passed: boolean;
}

/**
 * Run the composition-level gate: the sealed integration suite must pass in full
 * against the assembled entry point, and (brownfield) every preserved export must
 * still resolve. Same pass semantics as the per-slice gate — passRate === 1.
 */
export function runIntegrationGate(
  suitePath: string,
  entryPath: string,
  preservedExports: string[] = [],
): IntegrationResult {
  const suite = runSealed(suitePath, entryPath);
  const { missing } = checkExportsPresent(entryPath, preservedExports);
  return { suite, preservedMissing: missing, passed: suite.passRate === 1 && missing.length === 0 };
}
