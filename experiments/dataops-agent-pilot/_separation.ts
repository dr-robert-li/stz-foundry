/**
 * SEPARATION GATE — run BEFORE any blind tournament data exists.
 *
 * Question: does the data-ops fixture-warehouse battery actually discriminate
 * between system prompts of different quality, using the real local model?
 * If a minimal prompt and a strong prompt score the same, the battery is
 * saturated and a tournament over prompt text can measure nothing — the same
 * recall-saturation null five of this repo's six prior arms hit.
 *
 * Touches no blind data. Reports whatever it finds.
 */
import { generateFixtureBattery, generateFixtureBatteryV2 } from "../../src/foundry/fixture-warehouse.js";
import { generateFixtureBatteryV3, v3Knobs } from "../../src/foundry/fixture-warehouse-v3.js";
import { runAgentBattery } from "../../src/foundry/agent-runner.js";
import { ARMS } from "./_arms.js";
import { ARMS_V3 } from "./_v3-arms.js";

// Env-configurable so the SAME committed script reproduces both the original
// granite 3-seed gate (defaults below) and the pre-registered escalation runs
// (PREREG.md §2), rather than forking a near-identical script per model.
//   SEPGATE_MODEL=qwen3.6:latest SEPGATE_SEEDS=7 SEPGATE_TIMEOUT_MS=1200000 \
//   SEPGATE_CONCURRENCY=1 tsx _separation.ts
const MODEL = process.env.SEPGATE_MODEL ?? "granite4.1:30b";
const SEEDS = (process.env.SEPGATE_SEEDS ?? "7,42,1234").split(",").map((s) => Number(s.trim()));
// A too-short timeout would kill slow models and report a spurious 0.000 —
// the exact false null this gate exists to avoid. Raise it per model.
const TIMEOUT_MS = Number(process.env.SEPGATE_TIMEOUT_MS ?? 240_000);
const CONCURRENCY = Number(process.env.SEPGATE_CONCURRENCY ?? 2);
// Re-measure a single contaminated cell without re-running the clean ones.
// v1 = the accepted original battery (prescriptive prompt, exact-match only).
// v2 = the phase-3 revision (non-prescriptive prompt, graded revenueCents).
// v3 = the headroom battery (V3-BATTERY-DESIGN.md rev 2). It takes a GRID
// POINT as well as a seed, because the knob setting is exactly what the
// calibration probe selected and what the human then accepted — running the
// gate at a different point would gate a different instrument.
const GENERATOR = process.env.SEPGATE_GENERATOR ?? "v1";
if (GENERATOR !== "v1" && GENERATOR !== "v2" && GENERATOR !== "v3") {
  throw new Error(`SEPGATE_GENERATOR must be "v1", "v2" or "v3", got ${JSON.stringify(GENERATOR)}`);
}
const GRID_POINT = process.env.SEPGATE_GRID_POINT;
if (GENERATOR === "v3" && !GRID_POINT) {
  throw new Error("SEPGATE_GRID_POINT must be set explicitly when SEPGATE_GENERATOR=v3");
}
const buildBattery =
  GENERATOR === "v3"
    ? (seed: number, id: string) => generateFixtureBatteryV3(seed, id, v3Knobs(GRID_POINT!))
    : GENERATOR === "v2"
      ? generateFixtureBatteryV2
      : generateFixtureBattery;
// The v3 battery gets the v3 arms — see `_v3-arms.ts` for why the strong arm
// is restated rather than carried over.
const ALL_ARMS = GENERATOR === "v3" ? ARMS_V3 : ARMS;
const ARM_FILTER = process.env.SEPGATE_ARMS?.split(",").map((s) => s.trim());
const RUN_ARMS = ARM_FILTER ? ALL_ARMS.filter((a) => ARM_FILTER.includes(a.id)) : ALL_ARMS;
if (RUN_ARMS.length === 0) throw new Error(`SEPGATE_ARMS matched no arm: ${process.env.SEPGATE_ARMS}`);

const main = async () => {
  console.log("# Separation gate — data-ops battery vs system-prompt quality");
  console.log(
    `model: ${MODEL} (local Ollama) · generator: ${GENERATOR} · seeds: ${SEEDS.join(", ")} · ` +
      `taskTimeoutMs: ${TIMEOUT_MS} · concurrency: ${CONCURRENCY}\n`,
  );
  const table: string[] = ["| arm | seed | tasks | passed | testPassRate |", "|---|---|---|---|---|"];
  const byArm = new Map<string, number[]>();
  let tasksPerCell = 0;

  for (const arm of RUN_ARMS) {
    for (const seed of SEEDS) {
      const battery = buildBattery(seed, `sepgate-${GENERATOR}${GRID_POINT ? `-${GRID_POINT}` : ""}-${seed}`);
      const run = await runAgentBattery(
        { id: arm.id as never, systemPrompt: arm.systemPrompt },
        battery,
        {
          provider: { kind: "openai", baseUrl: "http://localhost:11434/v1", model: MODEL },
          concurrency: CONCURRENCY,
          taskTimeoutMs: TIMEOUT_MS,
        },
      );
      const passed = run.tasks.filter((t) => t.pass).length;
      const rate = run.result.testPassRate;
      tasksPerCell = run.tasks.length;
      // A killed/errored task scores 0 and is indistinguishable from a wrong
      // answer in `rate` alone — surface it so a timeout can never be misread
      // as a capability floor.
      // `_armprobe.ts` established (seed 7, s1/s2) that every response parsed —
      // failures there are arithmetic, not formatting. Keep counting it anyway
      // so a formatting regression on an unseen seed cannot masquerade as a
      // capability drop.
      const noArtifact = run.tasks.filter((t) => t.artifactPaths.length === 0).length;
      if (noArtifact > 0) {
        console.log(`    !! ${noArtifact}/${run.tasks.length} tasks produced NO artifact (formatting, not arithmetic)`);
      }
      const nonOk = run.tasks.filter((t) => t.status !== "ok");
      if (nonOk.length > 0) {
        console.log(
          `    !! ${nonOk.length}/${run.tasks.length} tasks not ok: ` +
            nonOk.map((t) => `${t.taskId}=${t.status}(${t.failureReason ?? "-"})`).join(", "),
        );
      }
      table.push(`| ${arm.id} | ${seed} | ${run.tasks.length} | ${passed} | ${rate.toFixed(3)} |`);
      const acc = byArm.get(arm.id) ?? [];
      acc.push(rate);
      byArm.set(arm.id, acc);
      // Under v2 `rate` is the mean GRADED score, so it and the exact-pass
      // count diverge — printing both is what makes the partial credit
      // visible instead of hidden inside one number.
      console.log(
        `  ${arm.id} seed ${seed}: ${passed}/${run.tasks.length} exact (rate ${rate.toFixed(3)}) ` +
          `scores [${run.tasks.map((t) => t.score.toFixed(2)).join(" ")}]`,
      );
    }
  }

  console.log("\n" + table.join("\n"));
  console.log("\n## Means across seeds\n");
  for (const arm of RUN_ARMS) {
    const rates = byArm.get(arm.id)!;
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    console.log(`  ${arm.id.padEnd(14)} mean=${mean.toFixed(3)}  (${arm.label})`);
  }
  const means = RUN_ARMS.map((a) => {
    const r = byArm.get(a.id)!;
    return r.reduce((x, y) => x + y, 0) / r.length;
  });
  const spread = Math.max(...means) - Math.min(...means);
  console.log(`\n  SPREAD (max-min of arm means) = ${spread.toFixed(3)}`);

  // The old verdict fired at a fixed spread >= 0.05. With 6 tasks per cell
  // `testPassRate` is quantized to 0.167, so that threshold sat BELOW the
  // smallest difference the instrument can express — it declared separation on
  // one task's worth of noise, and did so for two single-seed runs that pooled
  // to nothing (PILOT-RESULTS.md). Compare against the sampling error instead.
  const hi = RUN_ARMS[means.indexOf(Math.max(...means))]!.id;
  const lo = RUN_ARMS[means.indexOf(Math.min(...means))]!.id;
  const n = SEEDS.length * (tasksPerCell || 1);
  const se = (p: number) => (p * (1 - p)) / n;
  const seDiff = Math.sqrt(se(Math.max(...means)) + se(Math.min(...means)));
  console.log(`  n=${n} tasks/arm · quantum=${(1 / (tasksPerCell || 1)).toFixed(3)} · SE(diff)=${seDiff.toFixed(3)}`);
  if (RUN_ARMS.length < 2) {
    console.log("  => single arm — SPREAD is meaningless here, nothing to compare against.");
  } else if (spread <= seDiff) {
    console.log(
      `  => NO RELIABLE SEPARATION. ${hi} vs ${lo} differ by ${spread.toFixed(3)}, within one\n` +
        `     standard error (${seDiff.toFixed(3)}). A prompt tournament would select on noise.`,
    );
  } else if (spread <= 2 * seDiff) {
    console.log(
      `  => WEAK / INCONCLUSIVE. ${spread.toFixed(3)} exceeds 1 SE but not 2. Add seeds before\n` +
        "     trusting the ordering — and check it does not reverse between them.",
    );
  } else {
    console.log(`  => SEPARATION EXISTS (${spread.toFixed(3)} > 2 SE) on the pooled means.`);
  }

  // ── SIGN CONSISTENCY. Pooled means can show a clean separation that no
  //    individual seed reproduces: two seeds ordering one way and a third
  //    ordering the other average to a spread that looks like signal and is
  //    a cancellation. Round 2 measured exactly that shape one altitude up —
  //    a +0.0067 win, a −0.22 loss and an exact tie pooling to "nearly
  //    nothing" — so the gate checks the ordering per seed rather than
  //    advising a human to remember to.
  //
  //    Reported for the top-vs-bottom arm pair, which is the pair the spread
  //    verdict above is about. A gate that separates on the pooled mean but
  //    flips sign across seeds is NOT a gate that passed.
  if (RUN_ARMS.length >= 2) {
    const hiRates = byArm.get(hi)!;
    const loRates = byArm.get(lo)!;
    const perSeed = SEEDS.map((seed, i) => ({ seed, diff: hiRates[i]! - loRates[i]! }));
    const positive = perSeed.filter((p) => p.diff > 0).length;
    const zero = perSeed.filter((p) => p.diff === 0).length;
    console.log(
      `\n  SIGN CONSISTENCY (${hi} - ${lo}): ` +
        perSeed.map((p) => `s${p.seed}=${p.diff >= 0 ? "+" : ""}${p.diff.toFixed(3)}`).join(" · "),
    );
    if (positive === perSeed.length) {
      console.log("  => SIGN-CONSISTENT across every seed. The ordering is a fact about the arms.");
    } else {
      console.log(
        `  => NOT SIGN-CONSISTENT (${positive}/${perSeed.length} positive, ${zero} exact ties). The pooled\n` +
          "     spread above is a cancellation, not a separation. Do not run a tournament on it.",
      );
    }
  }
};

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
