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
import { generateFixtureBattery } from "../../src/foundry/fixture-warehouse.js";
import { runAgentBattery } from "../../src/foundry/agent-runner.js";

const ARMS: Array<{ id: string; label: string; systemPrompt: string }> = [
  {
    id: "s0-minimal",
    label: "minimal (no domain guidance at all)",
    systemPrompt: "You are a helpful assistant.",
  },
  {
    id: "s1-plausible",
    label: "plausible generic analyst framing",
    systemPrompt:
      "You are a careful data analyst. Read the user's data, do the requested " +
      "aggregation accurately, and return exactly the output format requested.",
  },
  {
    id: "s2-strong",
    label: "strong, methodology made explicit",
    systemPrompt: [
      "You are a meticulous data-ops engineer. Follow this method exactly:",
      "1. Parse every CSV row. Track orderId to drop exact duplicate rows.",
      "2. Filter to ONLY the requested customerId and month. Normalize dates first:",
      "   ISO (2026-01-05), slashed (05/01/2026 = DD/MM/YYYY), and month-name",
      "   (January 5, 2026) all occur.",
      "3. For each surviving row take rawAmount; if it is empty, take amountBackup.",
      "   Amounts appear as bare cents (12345), dollars (123.45), or $-prefixed",
      "   ($123.45). Convert ALL to integer cents before summing. Never sum strings.",
      "4. orderCount = number of surviving deduplicated rows. revenueCents = their sum.",
      "5. Return ONLY the requested JSON. No commentary, no code fences beyond the",
      "   requested block.",
    ].join("\n"),
  },
];

const SEEDS = [7, 42, 1234];

const main = async () => {
  console.log("# Separation gate — data-ops battery vs system-prompt quality");
  console.log(`model: granite4.1:30b (local Ollama) · seeds: ${SEEDS.join(", ")}\n`);
  const table: string[] = ["| arm | seed | tasks | passed | testPassRate |", "|---|---|---|---|---|"];
  const byArm = new Map<string, number[]>();

  for (const arm of ARMS) {
    for (const seed of SEEDS) {
      const battery = generateFixtureBattery(seed, `sepgate-${seed}`);
      const run = await runAgentBattery(
        { id: arm.id as never, systemPrompt: arm.systemPrompt },
        battery,
        { concurrency: 2, taskTimeoutMs: 240_000 },
      );
      const passed = run.tasks.filter((t) => t.pass).length;
      const rate = run.result.testPassRate;
      table.push(`| ${arm.id} | ${seed} | ${run.tasks.length} | ${passed} | ${rate.toFixed(3)} |`);
      const acc = byArm.get(arm.id) ?? [];
      acc.push(rate);
      byArm.set(arm.id, acc);
      console.log(`  ${arm.id} seed ${seed}: ${passed}/${run.tasks.length} (rate ${rate.toFixed(3)})`);
    }
  }

  console.log("\n" + table.join("\n"));
  console.log("\n## Means across seeds\n");
  for (const arm of ARMS) {
    const rates = byArm.get(arm.id)!;
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    console.log(`  ${arm.id.padEnd(14)} mean=${mean.toFixed(3)}  (${arm.label})`);
  }
  const means = ARMS.map((a) => {
    const r = byArm.get(a.id)!;
    return r.reduce((x, y) => x + y, 0) / r.length;
  });
  const spread = Math.max(...means) - Math.min(...means);
  console.log(`\n  SPREAD (max-min of arm means) = ${spread.toFixed(3)}`);
  console.log(
    spread < 0.05
      ? "  => SATURATED / NO SEPARATION. A prompt tournament cannot measure anything here."
      : "  => SEPARATION EXISTS. A prompt tournament has something to select on.",
  );
};

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
