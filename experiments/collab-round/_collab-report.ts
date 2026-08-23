/**
 * The C-01 collaborative round's verdict artifact shape and its pure
 * markdown renderer (Phase 23 -- Ablation gate + powered STaRK round,
 * Plan 23-05, REQ-81/REQ-82; D-09/D-10/D-11/D-12 in
 * `.planning/phases/23-ablation-gate-powered-stark-round/23-CONTEXT.md`).
 *
 * This module owns the verdict artifact's declared shape (D-10) and the
 * pure renderer over it -- the driver (a later plan) imports the shape and
 * satisfies it, so there is exactly one definition of what a completed
 * round looks like on disk. `renderCollabRoundReport` performs no input or
 * output of its own: no filesystem access, no clock, no environment read,
 * and no network call anywhere in this file. Writing the returned string to
 * disk is the caller's job -- mirrors
 * `experiments/paired-comparison-arm/_paired-report.ts`'s own discipline.
 *
 * The gate section is first by construction (D-09): a reader cannot reach
 * either arm's headline hit@1 number without first passing the gate
 * section. On a primary-gate FAIL every headline figure is printed anyway,
 * but every occurrence carries an explicit not-meaningful label naming the
 * bypass-defense failure -- the number is never withheld and never printed
 * unlabelled.
 *
 * The gate verdict itself is never recomputed here: `renderCollabRoundReport`
 * reads `verdict.gate`'s fields exactly as `collaborative-ablation-gate.ts`
 * produced them and performs no comparison of its own. The only arithmetic
 * in this module is presentation-only percentage-point conversion beside the
 * whole-query count the gate itself compared (REQ-81 precision) -- the
 * renderer never re-derives the PASS/FAIL/flag booleans.
 */
import type { AblationGateVerdict } from "../../src/foundry/collaborative-ablation-gate.js";
import { HANDOFF_OUTCOME_KINDS, type HandoffOutcomeKind } from "../../src/foundry/collaborative-runner.js";

// ── Round-level outcome taxonomy ────────────────────────────────────────

/**
 * Round-level terminal outcomes, owned by this module and the driver -- the
 * gate module (`collaborative-ablation-gate.ts`) owns only the gate-scoped
 * PASS/FAIL result; promotion knowledge never enters the pure gate.
 */
export const COLLAB_ROUND_OUTCOMES = ["GATE-PASS", "GATE-FAIL", "PROMOTION-REFUSED"] as const;
export type CollabRoundOutcome = (typeof COLLAB_ROUND_OUTCOMES)[number];

/** Exhaustiveness record, same idiom `collaborative-ablation-gate.ts` uses
 *  for `AblationSignTestResult`: a member added to `COLLAB_ROUND_OUTCOMES`
 *  without a matching key here, or a stray key matching no member, is a
 *  typecheck failure. */
const ALL_COLLAB_ROUND_OUTCOMES: Record<CollabRoundOutcome, true> = {
  "GATE-PASS": true,
  "GATE-FAIL": true,
  "PROMOTION-REFUSED": true,
};
void ALL_COLLAB_ROUND_OUTCOMES;

// ── Artifact interfaces (D-10) ───────────────────────────────────────────

export type CollabRoundArm = "graph" | "no-subgraph";

/** One heldout unit. */
export interface CollabRoundUnitRecord {
  arm: CollabRoundArm;
  queryId: number;
  handoffOutcomeKind: HandoffOutcomeKind;
  /** 0 or 1 -- a non-completion is already recorded here as 0 by the
   *  driver, per §7's non-completion-as-miss discipline. */
  hit1: number;
  wallTimeMs: number;
  /** The scoring attempt's own reported wall time, present only when the
   *  task actually reached the bridge (mirrors
   *  `CollaborativeTaskOutcome.attempt` being optional). */
  scoringAttemptWallTimeMs?: number;
  /** Every other metric the bridge reported for this unit, diagnostics only
   *  -- mirrors `CollaborativeTaskOutcome.diagnostics`. */
  diagnostics: Record<string, number>;
}

export interface CollabRoundRunConfig {
  repoCommit: string;
  pairFileCommit: string;
  modelName: string;
  modelDigest: string;
  perCallCeilingMs: number;
  concurrency: number;
  gateThreshold: number;
  interleaving: string;
  manifestHashes: Record<string, string>;
  criticalValueTableHash: string;
  archiveRoot: string;
  archiveSlot: string;
  warmUpQueryId: number;
}

export interface CollabRoundArmDiagnostics {
  meanReciprocalRank: number;
  hitAt5Count: number;
  recallAt20: number;
  inputTokenCount: number;
  errorCount: number;
  nonCompletionCount: number;
}

export interface CollabRoundSelectionPair {
  specimenId: string;
  pairFileBasename: string;
  searchFitness: number;
}

export interface CollabRoundPromotionVerdict {
  promote: boolean;
  /** The refusal reason (or "promoted" on success) -- carried verbatim from
   *  `promoteComponentWinner`'s own `PromotionVerdict.failed` list, joined,
   *  by the driver that builds this artifact. */
  reason: string;
}

export interface CollabRoundSelection {
  pairs: CollabRoundSelectionPair[];
  winner: string | null;
  promotionVerdict: CollabRoundPromotionVerdict;
}

export interface CollabRoundDiagnostics {
  graph: CollabRoundArmDiagnostics;
  nullArm: CollabRoundArmDiagnostics;
  /** One entry per `HandoffOutcomeKind` the runner declares -- the driver
   *  must populate every kind (zero where absent) so the report's table is
   *  complete by construction. */
  handoffOutcomeTally: Record<HandoffOutcomeKind, number>;
  selection: CollabRoundSelection;
}

export interface CollabRoundHeadline {
  graphHit1Count: number;
  graphHit1Rate: number;
  nullHit1Count: number;
  nullHit1Rate: number;
  /** False exactly when the primary bypass-defense gate failed -- every
   *  headline figure must then carry the not-meaningful label (D-09). */
  meaningful: boolean;
}

/**
 * D-10's declared verdict artifact shape. The report renders ONLY from this
 * object -- nothing downstream reads partial state.
 */
export interface CollabRoundVerdict {
  complete: boolean;
  outcome: CollabRoundOutcome;
  /** Read verbatim from `collaborative-ablation-gate.ts`'s own output --
   *  never recomputed here. */
  gate: AblationGateVerdict;
  headline: CollabRoundHeadline;
  diagnostics: CollabRoundDiagnostics;
  unitRecords: CollabRoundUnitRecord[];
  retries: string[];
  runConfig: CollabRoundRunConfig;
  armCommits: Record<CollabRoundArm, string>;
}

// ── Presentation-only helpers ────────────────────────────────────────────

/** The label every headline figure carries when the primary gate failed --
 *  a single named constant, routed through by `labelledFigure` below, so
 *  the labelling rule has exactly one place to audit. */
const NOT_MEANINGFUL_LABEL = "NOT MEANINGFUL (bypass-defense gate FAILED)";

/**
 * Routes a rendered figure through the not-meaningful labelling rule. The
 * ONLY place in this module that decides whether a figure carries the
 * label -- every headline occurrence must call this helper rather than
 * branching locally, so the rule stays auditable in one place (Task 2).
 */
function labelledFigure(text: string, meaningful: boolean): string {
  return meaningful ? text : `${text} -- ${NOT_MEANINGFUL_LABEL}`;
}

/** Presentation-only percentage-point conversion beside a whole-query count
 *  -- never used in any comparison, per REQ-81 precision (the count is the
 *  value the gate compared; this is display only). */
function pctOf(count: number, total: number): string {
  if (total === 0) return "n/a";
  return `${((count / total) * 100).toFixed(1)}pp`;
}

// ── Section builders ─────────────────────────────────────────────────────

function renderTitle(): string[] {
  return [
    "# Collaborative round -- results (REQ-81/REQ-82)",
    "",
    "This round evaluates the C-01 collaborative mode's promoted winner on the sealed " +
      "`prime-heldout.json` suite in two paired arms -- graph-handoff and the pre-registered " +
      "no-subgraph null -- against the frozen §7 pre-registration " +
      "(`experiments/collab-design/COLLAB-DESIGN.md`, frozen at `3569d25`).",
    "",
  ];
}

/** The gate block (D-09/D-10) -- always the first section after the title.
 *  Primary result, secondary flag, both margins, both paired hit counts,
 *  both computed differences, and the sign test (or its underpowered
 *  statement, G-18). */
function renderGateSection(verdict: CollabRoundVerdict): string[] {
  const g = verdict.gate;
  const total = g.counts.pairs;
  const lines: string[] = ["## Gate (§7 pre-registration)", ""];

  lines.push(
    `Primary bypass-defense gate: ${g.primaryPass ? "PASS" : "FAIL"} -- graph-handoff arm ` +
      `${g.counts.graphHits}/${total} hits, no-subgraph null arm ${g.counts.nullHits}/${total} hits, ` +
      `difference ${g.primaryDifference} (${pctOf(Math.abs(g.primaryDifference), total)}), margin δ1=${g.delta1} ` +
      `(${pctOf(g.delta1, total)}) -- inequality: graphHits - nullHits >= δ1.`,
  );
  lines.push(
    `Secondary do-no-harm flag: ${g.secondaryFlag ? "FIRED" : "not fired"} -- difference ` +
      `${g.secondaryDifference} (${pctOf(Math.abs(g.secondaryDifference), total)}), margin δ2=${g.delta2} ` +
      `(${pctOf(g.delta2, total)}) -- inequality: nullHits - graphHits >= δ2. The secondary flag cannot alter ` +
      `the primary result above.`,
  );

  const st = g.signTest;
  if (st.result === "UNDERPOWERED") {
    lines.push(
      `Sign test: discordant count n_d=${st.discordant} is below the precision floor -- UNDERPOWERED. This is ` +
        `a precision statement only; the primary margin gate above was still evaluated on the raw paired counts.`,
    );
  } else {
    lines.push(
      `Sign test: discordant count n_d=${st.discordant}, critical value c(n_d)=${st.criticalValue}, ` +
        `graph-only hits=${st.graphOnlyHits} -- classification: ${st.result}.`,
    );
  }
  lines.push("");
  return lines;
}

/** The headline block (D-09/D-10) -- both arms' hit@1, every figure routed
 *  through `labelledFigure` so a primary-gate FAIL cannot print a bare
 *  number. */
function renderHeadlineSection(verdict: CollabRoundVerdict): string[] {
  const h = verdict.headline;
  const heading = h.meaningful ? "## Headline" : `## Headline -- ${NOT_MEANINGFUL_LABEL}`;
  const lines: string[] = [heading, ""];

  lines.push(
    labelledFigure(
      `Graph-handoff arm hit@1: ${h.graphHit1Count}/${verdict.gate.counts.pairs} ` +
        `(${(h.graphHit1Rate * 100).toFixed(1)}%)`,
      h.meaningful,
    ),
  );
  lines.push(
    labelledFigure(
      `No-subgraph null arm hit@1: ${h.nullHit1Count}/${verdict.gate.counts.pairs} ` +
        `(${(h.nullHit1Rate * 100).toFixed(1)}%)`,
      h.meaningful,
    ),
  );
  lines.push("");
  return lines;
}

// ── Stub sections (filled by Task 2) ─────────────────────────────────────
// Emitting their headings now so section ordering is testable in Task 1 and
// the ordering assertions do not have to be rewritten once Task 2 fills
// these in.

function renderDiagnosticsSection(_verdict: CollabRoundVerdict): string[] {
  return ["## Diagnostics", "", "_(rendered in full by Task 2)_", ""];
}

function renderPerUnitTable(_verdict: CollabRoundVerdict): string[] {
  return ["## Per-unit records", "", "_(rendered in full by Task 2)_", ""];
}

function renderRetriesSection(_verdict: CollabRoundVerdict): string[] {
  return ["## Retries", "", "_(rendered in full by Task 2)_", ""];
}

function renderSelectionSection(_verdict: CollabRoundVerdict): string[] {
  return ["## Selection round", "", "_(rendered in full by Task 2)_", ""];
}

function renderRunConfigSection(_verdict: CollabRoundVerdict): string[] {
  return ["## Run configuration", "", "_(rendered in full by Task 2)_", ""];
}

// ── The renderer ─────────────────────────────────────────────────────────

/**
 * Renders the round's verdict artifact as markdown. Its first action is the
 * completion-marker refusal: a partial run (`complete !== true`) cannot be
 * rendered as a result. Then the gate block, always ahead of every headline
 * figure (D-09), followed by the remaining sections (Task 2 fills them in).
 */
export function renderCollabRoundReport(verdict: CollabRoundVerdict): string {
  if (verdict.complete !== true) {
    throw new Error(
      `[collab-round-report] verdict.complete must be exactly true, got ${JSON.stringify(verdict.complete)} -- ` +
        "a partial run cannot be rendered as a result",
    );
  }

  const lines: string[] = [];
  lines.push(...renderTitle());
  lines.push(...renderGateSection(verdict));
  lines.push(...renderHeadlineSection(verdict));
  lines.push(...renderDiagnosticsSection(verdict));
  lines.push(...renderPerUnitTable(verdict));
  lines.push(...renderRetriesSection(verdict));
  lines.push(...renderSelectionSection(verdict));
  lines.push(...renderRunConfigSection(verdict));

  return lines.join("\n");
}
