# Harness factory: specialized harnesses as the output artifact

STZ today is a dark factory whose product is *code*: sealed-contract slices,
N adversarial specimens per slice, a deterministic bridge doing every selection
decision, and a replayable audit tree. This document designs the next two rungs
of the abstraction ladder:

1. **Agents as output** — a tournament whose specimens write agent definitions
   (`agents/*.md`) instead of implementations.
2. **Harnesses as output** — the factory assembles tournament-won components
   (agents + commands + skills + hooks + docs + eval batteries) into a complete
   *specialized harness*: a full stack on top of an LLM, packaged as an
   installable plugin, tuned for one vertical (data-ops, BI, customer support,
   performance marketing, …).

This is a design document. Nothing here is built; the phased roadmap lives in
`docs/ROADMAP.md` (Planned — next cycle, item 8).

## Why this is not a new machine

The v0.9.0 harness-evolve meta-loop (`commands/evolve.md`, F19 in
`docs/CLAUDE.md`) already runs an *agent-configuration* as the unit-under-test:
a genome variant is scored by the quality of the tournament winners it
produces on frozen recall-free pilots, against truth suites that were never in
the loop. The DGM archive, GRPO group-relative selection, six-gate promotion,
diversity floor, and halt-and-surface kill-switches are all
substrate-agnostic — they operate on `fitness: number` per substrate. The
factory reuses all of it.

What the factory adds is exactly two things:

- **an agentic eval seam** — today `src/eval-runner.ts` scores a *source file*
  (`node <sealed.mjs> <impl>`, V8 coverage, mutation, code-health). Nothing can
  spawn a candidate *agent* on a task battery and score its behaviour. That
  seam (`runAgentBattery`) is the single net-new mechanism.
- **oracle provenance typing** — the enforcement that keeps the whole thing
  outside the α→0 wall (below).

## The constraint that shapes everything: the earned α→0 result

`docs/PAPER.md` and `experiments/META-RSI-SURVEY.md` record this repo's own
negative result: a self-improvement loop whose fitness signal is derived from
suites/judges the same system generated does **not** produce competency gain —
exogenous-signal fraction α decays to zero, variance collapses (observed
empirically: `experiments/wsample-pilot` evolve run ended `sigma: 0, VARIANCE
COLLAPSE`). Any factory whose specimens are scored by evals the factory itself
invented reproduces that negative.

So the design axiom: **exogeneity cannot be manufactured in-loop. It is
harvested from three legal sources, and its presence is enforced by type.**

### The three legal sources of exogenous bits

1. **Execution / physics.** The compiler, the runtime, the sandbox, a dbt run,
   a SQL engine. The world answers, not the LLM. Free and automatic — this is
   why STZ works for code today, and it extends further than it looks:
   typecheck, "the query executes", "the dashboard renders", "the API call
   returns 200".
2. **Construction — answer-first task generation.** Build the answer first,
   then synthesize the task from it; the correct output is known *by
   construction*, so no oracle is needed at eval time:
   - *Fixture warehouse*: generate ground-truth facts → derive raw, messy
     source data from them → ask the harness-under-test to recover the facts.
   - *Known-injection hunts*: inject a known defect/anomaly into clean data;
     the answer key is the injection log. (`agents/stz-injector.md` already
     embodies this pattern for suite hardening.)
   - *Metamorphic relations*: a human writes an invariant once
     (`sort(x)` permutes `x`; add one row → count rises by one); the machine
     checks unlimited generated instances.
   The human α arrives in one lump — at acceptance of the *generator*, not of
   each instance — via the contract plane's provenance receipt
   (`Provenance.acceptedBy`, `src/contract/contract-types.ts`), then amortizes
   over every instance the generator emits.
3. **Replay — the recorded world.** Historical tickets with their actual
   resolutions; campaign logs with their actual outcomes. The world already
   produced the labels. The programmatic part is ETL, search/promotion splits,
   and leakage guards. Caveat: non-stationary — replay batteries carry a hard
   horizon cap.

**Amortizer, not a source: anchored judges.** An LLM judge calibrated against
a small ground-truth anchor set (drawn from sources 1–3) may steer within its
measured reliability — the existing `rubricCalibrated` promotion gate
(`src/judge-reliability.ts:calibrationGate`). Calibration licenses steering;
it never creates ground truth. `experiments/judge-selection` showed an
uncalibrated judge rewards visible rigor over held-out correctness.

### Enforcement: oracle provenance typing

Per the architecture rule (decisions in deterministic TypeScript, never in
agent prose), the α→0 guard becomes a type, not an operator discipline:

```ts
interface OracleReceipt {
  kind: "execution" | "constructed" | "replay" | "anchored-judge";
  acceptedBy: string;   // human receipt for the generator/battery, Provenance-style
  lineage: string[];    // ancestry of derived signals back to an exogenous root
}
```

Every battery, every check, every fitness number carries a receipt. The
promotion gate gains a **seventh check**: refuse any promotion whose fitness
lineage lacks an exogenous ancestor. A self-generated-only signal is
structurally unpromotable — α→0 becomes a type error.

## Two genomes, two altitudes

- **`HarnessGenome`** (`src/types.ts:421`) stays what it is: the *factory's
  own* search configuration — heuristics, strategy labels, rubric, selection
  weights, fanout. It tunes how the search runs. Untouched.
- **`HarnessBlueprint`** (new) is the *product* — the manifest of a
  specialized harness:

```ts
interface HarnessBlueprint {
  schemaVersion: 1;
  id: string;                 // e.g. "data-ops-harness"
  vertical: string;
  version: string;
  agents: ComponentRef[];     // { slot, sourcePath, winnerVariantId, batteryId }
  commands: ComponentRef[];
  skills: ComponentRef[];
  hooks: ComponentRef[];
  docs: ComponentRef[];       // emitted by stz-documenter / stz-summarizer
  bridgeConfig: FoundryConfig; // reuse foundry.json shape verbatim
  battery: BatteryRef;         // the domain suite it was tuned against
  oracle: OracleReceipt;       // no receipt → no assembly
}
```

`ComponentRef`s are content-addressed to winning tournament variants, so a
blueprint is a replayable audit object exactly like an `ArchiveEntry`. A
blueprint **cannot be assembled without a named exogenous oracle receipt**.

## Two-level factory

**Component level — the workhorse.** Each agent / command / skill is a slice.
The existing slice machinery is unchanged: `select()` two-stage gate+rank,
hack detection, GRPO advantages, escalation, pressure log. The only swap is
the eval seam:

- The slice's "sealed suite" becomes a **task battery**: N held-out tasks
  whose checks are the existing contract predicate kinds
  (`output-assertion | diff-constraint | json-invariant | file-invariant`,
  `src/contract/contract-types.ts:58`) — machine-checkable, oracle-typed.
- `runAgentBattery(candidateAgent, battery)` spawns the candidate agent per
  task through the provider-agnostic role seam (`src/foundry/runner.ts`
  pattern), collects its artifacts, and scores them with the predicate
  evaluator. It emits the same `EvalResult` shape the bridge already consumes,
  so selection/hack/GRPO code paths need zero changes.
- Specimen generation for prompt-text is **GEPA-style reflective mutation**
  (mutate from execution traces, not blind substitution — arXiv:2507.19457
  shows reflective evolution beats GRPO-style RL at ~35× fewer rollouts), with
  a **bounded reflection budget** and a battery split into a *search-set*
  (hill-climbed) and a *promotion-set* (final selection only). The
  search-vs-promotion gap is the measured Goodhart bound (the generalization
  gap of searched agents grows with search horizon — arXiv:2606.11045).

**Harness level — deterministic first.** Assembly starts as "pick the winning
component per slot" — no search. Evolutionary harness-level search (pointing
`src/harness.ts` at domain batteries instead of the cron/hexcolor/ipv4 code
pilots) is deferred until component tournaments demonstrate gains; the
archive/GRPO/six-gate/variance-floor machinery generalizes without change when
that day comes.

## Vertical admission: oracles decide

The decisive filter for whether a vertical may enter the factory is whether a
fast, exogenous, machine-checkable oracle exists. Verticals without one are
refused — stated in the product, not papered over with a judge.

| Vertical | Oracle class | Concrete mechanism | Verdict |
|---|---|---|---|
| **Data-ops** | execution + construction | dbt tests, data-diff, SQL vs fixture warehouse | **Pilot — first** |
| **BI / analytics** | construction | query results vs known fixture numbers on a frozen warehouse | Second |
| **Performance marketing** | replay | replayed campaign logs vs held-out actuals | Later; horizon-capped |
| **Customer support** | replay + construction | historical tickets w/ known resolutions; resolution-first ticket synthesis | Later; `rubricCalibrated` mandatory |
| **RevOps / GTM / exec-strategy** | none fast | only **resolvable forecasts** (probabilistic predictions scored ex post, Brier) — exogenous but weeks-lagged | **Refused** until a forecast-mode oracle is built |

Data-ops pilots because it is code-shaped end to end: the agentic eval seam
reuses the exact predicate primitives already in the repo, and the oracle
(dbt / data-diff / fixture warehouse) is independent of any LLM in the loop,
with zero oracle latency.

## Packaging: the plugin directory IS the package format

The output artifact is a Claude Code plugin directory — STZ's own repo shape
(`.claude-plugin/plugin.json` + `commands/` + `agents/` + `hooks/` + skills).
The runtime already auto-discovers these directories; inventing a package
format would be pure waste.

Emit is the inverse of install: `planInstall` (`src/installer.ts:148`) is
already a pure `FileOp[]` list, so `emit(blueprint, targetDir)` materializes
each `ComponentRef`, generates `plugin.json` / `marketplace.json` from the
blueprint (the existing `.claude-plugin/*` files are the literal template),
and produces docs via the existing `stz-documenter` / `stz-summarizer` agents.
Known pre-existing gap to fix alongside: `planInstall` copies `commands/` +
`agents/` + `hooks/` but not `skills/` — install and emit should be symmetric.

The unified installer (ROADMAP item 7) then distributes an emitted harness
into any registered runtime the same way it distributes STZ itself.

## Research grounding

The generate-and-select premise has strong support, and the skeptical
literature shapes the guardrails:

- **Searched agent designs beat hand-designed ones** — ADAS / Meta Agent
  Search (ICLR 2025, arXiv:2408.08435; +13–26% with cross-domain and
  cross-model transfer), AFlow (ICLR 2025 oral, arXiv:2410.10762; +19.5% over
  prior automated methods), AgentSquare (ICLR 2025, arXiv:2410.06153; +17.2%
  over best hand-crafted), Darwin Gödel Machine (arXiv:2505.22954; SWE-bench
  20→50% self-modifying), GEPA (ICLR 2026 oral, arXiv:2507.19457).
- **But specialization per se is not the win.** Anthropic's multi-agent
  research system beat single-agent by 90% with ~80% of the variance explained
  by token spend; equal-budget studies favor a single strong agent; MAST
  (NeurIPS 2025 D&B, arXiv:2503.13657) traces multi-agent failure to
  orchestration design, not capacity; Cognition's "Don't Build Multi-Agents"
  traces it to context fragmentation. The durable gains come from **held-out
  evals + bounded search + verifiable artifacts** — exactly the sealed-suite
  discipline STZ already encodes.
- **Goodharting grows with search horizon** (arXiv:2606.11045): searched
  agents transfer only when the selection metric is held out and the
  validation set is not reused for both hill-climbing and final selection —
  hence the mandatory search-set / promotion-set battery split.

## What NOT to build (the traps)

- **Self-generated domain evals.** Fitness from a suite/judge the same LLM
  wrote → the earned α→0 negative. Every battery carries an `OracleReceipt`
  with a human-accepted generator; the seventh promotion gate enforces it.
- **LLM-judge-only fitness for soft verticals.** Calibration gates steering;
  it does not create ground truth (`experiments/judge-selection`).
- **Unbounded free-form prompt search.** Cap the reflection budget, split
  search/promotion sets, hard horizon cap.
- **Harness-level evolutionary search before component value is proven.**
  Assembly starts deterministic.
- **A new package format.** The plugin directory shape already exists.
- **The oracle-less verticals** (GTM / RevOps / exec-strategy) behind a judge.
  Refuse in-product until the forecast-mode oracle exists.

## Phases (detail in ROADMAP item 8)

1. **Agentic eval seam** — `src/foundry/agent-runner.ts` + `battery-types.ts`
   (+ `OracleReceipt` in the battery schema). Independently valuable as an
   agent-benchmark harness.
2. **Component tournaments** — swap the seam into the slice machinery;
   GEPA-style mutation; split-battery Goodhart bound; seventh promotion gate.
3. **Blueprint + deterministic assembly + data-ops pilot** — `HarnessBlueprint`,
   fixture-warehouse generator, dbt/data-diff oracle.
4. **Emit / packaging** — `src/foundry/emit.ts`, plugin.json/marketplace.json
   generation, docs via documenter/summarizer, fix the installer skills gap.
5. **Harness-level evolve** — parameterize `src/harness.ts` substrates; gated
   on phases 1–4 showing gains; the evolve discipline verbatim (held-out,
   recall-free, 3-seed minimum, variance floor, replay from MANIFEST).
