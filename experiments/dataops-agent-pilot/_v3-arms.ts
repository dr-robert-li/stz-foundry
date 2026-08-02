/**
 * The three system-prompt arms for the v3 battery.
 *
 * WHY A SECOND ARM FILE INSTEAD OF EDITING `_arms.ts`. Round 3's rule is one
 * variable per round: the battery changes, the method does not. The arms look
 * like method — but `s2-strong` is not a free parameter, it is a FUNCTION OF
 * THE BATTERY it addresses. Its v2 text tells the model that dates arrive in
 * three formats (false in v3 — they are ISO-only by design) and that
 * `revenueCents` is the sum of the surviving deduplicated rows (false in v3 —
 * that ignores refunds, adjustments and the `type` column entirely).
 *
 * Carrying that text into round 3 would not hold the method constant; it would
 * hand the baseline a prompt that contradicts the task in front of it. And the
 * bias runs the dangerous way: a handicapped B makes `W > B` EASIER, so the
 * stale arm inflates the very effect round 3 exists to test. The v3 arms
 * therefore restate for v3 exactly what the v2 arms stated for v2 — no more
 * guidance, no less.
 *
 * `_arms.ts` is left untouched so rounds 1 and 2 remain reproducible from
 * their own committed arms, the same discipline that gives each generator its
 * own id rather than editing an accepted one.
 *
 * WHAT IS DELIBERATELY THE SAME: the arm ids, so every downstream lookup is a
 * one-line import swap; `s0-minimal` verbatim to the character, since it is
 * the floor control and any change to it would move the floor; and
 * `s1-plausible` verbatim, since generic analyst framing says nothing
 * battery-specific in either version.
 *
 * WHAT `s2-strong-v3` MAY AND MAY NOT SAY. v3's task prompt already publishes
 * the six-step pipeline, so restating it would be copying the task text into
 * the system prompt and measuring nothing. What v2's `s2-strong` supplied that
 * its task prompt did not — and what this one supplies too — is the
 * AMOUNT-FORMAT zoo and the execution discipline. That is the frozen v2
 * messiness the v3 prompt still leaves undocumented, so it remains the real
 * content of a strong hand-written prompt.
 */
import type { Arm } from "./_arms.js";

export const ARMS_V3: Arm[] = [
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
    label: "strong, methodology made explicit (v3 battery)",
    systemPrompt: [
      "You are a meticulous data-ops engineer. The task states a numbered pipeline.",
      "Execute it literally and in order. Never substitute a shortcut for a step.",
      "1. Amounts appear as bare cents (12345), dollars (123.45), or $-prefixed",
      "   ($123.45), and may be signed. When rawAmount is empty the real value is",
      "   in amountBackup, in one of the same formats. Convert EVERY amount to",
      "   integer cents before any comparison or any sum. Never sum strings.",
      "2. When rows share an orderId, compare updatedAt as dates and keep the",
      "   latest. Only when those are equal does the larger amount decide it.",
      "   Position in the file means nothing — the rows are not in time order.",
      "3. Apply each remaining step against the rows that actually survived the",
      "   steps before it, not against every row in the file.",
      "4. Return ONLY the requested JSON. No commentary, no code fences beyond",
      "   the requested block.",
    ].join("\n"),
  },
];
