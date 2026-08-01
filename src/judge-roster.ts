/**
 * The judge roster for `sliceType: "component"` — which model may steer a
 * promotion, which stands in if it cannot, and which is refused outright.
 *
 * Every entry here is MEASURED, not asserted. The numbers come from the blind
 * calibration battery (`src/judge-calibration.ts`,
 * `experiments/dataops-agent-pilot/judge-calibration-battery.json`), whose
 * ground truth is the constructed exogenous oracle: for each pair we know from
 * recorded runs which agent definition actually scored higher against
 * answer-first facts computed before any candidate existed. The judge saw only
 * the definitions, never the scores.
 *
 * WHY A ROSTER AND NOT AN ENSEMBLE. The obvious use of four calibrated judges
 * is a majority vote. On this battery that is a REGRESSION, measured: the
 * 3-judge majority scores 15/19 = 0.789 against `gemma4`'s 17/19 = 0.895,
 * because the errors are correlated — of the five pairs any judge got wrong,
 * four had two or more judges wrong together. Voting amplifies the shared bias
 * instead of cancelling it, exactly as `NAIVE_ENSEMBLE_FORBIDDEN`
 * (judge-reliability.ts, citing arXiv:2505.19477) already required. So the
 * alternates are FAILOVER, never voters.
 */
import type { JudgeReliabilityProfile, ReliabilityBucket, SliceTypeReliability } from "./judge-reliability.js";

export type JudgeRole = "primary" | "alternate" | "fallback" | "refused";

export interface RosteredJudge {
  model: string;
  role: JudgeRole;
  /** Measured on the blind battery — see the module doc comment. */
  accuracy: number;
  /** What a judge that reads nothing scores on the same battery
   *  (`trivialPreferenceBaseline`). Accuracy at or below this is not evidence
   *  of ranking ability. */
  baselineAccuracy: number;
  consistency: number;
  bucket: ReliabilityBucket;
  /** Discriminable pairs the figures rest on. Small — read the caveat. */
  n: number;
  note: string;
}

/**
 * Measured 2026-08-01 against battery hash
 * `3a0b56d686e98015eb68f3d9a49aff20ba8d8b557718d4660fbde3708d41db83`, all
 * cross-family from the tournament's candidate model (`qwen3.6`) so ranking
 * and execution never sit in one family.
 *
 * CAVEAT THAT TRAVELS WITH THESE NUMBERS: n=19. `gpt-oss` scored 0.895 and
 * then 0.842 on the identical battery across an ollama upgrade — one pair. The
 * gaps between the three passing judges sit inside that noise, so the ordering
 * primary/alternate/fallback is NOT a statistically established ranking. What
 * the data does support: granite fails the trivial-preference baseline and is
 * refused; the other three clear every guard; and `gemma4` is uniquely
 * order-perfect (consistency 1.000), which is a stability property and the
 * real reason it is primary.
 */
export const COMPONENT_JUDGE_ROSTER: readonly RosteredJudge[] = Object.freeze([
  Object.freeze({
    model: "gemma4:31b",
    role: "primary" as const,
    accuracy: 0.895,
    baselineAccuracy: 0.579,
    consistency: 1.0,
    bucket: "medium" as const,
    n: 19,
    note: "highest accuracy AND perfect order-invariance; zero abstentions",
  }),
  Object.freeze({
    model: "gpt-oss:latest",
    role: "alternate" as const,
    accuracy: 0.842,
    baselineAccuracy: 0.579,
    consistency: 0.842,
    bucket: "medium" as const,
    n: 19,
    note: "clears every guard; scored 0.895 pre-ollama-upgrade, 0.842 after — one pair of drift",
  }),
  Object.freeze({
    model: "nemotron3:33b",
    role: "fallback" as const,
    accuracy: 0.737,
    baselineAccuracy: 0.579,
    consistency: 0.842,
    bucket: "medium" as const,
    n: 19,
    note: "clears every guard; unusable as a CANDIDATE (3220s, unparseable) but ranks fine — judging and doing are different competencies",
  }),
  Object.freeze({
    model: "granite4.1:30b",
    role: "refused" as const,
    accuracy: 0.526,
    baselineAccuracy: 0.579,
    consistency: 0.632,
    bucket: "low" as const,
    n: 19,
    note: "BELOW the trivial fixed-preference baseline — worse than reading nothing; also order-inconsistent",
  }),
]);

export class JudgeRosterError extends Error {
  constructor(message: string) {
    super(`[judge-roster] ${message}`);
    this.name = "JudgeRosterError";
  }
}

/**
 * The model that should steer, given which models are currently reachable.
 *
 * Strict precedence primary → alternate → fallback; a `refused` entry is never
 * selected however available it is, and an empty availability set throws
 * rather than defaulting to anything. Fail-closed: there is no "pick whatever
 * is left" branch, because the whole point of the roster is that some models
 * must not judge.
 */
export function selectJudge(available: readonly string[]): RosteredJudge {
  const order: JudgeRole[] = ["primary", "alternate", "fallback"];
  for (const role of order) {
    const entry = COMPONENT_JUDGE_ROSTER.find((j) => j.role === role && available.includes(j.model));
    if (entry) return entry;
  }
  const refusedButAvailable = COMPONENT_JUDGE_ROSTER.filter(
    (j) => j.role === "refused" && available.includes(j.model),
  ).map((j) => j.model);
  throw new JudgeRosterError(
    `no calibrated judge available (have: ${available.join(", ") || "none"})` +
      (refusedButAvailable.length > 0
        ? ` — ${refusedButAvailable.join(", ")} is present but REFUSED: it scores below the ` +
          `trivial-preference baseline and may not steer a promotion`
        : ""),
  );
}

/**
 * Build the `JudgeReliabilityProfile` that `calibrationGate` consumes, from a
 * rostered judge's MEASURED figures.
 *
 * A `refused` judge yields a profile that still fails the gate — the entry is
 * emitted honestly (bucket `low`) rather than omitted, so the refusal is
 * visible in the audit record as a measurement rather than as a missing
 * profile. "Never calibrated" and "calibrated and found wanting" are different
 * facts and must not collapse into one.
 */
export function profileFor(judge: RosteredJudge, sliceType = "component"): JudgeReliabilityProfile {
  const entry: SliceTypeReliability = {
    sliceType,
    consistency: judge.consistency,
    blindAccuracyBucket: judge.bucket,
    n: judge.n,
  };
  return { schemaVersion: 1, perSliceType: [entry] };
}
