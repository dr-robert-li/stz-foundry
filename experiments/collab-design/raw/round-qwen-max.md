Let me verify several claims against the actual codebase before rendering findings.


Now I have enough evidence to render findings. Let me verify one more arithmetic claim in the document.


Here are my findings.

---

**1.**

- **Location:** §7, "This suite's 75 pairs land one row past that table's own ceiling."
- **Claim:** The existing `PAIRED_CRITICAL_VALUE_TABLE` ceiling is n_d=60 (confirmed in `_paired-constants.ts:114-156`), and the suite's 75 pairs land "one row past" that ceiling.
- **What would have to change:** 75 − 60 = 15, not 1. Replace "one row past" with "fifteen rows past" (or simply "past"). The conclusion — the table cannot be used — is correct; the arithmetic leading to it is not.

**2.**

- **Location:** §7, "`evaluatePairedGate` throws `no pinned critical value for discordantCount ${discordantCount}` for any count outside that range, transcribed verbatim from the check's own error text."
- **Claim:** The transcribed error message is what fires for out-of-range discordant counts.
- **What would have to change:** `_paired-gate.ts:152-157` has a range guard that fires *first* for out-of-range counts, throwing a different message: `` discordantCount ${discordantCount} outside the supplied critical-value table's own range [${discordantFloor}, ${batterySize}] ``. The transcribed message at line 167 is a fallback for a missing table entry *within* the range — a condition that cannot occur against the default table. Either transcribe the range-guard message (the one that actually fires for out-of-range counts) or drop the "transcribed verbatim" qualifier and name both checks.

**3.**

- **Location:** §8, "truncating each role's hash to 16 hex characters (64 bits) before combining them would narrow the outer hash's own effective collision resistance to that 64-bit surface."
- **Claim:** Using truncated 64-bit inner hashes would weaken the outer hash's collision resistance.
- **What would have to change:** The outer hash is itself truncated to 16 hex characters (64 bits) — stated two paragraphs later in the same section. The outer hash's collision resistance is 64 bits regardless of inner hash width; truncating the inner hashes does not narrow it further. The design choice (full inner hashes) is defensible on a different ground: truncated inner hashes introduce *independent* 64-bit collision surfaces (birthday attack on each role's hash separately, ~2^32 work each) that bypass the outer hash entirely. Restate the rejection reason as "truncated inner hashes add independent inner collision surfaces" rather than "would narrow the outer hash's own collision resistance," which the section's own later truncation of the outer hash contradicts.

**4.**

- **Location:** §3, failure-mode list (five named modes).
- **Claim:** The five named failure modes are complete for the contract's scope.
- **What would have to change:** Add a sixth mode: **the stored handoff hash itself is corrupted or incorrectly recorded.** The contract is a two-part system — artifact bytes plus a stored hash in the task record. The five named modes cover artifact-side failures (mutation, absence, content correctness) and hash scope, but none cover the case where the task record's stored hash is wrong from the start (a runner bug writes the hash of a different artifact, or a truncated digest) or is mutated after recording (the task record is in a mutable store and both the artifact and the stored hash are updated together, defeating the check entirely). The contract's guarantee is only as strong as the immutability of where the hash is stored, and no named mode addresses this.

**5.**

- **Location:** §4, decision statement: "PrimeKG is selected over Amazon and MAG on... an independently-retrieved cc-by-4.0 dataset licence with the PrimeKG codebase/dataset licence distinction stated explicitly (licence)."
- **Claim:** The cc-by-4.0 licence is a ground for selecting PrimeKG over Amazon and MAG.
- **What would have to change:** The cc-by-4.0 licence was verified for the STaRK benchmark dataset (`snap-stanford/stark` on HuggingFace — the queries and gold answers), not for the PrimeKG knowledge base. The PrimeKG dataset's own licence is explicitly stated as "unverified" earlier in the same section. The STaRK benchmark licence applies identically regardless of which KB is selected (Amazon, MAG, or PrimeKG), so it does not differentiate PrimeKG from the alternatives. Either restate the licence ground as covering the STaRK benchmark only (and drop it as a differentiator between KBs), or fetch and verify the PrimeKG dataset's own licence and cite it directly.

---

Total findings: 5
