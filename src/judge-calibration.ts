/**
 * Blind judge-calibration battery scoring (the 0.9.5 calibrated-verifier gate's
 * missing input).
 *
 * `calibrationGate` (judge-reliability.ts) is fail-closed on
 * `blindAccuracyBucket === null`, and that field has been null since it was
 * introduced: the battery it depends on was never authored. Consequence,
 * measured in both tournament rounds — `rubricCalibrated` refused every
 * promotion, so one of the seven gates has never once been observed to PASS.
 * A gate that can only ever refuse is not evidence of anything; it is untested
 * in the affirmative. This module supplies the evidence that lets it be earned.
 *
 * WHY THIS IS NOT CIRCULAR. The literature's warning (arXiv:2606.14629, "When
 * Good Verifiers Go Bad") is that an uncalibrated verifier silently regresses
 * the thing it steers, and that a verifier above-threshold on task A can sit at
 * 8–23% rubric accuracy on task B. The obvious-but-wrong way to calibrate is to
 * score the judge against its own cited reasons, or against a second judge —
 * both of which measure agreement, not correctness. Instead the ground truth
 * here is the CONSTRUCTED EXOGENOUS ORACLE the data-ops battery already
 * provides: for a pair of agent definitions we know, from recorded real runs,
 * which one actually scored higher against answer-first facts computed before
 * any candidate existed. The judge sees only the two definitions and never the
 * scores. That is a genuine α>0 signal, not an opinion poll.
 *
 * Pure (N6) — no IO, no clock, no provider. The battery is CONSTRUCTED and the
 * judge is RUN by the experiment layer; this module only scores what comes back.
 */
import { createHash } from "node:crypto";
import {
  bucketOf,
  consistencyScore,
  type PerturbedJudgment,
  type ReliabilityBucket,
  type SliceTypeReliability,
} from "./judge-reliability.js";

/**
 * One blind pair: two agent definitions whose ORACLE ordering is known from
 * recorded runs, plus what the judge said about them.
 *
 * `gap` is the absolute difference in oracle fitness. It is required, not
 * optional, because a pair whose gap is inside the measurement noise has no
 * knowable ground truth — see `MIN_DISCRIMINABLE_GAP`'s note.
 */
export interface BlindPair {
  pairId: string;
  /** The definition that genuinely scored higher on the exogenous oracle. */
  oracleWinner: string;
  /** The other one. */
  oracleLoser: string;
  /** |fitness(winner) − fitness(loser)| from the recorded runs. */
  gap: number;
  /** Which id the judge picked, presented in one order. `null` means the
   *  judge ABSTAINED — it produced no parseable verdict. That counts as
   *  incorrect, never as a missing data point: see `scoreCalibrationBattery`. */
  judgeVerdict: string | null;
  /** Which id the judge picked with the presentation order swapped. Optional:
   *  absent means the consistency perturbation was not run for this pair. */
  judgeVerdictSwapped?: string;
}

export interface CalibrationResult {
  sliceType: string;
  /** Pairs whose gap cleared the floor and were therefore scorable. */
  scored: number;
  /** Pairs dropped as indiscriminable — reported, never silently omitted. */
  dropped: number;
  correct: number;
  /** Pairs where the judge produced no parseable verdict. Scored as incorrect
   *  and reported separately — excluding them biases accuracy upward whenever
   *  abstention correlates with difficulty, which it measurably does. */
  abstained: number;
  accuracy: number;
  /** What a judge that never reads the pair would score — see
   *  `trivialPreferenceBaseline`. Accuracy at or below this is not evidence
   *  of ranking ability. */
  baselineAccuracy: number;
  consistency: number;
  bucket: ReliabilityBucket;
  /** sha256 over the battery's identity + ground truth. Recording this BEFORE
   *  the judge runs is what makes "the set was fixed in advance" checkable
   *  rather than merely asserted. */
  batteryHash: string;
  entry: SliceTypeReliability;
  notes: string[];
}

/**
 * A pair must out-gap the measurement noise to have a knowable answer.
 *
 * The §3 tournament measured identical-prompt run-to-run spread of 0.000–0.115
 * on this battery (experiments/dataops-agent-pilot/PILOT-RESULTS.md). For a
 * pair inside that band the ORACLE ITSELF cannot say which definition is
 * better — the ordering could flip on a re-run. Scoring a judge against such a
 * pair punishes or rewards it for our noise, and would make the resulting
 * accuracy number meaningless in either direction. Callers pass their own
 * measured floor; this is the default from that run.
 */
export const MIN_DISCRIMINABLE_GAP = 0.115;

/**
 * The minimum scorable pairs before an accuracy bucket means anything.
 *
 * With n=3, one lucky pair moves accuracy by 0.33 — enough to jump two
 * buckets. A battery that small can mint "high" from noise, which is precisely
 * the confident-but-wrong verifier 2606.14629 warns about, laundered through a
 * gate. Below this the result is refused rather than reported weakly: a
 * calibration that cannot discriminate must not unblock a promotion gate.
 */
export const MIN_BATTERY_SIZE = 12;

/**
 * The best accuracy obtainable by a judge that does not read the pair at all —
 * it just always prefers one fixed candidate whenever that candidate is
 * present, and coin-flips otherwise.
 *
 * This guard exists because the first real battery run needed it. The model
 * used for that run turned out to be domain-finetuned for an unrelated domain,
 * so its scores are VOID as a judge assessment (see PILOT-RESULTS.md) — but the
 * failure SHAPE it exposed is generic and worth guarding permanently: it scored
 * 13/18 = 0.722 overall, bucketing "medium" and unblocking the promotion gate,
 * while decomposing to 10/11 (0.909) on pairs where one particular candidate
 * was the oracle winner and 3/7 (0.429) — below chance — everywhere else. It
 * was not ranking; it was applying a fixed prior that happened to correlate,
 * because that candidate won 11 of 18 pairs. The trivial "always prefer it"
 * strategy scores 0.806 on the same battery, so it was WORSE than reading
 * nothing. Any judge can fail this way; a domain-mismatched one just fails
 * it loudly.
 *
 * That is exactly 2606.14629's confident-but-wrong verifier, and an aggregate
 * accuracy number cannot see it. Beating this baseline is the minimum evidence
 * that a judge is discriminating rather than exploiting the battery's own class
 * imbalance — the standard "beat the majority classifier" bar.
 */
export function trivialPreferenceBaseline(
  pairs: Pick<BlindPair, "oracleWinner" | "oracleLoser">[],
): { accuracy: number; candidate: string } {
  const candidates = new Set(pairs.flatMap((p) => [p.oracleWinner, p.oracleLoser]));
  let best = { accuracy: 0, candidate: "" };
  for (const c of candidates) {
    let score = 0;
    for (const p of pairs) {
      if (p.oracleWinner === c) score += 1; // always-prefer-c is right here
      else if (p.oracleLoser === c) score += 0; // and wrong here
      else score += 0.5; // c absent: coin flip
    }
    const accuracy = score / pairs.length;
    if (accuracy > best.accuracy) best = { accuracy, candidate: c };
  }
  return best;
}

export class CalibrationBatteryError extends Error {
  constructor(message: string) {
    super(`[judge-calibration] ${message}`);
    this.name = "CalibrationBatteryError";
  }
}

/**
 * Hash the battery's IDENTITY and GROUND TRUTH — deliberately not the judge's
 * verdicts, so the same hash can be computed before the judge runs and
 * re-computed after, and any edit to the question set between those two moments
 * changes it. Sorted by `pairId` so key order cannot alter the digest.
 */
export function batteryHash(pairs: Pick<BlindPair, "pairId" | "oracleWinner" | "oracleLoser" | "gap">[]): string {
  const canonical = [...pairs]
    .sort((a, b) => (a.pairId < b.pairId ? -1 : a.pairId > b.pairId ? 1 : 0))
    .map((p) => `${p.pairId}|${p.oracleWinner}|${p.oracleLoser}|${p.gap.toFixed(6)}`)
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Score a blind battery into a `SliceTypeReliability` entry that
 * `calibrationGate` can actually consume.
 *
 * Fail-closed in the same spirit as the gate it feeds: an under-sized battery,
 * or one whose pairs are all indiscriminable, throws rather than returning a
 * weak-but-passing profile. The only thing worse than no calibration is a
 * calibration number that looks measured and is not.
 */
export function scoreCalibrationBattery(
  sliceType: string,
  pairs: BlindPair[],
  minGap: number = MIN_DISCRIMINABLE_GAP,
): CalibrationResult {
  const notes: string[] = [];

  // Shape guards first, each its own named step.
  const ids = new Set<string>();
  for (const p of pairs) {
    if (ids.has(p.pairId)) {
      throw new CalibrationBatteryError(`duplicate pairId ${JSON.stringify(p.pairId)}`);
    }
    ids.add(p.pairId);
    if (p.oracleWinner === p.oracleLoser) {
      throw new CalibrationBatteryError(
        `pair ${JSON.stringify(p.pairId)} has the same id on both sides — no ordering to recover`,
      );
    }
    if (!Number.isFinite(p.gap) || p.gap < 0) {
      throw new CalibrationBatteryError(
        `pair ${JSON.stringify(p.pairId)} has a non-finite or negative gap (${p.gap})`,
      );
    }
    // A NON-NULL verdict naming neither side is a wiring bug, not a wrong
    // answer, and must not be quietly scored as incorrect. An explicit null
    // (abstention) is a different thing and is handled below.
    if (p.judgeVerdict !== null && p.judgeVerdict !== p.oracleWinner && p.judgeVerdict !== p.oracleLoser) {
      throw new CalibrationBatteryError(
        `pair ${JSON.stringify(p.pairId)}: judge verdict ${JSON.stringify(p.judgeVerdict)} names ` +
          `neither side of the pair`,
      );
    }
  }

  // Indiscriminable pairs are DROPPED and counted, never scored — see
  // MIN_DISCRIMINABLE_GAP.
  const scorable = pairs.filter((p) => p.gap >= minGap);
  const dropped = pairs.length - scorable.length;
  if (dropped > 0) {
    notes.push(
      `${dropped} pair(s) dropped: oracle gap below the ${minGap} noise floor, so the ground ` +
        `truth is not knowable for them`,
    );
  }

  if (scorable.length < MIN_BATTERY_SIZE) {
    throw new CalibrationBatteryError(
      `only ${scorable.length} discriminable pair(s); need >= ${MIN_BATTERY_SIZE}. A battery this ` +
        `small can mint a "high" bucket from luck, which is exactly the confident-but-wrong ` +
        `verifier the calibration gate exists to catch. Refusing to emit a profile.`,
    );
  }

  // Abstentions count as INCORRECT, not as excluded.
  //
  // Measured reason: two runs of one model over the same frozen pairs produced
  // 1 and 4 unparseable verdicts respectively, and THREE of those four were
  // pairs it had answered WRONG on the other run. Dropping them lifted accuracy
  // from 0.722 to 0.933 and the bucket from "medium" to "high" with no
  // improvement in judging. (That model was later found to be finetuned for an
  // unrelated domain, so its scores are void as a judge assessment — but the
  // selection effect is generic, and a high abstention rate is precisely what a
  // mismatched or struggling judge produces.) A verifier that declines exactly
  // the questions it would fail looks calibrated and is not — and for a
  // promotion gate, a judge that cannot emit a verdict cannot steer, so
  // fail-closed is also correct on the merits.
  const abstained = scorable.filter((p) => p.judgeVerdict === null).length;
  const correct = scorable.filter((p) => p.judgeVerdict === p.oracleWinner).length;
  const accuracy = correct / scorable.length;
  if (abstained > 0) {
    notes.push(
      `${abstained}/${scorable.length} verdict(s) unparseable — counted as INCORRECT, not ` +
        `excluded: dropping them would bias accuracy upward whenever abstention tracks difficulty`,
    );
  }

  // Consistency reuses the existing scorer verbatim — the perturbation check
  // is order-invariance, and it needs no ground truth at all.
  // Consistency needs two real verdicts; an abstention on either side has no
  // invariance to measure.
  const perturbed: PerturbedJudgment[] = scorable
    .filter((p) => p.judgeVerdict !== null && p.judgeVerdictSwapped !== undefined)
    .map((p) => ({ original: p.judgeVerdict!, perturbed: p.judgeVerdictSwapped! }));
  const consistency = consistencyScore(perturbed);
  if (perturbed.length === 0) {
    notes.push("no order-swapped verdicts supplied — consistency defaults to 1 and is NOT measured");
  } else if (perturbed.length < scorable.length) {
    notes.push(`consistency measured on ${perturbed.length}/${scorable.length} pairs only`);
  }

  // Base-rate guard, its own named step. A judge that cannot beat the trivial
  // fixed-preference strategy is exploiting the battery's class imbalance, not
  // ranking — and its aggregate accuracy is an artifact. Forced to "low" so
  // `calibrationGate` refuses it, rather than throwing: this IS a valid,
  // informative calibration result ("this judge does not discriminate"), and
  // it should be recorded as one.
  const baseline = trivialPreferenceBaseline(scorable);
  const beatsBaseline = accuracy > baseline.accuracy;
  const bucket = beatsBaseline ? bucketOf(accuracy) : "low";
  if (!beatsBaseline) {
    notes.push(
      `accuracy ${accuracy.toFixed(3)} does NOT beat the trivial fixed-preference baseline ` +
        `${baseline.accuracy.toFixed(3)} (always prefer ${JSON.stringify(baseline.candidate)}) — ` +
        `the judge is exploiting class imbalance, not discriminating; bucket forced to "low"`,
    );
  }

  return {
    sliceType,
    scored: scorable.length,
    dropped,
    correct,
    abstained,
    accuracy,
    baselineAccuracy: baseline.accuracy,
    consistency: consistency.score,
    bucket,
    batteryHash: batteryHash(pairs),
    entry: {
      sliceType,
      consistency: consistency.score,
      blindAccuracyBucket: bucket,
      n: scorable.length,
    },
    notes,
  };
}
