/**
 * Collaborative round -- committed pair reading (Phase 23 -- Ablation gate +
 * powered STaRK round, Plan 23-04, D-02/D-14). `experiments/collab-round/`
 * is the round's OWN study home -- a sibling of `experiments/collab-design/`,
 * the frozen-design directory, which stays free of every run artifact,
 * driver, probe and launcher (D-14). This file only reads; it has no
 * filesystem write capability at all.
 *
 * The extraction convention below is the paired-comparison arm's own
 * single-marker-then-first-fence idiom
 * (`experiments/paired-comparison-arm/_w-search.ts`'s
 * `extractAgentSystemPromptFromDefinitionFile`), applied TWICE -- once per
 * role -- rather than a new markdown parser. Two distinct markers, each
 * followed by exactly one fenced block; nothing outside a fence is ever
 * transmitted to either role.
 *
 * Prompt text is read at a PINNED COMMIT, through git, never the working
 * tree (D-02): a later, uncommitted edit to a pair file leaves the round's
 * already-recorded joint hash (the specimen id) unchanged and the recorded
 * prompt text unchanged. Shape mirrors `_paired-study.ts`'s
 * `readCommittedArmDefinitionSystemPrompt` -- re-derived here, never
 * imported from that module or from anywhere under
 * `experiments/paired-comparison-arm/`.
 */
import { execFileSync } from "node:child_process";
import { makeCollaborativeCandidate, type CollaborativeCandidate } from "../../src/foundry/collaborative-runner.js";

export class CollabPairsError extends Error {
  constructor(message: string) {
    super(`[collab-round:collab-pairs] ${message}`);
    this.name = "CollabPairsError";
  }
}

// ── the two role markers -- each followed by exactly one fenced block ─────

export const BUILDER_PROMPT_MARKER = "Builder System Prompt";
export const ANSWERER_PROMPT_MARKER = "Answerer System Prompt";

/**
 * `_w-search.ts`'s `extractAgentSystemPromptFromDefinitionFile` algorithm,
 * generalised with an explicit `marker` argument so one function serves
 * both roles: find the marker, take the text after it, find the first fence
 * opening, skip to the end of that opening line, find the closing fence,
 * return the body with one trailing newline trimmed. Calling this twice
 * with two distinct markers on the same file text is what keeps the two
 * roles' extractions from bleeding into each other -- each call only ever
 * looks for its own marker's FIRST fence, so content after the other role's
 * marker never enters this call's fence search.
 */
export function extractRolePromptFromPairFile(markdown: string, marker: string): string {
  const markerIdx = markdown.indexOf(marker);
  if (markerIdx === -1) {
    throw new CollabPairsError(`marker ${JSON.stringify(marker)} not found`);
  }
  const afterMarker = markdown.slice(markerIdx + marker.length);
  const fenceStart = afterMarker.indexOf("```");
  if (fenceStart === -1) {
    throw new CollabPairsError(`no fenced block found after marker ${JSON.stringify(marker)}`);
  }
  const afterFenceOpen = afterMarker.slice(fenceStart + 3);
  const firstNewline = afterFenceOpen.indexOf("\n");
  const body = firstNewline === -1 ? afterFenceOpen : afterFenceOpen.slice(firstNewline + 1);
  const fenceEnd = body.indexOf("```");
  if (fenceEnd === -1) {
    throw new CollabPairsError(`unterminated fenced block after marker ${JSON.stringify(marker)}`);
  }
  return body.slice(0, fenceEnd).replace(/\n$/, "");
}

// ── the three committed pair files, in a fixed, deterministic order ───────

export const PAIR_FILES = Object.freeze([
  "_pair-conservative-prune.md",
  "_pair-relation-focused.md",
  "_pair-breadth.md",
] as const);

const COLLAB_ROUND_DIR_FROM_REPO_ROOT = "experiments/collab-round";

/**
 * Shape mirrors `_paired-study.ts`'s own git-show invocation: argv array,
 * no shell (WR-04) -- `gitShowFn` is an additive, optional testability seam
 * (Rule 3 precedent: `RunCollaborativeBatteryArgs.execFn`,
 * `RunScoringPreflightArgs.execFn` in `collaborative-runner.ts`/
 * `collaborative-scoring-bridge.ts`). Absent, this behaves exactly as a
 * direct `execFileSync` call against the real `git` binary.
 */
export type GitShowFn = (file: string, args: readonly string[]) => string;

const defaultGitShowFn: GitShowFn = (file, args) => execFileSync(file, [...args], { encoding: "utf8" });

/**
 * Reads the EXACT committed blob at `commit:path` -- never the working
 * tree. This function has no other filesystem or `fs` import at all, so
 * there is no fallback path to fall back to; any failure (bad commit, bad
 * path, `git` missing) throws, naming both the commit and the path.
 */
export function readCommittedPairFile(commit: string, relPath: string, gitShowFn: GitShowFn = defaultGitShowFn): string {
  const pathFromRepoRoot = `${COLLAB_ROUND_DIR_FROM_REPO_ROOT}/${relPath}`;
  try {
    return gitShowFn("git", ["show", `${commit}:${pathFromRepoRoot}`]);
  } catch (e) {
    throw new CollabPairsError(
      `could not read ${commit}:${pathFromRepoRoot} via git show: ${(e as Error).message}`,
    );
  }
}

export interface CommittedPair {
  relPath: string;
  builderPrompt: string;
  answererPrompt: string;
  candidate: CollaborativeCandidate;
}

/**
 * `PAIR_FILES`, in order, each read at `commit`, extracted into its two
 * role prompts, and minted into a `CollaborativeCandidate` by the Phase 22
 * candidate constructor (`makeCollaborativeCandidate`) -- the joint hash is
 * never re-derived here, only consumed. Asserts the three resulting
 * specimen ids are pairwise distinct (T-23-19): two identical pairs would
 * silently collapse the round to fewer candidates than the round believes
 * it is running, so a collision is a named refusal, not a quiet drop.
 */
export function loadCommittedPairs(commit: string, gitShowFn: GitShowFn = defaultGitShowFn): CommittedPair[] {
  const pairs: CommittedPair[] = PAIR_FILES.map((relPath) => {
    const markdown = readCommittedPairFile(commit, relPath, gitShowFn);
    const builderPrompt = extractRolePromptFromPairFile(markdown, BUILDER_PROMPT_MARKER);
    const answererPrompt = extractRolePromptFromPairFile(markdown, ANSWERER_PROMPT_MARKER);
    const candidate = makeCollaborativeCandidate(builderPrompt, answererPrompt);
    return { relPath, builderPrompt, answererPrompt, candidate };
  });
  const relPathById = new Map<string, string>();
  for (const pair of pairs) {
    const collidesWith = relPathById.get(pair.candidate.id);
    if (collidesWith) {
      throw new CollabPairsError(
        `specimen id collision: ${pair.relPath} and ${collidesWith} both produce id ${pair.candidate.id} -- ` +
          `two identical pairs would silently collapse the round to fewer candidates than it believes it is running`,
      );
    }
    relPathById.set(pair.candidate.id, pair.relPath);
  }
  return pairs;
}
