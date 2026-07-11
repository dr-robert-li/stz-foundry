# STZ Roadmap

A living record of what STZ set out to be, what is **built today**, what is **not
yet built**, and where the project is **going next**. It is updated every release
cycle: shipped features move from *Planned* into *What was built*, and new
direction lands in *Planned*. (This document was formerly `AS-BUILT.md`; it now
carries the forward roadmap as well as the as-built record.)

## Original intent

An agentic-coding harness that takes a request from elicitation through
implementation by running competing agents and keeping an auditable trail.

- Break a project into contract-bounded vertical slices that compose through a
  dependency DAG.
- Implement each slice adversarially: N independent "specimen" agents solve the
  same contract in parallel.
- Pick survivors by a two-stage selection: an eval-gate against a frozen, sealed
  test suite the implementers never see, then a pairwise LLM judge.
- Resist reward hacking in layers: a frozen test author, a sealed held-out
  suite, a trace-based hack-pattern detector, and inoculation prompting.
- Settle intent, research, conventions, and test strategy once per project,
  before any code is written.
- Leave a markdown audit trail a human can replay after the fact.
- Run inside Claude Code, spawning the agents as in-session subagents.

## What was built

**Deterministic spine (TypeScript, fully tested).** The exact, replayable core
that every decision flows through:

- the `.stz/` markdown taxonomy with YAML frontmatter and summary-field
  progressive disclosure;
- per-slice `state.json` checkpoint and crash recovery;
- GRPO group-relative advantage, computed over the whole specimen group;
- two-stage selection (eval-gate elimination, then pairwise win-count ranking);
- the hack-pattern detector (test-skip, assertion mutation, network-bypass,
  fixture-keyed branching, hardcoded sentinels) with remediation strings;
- the bounded escalation state machine (one retry, then one replan, then halt);
- the complexity-to-budget allocator with an enforced per-slice token cap;
- the cost and call ledger;
- the pressure log with PDR top-K refinement;
- the structural intent-vs-as-built spec-diff;
- a real eval runner: executed test pass rate, V8 coverage, and source-mutation
  survival, with no test-library dependency.

**In-session harness.** STZ runs inside a Claude Code session. The orchestrator
is the command-driven agent; the `stz bridge` CLI owns every deterministic
decision (JSON in, JSON out, over the `.stz/` tree). On top of the spine:

- the project DAG driver (`src/project.ts`): manifest, project state,
  topological ordering, and per-slice status derived from each slice's own state;
- the bridge subcommands for a single slice (begin, eval, gate, record-votes,
  select, finalize), the sealed-suite integrity set (seal, seal-verify,
  seal-crosscheck, seal-amend), the cross-slice merge integrity set
  (merge-validate, merge-compat-propose/approve/retire/list), and the project
  (project-init, project-phase, project-write-intent, project-record-area,
  project-set-config, project-dark-factory, project-config, slice-add,
  project-seed-slices, project-status, summary);
- the full command surface: `/stz-f:new`, `/stz-f:research`, `/stz-f:validate`,
  `/stz-f:standards`, `/stz-f:tests`, `/stz-f:slice`, `/stz-f:merge`, `/stz-f:summary`,
  `/stz-f:pipeline`, and `/stz-f:run`;
- eleven subagents: the per-slice specimen, judge, test-author,
  cross-reference, documenter and the project-level researcher, validator,
  conventions, test-planner, slicer, summarizer;
- packaging as a Claude Code plugin with a SessionStart hook, and an npm CLI
  (`npx stz init` / `stz bridge …`).

**Mock testing harness (`src/mock/`).** A self-contained, no-network demo that
drives the whole pipeline against a deterministic fake model. It is a testing
aid, not the production path, and the production spine does not depend on it.

**Quality gates.** 316 deterministic tests plus a typecheck, run in CI on Node 20
and 22 (with bubblewrap installed so the eval sandbox's real isolation path is
exercised), and a `prepublishOnly` (typecheck + test) guard before any npm publish.

## Resultant features

- **Cheaters lose even when they pass.** The sealed suite plus the hack-detector
  disqualify a specimen that games the grader. Demonstrated live: a
  network-bypass specimen passed all 304 sealed checks for a `clamp` slice and
  was still culled at the gate before any judge saw it
  (`examples/clamp-tournament/`).
- **The sealed suite catches incorrect code, not just gamed code (0.7.2).** The
  `stz-test-author` guide now owns the *permissive-suite* class — a suite that
  passes a spec-violating specimen because it only checks valid inputs — by
  mandating contract-driven rejection cases, discriminating inputs, a
  property-based generator over the negative space, and a "stay within the
  contract" guard so it does not fail a correct implementation of a spec-silent
  reading. Validated non-regressive + over-strictness-avoiding on two dogfood
  pilots (`experiments/`); full guide-class write-up in
  `docs/development/sealed-suite.md`.
- **Meaningful selection signal.** With real coverage and mutation feeding the
  reward, GRPO advantage is non-flat: the winner is both judge-preferred and
  highest-advantage on the same run.
- **No runaway loops.** The escalation ceiling (retry, replan, halt) is proven to
  hold; the per-slice token cap throws rather than overspending. The same FSM now
  drives the real command path: `/stz-f:run` calls `stz bridge escalate` on a
  no-passers gate, which advances the retry→replan→halt state over `state.json`
  and writes the PDR refinement the next round consumes — the loop is no longer
  mock-only.
- **A replayable audit trail.** Every run materializes intent, research,
  conventions, test strategy, per-slice tournaments, pressure logs, spec-diffs,
  and a completion summary under `.stz/`, reconstructible from the tree plus
  state.
- **A full interactive pipeline.** A get-shit-done-style command-per-phase flow
  with elicitation Q&A, approval gates, a DAG co-design step, a dashboard, and
  `--auto` chaining. The front phases were run live end to end for a `slugify`
  project (`examples/full-pipeline/`).
- **A run config set once and obeyed everywhere (0.3.0).** `/stz-f:new` batches its
  questions per area and captures slicing granularity, specimen fan-out N (2–16),
  a per-role model map (planning/research/execution/testing/validation/judging,
  with suggested combos plus free-form "Other"), and a strictness bar
  (coverage/mutation/conventions). It persists as `00-intent/run-config.json` via
  `stz bridge project-set-config` (validated, clamped, defaults for anything
  unset) and rides on every `project-status` read, so the slicer, `/stz-f:run`'s N,
  each subagent's `model`, and `/stz-f:standards` + `/stz-f:tests` all consume it.
- **Dark-factory mode (0.4.0).** An opt-in fully autonomous run: once the F2
  predicate gate is satisfied, the orchestrator drives every phase → per-slice
  tournament → summary with no human in the loop, skipping the downstream approval
  gates. A dedicated `project-dark-factory` toggle (load-modify-save, never resets
  the rest of the config) flips it at any point; `project-status` hoists the flag.
- **Cross-family reference (0.5.0).** A second, independently-authored reference
  (different family/model) is run against the same sealed suite before sealing, to
  catch blind spots the single test-author reference shares with the suite.
  `seal-crosscheck` reports both-pass / divergent / both-fail and blocks on
  anything but both-pass; divergence is a guide-class signal for human
  adjudication, never an auto-rewrite.
- **Cross-slice merge integrity (0.5.2).** When slice winners are assembled, an
  earlier slice's sealed suite can legitimately fail because a later slice
  supersedes one of its invariants. `merge-validate` adjudicates *reported* suite
  results against an audited, signature-pinned compat manifest (propose ≠ approve;
  transitional debt retired by a `seal-amend`) instead of the orchestrator
  hand-waving the distinction.
- **Tabulated pipeline dashboard (0.5.4).** `project-status` emits a computed
  `progress` rollup and dashboard-ready slice rows (winner/faithful), so
  `/stz-f:pipeline` renders the same fixed phases/slices tables every tick rather
  than ad-hoc prose.
- **Installs as a plugin, and ships on npm.** The commands resolve the bundled
  bridge with no PATH setup; the CLI is also published to npm (`npx stz init`).
- **Update pathway (0.6.0 / F19).** `stz --version`, `stz update [--check]` (npm
  staleness; prints commands, never self-installs; also reports CLI-vs-plugin
  drift when a plugin manifest is reachable via `CLAUDE_PLUGIN_ROOT` or a repo
  checkout), `stz migrate` (additive, backed-up `.stz/` schema upgrade), and `stz
  bridge version`. Every `.stz/` tree carries a versioned `manifest.json`; a
  single `src/version.ts` seam sources the version from `package.json` and a test
  guards against the three version manifests drifting apart.
- **Real escalation path wired (0.7.0).** `stz bridge escalate` is the
  deterministic owner of bounded cross-round failure handling. `/stz-f:run` calls it
  on a no-passers gate; it advances the retry→replan→halt FSM over `state.json`,
  writes the PDR refinement the next round consumes, and on halt writes
  `failure-report.md`. The escalation loop now lives in the real command path, not
  only the mock.

## Not yet built (current gaps)

> Refreshed 2026-07 against the shipped code. Several items previously listed
> here are now built by the **1.8.0 Foundry rebuild** (standalone BYO-LLM runner
> + provider seam) and the **1.9.x hardening** (execution sandbox, run-level
> caps) — see the dated ✅ BUILT sections at the end of this file. What remains:

- **Cross-family *specimens and judge* in the IN-SESSION path.** The standalone
  **foundry runner** *does* run heterogeneous families today: `foundry.json`
  assigns each role (test-author, specimen, judge, …) its own `{provider, model}`
  over the `anthropic`/`openai`-compatible provider seam (`src/foundry/provider.ts`),
  so a local Ollama specimen vs a hosted judge falls out of config. The remaining
  gap is the **Claude Code in-session** tournament, which still spawns only
  Claude Code subagents (one family). (The cross-family *reference* for the sealed
  suite has been built since 0.5.0.)
- **Python eval drivers** (Hypothesis, mutmut, Stryker) are not used. Coverage and
  mutation are executed in JavaScript via V8 and source mutators.
- **Per-specimen git worktrees and observability stacks** are **not built**
  (answers a common question). The 1.8.0 foundry added a real bounded-concurrency
  spawn pool with per-specimen wall-clock kill (`src/foundry/spawn.ts`) and
  per-specimen private temp-dir execution under the sandbox, but specimens still
  materialize into distinct `prototypes/specimen-X/` directories rather than git
  worktrees, and no per-specimen Prometheus/OTel stack is spun up. Worktrees
  matter once slices *edit* an existing repo (see the brownfield item below);
  today's foundry specimens synthesize files from a contract, so directory
  isolation is the honest minimum.
- **Cross-slice RAG / embeddings** are **not built** — no vector store ships with
  the harness and no semantic lookup runs across the markdown tree. (The spec-diff's
  old literal over-flagging is fixed: claims carry stable ids and the documenter
  adjudicates each intent claim by id, so reworded as-built claims match without
  embeddings. Fully semantic, id-free cross-slice recall would still need them.)
- **OS-level sealing** is **partially built.** The held-out suite is now sealed by
  a deterministic content hash (`src/seal.ts`: `SEAL.json` + `seal-verify` drift
  gate + audited `seal-amend`), and a **PreToolUse ownership-guard hook**
  (`hooks/held-out-guard.mjs`, 1.9.x) blocks destructive shell ops on the sealed
  tree in code. What is still not applied: git read-only attributes + a pre-commit
  hook enforcing it at the VCS layer.
- **The bundled bridge runs the TypeScript CLI through `tsx`**, fetched by `npx`
  on first use, so a fresh environment needs Node 20+ and network for that first
  call. Shipping a prebuilt `dist/` to drop the runtime `tsx` dependency is a
  hardening follow-up.

## Intent vs as-built (the diff)

- **Delivered as intended:** the deterministic spine, the in-session adversarial
  tournament, the full project pipeline with sealed tests and layered
  anti-reward-hacking, the replayable audit trail, and an installable plugin.
- **Deferred and documented (not missing by accident):** cross-family specimens
  and judge *in the in-session path* (the standalone foundry runner already does
  heterogeneous families), Python eval libraries, git worktrees and per-specimen
  observability, cross-slice RAG, VCS-layer OS sealing, and the `dist/` build.
- **Built beyond the original plan:** the `stz bridge` JSON contract, a
  dependency-free real eval runner (V8 coverage plus source mutation), the
  two-level project DAG driver, the persisted run config (granularity, fan-out,
  per-role model map, strictness) consumed across the pipeline, dark-factory mode
  (autonomous end-to-end), the cross-family reference + `seal-crosscheck` against
  the sealed suite, cross-slice merge integrity (`merge-validate` + the audited
  supersession-compat manifest), the tabulated pipeline dashboard, the
  deterministic mock harness, the two worked example runs, the CI pipeline, the
  npm CLI distribution, the sustainable update/migrate pathway (`stz update`,
  `stz migrate`, versioned `.stz/manifest.json`), real escalation wired into
  the command path (`stz bridge escalate`), the **1.8.0 standalone BYO-LLM
  Foundry** (provider seam over Anthropic/OpenAI-compatible/Ollama/vLLM,
  bounded-concurrency specimen pool, per-model cost governance with hard caps),
  and the **1.9.x production-readiness hardening** (a layered execution sandbox
  for model-generated code, a fan-out throttle + run-level wall-clock cap, a
  test-author preflight, retryPolicy telemetry, and the held-out ownership guard).

## Planned (roadmap)

Direction for upcoming cycles. These are intent, not yet built; each moves into
*What was built* when it ships. Ordered roughly by dependency, not date.

### Post-merge exogenous grounding (door A) — pre-registered, gated on the 0.9.5 calibration gate

The survey's one open door is an exogenous correctness signal (α>0) fed each round; the only
genuinely exogenous SDLC signal is **delayed post-merge reality** (PR-acceptance + downstream
regression across later commits) — not CI/hidden-test pass, which is the sealed suite (door B).
`experiments/postmerge-grounding/PREREG.md` pre-registers the test on **real SWE repos** via the
existing swebench adapter, contamination-controlled by **blind per-instance sealed suites**, and
**gated through** the 0.9.5 `calibrationGate` (the post-merge signal is just another verifier and
must pass calibration before it may steer). Symmetric-error null; continuity over merge cycles is
the real test (plateau/decline is a valid, reportable result). **Scope:** a live
prod/canary/incident **telemetry plane is a v2 item, gated on this probe** returning a non-null,
non-degrading result — real-repo git history substitutes for it here; a null stops the line (no
plane is built). It would breach N9 (single-repo, local) and is not built in v1.

### Additional agentic-coding runtimes

Today STZ drives its specimens/judge/test-author as **Claude Code** in-session
subagents. The model seam already accepts any subagent, so the work is adapter +
command wiring per host, not a redesign. Targets:

- **OpenAI Codex CLI** — the prior-art harness STZ borrows from (AGENTS.md table
  of contents, per-worktree observability). Run specimens/judges as Codex agents;
  enables genuine **cross-family** tournaments and a cross-family quorum judge
  (closes the "cross-family specimens and judge" gap above).
- **Pi** — drive the pipeline from Pi as an alternate host.
- **OpenCode** — run STZ under the OpenCode agent runtime.

Each runtime needs: a bridge resolver entry (like the existing
`CLAUDE_PLUGIN_ROOT` fallback), a host-native way to spawn N parallel specimens
and collect pointers, and the per-role model map honored against that host's
model catalog. The deterministic bridge is unchanged — it is host-agnostic by
construction. Registering each of these into its host is the job of the
**unified installer** (see *Planned — next cycle §7*): `stz install --harness
<codex|opencode|pi>` bootstraps STZ inside that runtime from the same npm global
that provides the CLI, so a new harness is a new adapter + an installer case, not
a separate distribution channel.

> Note (2026-07): genuine **cross-family tournaments already run today** via the
> 1.8.0 standalone foundry runner (per-role `{provider, model}` over the HTTP
> provider seam). This section is now specifically about riding *inside* other
> agent **CLIs** (Codex/Pi/OpenCode) as an alternative to the foundry's own loop.

### A distinct STZ-native harness (BYO LLM) — ✅ BUILT (1.8.0)

**Shipped as the Foundry rebuild.** STZ now runs as its **own standalone
harness** — a runner that owns the spawn-and-collect loop and talks to models
directly over HTTP, not bound to any vendor CLI. Delivered:

- **A generic API provider** — any OpenAI-/Anthropic-compatible HTTP endpoint,
  model + base-URL + key-by-env supplied in `foundry.json` (`src/foundry/provider.ts`,
  `src/foundry/runner.ts`; keys are env-var names only, never stored).
- **Local inference servers** — **vLLM** and **Ollama** for fully local,
  no-egress runs (field-validated on Ollama; matches N5/sustainability).
- A real **bounded-concurrency spawn pool** with per-specimen wall-clock kill
  (`src/foundry/spawn.ts`) and per-provider **cost governance** with hard
  token/USD caps aggregated by role (`src/foundry/cost.ts`).
- **Heterogeneous specimens** by config (one local model vs one hosted), the
  economical configuration the field run surfaced: a strong test-author role,
  small models elsewhere.

Still open here: **LiteLLM** as a 100+-model routing layer is not wired (the two
native provider kinds cover the field cases); the spawn pool uses directory
isolation, not git worktrees + per-specimen observability (see below).

### Supporting hardening (partially shipped)

- ✅ **Execution sandbox** for model-generated code (1.9.0, `src/sandbox.ts`):
  bwrap / sandbox-exec / Node-permission-model, default-deny, resource caps.
- ✅ **Run-level cost/latency caps** (1.9.0): `maxParallelSlices` fan-out throttle
  + `runWallClockMs` run-level wall-clock ceiling.
- ✅ **Code-level held-out sealing** (`SEAL.json` + `seal-verify` + the 1.9.x
  PreToolUse ownership-guard hook).
- ⬜ Still gaps: per-specimen **git worktrees + ephemeral observability**, a
  prebuilt **`dist/`** to drop runtime `tsx`, **VCS-layer** OS sealing (git
  attributes + pre-commit), Python eval drivers, and cross-slice RAG/embeddings.

### Multi-round convergence: iterative selection-pressure → design-feedback loop (0.8.0) — ⛔ SHELVED, SUPERSEDED BY 0.9.0

> **STATUS (0.9.0): SHELVED — empirically ruled out, energy relocated to the harness altitude.**
> The per-slice convergence loop below was tested against its own pre-registered
> decision table on the recall-free synthetic substrate, budget-matched, twice:
> - **Sealed-steered arm** (`experiments/swebench-pilot/PILOT-RESULTS-BLIND.md`):
>   `iterate ≈ best-of-N` at matched budget — a loop that stops at "sealed = 1.0"
>   cannot cross a gradient the suite cannot see.
> - **Judge-beyond-suite arm** (`PILOT-RESULTS-JUDGE.md`): signal-matched,
>   `judge+iterate == hardened-suite+best-of-N` at the same truth ceiling; the
>   gradient the judge crosses (the `5abc` `parseInt` silent-truncation trap) is
>   **suite-expressible**, so a hardened suite + best-of-N reaches it at ~0
>   marginal cost while the loop paid ~74k judge tokens/round.
>
> **Verdict:** the lever is **selection-signal quality + suite sharpening**, NOT
> per-slice iteration. 0.8.0 is not built as specced. Its design ideas are
> **relocated** to the **0.9.0 harness-level RSI meta-loop** (next section), where
> the 2024–2026 literature (Darwin Gödel Machine, HarnessX, SIA) actually shows
> gains: `rewardDelta`/`convergenceRate` → variant-fitness deltas; `diversityFloor`
> → the variance-collapse guard (`src/diversity.ts`); `interfaceHash` → the
> harness-contract parity (`src/harness-hash.ts`); `RoundSnapshot` → `ArchiveEntry`;
> the ICRL pressure log → the cross-variant mining log. The prose below is kept as
> the design record of WHY the per-slice form was shelved.

#### Background and framing

STZ's existing tournament is a single-round adversarial selection: N specimens
are generated independently from the contract, scored, and the winner is
promoted. This is structurally equivalent to **best-of-N sampling** — a
well-understood strategy whose ceiling is bounded by the strategy space
accessible in a single generation pass.

The planned 0.8.0 architecture introduces a **multi-round convergence loop**:
after each round's winner is selected, a natural-language *pressure log*
summarising why losers failed is injected into the next round's generation
context. New specimens are generated independently (preserving diversity), but
informed by the accumulated strategic failure analysis of all prior rounds. The
loop runs until a convergence criterion is met or `maxRounds` is exhausted.

This is the **in-context analogue of GRPO** applied to software engineering:

| GRPO (training) | STZ 0.8.0 (SDLC) |
|---|---|
| Group of completions sampled from policy π | Round of N specimens generated from contract |
| Reward signal per completion | Sealed suite score per specimen |
| Group-relative advantage A_i = (r_i − μ) / σ | Specimen score minus round mean (already in `grpo.ts`) |
| Policy update via gradient step | Context update via pressure log (natural-language policy steering) |
| KL penalty to prevent policy collapse | Interface-hash constraint + independent specimen seeding |
| Convergence = policy stabilises | Convergence = inter-round reward delta < threshold for K rounds |

The critical distinction from training: the "policy update" is a readable
markdown pressure log in `.stz/50-pressure/`, not an opaque weight change. Every
"update" is auditable by a human engineer. The in-context policy shift persists
for the lifetime of the project (each project is an independent optimisation
trajectory) but does not generalise across projects — which is correct, since
each project has its own contract, invariants, and strategic context.

This also resolves a structural identity question: STZ is not purely
**spec-driven** (the sealed suite is a selection mechanism, not a specification
language) nor purely **test-driven** (implementations are not revising against
public test failures). The multi-round loop makes it more precise: **iterative
adversarial tournament with strategic memory**, an instance of **in-context
reinforcement learning (ICRL)** applied to code generation with a deterministic
reward function.

#### Architecture

**The loop:**

```
ROUND 0
  Generate N specimens (from contract only, independent seeds)
  Eval-gate → disqualify hackers and gate-failures
  GRPO group-relative advantage over survivors
  Pairwise judge → winner₀ selected
  Pressure log for round 0 written (strategic failure analysis, not raw test output)
  interfaceHash pinned to winner₀'s exported interface

ROUND R (R = 1..maxRounds-1)
  Generate N specimens (from contract + all prior pressure logs + winner_{R-1})
    — specimens may diverge from or improve on the prior winner; they are not revising it
  Eval-gate → disqualify
  GRPO advantage computed; convergenceRate checked against prior round
  If convergenceRate < convergenceThreshold for plateauRounds consecutive rounds → CONVERGED, halt
  Pairwise judge → winner_R candidate
  interfaceHash verified: if mismatch → winner_R disqualified, contract drift escalated to /stz-f:slice
  assembled-crate merge-validate: if fails → round rejected, merge defect surfaced
  If both pass: winner_R promoted, RoundSnapshot appended to state.json, proceed to R+1

FINAL
  winner_{last} is the slice winner
  Held-out adversarial suite fired once (never used mid-loop as convergence criterion)
```

**Key invariants:**
- The pressure log encodes *strategic failure analysis* (why an approach failed,
  what failure modes it hit), never raw test output. Raw test output is
  information the specimens are not permitted to see (sealed-suite integrity).
- Round-0 locks the interface boundary (`interfaceHash`). Subsequent rounds may
  only improve the implementation, never change exported types, function
  signatures, or observable side effects that downstream slices depend on.
- A winner whose reward regresses vs. the prior round is never promoted. In
  training, loss can temporarily spike and recover; in discrete selection there
  is no gradient descent to recover — so regression is a hard block.
- Multi-round convergence on slices with downstream dependents in the DAG
  requires assembled-crate `merge-validate` after each promotion (not just
  in-slice sealed-suite pass). This is not optional: a round winner that improves
  in isolation but breaks a downstream slice's invariants must be rejected.
- `maxRounds = 1` (default) reproduces existing single-round behaviour exactly.
  The feature is fully backward-compatible.

#### Merge logic for multi-round loops

The existing `merge.ts` `validateMerge` handles *cross-slice supersession*:
when slice-B's winner legitimately breaks slice-A's sealed suite because the
invariants evolved. This is unchanged.

Multi-round convergence introduces a second, distinct merge problem: each round's
winner replaces the prior round's winner for the *same slice*. The round-R winner
may be superior in isolation but:

1. Break downstream slices co-designed with the round-0 winner's interface
2. Reintroduce bugs the prior winner happened to avoid
3. Drift from the contract in ways the sealed suite does not catch

The resolution is a three-condition promotion gate enforced by the new
`round-promote` bridge command:

1. **Interface hash parity** — `interfaceHash` in `state.json` must match the
   candidate winner's exported interface. A mismatch means the round exposed a
   contract ambiguity; escalate to `/stz-f:slice` for re-planning, do not promote.
2. **Assembled-crate `merge-validate` pass** — run the full cross-slice merge
   validation (existing `merge.ts` logic) against the assembled crate with the
   candidate winner substituted for the prior round winner. Any unsanctioned
   failures block promotion.
3. **No reward regression** — candidate `topReward` must be ≥ prior round
   `topReward`. Regression is a hard block; the prior winner is retained.

Only if all three pass is the round winner promoted and a `RoundSnapshot`
appended to `state.json`.

The interface hash acts as the mechanical KL constraint: the "policy" (in-context
GRPO loop) is free to improve implementation strategy but cannot collapse the
interface boundary — analogous to GRPO's KL penalty preventing policy collapse
onto reward-maximising but degenerate outputs.

#### Convergence signal: the operator-visible loss curve

Without a visible convergence signal, `maxRounds` is a blind hard stop rather
than a tuning knob. The planned convergence metrics are derived from existing
`grpo.ts` primitives and stored in the per-round `RoundSnapshot`:

- **`rewardDelta`** (Δ_R): top reward this round minus top reward prior round.
  Null for round 0.
- **`convergenceRate`**: Δ_R divided by the prior round's group standard
  deviation (+ ε). Range approximately [0, 1] in practice. Null for round 0.
  When this trends toward 0, the in-context policy has exhausted its improvement
  capacity.
- **`groupStddev`**: standard deviation of the round's specimen group rewards.
  Collapsing stddev signals diversity death — all specimens have converged to the
  same strategy.

Halt condition: `convergenceRate < convergenceThreshold` for `plateauRounds`
consecutive rounds.

The `stz bridge round-status` command renders the full convergence curve as a
table (round, topReward, groupMean, groupStd, Δ, convergenceRate, status) so
the operator can inspect it without opening JSON. This is the training loss curve
equivalent for the SDLC context.

#### `RunConfig` additions (`00-intent/run-config.json`)

A new `convergence` key is added to `RunConfig` (types.ts). All fields have
defaults; existing configs without the key behave identically to today.

```typescript
export interface ConvergenceConfig {
  /** Hard ceiling on rounds per slice. Default: 1 (current single-round behaviour). */
  maxRounds: number;
  /** Halt when convergenceRate < this for plateauRounds consecutive rounds.
   *  Range [0,1]. Default: 0.05. */
  convergenceThreshold: number;
  /** Consecutive below-threshold rounds required to trigger halt. Default: 2. */
  plateauRounds: number;
  /** Feed pressure log into next round (ICRL loop). False = independent re-draws.
   *  Default: true. */
  feedPressureLog: boolean;
}
```

Suggested operator presets offered at `/stz-f:new` elicitation (Area F):

| Preset | `maxRounds` | `convergenceThreshold` | `plateauRounds` | `feedPressureLog` | Use when |
|---|---|---|---|---|---|
| **Single** (default) | 1 | — | — | — | Backward compat; simple slices |
| **Standard** | 3 | 0.05 | 2 | true | Most slices; balanced cost/quality |
| **Deep** | 5 | 0.03 | 2 | true | High-complexity or safety-critical slices |
| **Survey** | 4 | 0.05 | 1 | false | Diversity sampling; no learning signal |

#### `SliceState` additions (`state.json`)

```typescript
/** Immutable snapshot of one completed tournament round. */
export interface RoundSnapshot {
  round: number;                  // 0-based
  winnerSpecimen: SpecimenId;
  groupMeanReward: number;
  groupStddev: number;
  topReward: number;
  advantages: Advantage[];
  rewardDelta: number | null;     // null for round 0
  convergenceRate: number | null; // null for round 0
  interfaceHashMatch: boolean;
  tokenCost: { input: number; output: number };
  completedAt: string;            // ISO 8601
}
```

Two new optional fields on `SliceState`:
- `roundHistory?: RoundSnapshot[]` — the full convergence curve; append-only
- `currentRound?: number` — 0-based index of the active round

#### New bridge commands

- **`stz bridge round-promote`** — accepts a round winner candidate; verifies
  interface hash parity, runs `merge-validate` against the assembled crate,
  checks for reward regression; promotes only if all three pass; appends
  `RoundSnapshot` to `state.json`; archives prior winner alongside culled
  specimens in `50-pressure/`.
- **`stz bridge round-status`** — renders the convergence curve table for a
  given slice; JSON and human-readable table output modes.

Both commands follow the existing bridge contract: JSON in, JSON out, all
decisions made by the CLI rather than the orchestrator agent.

#### `/stz-f:new` elicitation additions (Area F)

A new batched question area added to `/stz-f:new` for convergence tuning:

```
Area F — Convergence tuning
  F1. How many rounds per slice? (1 = single-round default; 2–5 for complex slices)
  F2. Stop early when improvement stalls? (yes/no; default yes)
  F3. Convergence sensitivity: conservative (3 rounds) / standard (2) / aggressive (1)
  F4. Feed pressure log into next round? (yes = ICRL loop; no = independent re-draws)
```

#### What the operator can tune

| Signal | Interpretation | Response |
|---|---|---|
| `convergenceRate` drops fast (by round 2) | Shallow strategy space | Reduce `maxRounds`; save tokens |
| `convergenceRate` stays high through round 4 | Rich strategy space | Increase `maxRounds` |
| `groupStddev` collapses early | Diversity death; pressure log over-constraining | Set `feedPressureLog: false` |
| `rewardDelta` is negative | Round winner regressed | Hard block; prior winner retained |
| `interfaceHashMatch: false` | Contract ambiguous; implementations diverged on interface | Escalate to `/stz-f:slice` for re-planning |

#### Token budget note

Multi-round loops multiply token cost non-linearly: R rounds × N specimens × judge
calls ≈ R × (N × generation + O(N²) judge). With R=3, N=4, approximately 3–5×
the cost of a single-round run. The `ConvergenceConfig` presets are calibrated
to converge before hitting `maxRounds` on typical tasks; the `budget` cap in
`SliceState` still applies and `round-promote` will hard-fail if the per-slice
token ceiling is exhausted before convergence.

#### Validation findings and hardening adjustments

The 0.8.0 architecture was reviewed against GRPO theory, ICRL literature, and
best-of-N sampling research prior to implementation. Three issues were confirmed
and the architecture adjusted accordingly. The findings below are the permanent
record of that validation; they are not aspirational — they are binding
constraints on the implementation.

**Finding 1 — The ICRL framing is correct; the GRPO analogy is structural only.**

The loop is a valid instance of in-context reinforcement learning: the agent
adapts by conditioning on accumulated context (pressure logs) rather than by
updating weights. This matches the ICRL definition precisely. The GRPO analogy
holds at the structural level (group sampling → group-relative reward → iterative
improvement), but not at the optimization-mechanics level — there is no gradient
step, no clipping ratio, and no PPO-style surrogate objective. The analogy is
useful for intuition and for borrowing the convergence vocabulary; it must not be
used to import GRPO's convergence *rate* guarantees, which depend on the gradient
machinery. STZ's convergence is empirical, not provably monotone.

Independent specimens each round (not single-lineage self-revision) is confirmed
as the correct scaffolding. Iterative single-lineage self-correction without
strong external anchoring is known to degrade; population-based iteration with a
shared external reward is the pattern that scales.

**Finding 2 — The convergence signal `convergenceRate = Δ_R / σ_{R-1}` has a
known failure mode under quantized rewards and must be stabilised.**

When rewards are quantized (discrete pass/fail test counts rather than continuous
scores), `σ_{R-1}` can be near zero even when the group has not converged — all
specimens in a round may happen to score identically on quantized buckets,
driving σ toward 0 and inflating `convergenceRate` spuriously. This risks
premature halt.

**Adjustment:** The convergence signal is revised to use a windowed absolute
delta rather than a σ-normalized ratio. The new primary convergence criterion is:

```
convergenceRate = Δ_R / (windowMeanDelta + ε)
```

where `windowMeanDelta` is the mean of `|Δ_R|` over the last `plateauRounds`
rounds (minimum 1, to avoid cold-start). This preserves the "relative
improvement" intuition while remaining stable when σ collapses. A floor of `ε =
0.001` prevents division by zero regardless of reward distribution.

The existing `groupStddev` field is retained in `RoundSnapshot` as a diversity
signal (see Finding 3), but it is no longer the denominator of `convergenceRate`.

The `ConvergenceConfig` interface is updated: `convergenceThreshold` now applies
to the windowed-delta form and its default of `0.05` is calibrated for
normalised reward in `[0, 1]`. Operators working with raw test counts should
scale accordingly; a note is added to the Area F elicitation.

**Finding 3 — Diversity collapse must be a hard guardrail, not an operator
interpretation.**

`groupStddev` collapsing toward zero is a signal that the pressure log is
over-constraining the generation distribution — all specimens are converging to
the same strategy. In the training analogy this is policy collapse; here it means
the loop has lost its ability to explore. Treating it as an operator-tuning hint
(as originally specified in the operator table above) is insufficient: an
operator running dark-factory mode has no opportunity to observe it.

**Adjustment:** A `diversityFloor` field is added to `ConvergenceConfig`:

```typescript
/** Minimum acceptable groupStddev. If groupStddev < diversityFloor for
 *  plateauRounds consecutive rounds, round-promote emits a DIVERSITY_COLLAPSE
 *  warning and sets feedPressureLog: false for the next round automatically.
 *  Default: 0.02 (normalised reward scale). Set to 0 to disable. */
diversityFloor: number;
```

When triggered, the automatic response is to suppress the pressure log for the
next round (equivalent to `feedPressureLog: false` for that round only), forcing
the specimens to generate from the contract alone. This breaks the echo-chamber
dynamic without halting the loop. The event is recorded in `RoundSnapshot` as
`diversityCollapseRecovery: boolean` and surfaced in `round-status` output.

The operator table is updated to reflect that `groupStddev` collapse now triggers
automatic intervention rather than a manual response.

**Finding 4 — Regression handling must use retry semantics, not silent retention
with possible halt.**

The original spec blocks promotion on regression (`rewardDelta < 0`) and retains
the prior winner. This is correct. However, a regressive round in a stochastic
system may be a sampling artifact — a bad draw of N specimens — rather than
evidence that the strategy space is exhausted. Silently retaining the prior
winner and continuing to the next round with no signal is ambiguous; under
`plateauRounds = 2`, two consecutive regressions could trigger premature
convergence halt when the loop was merely unlucky.

**Adjustment:** A regressive round triggers the existing **escalation state
machine** (one retry, then replan, then halt) rather than silent retention. The
retry re-draws N fresh specimens from the same round context (contract + same
pressure logs) without incrementing `currentRound`. The replan path triggers a
PDR refinement of the pressure log before the retry, on the same logic as the
single-round escalation path. This means regression handling is consistent with
the rest of the system's no-runaway-loops guarantee, and the escalation ceiling
still applies.

`round-promote` returns a structured verdict with `outcome: "REGRESSION"` (not
`"FAIL"`) when `rewardDelta < 0`, so the orchestrator can distinguish a bad draw
from a genuine failure. The halt path is reached only if retry and replan both
fail to produce a non-regressive winner — at which point the loop genuinely
cannot improve and the current winner is finalised.

**Finding 5 — Pressure log context growth must be bounded.**

Appending all prior pressure logs plus full winner code to every round's
generation context grows O(R) in token count and introduces two risks: (a) the
model's effective attention degrades on later rounds as earlier context is
discarded or diluted, and (b) the cost model underestimates actual spend on
deeper convergence runs.

**Adjustment:** The pressure log passed to round-R specimens is not a raw
concatenation of all prior logs. Instead, `round-promote` maintains a single
**rolling strategy document** (`50-pressure/active-strategy.md`) that is updated
(not appended) at each promotion: it contains the current winning approach, the
top-K failure modes across all rounds to date, and the most recent round's
specific lessons. Full per-round logs are archived to
`50-pressure/rounds/round-R.md` for the audit trail but are not included in
generation context after round R+1. This bounds the strategy context to a fixed
size regardless of `maxRounds`, eliminates re-correction of already-resolved
failure modes, and keeps the cost model accurate.

The `RoundSnapshot` records `activeStrategyTokens: number` (the token count of
the rolling document fed to that round) alongside the existing `tokenCost` field.

**Consolidated operator table (updated)**

| Signal | Interpretation | Response |
|---|---|---|
| `convergenceRate` drops fast (by round 2) | Shallow strategy space | Reduce `maxRounds`; save tokens |
| `convergenceRate` stays high through round 4 | Rich strategy space | Increase `maxRounds` |
| `groupStddev < diversityFloor` | Diversity collapse; auto-recovery triggered | `feedPressureLog` suppressed for next round automatically; operator notified via `round-status` |
| `rewardDelta < 0` | Regression; sampling artifact or exhausted space | Escalation retry fired automatically; escalation ceiling applies |
| `interfaceHashMatch: false` | Contract ambiguity exposed | Escalate to `/stz-f:slice` for re-planning; round not promoted |
| `activeStrategyTokens` growing | Rolling doc not summarising correctly | Inspect `50-pressure/active-strategy.md`; reduce manually if needed |
| Convergence halt before `maxRounds` | Loop converged early | Normal; prior winner retained as slice winner |

---

### Harness-level recursive self-improvement: the meta-loop (0.9.0) — ✅ BUILT

The relocation of the shelved 0.8.0 energy to the altitude where RSI actually
pays. The per-slice tournament is **untouched** (earned-correct: best-of-N + good
selection). 0.9.0 adds a separate, **opt-in, default-off** meta-loop that evolves
the **harness itself** — a DGM/HarnessX-style population of harness variants,
selected by GRPO group-relative advantage on **held-out, recall-free** pilot
fitness, with a six-gate promotion guard (0.9.5 adds calibrated-verifier gating).

#### Grounding (2024–2026 literature)

| System | Mechanism adopted | STZ realization |
|---|---|---|
| Darwin Gödel Machine (arXiv:2505.22954) | branching archive; parent-sampling P ∝ fitness/(1+children); held-out fitness replaces formal proof | `src/harness.ts` archive + `sampleParents` in `.stz/60-harness/` |
| HarnessX (arXiv:2606.14249) | typed substitution algebra; Critic validates on held-out before promotion | the harness **genome** (genes G1–G6) + `agents/stz-harness-critic.md` |
| GRPO + RC-GRPO/AceGRPO | group-relative advantage; variance-collapse guard; learnability-frontier curriculum | `src/grpo.ts` reused one altitude up + `src/diversity.ts` |
| Self-Play SWE-RL / SSR (arXiv:2512.18552) | bug-injector adversary vs the suite | `agents/stz-injector.md` + `injectMutants` (`src/eval-runner.ts`) |
| Judge-reliability crisis (arXiv:2606.10315 / 2505.19477) | one robust judge + consistency CI; **no naive ensembles** | `src/judge-reliability.ts` + `bridge judge-stress` |

#### The harness genome (mutable genes) — `HarnessGenome` in `src/types.ts`

`G1` test-author negative-case heuristic (the flagship) · `G2` suite battery
mutators · `G3` specimen strategy set · `G4` judge rubric · `G5` selection-weight
tuple · `G6` fan-out + votes. Frozen (never a gene): `seal.ts` integrity, the
`hack-detector` RULES floor, the `grpo.ts` formula, the escalation ceilings, the
truth suites, and the N6 contract. A variant mutating any frozen file is rejected
at the gate before its fitness is even read.

#### Flagship: automated suite sharpening

The pilots' lever made mechanical. `eval-runner.ts measureMutation` **is** the
objective verifier: a surviving mutant is a suite blind spot. A discovered
bug-class (e.g. `5abc`) becomes (a) a promoted `MutatorSpec` in the expanding
`60-harness/battery` and (b) a negative-case heuristic appended to
`stz-test-author.md` — promoted only when TWICE-verified (`harness-mine`: the
mutator **survives** the incumbent suite ✓ AND **is killed** by suites authored
with the new heuristic ✓). Caught once at ~0 marginal/slice instead of re-derived
per slice — the entire redirect.

#### New bridge commands (deterministic spine; the bridge owns all compute, N6)

`inject` (blind-spot discovery + bounded FSM) · `harness-mine` (skill verifier
half i) · `harness-promote-mutator` (append a verified mutator to the battery) ·
`harness-spawn` (DGM parent-sampling) · `harness-fitness` (AceGRPO-weighted
held-out fitness → `ArchiveEntry`) · `harness-select` (GRPO advantage + diversity
guard) · `harness-promote` (six-gate) · `harness-status` · `judge-stress`
(consistency CI) · `judge-calibration` (0.9.5 — blind target-task accuracy →
`60-harness/judge-reliability.json`). Driven by `commands/stz-evolve.md` and `commands/stz-inject.md`;
config via the optional `harness` block in `run-config.json`.

#### The six-gate promotion guard (DGM hack-resistance built in)

A variant becomes the incumbent ONLY if it (1) beats the incumbent on held-out
fitness AND (2) is **hack-clean on its OWN outputs** (it cannot win by weakening
its own gate — the DGM self-detector-bypass failure) AND (3) preserved sealing
integrity (`verifySeal`) AND (4) interface parity (`harness-hash.ts`) AND (5)
came from a diverse (non-collapsed) generation AND (6, **0.9.5**) its selection
**judge is target-task calibrated** (`calibrationGate` — fail-closed; an
uncalibrated verifier silently regresses, arXiv:2606.14629). Kill-switches
**halt and surface**; nothing ever auto-rewrites its own guard.

#### Discipline (earned, not asserted)

Held-out & recall-free · budget-matched · 3-seed minimum · symmetric-error null
("no variant beats the incumbent → keep it" is a SUCCESS) · convention-axis
discount · N6 replay from `60-harness/MANIFEST.json` append-order. The pilots are
burned as blind-spot substrates (non-regression only); a fresh, pre-registered,
unprobed contract is required for any generalization claim.

#### Operator table (0.9.0 meta-loop)

| Signal | Interpretation | Response |
|---|---|---|
| `harness-select` σ < `diversityFloor` | Variance collapse — generation is non-discriminating | Do not promote; re-sample with forced gene diversity (RC-GRPO) |
| two BARREN generations in a row | Converged — nothing beats the incumbent | Halt; incumbent stands (anti-build null — a SUCCESS) |
| `harness-mine` mutator killed by incumbent suite | Not a blind spot | Reject the candidate skill as a no-op |
| six-gate `promote:false` with `hack-findings-on-own-outputs` | Variant tried to win by weakening its gate | Reject; the DGM failure mode, caught |
| `judge-stress` consistency below threshold for a slice-type | Judge unreliable here | Down-weight the judge; lean on the sealed/truth divergence backstop |
| six-gate `promote:false` with `judge-rubric-not-calibrated` (0.9.5) | Selection judge not target-task calibrated (or `--slice-type` omitted) | Run `judge-calibration` on a blind battery first; gate is fail-closed by design |

---

## 0.9.0 empirical status (2026-06-28) — the competency claim was tested and is a negative

The 0.9.0 meta-loop above is built and works as a mechanism. The claim it was built to
support, that harness self-improvement ships more correct code, was then tested directly
and does not hold on the substrates tried. Across six substrates and every selection signal
the harness can compute (sealed-derived numeric proxies, the judge, and a heterogeneous
pool), no configuration produces a competency lift attributable to the harness detecting
correctness. The reason is structural: a suite-sharpening gain needs an axis that is large,
split across the blind pool, and invisible to a good-faith suite at the same time, and those
properties do not co-occur. The `harness-mine` discover-and-bake mechanism is real and
useful; converting it into reliably better shipped code is the part that does not follow.

Full account: `docs/PAPER.md`. Cross-arm summary: `experiments/EXPERIMENT-SUMMARY.md`.
Build log: `docs/JOURNAL.md`. The remaining open questions (a correctness-tracking judge
rubric, a non-sealed-derived numeric proxy, frontier-vs-frontier at scale, cross-slice
amortization on a family with a shared bug class, and SWE-Bench as a deciding instrument)
are in the paper's Section 8.

## 0.9.5 — calibrated-verifier gating + a Well-Architected authoring gene — ✅ BUILT

The post-Opus-4.8 RSI literature was surveyed against STZ's earned negative
(`experiments/META-RSI-SURVEY.md`). It did not rescue the negative; it corroborated it and
handed over a proof of *why*, plus two **earned** moves that satisfy both competency-and-
compatibility, which 0.9.5 ships:

- **Calibrated-verifier gating (the sixth promotion gate).** [arXiv:2606.14629](https://arxiv.org/abs/2606.14629)
  (*When Good Verifiers Go Bad*) sharpened the open door: an exogenous verifier each round is
  **necessary but not sufficient** — it must be **target-task calibrated before it steers**, or
  it silently regresses the result (above-threshold-on-A can be sub-threshold-on-B;
  confident-but-wrong regresses worse than random). STZ's own judge-shipped-c4-worse
  (`experiments/judge-selection/`) is an on-data instance. 0.9.5 adds `judge-calibration`
  (measures judge target-task accuracy on a blind, pre-registered battery → persisted
  `60-harness/judge-reliability.json`) and a **fail-closed** sixth gate `rubricCalibrated`
  in `promotionGate` (`src/harness.ts`, `src/judge-reliability.ts:calibrationGate`). It buys
  **bounded-safe**, not continuous, improvement — it stops the loop going negative. This
  *validates and sharpens* the existing guard architecture (bounded depth F14 +
  judge-reliability gating + variance floor + halt-and-surface F19).
- **WAF authoring gene `waf-playbook-autogen-v0` (G1).** A `heuristicId` branch in
  `agents/stz-test-author.md` lets the test author consult the AWS Well-Architected Agentic AI
  Lens playbooks to sharpen negative/edge cases for behaviour the contract already specifies —
  **one-time amortized authoring**, the survey's earned WAF result. **Goodhart-guarded:** WAF
  never adds an unstated requirement and no LLM-judged WAF-conformance score is ever a fitness
  signal (weights tuple untouched; promotion stays on held-out functional fitness). STZ already
  maps strongly onto the Agentic AI Lens (`docs/CLAUDE.md` §5); the remaining Lens gaps
  (AGENTCOST05 per-agent cost-attribution, AGENTSEC07 rogue-agent detection beyond static L3)
  are conformance items, not loops.

The honest headline (carried from the survey): **no validated *continuous*-competency win
exists in the window.** 0.9.5 ships only what is earned (degradation-safety + authoring) and
pre-registers the one speculative direction (door A) as a gated experiment (below).

## 1.8.0 — the Foundry rebuild: standalone BYO-LLM harness — ✅ BUILT

STZ moved from a research harness bound to one vendor's agent host (Claude Code)
to a standalone, bring-your-own-LLM **Foundry** that owns the spawn-and-collect
loop and speaks directly to models over HTTP. Earned across six regression-tested,
live-validated stages (audit tree under `experiments/foundry-progression/`):

- **Provider seam** (`src/foundry/provider.ts`) — one abstraction over
  Anthropic, OpenAI-compatible, Ollama, and vLLM; zero dependencies; bounded
  retries; prompt caching mandatory on the Anthropic path.
- **FoundryModelLayer** (`src/foundry/model-layer.ts`) — the real per-slice
  pipeline (eval gate, GRPO selection, hack detection, escalation FSM from
  Part I) running unchanged over direct HTTP at $0 marginal cost on local models.
- **Specimen concurrency** (`src/foundry/spawn.ts`) — a bounded pool with
  per-specimen wall-clock stuck-kill; killed specimens never abort the round.
- **Cost governance** (`src/foundry/cost.ts`) — per-model pricing aggregated by
  role, hard token/USD caps at the single seam every call passes through;
  unknown models are reported, never guessed.
- **Standalone CLI** (`stz foundry init|run`) — secret-free config (keys by
  env-var only), per-role model overrides, per-role cost reporting.

**The load-bearing field finding:** for a local-model foundry, **test-author
strength is the binding constraint**, not specimen quality. Five distinct
instrument defects surfaced only under live conditions (transport truncation,
reference-export mismatch, small-model syntax failure modes, wire-format drift,
invented test expectations) and became deterministic guards; one true model
ceiling (persistent expectation-invention) was correctly *rejected*, not patched
— the Part I asymmetry (defective instrument zeroes every specimen) held in the
field. The first full field run (`example-stz-f`, Space Invaders, dark-factory)
delivered six slices faithful to intent, culled 18 specimens, and the sealed gate
caught a real ship-blocking bug (a contract-violating shield-erosion model).

## 1.9.0 / 1.9.1 — production-readiness hardening — ✅ BUILT

Five ship-blockers from the 1.8.0 field run, each researched, prototyped against
alternatives, validated end-to-end, and released via CI (npm + provenance):

- **Execution sandbox** (`src/sandbox.ts`) — the #1 ship-blocker. Model-generated
  code (the eval seam: sealed harness, smoke/self checks, mutants, references) no
  longer runs as plain `node` with the host's filesystem/network/process table.
  All six spawn sites route through one `sandboxedNode` helper: **Linux** bwrap
  (`--unshare-all`, read-only host, coverage dir bound rw) + `prlimit`
  (address-space / file-size / cpu caps); **macOS** sandbox-exec; **fallback**
  the Node permission model with a loud no-network-isolation warning. Default-deny
  throughout (the denylist-escape lesson); the isolation level is probed once
  (nested-namespace failure downgrades cleanly) and recorded in the audit report.
  `STZ_SANDBOX` overrides. 1.9.1 fixed two portability defects: `RLIMIT_NPROC`
  (per-uid system-wide, crashed the sandbox on busy CI hosts) was dropped, and the
  permission flag is chosen by Node major version (`--experimental-permission` on
  Node 20–22).
- **Fan-out throttle + run wall-clock cap** — `maxParallelSlices` (bridge emits a
  capped `dispatch` set in code, not prose) and `runWallClockMs` (a real run-level
  ceiling the per-specimen timeout never provided).
- **Test-author preflight** — proves the test-author model can author a valid
  sealed harness for a canary *before* the real slice, failing fast instead of
  burning the escalation budget (the 1.8.0 binding-constraint finding, enforced).
- **retryPolicy telemetry** — records whether escalation rounds recover winners or
  burn budget (recovery-vs-burn per run), so the defaults tune on evidence.
- **Held-out ownership guard** — a PreToolUse hook (`hooks/held-out-guard.mjs`)
  blocks destructive shell ops on the sealed tree *in code* (the reference-b
  deletion class), complementing `seal-verify`'s after-the-fact detection.

## Planned — next cycle (2026-07)

Direction for the cycle after the 1.9.x hardening. Sealed integration testing (4)
ships greenfield-first on its own; brownfield (3) then adds a source-preservation
axis to it and motivates real worktrees (5). Debug mode (1) and model-tier
support (2) are independent.

### 1. Post-aggregation debug mode — ✅ BUILT (1.10.0)

**Shipped.** A reproduced defect against a shipped winner is mined into a SEALED
regression case (`30-tests/held-out/<slice>/debug-cases.json`, hashed by
`SEAL.json`), guarded by a twice-verified oracle (the winner fails it, the
reference passes it), folded into the eval gate (`fullEval.debugPassRate`, which
the gate now requires to be 1), seal-amended, and the affected slice + its
transitive DAG dependents reset to re-run against the sharpened suite. Delivered
as `src/debug.ts` + `stz bridge debug-case` / `slice-reset`
(`transitiveDependents` in `src/project.ts`) + the `/stz-f:debug` command. The
blind-spot defect can never re-win once its case is sealed, and the whole chain
is replayable from `40-slices/<slice>/debug.md`.

### 2. Higher-than-Opus model families (Claude Fable 5 and class) — ✅ BUILT (1.11.0)

**Shipped.** `src/tiers.ts` classifies models into a `fable | mythos | opus |
sonnet | haiku | local | unknown` tier ladder — Fable and Mythos are two distinct
Mythos-class families (same underlying model, different availability) at the top
rank above Opus.
`auditRoleTiers` reserves the premium tier for the roles the field run proved
pay off — the frozen test-author and judge (the binding constraint) — and warns
when a premium model is put on the high-volume specimen role (wasteful). Tier
defaults price a premium hosted model the operator left unpriced so its spend is
visible instead of a silent $0 (`withTierPricing`, override in `foundry.json`).
The foundry cost report gains a `## Model tiers` section with per-role tier +
allocation advice; `stz bridge model-tiers` audits the in-session RunConfig.
Advisory only — never blocks a run.

### 3. Brownfield: build on an existing codebase — ✅ BUILT (1.12.0)

**Shipped (the exploration + anchoring half).** `src/brownfield.ts`
`exploreCodebase` maps an existing repo — per-file exported symbols, existing
tests, the public surface — deterministically (regex + fs). Slices carry an
**anchor** (`mode add|extend|edit`, `targetFiles`, `preservedExports`) tying them
to real code locations; `checkAnchor` rejects a dangling path, a missing
preserved export, or an `add` that would overwrite. `stz bridge explore` /
`anchor-check` + the `/stz-f:explore` command; `/stz-f:slice` anchors brownfield
slices when a map is present. The `preservedExports` are the surrounding contract
feeding item 4's source-preservation gate. Still open (folds into item 5): the
per-specimen git **worktrees** that let specimens *edit* the mapped repo in
parallel rather than synthesize — anchoring is the prerequisite that is now done.

### 4. Sealed end-to-end integration + functional testing — ✅ BUILT (1.13.0)

**Was:** the sealed suite is per-slice and unit-level — nothing proved the
composed slices work together and satisfy whole-project acceptance, only that
each slice passed its own contract's suite.

**Shipped.** `src/integration.ts` `runIntegrationGate` is a composition-level
gate authored once per project and run after aggregation, with the same
anti-hacking discipline as the per-slice suites (blind author, sealed by content
hash, cross-referenced). It applies to both kinds — the reference oracle differs:

- **Greenfield (shipped first, no dependency on item 3):** the sealed integration
  suite is authored against the **project intent** (`00-intent/` done-predicates
  + composed slice contracts) and run against the assembled entry point —
  catching cross-slice integration bugs the unit suites cannot see.
- **Brownfield (layers item 3's anchors):** `checkExportsPresent` additionally
  gates **source preservation** — every `preservedExport` the slice anchors
  promised must still resolve on the assembled artifact.

`stz bridge integration-gate` (seal-verify → gate → `90-audit/integration.md`,
exit 1 on failure) + the `/stz-f:integration` command. ✅ BUILT (1.13.0).

### 5. Per-specimen git worktrees + ephemeral observability

**Gap (answers the standing question — NOT built):** specimens materialize into
`prototypes/specimen-X/` directories and run in private temp dirs under the
sandbox; there are **no git worktrees** and **no per-specimen observability
stack**. Directory isolation is the honest minimum while specimens *synthesize*
files.

Wanted (paired with 3): real per-specimen git worktrees once slices **edit** a
shared repo (so parallel edits don't collide), each with a scoped ephemeral
observability stack (logs/metrics/traces) torn down at slice close — the Codex
per-worktree pattern the original design called for, now motivated by brownfield.

### 6. Cross-slice RAG / embeddings

**Gap (confirmed — NOT built):** no vector store ships with the harness and no
semantic lookup runs across the `.stz/` markdown tree. Progressive disclosure is
by frontmatter summaries + stable claim ids only; cross-slice recall
("did an earlier slice already set a convention for X?") is manual.

Wanted: local embeddings (e.g. `nomic-embed-text` via Ollama — no managed vector
service, matching N9/N5) over the markdown tree, scoped per phase-agent role,
rebuilt incrementally on slice close. Unlocks id-free semantic spec-diff matching
and cross-slice convention/decision recall as the tree grows.

### 7. Unified installer — one `npm install`, every harness registered — ✅ BUILT (1.14.0)

**Shipped.** `src/installer.ts` + `stz install`/`uninstall` register the
`/stz-f:*` commands + agents into an agent harness at a user-chosen location: a
runtime → config-home registry (Claude Code supported; Codex/OpenCode/Pi detected
+ reported, adapters pending), descriptor kinds `dot-home`/`xdg`, and overrides
most-specific first (`--config-dir` → `--project` → `STZ_CONFIG_DIR` → runtime
env → registry default, tilde-expanded). Manifest-recorded, idempotent,
`--dry-run` + `--list`, uninstall-symmetric (never touches a sibling command).
The design below stood; the per-harness *asset adapters* for Codex/OpenCode/Pi
remain (folds into *Additional agentic-coding runtimes*).

**Gap:** installation is two steps and two mental models. `npm i -g stz-foundry`
gets the CLI + standalone foundry runner; the Claude Code plugin is a *separate*
`/plugin marketplace add` + `/plugin install`. The plugin already self-resolves
its bundled `bin/stz.mjs` (no PATH needed), so the npm global is optional for
in-session use — but there is no single command that sets up *both*, and nothing
that would register STZ into any host other than Claude Code.

Wanted: the npm package as the **one installation interface** for every surface.
A new `stz install [--harness <name>|--all]` subcommand that detects installed
agent harnesses and registers STZ's commands/agents into each from the single
global install — idempotent, opt-in, uninstall-symmetric (`stz uninstall`).

**User-selected install location (the gsd-core model).** STZ must not assume one
hardcoded path. Following gsd-core's `runtime-homes` pattern, a single
**runtime → config-home registry** is the source of truth, resolving each host's
target from a small set of descriptor kinds — `dot-home` (`~/.claude`), `xdg`
(`$XDG_CONFIG_HOME` → `~/.config/<name>`), and `generic-agents-root` (probe
`~/.config/agents/skills` then `~/.agents/skills`, first existing wins). The user
overrides the default at three levels, most-specific first:

- **`--config-dir <path>`** (and a scope flag: `--global` vs `--project` to write
  into `./.claude/` etc. instead of the home directory),
- a **per-runtime env var** (e.g. `STZ_CONFIG_DIR`, or the host's own like
  `KIMI_CONFIG_DIR`),
- the **registry default** for that runtime.

Paths are tilde-expanded, the chosen target is recorded so `stz uninstall` and
`stz update` write to the same place, and `stz install --dry-run` prints exactly
what it would write where before touching anything. This is what makes "install
STZ into the harness *I* choose, at the location *I* choose" a first-class flag
rather than a fork. Per-harness detail:

- **Claude Code** — write/register the marketplace + plugin entry into
  `~/.claude/` (the sanctioned plugin path) so `/stz-f:*` is available without the
  two manual slash commands. Detect via `~/.claude/`.
- **Codex CLI / OpenCode / Pi** (folds in *Additional agentic-coding runtimes*
  above) — install the host-native command/agent definitions and a bridge
  resolver entry per host, so `stz install --harness codex` bootstraps STZ inside
  that runtime the same way. Each host needs its adapter (spawn N specimens,
  collect pointers, honour the per-role model map); the deterministic bridge is
  unchanged, host-agnostic by construction.
- **Standalone** — the CLI + foundry runner already work from the global install;
  `stz install` is a no-op there beyond a PATH/health check.

The result: `npm i -g stz-foundry && stz install --all` sets up the CLI, the
standalone runner, and every detected in-session harness from one interface —
and adding a new harness is a new adapter + an `install` case, not a new
distribution channel. A prebuilt `dist/` (dropping the runtime `tsx`/`npx`
fetch, noted in the gaps above) is a natural companion so a fresh install needs
no network on first run.

### 8. Harness factory — specialized harnesses as the output artifact

**Design locked (2026-07-10), not built.** Full design:
`docs/development/harness-factory.md`. The abstraction ladder: STZ makes code →
the same tournament machinery can make *agents* (specimens write `agents/*.md`
instead of implementations) → the factory assembles tournament-won components
(agents + commands + skills + hooks + docs + eval batteries) into a complete
**specialized harness** — a full stack on top of an LLM, packaged as an
installable plugin, tuned per vertical (data-ops, BI, customer support,
performance marketing, …).

Not a new machine: the 0.9.0 evolve loop already scores an agent-configuration
by downstream tournament outcome on held-out truth suites; the DGM archive,
GRPO selection, six-gate promotion, diversity floor, and kill-switches are
substrate-agnostic and reused verbatim. Two net-new mechanisms only:

- **Agentic eval seam** — `runAgentBattery` spawns a candidate agent per
  battery task via the provider seam and scores its artifacts with the existing
  contract predicate kinds, emitting the same `EvalResult` shape the bridge
  already consumes.
- **Oracle provenance typing** — the α→0 guard (the PAPER.md earned negative)
  as a type: every battery/fitness signal carries an
  `OracleReceipt {kind: execution|constructed|replay|anchored-judge, acceptedBy,
  lineage}`; a **seventh promotion gate** refuses any promotion whose fitness
  lineage lacks an exogenous ancestor. Exogeneity is harvested (execution /
  answer-first construction / replay), never manufactured; anchored judges
  amortize truth but never create it.

Vertical admission is decided by oracle class: **data-ops pilots**
(execution + construction: dbt, data-diff, fixture warehouse — zero oracle
latency), BI second, support/perf-marketing later (replay, horizon-capped,
`rubricCalibrated` mandatory), and **RevOps / GTM / exec-strategy refused**
until a forecast-mode oracle (resolvable predictions, Brier ex post) exists.

Phases, each independently valuable:

1. Agentic eval seam (`src/foundry/agent-runner.ts`, `battery-types.ts`,
   `OracleReceipt` schema) — standalone agent-benchmark harness.
2. Component tournaments — seam swapped into slice machinery; GEPA-style
   reflective prompt mutation (bounded budget); search-set/promotion-set
   battery split (Goodhart bound); seventh promotion gate.
3. `HarnessBlueprint` + deterministic best-per-slot assembly + data-ops pilot
   battery (fixture-warehouse generator + dbt/data-diff oracle).
4. Emit/packaging — `src/foundry/emit.ts` (inverse of `planInstall`),
   plugin.json/marketplace.json generation, docs via documenter/summarizer,
   fix the pre-existing installer `skills/` gap.
5. Harness-level evolve — parameterize `src/harness.ts` substrates from code
   pilots to domain batteries; gated on phases 1–4 showing gains; evolve
   discipline verbatim (held-out, recall-free, 3-seed, variance floor,
   MANIFEST replay).
