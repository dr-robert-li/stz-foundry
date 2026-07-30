import { generateWarehouse, buildTasks } from "../../src/foundry/fixture-warehouse.js";
import { createProvider } from "../../src/foundry/provider.js";

const STRONG = [
  "You are a meticulous data-ops engineer. Follow this method exactly:",
  "1. Parse every CSV row. Track orderId to drop exact duplicate rows.",
  "2. Filter to ONLY the requested customerId and month. Normalize dates first:",
  "   ISO (2026-01-05), slashed (05/01/2026 = DD/MM/YYYY), and month-name",
  "   (January 5, 2026) all occur.",
  "3. For each surviving row take rawAmount; if it is empty, take amountBackup.",
  "   Amounts appear as bare cents (12345), dollars (123.45), or $-prefixed",
  "   ($123.45). Convert ALL to integer cents before summing. Never sum strings.",
  "4. orderCount = number of surviving deduplicated rows. revenueCents = their sum.",
  "5. Return ONLY the requested JSON.",
].join("\n");

const w = generateWarehouse(7);
const task = buildTasks(w)[0]!;
const want = Object.fromEntries(task.checks.map((c) => [c.checkId.slice(-12), c.expect]));
console.log("EXPECT:", JSON.stringify(want));

for (const model of ["granite4.1:30b", "nemotron3:33b", "qwen3.6:latest"]) {
  const provider = createProvider({ kind: "openai", baseUrl: "http://localhost:11434/v1" });
  const t0 = Date.now();
  try {
    const res = await provider.chat({
      model,
      messages: [
        { role: "system", content: STRONG },
        { role: "user", content: task.prompt },
      ],
    });
    const m = res.text.match(/\{[\s\S]*\}/);
    let got = "unparseable";
    if (m) {
      try {
        const j = JSON.parse(m[0]);
        const inner = j?.totals?.["cust-1105__2026-09"];
        got = inner ? `orderCount=${inner.orderCount} revenueCents=${inner.revenueCents}` : "wrong shape";
      } catch { got = "bad json"; }
    }
    console.log(`${model.padEnd(18)} ${((Date.now()-t0)/1000).toFixed(0).padStart(4)}s  ${got}`);
  } catch (e) {
    console.log(`${model.padEnd(18)}   ERR  ${(e as Error).message.slice(0, 120)}`);
  }
}
