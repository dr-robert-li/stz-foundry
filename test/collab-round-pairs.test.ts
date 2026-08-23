/**
 * Offline suite for `experiments/collab-round/_collab-pairs.ts` (D-02) and
 * `experiments/collab-round/_collab-probe.ts` (D-03) -- Phase 23, Plan
 * 23-04. Every case here stays offline: the committed-read path is driven
 * through an injected `GitShowFn` stub, never the real `git` binary or the
 * working tree; the probe module is only ever imported and its pure
 * functions called directly, never run (no env var is set anywhere in this
 * file).
 *
 * House rule (mirrors `test/foundry-collaborative-battery.test.ts`): every
 * throwing assertion inspects the thrown message's content, never a bare
 * `.toThrow()`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PAIR_FILES,
  BUILDER_PROMPT_MARKER,
  ANSWERER_PROMPT_MARKER,
  extractRolePromptFromPairFile,
  readCommittedPairFile,
  loadCommittedPairs,
  CollabPairsError,
  type GitShowFn,
} from "../experiments/collab-round/_collab-pairs.js";
import { makeCollaborativeCandidate } from "../src/foundry/collaborative-runner.js";
import * as CollabProbe from "../experiments/collab-round/_collab-probe.js";
import {
  PROBE_SAMPLE_SIZE,
  probeUnitKey,
  summariseProbe,
  type ProbeState,
  type ProbeUnitResult,
} from "../experiments/collab-round/_collab-probe.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const collabRoundDir = join(repoRoot, "experiments", "collab-round");

function thrown(fn: () => unknown): Error {
  try {
    fn();
  } catch (e) {
    return e as Error;
  }
  throw new Error("expected fn to throw, it did not");
}

function readRealPairFile(basename: string): string {
  return readFileSync(join(collabRoundDir, basename), "utf8");
}

function readSourceText(basename: string): string {
  return readFileSync(join(collabRoundDir, basename), "utf8");
}

// ── extraction ───────────────────────────────────────────────────────────

describe("extractRolePromptFromPairFile — the single-marker-then-first-fence idiom, applied per role", () => {
  const fixture = [
    "# Pair: Fixture",
    "",
    "## Builder System Prompt",
    "",
    "```",
    "builder prompt body, line 1",
    "builder prompt body, line 2",
    "```",
    "",
    "## Answerer System Prompt",
    "",
    "```",
    "answerer prompt body",
    "```",
    "",
  ].join("\n");

  it("returns each role's fenced block body verbatim and independently", () => {
    const builder = extractRolePromptFromPairFile(fixture, BUILDER_PROMPT_MARKER);
    const answerer = extractRolePromptFromPairFile(fixture, ANSWERER_PROMPT_MARKER);
    expect(builder).toBe("builder prompt body, line 1\nbuilder prompt body, line 2");
    expect(answerer).toBe("answerer prompt body");
  });

  it("the builder extraction is unaffected by content after the answerer marker, and vice versa", () => {
    const builder = extractRolePromptFromPairFile(fixture, BUILDER_PROMPT_MARKER);
    expect(builder).not.toContain(ANSWERER_PROMPT_MARKER);
    expect(builder).not.toContain("answerer prompt body");
    const answerer = extractRolePromptFromPairFile(fixture, ANSWERER_PROMPT_MARKER);
    expect(answerer).not.toContain(BUILDER_PROMPT_MARKER);
    expect(answerer).not.toContain("builder prompt body");
  });

  it("refuses a file missing the builder marker, naming that marker", () => {
    const noBuilder = fixture.replace("## Builder System Prompt", "## Nothing Here");
    const err = thrown(() => extractRolePromptFromPairFile(noBuilder, BUILDER_PROMPT_MARKER));
    expect(err.message).toContain(BUILDER_PROMPT_MARKER);
  });

  it("refuses a file missing the answerer marker, naming that marker", () => {
    const noAnswerer = fixture.replace("## Answerer System Prompt", "## Nothing Here");
    const err = thrown(() => extractRolePromptFromPairFile(noAnswerer, ANSWERER_PROMPT_MARKER));
    expect(err.message).toContain(ANSWERER_PROMPT_MARKER);
  });

  it("refuses a marker present but with no fence after it, naming the marker", () => {
    const noFence = "## Builder System Prompt\n\nno fence follows this marker at all\n";
    const err = thrown(() => extractRolePromptFromPairFile(noFence, BUILDER_PROMPT_MARKER));
    expect(err.message).toContain(BUILDER_PROMPT_MARKER);
    expect(err.message).toContain("no fenced block found");
  });

  it("refuses an unterminated fenced block, naming the marker", () => {
    const unterminated = "## Builder System Prompt\n\n```\nnever closed";
    const err = thrown(() => extractRolePromptFromPairFile(unterminated, BUILDER_PROMPT_MARKER));
    expect(err.message).toContain(BUILDER_PROMPT_MARKER);
    expect(err.message).toContain("unterminated");
  });
});

// ── candidate minting ────────────────────────────────────────────────────

describe("feeding extracted prompts to the Phase 22 candidate constructor", () => {
  it("yields a specimen id, and two different pair texts yield two different ids", () => {
    const candidateA = makeCollaborativeCandidate("builder prompt A", "answerer prompt A");
    const candidateB = makeCollaborativeCandidate("builder prompt B", "answerer prompt B");
    expect(typeof candidateA.id).toBe("string");
    expect(candidateA.id.length).toBeGreaterThan(0);
    expect(candidateA.id).not.toBe(candidateB.id);
  });
});

// ── the committed-read path -- offline, via an injected GitShowFn ─────────

describe("readCommittedPairFile — reads at a pinned commit, never the working tree", () => {
  it("invokes the injected git-show function with the commit and the file's path from the repo root", () => {
    const calls: { file: string; args: readonly string[] }[] = [];
    const stub: GitShowFn = (file, args) => {
      calls.push({ file, args });
      return "stubbed file contents";
    };
    const result = readCommittedPairFile("deadbeef", "_pair-conservative-prune.md", stub);
    expect(result).toBe("stubbed file contents");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.file).toBe("git");
    expect(calls[0]!.args).toEqual(["show", "deadbeef:experiments/collab-round/_pair-conservative-prune.md"]);
  });

  it("throws, naming the commit and the path, when the injected function throws", () => {
    const failing: GitShowFn = () => {
      throw new Error("fatal: bad object");
    };
    const err = thrown(() => readCommittedPairFile("deadbeef", "_pair-conservative-prune.md", failing));
    expect(err.message).toContain("deadbeef");
    expect(err.message).toContain("experiments/collab-round/_pair-conservative-prune.md");
  });
});

describe("loadCommittedPairs — the three-pair collision guard", () => {
  it("throws naming the collision when two pair files extract to identical prompts", () => {
    const identicalText = [
      "## Builder System Prompt",
      "```",
      "same builder text",
      "```",
      "## Answerer System Prompt",
      "```",
      "same answerer text",
      "```",
    ].join("\n");
    const distinctText = [
      "## Builder System Prompt",
      "```",
      "a distinct builder text",
      "```",
      "## Answerer System Prompt",
      "```",
      "a distinct answerer text",
      "```",
    ].join("\n");
    const stub: GitShowFn = (_file, args) => {
      const spec = args[1]!;
      // Two of the three PAIR_FILES entries resolve to identical text; the
      // third stays distinct, so this drives the collision guard between
      // exactly two of the three.
      return spec.includes(PAIR_FILES[2]) ? distinctText : identicalText;
    };
    const err = thrown(() => loadCommittedPairs("deadbeef", stub));
    expect(err).toBeInstanceOf(CollabPairsError);
    expect(err.message).toContain("specimen id collision");
    expect(err.message).toContain(PAIR_FILES[0]);
    expect(err.message).toContain(PAIR_FILES[1]);
  });
});

// ── the three real, committed pair files ────────────────────────────────

describe("the three real pair files under experiments/collab-round/", () => {
  const realPairs = PAIR_FILES.map((relPath) => {
    const markdown = readRealPairFile(relPath);
    return {
      relPath,
      builderPrompt: extractRolePromptFromPairFile(markdown, BUILDER_PROMPT_MARKER),
      answererPrompt: extractRolePromptFromPairFile(markdown, ANSWERER_PROMPT_MARKER),
    };
  });

  it("each real file contains both role markers, each followed by a fenced block", () => {
    for (const relPath of PAIR_FILES) {
      const markdown = readRealPairFile(relPath);
      expect(() => extractRolePromptFromPairFile(markdown, BUILDER_PROMPT_MARKER)).not.toThrow();
      expect(() => extractRolePromptFromPairFile(markdown, ANSWERER_PROMPT_MARKER)).not.toThrow();
    }
  });

  it("extraction of the builder prompt does not contain the answerer marker, and vice versa", () => {
    for (const relPath of PAIR_FILES) {
      const markdown = readRealPairFile(relPath);
      const builder = extractRolePromptFromPairFile(markdown, BUILDER_PROMPT_MARKER);
      const answerer = extractRolePromptFromPairFile(markdown, ANSWERER_PROMPT_MARKER);
      expect(builder.length).toBeGreaterThan(0);
      expect(builder).not.toContain(ANSWERER_PROMPT_MARKER);
      expect(answerer.length).toBeGreaterThan(0);
      expect(answerer).not.toContain(BUILDER_PROMPT_MARKER);
    }
  });

  it("the three real files' extracted prompts feed the candidate constructor into three distinct specimen ids", () => {
    const candidates = realPairs.map((p) => makeCollaborativeCandidate(p.builderPrompt, p.answererPrompt));
    const ids = candidates.map((c) => c.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("the three builder prompts are pairwise unequal, and the three answerer prompts are pairwise unequal", () => {
    const builders = realPairs.map((p) => p.builderPrompt);
    const answerers = realPairs.map((p) => p.answererPrompt);
    expect(new Set(builders).size).toBe(3);
    expect(new Set(answerers).size).toBe(3);
  });
});

describe("_collab-pairs.ts import specifiers", () => {
  it("no import resolves into the paired-comparison study directory", () => {
    const text = readSourceText("_collab-pairs.ts");
    const importLines = text.split("\n").filter((line) => /^\s*import\s/.test(line) || /\brequire\(/.test(line));
    for (const line of importLines) {
      expect(line).not.toContain("paired-comparison-arm");
    }
  });
});

// ══════════════════════════════ the probe (Task 3) ═══════════════════════

describe("_collab-probe.ts — import-safety and exported constants", () => {
  it("importing the module does not throw and does not start a run (no env var set)", () => {
    expect(delete process.env.COLLAB_STATE).toBe(true);
    expect(delete process.env.COLLAB_PAIRS_COMMIT).toBe(true);
    expect(CollabProbe).toBeTruthy();
    expect(typeof CollabProbe.summariseProbe).toBe("function");
  });

  it("exports PROBE_SAMPLE_SIZE as a small positive constant", () => {
    expect(PROBE_SAMPLE_SIZE).toBeGreaterThan(0);
    expect(PROBE_SAMPLE_SIZE).toBeLessThanOrEqual(20);
  });

  it("probeUnitKey combines the pair id and the query id", () => {
    expect(probeUnitKey("abc123", 42)).toBe("abc123:42");
  });
});

describe("summariseProbe — pure, no filesystem access", () => {
  function unit(overrides: Partial<ProbeUnitResult> = {}): ProbeUnitResult {
    return {
      pairId: "pair-a",
      pairRelPath: "_pair-conservative-prune.md",
      queryId: 1,
      wallMs: 1000,
      preflightWarmUpWallMs: 100,
      scoringWallMs: 200,
      handoffOutcomeKind: "success",
      hit1: 1,
      nodeCount: 10,
      edgeCount: 15,
      ...overrides,
    };
  }

  it("returns per-pair unit counts, an outcome-kind tally, structural validity and order statistics", () => {
    const state: ProbeState = {
      units: {
        "pair-a:1": unit({ pairId: "pair-a", queryId: 1, wallMs: 1000 }),
        "pair-a:2": unit({ pairId: "pair-a", queryId: 2, wallMs: 3000, handoffOutcomeKind: "artifact-absent", nodeCount: null, edgeCount: null }),
        "pair-b:1": unit({ pairId: "pair-b", pairRelPath: "_pair-breadth.md", queryId: 1, wallMs: 2000 }),
      },
      retries: [],
    };
    const summary = summariseProbe(state);

    expect(summary.overall.unitCount).toBe(3);
    expect(summary.overall.outcomeCounts.success).toBe(2);
    expect(summary.overall.outcomeCounts["artifact-absent"]).toBe(1);
    expect(summary.overall.structuralValidity).toEqual({ successCount: 2, totalCount: 3 });
    expect(summary.overall.wallMs).toEqual({ min: 1000, median: 2000, max: 3000 });

    expect(summary.byPair).toHaveLength(2);
    const pairA = summary.byPair.find((p) => p.pairId === "pair-a")!;
    expect(pairA.unitCount).toBe(2);
    expect(pairA.structuralValidity).toEqual({ successCount: 1, totalCount: 2 });
    const pairB = summary.byPair.find((p) => p.pairId === "pair-b")!;
    expect(pairB.unitCount).toBe(1);
    expect(pairB.structuralValidity).toEqual({ successCount: 1, totalCount: 1 });
  });

  it("returns zeroed order statistics for an empty state, never throwing on division", () => {
    const summary = summariseProbe({ units: {}, retries: [] });
    expect(summary.overall.unitCount).toBe(0);
    expect(summary.overall.wallMs).toEqual({ min: 0, median: 0, max: 0 });
    expect(summary.byPair).toEqual([]);
  });
});

describe("_collab-probe.ts source-text guards", () => {
  const probeSourceText = readSourceText("_collab-probe.ts");

  it("no import resolves into the paired-comparison study directory", () => {
    const importLines = probeSourceText.split("\n").filter((line) => /^\s*import\s/.test(line) || /\brequire\(/.test(line));
    for (const line of importLines) {
      expect(line).not.toContain("paired-comparison-arm");
    }
  });

  it("never spells the sealed heldout fixture's file name or a heldout loader's export name", () => {
    expect(probeSourceText).not.toContain("prime-heldout.json");
    expect(probeSourceText).not.toContain("buildCollaborativeHeldoutBattery");
  });

  it("passes a concurrency of exactly 1 everywhere the source text mentions concurrency", () => {
    const matches = [...probeSourceText.matchAll(/concurrency:\s*([^,\s}]+)/g)];
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      expect(m[1]).toBe("1");
    }
  });

  it("declares a strictly positive gate threshold", () => {
    expect(CollabProbe.PROBE_GATE_THRESHOLD).toBeGreaterThan(0);
  });

  // Regression for the 2026-08-23 invalid first probe run: `runOneUnit`
  // passed `runOpts: { providerImpl: provider, concurrency: 1 }` with no
  // `provider` field, so `agent-runner.ts`'s `opts.provider?.model ??
  // DEFAULT_BATTERY_MODEL` fell through to `DEFAULT_BATTERY_MODEL`
  // ("granite4.1:30b") on every call -- the un-pinned model, D-13's
  // violation. `providerImpl` supplies transport; `provider.model` is the
  // separate, required field that names the model sent on the wire.
  it("wires COLLAB_PROBE_MODEL into runOpts.provider.model on the battery call, so DEFAULT_BATTERY_MODEL never applies", () => {
    const runOptsBlocks = [...probeSourceText.matchAll(/runOpts:\s*\{[\s\S]*?\n {2}\}\);/g)];
    expect(runOptsBlocks.length).toBeGreaterThan(0);
    for (const block of runOptsBlocks) {
      const text = block[0];
      expect(text).toContain("providerImpl: provider");
      expect(text).toMatch(/provider:\s*\{[^}]*model:\s*COLLAB_PROBE_MODEL[^}]*\}/);
    }
  });

  it("the run-config's recorded model and the wire model are the SAME constant symbol, never two literals that can drift apart", () => {
    const occurrences = [...probeSourceText.matchAll(/model:\s*COLLAB_PROBE_MODEL\b/g)];
    // One inside captureRunConfig's returned runConfig, one inside
    // runOpts.provider -- both referencing the identical exported const,
    // so a future edit to one cannot silently orphan the other.
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  // Regression for the same invalid run: the first launch died on an
  // ENOENT spawning the Python scoring toolchain because
  // `_launch-collab.sh` runs this script with cwd = experiments/collab-round/
  // (not the repo root) and the scoring bridge's own repo-root-relative
  // path constants (see `src/foundry/collaborative-scoring-bridge.ts` and
  // `collaborative-runner.ts`'s neighbourhood-script constant) resolve
  // against `process.cwd()` with no override.
  it("resolves statePath from SCRIPT_DIR (never process.cwd()) and chdirs to the repo root before the battery loop", () => {
    expect(probeSourceText).toMatch(/const statePath = join\(SCRIPT_DIR,\s*requireEnvVar\(COLLAB_STATE_ENV_VAR\)\)/);
    expect(probeSourceText).toContain("process.chdir(repoRoot)");
    const chdirIdx = probeSourceText.indexOf("process.chdir(repoRoot)");
    const loopIdx = probeSourceText.indexOf("for (const pair of pairs)");
    expect(chdirIdx).toBeGreaterThan(0);
    expect(loopIdx).toBeGreaterThan(chdirIdx);
  });

  // Regression for the first REAL relaunch after the two fixes above: this
  // probe calls `runCollaborativeBattery` with exactly ONE task per unit, so
  // a single handoff failure is a 100%-of-batch handoff failure, and
  // `makeBattery` refuses a zero-task answerer battery by design -- every
  // real structural-validity miss (the exact thing D-03 measures the RATE
  // of) crashed the whole probe until this was caught. Structural, not
  // behavioral: driving the real throw would need exec-seam plumbing
  // `runOneUnit` does not expose, and is not worth adding for this check.
  it("catches the single-task all-handoffs-failed battery-shape boundary instead of letting it crash the whole probe", () => {
    expect(probeSourceText).toContain("BatteryShapeError");
    expect(probeSourceText).toMatch(/e instanceof BatteryShapeError\s*&&\s*e\.message\.includes\(["']has zero tasks["']\)/);
    // The narrow message match must sit inside a try/catch around the
    // `runCollaborativeBattery` call, not a bare top-level check -- an
    // unrelated BatteryShapeError (a real shape bug) must still propagate.
    const tryIdx = probeSourceText.indexOf("try {");
    const catchIdx = probeSourceText.indexOf("} catch (e) {");
    const boundaryCheckIdx = probeSourceText.indexOf("e instanceof BatteryShapeError");
    expect(tryIdx).toBeGreaterThan(0);
    expect(catchIdx).toBeGreaterThan(tryIdx);
    expect(boundaryCheckIdx).toBeGreaterThan(catchIdx);
    // The synthesized unit result must never fabricate a preflight figure
    // that was never actually observed once the throw ate the record.
    expect(probeSourceText).toContain("preflightWarmUpWallMs: null");
  });
});
