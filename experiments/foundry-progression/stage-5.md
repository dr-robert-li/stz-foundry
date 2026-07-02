# Stage 5 — Standalone foundry runner CLI (v1.5.0)

**Verdict: ✅ EARNED** (deterministic + live, 2026-07-02)

## What was built

`src/foundry/runner.ts` — the CLI-ownable spawn-and-collect loop. `stz foundry
run <manifest.json> [dir]` drives the full adversarial tournament through the
provider seam — no agent host, no vendor CLI, local-first:

- **`loadFoundryConfig`**: parses + validates `foundry.json`
  (`.stz/00-intent/foundry.json`) — providers (openai/anthropic wire shapes),
  per-role model overrides, pricing table, caps, tournament knobs. API keys
  are named by env var (`apiKeyEnv`), never stored; a config embedding
  `apiKey` is rejected outright (N-sec).
- **`buildRoles`**: default role + per-role overrides → the six-role model
  map (testAuthor/strategist/specimen/judge/documenter/planner).
- **`runFoundry`**: config → cost meter → `FoundryModelLayer` → `runSlice`
  → real-usage cost report written to `.stz/90-audit/foundry-cost.md`.
- **CLI**: `stz foundry init` (writes a secret-free local-first template),
  `stz foundry run` (exit 2 on halt).

## Live-earn hardening (defects found by the live run, fixed in the instrument)

The live run on local Ollama surfaced five real defect classes; each produced
a deterministic guard or a sharper prompt, all regression-tested:

1. **undici 300s headers timeout** — a non-streaming local completion answers
   only after FULL generation; slow hardware exceeds 300s and surfaces as a
   spurious `fetch failed` retry-storm. `provider.ts` now speaks
   `node:http/https` directly (no client timeout, zero-dep rule preserved).
2. **Reference framed the harness** — a reference impl that default-exports
   makes every harness case throw `x is not a function`; the smoke gate
   blamed (and re-asked) the harness. New `referenceExportCheck` probe-imports
   the reference, verifies the contract's named exports, and re-asks the
   REFERENCE (bounded) before the smoke gate runs.
3. **Static import of process.argv[2]** — small local models write
   `import … from process.argv[2]` (SyntaxError). The sealed-harness contract
   now dictates the exact first line (`const mod = await import(…)`).
4. **passRate as rounded string** — `"passRate":"0.4583"` via `toFixed`.
   Prompt pins all three fields as raw JSON numbers; `harnessSelfCheck` now
   names the actual defect (parsed-but-mistyped) instead of the generic
   "no JSON line", so the bounded re-ask can fix it.
5. **TypeScript leakage into the reference** — the model copies the
   contract's TS signature verbatim. The reference prompt now states the
   signature is documentation-only, with a literal do/don't example.

One defect class was correctly REJECTED by the instrument rather than
patched: ornith:9b twice invented expectations beyond the contract
(`"---test---"` → `"test"` hyphen-trimming). The reference smoke gate killed
both harnesses — exactly its job. The fix was a stronger test-author model,
not a weaker gate.

## Eval design

Deterministic (`test/foundry-runner.test.ts` + new model-layer guards):

- Config validation: missing providers/roles/default, unknown provider kind,
  unknown role→provider reference, missing model, **embedded apiKey
  rejected**, `apiKeyEnv` unset rejected.
- Role materialization: default fan-out + per-role overrides.
- e2e over a scripted provider: full tournament, winner selected, cost report
  written with per-role breakdown.
- `referenceExportCheck`: named-export reference accepted; default-only
  reference rejected; authorTests re-asks the REFERENCE (not the harness)
  and proceeds when corrected.
- `harnessSelfCheck`: string `passRate` produces the typed-defect message.

## Live results (the earn)

Local Ollama, mixed servers/models — test author `qwen3.6:latest` (system
Ollama 0.30.6 @ 11434), all other roles `ornith:9b` (user-level Ollama 0.31.1
@ 11435; the system daemon predates the model's requirements):

- Sealed suite authored, validated (syntax → export probe → self-check →
  reference smoke gate) — 26 cases.
- Round 1: 2 specimens, no passers → GRPO retry with pressure context.
- Round 2: winner `specimen-a` at **26/26 (passRate 1)**; `specimen-b` culled
  at the gate (5/26 = 0.19, recorded in the pressure log).
- 11 priced calls, 41 570 tokens, $0.0000 (both models correctly listed as
  unpriced local models).
- Full audit tree materialized: tournament, spec-diff, pressure log,
  refinement, sealed suite (frontmattered audit copy), prototypes, journal,
  foundry-cost report.

## Repeatability rerun (same day)

A clean rerun from an empty audit tree initially DIED at the smoke gate:
qwen3.6 this time invented hyphen-trimming and accent-transliteration
expectations (the same defect class ornith showed) and one re-ask wasn't
enough. Hardening: the smoke re-ask now instructs the author to recompute
every failing expectation by mechanically applying only the contract's rules
(or delete the case), and the gate allows TWO bounded re-asks before dying.
With that in place the rerun completed: winner `specimen-a` at 24/24
(verified directly against the sealed suite), 2 rounds, 12 calls,
47 528 tokens, $0.

## Honesty caveats

- `faithful=false` in the live run: the spec-diff shows 0 intent claims kept —
  ornith:9b's documenter emitted generic claims that don't match the intent
  spec. The as-built diff is working as designed; the local model is a weak
  documenter. Deterministic e2e proves the faithful path.
- The live winner is a trivial slice (slugify, complexity 1) — chosen to
  exercise the full loop cheaply, not to prove model strength.
- Wall-clock budget remains per-specimen; a run-level cap is still the
  operator's job.
