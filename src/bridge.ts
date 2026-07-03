/**
 * The in-session orchestration bridge.
 *
 * STZ runs *inside* Claude Code: the orchestrator is the command-driven main
 * agent, which spawns specimen/judge/test-author/documenter work as Task
 * subagents. A Node process cannot call the Task tool, so the model layer lives
 * in the agent loop — but every *deterministic* decision (eval gate, hack
 * detection, GRPO, selection, state, audit) must stay exact and replayable.
 *
 * This module is that deterministic half, exposed as JSON-in / JSON-out
 * subcommands the `/stz-f:run` command calls between agent spawns. The command
 * owns spawn-and-collect; the bridge owns all compute. If a tally or comparison
 * is ever tempting to write in the command markdown, it belongs here instead.
 *
 *   stz bridge begin       --root D --manifest M.json
 *   stz bridge record-eval --root D --slice S --specimen X --metrics J.json
 *   stz bridge gate        --root D --slice S
 *   stz bridge record-votes--root D --slice S --votes V.json
 *   stz bridge select      --root D --slice S
 *   stz bridge finalize    --root D --slice S --intent I.json --asbuilt A.json
 *
 * Every subcommand prints a single JSON object on stdout (the command parses
 * it) and writes its durable artifacts into the `.stz/` tree.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import type {
  EvalResult,
  PairwiseVote,
  Phase,
  SliceManifest,
  ProjectManifest,
  ProjectPhase,
  ProjectSliceEntry,
  RunConfig,
  SpecimenId,
} from "./types.js";
import { PROJECT_PHASES } from "./types.js";
import { scaffold, writeDoc, readDoc, stzPath } from "./taxonomy.js";
import { freshState, saveState, loadState, stateExists, statePath, setPhaseStatus, appendEvent } from "./state.js";
import { verifyDebugCase, loadDebugCases, type DebugCase } from "./debug.js";
import { auditRoleTiers, tierOf } from "./tiers.js";
import { exploreCodebase, checkAnchor, type CodebaseMap, type SliceAnchor } from "./brownfield.js";
import { runIntegrationGate } from "./integration.js";
import {
  freshProjectState,
  saveProjectState,
  loadProjectState,
  projectStateExists,
  appendProjectEvent,
  projectManifestPath,
  PROJECT_PHASE_TIER,
  topoOrder,
  transitiveDependents,
  deriveSliceStatus,
  nextRunnable,
  normalizeRunConfig,
  saveRunConfig,
  loadRunConfig,
  setDarkFactory,
  setHarnessEvolve,
  runConfigExists,
  defaultRunConfig,
} from "./project.js";
import { detectHacks, suspicionScore } from "./hack-detector.js";
import { STZ_VERSION, SCHEMA_VERSION, PACKAGE_NAME } from "./version.js";
import { onNoPassers, DEFAULT_RETRY_POLICY, type EscalationState } from "./escalation.js";
import { evalGate, select, pairings } from "./selection.js";
import { diffSpecs, renderSpecDiff, isFaithful, unmatchedIntentIds, mismatchedAsBuiltIds, type Spec } from "./specdiff.js";
import { seal, verifySeal, amendSeal, heldOutFiles } from "./seal.js";
import { renderPressureLog, refinementContext, type CulledSpecimen } from "./pressure.js";
import { fullEval, crossReference, injectMutants, loadBattery, type MutatorSpec } from "./eval-runner.js";
import { groupRelativeAdvantage } from "./grpo.js";
import { checkDiversity, frontierWeights, weightedFitness } from "./diversity.js";
import { checkParity } from "./harness-hash.js";
import {
  readArchive,
  appendArchiveEntry,
  bumpChildCount,
  incumbent,
  sampleParents,
  makeArchiveEntry,
  promotionGate,
  batteryDir,
  readReliabilityProfile,
  mergeReliabilityEntry,
  defaultGenome,
  type MetaState,
} from "./harness.js";
import { initialInject, onInjectRound, summarizeSurvivors } from "./injector.js";
import { consistencyScore, bucketOf, calibrationGate } from "./judge-reliability.js";
import type { ArchiveEntry, HarnessGenome } from "./types.js";
// ── 0.9.6 Contract Plane + Phase-0 eval (PHASED-PLAN) ────────────────────────
import { execFileSync } from "node:child_process";
import type { ContractArtifact, Predicate } from "./contract/contract-types.js";
import { evaluatePredicates, type Observations, type PredicateResult } from "./contract/predicate-eval.js";
import { separationGate } from "./contract/separation-gate.js";
import { contractGateFromResults } from "./verifiers/contract-verifier.js";
import { humanAccept } from "./contract/contract-engine.js";
import { baselineReport, type BaselineCondition, type IssueRecord } from "./eval/baseline-report.js";
import {
  loadCompat,
  saveCompat,
  proposeCompat,
  approveCompat,
  retireCompat,
  validateMerge,
  type MergeCompatEntry,
  type SealedSuiteResult,
} from "./merge.js";

// ── small arg parser ──────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a?.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1]!.startsWith("--") ? argv[++i]! : "true";
      out[key] = val;
    }
  }
  return out;
}

function readJSON<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function print(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

/**
 * Report the bundled engine's identity (F19). The `/stz-f:*` commands and a
 * SessionStart hook call this to compare the plugin's engine against a global
 * `stz` CLI and surface channel drift deterministically (no version parsing
 * from prose).
 */
function versionCmd(): void {
  print({ version: STZ_VERSION, schemaVersion: SCHEMA_VERSION, packageName: PACKAGE_NAME });
}

// ── paths within a slice ────────────────────────────────────────────────────

const sliceRel = (id: string) => join("40-slices", id);
const protoRel = (id: string, specimen: string) =>
  join(sliceRel(id), "prototypes", `specimen-${specimen}`);
const evalResultPath = (root: string, id: string, specimen: string) =>
  stzPath(root, join(protoRel(id, specimen), "eval", "result.json"));
const votesPath = (root: string, id: string) =>
  stzPath(root, join(sliceRel(id), "tournament", "votes.json"));
const judgmentPath = (root: string, id: string) =>
  stzPath(root, join(sliceRel(id), "tournament", "judgment.json"));

function readSpecimenFiles(root: string, id: string, specimen: string): Record<string, string> {
  const dir = stzPath(root, protoRel(id, specimen));
  const files: Record<string, string> = {};
  const walk = (rel: string) => {
    const abs = join(dir, rel);
    if (!existsSync(abs)) return;
    for (const ent of readdirSync(abs, { withFileTypes: true })) {
      if (ent.name === "eval") continue; // skip our own eval output dir
      const childRel = join(rel, ent.name);
      if (ent.isDirectory()) walk(childRel);
      else files[childRel] = readFileSync(join(dir, childRel), "utf8");
    }
  };
  walk(".");
  return files;
}

function listSpecimens(root: string, id: string): string[] {
  const dir = stzPath(root, join(sliceRel(id), "prototypes"));
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith("specimen-"))
    .map((e) => e.name.replace("specimen-", ""))
    .sort();
}

// ── subcommands ─────────────────────────────────────────────────────────────

async function begin(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const manifest = readJSON<SliceManifest>(args.manifest!);
  await scaffold(root);
  await writeDoc(root, join(sliceRel(manifest.id), "manifest.md"), {
    frontmatter: {
      summary: manifest.summary,
      contract: manifest.contract,
      complexity: manifest.complexity,
      traceTier: manifest.traceTier,
      votesPerPair: manifest.judge.votesPerPair,
    },
    body:
      `# ${manifest.id} — ${manifest.name}\n\n## Contract\n\n\`${manifest.contract}\`\n\n` +
      `## Done predicates\n` +
      manifest.donePredicates.map((d) => `- \`${d.expr}\` (${d.kind})`).join("\n") +
      "\n",
  });
  // Preserve a project-seeded state if one exists: `project-seed-slices` already
  // marked the four early phases done at the project level. A fresh `freshState`
  // here would clobber that back to pending, so the slice could never read
  // complete (the pipeline "reset"). Only seed fresh for a standalone /stz-f:run.
  let state = stateExists(root, manifest.id)
    ? await loadState(root, manifest.id)
    : freshState(manifest.id, manifest.complexity);
  await saveState(root, setPhaseStatus(state, "planning", "done"));
  print({
    sliceId: manifest.id,
    votesPerPair: manifest.judge.votesPerPair,
    protoDirRoot: stzPath(root, join(sliceRel(manifest.id), "prototypes")),
    note: "spawn specimens to write into prototypes/specimen-<id>/; they return a path+summary, not file contents (N2).",
  });
}

/**
 * Record one specimen's eval result. The hack-detector runs HERE, for real,
 * over the specimen's written files (F10/L3 is never mocked). The model-side
 * metrics (testPassRate/coverage/mutation) are supplied by the eval runner the
 * command invoked, so the gate decision is deterministic given those inputs.
 */
/** Build, persist, and print an EvalResult from already-measured metrics. */
function commitEval(
  root: string,
  slice: string,
  specimen: string,
  metrics: { testPassRate: number; coverage: number; mutationScore: number; codeHealth?: number },
  fixtureNames: string[],
  extra: Record<string, unknown> = {},
): void {
  const files = readSpecimenFiles(root, slice, specimen);
  const hackFindings = detectHacks(specimen, files, { fixtureNames });
  // 0.9.0: graded soft-suspicion (a hard-passer can still carry it) + code-health
  // feed the multi-objective reward. codeHealth absent ⇒ neutral best (1).
  const suspicion = suspicionScore(files, { fixtureNames });
  const result: EvalResult = {
    specimen,
    passedGate: metrics.testPassRate >= 1 && hackFindings.length === 0,
    testPassRate: metrics.testPassRate,
    coverage: metrics.coverage,
    mutationScore: metrics.mutationScore,
    hackFindings,
    ...(metrics.codeHealth !== undefined ? { codeHealth: metrics.codeHealth } : {}),
    suspicion,
  };
  const out = evalResultPath(root, slice, specimen);
  mkdirSync(join(out, ".."), { recursive: true });
  writeFileSync(out, JSON.stringify(result, null, 2) + "\n", "utf8");
  print({ ...result, ...extra });
}

/** record-eval: metrics supplied by the caller (an external eval runner). */
function recordEval(args: Record<string, string>): void {
  const { root, slice, specimen } = args as { root: string; slice: string; specimen: string };
  const metrics = readJSON<{ testPassRate: number; coverage: number; mutationScore: number }>(args.metrics!);
  commitEval(root, slice, specimen, metrics, args.fixtures ? args.fixtures.split(",") : []);
}

/**
 * eval: run the REAL eval runner (sealed suite + V8 coverage + mutation) over a
 * specimen and record the result. This is the un-stubbed path — testPassRate,
 * coverage, and mutationScore are all genuinely executed, no caller trust.
 */
function evalCmd(args: Record<string, string>): void {
  const { root, slice, specimen } = args as { root: string; slice: string; specimen: string };
  // Promoted bug-class mutators under 60-harness/battery participate in mutation
  // scoring when present (the sharpened battery), so a hardened suite is rewarded.
  const e = fullEval(args.sealed!, args.impl!, existsSync(batteryDir(root)) ? batteryDir(root) : undefined);
  commitEval(
    root,
    slice,
    specimen,
    { testPassRate: e.testPassRate, coverage: e.coverage, mutationScore: e.mutationScore, codeHealth: e.codeHealth },
    args.fixtures ? args.fixtures.split(",") : [],
    { measured: { passed: e.passed, total: e.total, mutants: e.mutants, survivors: e.survivors, codeHealth: e.codeHealth } },
  );
}

function loadEvals(root: string, slice: string): EvalResult[] {
  return listSpecimens(root, slice)
    .map((s) => evalResultPath(root, slice, s))
    .filter(existsSync)
    .map((p) => readJSON<EvalResult>(p));
}

function gate(args: Record<string, string>): void {
  const { root, slice } = args as { root: string; slice: string };
  const evals = loadEvals(root, slice);
  const { passers, eliminated } = evalGate(evals);
  // Emit the pairing schedule the command must drive with judge agents. `gate`
  // is a pure read — it never advances escalation. When `passers` is empty the
  // command calls `escalate` (below), which owns the state transition; keeping
  // them separate means a re-run of `gate` can't double-advance the FSM.
  print({ passers, eliminated, pairings: pairings(passers) });
}

/** Build the pressure-log entries: every specimen that is not the winner is a
 *  negative exemplar (F9). `winner` is null for a no-passers round (all culled). */
function culledFromEvals(
  root: string,
  slice: string,
  evals: EvalResult[],
  winner: SpecimenId | null,
): CulledSpecimen[] {
  return evals
    .filter((e) => e.specimen !== winner)
    .map((e) => ({
      specimen: e.specimen,
      reason: e.hackFindings.length
        ? `hack: ${e.hackFindings.map((f) => f.pattern).join(",")}`
        : `gate testPassRate=${e.testPassRate.toFixed(2)}`,
      diff: Object.entries(readSpecimenFiles(root, slice, e.specimen))
        .map(([p, c]) => `+++ ${p}\n${c}`)
        .join("\n"),
      critique: "",
      hackFindings: e.hackFindings,
    }));
}

/**
 * Bounded cross-round escalation (F14), driven from the command-level `/stz-f:run`
 * loop. Call this ONCE after a gate that yielded zero passers. It is the single
 * deterministic owner of "are we allowed another round?": it advances the
 * escalation FSM over `state.json`, persists the new counts, and on retry/replan
 * writes the PDR refinement context the next round's specimens consume — exactly
 * the path the mock orchestrator drives internally, now exposed to the real
 * command so it is not the LLM deciding when to stop.
 *
 * The sealed suite is NOT touched here: retry/replan re-enter the tournament with
 * the SAME frozen suite (the command re-runs `seal-verify` each round). Re-using
 * the FSM's policy bound (run-config `retryPolicy`) means even a stray double-call is
 * fail-safe — it halts early, it never loops.
 */
async function escalateCmd(args: Record<string, string>): Promise<void> {
  const { root, slice } = args as { root: string; slice: string };
  const evals = loadEvals(root, slice);
  let state = await loadState(root, slice);

  const cur: EscalationState = {
    stage: state.escalation,
    retryCount: state.retryCount,
    replanCount: state.replanCount,
  };
  // The round that just failed (1-based): rounds already consumed + this one.
  const failedRound = cur.retryCount + cur.replanCount + 1;
  // Resolve the escalation bounds: the state's persisted copy wins (replay
  // stability); else the project run-config; else the engine default. Persist
  // on first use so every later escalate replays from state.json alone.
  let policy = state.retryPolicy;
  if (!policy) {
    const rc = await loadRunConfig(root);
    policy = rc?.retryPolicy ?? DEFAULT_RETRY_POLICY;
    state.retryPolicy = policy;
  }
  const { next, action } = onNoPassers(cur, policy);
  state.escalation = next.stage;
  state.retryCount = next.retryCount;
  state.replanCount = next.replanCount;
  state = appendEvent(state, "judgment", `escalation-${action.type}`, action.note);

  // The whole field is culled this round (no winner). Persist the pressure log so
  // the negative exemplars are auditable regardless of what comes next (F9).
  const culled = culledFromEvals(root, slice, evals, null);
  await writeDoc(root, join("50-pressure", slice, "pressure.md"), {
    frontmatter: { summary: `Pressure log ${slice}: round ${failedRound}, ${culled.length} culled (no passers).` },
    body: renderPressureLog({ sliceId: slice, culled }),
  });

  if (action.type === "halt") {
    const report =
      `# Failure report — ${slice}\n\n` +
      `No specimen passed the sealed-suite gate after ${failedRound} round(s) ` +
      `(${next.retryCount} retry, ${next.replanCount} replan). The escalation ` +
      `budget (retryPolicy: ${policy.retries} retries, ${policy.replans} replans) is exhausted; halting per F14.\n\n` +
      `## Per-specimen gate outcomes (final round)\n` +
      evals
        .map((e) => {
          const why = e.hackFindings.length
            ? `disqualified — hack: ${e.hackFindings.map((f) => f.pattern).join(", ")}`
            : `gate fail — testPassRate=${e.testPassRate.toFixed(2)}, coverage=${e.coverage.toFixed(2)}, mutation=${e.mutationScore.toFixed(2)}`;
          return `- specimen-${e.specimen}: ${why}`;
        })
        .join("\n") +
      "\n";
    state.failureReport = report;
    state = setPhaseStatus(state, "judgment", "failed");
    await writeDoc(root, join(sliceRel(slice), "failure-report.md"), {
      frontmatter: { summary: `Halt: no passers after ${failedRound} round(s).` },
      body: report,
    });
    await saveState(root, state);
    print({
      action: "halt",
      note: action.note,
      round: failedRound,
      escalation: state.escalation,
      retryCount: state.retryCount,
      replanCount: state.replanCount,
      failureReportPath: stzPath(root, join(sliceRel(slice), "failure-report.md")),
    });
    return;
  }

  // retry or replan → build the PDR refinement context (F9) from this round's
  // group-relative advantages (no votes: GRPO over the eval rewards alone), the
  // same computation the mock uses (orchestrator select(evals, [])).
  const advantages = select(evals, []).judgment.advantages;
  await writeDoc(root, join("50-pressure", slice, "refinement.md"), {
    frontmatter: { summary: `PDR refinement for ${slice} after round ${failedRound} (${action.type}).` },
    body: refinementContext({ sliceId: slice, culled }, advantages),
  });
  if (action.type === "replan") {
    // Re-enter planning: the command rewrites intent.json before re-spawning.
    state = setPhaseStatus(state, "planning", "running");
  }
  await saveState(root, state);
  print({
    action: action.type,
    note: action.note,
    round: failedRound,
    nextRound: failedRound + 1,
    escalation: state.escalation,
    retryCount: state.retryCount,
    replanCount: state.replanCount,
    refinementPath: stzPath(root, join("50-pressure", slice, "refinement.md")),
  });
}

/**
 * `slice-halt` — durable non-escalation halt (e.g. seal-crosscheck divergence).
 * These halts are ALWAYS human-in-the-loop: they are never consumed by the
 * retryPolicy and never skipped by dark-factory — a test-DESIGN ambiguity
 * auto-"fixed" can bake a suite blind-spot into every downstream slice.
 * Persists what the escalate path persists (escalation="halted",
 * failureReport, failed phase, failure-report.md) so the halt is durable and
 * machine-visible to `project-status`, not prose-only.
 */
async function sliceHaltCmd(args: Record<string, string>): Promise<void> {
  const { root, slice } = args as { root: string; slice: string };
  const phase = (args.phase ?? "test-authoring") as Phase;
  if (!args.reason) {
    console.error("slice-halt requires --reason (a markdown file path or an inline string).");
    process.exitCode = 1;
    return;
  }
  const reason = existsSync(args.reason) ? readFileSync(args.reason, "utf8") : args.reason;

  let state = await loadState(root, slice);
  const report = `# Failure report — ${slice}\n\n${reason.trim()}\n`;
  state.escalation = "halted";
  state.failureReport = report;
  state = setPhaseStatus(state, phase, "failed");
  state = appendEvent(state, phase, "slice-halt", "halted for human review (non-escalation halt)");
  await writeDoc(root, join(sliceRel(slice), "failure-report.md"), {
    frontmatter: { summary: `Halt (${phase}): human decision required.` },
    body: report,
  });
  await saveState(root, state);
  print({
    action: "halt",
    phase,
    escalation: state.escalation,
    failureReportPath: stzPath(root, join(sliceRel(slice), "failure-report.md")),
  });
}

function recordVotes(args: Record<string, string>): void {
  const { root, slice } = args as { root: string; slice: string };
  const votes = readJSON<PairwiseVote[]>(args.votes!);
  const p = votesPath(root, slice);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, JSON.stringify(votes, null, 2) + "\n", "utf8");
  print({ recorded: votes.length });
}

async function selectCmd(args: Record<string, string>): Promise<void> {
  const { root, slice } = args as { root: string; slice: string };
  const evals = loadEvals(root, slice);
  const votes = existsSync(votesPath(root, slice)) ? readJSON<PairwiseVote[]>(votesPath(root, slice)) : [];
  // 0.9.6 Contract Plane (flag-gated): only when the /stz-f:run command passes a
  // per-specimen contract-scores file (i.e. RunConfig.contract.enabled + a bound
  // slice) do specimens get contract-gated. Absent ⇒ exactly 0.9.5 selection.
  const contractScores = args["contract-scores"]
    ? readJSON<Record<string, PredicateResult[]>>(args["contract-scores"])
    : undefined;
  const contractGate = contractScores ? contractGateFromResults(contractScores) : undefined;
  const { judgment } = select(evals, votes, contractGate);
  writeFileSync(judgmentPath(root, slice), JSON.stringify(judgment, null, 2) + "\n", "utf8");
  await writeDoc(root, join(sliceRel(slice), "tournament.md"), {
    frontmatter: {
      summary: `Tournament ${slice}: winner specimen-${judgment.winner ?? "none"}, ${judgment.ranking.length} passer(s).`,
    },
    body:
      `# Tournament — ${slice}\n\n- **winner:** ${judgment.winner ? "specimen-" + judgment.winner : "none"}\n` +
      `- **ranking:** ${judgment.ranking.join(" > ") || "—none—"}\n- **votes:** ${votes.length}\n\n` +
      `## GRPO advantages (whole group)\n` +
      judgment.advantages
        .map((a) => `- specimen-${a.specimen}: reward=${a.reward.toFixed(3)} advantage=${a.advantage.toFixed(3)}`)
        .join("\n") +
      "\n",
  });
  let state = await loadState(root, slice);
  state = appendEvent(state, "judgment", "winner", `winner=${judgment.winner}, ranking=[${judgment.ranking.join(",")}]`);
  await saveState(root, state);
  print({ winner: judgment.winner, ranking: judgment.ranking, advantages: judgment.advantages });
}

async function finalize(args: Record<string, string>): Promise<void> {
  const { root, slice } = args as { root: string; slice: string };
  const evals = loadEvals(root, slice);
  const judgment = existsSync(judgmentPath(root, slice))
    ? readJSON<ReturnType<typeof select>["judgment"]>(judgmentPath(root, slice))
    : { ranking: [], winner: null, advantages: [], votes: [] };

  // Pressure log: every non-winning specimen is a negative exemplar (F9).
  const culled = culledFromEvals(root, slice, evals, judgment.winner);
  await writeDoc(root, join("50-pressure", slice, "pressure.md"), {
    frontmatter: { summary: `Pressure log ${slice}: ${culled.length} culled.` },
    body: renderPressureLog({ sliceId: slice, culled }),
  });
  if (judgment.advantages.length > 0) {
    await writeDoc(root, join("50-pressure", slice, "refinement.md"), {
      frontmatter: { summary: `PDR top-K refinement for ${slice}.` },
      body: refinementContext({ sliceId: slice, culled }, judgment.advantages),
    });
  }

  // Spec-diff (F13). Claims are matched by id (or normalized text); the
  // documenter adjudicates each intent claim, so wording differences no longer
  // read as drift. A mis-keyed verdict would, though — surface it rather than
  // let it silently miscount.
  const intent = readJSON<Spec>(args.intent!);
  const asBuilt = readJSON<Spec>(args.asbuilt!);
  const sdiff = diffSpecs(intent, asBuilt);
  const unmatched = unmatchedIntentIds(intent, asBuilt);
  const mismatched = mismatchedAsBuiltIds(intent, asBuilt);
  if (mismatched.length) {
    process.stderr.write(
      `warning: as-built claim id(s) [${mismatched.join(", ")}] assert satisfied but match no intent claim — likely a documenter mis-key, counted as 'added'.\n`,
    );
  }
  await writeDoc(root, join(sliceRel(slice), "spec-diff.md"), {
    frontmatter: {
      summary: `Spec diff ${slice}: ${sdiff.missing.length} missing, ${sdiff.added.length} added, ${sdiff.kept.length} kept.`,
    },
    body: renderSpecDiff(slice, sdiff),
  });

  // finalize is the tournament-half completion barrier: by the time it runs the
  // sealed suite was authored, the plan written, the tournament run, and the
  // winner judged. Mark every tournament-half phase done (idempotent — `begin`
  // already set planning; skip phases already done so events aren't duplicated)
  // so the slice is `isComplete` and `project-status` derives it as "done".
  // Without this, test-authoring/tournament stay "pending" forever, the slice
  // reads "running", and `/stz-f:pipeline` never advances past it (or re-runs it on
  // resume) — the orchestrator had to hand-patch state.json every slice.
  let state = await loadState(root, slice);
  for (const p of ["test-authoring", "planning", "tournament", "judgment"] as const) {
    if (state.phaseStatus[p] !== "done") state = setPhaseStatus(state, p, "done");
  }
  state.currentPhase = "judgment";
  await saveState(root, state);
  await writeDoc(root, join("90-audit", "journal.md"), {
    frontmatter: { summary: `Event journal for ${slice}: ${state.events.length} events.` },
    body:
      `# Journal — ${slice}\n\n` +
      state.events.map((e) => `${e.seq}. [${e.phase}] ${e.kind}: ${e.detail}`).join("\n") +
      "\n",
  });
  print({
    winner: judgment.winner,
    faithful: isFaithful(sdiff),
    specDiff: { missing: sdiff.missing.length, added: sdiff.added.length, kept: sdiff.kept.length },
    culled: culled.length,
    unmatchedIntentIds: unmatched.length ? unmatched : undefined,
    mismatchedAsBuiltIds: mismatched.length ? mismatched : undefined,
  });
}

// ── project-level subcommands (the multi-slice driver) ──────────────────────

/** project-init: scaffold + write project manifest + fresh project state. */
async function projectInit(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const manifest = readJSON<ProjectManifest>(args.manifest!);
  manifest.schemaVersion = 1;
  manifest.slices = manifest.slices ?? [];
  await scaffold(root);
  await writeFile(projectManifestPath(root), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  const state = freshProjectState(manifest.projectId);
  appendProjectEvent(state, "lifecycle", "project-init", `project ${manifest.projectId} created`);
  await saveProjectState(root, state);
  await writeDoc(root, join("00-intent", "project.md"), {
    frontmatter: { summary: manifest.summary || `Project ${manifest.name}.` },
    body:
      `# ${manifest.name}\n\n${manifest.summary}\n\n## Slices (DAG)\n` +
      (manifest.slices.length
        ? manifest.slices.map((s) => `- ${s.id} (${s.name}) deps: [${s.dependsOn.join(", ")}]`).join("\n")
        : "_none yet — added during slice-disaggregation_") +
      "\n",
  });
  print({ projectId: manifest.projectId, slices: manifest.slices.map((s) => s.id), phases: PROJECT_PHASES });
}

function isProjectPhase(p: string): p is ProjectPhase {
  return (PROJECT_PHASES as readonly string[]).includes(p);
}

/** project-phase: mark a project-level phase done + write a tier marker. */
async function projectPhase(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const phase = args.phase!;
  if (!isProjectPhase(phase)) {
    process.stderr.write(`unknown project phase: ${phase}\n`);
    process.exitCode = 1;
    return;
  }
  const state = await loadProjectState(root);
  state.phaseStatus[phase] = "done";
  appendProjectEvent(state, phase, "phase-done", `${phase} → done`);
  await saveProjectState(root, state);
  const tier = PROJECT_PHASE_TIER[phase];
  await writeDoc(root, join(tier, `${phase}.md`), {
    frontmatter: { summary: `Project phase ${phase} marked done.` },
    body: `# ${phase}\n\nCompleted at the project level. Artifacts live under \`${tier}/\`.\n`,
  });
  print({ phase, status: "done", tier });
}

/** project-write-intent: persist the elicited intent + done-predicates. */
async function projectWriteIntent(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const intent = readJSON<{
    problem?: string;
    users?: string;
    constraints?: string[];
    donePredicates?: { id: string; expr: string; kind: string }[];
    areas?: string[];
  }>(args.intent!);
  const preds = intent.donePredicates ?? [];
  await writeFile(stzPath(root, join("00-intent", "intent.json")), JSON.stringify(intent, null, 2) + "\n", "utf8");
  await writeDoc(root, join("00-intent", "intent.md"), {
    frontmatter: { summary: `Intent: ${preds.length} done-predicate(s); ${(intent.areas ?? []).length} area(s).` },
    body:
      `# Intent\n\n## Problem\n${intent.problem ?? ""}\n\n## Users\n${intent.users ?? ""}\n\n` +
      `## Constraints\n${(intent.constraints ?? []).map((c) => `- ${c}`).join("\n")}\n\n` +
      `## Done predicates (machine-checkable)\n${preds.map((p) => `- \`${p.expr}\` (${p.kind})`).join("\n")}\n`,
  });
  print({ predicates: preds.length, areas: (intent.areas ?? []).length });
}

/** project-record-area: durable per-area checkpoint during elicitation. */
async function projectRecordArea(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const phase = args.phase!;
  if (!isProjectPhase(phase)) {
    process.stderr.write(`unknown project phase: ${phase}\n`);
    process.exitCode = 1;
    return;
  }
  const state = await loadProjectState(root);
  appendProjectEvent(state, phase, "area-resolved", `${args.area}: ${args.resolution ?? ""}`);
  await saveProjectState(root, state);
  const resolved = state.events.filter((e) => e.phase === phase && e.kind === "area-resolved").map((e) => e.detail.split(":")[0]);
  print({ phase, area: args.area, recorded: true, resolved });
}

/** slice-add: append a slice to the DAG (permissive; validation in status). */
async function sliceAdd(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const id = args.id!;
  const entry: ProjectSliceEntry = {
    id,
    name: args.name ?? id,
    dependsOn: args.depends ? args.depends.split(",").map((s) => s.trim()).filter(Boolean) : [],
  };
  const manifest = readJSON<ProjectManifest>(projectManifestPath(root));
  manifest.slices = (manifest.slices ?? []).filter((s) => s.id !== id);
  manifest.slices.push(entry);
  await writeFile(projectManifestPath(root), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  const state = await loadProjectState(root);
  if (!(id in state.sliceStatus)) state.sliceStatus[id] = "pending";
  appendProjectEvent(state, "slice", "slice-added", `${id} deps=[${entry.dependsOn.join(",")}]`);
  await saveProjectState(root, state);
  print({ id, dependsOn: entry.dependsOn, totalSlices: manifest.slices.length });
}

/** project-seed-slices: write per-slice manifests + seed early phases done. */
async function projectSeedSlices(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const dag = readJSON<SliceManifest[]>(args.dag!);
  const created: string[] = [];
  for (const m of dag) {
    m.judge = m.judge ?? { votesPerPair: 8 };
    m.dependsOn = m.dependsOn ?? [];
    m.donePredicates = m.donePredicates ?? [];
    mkdirSync(stzPath(root, sliceRel(m.id)), { recursive: true });
    await writeFile(stzPath(root, join(sliceRel(m.id), "manifest.json")), JSON.stringify(m, null, 2) + "\n", "utf8");
    await writeDoc(root, join(sliceRel(m.id), "manifest.md"), {
      frontmatter: { summary: m.summary, contract: m.contract, complexity: m.complexity },
      body: `# ${m.id} — ${m.name}\n\n## Contract\n\n\`${m.contract}\`\n\n## Depends on\n${m.dependsOn.join(", ") || "—"}\n`,
    });
    // Seed per-slice state: the four early phases were settled at the project
    // level, so they start `done`; the tournament half remains for /stz-f:run.
    let st = freshState(m.id, m.complexity ?? 1);
    for (const p of ["elicitation", "research", "ground-truth-validation", "standards"] as const) {
      st = setPhaseStatus(st, p, "done");
    }
    await saveState(root, st);
    created.push(m.id);
    // Also register in the project DAG.
    await sliceAddInternal(root, { id: m.id, name: m.name, dependsOn: m.dependsOn });
  }
  print({ created, seeded: true });
}

async function sliceAddInternal(root: string, entry: ProjectSliceEntry): Promise<void> {
  const manifest = readJSON<ProjectManifest>(projectManifestPath(root));
  manifest.slices = (manifest.slices ?? []).filter((s) => s.id !== entry.id);
  manifest.slices.push(entry);
  await writeFile(projectManifestPath(root), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  const state = await loadProjectState(root);
  if (!(entry.id in state.sliceStatus)) state.sliceStatus[entry.id] = "pending";
  await saveProjectState(root, state);
}

/**
 * project-set-config: persist the run configuration captured during `/stz-f:new`.
 * Reads a (possibly partial) config JSON, merges it over the defaults, validates
 * and clamps, then writes run-config.json + a human-readable run-config.md and
 * appends an event. Prints the resolved config.
 */
async function projectSetConfig(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const partial = readJSON<Partial<RunConfig>>(args.config!);
  let config: RunConfig;
  try {
    config = normalizeRunConfig(partial);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    process.exitCode = 1;
    return;
  }
  await saveRunConfig(root, config);
  await writeRunConfigDoc(root, config);
  const state = await loadProjectState(root);
  appendProjectEvent(state, "elicitation", "run-config-set", `N=${config.fanout}, ${config.granularity}, cov≥${config.strictness.coverageTarget}, dark-factory=${config.darkFactory}`);
  await saveProjectState(root, state);
  print(config);
}

/** Render the human-readable run-config.md (shared by set-config + toggles). */
async function writeRunConfigDoc(root: string, config: RunConfig): Promise<void> {
  const m = config.models;
  await writeDoc(root, join("00-intent", "run-config.md"), {
    frontmatter: {
      summary: `Run config: ${config.granularity} slicing, N=${config.fanout}, coverage≥${config.strictness.coverageTarget}, mutation ${config.strictness.mutationPolicy}, conventions ${config.strictness.conventions}, dark-factory ${config.darkFactory ? "on" : "off"}.`,
    },
    body:
      `# Run configuration\n\n` +
      `- **Slicing granularity:** ${config.granularity}\n` +
      `- **Specimen fan-out (N):** ${config.fanout}\n` +
      `- **Strictness:** coverage ≥ ${config.strictness.coverageTarget}, mutation ${config.strictness.mutationPolicy}, conventions ${config.strictness.conventions}\n` +
      `- **Dark-factory mode:** ${config.darkFactory ? "**on** — autonomous end-to-end, human gates skipped (except the F2 predicate gate)" : "off — human-in-the-loop"}\n` +
      `- **Evolve meta-loop:** ${config.harness?.enabled ? "**on** — /stz-f:evolve runs after the pipeline completes" : "off"}\n\n` +
      `## Models per role\n\n| role | model |\n|---|---|\n` +
      `| planning | ${m.planning} |\n| research | ${m.research} |\n| execution | ${m.execution} |\n` +
      `| testing | ${m.testing} |\n| validation | ${m.validation} |\n| judging | ${m.judging} |\n`,
  });
}

/**
 * project-dark-factory: flip dark-factory mode at ANY point in the run (0.4.0).
 * `--on` / `--off` (default `--on`). Implemented as a load-modify-save on the
 * existing config — it must NOT round-trip through `project-set-config`, whose
 * normalize-over-defaults merge would silently reset every other field.
 */
async function projectDarkFactory(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  // --off disables; --on (or bare) enables. --enabled true/false also accepted.
  const enabled = args.off ? false : args.enabled !== undefined ? String(args.enabled).trim().toLowerCase() === "true" : true;
  const config = await setDarkFactory(root, enabled);
  await writeRunConfigDoc(root, config);
  if (projectStateExists(root)) {
    const state = await loadProjectState(root);
    appendProjectEvent(state, "lifecycle", "dark-factory", enabled ? "engaged — autonomous run" : "disengaged — human-in-the-loop");
    await saveProjectState(root, state);
  }
  print({ darkFactory: config.darkFactory, runConfig: config });
}

/**
 * project-harness-evolve: flip the /stz-f:evolve meta-loop (harness.enabled) at
 * ANY point. `--on` / `--off` (default `--on`). Load-modify-save like
 * project-dark-factory — never routed through `project-set-config`, whose
 * normalize-over-defaults merge would silently reset every other field.
 */
async function projectHarnessEvolve(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const enabled = args.off ? false : args.enabled !== undefined ? String(args.enabled).trim().toLowerCase() === "true" : true;
  const config = await setHarnessEvolve(root, enabled);
  await writeRunConfigDoc(root, config);
  if (projectStateExists(root)) {
    const state = await loadProjectState(root);
    appendProjectEvent(state, "lifecycle", "harness-evolve", enabled ? "engaged — evolve meta-loop runs after the pipeline completes" : "disengaged");
    await saveProjectState(root, state);
  }
  print({ harnessEvolve: config.harness?.enabled === true, runConfig: config });
}

/** project-config: READ-ONLY — print the run config (defaults if unset). */
async function projectConfig(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const config = await loadRunConfig(root);
  print({ ...config, isDefault: !runConfigExists(root) });
}

/** project-status: READ-ONLY DAG + phase status + next runnable slice. */
async function projectStatus(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const manifest = readJSON<ProjectManifest>(projectManifestPath(root));
  const slices = manifest.slices ?? [];
  const state = await loadProjectState(root);
  const topo = topoOrder(slices);
  if (!topo.ok) {
    print(topo.error === "cycle" ? { error: "cycle", cycle: topo.cycle } : { error: "dangling", from: topo.from, missing: topo.missing });
    process.exitCode = 1;
    return;
  }
  const sliceStatus: Record<string, string> = {};
  for (const id of topo.order) sliceStatus[id] = await deriveSliceStatus(root, id);

  // Enriched, dashboard-ready rows + computed progress totals — so the pipeline
  // dashboard renders a fixed table from data rather than the agent eyeballing
  // counts (which drift run to run). winner/faithful are pulled the same way
  // `summary` does, so the dashboard and the completion report never disagree.
  const byId = new Map(slices.map((s) => [s.id, s]));
  const tally = { done: 0, running: 0, halted: 0, pending: 0 };
  const sliceRows: { id: string; dependsOn: string[]; status: string; winner: string | null; faithful: boolean | null }[] = [];
  for (const id of topo.order) {
    const status = sliceStatus[id]!;
    if (status === "done" || status === "running" || status === "halted" || status === "pending") tally[status]++;
    let winner: string | null = null;
    const jp = judgmentPath(root, id);
    if (existsSync(jp)) winner = readJSON<{ winner: string | null }>(jp).winner;
    let faithful: boolean | null = null;
    const sdRel = join(sliceRel(id), "spec-diff.md");
    if (existsSync(stzPath(root, sdRel))) {
      const sd = await readDoc(root, sdRel);
      faithful = /0 missing/.test(String(sd.frontmatter.summary ?? ""));
    }
    sliceRows.push({ id, dependsOn: byId.get(id)?.dependsOn ?? [], status, winner, faithful });
  }
  const phasesDone = Object.values(state.phaseStatus).filter((s) => s === "done").length;
  const progress = {
    phases: { done: phasesDone, total: PROJECT_PHASES.length },
    slices: { total: slices.length, ...tally },
  };

  const runnable = await nextRunnable(slices, (id) => deriveSliceStatus(root, id));
  const slicingDone = state.phaseStatus["slice-disaggregation"] === "done";
  // A corrupt/hand-edited run-config.json must not brick status (and thus every
  // command's first call). Fall back to defaults rather than throwing.
  let runConfig;
  let runConfigBroken = false;
  try {
    runConfig = await loadRunConfig(root);
  } catch {
    runConfig = defaultRunConfig();
    runConfigBroken = true;
  }
  // Fan-out throttle computed HERE (code), not left to the prose orchestrator:
  // `linear` dispatches one slice; `fanout` dispatches at most maxParallelSlices.
  // The pipeline command runs `dispatch`, never the raw (possibly wide) frontier.
  const frontier = slicingDone ? runnable.frontier : [];
  const dispatch =
    runConfig.sequencing === "linear"
      ? frontier.slice(0, 1)
      : frontier.slice(0, Math.max(1, runConfig.maxParallelSlices));
  print({
    projectPhases: state.phaseStatus,
    progress,
    order: topo.order,
    sliceStatus,
    slices: sliceRows,
    frontier,
    dispatch,
    next: slicingDone ? runnable.next : null,
    blocked: !slicingDone,
    runConfig,
    // Hoisted convenience: a command driving the autonomous loop reads this one
    // field rather than reaching into runConfig.darkFactory each phase.
    darkFactory: runConfig.darkFactory,
    // Same hoist for the opt-in evolve meta-loop (off unless engaged).
    harnessEvolve: runConfig.harness?.enabled === true,
    runConfigSet: runConfigExists(root) && !runConfigBroken,
    runConfigBroken: runConfigBroken || undefined,
    note: slicingDone ? undefined : "slice execution gated until /stz-f:slice completes slice-disaggregation",
  });
}

/** summary: aggregate every slice's outcome into a completion report. */
async function summaryCmd(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const manifest = readJSON<ProjectManifest>(projectManifestPath(root));
  const slices = manifest.slices ?? [];
  const rows: { id: string; winner: string | null; faithful: boolean | null; culled: number | null; status: string }[] = [];
  let done = 0, halted = 0, pending = 0;
  for (const s of slices) {
    const status = await deriveSliceStatus(root, s.id);
    if (status === "done") done++; else if (status === "halted") halted++; else pending++;
    let winner: string | null = null;
    const jPath = judgmentPath(root, s.id);
    if (existsSync(jPath)) winner = (readJSON<{ winner: string | null }>(jPath)).winner;
    let faithful: boolean | null = null;
    const sdPath = stzPath(root, join(sliceRel(s.id), "spec-diff.md"));
    if (existsSync(sdPath)) {
      const sd = await readDoc(root, join(sliceRel(s.id), "spec-diff.md"));
      faithful = /0 missing/.test(String(sd.frontmatter.summary ?? ""));
    }
    let culled: number | null = null;
    const pPath = stzPath(root, join("50-pressure", s.id, "pressure.md"));
    if (existsSync(pPath)) {
      const pd = await readDoc(root, join("50-pressure", s.id, "pressure.md"));
      const m = String(pd.frontmatter.summary ?? "").match(/(\d+) culled/);
      culled = m ? Number(m[1]) : null;
    }
    rows.push({ id: s.id, winner, faithful, culled, status });
  }
  await writeDoc(root, join("90-audit", "completion-report.md"), {
    frontmatter: { summary: `Completion: ${done} done, ${halted} halted, ${pending} pending of ${slices.length} slice(s).` },
    body:
      `# Completion report — ${manifest.name}\n\n` +
      `| slice | status | winner | faithful | culled |\n|---|---|---|---|---|\n` +
      rows.map((r) => `| ${r.id} | ${r.status} | ${r.winner ?? "—"} | ${r.faithful ?? "—"} | ${r.culled ?? "—"} |`).join("\n") +
      "\n",
  });
  print({ slices: rows, done, halted, pending });
}

// ── sealed held-out suite integrity (L1/F10) ────────────────────────────────

/** seal: freeze the held-out suite into SEAL.json (run after the smoke gate is green). */
async function sealCmd(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const res = await seal(root);
  if (!res.sealed) {
    process.stderr.write(
      `refusing to re-seal: already-sealed file(s) changed [${[...res.drifted, ...res.removed].join(", ")}]. Use seal-amend --reason to record a sanctioned change.\n`,
    );
    process.exitCode = 1;
  }
  print(res);
}

/** seal-verify: re-hash held-out vs SEAL.json; exit 1 on drift (gates the tournament). */
function sealVerify(args: Record<string, string>): void {
  const root = args.root!;
  const res = verifySeal(root);
  if (!res.sealed) {
    process.stderr.write("no SEAL.json — the held-out suite was never sealed; run `seal` first.\n");
    process.exitCode = 1;
  } else if (!res.ok) {
    process.stderr.write(
      `SEAL DRIFT — the frozen held-out suite changed since sealing: ${res.drift.map((d) => `${d.file} (${d.status})`).join(", ")}. This breaks the anti-hacking seal; investigate before judging. Use seal-amend --reason for a sanctioned fix.\n`,
    );
    process.exitCode = 1;
  }
  print({ ...res, files: heldOutFiles(root).length });
}

/**
 * seal-crosscheck: run the sealed suite against TWO independent references (the
 * test-author's primary + an independently-authored cross-family one) and report
 * whether they agree. Gates the seal like `seal-verify` gates the tournament:
 * exits non-zero on anything but both-pass so the pipeline PAUSES for human
 * adjudication. Divergence is a GUIDE-class signal (the suite may encode a
 * reference-specific assumption a second author didn't share), NOT an automatic
 * rewrite trigger — see docs/development/sealed-suite.md. Writes a durable audit
 * doc under 30-tests/cross-reference.md (outside held-out/, so it is not sealed).
 */
async function sealCrosscheck(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const sealed = args.sealed!;
  const refA = args["reference-a"]!;
  const refB = args["reference-b"]!;
  if (!sealed || !refA || !refB) {
    process.stderr.write("seal-crosscheck requires --sealed, --reference-a, and --reference-b.\n");
    process.exitCode = 1;
    return;
  }
  const res = crossReference(sealed, refA, refB);
  const verdict =
    res.status === "both-pass"
      ? "✅ both independent references satisfy the sealed suite — no shared-blind-spot signal."
      : res.status === "divergent"
        ? "⚠️ DIVERGENT — exactly one reference satisfies the suite. The suite may encode a reference-specific assumption the other author did not share (a candidate fragile invariant), OR the cross-family reference is simply wrong. This is a GUIDE-class signal: adjudicate by hand — strengthen the stz-test-author guidance + seal-amend, or discard a buggy cross reference. Do NOT auto-rewrite."
        : "⛔ both references FAIL the suite — it is unsatisfiable as written (a gate/sensor failure, not a cross-family signal). Send the stderr back to stz-test-author.";
  await writeDoc(root, join("30-tests", "cross-reference.md"), {
    frontmatter: {
      summary: `Cross-family reference check: ${res.status} (A ${res.a.passed}/${res.a.total}, B ${res.b.passed}/${res.b.total}).`,
    },
    body:
      `# Cross-family reference check\n\n` +
      `A second, independently-authored reference is run against the same sealed\n` +
      `suite to catch blind spots the single test-author reference shares with the\n` +
      `suite (R2 cross-family quorum, applied to the reference).\n\n` +
      `- **Primary reference (A):** ${res.a.passed}/${res.a.total} passed (passRate ${res.a.passRate})\n` +
      `- **Cross-family reference (B):** ${res.b.passed}/${res.b.total} passed (passRate ${res.b.passRate})\n` +
      `- **Status:** \`${res.status}\`\n\n## Verdict\n\n${verdict}\n`,
  });
  if (!res.bothPass) {
    process.stderr.write(`${verdict}\n`);
    process.exitCode = 1;
  }
  print({ status: res.status, bothPass: res.bothPass, divergent: res.divergent, bothFail: res.bothFail, a: res.a, b: res.b });
}

/** seal-amend: the only sanctioned way to change a sealed file — records from→to + reason. */
async function sealAmend(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const reason = args.reason;
  if (!reason || reason === "true") {
    process.stderr.write("seal-amend requires --reason \"<why this sealed-suite change is legitimate>\".\n");
    process.exitCode = 1;
    return;
  }
  const res = await amendSeal(root, reason);
  if (!res.amended) {
    process.stderr.write("nothing to amend: held-out suite matches SEAL.json (or it was never sealed).\n");
    process.exitCode = 1;
  }
  print({ ...res, reason });
}

// ── sealed end-to-end integration/functional gate (item 4) ──────────────────

/**
 * integration-gate: the composition-level gate run after slice aggregation. The
 * sealed integration suite (authored once per project, blind to specimens) must
 * pass IN FULL against the assembled entry point; brownfield adds the
 * source-preservation check — every `--preserved` export must still resolve.
 *
 * The integration suite lives under the sealed held-out tree, so its integrity
 * is gated first: on SEAL drift this refuses (like the tournament gate). Exits 1
 * when the composed artifact fails the gate, so the pipeline halts before ship.
 */
async function integrationGateCmd(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const suite = args.suite;
  const entry = args.entry;
  if (!suite || !entry) {
    process.stderr.write("integration-gate requires --suite <sealed integration harness> and --entry <assembled entry>.\n");
    process.exitCode = 1;
    return;
  }
  // Seal integrity first — a tampered integration suite is not a gate (only when
  // the project actually sealed its held-out tree; a direct suite path skips it).
  if (existsSync(join(stzPath(root, join("30-tests", "held-out")), "SEAL.json"))) {
    const v = verifySeal(root);
    if (!v.ok) {
      process.stderr.write(
        `SEAL DRIFT before the integration gate: ${v.drift.map((d) => `${d.file} (${d.status})`).join(", ")}. Investigate before gating.\n`,
      );
      process.exitCode = 1;
      return;
    }
  }
  const preserved = args.preserved ? (readJSONArg<string[]>(args.preserved) ?? []) : [];
  const res = runIntegrationGate(suite, entry, preserved);

  await writeDoc(root, join("90-audit", "integration.md"), {
    frontmatter: {
      summary: `Integration gate: ${res.passed ? "PASS" : "FAIL"} (suite ${res.suite.passed}/${res.suite.total}, ${res.preservedMissing.length} preserved export(s) dropped).`,
    },
    body:
      `# Sealed end-to-end integration gate\n\n` +
      `The composition-level gate: the assembled artifact must satisfy the sealed\n` +
      `integration suite in full${preserved.length ? ", and preserve every promised source export" : ""}.\n\n` +
      `- **suite:** ${res.suite.passed}/${res.suite.total} (passRate ${res.suite.passRate})\n` +
      (preserved.length
        ? `- **preserved exports:** ${preserved.length} promised, ${res.preservedMissing.length} dropped` +
          (res.preservedMissing.length ? ` (${res.preservedMissing.join(", ")})` : "") +
          "\n"
        : `- **preserved exports:** none (greenfield)\n`) +
      `- **verdict:** ${res.passed ? "✅ PASS — the composed slices work together" : "⛔ FAIL — composition or source-preservation broke"}\n`,
  });

  if (!res.passed) process.exitCode = 1;
  print({ passed: res.passed, suite: res.suite, preservedMissing: res.preservedMissing, preserved: preserved.length });
}

// ── brownfield: codebase exploration + slice anchoring (item 3) ─────────────

const codebaseMapPath = (root: string) => stzPath(root, join("10-research", "codebase-map.json"));

/**
 * explore: map an existing codebase (files, per-file exports, tests, the public
 * surface) into 10-research/codebase-map.json + a markdown summary, so the
 * slicer can anchor its DAG to real code locations instead of assuming
 * greenfield. Deterministic (regex + fs), replayable. `--target` is the repo to
 * scan (default the project root that holds the .stz tree).
 */
async function exploreCmd(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const target = args.target ?? root;
  const include = args.include ? args.include.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const exclude = args.exclude ? args.exclude.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const map = exploreCodebase(target, { include, exclude });

  const mapPath = codebaseMapPath(root);
  mkdirSync(dirname(mapPath), { recursive: true });
  writeFileSync(mapPath, JSON.stringify(map, null, 2) + "\n", "utf8");

  const langLine = Object.entries(map.summary.languages).map(([l, n]) => `${l}: ${n}`).join(", ") || "none";
  await writeDoc(root, join("10-research", "codebase-map.md"), {
    frontmatter: {
      summary: `Codebase map: ${map.summary.fileCount} source file(s), ${map.summary.testCount} test(s), ${map.summary.totalLoc} LOC.`,
    },
    body:
      `# Codebase map (brownfield exploration)\n\n` +
      `Deterministic scan of the existing codebase so the slicer can anchor slices\n` +
      `to real code locations. Machine-readable form: \`10-research/codebase-map.json\`.\n\n` +
      `- **files:** ${map.summary.fileCount} (${langLine})\n` +
      `- **tests:** ${map.summary.testCount}\n` +
      `- **total LOC:** ${map.summary.totalLoc}\n` +
      `- **public surface:** ${map.publicSurface.join(", ") || "(none detected)"}\n\n` +
      `## Files\n\n| file | lang | loc | exports | test |\n|---|---|---|---|---|\n` +
      map.files
        .map((f) => `| \`${f.path}\` | ${f.lang} | ${f.loc} | ${f.exports.join(", ") || "—"} | ${f.isTest ? "✓" : ""} |`)
        .join("\n") +
      "\n",
  });
  print({ ...map.summary, publicSurface: map.publicSurface, mapPath: relative(root, mapPath) });
}

/**
 * anchor-check: validate a proposed slice anchor against the codebase map — an
 * `edit`/`extend` slice must point at files (and preserved exports) that exist;
 * an `add` slice must not collide with an existing file. A dangling anchor (a
 * hallucinated path) is caught here, before any specimen runs. Exits 1 on an
 * invalid anchor so the slicer/pipeline halts.
 */
async function anchorCheckCmd(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const mapFile = args.map ?? codebaseMapPath(root);
  if (!existsSync(mapFile)) {
    process.stderr.write(`no codebase map at ${mapFile} — run \`explore\` first.\n`);
    process.exitCode = 1;
    return;
  }
  const map = readJSON<CodebaseMap>(mapFile);
  const anchor = readJSON<SliceAnchor>(args.anchor!);
  const verdict = checkAnchor(map, anchor);
  if (!verdict.ok) {
    process.stderr.write(`anchor invalid for ${anchor.sliceId}: ${verdict.errors.join("; ")}\n`);
    process.exitCode = 1;
  }
  print({ sliceId: anchor.sliceId, mode: anchor.mode, ...verdict });
}

// ── model tiers (item 2) ────────────────────────────────────────────────────

/**
 * model-tiers: classify the RunConfig's per-role models by capability/cost tier
 * and advise where the premium (Fable-5-class / Mythos) tier pays off. The
 * field finding: test-author + judge strength is the binding constraint, so
 * `testing` and `judging` are the high-value roles; the rest are high-volume
 * where premium spend is usually wasteful. Advisory only — never blocks.
 */
async function modelTiersCmd(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  let runConfig;
  try {
    runConfig = await loadRunConfig(root);
  } catch {
    runConfig = defaultRunConfig();
  }
  const roles = runConfig.models;
  const warnings = auditRoleTiers(roles, {
    highValue: ["testing", "judging"],
    highVolume: ["planning", "research", "execution", "validation"],
  });
  print({
    roles: Object.fromEntries(Object.entries(roles).map(([r, m]) => [r, { model: m, tier: tierOf(m) }])),
    warnings,
    note: warnings.length
      ? "premium tier = fable or mythos (the two Mythos-class families) or opus; reserve it for testing + judging (the binding constraint), keep the rest cheap"
      : "allocation matches the field-earned recommendation (premium on testing/judging, cheap elsewhere)",
  });
}

// ── post-aggregation debug mode (item 1) ────────────────────────────────────

/** Where a slice's mined regression cases live (sealed alongside its suite). */
const debugCasesPath = (root: string, slice: string) =>
  stzPath(root, join("30-tests", "held-out", slice, "debug-cases.json"));

/**
 * debug-case: turn a reported post-ship defect into a SEALED regression case.
 * The twice-verified oracle runs first — the current winner must FAIL the case
 * (real uncaught defect) and the reference must PASS it (satisfiable, correctly
 * stated). Only then is the case appended to the slice's sealed debug-cases.json
 * and the seal amended. Also computes the re-run set (the slice + its transitive
 * DAG dependents) so the caller can `slice-reset` and re-run against the
 * sharpened suite. `--apply` performs that reset inline.
 */
async function debugCaseCmd(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const slice = args.slice;
  const impl = args.impl; // the shipped winner
  const reference = args.reference; // the test-author's reference-a
  const c: DebugCase = { fn: args.fn!, input: args.input!, expected: args.expected!, note: args.note };
  if (!slice || !impl || !reference || !c.fn || c.input === undefined || c.expected === undefined) {
    process.stderr.write(
      "debug-case requires --slice, --impl <winner>, --reference <reference-a>, --fn, --input '<json-args-array>', --expected '<json>'.\n",
    );
    process.exitCode = 1;
    return;
  }
  const verdict = verifyDebugCase(impl, reference, c);
  if (!verdict.accepted) {
    process.stderr.write(`${verdict.reason}\n`);
    process.exitCode = 1;
    print({ ...verdict });
    return;
  }

  // Append to the slice's sealed debug-cases.json and re-seal (amend).
  const path = debugCasesPath(root, slice);
  const cases = loadDebugCases(path);
  cases.push(c);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cases, null, 2) + "\n", "utf8");
  const amend = await amendSeal(root, `debug-case mined for ${slice}: ${c.note ?? c.fn}`);

  // The re-run set: the slice itself + everything downstream of it.
  const manifest = existsSync(projectManifestPath(root))
    ? readJSON<ProjectManifest>(projectManifestPath(root))
    : { slices: [] as ProjectManifest["slices"] };
  const slices = manifest.slices ?? [];
  const dependents = transitiveDependents(slices, slice);
  const rerunSet = [slice, ...dependents];

  await writeDoc(root, join("40-slices", slice, "debug.md"), {
    frontmatter: { summary: `Debug case mined for ${slice}: ${cases.length} sealed regression case(s).` },
    body:
      `# Debug — post-aggregation defect repair (${slice})\n\n` +
      `A shipped winner was wrong on behaviour the sealed suite did not exercise.\n` +
      `The reproduced case was mined into a sealed regression test (twice-verified:\n` +
      `the winner fails it, the reference passes it) and the seal amended.\n\n` +
      `- **case:** \`${c.fn}(${c.input})\` must equal \`${c.expected}\`\n` +
      `- **note:** ${c.note ?? "(none)"}\n` +
      `- **total sealed regression cases for ${slice}:** ${cases.length}\n` +
      `- **re-run set (this slice + DAG dependents):** ${rerunSet.join(", ")}\n`,
  });

  if (args.apply === "true") for (const id of rerunSet) resetSlice(root, id);

  print({
    accepted: true,
    slice,
    case: c,
    totalCases: cases.length,
    sealAmended: amend.amended,
    rerunSet,
    applied: args.apply === "true",
    note: args.apply === "true"
      ? "seal amended and re-run set reset; re-run each slice in rerunSet against the sharpened suite"
      : "seal amended; run `slice-reset --slice <id> --with-dependents` (or re-run this with --apply) to reset the re-run set",
  });
}

/** Reset one slice's per-slice artifacts so its derived status returns to pending. */
function resetSlice(root: string, id: string): void {
  for (const p of [
    statePath(root, id),
    stzPath(root, join(sliceRel(id), "tournament")),
    stzPath(root, join(sliceRel(id), "spec-diff.md")),
  ]) {
    rmSync(p, { recursive: true, force: true });
  }
}

/**
 * slice-reset: remove a slice's per-slice state + winner artifacts so it (and,
 * with --with-dependents, everything downstream) re-runs. The sealed suite and
 * mined debug cases are NOT touched — the re-run grades against the sharpened
 * suite. This is the deterministic half of debug mode's "re-run affected slice".
 */
async function sliceResetCmd(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const slice = args.slice;
  if (!slice) {
    process.stderr.write("slice-reset requires --slice <id> [--with-dependents].\n");
    process.exitCode = 1;
    return;
  }
  let ids = [slice];
  if (args["with-dependents"] === "true" && existsSync(projectManifestPath(root))) {
    const manifest = readJSON<ProjectManifest>(projectManifestPath(root));
    ids = [slice, ...transitiveDependents(manifest.slices ?? [], slice)];
  }
  for (const id of ids) resetSlice(root, id);
  print({ reset: ids, note: "per-slice state + winner artifacts removed; these slices are now pending and will re-run" });
}

// ── cross-slice merge integrity (sealed-invariant supersession) ─────────────

/** Render the human-readable merge-compat.md mirror of the manifest. */
async function writeCompatDoc(root: string): Promise<void> {
  const m = loadCompat(root);
  const rows = m.entries.length
    ? m.entries
        .map(
          (e) =>
            `| ${e.id} | ${e.supersededSlice} | ${e.supersededBy} | ${e.replacement.slice} | \`${e.panicSubstring}\` | ${e.approved ? "✅ " + (e.approvedBy ?? "") : "⏳ pending"} | ${e.pendingAmendment} |`,
        )
        .join("\n")
    : "| _none_ | | | | | | |";
  await writeDoc(root, join("90-audit", "merge-compat.md"), {
    frontmatter: { summary: `Merge compat: ${m.entries.length} entry(ies), ${m.entries.filter((e) => e.approved).length} approved.` },
    body:
      `# Merge compatibility — superseded sealed invariants\n\n` +
      `Each entry sanctions an EARLIER slice's sealed-suite failure that a LATER\n` +
      `slice legitimately supersedes (e.g. slice-03 "no respawn" vs slice-05\n` +
      `wave-clear). A failure is sanctioned only when the signature matches, the\n` +
      `replacement invariant also passes, and the entry is approved. Entries are\n` +
      `transitional debt — retired once the superseded suite is \`seal-amend\`ed.\n\n` +
      `| id | superseded | superseded by | replacement proof | signature | approved | pending amendment |\n` +
      `|---|---|---|---|---|---|---|\n${rows}\n\n` +
      `## History (append-only)\n\n` +
      (m.history.length ? m.history.map((h) => `${h.seq}. ${h.action} ${h.id}: ${h.detail}`).join("\n") : "_none_") +
      "\n",
  });
}

/** merge-compat-propose: the merge agent proposes an entry (always unapproved). */
async function mergeCompatPropose(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const entry = readJSON<Omit<MergeCompatEntry, "approved" | "approvedBy">>(args.entry!);
  const m = loadCompat(root);
  const res = proposeCompat(m, entry);
  if (!res.ok) {
    process.stderr.write(`${res.error}\n`);
    process.exitCode = 1;
    return;
  }
  saveCompat(root, m);
  await writeCompatDoc(root);
  print({ proposed: entry.id, approved: false, note: "unapproved — an approver must run merge-compat-approve before this can sanction a merge failure" });
}

/** merge-compat-approve: flip a proposed entry to approved, recording who/why. */
async function mergeCompatApprove(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const by = args.by;
  if (!by || by === "true") {
    process.stderr.write('merge-compat-approve requires --by "<who/why>" so a self-approval is auditable.\n');
    process.exitCode = 1;
    return;
  }
  const m = loadCompat(root);
  const res = approveCompat(m, args.id!, by);
  if (!res.ok) {
    process.stderr.write(`${res.error}\n`);
    process.exitCode = 1;
    return;
  }
  saveCompat(root, m);
  await writeCompatDoc(root);
  print({ approved: args.id, by });
}

/** merge-compat-retire: retire an entry once its superseded suite is amended. */
async function mergeCompatRetire(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const ref = args.amendment;
  if (!ref || ref === "true") {
    process.stderr.write('merge-compat-retire requires --amendment "<seal-amend reason/ref>" linking the wave-aware fix.\n');
    process.exitCode = 1;
    return;
  }
  const m = loadCompat(root);
  const res = retireCompat(m, args.id!, ref);
  if (!res.ok) {
    process.stderr.write(`${res.error}\n`);
    process.exitCode = 1;
    return;
  }
  saveCompat(root, m);
  await writeCompatDoc(root);
  print({ retired: args.id, amendment: ref });
}

/** merge-compat-list: READ-ONLY dump of the manifest. */
function mergeCompatList(args: Record<string, string>): void {
  print(loadCompat(args.root!));
}

/**
 * merge-validate: adjudicate REPORTED sealed-suite results against the compat
 * manifest. It does not run the suites (the assembled crate may be Rust); it
 * deterministically classifies each reported failure. Exits non-zero unless every
 * failure is sanctioned — pendingApproval / invalid / unsanctioned all block.
 */
async function mergeValidate(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const results = readJSON<SealedSuiteResult[]>(args.results!);
  const manifest = loadCompat(root);
  const verdict = validateMerge(results, manifest);
  await writeDoc(root, join("90-audit", "merge-validation.md"), {
    frontmatter: {
      summary: `Merge validation: ${verdict.ok ? "OK" : "BLOCKED"} — ${verdict.sanctioned.length} sanctioned, ${verdict.pendingApproval.length} pending, ${verdict.invalid.length} invalid, ${verdict.unsanctioned.length} unsanctioned.`,
    },
    body:
      `# Merge validation\n\n` +
      `Reported sealed-suite results adjudicated against the merge-compat manifest.\n` +
      `(Adjudication is deterministic; the suite *execution* is the caller's — run\n` +
      `it in an ephemeral scratch copy of the assembled crate, never the canonical one.)\n\n` +
      `- **Verdict:** ${verdict.ok ? "✅ OK — merge may proceed" : "⛔ BLOCKED"}\n` +
      `- **Sanctioned supersessions:** ${verdict.sanctioned.map((s) => `${s.slice}←${s.supersededBy} (${s.entryId})`).join(", ") || "—"}\n` +
      `- **Pending approval (blocks):** ${verdict.pendingApproval.map((p) => `${p.slice} (${p.entryId})`).join(", ") || "—"}\n` +
      `- **Invalid — replacement unproven (blocks):** ${verdict.invalid.map((i) => `${i.slice}: ${i.reason}`).join("; ") || "—"}\n` +
      `- **Unsanctioned — suspect real defect (blocks):** ${verdict.unsanctioned.map((u) => `${u.slice}: ${u.reason}`).join("; ") || "—"}\n` +
      `- **Unused approved entries (retire candidates):** ${verdict.unused.join(", ") || "—"}\n`,
  });
  if (!verdict.ok) {
    process.stderr.write(
      `MERGE BLOCKED — ${verdict.unsanctioned.length} unsanctioned, ${verdict.invalid.length} invalid, ${verdict.pendingApproval.length} pending-approval failure(s). See 90-audit/merge-validation.md.\n`,
    );
    process.exitCode = 1;
  }
  print(verdict);
}

// ════════════════════════════════════════════════════════════════════════════
// 0.9.0 — Harness-level recursive self-improvement (meta-loop) bridge commands.
// The bridge owns ALL compute (N6): agents feed numbers in, never do arithmetic.
// ════════════════════════════════════════════════════════════════════════════

/** Read JSON from a file path OR an inline JSON string arg. */
function readJSONArg<T>(v: string | undefined): T | null {
  if (!v || v === "true") return null;
  if (existsSync(v)) return readJSON<T>(v);
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
}

/**
 * inject: adversarial suite hardening (SSR-style). Run the mutation battery
 * (built-ins ∪ promoted) against a winning impl; mutants the SEALED suite still
 * passes are candidate blind spots. Reports survivors + the bounded-FSM next
 * action. Promotion of a survivor into a sealed test is a SEPARATE, gated step
 * (adjudicate clause → general PBT case → seal-amend → reference re-verify) —
 * this command only DISCOVERS, it never amends.
 */
function injectCmd(args: Record<string, string>): void {
  const sealed = args.sealed;
  const impl = args.impl;
  if (!sealed || !impl) {
    process.stderr.write("inject requires --sealed <suite> and --impl <winning-specimen>.\n");
    process.exitCode = 1;
    return;
  }
  const battery = loadBattery(args.root ? batteryDir(args.root) : args.battery);
  const survivors = injectMutants(sealed, impl, battery);
  const { action } = onInjectRound(initialInject(), { survivors: survivors.length, promoted: 0 });
  print({
    batterySize: battery.length,
    survivors: summarizeSurvivors(survivors),
    blindSpotFound: survivors.length > 0,
    nextAction: action,
    note:
      survivors.length > 0
        ? "Blind spot(s) found. Adjudicate each against a NAMED contract clause; only a clause-violating survivor becomes a GENERAL (not mutant-keyed) sealed test via seal-amend + reference re-verify."
        : "No survivor — the sealed suite caught every injected variant.",
  });
}

/**
 * harness-mine: the test-author skill-mining verifier (promotion gate half i).
 * Given a candidate bug-class mutator spec, does it SURVIVE the given sealed
 * suite (a genuine, currently-uncaught blind spot)? A mutator the incumbent
 * suite already kills is a no-op and rejected. The complementary half (ii) — the
 * sharpened suite KILLS it — is a second call against the amended suite expecting
 * `survives:false`.
 */
function harnessMine(args: Record<string, string>): void {
  const sealed = args.sealed;
  const impl = args.impl;
  // Accept either a single MutatorSpec or a battery-style array (take the first).
  const raw = readJSONArg<MutatorSpec | MutatorSpec[]>(args.mutator ?? args["mutator-spec"]);
  const spec = Array.isArray(raw) ? raw[0] : raw;
  if (!sealed || !impl || !spec?.name || !spec.find) {
    process.stderr.write("harness-mine requires --sealed, --impl, and --mutator <spec.json|inline> ({name,find,replace}).\n");
    process.exitCode = 1;
    return;
  }
  const survivors = injectMutants(sealed, impl, [
    { name: spec.name, apply: (s) => (new RegExp(spec.find, spec.flags ?? "")).test(s) ? s.replace(new RegExp(spec.find, spec.flags ?? ""), spec.replace) : null },
  ]);
  const survives = survivors.length > 0;
  print({
    mutator: spec.name,
    survives,
    verdict: survives
      ? "SURVIVES — a genuine, currently-uncaught blind spot (promotion gate half i ✓). Author the general heuristic, then re-run against the sharpened suite expecting survives:false."
      : "killed — the suite already catches this class; not a blind spot. Rejected as a no-op.",
  });
}

/** harness-promote-mutator: append a TWICE-verified mutator spec to the battery. */
async function harnessPromoteMutator(args: Record<string, string>): Promise<void> {
  const root = args.root;
  const rawSpec = readJSONArg<MutatorSpec | MutatorSpec[]>(args.spec);
  const spec = Array.isArray(rawSpec) ? rawSpec[0] : rawSpec;
  if (!root || !spec?.name) {
    process.stderr.write("harness-promote-mutator requires --root and --spec <mutator.json> with a name.\n");
    process.exitCode = 1;
    return;
  }
  const dir = batteryDir(root);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${spec.name.replace(/[^A-Za-z0-9_-]/g, "_")}.json`);
  await writeFile(file, JSON.stringify([spec], null, 2) + "\n", "utf8");
  print({ promoted: spec.name, battery: file, batterySize: loadBattery(dir).length });
}

/**
 * harness-spawn: deterministically sample K parents from the archive (DGM rule
 * P ∝ fitness/(1+childCount)) and emit their genomes as mutation seeds. An empty
 * archive yields the default/incumbent genome as the sole seed.
 */
function harnessSpawn(args: Record<string, string>): void {
  const root = args.root!;
  const k = Math.max(1, Math.round(Number(args.k ?? "4")));
  const archive = readArchive(root);
  const parents = archive.length === 0
    ? [{ variantId: "seed", genome: defaultGenome() }]
    : sampleParents(archive, k).map((p) => ({ variantId: p.variantId, genome: p.genome }));
  print({ count: parents.length, parents, note: "Mutate ONE gene per child (HarnessX substitution); realize via the agent layer, then score with harness-fitness." });
}

/**
 * harness-fitness: compute a variant's held-out fitness from per-substrate truth
 * scores (the agent layer ran the variant's tournament on each recall-free pilot
 * and passes the numbers in), AceGRPO-weighted toward the learnable frontier
 * (substrates where the incumbent is mid-band), then append a content-addressed
 * ArchiveEntry. The bridge owns the math; agents never compute it.
 */
async function harnessFitness(args: Record<string, string>): Promise<void> {
  const root = args.root!;
  const genome = readJSONArg<HarnessGenome>(args.genome);
  const scores = readJSONArg<Record<string, number>>(args.scores);
  if (!genome || !scores) {
    process.stderr.write("harness-fitness requires --root, --genome <genome.json>, --scores <{substrate:score}>.\n");
    process.exitCode = 1;
    return;
  }
  const substrates = Object.keys(scores).sort();
  const inc = incumbent(root);
  const incPer = substrates.map((s) => inc?.perSubstrate[s] ?? 0.5);
  const weights = frontierWeights(incPer);
  const fitness = weightedFitness(substrates.map((s) => scores[s]!), weights);
  const entry = makeArchiveEntry({
    genome,
    parent: args.parent && args.parent !== "true" ? args.parent : inc?.variantId ?? null,
    fitness,
    perSubstrate: scores,
    advantage: 0, // filled by harness-select within its generation
    gates: { hackClean: false, sealOk: false, interfaceParity: false, diversityOk: false, beatsIncumbent: false, rubricCalibrated: false },
  });
  appendArchiveEntry(root, entry);
  if (entry.parent) bumpChildCount(root, entry.parent);
  print({ variantId: entry.variantId, fitness, weights, perSubstrate: scores, incumbentFitness: inc?.fitness ?? null });
}

/**
 * harness-select: GRPO group-relative advantage over a generation of variants
 * (the harness altitude), with the variance-collapse guard. Returns the
 * max-advantage winner and whether the generation carried enough spread to rank.
 */
function harnessSelect(args: Record<string, string>): void {
  const variants = readJSONArg<{ variantId: string; fitness: number }[]>(args.variants);
  if (!variants || variants.length === 0) {
    process.stderr.write("harness-select requires --variants <[{variantId,fitness}]>.\n");
    process.exitCode = 1;
    return;
  }
  const floor = Number(args.floor ?? "0.02");
  const diversity = checkDiversity(variants.map((v) => v.fitness), floor);
  const advantages = groupRelativeAdvantage(variants.map((v) => ({ specimen: v.variantId, reward: v.fitness })));
  const ranked = [...advantages].sort((a, b) => b.advantage - a.advantage);
  print({
    diversity,
    winner: diversity.ok ? ranked[0]?.specimen ?? null : null,
    advantages: ranked,
    note: diversity.ok
      ? "Generation has spread; winner is the max-advantage variant."
      : "VARIANCE COLLAPSE — σ below floor. Do NOT promote; re-sample with forced gene diversity (RC-GRPO).",
  });
}

/**
 * harness-promote: the five-gate promotion decision (DGM hack-resistance). A
 * variant becomes incumbent only if it beats the incumbent on held-out fitness
 * AND is hack-clean on its OWN outputs AND preserved sealing integrity AND
 * interface parity AND came from a diverse generation.
 */
function harnessPromote(args: Record<string, string>): void {
  const root = args.root!;
  const variantId = args.variant;
  const archive = readArchive(root);
  const variant = archive.find((e) => e.variantId === variantId);
  if (!variant) {
    process.stderr.write(`harness-promote: variant ${variantId} not in archive.\n`);
    process.exitCode = 1;
    return;
  }
  const bool = (k: string): boolean => args[k] === "true" || args[k] === undefined ? args[k] === "true" : String(args[k]).toLowerCase() === "true";
  // "Beats incumbent" must compare against the prior incumbent, NOT this variant
  // itself (it may already be the max-fitness archived entry). Prefer an explicit
  // baseline fitness from the caller; else the best fitness among OTHER entries.
  const others = archive.filter((e) => e.variantId !== variantId);
  const baseline =
    args["baseline-fitness"] !== undefined && args["baseline-fitness"] !== "true"
      ? Number(args["baseline-fitness"])
      : others.length
        ? Math.max(...others.map((e) => e.fitness))
        : -Infinity;
  const beatsIncumbent = variant.fitness > baseline;
  // Interface parity: the variant must not change the bridge command surface.
  const incumbentCommands = BRIDGE_COMMANDS;
  const variantCommands = readJSONArg<string[]>(args["variant-commands"]) ?? BRIDGE_COMMANDS;
  const parity = checkParity(incumbentCommands, variantCommands);
  // Calibrated-verifier gate (0.9.5, fail-closed): the judge that produced this
  // variant's selection signal must be target-task calibrated before it may steer
  // promotion (2606.14629 — an uncalibrated verifier silently regresses). A
  // missing --slice-type, or a slice-type whose blind-accuracy battery has not
  // run, reads as uncalibrated.
  const sliceType = args["slice-type"];
  const profile = readReliabilityProfile(root);
  const calib = sliceType
    ? calibrationGate(profile, sliceType)
    : { calibrated: false, reason: "no --slice-type — judge calibration unknown (fail-closed)" };
  const inputs = {
    beatsIncumbent,
    hackClean: bool("hack-clean"),
    sealOk: bool("seal-ok"),
    interfaceParity: parity.ok,
    diversityOk: bool("diversity-ok"),
    rubricCalibrated: calib.calibrated,
  };
  const verdict = promotionGate(inputs);
  // Record the gate snapshot on the entry (audit), append-rewrite is fine: the
  // archive is the durable record and this is the gate result for THIS variant.
  variant.gates = { ...inputs };
  writeFileSync(join(stzPath(root, "60-harness"), "MANIFEST.json"), JSON.stringify(archive, null, 2) + "\n", "utf8");
  print({ variantId, inputs, ...verdict, parity, calibration: calib, baselineFitness: baseline === -Infinity ? null : baseline, variantFitness: variant.fitness });
}

/** harness-status: archive summary, incumbent, and meta-loop view. */
function harnessStatus(args: Record<string, string>): void {
  const root = args.root!;
  const archive = readArchive(root);
  const inc = incumbent(root);
  const meta: Pick<MetaState, "generation"> = { generation: archive.length };
  print({
    archiveSize: archive.length,
    incumbent: inc ? { variantId: inc.variantId, fitness: inc.fitness, perSubstrate: inc.perSubstrate } : null,
    battery: loadBattery(batteryDir(root)).map((m) => m.name),
    variants: archive.map((e) => ({ variantId: e.variantId, parent: e.parent, fitness: e.fitness, childCount: e.childCount, promoted: e.gates.beatsIncumbent })),
    meta,
  });
}

/**
 * judge-stress: consistency CI check (no labels). Given pairwise judgments re-run
 * under an order/verbosity swap, score the fraction whose winner is invariant —
 * a reliability signal grounded in the real cron order-effect. Writes a
 * per-slice-type profile under 90-audit/judge-reliability.md. NEVER aggregates
 * multiple judges (naive ensembles amplify bias — arXiv:2505.19477).
 */
async function judgeStress(args: Record<string, string>): Promise<void> {
  const pairs = readJSONArg<{ original: string; perturbed: string }[]>(args.pairs);
  const sliceType = args["slice-type"] ?? "unknown";
  if (!pairs) {
    process.stderr.write("judge-stress requires --pairs <[{original,perturbed}]> and optional --slice-type.\n");
    process.exitCode = 1;
    return;
  }
  const result = consistencyScore(pairs);
  const bucket = bucketOf(result.score);
  if (args.root) {
    // Persist the machine-readable profile the promotion gate consumes. Merge so
    // a blind-accuracy bucket already written by judge-calibration is preserved
    // (the two commands own different fields and may run in either order).
    mergeReliabilityEntry(args.root, { sliceType, consistency: result.score, n: result.total });
    await writeDoc(args.root, join("90-audit", "judge-reliability.md"), {
      frontmatter: { summary: `Judge consistency for ${sliceType}: ${(result.score * 100).toFixed(0)}% invariant under perturbation (n=${result.total}, ${bucket}).` },
      body:
        `# Judge reliability profile\n\n` +
        `Single robust judge, stress-tested for consistency (NO naive ensembling — more judges amplify bias).\n\n` +
        `- **slice-type:** ${sliceType}\n- **consistency (order/verbosity invariance):** ${result.invariant}/${result.total} = ${result.score.toFixed(3)} (${bucket})\n` +
        `- **blind-battery accuracy:** pending (must be authored blind to judge rationales — a self-built battery is circular)\n\n` +
        `Below ${0.7} ⇒ down-weight the judge for this slice-type and lean on the sealed/truth divergence backstop.\n`,
      ...({} as Record<string, never>),
    });
  }
  print({ sliceType, ...result, bucket });
}

/**
 * judge-calibration (0.9.5): measure the judge's TARGET-TASK accuracy on a blind,
 * pre-registered ground-truth battery and persist the bucket. This is the
 * calibration 2606.14629 requires BEFORE a verifier may steer promotion: a judge
 * that is above-threshold on one slice-type can be sub-threshold on another, and
 * a confident-but-wrong verifier regresses worse than a random one. The agent
 * layer runs the judge on the blind battery and passes its picks (`--verdicts`)
 * alongside the ground-truth labels (`--labels`); the bridge owns the arithmetic
 * (no model call — N6). Writes `blindAccuracyBucket` into the same per-slice-type
 * profile entry judge-stress fills, merge-preserving its consistency field.
 */
function judgeCalibration(args: Record<string, string>): void {
  const root = args.root;
  const sliceType = args["slice-type"];
  const verdicts = readJSONArg<string[]>(args.verdicts);
  const labels = readJSONArg<string[]>(args.labels);
  if (!root || !sliceType || !verdicts || !labels || verdicts.length !== labels.length || verdicts.length === 0) {
    process.stderr.write(
      "judge-calibration requires --root, --slice-type, --verdicts <[picked]>, --labels <[groundTruth]> (equal, non-empty arrays).\n",
    );
    process.exitCode = 1;
    return;
  }
  const correct = verdicts.filter((v, i) => v === labels[i]).length;
  const accuracy = correct / verdicts.length;
  const bucket = bucketOf(accuracy);
  mergeReliabilityEntry(root, { sliceType, blindAccuracyBucket: bucket, n: verdicts.length });
  print({ sliceType, accuracy, bucket, correct, n: verdicts.length });
}

/** The pinned bridge command surface — the interface a variant must preserve. */
// ── 0.9.6 Contract Plane subcommands (PHASED-PLAN Phases 0–1) ────────────────

/**
 * separation-gate: the Phase-1 go/no-go (PHASED-PLAN §1). Executes a
 * naive-but-plausible impl against a functional sealed suite and against the
 * accepted contract predicates, then decides whether the contract carries a
 * signal the suite does not. Uses the canonical, unit-tested TS core
 * (evaluatePredicates + separationGate). Writes result under
 * `.stz/contract/separation/` and exits non-zero when NOT separated (so a CI
 * gate / the operator sees the null immediately).
 *
 *   stz bridge separation-gate --root D --contract preds.json --impl impl.mjs --suite suite.mjs
 */
function separationGateCmd(args: Record<string, string>): void {
  const root = args.root!;
  const contract = readJSON<{ predicates: Predicate[] }>(args.contract!);
  const impl = args.impl!;
  const suite = args.suite!;

  // Sealed suite over common cases (naive impl expected to pass at 1.000).
  const suiteOut = JSON.parse(
    execFileSync("node", [suite, impl], { encoding: "utf8" }).trim(),
  ) as { passRate: number };
  const sealedSuitePassed = suiteOut.passRate >= 1;

  // Produce observations by executing the impl on each predicate check input.
  const observed: Observations = {};
  for (const p of contract.predicates) {
    for (const c of p.checks) {
      observed[c.checkId] = execFileSync("node", [impl, c.input ?? ""], { encoding: "utf8" }).trim();
    }
  }
  const predicateResults = evaluatePredicates(contract.predicates, observed);
  const verdict = separationGate({ sealedSuitePassed, predicateResults });

  const out = stzPath(root, join("contract", "separation", "result.json"));
  mkdirSync(join(out, ".."), { recursive: true });
  const payload = { sealedSuitePassed, sealedSuitePassRate: suiteOut.passRate, predicateResults, ...verdict };
  writeFileSync(out, JSON.stringify(payload, null, 2) + "\n", "utf8");
  print(payload);
  if (!verdict.separated) process.exitCode = 1; // freeze at Phase 0 — surface the null
}

/**
 * contract-accept: the human 7th gate (PHASED-PLAN Phase 1). The ONLY path a
 * contract artifact crosses into trusted state. `--approver` MUST be a human
 * identity, never an agent role — enforced by humanAccept (throws otherwise).
 *
 *   stz bridge contract-accept --artifact a.json --approver "dr-robert-li" --at 2026-07-01
 */
function contractAcceptCmd(args: Record<string, string>): void {
  const path = args.artifact!;
  const artifact = readJSON<ContractArtifact>(path);
  const accepted = humanAccept(artifact, args.approver ?? "", args.at ?? ""); // throws on agent/empty approver
  writeFileSync(path, JSON.stringify(accepted, null, 2) + "\n", "utf8");
  print({ id: accepted.id, state: accepted.state, acceptedBy: accepted.provenance.acceptedBy });
}

/**
 * eval-baseline: Phase-0 measurement. Computes per-repo RepoMetrics for each
 * baseline condition from recorded issue outcomes. Per-repo, never global.
 *
 *   stz bridge eval-baseline --root D --repo project-x --records records.json
 */
function evalBaselineCmd(args: Record<string, string>): void {
  const root = args.root!;
  const repo = args.repo!;
  const byCondition = readJSON<Record<BaselineCondition, IssueRecord[]>>(args.records!);
  const report = baselineReport(repo, byCondition);
  const out = stzPath(root, join("90-audit", "baseline-report.json"));
  mkdirSync(join(out, ".."), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n", "utf8");
  print(report);
}

const BRIDGE_COMMANDS = [
  "version", "begin", "record-eval", "eval", "gate", "escalate", "slice-halt", "record-votes", "select", "finalize",
  "project-init", "project-phase", "project-write-intent", "project-record-area", "project-set-config",
  "project-dark-factory", "project-harness-evolve", "project-config", "slice-add", "project-seed-slices", "project-status", "summary",
  "seal", "seal-verify", "seal-crosscheck", "seal-amend", "merge-validate", "merge-compat-propose",
  "merge-compat-approve", "merge-compat-retire", "merge-compat-list",
  "inject", "harness-mine", "harness-promote-mutator", "harness-spawn", "harness-fitness", "harness-select",
  "harness-promote", "harness-status", "judge-stress", "judge-calibration",
  // 0.9.6 Contract Plane + Phase-0 eval
  "separation-gate", "contract-accept", "eval-baseline",
];

export async function runBridge(argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;
  const args = parseArgs(rest);
  switch (sub) {
    case "version": versionCmd(); break;
    case "begin": await begin(args); break;
    case "record-eval": recordEval(args); break;
    case "eval": evalCmd(args); break;
    case "gate": gate(args); break;
    case "escalate": await escalateCmd(args); break;
    case "slice-halt": await sliceHaltCmd(args); break;
    case "record-votes": recordVotes(args); break;
    case "select": await selectCmd(args); break;
    case "finalize": await finalize(args); break;
    case "project-init": await projectInit(args); break;
    case "project-phase": await projectPhase(args); break;
    case "project-write-intent": await projectWriteIntent(args); break;
    case "project-record-area": await projectRecordArea(args); break;
    case "project-set-config": await projectSetConfig(args); break;
    case "project-dark-factory": await projectDarkFactory(args); break;
    case "project-harness-evolve": await projectHarnessEvolve(args); break;
    case "project-config": await projectConfig(args); break;
    case "slice-add": await sliceAdd(args); break;
    case "project-seed-slices": await projectSeedSlices(args); break;
    case "project-status": await projectStatus(args); break;
    case "summary": await summaryCmd(args); break;
    case "seal": await sealCmd(args); break;
    case "seal-verify": sealVerify(args); break;
    case "seal-crosscheck": await sealCrosscheck(args); break;
    case "seal-amend": await sealAmend(args); break;
    case "debug-case": await debugCaseCmd(args); break;
    case "slice-reset": await sliceResetCmd(args); break;
    case "model-tiers": await modelTiersCmd(args); break;
    case "explore": await exploreCmd(args); break;
    case "anchor-check": await anchorCheckCmd(args); break;
    case "integration-gate": await integrationGateCmd(args); break;
    case "merge-validate": await mergeValidate(args); break;
    case "merge-compat-propose": await mergeCompatPropose(args); break;
    case "merge-compat-approve": await mergeCompatApprove(args); break;
    case "merge-compat-retire": await mergeCompatRetire(args); break;
    case "merge-compat-list": mergeCompatList(args); break;
    // ── 0.9.0 harness-level RSI meta-loop ──────────────────────────────────
    case "inject": injectCmd(args); break;
    case "harness-mine": harnessMine(args); break;
    case "harness-promote-mutator": await harnessPromoteMutator(args); break;
    case "harness-spawn": harnessSpawn(args); break;
    case "harness-fitness": await harnessFitness(args); break;
    case "harness-select": harnessSelect(args); break;
    case "harness-promote": harnessPromote(args); break;
    case "harness-status": harnessStatus(args); break;
    case "judge-stress": await judgeStress(args); break;
    case "judge-calibration": judgeCalibration(args); break;
    // ── 0.9.6 Contract Plane + Phase-0 eval ────────────────────────────────
    case "separation-gate": separationGateCmd(args); break;
    case "contract-accept": contractAcceptCmd(args); break;
    case "eval-baseline": evalBaselineCmd(args); break;
    default:
      process.stderr.write(`unknown bridge subcommand: ${sub}\n`);
      process.exitCode = 1;
  }
}
