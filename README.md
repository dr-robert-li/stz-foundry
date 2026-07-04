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
- Optional but recommended on Linux: **bubblewrap** (`bwrap`) so the execution
  sandbox uses full OS isolation. Without it (or `sandbox-exec` on macOS) the
  sandbox degrades to the Node permission model — filesystem-safe but *not*
  network-isolated, and it warns loudly. See the security note below.

> **Token cost.** A tournament is deliberately redundant — N parallel
> specimens, multiple judge votes per pair. That buys selection pressure and
> an auditable trail, but it is token-intensive. Tune `n`, `votesPerPair`,
> and `traceTier` down for cheaper runs, or point the foundry runner at a
> local model where redundancy is free.

> **Security — the execution sandbox.** STZ executes model-generated code (the
> sealed harness, smoke checks, mutants, references). Every one of those runs
> through a layered, default-deny sandbox: **bwrap** on Linux and
> **sandbox-exec** on macOS (no network, read-only host, resource caps), with
> the Node permission model as a portable fallback that blocks the filesystem
> but not the network and says so. The chosen isolation level is recorded in
> the audit trail — no silent downgrade. Override with
> `STZ_SANDBOX=bwrap|sandbox-exec|node-permission|none` (`none` is the
> pre-sandbox behaviour and must be chosen explicitly). Install `bwrap` for
> full isolation before running untrusted or prompt-injectable input.

## Install

```bash
npm i -g stz-foundry                 # the `stz` CLI (aliases: `stz-f`, `stz-foundry`)
# or straight from GitHub:
npm i -g dr-robert-li/stz-foundry
```

For the in-session commands you have two options. Either the Claude Code plugin:

```text
/plugin marketplace add dr-robert-li/stz-foundry
/plugin install stz-f
```

…or, from the single npm install above, the **unified installer** — one command
registers the `/stz-f:*` commands + agents into an agent harness at a location
you choose:

```bash
stz install                          # → Claude Code (~/.claude), the default
stz install --list                   # show every harness + its resolved target
stz install --config-dir ~/work/.claude   # any location you pick
stz install --project                # into ./.claude (this repo only)
stz install --dry-run                # print the plan, write nothing
stz uninstall                        # reverse it (from the recorded manifest)
```

Location precedence, most-specific first: `--config-dir` → `--project` →
`STZ_CONFIG_DIR` → the runtime's own env var → the registry default. Codex,
OpenCode, and Pi are detected today (`--list`); their asset adapters are on the
roadmap.

Restart the session so the `/stz-f:*` commands and subagents load. The plugin
uses the npm `stz` CLI when present; otherwise it resolves its own bundled
copy — no PATH setup needed.

## Quickstart 1 — the in-session pipeline (Claude Code)

Two commands take a project from idea to completion report:

```text
/stz-f:new                answer the questions — your done-conditions become the contract
/stz-f:pipeline --auto    drives everything else, ends with a completion report
```

`/stz-f:pipeline` (no flag) is the dashboard: it shows status and recommends
the next step, so you can also run each phase yourself:

```text
/stz-f:research       gather the facts — docs, prior art, your existing code
/stz-f:validate       ground-truth every research claim against reality
/stz-f:conventions    lock style, architecture, and naming standards
/stz-f:tests          lock the test strategy BEFORE any code is written
/stz-f:slice          break the work into small, independent slices
/stz-f:run <id>       the tournament — N rival implementations, best one wins (once per slice)
/stz-f:integration    sealed end-to-end check that the slices work together
/stz-f:summary        the completion report — what was built, how, and why
```

Good to know:

- **Dark-factory mode** — offered at the end of `/stz-f:new`: lights-out from
  research to report, no human gates. Optionally add the `/stz-f:evolve`
  meta-loop at the end (off by default). Contract and knobs:
  [`docs/development/dark-factory.md`](docs/development/dark-factory.md).

### Running commands independently

Truly standalone — no prior phases needed:

- `/stz-f:run <id>` — a one-off slice tournament with no project setup:
  `/stz-f:run payment-validator`.
- `/stz-f:explore` — deterministic bridge scan of an existing codebase; safe to
  run any time (writes no map if the repo has no source files).
- `/stz-f:pipeline` — read-only dashboard; works at any state.

Need prior state, but can be invoked directly once it exists:

- `/stz-f:research`, `/stz-f:validate`, `/stz-f:conventions`, `/stz-f:tests` —
  need a project initialized by `/stz-f:new`, and are sequential (validate
  ground-truths research output, and so on).
- `/stz-f:slice` — needs the earlier phases; slice execution stays blocked
  until slice-disaggregation completes.
- `/stz-f:integration` — needs all slices done (a composed artifact to gate).
- `/stz-f:summary` — aggregates whatever exists; makes sense only after runs.
- `/stz-f:debug <slice>` — needs a shipped winner + sealed reference to mine
  against.

Gated by config:

- `/stz-f:evolve` — refuses unless `harness.enabled:true` in the run config
  (the `Evolve` question in `/stz-f:new`, or
  `stz bridge project-harness-evolve --on`).

## Quickstart 2 — the standalone foundry runner (BYO LLM)

No Claude Code, no vendor CLI — the runner talks to any model over HTTP. With
a local model (Ollama, vLLM) it costs $0:

```bash
stz foundry init .        # scaffolds .stz/ + a config pointing at localhost:11434
```

Edit `.stz/00-intent/foundry.json` to pick providers and models:

```jsonc
{
  "providers": {
    "local": { "kind": "openai", "baseUrl": "http://localhost:11434/v1" }
    // or "anthropic": { "kind": "anthropic", "apiKeyEnv": "ANTHROPIC_API_KEY", ... }
  },
  "roles": {
    "default": { "provider": "local", "model": "granite4.1:30b" }
    // per-role overrides: testAuthor, judge, specimen, … — give the STRONGEST
    // model to testAuthor + judge; the runner warns on wasteful/risky picks.
  },
  "caps": { "maxTokens": 500000 },     // hard kill-switches (also maxUsd)
  "n": 2, "votesPerPair": 1
}
```

API keys are referenced by **env-var name** (`apiKeyEnv`), never stored — a
config that embeds a key is rejected.

Describe one slice and run the tournament:

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

The runner preflights the test-author model (fail fast if it can't author a
valid sealed suite — the binding constraint for local models), authors and
seals the held-out suite, races the specimens concurrently inside the sandbox,
judges, and writes the full audit tree plus a per-role cost report
(`.stz/90-audit/foundry-cost.md`). Exit code 2 means the run halted with no
winner.

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
