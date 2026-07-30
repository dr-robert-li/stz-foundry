/**
 * The three system-prompt arms of the separation gate, shared by `_separation.ts`
 * (which scores them) and `_probe.ts` (which inspects raw responses under them).
 *
 * Extracted because the "strong" prompt was previously duplicated verbatim in
 * both scripts: a probe that drifts from the arm it claims to be probing would
 * silently answer a different question than the gate asked.
 */
export interface Arm {
  id: string;
  label: string;
  systemPrompt: string;
}

export const ARMS: Arm[] = [
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
