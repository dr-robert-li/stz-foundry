/**
 * ARM PROBE — why does an arm fail?
 *
 * `_separation.ts` reports `testPassRate` only, and a 0 there is ambiguous in
 * exactly the way that matters: a task scores 0 both when the model emits the
 * required `path=answer.json` fence with WRONG numbers (a real capability
 * result) and when it emits the right numbers but no parseable fence (an
 * instrument/formatting artifact). The seed-7 gate found the strong prompt
 * scoring BELOW the minimal one, and that inversion cannot be interpreted
 * until those two cases are separated.
 *
 * So this replays every task of one warehouse under one arm and prints, per
 * task: whether the fence parsed, the recovered values, and the expected ones.
 * Reuses `parseArtifacts` — the same parser the scorer uses, never a lookalike.
 *
 *   PROBE_ARM=s2-strong PROBE_MODEL=qwen3.6:latest tsx _armprobe.ts
 */
import { generateWarehouse, buildTasks } from "../../src/foundry/fixture-warehouse.js";
import { createProvider } from "../../src/foundry/provider.js";
import { parseArtifacts } from "../../src/foundry/agent-runner.js";
import { ARMS } from "./_arms.js";

const ARM_ID = process.env.PROBE_ARM ?? "s2-strong";
const MODEL = process.env.PROBE_MODEL ?? "qwen3.6:latest";
const SEED = Number(process.env.PROBE_SEED ?? 7);

const arm = ARMS.find((a) => a.id === ARM_ID);
if (!arm) throw new Error(`unknown arm "${ARM_ID}" — have: ${ARMS.map((a) => a.id).join(", ")}`);

const warehouse = generateWarehouse(SEED);
const tasks = buildTasks(warehouse);
const provider = createProvider({ kind: "openai", baseUrl: "http://localhost:11434/v1" });

console.log(`# Arm probe — arm=${ARM_ID} model=${MODEL} seed=${SEED} tasks=${tasks.length}`);

let fenceMissing = 0;
let wrongValues = 0;
let correct = 0;

for (const task of tasks) {
  const groupKey = task.id.replace(/^data-ops-fact-recovery-/, "");
  // The two checks are orderCount and revenueCents, in that order.
  const expected = task.checks.map((c) => `${c.checkId.split("-").pop()}=${c.expect}`).join(" ");
  const t0 = Date.now();
  let verdict: string;
  try {
    const res = await provider.chat({
      model: MODEL,
      system: arm.systemPrompt,
      messages: [{ role: "user", content: task.prompt }],
    });
    const files = parseArtifacts(res.text);
    const raw = files["answer.json"];
    if (raw === undefined) {
      // The decisive case: right or wrong, the scorer could not see an answer.
      fenceMissing++;
      const looksLikeJson = /"totals"/.test(res.text);
      verdict =
        `NO-FENCE (keys=[${Object.keys(files).join(",")}] ` +
        `totals-in-text=${looksLikeJson} chars=${res.text.length})`;
    } else {
      let got = "unparseable-json";
      try {
        const inner = (JSON.parse(raw) as any)?.totals?.[groupKey];
        got = inner ? `count=${inner.orderCount} revenueCents=${inner.revenueCents}` : "wrong-shape";
      } catch { /* keep unparseable-json */ }
      const hit = task.checks.every((c) => {
        try {
          const inner = (JSON.parse(raw) as any)?.totals?.[groupKey];
          const field = c.checkId.endsWith("order-count") ? "orderCount" : "revenueCents";
          return JSON.stringify(inner?.[field]) === c.expect;
        } catch { return false; }
      });
      if (hit) correct++; else wrongValues++;
      verdict = `${hit ? "PASS" : "WRONG"} got[${got}]`;
    }
  } catch (e) {
    verdict = `ERR ${(e as Error).message.slice(0, 100)}`;
  }
  console.log(`  ${groupKey}  ${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s  ${verdict}  want[${expected}]`);
}

console.log(
  `\n  correct=${correct}  wrong-values=${wrongValues}  no-fence=${fenceMissing}  (of ${tasks.length})`,
);
console.log(
  fenceMissing > 0
    ? "  => at least some failures are FORMATTING, not arithmetic. The arm's rate\n" +
        "     understates its competence and the gate's spread is partly an instrument effect."
    : "  => every response was parseable. Failures here are genuine arithmetic errors.",
);
