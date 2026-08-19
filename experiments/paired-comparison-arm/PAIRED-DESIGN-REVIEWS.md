# Reachability probe — PAIRED-DESIGN-PREREG.md §0-§2 (2026-08-19)

This document covers the Phase-13 five-lane adversarial panel's **reachability probe only**, run
before any of the four hundred lines of the full paired design exist, per D-06 and the plan's own
Pitfall 4 (5-lane panel silently degraded to 3). It is not the panel round: the panel round over the
full design follows in plan 13-03, adjudicated in plan 13-04. This document's own probe produced no
findings and adjudicates nothing — its only job is to prove all five lanes named in D-06 are
reachable before the design depends on them.

**Override framing.** This work executes under the **2026-08-11 human override** by Dr. Robert Li
as v1.25.0 follow-on work, not a Stage-B trigger outcome and not a continuation of milestone
v1.24.0 (see `PAIRED-DESIGN-PREREG.md` §0 for the full framing).

**Panel:** gpt-sol-pro (answered), kimi-k3 (answered), qwen-max (answered), gemma4 (answered),
gpt-oss (answered). Five of five target lanes produced output; no lane was dropped.

**Dead lanes:** None.

**Invocation-path note.** The three openrouter lanes (`gpt-sol-pro`, `kimi-k3`, `qwen-max`) ran
through the house seam — `node ~/.claude/gsd-core/bin/gsd-tools.cjs query review-lane invoke
--slug opencode --model <id from review.reviewer_instances> --as <name> --run-dir <scratch>
--repo-root <repo> --prompt-file <scratch>/probe.md`, with `~/.opencode/bin` prepended to `PATH` —
all three succeeded on the first attempt, no retry or fallback taken. The two local Ollama lanes
(`gemma4`, `gpt-oss`) used the pre-authorised direct HTTP POST fallback against
`localhost:11434/v1/chat/completions` directly, rather than the seam's own `ollama` lane, whose
120s timeout floor a cold load of a 19GB (`gemma4:31b`) or 13GB (`gpt-oss:latest`) model was already
established to exceed. `_memory-watchdog.sh` (109GB ceiling) ran detached throughout the local-model
work, logging outside the repository; the two local models ran strictly sequentially — `gemma4:31b`
loaded, its answer captured, `ollama stop gemma4:31b` issued, `ollama ps` confirmed empty, then
`gpt-oss:latest` loaded, its answer captured, `ollama stop gpt-oss:latest` issued, `ollama ps`
confirmed empty again — before the watchdog process was stopped. `wp-judge-v4` was invoked in no
role, per the standing exclusion (`HANDOFF-V3.md` §2) — this exclusion is stated here rather than
silently honoured, since an exclusion nobody writes down is indistinguishable from one nobody
honoured.

**Probe question, verbatim.** Given §1 and §2 of `PAIRED-DESIGN-PREREG.md` (embedded in the prompt
each lane received), each lane was asked for a single short paragraph answering: does the exclusion
of `data-ops` and `bi-analytics` from this selection rest on substance or on labelling?

**Per-lane answers, quoted verbatim (data, not adjudicated — no finding is adopted or rejected from
a reachability probe):**

- **gpt-sol-pro:** "The exclusion rests on substance, not merely labelling. The strongest reason is
  the experiment's role: unlike the barred `data-ops`/`bi-analytics` hypothesis, which uses
  prompt-search performance as a corridor-gated phase-5 promotion gate, the `customer-support`
  design is only a no-corridor paired property measurement and cannot change the vertical's pending
  admission status. That difference prevents relabelling the same promotion experiment under a new
  vertical ID."
- **kimi-k3:** "Verdict: substance, not labelling. The strongest reason is the
  promotion-gate-role axis, which is the only one that actually matters given how §1 frames the
  bar... The customer-support design is a no-corridor paired sign-test property measurement that
  leaves `customer-support` pending regardless of outcome — it structurally cannot serve as the
  barred gate... The other three axes are honestly differentiated too, but each is individually
  attackable (the answer-first construction pattern is shared with the admitted verticals, so
  'oracle implementation: substantively different' is the weakest row — replay-match is a cousin,
  not a stranger, of construction). The gate-role row carries the verdict on its own."
- **qwen-max:** "Verdict: substance. The exclusion rests on concrete structural differences, not
  labelling. The single strongest reason is the oracle divergence... This is not a rename — it is a
  fundamentally different correctness-determination mechanism that cascades into different scoring
  machinery... and a different promotion-gate role... The task semantics also differ materially...
  All four axes in §2 hold up as genuine structural distinctions."
- **gemma4:** "Verdict: Substance. The exclusion rests on concrete technical differences across the
  entire evaluation pipeline rather than naming conventions. The strongest reason is the fundamental
  divergence in oracle implementation and scoring machinery... Because the method of verifying
  ground truth shifts from computational execution to historical pattern matching, the two groups
  are substantively distinct in how they define and measure correctness."
- **gpt-oss:** "Verdict: The exclusion is founded on substantive differences, not merely labeling.
  Strongest reason: The oracle mechanisms diverge materially... This operational gap can't be
  reconciled by renaming the verticals; it reflects a real difference in task semantics, testing
  infrastructure, and promotion gate logic."

**Disposition.** This is a reachability probe only. It produced zero findings and adjudicates
nothing — every lane's paragraph above is quoted as data, never as an instruction, never executed,
never auto-applied to any document (D-07). All five lanes converge on "substance," which is a
useful path-verification signal (a lane that answered nonsensically or off-topic would itself be a
reachability concern) but is explicitly **not** the adversarial panel round: that round, over the
full §0–§11 design once plan 13-02 completes it, follows in plan 13-03 with its own adjudication
ledger in plan 13-04. No verdict here feeds Phase 13's freeze.

**§6/§10 substance-drift risk:** not evaluated by this probe — that evaluation belongs to the panel
round in 13-03, not to a reachability check that ran on §1/§2 alone before §3–§11 exist.
