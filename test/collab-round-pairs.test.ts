/**
 * Offline suite for `experiments/collab-round/_collab-pairs.ts` (D-02) --
 * Phase 23, Plan 23-04, Task 1. Every case here stays offline: the
 * committed-read path is driven through an injected `GitShowFn` stub,
 * never the real `git` binary or the working tree.
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

// ── the real, committed pair file this task adds ────────────────────────

describe("the real _pair-conservative-prune.md file", () => {
  it("contains both role markers, each followed by a fenced block", () => {
    const markdown = readRealPairFile("_pair-conservative-prune.md");
    expect(() => extractRolePromptFromPairFile(markdown, BUILDER_PROMPT_MARKER)).not.toThrow();
    expect(() => extractRolePromptFromPairFile(markdown, ANSWERER_PROMPT_MARKER)).not.toThrow();
  });

  it("extraction of the builder prompt does not contain the answerer marker, and vice versa", () => {
    const markdown = readRealPairFile("_pair-conservative-prune.md");
    const builder = extractRolePromptFromPairFile(markdown, BUILDER_PROMPT_MARKER);
    const answerer = extractRolePromptFromPairFile(markdown, ANSWERER_PROMPT_MARKER);
    expect(builder.length).toBeGreaterThan(0);
    expect(builder).not.toContain(ANSWERER_PROMPT_MARKER);
    expect(answerer.length).toBeGreaterThan(0);
    expect(answerer).not.toContain(BUILDER_PROMPT_MARKER);
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
