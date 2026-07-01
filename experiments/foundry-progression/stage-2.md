# Stage 2 — FoundryModelLayer over providers (v1.2.0)

**Verdict: ✅ EARNED** (deterministic e2e + live local-model tournament, 2026-07-02)

## What was built

`src/foundry/model-layer.ts` — the real `ModelLayer` implementation over the
stage-1 provider seam. The per-slice orchestrator (`runSlice`) is untouched;
the foundry layer slots into its existing injection point, so the deterministic
spine (selection, GRPO, escalation, budget, audit) is byte-identical between
mock and foundry runs.

- **Role → `{provider, model}` map** (test-author, strategist, specimen,
  judge, documenter, planner): heterogeneous tournaments (local vs hosted,
  family vs family) are configuration, not code.
- **Deterministic elicitor, by design.** Done-predicates and complexity are
  human-supplied and echoed through — acceptance criteria are never
  model-invented (the F2 gate, preserved in the standalone path).
- **The real eval runner does the gating**: the LLM-authored sealed harness is
  *executed* against each specimen (`runSealed`), coverage is V8-measured,
  mutation survival is source-mutated and re-executed, and the real
  hack-pattern detector scans every specimen. No model self-reports are
  trusted anywhere in the gate.
- **Cache-stable prompts**: static role instructions ride `system`; volatile
  content (contract, strategy, code) rides the user message. Unparseable judge
  votes fall back to a deterministic tie-break, never a crash.
- **Usage accumulation** per role call (`layer.usage`) — stage 4's input.

## Eval design

Two halves, per the ledger discipline:

**(a) Deterministic e2e** (`test/foundry-model-layer.test.ts`): a scripted
provider (canned completions routed by role marker) drives `runSlice` with
N=3 — two correct clamp implementations and one **planted-broken** specimen
(ignores the upper bound). Asserts: the broken specimen is culled *by the
executed sealed suite* (its real `testPassRate` appears in the pressure log),
a correct specimen wins by judge votes, the full audit tree materializes
(tournament/spec-diff/pressure/journal), and per-role usage is accumulated.
This proves plumbing + gate, deliberately not model intelligence.

**(b) Live local-model tournament** (`live/stage2-live.ts`, recorded in
`live/stage2-result.json` + `live/stage2-stz-tree/`): the identical pipeline
with every role played by **granite4.1:30b on local Ollama** (OpenAI-compat
endpoint, keyless) — the BYO-LLM claim exercised for real at $0 marginal API.

## Results

- Deterministic: 3/3 stage-2 tests green; suite green; typecheck clean.
- **Live** (one shot, no retries needed): N=2 clamp tournament, 7 LLM calls,
  453s wall-clock, 1148 in / 761 out tokens. The model **authored a real
  executable sealed harness** (assert-based, including an Infinity edge case
  and inverted-range rejection), both specimens passed the executed gate
  (2/2), the judge ranked `a > b`, GRPO advantage +1.0/−1.0 (reward 0.950 vs
  0.867 — the mutation-survival term separated them), winner promoted,
  spec-diff + pressure log + journal written. Exit 0.

## Honesty caveats

- `faithful=false` on the live run: the planner's and documenter's claim
  *wording* diverged (claim-id-free literal matching) — a known limitation of
  the mock-path spec-diff, not a foundry defect; the as-built behaviour was
  correct.
- The live earn is n=1 on a trivial contract with a single local model. It
  earns the *mechanism* (standalone BYO-LLM tournament end-to-end with real
  gating); it does not claim model-quality or field-scale outcomes.
- The sealed harness written to the audit tree gains YAML frontmatter from
  `writeDoc`; evaluation used the raw in-memory harness. A replay from the
  tree must strip frontmatter first (noted for the stage-5 runner).
- Specimens run sequentially in this stage; parallel spawn + timeout kill is
  stage 3 by design.
