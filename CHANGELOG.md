# Changelog

All notable changes to STZ Foundry (`stz-foundry`, formerly slice-tournament-zoo)
are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project aims to follow [Semantic Versioning](https://semver.org/).

Entries at 0.9.6 and below are the upstream slice-tournament-zoo record,
preserved verbatim.

## [Unreleased]

## [1.15.0] — dark-factory loop absorbs explore/integration/debug; opt-in evolve

The autonomous loop (`/stz-f:pipeline --auto` and dark-factory mode) now owns
the three commands that previously had to be run by hand around it, and can
optionally end with the harness-evolution meta-loop.

- **`/stz-f:explore` in the loop** — before slice-disaggregation, a repo with
  no `10-research/codebase-map.json` is scanned automatically (deterministic,
  so autonomy skips no gate). The bridge now owns the greenfield/brownfield
  call: a scan that finds no source files writes NO map (the slicer keys
  brownfield mode on map existence), so a sourceless repo can never be flipped
  into anchor mode by an empty map.
- **`/stz-f:integration` in the loop** — the composition-level sealed gate runs
  after the last slice and before `/stz-f:summary`, in `--auto`, dark-factory,
  and the dashboard's recommendations alike.
- **`/stz-f:debug` in the loop (retryPolicy-bounded)** — a red integration gate
  is reduced to a concrete `fn(input) === expected` case and repaired via the
  twice-verified debug oracle. Repair cycles obey the SAME run-config
  `retryPolicy` elicited during `/stz-f:new` (up to `retries` debug → re-run →
  re-gate cycles per offending slice, default 2; `-1` unbounded under the
  token/USD caps), and the re-run tournament inside each cycle is the normal
  escalation loop honouring `replans`. Irreducible failures and spec
  disagreements always halt for a human.
- **Opt-in `/stz-f:evolve` (default OFF)** — elicitation's dark-factory AUQ now
  also offers the harness-evolution meta-loop; when enabled the pipeline runs
  it once, after the summary. New bridge command
  `stz bridge project-harness-evolve --on|--off` (`src/project.ts
  setHarnessEvolve`) flips `harness.enabled` via the same load-modify-save
  pattern as the dark-factory toggle, and `project-status` hoists it as
  `harnessEvolve`. Covered by two new tests (sibling-preservation regression +
  default-off/`--off`).
- **`--auto` ≡ dark-factory, engaged mid-run** — `/stz-f:pipeline --auto` no
  longer keeps the two human gates: it flips the dark-factory flag via the
  bridge toggle and drives the rest of the run lights-out. Configured-at-
  elicitation dark-factory and mid-run `--auto` are mirrors, differing only in
  when the human steps away. `--dark` is now an alias. The invariant gates (F2
  predicate confirmation, seal-crosscheck adjudication) hold in both.
- **`/stz-f:pipeline --from <project-doc>`** — boot the pipeline from an
  existing CLAUDE.md / AGENTS.md / PRD: the doc pre-answers elicitation, and
  the user is asked only about missing requirements, contradictions (both
  lines quoted, user picks), and unknowns. With an existing project the doc is
  diffed against `00-intent/` as an amendment source. Composes with `--auto`.
- **README quickstarts rewritten for a lay operator** — Quickstart 1 is now
  "two commands" plus a short *Good to know* list; Quickstart 2 trims the
  config walkthrough. The run-config knob detail moved to
  `docs/development/dark-factory.md`, which also documents the extended loop.

## [1.14.0] — unified user-selects installer

`npm i -g stz-foundry` is now the ONE installation interface. `stz install`
registers the `/stz-f:*` commands + agents into an agent harness, at a location
the user chooses — the gsd-core `runtime-homes` model.

- **`src/installer.ts`** — a runtime → config-home registry (Claude Code
  supported today; Codex/OpenCode/Pi detected + reported, adapters pending) with
  descriptor kinds `dot-home` (`~/.claude`) and `xdg` (`~/.config/<name>`).
  `resolveConfigDir` applies user overrides most-specific first: `--config-dir`
  → `--project` scope → `STZ_CONFIG_DIR` → the runtime's own env var → registry
  default (all tilde-expanded).
- **`stz install [--harness <name>|--all] [--config-dir <p>] [--global|
  --project] [--dry-run] [--list]`** copies the command + agent surface into the
  chosen dir (commands namespaced under `commands/stz-f/` → `/stz-f:*`), records
  a manifest, and prints the undo command. **`stz uninstall`** removes exactly
  the manifest's files and prunes the empty namespace — a sibling user command is
  never touched. `--dry-run` writes nothing; `--list` shows every runtime, its
  resolved target, and whether its config dir exists on this host.
- `package.json` `files` now ships `commands/` + `hooks/` so the global install
  carries the assets to copy.
- 356 tests (+9): unit (`expandTilde`, `defaultConfigDir` dot-home/xdg,
  `resolveConfigDir` full precedence, `detectRuntimes`, `selectRuntimes`),
  functional (`planInstall` enumerates only `.md`, namespaced; `applyInstall`
  copies + manifest; `--config-dir` target; dry-run writes nothing; `uninstall`
  removes exactly + prunes + is idempotent + leaves sibling commands intact).

## [1.13.1] — split Fable and Mythos into distinct tier families

The 1.11.0 tier ladder conflated Fable into a single `mythos` tier. Fable and
Mythos are **two distinct Mythos-class families** that share the same underlying
model (Fable is the generally-available variant with dual-use safety measures;
Mythos is the approved-org variant without them). `tierOf` now returns `fable`
for `fable`/`claude-fable-5` and `mythos` for `mythos`/`claude-mythos-5` — both
at the top rank above Opus, both premium, both priced (same cost basis). The
audit, pricing fill, and cost-report notes name both families. 347 tests (+1).

## [1.13.0] — sealed end-to-end integration/functional gate (cycle item 4)

The per-slice sealed suite is unit-level — it proves each slice meets its own
contract, never that the composed slices work together. This adds the
composition-level gate, run after slice aggregation, with the same
anti-reward-hacking discipline (authored blind, sealed by content hash,
cross-referenced). It ships **greenfield-first** and layers brownfield on top:

- **Greenfield:** the sealed integration suite is authored against the project
  INTENT (the `00-intent/` done-predicates + composed slice contracts) and run
  against the assembled entry point — it catches cross-slice integration bugs the
  unit suites structurally cannot see.
- **Brownfield:** it ADDITIONALLY checks **source preservation** — every
  `preservedExport` the item-3 slice anchors promised must still resolve on the
  assembled artifact. A change that drops a public export fails the gate even if
  its new behaviour is correct.
- **`src/integration.ts`** — `runIntegrationGate` (sealed suite passRate === 1 ∧
  no preserved export dropped) and `checkExportsPresent` (sandboxed probe).
  **`stz bridge integration-gate`** seal-verifies the held-out tree first (a
  tampered integration suite is not a gate), runs the gate, writes
  `90-audit/integration.md`, and exits 1 on failure. **`/stz-f:integration`** is
  the command (author blind → cross-reference → seal → gate).
- 346 tests (+5): unit (`checkExportsPresent`, `runIntegrationGate` across
  green/broken-composition/dropped-preserved), functional (bridge gate PASS +
  audit doc; broken composition FAIL; brownfield dropped-export FAIL).

This completes the four-item cycle (debug mode, model tiers, brownfield,
integration testing).

## [1.12.0] — brownfield codebase support (cycle item 3)

STZ was greenfield-only: specimens synthesize files from a contract, and the
slicer's DAG had no notion of code that already exists. This adds structured
exploration of an existing codebase and anchors slices to real code locations,
the prerequisite for specimens that edit rather than synthesize.

- **`src/brownfield.ts`** — `exploreCodebase` walks a repo (skipping
  `node_modules`/`.git`/`.stz`/build output) into a `CodebaseMap`: per-file
  exported symbols (JS/TS named/class/const/`export {}`/default/CommonJS; Python
  top-level `def`/`class`), existing test files, and the public surface (index
  exports). Regex + fs only — exact and replayable, no LLM.
- **Slice anchors** (`SliceAnchor`: `mode add|extend|edit`, `targetFiles`,
  `preservedExports`) tie a slice to real code. `checkAnchor` rejects a dangling
  target (a hallucinated path), a preserved export that isn't there, or an `add`
  that would overwrite an existing file — caught before any specimen runs.
- **`stz bridge explore`** writes `10-research/codebase-map.{json,md}`;
  **`stz bridge anchor-check`** validates an anchor (exit 1 on invalid).
  **`/stz-f:explore`** is the command; `/stz-f:slice` now anchors brownfield
  slices when a map is present (greenfield unchanged when it is absent).
- The anchors' `preservedExports` are the surrounding contract a brownfield
  change must not break — the input to item 4's source-preservation gate.
- 341 tests (+7): unit (export extraction, test-file detection, `exploreCodebase`
  on a fixture repo skipping `node_modules`, `checkAnchor` dangling/collide/
  preserved-export), integration + functional (bridge `explore` writes the map;
  `anchor-check` passes a real anchor and fails a dangling one; no-map error).

## [1.11.0] — model capability/cost tiers (cycle item 2)

A Fable-5-class model (the **Mythos** tier, above Opus in capability and price)
ran today, but the harness had no tier awareness and no budgeter to reserve the
premium tier for the roles that pay off. This encodes the field finding:
test-author + judge strength is the binding constraint (the sealed suite is the
selection signal), so the premium tier belongs there and is wasteful on the
high-volume specimen role.

- **`src/tiers.ts`** — `tierOf` classifies a model string into
  `fable | mythos | opus | sonnet | haiku | local | unknown` (Claude aliases + full ids,
  common OSS/local families, everything else unknown). `auditRoleTiers` returns
  advisory warnings: premium on a high-volume role (warn — wasteful) and a cheap
  test-author/judge (info — the binding constraint). Advisory only, never blocks.
- **Tier-default pricing** (`DEFAULT_TIER_PRICING` + `withTierPricing`): a
  premium hosted model the operator left unpriced is now priced at a ballpark
  tier default (override in `foundry.json`) so its spend is VISIBLE instead of a
  silent $0. Local/unknown stay $0 + reported, unchanged.
- The **foundry runner** applies tier pricing, logs tier warnings, and adds a
  `## Model tiers` section (per-role model + tier + allocation advice) to
  `90-audit/foundry-cost.md`. **`stz bridge model-tiers`** audits the in-session
  RunConfig models map (testing + judging are the high-value roles).
- 334 tests (+8): unit (classification, `isPremium`, `withTierPricing`,
  `auditRoleTiers` incl. custom role sets), integration (`bridge model-tiers`
  flags a backwards allocation), functional (the foundry cost report carries the
  tier section).

## [1.10.0] — post-aggregation debug mode (cycle item 1)

A shipped slice winner can pass its sealed suite yet be wrong on behaviour the
suite never exercised — a blind-spot defect with no post-hoc repair. This adds
the repair loop: **reproduce → mine the failing case into a SEALED regression
test → seal-amend → re-run only the affected slice + its DAG dependents.**

- **`src/debug.ts`** — the deterministic core. A reported defect is a `DebugCase`
  (`fn`, JSON args, JSON expected). `verifyDebugCase` is a twice-verified oracle:
  a case is accepted only if the current WINNER fails it (real uncaught defect)
  AND the reference PASSES it (satisfiable, correctly stated) — the same
  discipline as `inject`/`harness-mine`. Cases run through the shared execution
  sandbox; nothing model-authored runs unguarded.
- **Sealed regression cases** live at `30-tests/held-out/<slice>/debug-cases.json`,
  hashed by `SEAL.json` like the rest of the held-out suite, and are folded into
  the eval gate: `fullEval` gains `debugPassRate` and the foundry gate now
  requires `testPassRate === 1 && debugPassRate === 1 && no hacks`. A shipped
  blind-spot defect can never re-win once its case is sealed.
- **`stz bridge debug-case`** verifies + appends + seal-amends and reports the
  re-run set; **`stz bridge slice-reset --with-dependents`** resets a slice and
  everything downstream (`transitiveDependents` in `src/project.ts`) so it
  re-runs against the sharpened suite. **`/stz-f:debug`** is the command that
  orchestrates it.
- 326 tests (+10): unit (harness/oracle/validation/`transitiveDependents`),
  integration (the mined case becomes a real `fullEval` gate check that culls a
  wrong winner), functional (bridge `debug-case --apply` end to end over an
  `.stz` tree — mine, amend, reset slice + dependents; and the rejection paths).

## [1.9.1] — sandbox portability fixes (busy-host fork cap, Node <23 permission flag)

Two defects in the 1.9.0 eval sandbox, surfaced by the CI matrix (Node 20/22):

- **`prlimit --nproc` removed**: `RLIMIT_NPROC` is enforced per real-uid
  system-wide, not per sandbox, so on a busy or shared-uid host (a CI runner
  whose user already holds >64 processes) the sandboxed `node` hit the cap and
  crashed while creating a thread — a spurious eval failure that would score a
  faithful specimen 0. Fork/memory bombs are still contained by the private pid
  namespace, the 2 GiB address-space cap (a bomb OOMs in milliseconds), and the
  wall-clock timeout.
- **Node <23 permission flag**: the permission-model fallback used `--permission`,
  which only exists on Node ≥ 23; on Node 20–22 it is `--experimental-permission`
  and the wrong name is a fatal "bad option". The flag is now chosen by the
  running major version, so the fallback works across the supported matrix.
- Hostile-harness test hardened to assert the ground-truth security property
  (host filesystem untampered) directly, parsing the harness self-report
  defensively rather than from the last stderr line.

## [1.9.0] — production-readiness hardening (sandbox, fan-out caps, preflight, telemetry, ownership guard)

Five ship-blockers from the 1.8.0 field run, each researched, prototyped against
alternatives, and validated end-to-end (316 tests green, +17 new).

- **Execution sandbox (#3, the #1 ship-blocker)**: the eval seam ran
  model-generated code as plain `node` with the runner's own filesystem,
  network, and process table. New `src/sandbox.ts` routes all six spawn sites
  (`runSealed`, `checkEsmSyntax`, the two reference gates, `harnessSelfCheck`,
  and the coverage/mutation runs) through one `sandboxedNode` helper, layered
  and default-deny (the denylist-escape lesson): **Linux** bwrap
  (`--unshare-all` — no network, read-only host, tmpfs, coverage dir bound rw)
  wrapped in `prlimit` (nproc/address-space/file-size/cpu caps kill fork &
  memory bombs); **macOS** sandbox-exec (Seatbelt); **fallback** the Node
  permission model with a LOUD audit warning (it does not isolate the network).
  Level is probed once (bwrap/sandbox-exec must actually execute — nested
  namespaces downgrade cleanly, never silently) and recorded in the foundry
  cost report. `STZ_SANDBOX=bwrap|sandbox-exec|node-permission|none|auto`
  overrides. Validated: a hostile harness's network exfil, home-dir write, and
  process spawn are all neutralized while the real tournament still grades and
  measures coverage.
- **Fan-out throttle + run wall-clock cap (#4)**: `fanout` sequencing launched
  `frontier-width × N` specimens with no ceiling, and only a per-specimen
  timeout existed. New run-config `maxParallelSlices` (default 3, clamped
  [1,16]) is enforced in code — the bridge `project-status` now emits a
  throttled `dispatch` set the pipeline runs instead of the raw frontier. New
  `runWallClockMs` (0 = unbounded) is a real run-level ceiling: the foundry
  orchestrator halts a looping run at the deadline and the specimen pool skips
  work that can't finish in time.
- **Test-author preflight (#5)**: local-model runs are temperamental because
  test-author strength is the binding constraint — discovered only after
  burning a slice's escalation budget. `runFoundry` now proves the test-author
  model can author a valid sealed harness for a trivial canary BEFORE the real
  slice, failing fast with `FoundryPreflightError` ("promote a stronger model
  to the testAuthor role"). `preflight:false` skips it.
- **retryPolicy telemetry (#6)**: `retryPolicy` shipped with zero telemetry on
  whether extra rounds recover winners or burn budget. Every run now records
  `RetryTelemetry` (rounds, escalation actions, recovered-after-escalation,
  first-round vs after-round-1 token spend), surfaced in the foundry cost
  report so the defaults can be tuned on evidence.
- **Held-out ownership guard (#2)**: the orchestration half is prose, so
  "don't delete a sibling's files" was a prompt rule a model could violate (the
  reference-b deletion). New `PreToolUse` hook (`hooks/held-out-guard.mjs`)
  blocks — in code, before the tool runs — any Bash `rm`/`mv`/`find -delete`/
  truncate targeting `.stz/30-tests/held-out/`, allowing only the sanctioned
  `seal-amend`. Complements `seal-verify`'s after-the-fact drift detection with
  up-front prevention.

## [1.8.0] — configurable retry/replan policy, durable crosscheck halts, sequencing knob

Born from the first full dark-factory run (Space Invaders), where a linear
DAG + a hard-coded halt ceiling left four slices starved behind one halt.

- **`retryPolicy` (run-config)**: independent `retries` and `replans` knobs
  for the no-passers escalation FSM — `0` halts immediately, `n` bounds the
  stage, `-1` is unbounded (dangerous; only the token/USD hard caps stop it).
  Defaults: 2 retries, 1 replan. Order unchanged: retries → replans → halt.
  Honored by the bridge `escalate`, the mock orchestrator, and the standalone
  foundry runner (`FoundryConfig.retryPolicy`); resolved policy persists into
  slice state so escalation replays from state.json alone. Elicited in
  `/stz-f:new` area E with an explicit danger warning on the infinite options.
- **`slice-halt` bridge primitive**: seal-crosscheck ambiguity halts were
  prose-only — nothing persisted to state.json. Now durable
  (escalation=halted, failureReport, failed phase, failure-report.md) and
  ALWAYS human-in-the-loop: never consumed by retryPolicy, never skipped by
  dark-factory (auto-"fixing" a test-design ambiguity can bake a suite
  blind-spot into every downstream slice). Documented in README +
  docs/development/dark-factory.md.
- **`sequencing` (run-config)**: `fanout` (default) instructs the slicer to
  minimize false dependencies so independent slices run in parallel; `linear`
  chains slices one tournament at a time. Consumed by `/stz-f:slice` (DAG
  shape) and `/stz-f:pipeline` (dispatch).
- 299 tests green (11 new: FSM policy semantics incl. unbounded stages,
  normalizeRunConfig clamps, bridge slice-halt persistence, orchestrator
  retries:0 halt).

## [1.7.4] — conventions rename, stz-f alias, resolver fix, held-out ownership guards

- `/stz-f:standards` → **`/stz-f:conventions`**: the step was already single —
  one command spawning the `stz-conventions` agent — but wore two names. The
  user-visible name is now conventions everywhere (command file, pipeline
  dashboard labels, hand-offs, docs). Internal phase enum, state.json keys,
  and the `.stz/20-standards/` tier are unchanged — no migration.
- **`stz-f` shell alias**: third bin entry (`stz`, `stz-f`, `stz-foundry` all
  invoke the same CLI); identity test asserts all three.
- **Resolver fix**: every command's plugin-cache fallback still globbed the
  pre-rename `cache/*/stz/*` dir — now `cache/*/stz-f/*` (verified against
  the installed plugin), and the PATH check tries `stz-f` after `stz`.
- **Held-out ownership guards**: a live run's re-invoked test-author deleted
  `reference-b/` (the cross-family reference it is deliberately blind to)
  as a perceived stray. Root cause: both reference authors share
  `held-out/` and, unlike specimens, had no "don't touch files you didn't
  create" rule. Guards added to `stz-test-author`, `stz-cross-reference`,
  and the `/stz-f:run` orchestrator rules.
- README: doc-guide trimmed (TESTPLAN/ROADMAP/provenance ledgers removed),
  install line names all three CLI aliases.

## [1.7.3] — STZF shade-art banner

Header replaced with the STZF shade art: README embeds it as
`assets/stz-f-logo.svg` (each ░▒▓█ cell rendered as a vector rect at
matching opacity — immune to font fallback, verified rendering on GitHub),
and `stz help` prints the art verbatim (terminals render shade glyphs
natively).

## [1.7.2] — /stz-f:* command form + robust ASCII banner

- Plugin command files drop the redundant prefix (`commands/new.md`,
  `commands/run.md`, …): the plugin namespace already supplies it, so
  commands now surface as `/stz-f:new`, `/stz-f:run` instead of the doubled
  `/stz-f:stz-f-new`. All docs, hooks, agents, and source comments updated.
- STZ-F banner rebuilt in pure ASCII (README + CLI help): the Unicode
  box-drawing art rendered as misaligned hollow boxes under some browser
  font fallbacks; plain ASCII is robust everywhere.

## [1.7.1] — STZ-F banner alignment

Fixed-width letter columns in the STZ-F ASCII banner (README + CLI help);
the hyphen and F no longer wobble against the Z's diagonal. First release
cut end-to-end by the tag-and-release pipeline (gate → lockstep bump → tag →
Trusted Publishing → GitHub release).

## [1.7.0] — /stz-f-* command prefix, operator README, tag-and-release pipeline

- **Command prefix**: every in-session command moves from `/stz-*` to
  `/stz-f-*` (`/stz-f-new`, `/stz-f-run`, `/stz-f-pipeline`, …); the plugin is
  now installed as `stz-f`. Cross-references in commands, hooks, source
  comments, and `stz update` remediation output moved with it. Subagent names
  (`stz-judge`, `stz-researcher`, …) are unchanged.
- **README rebuilt for operators**: STZ Foundry header (STZ-F ASCII banner),
  two quickstarts (in-session pipeline; standalone BYO-LLM foundry runner with
  a worked foundry.json + slice manifest), the audit-trail reading guide, a
  documentation map surfacing the earn ledgers (foundry-progression,
  0.9.6-progression), contributing, and license. The CLI banner and help now
  read STZ-F / STZ Foundry.
- **New CI/CD pipeline** `.github/workflows/tag-and-release.yml`
  (workflow_dispatch): gate (typecheck + suite) → optional lockstep version
  bump (package.json + both plugin manifests, drift-guard re-run) → tag
  creation + push → npm publish (Trusted Publishing OIDC + provenance) →
  GitHub release with CHANGELOG notes. Publishing is inline because
  GITHUB_TOKEN tag pushes deliberately do not trigger release.yml; release.yml
  still covers hand-pushed tags.

## [1.6.0] — Docs staleness sweep (Foundry stage 6)

Every LIVE doc (README, CONTRIBUTING, src/README, docs/CLAUDE.md,
docs/development/local-and-testing.md) is grep-clean of the upstream
`slice-tournament-zoo` identity — repo URLs, npm install paths, plugin
marketplace slugs, and titles now name `stz-foundry`. Historical records
(CHANGELOG ≤0.9.6 entries, docs/PAPER.md, experiments/) keep the upstream
name as provenance, deliberately. The stage-0 identity guard grew a live-docs
sweep test so a stale ref can never return unnoticed.

## [1.5.0] — Standalone foundry runner CLI (Foundry stage 5)

`src/foundry/runner.ts` + `stz foundry <init|run>`: the CLI-ownable
spawn-and-collect loop. A secret-free `foundry.json` (providers by wire shape,
API keys by env-var name only, per-role model overrides, pricing, caps,
tournament knobs) drives the full adversarial tournament through the provider
seam — no agent host, no vendor CLI, local-first. Real-usage cost report
written to `.stz/90-audit/foundry-cost.md`.

Live-earn hardening from the local Ollama run: `provider.ts` speaks
`node:http/https` (undici's 300s headers timeout killed slow non-streaming
local generations); `referenceExportCheck` re-asks a reference that hides the
contract's named exports (it was framing the harness at the smoke gate);
`harnessSelfCheck` names a parsed-but-mistyped `passRate`; sealed-harness and
reference prompts pin the dynamic-import first line, raw JSON numbers, and
no-TS-annotations with literal examples.

Earned deterministically (`test/foundry-runner.test.ts`, config validation +
scripted e2e) **and live**: qwen3.6 test author + ornith:9b specimens, winner
26/26 in round 2, loser culled at 0.19, $0. 287 tests green. Ledger:
`experiments/foundry-progression/stage-5.md`.

## [1.4.0] — Per-provider cost/budget tracking (Foundry stage 4)

`src/foundry/cost.ts`: real provider usage priced per model (input / output /
cache-read at distinct rates; local models $0 by omission; unknown hosted
models **reported** in `unpricedModels`, never guessed), aggregated per role,
and hard-capped — `maxTokens` (N5) and `maxUsd` (R3) — at the single seam
every foundry LLM call passes through (`FoundryModelLayer.ask`). The crossing
call throws `CostCapExceededError` with the spend kept on record; a breach
inside a specimen is contained by the stage-3 spawn layer (specimens are
expendable, frozen roles halt the run).

Earned deterministically (`test/foundry-cost.test.ts`): pricing math,
aggregation, both caps, unpriced-model reporting, and cap→spawn-containment
composition. 272 tests green. Ledger: `experiments/foundry-progression/stage-4.md`.

## [1.3.0] — Spawn/concurrency + stuck-kill (Foundry stage 3)

`src/foundry/spawn.ts`: specimens now genuinely run in parallel (F6) under a
bounded pool, each with an optional wall-clock stuck-kill (R10 — the roadmap
gap). Killed/crashed specimens are contained (journaled `specimen-killed`
events, replayable N1), output order is scheduling-independent (N6), and an
all-killed round collapses into the existing no-passers escalation FSM.
`runSlice` gains `specimenConcurrency` / `specimenTimeoutMs`.

Earned deterministically with measured wall-clock concurrency (parallel <
250ms where sequential is 400ms), pool-bound, stuck-kill, crash-containment,
ordering, and pipeline-composition tests (`test/foundry-spawn.test.ts`).
264 tests green. Ledger: `experiments/foundry-progression/stage-3.md`.

## [1.2.0] — FoundryModelLayer (Foundry stage 2)

The real `ModelLayer` over the provider seam: every tournament role
(test-author, strategist, specimen, judge, documenter, planner) is a
`{provider, model}` pair; the elicitor stays deterministic (done-predicates are
human-supplied, never model-invented — F2 preserved standalone); the **real
eval runner** does all gating (executed LLM-authored sealed harness, V8
coverage, mutation survival, hack-pattern detection — no model self-reports).
Cache-stable prompt split (static role instructions in `system`, volatile
content in the user turn); per-role usage accumulation for stage-4 pricing.

Earned twice (`experiments/foundry-progression/stage-2.md`):
deterministic scripted-provider e2e through the real `runSlice` with a
planted-broken specimen culled by the executed suite; and a **live local-model
tournament** — granite4.1:30b on Ollama, 7 calls, 453s, $0 API — where the
model authored a real executable sealed harness, both specimens passed the
executed gate, and the judge + GRPO advantage picked the winner. 258 tests
green.

## [1.1.0] — Provider abstraction (Foundry stage 1)

The BYO-LLM seam: `src/foundry/provider.ts`, a zero-dependency `Provider`
interface with two wire adapters — **anthropic** (Messages API, with top-level
`cache_control: {type:"ephemeral"}` prompt caching mandatory on every call and
`cache_read_input_tokens` surfaced for verification) and **openai**
(OpenAI-compatible `/chat/completions`, which also reaches LiteLLM and local
Ollama/vLLM endpoints, keyless operation supported). Bounded retries
(429/5xx/network with injectable backoff; 4xx never retries), `ProviderError`
with status/snippet/attempts.

Earned deterministically against real in-process `node:http` servers
(`test/foundry-provider.test.ts`): request shapes, mandatory caching directive,
usage mapping, retry/no-retry/exhaustion. 255 tests green.
Ledger: `experiments/foundry-progression/stage-1.md`.

## [1.0.0] — STZ Foundry: identity + new-npm-package CI/CD (Foundry stage 0)

The project becomes **STZ Foundry** (`stz-foundry`) — the evolution of
slice-tournament-zoo into a standalone BYO-LLM foundry. 1.x is built stage by
stage under the earned-capability discipline; the ledger lives in
`experiments/foundry-progression/`.

### Changed
- **Package identity**: npm name `stz-foundry` (a NEW package — the upstream
  `slice-tournament-zoo` npm release is never overwritten), version 1.0.0,
  repository/homepage/bugs → `dr-robert-li/stz-foundry`. Second bin alias
  `stz-foundry` alongside `stz`.
- **`src/version.ts`**: `PACKAGE_NAME` re-pinned to `stz-foundry`, so
  `stz update`/`registryLatestUrl()` and every printed remediation command
  target the new package.
- **Release workflow redone**: a fail-closed name guard refuses to publish
  anything but `stz-foundry`; release notes/links point at the new package;
  Trusted-Publishing one-time setup for the new name documented in-line.
- Plugin manifests (`.claude-plugin/`) at 1.0.0 with Foundry descriptions.

### Added
- `test/foundry-identity.test.ts` — the stage-0 earn instrument (identity pin,
  bin duality, workflow name-guard presence, no stale identity literals in the
  update path). 249 tests green.
- `experiments/foundry-progression/` — the Foundry rebuild progression ledger
  (stage-0 record: build, eval design, results, honesty caveats).

## [0.9.6] — Contract Plane (bounded project-local RSI, earned-capability)

Adds a **Contract Plane**: a typed, human-gated correctness object the arena
competes against, wired into live selection **behind a default-off flag**
(`RunConfig.contract.enabled`). Flag off ⇒ the tournament is byte-identical to
0.9.5 (zero regression, proven by an integration test). Every capability was
**earned** on a substrate before wiring — see `experiments/0.9.6-progression/`.

### Added
- **Contract kernel** (`src/contract/`): typed `requirement`/`predicate`/
  `contract_delta` with a state machine (`draft→proposed→accepted→…`), a pure
  vacuity-safe predicate evaluator, traceability, and the **human 7th gate**
  (`humanAccept` rejects agent-role approvers — the α>0 exogenous signal).
- **Separation gate** (`src/contract/separation-gate.ts`): the Phase-1 go/no-go —
  a naive impl must pass the sealed suite yet fail ≥1 predicate, else the contract
  adds no signal and the line stops (guards against re-deriving STZ's earned null).
- **Contract verifier + contract-aware selection** (`src/verifiers/`): a specimen
  that hard-fails a high-severity predicate is eliminated at the gate — the
  contract as *definition of winner*, not a post-hoc oracle. Wired into
  `select()`/`evalGate` via an optional `ContractGate` (absent ⇒ 0.9.5).
- **Promotion ledger** (`src/ledger/`): append-only JSONL + a 7-gate decision
  engine (the six existing gates + `humanAccepted`) preserving the halt-on-tie
  guard and quarantining test-only "wins" (the proven test-sharpening negative).
- **Selective retrieval** (`src/knowledge/retrieval.ts`): deterministic, capped,
  explained; `repo_note` disabled by default (CTIM-Rover). No FAISS.
- **Phase-0 measurement** (`src/eval/`): chronological (never-shuffled) splits,
  reviewer-outcome capture, per-repo baseline `RepoMetrics`.
- **G7 gene**: `HarnessGenome.crystallizationHeuristicId?` — the edge→predicate
  crystallizer; a harness-altitude axis not derived from the sealed suite.
- New bridge subcommands `separation-gate`, `contract-accept`, `eval-baseline`;
  agents `stz-contract-architect`/`clarifier`/`contract-verifier`; commands
  `/stz:contract`, `/stz:eval`; `contractSliceId` on the slice manifest.

### Notes
- **Earned mechanisms, honest scope.** Phases 0/1/3/5/6 earned; 2/4/7
  mechanism-earned; 8 deferred by design. Live earns (rubric, retrieval) ran on
  the **subscription** path (in-session Agent subagents), $0 marginal API. What is
  NOT yet shown: field-scale outcomes on a real held-out issue stream. All earns
  span two hand-picked toy axes (dependency, file-scope) — not a distribution.
- 245 tests; flag-off preserves 0.9.5 exactly.

## [0.9.5]

Calibrated-verifier gating + a Well-Architected authoring gene — both **earned**
from `experiments/META-RSI-SURVEY.md` (the post-Opus-4.8 RSI survey), and a
pre-registered post-merge-grounding experiment that is **designed, not shipped**.
The survey's verdict held: there is no validated *continuous*-competency win, so
this release ships the two things that *are* earned (a degradation-safety gate and
one-time authoring) and gates the speculative third behind a probe.

### Added

- **`judge-calibration` bridge command + persisted `60-harness/judge-reliability.json`.**
  The judge's **target-task accuracy** is measured on a blind, pre-registered
  ground-truth battery (`--verdicts` vs `--labels`) and persisted as a per-slice-type
  `blindAccuracyBucket`. `judge-stress` now persists `consistency` into the same
  profile; the two **merge** (neither clobbers the other), so the promotion gate
  finally has a complete machine-readable profile to read. Motivated by
  [arXiv:2606.14629](https://arxiv.org/abs/2606.14629) (*When Good Verifiers Go
  Bad*): an exogenous verifier is necessary but **not sufficient** — above-threshold
  on one slice-type can be sub-threshold on another, and a confident-but-wrong
  verifier silently regresses the result. Calibrate **before** it steers.
- **Sixth promotion gate `rubricCalibrated` (fail-closed).** `promotionGate` now
  refuses a variant whose selection judge is not target-task calibrated
  (failure string `judge-rubric-not-calibrated`). Deliberately stricter than the
  runtime `trustGate`, which default-*trusts* a missing profile so the live
  pipeline is never blocked: `calibrationGate` default-*distrusts* (a missing
  `--slice-type` or an un-run battery reads as uncalibrated). This buys
  **bounded-safe** improvement — it stops the loop going *negative*; it does **not**
  promise continuity (above-threshold still hits diminishing returns).
- **WAF authoring heuristic `waf-playbook-autogen-v0` (gene G1).** A `heuristicId`
  branch in `agents/stz-test-author.md`: the test author may consult the AWS
  Well-Architected Agentic AI Lens playbooks to sharpen negative/edge cases for
  reliability/observability/guardrail behaviour **the contract already specifies** —
  one-time amortized authoring. **Goodhart guard (load-bearing):** WAF practices
  never add a requirement the contract is silent on, and **no LLM-judged
  WAF-conformance score is ever a fitness/reward signal** (the `weights` tuple is
  untouched; promotion stays on held-out functional fitness only). WAF adherence is
  an *authoring* gain, never a loop.

### Experiments

- **`experiments/postmerge-grounding/PREREG.md`** — pre-registered, **not shipped**.
  Tests door A (delayed post-merge reality as the only true exogenous α>0 signal) on
  **real SWE repos** via the existing swebench adapter, contamination-controlled by
  blind per-instance sealed suites, **gated through** the new calibration gate.
  Symmetric-error null; a null/plateau stops the line. A live prod-telemetry plane
  is a **v2 item gated on this probe** returning a non-null, non-degrading result.

## [0.9.0]

(Recorded retroactively — the manifest version had advanced to 0.9.0 without a
matching CHANGELOG section; reconciled here.) Bounded **harness-level recursive
self-improvement** meta-loop (opt-in, default-off): a DGM-style content-addressed
archive of harness variants (`.stz/60-harness/`, parent-sampling P ∝
fitness/(1+children)) selected by GRPO group-relative advantage on held-out,
recall-free pilot fitness, guarded by a variance-collapse floor (`src/diversity.ts`)
and a **five-gate** promotion check (beats-incumbent · hack-clean-on-own-outputs ·
seal-integrity · interface-parity `src/harness-hash.ts` · diverse-generation). Flagship
gene: automated suite-sharpening (`harness-mine` twice-verifies a blind-spot bug
class, `harness-promote-mutator` bakes it into the battery). Judge-reliability layer
(`src/judge-reliability.ts`, consistency + per-slice-type trust gating, no naive
ensembles). The competency claim was tested and is an **earned negative**
(`docs/PAPER.md`): the mechanism works; a broad continuous-competency lift does not
follow. Every kill-switch halts and surfaces.

## [0.7.3]

Release automation. First release published through CI with **provenance** (the
0.7.2 release was hand-published; this is the live test of the tag-driven
pipeline). No harness change.

### CI

- **`.github/workflows/release.yml`** — push a `v*` tag and CI gates (typecheck +
  tests), publishes to npm with **`--provenance`** (a Sigstore attestation linking
  the npm version back to the exact GitHub commit + workflow run), then opens the
  GitHub release from the matching `CHANGELOG` section. Auth is npm **Trusted
  Publishing** (OIDC) — the package is set to *require 2FA and disallow tokens*, so
  there is no stored credential to leak, expire, or revoke. Ends the manual-OTP
  publish path for future releases.

## [0.7.2]

Harness-quality fix to the test-author **guide**, plus a distribution fix. Hardens
the sealed-suite authoring against the *permissive-suite* class — a suite that does
not fail correct code but does not catch incorrect code either, so a spec-violating
specimen ties a correct one. Surfaced by dogfood: a sealed `nextRun` (cron) suite
scored an implementation that silently accepts malformed input at a full 1.000.

### Changed

- **`stz-test-author` guide hardened (the symmetric guide).** The agent prompt now
  requires, alongside the existing invariant rules:
  - **contract-mandated rejection cases** — every "throw/reject on X" clause gets a
    negative assertion; the author's reference must satisfy them too;
  - **discriminating** inputs (a case a degenerate impl also passes proves nothing);
  - a **property-based generator over the negative space** (mutate valid inputs into
    invalid ones and assert each throws), because hand-picked negatives cover only
    the obvious malformed forms an implementation already rejects;
  - **stay within the contract** — do not test behaviour the contract is silent on,
    which would fail a correct implementation of a defensible alternate reading.
- **`docs/development/sealed-suite.md`** documents the permissive-suite class as a
  third guide-class (alongside fragile-invariant and superseded-invariant), with the
  matching error-handling split and an audited `seal-amend` remedy.

### Distribution

- **npm package now ships `agents/` and `docs/development/`** (was `src` + `bin`
  only), so the agent fix and its guide-class contract reach `npm` consumers, not
  only the Claude Code plugin/marketplace channel. Plugin + npm versions bumped
  together (0.7.2).

### Validation (honest scope)

- Validated on two pilots under `experiments/` (cron, IPv4): the hardened guidance is
  **followed reliably** (every blind author added rejection + negative-space-generator
  coverage), is **non-regressive** (still catches lenient specimens), and **prevents
  over-strict false-fails** — NEW suites stay neutral on spec-silent inputs and pass
  both strict and lenient correct references, where the old guidance committed to one
  reading and failed a correct lenient reference (0.915–0.950).
- **Not claimed:** that the permissive-suite gap is empirically *closed*. It is
  addressed by construction; a fresh-task demonstration that the negative-space
  generator catches a *subtle* parser soft spot the old guide missed is future work
  (cron's soft spot was too subtle for hand-picked negatives and its specimens are now
  contaminated; IPv4's negatives were too obvious to differentiate the two arms).

## [0.7.1]

Docs-only. Reframes the as-built note as a **living roadmap** and records the
near-term direction. No harness change.

### Changed

- **`docs/AS-BUILT.md` → `docs/ROADMAP.md`.** Same built/deferred record, now a
  continuously-updated document: shipped features move from *Planned* into *What
  was built* each cycle. README, `src/README`, `TESTPLAN`, and the mock
  orchestrator comment point at the new path; the README "Documentation" entry is
  relabelled "Roadmap — what is built, deferred, and planned next".

### Docs

- **Roadmap direction added.** Additional agentic-coding **runtimes** (OpenAI
  Codex CLI — also closing the cross-family specimen/judge gap — plus Pi and
  OpenCode), and a **distinct STZ-native harness** that runs the tournament on
  **BYO LLM**: a generic OpenAI/Anthropic-compatible API, LiteLLM routing, and
  local servers (vLLM, Ollama) for no-egress runs.
- **`docs/JOURNAL.md` brought current** (0.3.1 → 0.7.1) in the author's
  working-log voice (humanizer pass, no em dashes).
- **Staleness sweep.** `TESTPLAN.md` test count corrected (131 → 163) with rows
  added for the F19 update pathway and the F14 command-driven escalation; lingering
  `AS-BUILT` path references updated across README, `src/README`, and `TESTPLAN`.

## [0.7.0]

Resolves the AS-BUILT gap: **cross-round escalation is now driven by the real
`/stz:run` command**, not just the mock orchestrator. On a gate that produces no
passers, the command consulted nothing and halted — the bounded retry→replan→halt
loop (F14) lived only in the mock. This wires the existing escalation FSM into the
deterministic bridge and the command markdown, so a real in-session run retries
and replans within the hard ceiling before halting. Minor: new bridge subcommand
+ command-loop behaviour.

### Added

- **`stz bridge escalate --root . --slice <id>`** — the deterministic owner of
  bounded cross-round failure handling. Call once after a no-passers gate: it
  advances the retry→replan→halt FSM over `state.json` (ceiling ≤1 retry, ≤1
  replan), persists the counts, and on retry/replan writes the PDR
  `50-pressure/<slice>/refinement.md` (GRPO advantages over the eval rewards, the
  same computation the mock uses) that the next round's specimens consume. On
  halt it writes `failure-report.md` and sets `judgment: failed`. `gate` stays a
  pure read and never advances escalation, so the two can't double-advance; the
  FSM ceiling makes even a stray double-call fail-safe (halts early, never loops).

### Changed

- **`/stz:run` command** — adds step 6b: on zero passers it calls `escalate` and
  follows the returned `action` — `retry` re-enters specimen spawning with the
  refinement context, `replan` rewrites the intent first, `halt` stops with the
  failure report. The sealed suite stays **frozen** across all rounds (never
  re-authored/re-sealed; `seal-verify` still gates each round).

### Docs

- AS-BUILT: the cross-round-escalation gap bullet moves into the built section.
  bridge-cli gains the `escalate` contract.

## [0.6.0]

A sustainable **update/upgrade pathway** (F19). STZ ships through two channels
that drift independently — the npm CLI and the Claude Code plugin — and a
scaffolded project's `.stz/` tree never moved when the engine did. This release
gives operators a way to see staleness, detect channel drift, and migrate an old
project tree safely. Minor (not patch): `stz update`/`stz migrate` are new
surface, and the `.stz/` tree now carries a versioned manifest.

> The 0.5.6→0.5.7 split had already left `package.json` and the plugin manifests
> on different versions — the exact drift this release makes detectable. All three
> version sources (`package.json`, `.claude-plugin/plugin.json`,
> `.claude-plugin/marketplace.json`) are unified at 0.6.0 and guarded by a test.

### Added

- **`stz --version`** — prints the installed version (sourced from
  `package.json`, never a hardcoded literal).
- **`stz update [--check]`** — checks the npm registry for a newer release,
  compares against the installed version, and prints the exact remediation
  commands. Does not self-install. When a plugin manifest is reachable
  (`CLAUDE_PLUGIN_ROOT` set, as in a Claude Code session, or run from a repo
  checkout) it also reports **drift** between the CLI and the plugin's bundled
  engine. `--check` emits JSON and exits non-zero when action is needed. The
  registry fetch is injectable, so the verdict logic is unit-tested offline.
- **`stz migrate [dir] [--no-backup]`** — brings an existing `.stz/` tree up to
  the current taxonomy schema. Additive only (creates missing tiers, never
  deletes/renames) and backs the prior tree up to `.stz.bak-schema<N>/` first.
  Idempotent: a no-op when already current.
- **`stz bridge version`** — reports `{version, schemaVersion, packageName}` as
  JSON so the plugin / a SessionStart hook can detect drift deterministically.
- **`.stz/manifest.json`** — every scaffold is now stamped with the STZ version
  and schema version. A new `src/version.ts` is the single version-identity seam
  (package name as a code constant; version read from `package.json`).

### Changed

- Unified all three version sources to 0.6.0; a `version.test.ts` drift guard
  fails CI if they diverge again.

### Docs

- README gains an **Updating** section and a **token-cost** note recommending
  token-efficiency companion plugins (Caveman, RTK, Headroom, CodeSight) for the
  inherently token-intensive tournament/GRPO runs.

## [0.5.7]

Fix npm README rendering. Relative links (`./docs/...`, `../docs/...`, `./LICENSE`)
resolve against the npmjs.com package page, not the repo, so every doc/source link
in `README.md` and `src/README.md` was broken on npm. Rewrote them to absolute
`github.com/.../blob/main/...` URLs (anchor links left intact). Added `repository`,
`homepage`, and `bugs` to `package.json` so the npm page links back to GitHub. No
harness behaviour change.

### Fixed

- **npm doc links** — relative markdown links in `README.md` and `src/README.md`
  now point at absolute GitHub URLs; they were dead on the npm registry page.

### Changed

- **`package.json`** — added `repository`, `homepage`, `bugs` metadata.

## [0.5.6]

Documentation staleness sweep + the **first npm publish** (`npx stz init`, the F17
distribution path). No harness behaviour change.

### Changed
- **Docs brought current with the 0.4–0.5 feature set.** `AS-BUILT.md` had drifted
  to ~0.3.0: corrected the subagent count (ten → eleven, adding `stz-cross-reference`),
  the command surface (added `/stz:merge`), the bridge subcommand list (added the
  seal-integrity set, `project-dark-factory`, and the merge-integrity set), the
  test count (93 → 131), and added the four shipped features it was missing
  (dark-factory, cross-family reference, cross-slice merge integrity, the tabulated
  dashboard) plus the npm CLI; clarified that the cross-family *reference* is built
  while cross-family *specimens/judge* remain deferred. `README.md` command and
  subagent lists gained `/stz:merge` and `stz-cross-reference`. `TESTPLAN.md`
  test count corrected (66 → 131) with rows added for the run-config/dark-factory,
  sealed-suite, cross-family, merge-integrity, and dashboard suites.

## [0.5.5]

npm packaging readiness (rolled into the 0.5.6 publish). No harness behaviour
change.

### Changed
- Dropped a stale `template` entry from `files` (no such dir, unused by the CLI)
  and added a `prepublishOnly: typecheck && test` guard so a broken build cannot
  be published. Verified the packed tarball installs clean and `stz init` /
  `stz bridge` run end to end from the installed bin.

## [0.5.4]

A tabulated `/stz:pipeline` dashboard — at-a-glance progress instead of ad-hoc,
run-to-run-varying prose.

### Added
- **`project-status` now emits a computed `progress` rollup and dashboard-ready
  `slices` rows.** `progress` is `{phases:{done,total}, slices:{total,done,
  running,halted,pending}}` — totals computed by the bridge, not eyeballed by the
  orchestrator. Each `slices` row carries `{id, dependsOn, status, winner,
  faithful}`, with winner/faithful pulled the same way `summary` does so the
  dashboard and the completion report never disagree. The legacy `sliceStatus`
  map is unchanged (back-compat).

### Changed
- **`/stz:pipeline` renders a fixed layout every tick:** a progress line
  (`phases 6/6 · slices 1/3 done · 1 running · …`), a **phases table**, a
  **slices table** with pinned columns (`slice · deps · status · winner ·
  faithful`), a frontier line, and a one-line run-config — plus a worked example
  of the exact rendered output, so every run looks the same and is consumable at a
  glance. Status glyphs standardized: `✓ done · ▶ running/next · ○ pending ·
  ✗ halted`.

### Fixed
- **`merge-validate` no longer reports a never-run replacement suite as "did not
  pass".** When a matched compat entry's replacement invariant was simply absent
  from the reported results (the operator forgot to run/report it), the verdict
  classified it as `invalid` with reason "replacement invariant … did not pass" —
  telling the operator the superseding behaviour was broken when in truth it was
  never measured. It still blocked (fails closed), but a misleading verdict is the
  exact sin this feature exists to replace. The reason now distinguishes "ran and
  failed" from "was not in the reported results — run and report it". Docs-only
  behaviour otherwise unchanged.

## [0.5.2]

Cross-slice merge integrity — a deterministic, audited rule for the one place
merging legitimately fails an earlier slice's sealed suite: when a later slice
**supersedes** an invariant that was correct in isolation. The canonical case
from the dogfood run is slice-03's "aliens never respawn" against slice-05's
wave-clear. Previously the orchestrator hand-waved that distinction ("looks like
the expected interaction, moving on") — exactly the unaudited, gameable judgment
STZ exists to eliminate. Now the bridge adjudicates it.

### Added
- **`src/merge.ts` + `stz bridge merge-validate`** — adjudicates *reported*
  sealed-suite results (`{slice, passed, failure}`) against an audited compat
  manifest. A failing suite is sanctioned only when (1) a **signature-pinned**
  entry matches the exact panic substring (never the test name alone), (2) the
  **superseding invariant also passes** on the assembled crate, and (3) the entry
  is **approved**. The verdict has four buckets — `sanctioned`, `pendingApproval`,
  `invalid` (replacement unproven — blocks even if approved), `unsanctioned`
  (no match — suspect a real defect) — and exits non-zero unless every failure is
  sanctioned. It does NOT run the suites (the assembled crate may be Rust); the
  deterministic part is the rule application, the same trust split as `eval` vs
  `record-eval`.
- **`merge-compat-propose` / `-approve` / `-retire` / `-list`** — the lifecycle.
  The merge agent may *propose* (entries always land unapproved — it cannot
  self-approve); an approver *blesses* with a recorded who/why (a self-approval is
  then an auditable anomaly, not a silent one); entries are *retired* once the
  superseded suite is `seal-amend`ed wave-aware. An empty `panicSubstring` (would
  match everything) and a missing `pendingAmendment` (compat entries are
  transitional debt) are rejected at propose time. Manifest + append-only history
  live at `90-audit/merge-compat.json` (+ `.md` mirror).
- **`/stz:merge` command** — assemble winners into `_assembled/`, run each
  contributing slice's sealed suite **in an ephemeral scratch copy** (never the
  canonical crate), feed the reported results to `merge-validate`, and handle each
  verdict bucket. Documented in `docs/development/sealed-suite.md` (the cross-slice
  section) and `bridge-cli.md`.

### Changed
- `docs/development/dark-factory.md` extends the deferral policy to a blocked
  `merge-validate`: in dark-factory mode an `unsanctioned`/`invalid`/`pendingApproval`
  merge failure halts the slice (never auto-approved), the DAG continues, and it
  surfaces in `/stz:summary` — identical to the `seal-crosscheck` divergence seam.

## [0.5.1]

### Fixed
- **Resolved the dark-factory × cross-family seam.** A `seal-crosscheck`
  divergence (0.5.0) is a blocking, human-adjudication gate, while dark-factory
  mode (0.4.0) promises an unattended run — so the autonomous path could reach a
  divergence with no documented, non-contradictory exit. Defined the policy in
  one place, matching the existing "a halted slice does not stall the factory"
  rule: in dark-factory mode a divergent cross-check is recorded, the slice is
  **halted** (never sealed/judged on an unresolved blind-spot signal, and never
  auto-rewritten), the DAG continues, and the divergence surfaces in the final
  `/stz:summary` for after-the-fact review. Documented in `/stz:run` step 2,
  `/stz:pipeline`'s dark-factory loop, and `docs/development/dark-factory.md`.
  Docs-only; no code change.

## [0.5.0]

Cross-family reference — a second, independently-authored reference run against
the sealed suite to catch blind spots the single test-author reference shares
with the suite. The smoke gate's reference is written by the same agent as the
suite, so a wrong assumption baked into both (a fragile invariant, a boundary
off-by-one) goes green anyway. An independent reference, from a different family
or a human, makes that divergence observable. This is the R2 "cross-family
quorum" idea applied to the reference rather than the judge.

### Added
- **`crossReference()` in the eval runner** — runs the sealed suite against two
  references and reports `both-pass` / `divergent` / `both-fail`. It only reports;
  it deliberately does not verdict, because a B-fails/A-passes split is ambiguous
  (suite over-fits A, or B is wrong) and aggregate pass counts can't tell them
  apart.
- **`stz bridge seal-crosscheck --sealed --reference-a --reference-b`** — gates
  the seal like `seal-verify` gates the tournament: exits non-zero on anything but
  both-pass so the pipeline pauses for human adjudication, and writes a durable
  audit doc at `30-tests/cross-reference.md` (outside `held-out/`, so it is not
  sealed).
- **`stz-cross-reference` agent** — independently authors the second reference
  into `.stz/30-tests/held-out/reference-b/`, seeing only the contract +
  done-predicates (never the suite or the primary reference), and deliberately
  reaching for a different implementation strategy/model. Sealed with the suite,
  never specimen-visible.

### Changed
- `/stz:run` step 2 now spawns `stz-cross-reference` and runs `seal-crosscheck`
  after the smoke gate and before sealing; a divergence is classified as a
  GUIDE-class signal for adjudication (strengthen author guidance + `seal-amend`,
  or discard a buggy cross reference), never an automatic rewrite. `seal` now
  freezes both references.
- `docs/development/sealed-suite.md` gains the cross-family reference section (the
  one control class a single author + smoke gate cannot cover); `bridge-cli.md`
  documents `seal-crosscheck`.

## [0.4.0]

Dark-factory mode — an optional, fully autonomous end-to-end run. With it
engaged, elicitation hands off and the orchestrator drives every phase →
per-slice tournament → summary with no human in the loop, surfacing only the
final completion report. This is the "software engineering dark factory" from the
project's executive summary, made a real flag.

### Added
- **`darkFactory` on the run config.** Off by default (human-in-the-loop). When
  on, the pipeline skips every *downstream* human gate it can legitimately skip —
  the `/stz:slice` "Approve as-is" gate and the `/stz:run` winner-approval gate —
  and runs autonomously to a `/stz:summary` completion report. The full ranking,
  GRPO advantages, and any disqualified specimens still land in the audit tree;
  nothing is hidden, only un-prompted.
- **`stz bridge project-dark-factory --root . --on|--off`** — the invoke-anytime
  toggle. It is a deliberate **load-modify-save** on the persisted config: it
  flips only `darkFactory` and is NOT routed through `project-set-config`, whose
  normalize-over-defaults merge would silently reset fan-out/models/strictness
  mid-run. `project-status` hoists the resolved value to a top-level `darkFactory`
  field so each command reads it once per phase; engaging it between phases takes
  effect immediately.
- **End-of-elicitation prompt.** `/stz:new` offers dark-factory once — and only
  *after* the F2 done-predicate gate, the one human checkpoint that can never be
  skipped. Acceptance criteria are never auto-invented; the predicates are the
  contract the autonomous run executes against.
- `docs/development/dark-factory.md` — the autonomous-run contract: the one gate
  that never closes, which gates are skipped, why the toggle is a dedicated
  load-modify-save command, and what is (plumbing) and isn't (the agent loop)
  unit-tested. Linked from the bridge-CLI doc.

### Changed
- `/stz:pipeline`, `/stz:run`, and `/stz:slice` now read the hoisted `darkFactory`
  flag and skip their respective human gates when it is on; `/stz:pipeline`
  documents the autonomous loop (auto-approve DAG, auto-accept winners, continue
  past halted slices, end on the summary). `run-config.md` and `project-status`
  surface the dark-factory state.

## [0.3.4]

### Changed
- **Made the sealed-suite contract explicit (guides vs sensors), not just
  implicit in the code.** The harness now states plainly, in the command, the
  agent, and a dedicated doc, that responsibilities are bifurcated:
  - **Prompt hardening is the GUIDE** that owns semantic robustness (the
    fragile-invariant class) — and it is the *only* control for it, because the
    smoke gate's reference is authored by the same agent and shares its blind
    spot.
  - **The smoke gate is a SENSOR** that owns mechanical validity only. A green
    gate means exactly "compiles and is satisfiable against the sealed
    reference" — explicitly **not** "semantically robust". `/stz:run` now names
    the compile-only primitive (`cargo test --no-run`, `tsc --noEmit`) and runs
    the reference strictly in a throwaway scratch dir, never a specimen-visible
    path.
- **Error handling now classifies failures by which control should have caught
  them.** A compile/unsatisfiable failure is a *gate (sensor) failure* → loop the
  exact stderr back to `stz-test-author`. A fragile invariant found later (the
  sealed suite failing identically across all correct specimens at eval) is an
  *authoring (guide) failure, not a gate miss* → fix via an audited `seal-amend`
  and strengthen the author guidance, rather than treating it as a gate bug.

### Added
- `docs/development/sealed-suite.md` — the integrity contract: the guide/sensor
  split, the four phases (author → gate → seal → amend), where the full-solution
  reference lives, and the failure-classification rules. Linked from the README
  and the bridge-CLI doc.

## [0.3.3]

Hardening of sealed-suite creation (L1/F10), prompted by a run where the
test-author emitted a held-out suite that did not compile and encoded a
fragile invariant (alien identity keyed on mutable `(row,col)`, which broke
under legitimate formation movement) — and the only recovery was editing the
*frozen* suite mid-tournament, undermining the anti-hacking seal. Note: this
adds a three-command bridge surface, so it is more than a pure bugfix.

### Added
- **Immutable sealed manifest + audited amend flow** (`src/seal.ts`, three new
  bridge commands). `seal` sha256-hashes every held-out file (suite + reference)
  into a byte-stable, timestamp-free `30-tests/held-out/SEAL.json` (the file
  excludes itself). `seal-verify` re-hashes and exits non-zero on any drift —
  `/stz:run` runs it immediately before the eval/gate, so a frozen-suite edit
  can't slip in mid-tournament. `seal-amend --reason` is the only sanctioned way
  to change a sealed file: it records per-file from→to hashes + the reason into
  the manifest's amendment log and re-freezes; a silent edit then fails verify.
- **Pre-freeze smoke gate.** `stz-test-author` now also writes a minimal correct
  **reference implementation** (sealed, never specimen-visible — it is a full
  solution). `/stz:run` compiles the suite and runs it against the reference in a
  scratch dir; it must be green before `seal`. Catches non-compiling and
  unsatisfiable suites before specimens run. (It does not catch a fragile
  invariant the reference shares — that is the prompt hardening's job.)

### Changed
- **`stz-test-author` prompt hardened** with anti-fragile-test rules: the suite
  must compile; never key entity identity on mutable state (position/index of a
  thing that moves); assert movement-invariant aggregates (counts, totals) over
  per-element position snapshots.

## [0.3.2]

### Fixed
- **Completed slices now read `done`, so the pipeline advances and resumes
  correctly.** Two bugs left a finished slice stuck as `running` forever, which
  made `/stz:pipeline` never move past it — and re-derive it as unfinished (and
  re-run the tournament) after any session restart:
  - `begin` called `freshState`, **clobbering** the four early phases that
    `project-seed-slices` had marked done at the project level — so a pipeline
    slice could never become `isComplete`. `begin` now loads and preserves an
    existing per-slice state, only seeding fresh for a standalone `/stz:run`.
  - `finalize` marked only `judgment` done, leaving `test-authoring` and
    `tournament` pending. It now marks the whole tournament half done
    (idempotent, with journaled `phase-done` events), so the slice is complete.
  Together these remove the per-slice manual `state.json` reconciliation the
  orchestrator had to do every slice. (Note: a *session restart* — the "Welcome
  back" banner from context exhaustion or a crash — is a Claude Code behaviour
  STZ cannot prevent; this fix makes such a restart resume cleanly instead of
  redoing finished work.)

## [0.3.1]

### Fixed
- **Spec-diff faithfulness was meaningless on real runs.** The intent-vs-as-built
  diff (F13) matched claims by exact normalized string, but the planner and the
  documenter are different agents that word the same behaviour differently — so
  every real run reported `kept=0, missing=all, faithful=false`. Claims now carry
  a stable `id`: the planner emits `{id, text}`, and the documenter **adjudicates
  each intent claim by id** (`{id, satisfied, evidence}`, plus `x*` extras for
  behaviour beyond the plan). `diffSpecs` matches on id (falling back to
  normalized text for legacy/bare-string claims, so old artifacts and the mock
  still work). `faithful` now reflects real coverage, not wording.
- **Mis-keyed verdicts no longer miscount silently.** A documenter that fumbles
  an id would turn a constant failure into an intermittent one (a false `missing`
  plus a false `added`). `finalize` now validates the verdicts and surfaces
  `unmatchedIntentIds` / `mismatchedAsBuiltIds` (plus a stderr warning); `/stz:run`
  re-spawns the documenter with the exact id list rather than trusting the diff.
  Malformed claim objects are parsed defensively and cannot crash `finalize`.

### Added
- Documentation reorganized for operators: `docs/development/` (local-and-testing,
  bridge-cli), `src/README.md` (module map), and a `CONTRIBUTING.md`. The README
  keeps a slim Documentation pointer section.

## [0.3.0]

### Added
- **Batched elicitation.** `/stz:new` now asks grouped questions per area
  (multi-question AskUserQuestion calls, up to 4 per call) instead of one at a
  time, cutting round-trips. Area D (done-conditions) stays sequential — the
  predicate kind, then the exact expression — because that drill-down depends on
  the previous answer.
- **Run-configuration choices during elicitation.** A new area E in `/stz:new`
  captures, up front:
  - **Slicing granularity** (`coarse` / `balanced` / `fine`) — how finely
    `/stz:slice` breaks the work into slices.
  - **Specimen fan-out** (N, clamped to 2–16, the published RTV+PDR cloud
    optimum) — the number of specimens each slice's tournament runs.
  - **Model combination per role** — planning, research, execution, testing,
    validation, judging. Offered as suggested combos (Balanced / Thrifty / Max
    quality) each with a one-line rationale, plus free-form "Other" — any spawn
    alias (`opus`/`sonnet`/`haiku`/`fable`) or model id, the get-shit-done
    pattern. Model values are never validated, so a custom id always passes.
  - **Strictness** (`relaxed` / `standard` / `strict`) — the bar for conventions
    and testing, expanded to a coverage target, mutation policy, and convention
    strictness.
- **Persisted run config, consumed downstream.** The choices are stored as
  `.stz/00-intent/run-config.json` (plus a readable `run-config.md`) via the new
  `stz bridge project-set-config` command, validated and clamped by
  `normalizeRunConfig`. `project-status` now carries the resolved `runConfig`
  (defaults when unset) so every downstream command reads it in one call:
  granularity → `/stz:slice`, fan-out → `/stz:run`'s N, the model map → each
  per-role subagent's `model` override, and strictness → `/stz:standards` and
  `/stz:tests`. A read-only `stz bridge project-config` is also exposed.

### Changed
- Moved `JOURNAL.md` to `docs/JOURNAL.md` and ran a light humanizing pass over it.
- `package.json`, plugin, and marketplace versions are at 0.3.0 (the bump opened
  this cycle; plugin/marketplace manifests are unchanged — no new commands were
  registered).

## [0.2.2]

### Added
- ASCII-art logo in the README header, the `stz` CLI banner (`stz help` / no-arg),
  and the SessionStart hook.
- npm install path: `npm i -g slice-tournament-zoo` (or
  `npm i -g dr-robert-li/slice-tournament-zoo` straight from GitHub), mirroring
  the get-shit-done install UX. `tsx` moved to runtime dependencies so the global
  CLI works offline after install.
- README documentation guide (install, use, uninstall, examples); `LICENSE`
  (Apache-2.0); this `CHANGELOG.md`; and a `docs/` folder (`AS-BUILT.md`,
  `TESTPLAN.md`, design pattern kept locally as `docs/CLAUDE.md`).

### Changed
- Production-ready layout: isolated the no-network mock demo into `src/mock/`
  (the orchestrator, the model-layer seam, and the deterministic mock), with its
  own README; removed `src/llm/`. The production spine (`bridge.ts`, `project.ts`,
  commands, agents) does not depend on it. Trimmed the README's mock sections to
  a pointer and split the module map into production spine versus mock harness.
- `docs/AS-BUILT.md` rewritten as a self-contained note (original intent, what
  was built, resultant features, gaps, and the intent-vs-as-built diff); dropped
  references to the design doc and its requirement codes.
- README: corrected the `--auto` semantics. `/stz:run --auto` is single-slice and
  skips only that slice's winner-approval pause; it does not cascade.
  `/stz:pipeline --auto` walks the DAG in dependency order and runs every slice
  through to the summary.
- `package.json`, plugin, and marketplace versions bumped to 0.2.2.

## [0.2.1]

### Fixed
- Plugin install failed with `agents: Invalid input`. The manifest declared
  `commands`, `agents`, and `hooks` as path strings; Claude Code auto-discovers
  `commands/`, `agents/`, and `hooks/hooks.json` and rejects those string
  fields. Removed them and corrected the `homepage` URL.
- Commands assumed a global `stz` on `PATH`, which a plugin install never
  creates (it is not an npm install, ignores `package.json` `bin`, and adds no
  symlink). Each command now resolves the bundled bridge first via a linked
  `stz`, then `${CLAUDE_PLUGIN_ROOT}/bin/stz.mjs`, then a plugin-cache glob, and
  calls it through `$STZ`. `npm link` is now optional, for manual CLI use only.

### Changed
- Moved `AS-BUILT.md` and `TESTPLAN.md` under `docs/`; README links updated.
- README: corrected the pipeline description to the real two-level flow
  (project-level phases once, then the per-slice tournament half). Removed the
  contradictory "per slice re-elicits/researches" diagram and the superseded
  manual multi-slice `/stz:run` workflow; refreshed the subagent list, audit-tree
  tier table, and module map.

## [0.2.0]

The full interactive multi-phase pipeline (a get-shit-done-style UX) feeding the
existing per-slice tournament.

### Added
- **Project-level driver** (`src/project.ts`): a project manifest + state, a
  DAG of slices with topological ordering, per-slice status derived from each
  slice's own `state.json` (no drift), and the next-runnable computation.
- **Bridge subcommands** (`stz bridge`): `project-init`, `project-phase`,
  `project-write-intent`, `project-record-area`, `slice-add`,
  `project-seed-slices`, `project-status`, `summary`.
- **Eight commands**: `/stz:new` (interactive elicitation), `/stz:research`,
  `/stz:validate` (standalone ground-truth validation), `/stz:standards`,
  `/stz:tests`, `/stz:slice` (collaborative DAG co-design), `/stz:summary`, and
  the `/stz:pipeline` dashboard. Each accepts `--auto` for chaining.
- **Six subagents**: `stz-researcher`, `stz-validator`, `stz-conventions`,
  `stz-test-planner`, `stz-slicer`, `stz-summarizer` (H2 completion markers).
- The project-tier to per-slice handoff: `project-seed-slices` writes each slice
  manifest and seeds its `state.json` with the four early phases already done.
- A worked live run of the front phases in `examples/full-pipeline/`.

### Changed
- Plugin and marketplace bumped to `0.2.0`.

## [0.1.0]

The slice-00 kernel plus the in-session Claude Code harness.

### Added
- **Deterministic spine** (fully tested): the `.stz/` markdown taxonomy with
  frontmatter progressive disclosure; `state.json` checkpoint and crash
  recovery; GRPO group-relative advantage; two-stage eval-gate plus pairwise
  win-count selection; the layered hack-pattern detector; the bounded
  escalation FSM (1 retry then 1 replan then halt); the complexity-to-budget
  allocator with an enforced token cap; the cost and call ledger; the pressure
  log with PDR top-K refinement; the intent vs as-built spec-diff; and the
  orchestrator that sequences all eight phases.
- **In-session harness**: the `stz bridge` deterministic CLI
  (begin, eval, gate, record-votes, select, finalize); the `/stz:run` command;
  the frozen subagent definitions (specimen, judge, test-author, documenter)
  with inoculation framing; parallel specimen fan-out via the Agent tool.
- **Real eval runner**: executed sealed test pass rate, V8 coverage, and
  source-mutation survival, with no test-library dependency.
- **Packaging and activation**: the Claude Code plugin manifest, the
  marketplace entry, and a SessionStart hook.
- **CLI**: `stz init`, `stz run` (mock pipeline), and `stz bridge`.
- A worked example of a real tournament in `examples/clamp-tournament/`.

### Fixed
- GRPO advantage now spans the whole specimen group, including gate-eliminated
  specimens, so losers' diffs can be weighted.
- The per-slice token cap is enforced at the metering point, not only tracked.
- Mutation testing strips comments before mutating, so a mutator can no longer
  produce a behaviour-identical survivor and report a false zero-kill rate.
- The eval runner resolves implementation paths to absolute, removing the
  relative-path import failure seen in the first live run.
