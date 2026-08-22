/**
 * D-02's mutation-checked strip-boundary proof (Phase 21 — Fail-closed
 * scoring bridge, Plan 21-04, REQ-78, SC-5). This is D-01's enforcement
 * mechanism: the bridge module never imports or reads gold-bearing data
 * (D-01), and THIS file is what makes that absence checkable rather than
 * merely asserted in a doc comment. Two sides, one named test file: (a) a
 * source-text + import-graph scan (below, "source-text side"), and (b) a
 * taint probe driving the real bridge against a synthetic setup whose gold
 * ids are sentinel values (below, "taint probe side"). Each side of D-02's
 * claim carries a non-vacuity control ruling out a vacuous "absent
 * everywhere" or "never reachable" false pass.
 *
 * Kept prohibition (21-04-PLAN.md, quoted verbatim): "The strip-boundary
 * test MUST NOT be weakened, narrowed, allowlisted, or scoped away to make a
 * failing bridge pass. If it goes red, the bridge is what changes. REQ-78's
 * entire value rests on this check being one nobody was allowed to
 * negotiate with after the fact; a test adjusted whenever it is inconvenient
 * proves only that it was adjusted."
 *
 * A5's pinned definition of "agent-visible" (the taint probe's exact scope):
 * the returned `ScoringAttempt` object, the constructed `OracleReceipt`, and
 * the full text of the written attempt-artifact file. The bridge's own
 * stderr and diagnostic output is operator-facing and deliberately OUT of
 * scope — an operator re-running a call by hand is not the agent under
 * evaluation.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { SpawnSyncReturns } from "node:child_process";
import { scorePrediction, type PoolManifest, type ScoringExecFn } from "../src/foundry/collaborative-scoring-bridge.js";
import { requireCollaborativeAdmitted } from "../src/foundry/collaborative-admission.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const bridgeSrcPath = join(repoRoot, "src", "foundry", "collaborative-scoring-bridge.ts");
const admissionSrcPath = join(repoRoot, "src", "foundry", "collaborative-admission.ts");
const batterySrcPath = join(repoRoot, "src", "foundry", "collaborative-battery.ts");

/**
 * A deliberate TEXT closure, not a real module resolver — the claim being
 * made is about source text a reader (or a scan) could inspect, not about
 * runtime module identity. The bridge's own import set is six specifiers by
 * design (Pattern 6, 21-PATTERNS.md) precisely so this stays tractable:
 * follow every relative `from "./<name>.js"` or `from "../<name>.js"`
 * specifier, resolve it to its `.ts` sibling, and concatenate — guarding
 * against cycles with `seen` so a re-imported module is read (and counted)
 * exactly once.
 */
export function collectTransitiveSource(entryPath: string, seen = new Set<string>()): string {
  if (seen.has(entryPath)) return "";
  seen.add(entryPath);
  const text = readFileSync(entryPath, "utf8");
  let combined = text;
  const importRe = /from\s+["'](\.\.?\/[^"']+)\.js["']/g;
  for (const match of text.matchAll(importRe)) {
    const resolved = join(dirname(entryPath), `${match[1]}.ts`);
    combined += collectTransitiveSource(resolved, seen);
  }
  return combined;
}

describe("gold-id strip boundary (D-01/D-02, REQ-78) — source-text side", () => {
  it("neither the bridge module nor anything it transitively imports contains the gold-id token answer_ids", () => {
    const combined = collectTransitiveSource(bridgeSrcPath);
    expect(combined).not.toContain("answer_ids");
  });

  it("non-vacuity control: the token answer_ids and the sibling loader module's own basename BOTH exist in the repo (rules out a vacuous 'absent everywhere' pass)", () => {
    // The token genuinely lives in the sibling battery-loader's own
    // StarkFixturePair interface — asserted directly so the absence
    // assertion above cannot be discriminating against a string that was
    // never anywhere to begin with.
    const batteryText = readFileSync(batterySrcPath, "utf8");
    expect(batteryText).toContain("answer_ids");
    // The loader's own basename genuinely appears in its own test file's
    // import specifier — same non-vacuity reasoning applied to the name
    // itself, not just the gold-id field it declares.
    const batteryTestText = readFileSync(join(repoRoot, "test", "foundry-collaborative-battery.test.ts"), "utf8");
    expect(batteryTestText).toContain("collaborative-battery");
  });

  it("the transitive closure followed something (strictly longer than the bridge file alone) and stayed bounded (strictly shorter than the whole src/foundry tree concatenated)", () => {
    const bridgeAlone = readFileSync(bridgeSrcPath, "utf8");
    const combined = collectTransitiveSource(bridgeSrcPath);
    expect(combined.length).toBeGreaterThan(bridgeAlone.length);

    const foundryDir = join(repoRoot, "src", "foundry");
    const wholeTree = readdirSync(foundryDir)
      .filter((name) => name.endsWith(".ts"))
      .map((name) => readFileSync(join(foundryDir, name), "utf8"))
      .join("");
    expect(combined.length).toBeLessThan(wholeTree.length);
  });

  it("the bridge's own text does not contain the sibling battery-loader module's basename, in code or comment", () => {
    const bridgeText = readFileSync(bridgeSrcPath, "utf8");
    expect(bridgeText).not.toContain("collaborative-battery");
  });

  it("the bridge's own text contains neither gold fixture filename nor either of the admission record's two fixture-path field names", () => {
    const bridgeText = readFileSync(bridgeSrcPath, "utf8");
    expect(bridgeText).not.toContain("prime-selection.json");
    expect(bridgeText).not.toContain("prime-heldout.json");
    expect(bridgeText).not.toContain("selectionFixturePath");
    expect(bridgeText).not.toContain("heldoutFixturePath");
  });

  it("non-vacuity control: the admission record's two fixture-path field names ARE present in collaborative-admission.ts's own source", () => {
    const admissionText = readFileSync(admissionSrcPath, "utf8");
    expect(admissionText).toContain("selectionFixturePath");
    expect(admissionText).toContain("heldoutFixturePath");
  });
});

// Part (b): the taint probe. A5 pins "agent-visible" to exactly three
// surfaces — the returned attempt, the constructed receipt, and the written
// artifact file's full text — and this probe drives the real
// `scorePrediction` against a synthetic setup whose gold id is a sentinel,
// asserting it appears in none of the three.
describe("gold-id strip boundary — taint probe side", () => {
  const ADMISSION_RECORD = requireCollaborativeAdmitted("stark-prime");
  // Both sentinels sit far above the real pool's observed maximum (129374)
  // so neither can be mistaken for a real STaRK node id.
  const SENTINEL_CALLER_ID = 900000001; // the caller's OWN prediction id — legitimately present
  const SENTINEL_GOLD_ID = 900000002; // stands in for a gold id the Python side would know — must never surface

  function fakeSpawnSyncResult(stdout: string): SpawnSyncReturns<string> {
    return {
      pid: 1,
      output: [null, stdout, ""],
      stdout,
      stderr: "",
      status: 0,
      signal: null,
      error: undefined,
    };
  }

  // The injected execFn echoes the sentinel gold id back inside a
  // non-metric field of its stdout payload, standing in for the one thing
  // the real score_one.py legitimately holds and the bridge must never
  // surface — score_one.py's own contract is { kb, query_id, hf_revision,
  // metrics }, so `leaked_gold_echo` below is deliberately an EXTRA field
  // outside that contract, proving the bridge does not blindly forward
  // whatever the subprocess happens to print.
  const fakeStdout = JSON.stringify({
    kb: "prime",
    query_id: 1,
    hf_revision: ADMISSION_RECORD.revisionSha,
    metrics: { mrr: 0.5, "hit@1": 1.0, "hit@5": 1.0, "recall@20": 0.25 },
    leaked_gold_echo: SENTINEL_GOLD_ID,
  });

  const execFn: ScoringExecFn = () => fakeSpawnSyncResult(fakeStdout);

  // Pool manifest bounds are widened to admit the caller's own sentinel id
  // so the pre-filter does not forfeit it before the taint probe ever
  // reaches the invocation it is meant to test.
  const poolManifest: PoolManifest = {
    kb: "stark-prime",
    hfRevision: ADMISSION_RECORD.revisionSha,
    form: "bounds",
    count: SENTINEL_CALLER_ID + 1,
    min: 0,
    max: SENTINEL_CALLER_ID,
    idListSha256: "unused-by-scorePrediction-in-this-test",
  };

  it("scoring a synthetic query never surfaces the sentinel gold id in the returned attempt, the receipt, or the written artifact file", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "stz-strip-boundary-"));
    const attempt = scorePrediction({
      queryId: 1,
      predDict: { [String(SENTINEL_CALLER_ID)]: 0.9 },
      outputDir,
      poolManifest,
      execFn,
    });

    // Sanity: the probe actually reached the "scored" outcome, not some
    // early-return path that would make the absence assertions below
    // vacuous for an unrelated reason.
    expect(attempt.outcome.outcome).toBe("scored");

    const sentinel = String(SENTINEL_GOLD_ID);
    expect(JSON.stringify(attempt)).not.toContain(sentinel);
    expect(JSON.stringify(attempt.receipt)).not.toContain(sentinel);
    expect(readFileSync(attempt.artifactPath, "utf8")).not.toContain(sentinel);
  });

  it("the taint probe's own control: the sentinel gold id IS present in the injected execFn's captured output, proving a route existed and the bridge closed it rather than the sentinel never having been reachable", () => {
    expect(fakeStdout).toContain(String(SENTINEL_GOLD_ID));
  });
});
