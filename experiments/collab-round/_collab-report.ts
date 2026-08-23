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

// ── Promotion-refusal terminal state (D-12) ──────────────────────────────

/** D-12: a promotion-refusal round renders as its own named terminal
 *  outcome, the refusal reason carried through, and an explicit statement
 *  that the sealed heldout suite was never spent -- no gate block, no
 *  headline figures, because there are none. */
function renderPromotionRefusal(verdict: CollabRoundVerdict): string[] {
  const pv = verdict.diagnostics.selection.promotionVerdict;
  return [
    "## Terminal outcome",
    "",
    `PROMOTION-REFUSED -- the selection round's winner was not promoted. Reason: ${pv.reason}`,
    "",
    "The sealed heldout suite `prime-heldout.json` and its no-subgraph null arm were never spent for this " +
      "round -- no query in the heldout suite was evaluated by either arm, so no gate block or headline " +
      "figure is rendered below.",
    "",
  ];
}

// ── Diagnostics section (D-11) ────────────────────────────────────────────

function renderArmDiagnosticsLine(label: string, d: CollabRoundArmDiagnostics, total: number): string {
  return (
    `${label}: MRR=${d.meanReciprocalRank.toFixed(4)}, hit@5=${d.hitAt5Count}/${total}, ` +
    `recall@20=${d.recallAt20.toFixed(4)}, input tokens=${d.inputTokenCount}, errors=${d.errorCount}/${total}, ` +
    `non-completions=${d.nonCompletionCount}/${total}.`
  );
}

/** D-11's full secondary diagnostic set: per-arm MRR/hit@5/recall@20/token
 *  count/error and non-completion counts, the per-query handoff-outcome
 *  tally (D-08's degeneracy diagnostic among its rows, one row per kind the
 *  runner declares -- `HANDOFF_OUTCOME_KINDS` -- so an absent kind is
 *  visibly zero rather than silently missing). */
function renderDiagnosticsSection(verdict: CollabRoundVerdict): string[] {
  const total = verdict.gate.counts.pairs;
  const d = verdict.diagnostics;
  const lines: string[] = ["## Diagnostics", ""];

  lines.push(renderArmDiagnosticsLine("Graph-handoff arm", d.graph, total));
  lines.push(renderArmDiagnosticsLine("No-subgraph null arm", d.nullArm, total));
  lines.push("");

  lines.push("### Handoff-outcome tally");
  lines.push("");
  lines.push("| kind | count |");
  lines.push("|---|---|");
  for (const kind of HANDOFF_OUTCOME_KINDS) {
    lines.push(`| ${kind} | ${d.handoffOutcomeTally[kind] ?? 0} |`);
  }
  lines.push("");

  lines.push("### Degeneracy diagnostic (CD-05 structural bounds)");
  lines.push("");
  lines.push(
    `Structural-bounds violations (\`cd05-violation\`): ${d.handoffOutcomeTally["cd05-violation"] ?? 0} of ${total}. ` +
      "This is a diagnostic reading of the structural-bounds arm (design §5's harmonizing reading) -- a " +
      "diagnostic family member, never a verdict.",
  );
  lines.push("");
  return lines;
}

/** One row per unit record, in the order the records appear -- mirrors
 *  `_paired-report.ts`'s per-unit table column style. */
function renderPerUnitTable(verdict: CollabRoundVerdict): string[] {
  const lines: string[] = [
    "## Per-unit records",
    "",
    "| query id | arm | handoff outcome | hit@1 | wall time (ms) |",
    "|---|---|---|---|---|",
  ];
  for (const u of verdict.unitRecords) {
    lines.push(`| ${u.queryId} | ${u.arm} | ${u.handoffOutcomeKind} | ${u.hit1} | ${u.wallTimeMs} |`);
  }
  lines.push("");
  return lines;
}

/** One line per recorded retry -- states that a retried unit still appears
 *  exactly once in the per-unit table, so a reader does not double-count
 *  (D-16). */
function renderRetriesSection(verdict: CollabRoundVerdict): string[] {
  const lines: string[] = ["## Retries", ""];
  if (verdict.retries.length === 0) {
    lines.push("No retries were recorded for this round.");
  } else {
    for (const r of verdict.retries) {
      lines.push(`- ${r} -- the retried unit still appears exactly once in the per-unit table above.`);
    }
  }
  lines.push("");
  return lines;
}

/** The selection-round section: per pair, the specimen id, the pair file's
 *  basename and the search-half fitness; then the winner; then the
 *  promotion verdict with its reason. The reward-scale caution names that
 *  the fitness figure is the compressed adapter reward, not raw hit@1. */
function renderSelectionSection(verdict: CollabRoundVerdict): string[] {
  const sel = verdict.diagnostics.selection;
  const lines: string[] = [
    "## Selection round",
    "",
    "| specimen id | pair file | search fitness |",
    "|---|---|---|",
  ];
  for (const p of sel.pairs) {
    lines.push(`| ${p.specimenId} | ${p.pairFileBasename} | ${p.searchFitness.toFixed(4)} |`);
  }
  lines.push("");
  lines.push(`Winner: ${sel.winner ?? "none"}.`);
  lines.push(
    `Promotion verdict: ${sel.promotionVerdict.promote ? "PROMOTED" : "REFUSED"} -- ${sel.promotionVerdict.reason}`,
  );
  lines.push("");
  lines.push(
    "Reward-scale caution: the search fitness figure above is the compressed adapter reward, not raw hit@1 -- " +
      "do not compare it directly against a hit rate.",
  );
  lines.push("");
  return lines;
}

/** A definition list over the run-config fields, human-readable without
 *  opening the JSON artifact. */
function renderRunConfigSection(verdict: CollabRoundVerdict): string[] {
  const c = verdict.runConfig;
  return [
    "## Run configuration",
    "",
    `- Repository commit: ${c.repoCommit}`,
    `- Pair-file commit: ${c.pairFileCommit}`,
    `- Model: ${c.modelName} @ ${c.modelDigest}`,
    `- Per-call ceiling: ${c.perCallCeilingMs}ms`,
    `- Concurrency: ${c.concurrency}`,
    `- Accuracy-gate threshold: ${c.gateThreshold}`,
    `- Interleaving: ${c.interleaving}`,
    `- Manifest hashes: ${JSON.stringify(c.manifestHashes)}`,
    `- Critical-value table hash: ${c.criticalValueTableHash}`,
    `- Archive: ${c.archiveRoot} / slot ${c.archiveSlot}`,
    `- Warm-up query id: ${c.warmUpQueryId}`,
    `- Arm commits: graph=${verdict.armCommits.graph}, no-subgraph=${verdict.armCommits["no-subgraph"]}`,
    "",
  ];
}

// ── The renderer ─────────────────────────────────────────────────────────

/**
 * Renders the round's verdict artifact as markdown. Its first action is the
 * completion-marker refusal: a partial run (`complete !== true`) cannot be
 * rendered as a result. A `PROMOTION-REFUSED` round renders only the
 * terminal-outcome, selection-round and run-configuration sections (D-12) --
 * there is no gate block and no headline figure because none were spent.
 * Every other outcome renders the gate block first (D-09), ahead of every
 * headline figure, followed by the full diagnostic set (D-11).
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

  if (verdict.outcome === "PROMOTION-REFUSED") {
    lines.push(...renderPromotionRefusal(verdict));
    lines.push(...renderSelectionSection(verdict));
    lines.push(...renderRunConfigSection(verdict));
    return lines.join("\n");
  }

  lines.push(...renderGateSection(verdict));
  lines.push(...renderHeadlineSection(verdict));
  lines.push(...renderDiagnosticsSection(verdict));
  lines.push(...renderPerUnitTable(verdict));
  lines.push(...renderRetriesSection(verdict));
  lines.push(...renderSelectionSection(verdict));
  lines.push(...renderRunConfigSection(verdict));

  return lines.join("\n");
}
