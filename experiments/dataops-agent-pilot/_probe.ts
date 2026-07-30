import { generateWarehouse, buildTasks } from "../../src/foundry/fixture-warehouse.js";
import { createProvider } from "../../src/foundry/provider.js";

const w = generateWarehouse(7);
const task = buildTasks(w)[0]!;
const provider = createProvider({ kind: "openai", baseUrl: "http://localhost:11434/v1" });
const res = await provider.chat({
  model: "granite4.1:30b",
  messages: [
    { role: "system", content: "You are a meticulous data-ops engineer. Return ONLY the requested JSON artifact." },
    { role: "user", content: task.prompt },
  ],
});
console.log("=== EXPECTED ===");
console.log(JSON.stringify(task.checks, null, 2));
console.log("\n=== RAW MODEL RESPONSE ===");
console.log(res.text);
