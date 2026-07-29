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

1. **Agentic eval seam — shipped (v1.18.0).** `src/foundry/agent-runner.ts` +
   `battery-types.ts` (+ `OracleReceipt` in the battery schema). Independently
   valuable as an agent-benchmark harness. See "Phase 1, as shipped" below.
2. **Component tournaments — shipped (v1.18.0).** The seam swapped into the
   slice machinery; GEPA-style mutation; split-battery Goodhart bound;
   seventh promotion gate. See "Phase 2, as shipped" below.
3. **Blueprint + deterministic assembly + data-ops pilot — NOT built.** `HarnessBlueprint`,
   fixture-warehouse generator, dbt/data-diff oracle.
4. **Emit / packaging — NOT built.** `src/foundry/emit.ts`, plugin.json/marketplace.json
   generation, docs via documenter/summarizer, fix the installer skills gap.
5. **Harness-level evolve — NOT built.** Parameterize `src/harness.ts` substrates; gated
   on phases 1–4 showing gains; the evolve discipline verbatim (held-out,
   recall-free, 3-seed minimum, variance floor, replay from MANIFEST).

## Phase 1, as shipped

Phase 1 built the agentic eval seam this document scoped above. This section
describes what exists, for a phase-2 reader landing here to plan the seam's
slice-machinery swap and the seventh promotion gate against.

### Battery shape

`src/foundry/battery-types.ts` holds `AgentBattery` / `BatteryTask` /
`OracleReceipt`. `BatteryTask.checks` is `PredicateCheck[]` — the contract
plane's check type (`src/contract/contract-types.ts`), reused verbatim rather
than redefined, since a battery task needs the four existing predicate kinds
and nothing else. `makeBattery(draft)` is the only way an `AgentBattery` value
can exist: it runs the receipt gate, then battery/task/check shape guards
(non-empty id, no zero-task battery, no zero-check task, no duplicate
task/check ids), then returns a frozen, defensively-copied value, mirroring
`humanAccept` in `src/contract/contract-engine.ts`.

### The exogeneity gate

Two named, separately-tested sequential steps decide whether a receipt is
exogenous — never one compound boolean (the review warning sign this design
document's own research flagged):

1. `resolveRootKind(receipt)` resolves the root `OracleKind` of a receipt's
   lineage. It carries **no exogeneity opinion of its own** — an empty
   lineage resolves to the receipt's own `kind`; a non-empty lineage parses
   `lineage[0]`'s `<kind>:<id>` prefix and fails closed on anything
   unparseable.
2. `EXOGENOUS_ROOT_KINDS.has(rootKind)`, inside `validateReceipt`, is the
   actual exogeneity test — `{execution, constructed, replay}`. `anchored-judge`
   is deliberately excluded from this set, so it can never be a sole root,
   while remaining legal *downstream* of an exogenous root (the amortizer
   case — an anchored judge steering within a measured-reliable calibration,
   never manufacturing the root signal itself).

Four mutation checks (01-02 SUMMARY) proved this gate load-bearing: adding
`anchored-judge` to `EXOGENOUS_ROOT_KINDS`, collapsing `resolveRootKind` to
return `receipt.kind` unconditionally, deleting the human-role
(`acceptedBy`) check, and deleting the zero-task guard each turned a named
test red. No mutation left the suite green.

### `runAgentBattery`'s composition

`src/foundry/agent-runner.ts`'s `runAgentBattery(candidateAgent, battery,
opts)` is glue over existing machinery, not a new engine:

- **Reused unmodified:** `spawnSpecimens` (`src/foundry/spawn.ts`) is the
  entire scheduler — bounded concurrency, per-task wall-clock kill,
  attributable `SpecimenRunRecord`s — via a `Specimen`-shaped adapter where
  `strategy` is the battery task id and `specimen` is the candidate agent's
  own id. `FoundryCostMeter` (`src/foundry/cost.ts`) meters every successful
  `provider.chat()` call when a caller opts in; a cap breach records spend
  before throwing, and the throw propagates into `spawnSpecimens`'s existing
  catch as an attributable `status: "error"` record rather than
  short-circuiting the run. `createProvider`/`Provider` (`src/foundry/provider.ts`)
  is the transport — `resolveProviderSelection()` is a synchronous,
  config-explicit resolver (never probe-and-fallback, the deliberate
  opposite of `selectEmbedder` in `src/knowledge/embedder.ts`): no override
  reports the two `DEFAULT_BATTERY_*` constants with `source: "default-local"`;
  an unreachable endpoint surfaces as a task failure, never a silent
  substitution. `evaluateChecks` (`src/contract/predicate-eval.ts`) scores
  every task's observations.
- **Genuinely new:** the battery types (`battery-types.ts`), the
  kind-dispatching observation builder (`observeCheck`/`buildObservations`,
  the fourth such producer in the repo), and the `EvalResult` aggregation —
  the artifact-vacuity guard (`noArtifacts` forces `passedGate` false) and
  the task-count `testPassRate` denominator (`passedTasks / battery.tasks.length`,
  never the surviving-record count, so a killed or errored task stays a
  scored failure instead of vanishing from the rate).

Artifact keys parsed from a candidate agent's response are validated by
`resolveContained` (`src/write-guard.ts` — the repo's one path-containment
implementation, extracted in 01-03 from `src/mock/orchestrator.ts` and now
imported by both it and `agent-runner.ts`) at collection time, independent of
whether the run materializes to disk. When `RunBatteryOptions.artifactDir` is
supplied, validated artifacts are written via the same shared
`writeSpecimenFiles` helper — the only write path in the file.

### Findings

1. **Sentinel metrics — not measured.** `EvalResult.coverage` and
   `mutationScore` are required numeric fields with no honest agent-battery
   source (an agent battery has no single source file for V8 to instrument,
   and no mutation-testing target). They are filled from two named exported
   constants, `AGENT_BATTERY_COVERAGE_SENTINEL` (`1`) and
   `AGENT_BATTERY_MUTATION_SENTINEL` (`0`) in `agent-runner.ts` — never an
   inline literal. Ranking is unaffected: `groupRelativeAdvantage`
   (`src/grpo.ts`) normalizes by group mean and standard deviation, and the
   sentinels are identical across every specimen in an agent-battery
   tournament group, so they contribute a constant offset within the group —
   mathematically inert to the advantage computation. State this plainly: a
   reader seeing `coverage === 1` on an agent-battery result must not
   conclude V8 coverage ran. The hazard this creates: any future consumer
   that branches on `result.coverage` or `result.mutationScore` (rather than
   treating them as opaque inputs to `evalReward`) would misbehave against
   agent-battery results specifically. No consumer does this today — `grep
   -rn "\.coverage\b" src/` outside `eval-runner.ts`/`agent-runner.ts`/tests
   turns up nothing that branches on the value.
2. **The receipt travels alongside `EvalResult`, never inside it.**
   `EvalResult` gained zero new fields — this is what makes REQ-14's
   "zero bridge changes" claim literal, not aspirational
   (`git diff --quiet src/selection.ts src/grpo.ts src/types.ts src/bridge.ts`
   holds across every commit in this phase). The receipt lives on
   `BatteryRun.receipt` and on every `BatteryTaskResult.receipt` instead.
   Phase 2's seventh promotion gate reads it from there, not from
   `EvalResult` — a gate that tries to find `OracleReceipt` on the bridge's
   existing `EvalResult` type will not find it, by design.
3. **Lineage is flat and root-kind-checkable, not a resolvable graph.**
   `OracleReceipt.lineage: string[]` holds `<kind>:<id>` entries that resolve
   against nothing — no receipt store exists in phase 1, and CONTEXT N9
   forbids adding one. "Machine-checkable" means exactly what
   `resolveRootKind` checks: the root entry's kind is parseable, and
   `validateReceipt`'s lineage-integrity pass catches a duplicate entry or a
   self-reference by scanning the flat array (a cycle, with no graph to
   walk, reduces to exactly one of those two shapes). Upgrade trigger: a
   later phase that introduces a resolvable receipt store turns this into
   real cycle detection over a walked graph — phase 2 should not assume
   `lineage` entries resolve to anything until that store exists.
4. **A second eval substrate, added alongside — accepted debt with a named
   trigger.** STZ now has two eval substrates emitting `EvalResult`:
   source-file eval (`src/eval-runner.ts`, V8 coverage + mutation testing +
   code health) and agent-battery eval (`src/foundry/agent-runner.ts`, the
   sentinel-metric shape above). `EvalResult` was **not** generalized to
   accommodate the second substrate — CONTEXT D4 locked "the seam emits the
   existing `EvalResult` shape; the bridge does not change" for this phase,
   and holding that lock meant adding beside the type rather than widening
   it. This is recorded as deliberate accepted debt, not an oversight: the
   assumption-delta scan run across this phase's four plans reported no
   detection of a needed `EvalResult` change (01-01 through 01-04 SUMMARYs,
   "Design Findings (D-05)" sections). What would force a promote: a third
   eval substrate arriving, or an agent-battery signal that genuinely needs
   an `EvalResult` field the type does not have (a field agent-battery
   results could not express through the existing shape) — either makes the
   two-decoy-substrate posture untenable and is the trigger to generalize
   `EvalResult` rather than add a third parallel shape beside it.

### `evaluateChecks` — a D-04-class finding, not a quiet widening

REQ-13 needed "the existing predicate evaluator" reused for battery checks,
but `evaluatePredicate` (`src/contract/predicate-eval.ts`) demands a full
contract-plane `Predicate` — `schemaVersion`, `state`, `requirement`,
`scope`, `severity`, `provenance` — none of which a `BatteryTask` has or
should be given (dragging in `CONTRACT_TRANSITIONS` lifecycle state to score
a battery check would be exactly the anti-pattern this design's own research
warns against). The fix is additive, not a rewrite: `evaluateChecks(checks,
observed)` is a new export holding the check-set pass rule verbatim;
`evaluatePredicate` now delegates to it, unchanged in behaviour or
signature. `test/contract.test.ts`'s existing predicate-eval assertions pass
unmodified — the executable proof this is behaviour-preserving, and exactly
one implementation of the check-set pass rule exists in the repo afterward.

### A found-and-closed gap, phase 1 → phase 2's clearest worked example

`01-VERIFICATION.md` found that phase 1's own governing claim — "it is
structurally impossible to score a fitness result without a receipt tracing
that fitness back to an exogenous oracle" — was **not** true as shipped: a
hand-built `AgentBattery`-shaped object literal (skipping `makeBattery`
entirely) compiled under `tsc --noEmit --strict` with zero errors and ran
through `runAgentBattery` with no throw, carrying an `anchored-judge`-rooted
receipt — the exact case CONTEXT D2 named as forbidden. The guard was
enforced only by the convention "always call `makeBattery` first," not by
the type system or by `runAgentBattery` itself.

The fix (`f0de8e6`, closing phase 1 before phase 2 opened) is two
independent layers, not one: (a) `AgentBattery` is now branded with a
module-private `readonly [VALIDATED_BATTERY]: true` field only `makeBattery`
can produce, so a hand-built literal no longer type-checks (verified live:
the scratch-file compile produced exactly one error, `Property
'[VALIDATED_BATTERY]' is missing`); and (b) `runAgentBattery` calls
`validateReceipt(battery.receipt, battery.id)` as its own first statement,
before `provider` is even selected — defense in depth behind the brand,
catching anything that arrives by a route the type system can't see
(`JSON.parse`, an `as AgentBattery` cast). Both were mutation-checked:
deleting the runtime call turned exactly the three
`runAgentBattery rejects an unvalidated battery` tests red; deleting the
brand field turned exactly the type-level source-assertion test red; no
other test in either file moved.

This is the clearest worked example, inside this milestone, of the α→0
failure mode the whole design exists to prevent: a control that reads as
load-bearing in review ("structurally impossible") but is convention-only at
one call site is the same shape as a fitness signal that reads as earned but
is self-generated — both fail *silently*, and both were caught only because
D6/`01-VERIFICATION.md`'s own instruction was to hunt for an escape hatch,
not to accept the doc's own claim. Phase 2's seventh gate, the split-battery
guards, and the reflective-mutation caps all inherit this posture: compute
the check, then mutation-prove it is the compute that fires, never trust the
sentence that describes it.

## Phase 2, as shipped

Phase 2 swapped the phase-1 agentic eval seam into the existing slice
tournament machinery, so that an agent definition (`agents/*.md` prompt
text) is a specimen the SAME `select()` / GRPO / hack-detection path can
rank — and added the seventh promotion gate the whole design's α→0 guard
rests on. This section describes what exists, for a phase-3 reader landing
here to plan `HarnessBlueprint` and deterministic assembly against.

### The split battery

`SplitBattery` (`src/foundry/battery-types.ts`) wraps two `AgentBattery`
values — `search` (hill-climbed every generation) and `promotion` (read
exactly once, at the final promotion decision). `makeSplitBattery(search,
promotion)` runs each half through `makeBattery` first (so a per-half shape
violation is never masked), then two pair-level guards, each throwing
`BatteryShapeError` naming the concrete violation: distinct battery ids, and
disjoint task-id sets across the two halves. Both guards close a distinct
vacuity shape CONTEXT D3 warned about — a silently-empty promotion set
(closed structurally: `makeBattery` already rejects a zero-task draft, so an
empty half can never become a value) and a silently-identical promotion set
(closed by the two pair-level checks together; neither alone is
sufficient — id-distinctness alone permits two differently-named batteries
sharing the same tasks).

**The structural guarantee that matters lives in a function signature, not
in the split type.** `runSearchGeneration(candidates, battery: AgentBattery,
opts)` takes a plain `AgentBattery`, never `SplitBattery` — the promotion
half is never in lexical scope inside the function that runs once per
candidate per generation. `SplitBattery` itself could not enforce this; a
caller could always reach into `split.promotion` if the search-loop function
accepted the wrapper type. The proof this matters is behavioural, not a type
check: a recording `Provider` double captures every `chat` request's system
prompt and messages verbatim, and a test scans the captured log for every
search-half task prompt (present) and every promotion-half task prompt
(absent) across an N≥2-candidate run. A discrimination control (the full
`runComponentTournament` DOES surface each promotion prompt exactly once,
during the real promotion run) proves the search-only assertion is
discriminating, not vacuously true because the promotion battery goes
unused altogether — CONTEXT D3's own words: "a test that merely asserts the
split exists proves nothing." A D-06 mutation (concatenate the promotion
half's tasks into the search battery inside `runComponentTournament`) turned
exactly the discrimination-control test red (expected 1 occurrence of the
leaked prompt, observed 3) — proof the isolation is load-bearing, not
decorative.

### The tournament

`runSearchGeneration` runs `runAgentBattery` once per candidate against the
search battery and feeds the resulting `EvalResult[]` — completely
unmodified — into `select()` (`src/selection.ts`). `promoteComponentWinner`
(`src/foundry/component-tournament.ts`) is the single promotion decision.
`runComponentTournament` is the orchestrator: it owns the bounded
multi-generation search loop and is the ONLY place in the file where both
halves of the split are ever in lexical scope together.

`select`, `evalGate`, `evalReward`, `groupRelativeAdvantage`,
`checkDiversity`, `onGeneration`, and `calibrationGate` were imported and
called **unmodified** — `git diff f0de8e6...HEAD` (the phase-2-only diff,
computed against the commit that closed phase 1) shows zero lines changed
in `src/selection.ts`, `src/grpo.ts`, `src/diversity.ts`, or
`src/foundry/spawn.ts`. State this plainly: REQ-18 needed **no production
change to the selection path** — the entire deliverable was the N≥2 proving
test (`select()`'s two-stage gate+rank path producing a winner across two
agent-definition specimens), not new selection logic. The same tournament
machinery that picks an implementation picks an agent definition, exactly
as this document's opening section claimed, and the code proves it by
reuse, not by parallel re-implementation.

### The seventh gate

`PromotionInputs.exogenousLineage` (`src/types.ts`) is the seventh field
alongside the pre-existing six. `exogenousLineageGate(receipt, batteryId)`
(`src/foundry/battery-types.ts`) computes it. The failure reason string
(`fitness-lineage-not-exogenous`) is added to `harness.ts`'s `promotionGate`
alongside the existing six clauses.

The gate is **two named sequential steps**, computed inside
`promoteComponentWinner`, never one compound boolean:

1. **Provenance** — `Object.is(args.promotionRun.receipt,
   args.promotionBattery.receipt)`. This is a reference-identity check, and
   it works only because `runAgentBattery` returns `battery.receipt` **by
   reference** on `BatteryRun.receipt` — the promotion run's receipt object
   and the promotion battery's own receipt object must be the literal same
   JS object in memory, not a deep-equal copy, not a re-derived receipt with
   identical fields. A substituted, copied, or re-derived receipt fails this
   step regardless of its field values.
2. **`exogenousLineageGate`** — resolves the root oracle kind and checks it
   against `EXOGENOUS_ROOT_KINDS`.

**Why the gate is not vacuous, stated explicitly so a later reader does not
"simplify" it back:** `makeBattery` already makes construction-time
exogeneity tautological — any `AgentBattery` value that exists at all
already passed `validateReceipt` once, at construction. So "is this
receipt's lineage exogenous?" asked in isolation, at the promotion call
site, would be true of every receipt reaching that call site by
construction — a vacuous re-check, exactly the failure mode `01-VERIFICATION.md`
found and this design's own research (Pitfall 1) warned about. The gate's
REAL job is catching a **substituted, re-derived, or absent receipt at the
promotion call site** — a receipt that is exogenous in isolation but is not
provably the receipt that actually produced THIS promotion run's fitness
number. That is what step 1 (provenance) tests, and it is the step that
makes step 2 non-vacuous: step 2 only ever runs against a receipt already
proven to be the real one.

**`exogenousLineageGate` deliberately does NOT call `validateReceipt`.**
`validateReceipt` already performs the identical `resolveRootKind` +
`EXOGENOUS_ROOT_KINDS.has()` check internally, as part of construction-time
validation, and throws before returning. Calling `validateReceipt` first and
then independently re-deriving the same check would make the second check
provably, unconditionally redundant — any receipt reaching it already passed
the identical test inside `validateReceipt` — an untestable, dead-code
re-check masquerading as a live gate. `exogenousLineageGate` instead
performs its own self-contained resolve-then-check pair as the sole decision
point. **Do not "fix" this by adding a `validateReceipt` call inside
`exogenousLineageGate` — doing so makes the gate's own membership check
provably dead code, the exact vacuous-gate failure mode this section exists
to name and prevent.**

Mutation checks (02-01 SUMMARY) proved both steps independently
load-bearing and on different lines: disabling the provenance check
(`Object.is` → `true`) turned exactly the "substituted receipt" control red;
disabling the exogeneity step (`EXOGENOUS_ROOT_KINDS.has` → `true`) turned
exactly the "anchored-judge-rooted receipt" control red; deleting the
`promotionGate` clause itself turned four tests red across two files,
including three of the seventh gate's own negative controls. No mutation
left the whole suite green.

The gate is wired identically — computed, never CLI-trusted — at the
harness-genome altitude: `harnessPromote --receipt` (`src/bridge.ts`) reads
a real `OracleReceipt` (a JSON file or inline JSON) and passes it through
the same `exogenousLineageGate`. An absent `--receipt` is a fail-closed
refusal, not a pass.

**A known asymmetry, stated as fact, not as a fixed problem:** three of
`harnessPromote`'s six pre-existing gates — `hackClean`, `sealOk`,
`diversityOk` — are still CLI-trusted booleans, read through a `bool()`
helper off `args["hack-clean"]` / `args["seal-ok"]` / `args["diversity-ok"]`.
`beatsIncumbent` (compares `variant.fitness` against a baseline),
`interfaceParity` (via `checkParity`), and `rubricCalibrated` (via
`calibrationGate`) are computed. The seventh gate, `exogenousLineage`, is
the one gate this phase touched, and it was deliberately built as computed
from day one — this phase did not close the pre-existing asymmetry on the
other three, and did not attempt to; that is out of this phase's scope
fence, not an oversight left unmentioned.

### Component-altitude gate meanings

At the component altitude, `promoteComponentWinner` computes **all seven**
gates from evidence — none is a parameter a caller could assert true. This
resolves RESEARCH's Open Question 1 directly:

| Gate | Component-altitude mechanism | CLI-trusted at this altitude? |
|---|---|---|
| `beatsIncumbent` | `promotionFitness > (incumbentFitness ?? -Infinity)` — `promotionFitness` from `evalReward` on the real promotion-battery run | No |
| `hackClean` | `promotionRun.result.hackFindings.length === 0` — the real battery run's hack findings | No |
| `sealOk` | Re-checked AT the gate (not trusted from `SplitBattery` construction): distinct battery ids AND disjoint task-id sets, re-derived from `searchBattery`/`promotionBattery` | No |
| `interfaceParity` | **`agentFrontmatter(winner) === agentFrontmatter(incumbent)`** — frontmatter-block string equality between the winning agent definition's YAML frontmatter and the incumbent's. `checkParity(BRIDGE_COMMANDS, ...)` (the bridge-command-surface diff `harnessPromote` uses) is **NOT reused** — an agent-definition promotion doesn't touch `BRIDGE_COMMANDS` at all, so that check would be meaningless here. `true` when there is no incumbent yet (nothing to diverge from) | No |
| `diversityOk` | `checkDiversity(generationRewards, diversityFloor).ok` — reused verbatim | No |
| `rubricCalibrated` | `calibrationGate(judgeProfile, sliceType).calibrated` — reused verbatim | No |
| `exogenousLineage` (seventh) | Two-step provenance + exogeneity check, above | No |

This is RESEARCH Open Question 1's resolution: the component altitude does
not reuse `checkParity(BRIDGE_COMMANDS, ...)`; `interfaceParity` is
redefined per-altitude as frontmatter-block equality, exactly as the
RESEARCH recommendation anticipated. No new bridge command
(`component-promote` or similar) was built — see "No bridge verb" below.

### Where the votes come from

RESEARCH Open Question 2's resolution, stated plainly: **no judge
implementation exists in `src/` at any altitude, at either the slice or the
component altitude.** `select()` (`src/selection.ts`) takes `PairwiseVote[]`
as an input at both altitudes identically — at the component altitude,
`runSearchGeneration`'s `opts.votes` flows straight through to `select()`
unchanged, exactly the way `record-votes` supplies them at the slice
altitude. With no votes supplied, ranking falls back to `evalReward` then
lexicographic specimen id (`select()`'s own pre-existing behavior, unchanged
by this phase). This is named here as a **ceiling, not a gap**: nothing in
phase 2 needed a judge to prove REQ-18's N≥2 selection claim, since
`evalReward` alone is sufficient to rank battery-scored specimens. A future
phase that wants LLM-judged pairwise votes over agent-definition specimens
needs to wire an actual judge invocation — that wiring does not exist yet at
either altitude.

### The archive sibling

`ComponentArchiveEntry` (`src/types.ts`) is the component-altitude sibling
of `ArchiveEntry` — **`ArchiveEntry.genome` was deliberately NOT widened
into a union.** `ComponentArchiveEntry` is a structurally parallel type with
its own fields (`artifact: { slot, specimenId, definitionHash }` in place of
`genome`, plus `searchFitness`/`promotionFitness`/`searchPromotionGap`
alongside the shared `fitness`/`advantage`/`childCount`/`gates` shape), and
its own manifest path: `componentDir`/`componentManifestPath`
(`src/harness.ts`) resolve to
`.stz/60-harness/component/<slot>/MANIFEST.json` — a sibling directory next
to, never inside, the harness-genome `MANIFEST.json` at
`.stz/60-harness/MANIFEST.json`. `readComponentArchive` /
`appendComponentArchiveEntry` / `makeComponentArchiveEntry` /
`componentIncumbent` mirror the genome trio's own I/O idioms (missing file
⇒ empty list, append-order is audit sequence) without touching a line of
them — `git diff` on the genome archive functions is empty for this phase.

**The duplication is honest, not accidental**, and it is named in-source
with a `ponytail:` comment in `src/harness.ts`: two parallel archive
implementations exist (the component block and the genome trio) rather than
one parameterized store keyed by an audit-kind enum. **Upgrade trigger:** a
THIRD altitude arriving. Duplicating two small call sites now is cheaper
than building a generic abstraction for one caller (the current two-caller
state) that never exercises the flexibility a parameterized store would
buy. Until phase 3+ adds a third altitude (or a `HarnessBlueprint`-level
archive), the two siblings stay separate on purpose.

`searchPromotionGap` (the measured Goodhart bound, arXiv:2606.11045) is
derived — never accepted as a parameter — independently in two places that
both perform the identical one-line subtraction: once inside
`promoteComponentWinner` (the in-memory promotion result) and once inside
`makeComponentArchiveEntry` (the persisted entry). Sign convention: **search
minus promotion**, so a positive gap means the searched agent scored worse
held out than while being searched against — it generalizes worse, the
direction that matters for the Goodhart bound. An entry is appended on
**both** promotion verdicts (promoted and refused) — a refusal is as much an
audit record as a promotion, per REQ-21's framing that Goodharting must stay
observable even when the gate correctly refuses.

### Reflective mutation

`src/foundry/reflective-mutation.ts` is GEPA-style bounded reflective
mutation (arXiv:2507.19457). `buildReflectionTrace(run)` renders a real
`BatteryRun`'s failing checks (id, description, expected, actual —
distinguishing the no-observation sentinel from a wrong-value observation)
into a bounded trace string, truncated at a whole-line boundary under
`MAX_REFLECTION_TRACE_CHARS` (4000) with a visible `TRUNCATION_MARKER`. A
candidate whose run produced no failures gets `buildReflectionTrace(run) ===
""` and is carried forward **unmutated** to the next generation — distinct
from a candidate that needs mutation but is blocked by the budget.
`reflectMutate` is one metered `provider.chat()` call that structurally
re-attaches the parent's frontmatter block to the model's rewritten body and
refuses (`ReflectionRefusedError`) to spend a reflection on an empty trace.

`onReflection`/`initialReflection` (a small sibling FSM mirroring
`harness.ts`'s `onGeneration` `{next, action}` idiom and `escalation.ts`'s
`-1`-means-unbounded convention) is the reflection-budget cap
(`DEFAULT_REFLECTION_BUDGET = 10`). `onGeneration` (`harness.ts`, imported
and called **verbatim**, never forked) is the hard search-horizon cap
(`MAX_GENERATIONS_DEFAULT`). `runComponentTournament`'s loop drives both
every generation; **the two caps are independently exceedable**, and
exceeding either halts and surfaces via `RunComponentTournamentResult.halt:
{ source: "search-horizon" | "reflection-budget", note }` — never a silent
truncation. Mutation checks proved the two caps genuinely distinguishable,
not incidentally so: disabling either one (via a targeted mutation) did not
just fail that cap's own unit test — it flipped WHICH cap fired in
scenarios specifically constructed so only the disabled cap could plausibly
fire, and a third mutation (forcing `buildReflectionTrace` to always return
`""`) silently broke the mutation mechanism itself (no candidate is ever
mutated) and cascaded into flipping which cap fired in two loop scenarios —
the direct proof the reflection step genuinely reads the trace rather than
reflecting on nothing.

**Two ceilings, named plainly:**

1. **The reflection substrate is the check-level trace
   (`BatteryTaskResult.checks[]`) — NOT the raw candidate response text.**
   The raw text a candidate agent produced is still not plumbed out of
   `runAgentBattery` anywhere; `buildReflectionTrace` reflects only on
   structured check failures (id/description/expected/actual), never on the
   candidate's own prose. Upgrade trigger: a mutation strategy that needs
   the candidate's full response (e.g., "explain your reasoning, then try
   again") requires threading the raw text through `BatteryRun` first — not
   built, not silently skipped.
2. **`promoted`, the signal fed into `onGeneration` each generation, is a
   SEARCH-ONLY signal** — this generation's best search-half fitness beating
   the running best *within this tournament call's own loop*
   (`bestSearchFitness`, reset to `-Infinity` fresh on every
   `runComponentTournament` call), never the archived incumbent's fitness.
   Comparing against the real incumbent here would leak the held-out
   promotion set's verdict into the search FSM — exactly the leak
   D-03/CONTEXT D3 forbids. The archived incumbent only enters the picture
   once, at the promotion step, after the search loop has already halted.

`LOOP_GUARD_MAX_ITERATIONS = 20` (`component-tournament.ts`) is
belt-and-suspenders only, mirroring `escalation.ts`'s `escalationTrace`
guard — it is never the cap that fires in normal operation
(`MAX_GENERATIONS_DEFAULT` is 5); it exists solely so a deliberately
mutated (disabled) cap during a D-06 mutation check cannot hang the test
suite, and it was proven to work (a disabled `onGeneration` halt still let
the suite terminate in under 300ms).

### No bridge verb

This phase added **no bridge subcommand and no `commands/*.md`** for the
component tournament. `checkParity` against the bridge command surface is
meaningless at the component altitude (an agent-definition promotion cannot
change `BRIDGE_COMMANDS`, so there is nothing for that specific check to
diff), and a CLI entry point with no caller is unearned — nothing in this
milestone invokes `runComponentTournament` from a markdown command yet.
**Upgrade trigger:** phase 3's assembly step (`HarnessBlueprint`
construction) is the first real caller that would need a CLI or
programmatic entry point into a component tournament; that is the point at
which a bridge verb becomes earned, not before.

### What is still not built

None of the following exist in `src/` after this phase, and none may be
read as delivered by anything above:

- **`HarnessBlueprint`** — the manifest type for an assembled harness (agents
  + commands + skills + hooks + docs + battery + oracle receipt). Not
  defined anywhere in `src/types.ts` or elsewhere.
- **Deterministic assembly** — "pick the winning component per slot" with no
  search. No assembly function exists.
- **The data-ops pilot battery** — no fixture-warehouse generator, no
  dbt/data-diff oracle wiring, no data-ops task battery.
- **`src/foundry/emit.ts`** — does not exist. No `emit(blueprint, targetDir)`
  function, no `plugin.json`/`marketplace.json` generation from a blueprint.
- **Plugin/marketplace generation** from a tournament-won component set —
  not built.
- **The installer `skills/` gap** — `planInstall` (`src/installer.ts`) still
  copies `commands/` + `agents/` + `hooks/` but not `skills/`; this
  pre-existing asymmetry (noted in this document's own "Packaging" section
  above) was not touched by phases 1 or 2.
- **Harness-level evolve over domain substrates** — `src/harness.ts` still
  points at the code pilots (cron/hexcolor/ipv4); nothing repoints it at a
  domain battery. Explicitly gated on phases 1–4 showing gains, per this
  document's own phased plan.
- **The refused verticals** (RevOps / GTM / exec-strategy) remain refused;
  no forecast-mode oracle was built.
- **No vertical has been admitted, and no real domain battery exists.** What
  shipped across phases 1–2 is the machinery — the agentic eval seam, the
  split-battery Goodhart bound, GEPA-style bounded reflective mutation, the
  seventh promotion gate, the component archive — proven against offline,
  deterministic, hand-rolled test fixtures. No vertical (data-ops or
  otherwise) has run a real tournament through this machinery yet, and no
  tuned harness exists. A reader must not conclude from anything in this
  section that a working data-ops (or any other) harness has been produced;
  only the substrate that a future vertical pilot would run on top of has
  been.
