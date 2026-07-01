# STZ Foundry — Rebuild Progression Ledger

This directory is the **append-only record** of the Foundry rebuild: the
evolution of slice-tournament-zoo (STZ, final upstream release 0.9.6) into
**STZ Foundry** (`stz-foundry`, 1.x) — a project whose flagship addition is the
roadmap's largest unbuilt item, the **standalone BYO-LLM harness**: a runner
that owns the spawn-and-collect loop and talks to models directly
(Anthropic/OpenAI-compatible HTTP, local Ollama/vLLM), so the tournament is not
bound to any one vendor's CLI.

The discipline is inherited from `experiments/0.9.6-progression/`: each stage
must **EARN its existence** with a deterministic eval (and, where marked, a
live local-inference run at $0 marginal API) before the next stage is built.
Each completed stage bumps the minor version (semver: each stage ships a new
backward-compatible capability). A stage that cannot be earned is frozen and
reported as a documented negative — not carried forward.

**Billing discipline (unchanged from 0.9.6):** no stage's earn may require paid
API spend. Deterministic earns use fake in-process servers / scripted
providers; live earns use **local Ollama** models already on this machine.

## Earn status

| Stage | Version | Capability | Earn test | Verdict | Record |
|---|---|---|---|---|---|
| 0 | 1.0.0 | Identity rebrand + new-npm-package CI/CD | suite green post-rename; drift guards re-pinned; release workflow name-guard proven present; zero stale identity literals in `src/update.ts` | ✅ **EARNED** | [stage-0.md](stage-0.md) |
| 1 | 1.1.0 | Provider abstraction (Anthropic/OpenAI-compatible HTTP) | deterministic fake-server round-trips: request shape, prompt-caching `cache_control`, retry/error paths | ✅ **EARNED** | [stage-1.md](stage-1.md) |
| 2 | 1.2.0 | FoundryModelLayer (real ModelLayer over providers) | scripted-provider e2e through the real pipeline + live Ollama mini-tournament | ✅ **EARNED** (live: granite4.1:30b, 453s, $0) | [stage-2.md](stage-2.md) |
| 3 | 1.3.0 | Spawn/concurrency + per-specimen isolation | measured concurrency, pool bound, stuck-kill, crash containment, N6 ordering, pipeline composition | ✅ **EARNED** | [stage-3.md](stage-3.md) |
| 4 | 1.4.0 | Per-provider cost/budget tracking | usage aggregation + cap enforcement (deterministic) | — | stage-4.md |
| 5 | 1.5.0 | Standalone foundry runner CLI | fake-provider e2e audit tree + live Ollama full run | — | stage-5.md |
| 6 | 1.6.0 | Docs staleness sweep | grep-clean identity refs outside historical records; version consistency; suite green | — | stage-6.md |

## Provenance

- Upstream final state: slice-tournament-zoo 0.9.6 (fork commit `fae5bb9`)
- Roadmap item being built: `docs/ROADMAP.md` § "A distinct STZ-native harness (BYO LLM)"
- Earned negatives that constrain this rebuild (do-not-re-derive): `docs/PAPER.md`
- Discipline template: `experiments/0.9.6-progression/README.md`
