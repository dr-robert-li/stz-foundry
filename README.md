<div align="center">

# STZ Foundry

<img src="assets/stz-f-logo.svg" alt="STZ-F" width="460">

[![CI](https://github.com/dr-robert-li/stz-foundry/actions/workflows/ci.yml/badge.svg)](https://github.com/dr-robert-li/stz-foundry/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://github.com/dr-robert-li/stz-foundry/blob/main/LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://github.com/dr-robert-li/stz-foundry/blob/main/package.json)

</div>

> **STZ Foundry** runs adversarial coding tournaments. Each *slice* is one
> interface contract plus its implementation plus its tests, implemented in
> parallel by N competing **specimens**. Survivors are selected by an eval gate
> and pairwise LLM judges against a **frozen, sealed** test suite the
> implementers never see. Every run leaves a markdown **audit trail** a human
> can replay. Run it inside Claude Code (`/stz-f:*` commands) or fully
> standalone against **any LLM you bring** — Anthropic, OpenAI-compatible,
> or local Ollama/vLLM at $0.

## Contents

- [Requirements](#requirements)
- [Install](#install)
- [Quickstart 1 — the in-session pipeline (Claude Code)](#quickstart-1--the-in-session-pipeline-claude-code)
- [Quickstart 2 — the standalone foundry runner (BYO LLM)](#quickstart-2--the-standalone-foundry-runner-byo-llm)
- [Updating](#updating)
- [The audit trail](#the-audit-trail)
- [Uninstall](#uninstall)
- [Documentation guide](#documentation-guide)
- [Contributing](#contributing)
- [License](#license)
- [Research](#research)

## Requirements

- Node.js 20 or newer.
- For the in-session pipeline: Claude Code (CLI, desktop, or web).
- For the standalone foundry runner: any OpenAI-compatible endpoint (Ollama,
  vLLM, LiteLLM) or an Anthropic API key. Local models run at $0.
- No database, no vector service.

> **Token cost.** A tournament is deliberately redundant — N parallel
> specimens, multiple judge votes per pair. That buys selection pressure and
> an auditable trail, but it is token-intensive. Tune `n`, `votesPerPair`,
> and `traceTier` down for cheaper runs, or point the foundry runner at a
> local model where redundancy is free.

## Install

```bash
npm i -g stz-foundry                 # the `stz` CLI (aliases: `stz-f`, `stz-foundry`)
# or straight from GitHub:
npm i -g dr-robert-li/stz-foundry
```

For the in-session commands, also install the Claude Code plugin:

```text
/plugin marketplace add dr-robert-li/stz-foundry
/plugin install stz-f
```

Restart the session so the `/stz-f:*` commands and subagents load. The plugin
uses the npm `stz` CLI when present; otherwise it resolves its own bundled
copy — no PATH setup needed.

## Quickstart 1 — the in-session pipeline (Claude Code)

Take a project from idea to completion report, one command per phase:

```text
/stz-f:new        elicit intent + machine-checkable done-predicates
/stz-f:research   external (docs, prior art) + internal (codebase) research
/stz-f:validate   ground-truth every research claim against reality
/stz-f:conventions  style, architecture, naming conventions
/stz-f:tests      test strategy, locked BEFORE implementation
/stz-f:slice      break the work into a DAG of vertical slices
/stz-f:run <id>   the adversarial tournament, once per slice
/stz-f:summary    aggregate everything into one completion report
```

`/stz-f:pipeline` is the dashboard: it shows phase and per-slice status and
dispatches the next step. `/stz-f:pipeline --auto` walks the whole DAG
automatically; dark-factory mode (lights-out, every downstream gate skipped)
is described in
[`docs/development/dark-factory.md`](docs/development/dark-factory.md).

Two run-config knobs (set during `/stz-f:new`) shape autonomous runs: **retry
policy** — what happens when a tournament finds no passer (halt immediately /
retry n times, default 2 / retry unbounded — dangerous, stopped only by the
token/USD caps); and **sequencing** — fan-out (independent slices in
parallel, the default) vs linear (one at a time). One halt class is always
human-in-the-loop regardless: a seal-crosscheck ambiguity (test-design
judgment) durably halts its slice for adjudication while the rest of the DAG
continues.

For a single one-off slice with no project setup:

```text
/stz-f:run payment-validator
```

Advanced (opt-in, default-off): `/stz-f:contract` (typed, human-gated
correctness predicates), `/stz-f:inject` (adversarial suite hardening),
`/stz-f:evolve` (the bounded harness-evolution meta-loop).

## Quickstart 2 — the standalone foundry runner (BYO LLM)

No Claude Code, no vendor CLI — the runner owns the spawn-and-collect loop
and talks to models over HTTP. Local-first:

```bash
stz foundry init .        # scaffolds .stz/ + writes .stz/00-intent/foundry.json
```

```jsonc
// .stz/00-intent/foundry.json — the default template (edit to taste)
{
  "providers": {
    "local":     { "kind": "openai",    "baseUrl": "http://localhost:11434/v1" }
    // "anthropic": { "kind": "anthropic", "baseUrl": "https://api.anthropic.com",
    //                "apiKeyEnv": "ANTHROPIC_API_KEY" }
  },
  "roles": {
    "default":    { "provider": "local", "model": "granite4.1:30b" }
    // per-role overrides: testAuthor, strategist, specimen, judge,
    // documenter, planner — e.g. a stronger model for the test author
  },
  "pricing": {},                       // model → $/MTok; local models are $0
  "caps": { "maxTokens": 500000 },     // hard kill-switches (also maxUsd)
  "n": 2, "votesPerPair": 1,
  "specimenTimeoutMs": 600000
}
```

API keys are referenced by **env-var name** (`apiKeyEnv`), never stored — a
config that embeds a key is rejected.

Write a slice manifest and run the tournament:

```bash
cat > slugify.json <<'EOF'
{
  "id": "slice-slugify", "name": "slugify",
  "contract": "export function slugify(s: string): string — lowercases, trims, collapses whitespace runs into single hyphens, and strips every character that is not a-z, 0-9, or hyphen. Throws TypeError when s is not a string.",
  "donePredicates": [{ "id": "basic", "expr": "slugify('Hello  World!') === 'hello-world'", "kind": "test" }],
  "traceTier": "minimal", "complexity": 1, "dependsOn": [],
  "judge": { "votesPerPair": 1 },
  "summary": "slugify via the standalone foundry runner"
}
EOF
stz foundry run slugify.json .
```

The runner authors and validates the sealed suite (syntax, export-probe,
self-check, and a reference smoke gate with bounded re-asks — hardened
against small-local-model failure modes), spawns the specimens concurrently,
eval-gates, judges, selects a winner, and writes the full audit tree plus a
real-usage cost report (`.stz/90-audit/foundry-cost.md`, per-role token and
dollar breakdown; unknown models are reported, never guessed). Exit code 2
means the run halted with no winner.

## Updating

```bash
stz --version          # what you have
stz update             # check npm for a newer release + plugin/CLI drift
npm i -g stz-foundry@latest      # update the CLI
/plugin update stz-f             # update the plugin (inside Claude Code)
stz migrate            # bring an existing .stz/ tree up to the current schema
```

`stz update` never self-installs; it prints the exact commands. `stz migrate`
is additive and backed-up by construction.

## The audit trail

Everything STZ Foundry decides lands in a tiered `.stz/` tree in your repo —
the point of the system is that you can replay why every line of code won:

| Tier | Purpose |
| ---- | ------- |
| `00-intent/` | elicitation, done-predicates, run config, `foundry.json` |
| `10-research/` | external/internal research, ground-truth validation |
| `20-standards/` | versioned conventions, ADRs |
| `30-tests/` | test strategy, rubric, **sealed held-out suite** (read-only) |
| `40-slices/` | slice DAG, manifests, specimen prototypes, tournament, spec-diff |
| `50-pressure/` | culled specimens' diffs + critiques (the pressure log) |
| `90-audit/` | journal, call ledger, cost reports, state, completion report |

Reading a finished run:

```bash
cat .stz/40-slices/<id>/tournament.md    # who competed, who won, the votes
cat .stz/40-slices/<id>/spec-diff.md     # intent vs as-built claims
cat .stz/50-pressure/<id>/pressure.md    # why the losers lost
cat .stz/90-audit/journal.md             # the replayable event log
cat .stz/90-audit/foundry-cost.md        # per-role tokens + dollars (foundry runs)
```

Worked examples you can read without running anything:
[`examples/clamp-tournament/`](examples/clamp-tournament/) (a planted cheater
passes all 304 sealed checks and is disqualified at the gate) and
[`examples/full-pipeline/`](examples/full-pipeline/) (the project front-phases
for a slugify library). A **live** foundry run's complete audit tree is
committed at
[`experiments/foundry-progression/live/stage5-workdir/`](experiments/foundry-progression/live/stage5-workdir/).

## Uninstall

```text
/plugin uninstall stz-f
/plugin marketplace remove dr-robert-li/stz-foundry
```

```bash
npm rm -g stz-foundry
rm -rf .stz AGENTS.md     # the only things STZ writes into your repo
```

## Documentation guide

Operator docs:

- **This README** — install, both quickstarts, the audit trail.
- **Dark-factory mode** — lights-out autonomy contract:
  [`docs/development/dark-factory.md`](docs/development/dark-factory.md).

Contributor docs:

- **Contributing** — setup, architecture rule, quality bar:
  [`CONTRIBUTING.md`](CONTRIBUTING.md).
- **Source layout** — the `src/` module map: [`src/README.md`](src/README.md).
- **Local development & testing** — the engine without Claude Code:
  [`docs/development/local-and-testing.md`](docs/development/local-and-testing.md).
- **The bridge CLI** — deterministic `stz bridge` subcommands:
  [`docs/development/bridge-cli.md`](docs/development/bridge-cli.md).
- **Sealed-suite integrity** — the guide-vs-sensor contract:
  [`docs/development/sealed-suite.md`](docs/development/sealed-suite.md).
## Contributing

Contributions welcome — read [`CONTRIBUTING.md`](CONTRIBUTING.md) first. The
short version: Node 20+, `npm ci`, `npm test` (the full suite must stay
green), `npm run typecheck`, and every behavioural change lands with the test
that proves it. Architecture rule: exact decisions (selection, pricing,
gating) live in deterministic TypeScript, never in agent prose.

## License

[Apache-2.0](LICENSE).

## Research

The full account — what STZ is, the experiments, the outcomes, and the open
questions — is in [`docs/PAPER.md`](docs/PAPER.md) ("When does a
self-improving coding harness actually improve competency? A negative
result, earned"). The first-person build log is
[`docs/JOURNAL.md`](docs/JOURNAL.md).
