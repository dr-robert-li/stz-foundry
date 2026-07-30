# PRE-REGISTRATION — the phase-5 gate arm (data-ops agent tournament)

**Status:** committed BEFORE any blind tournament specimen is generated (the git
commit is the timestamp). Methodology follows `../wsample-pilot/PREREG.md`; this
file states what differs, plus the separation gate, the decision rule, and the null.

## 0. Why this arm exists

`docs/ROADMAP.md` item 8 phase 5 (harness-level evolve) is **explicitly gated on
phases 1–4 showing gains**. Phases 1–4 shipped in 1.18.0–1.20.0: the agentic eval
seam, component tournaments over agent definitions, a real exogenous data-ops
battery, and blueprint/emit. But **no tournament has ever been run against a real
battery** — so the gate's input does not exist. Every `docs/` claim to date has
been careful to say so.

This arm supplies that input. It asks one question:

> Does searching over **agent-definition prompt text**, selected on a held-out
> promotion set of a real exogenous battery, produce a candidate that beats the
> baseline — i.e. is there a gain for phase 5 to build on?

The repo's own prior is discouraging and must be stated up front:
`experiments/EXPERIMENT-SUMMARY.md` records that across six arms and five
substrates, the broad competency positive was **not obtainable** with a
homogeneous pool of capable blind implementers, and that the reason was
*structural, not bad luck*. This arm is at a different altitude (prompt text
scored by an exogenous constructed oracle, not code scored by a sealed suite), so
it is not the same claim — but a null here would be consistent with that prior,
not a surprise, and will be reported as such.

## 1. Separation gate (run BEFORE any tournament; touches no blind data)

A tournament can only select if the battery **discriminates**. If every prompt
scores the same, there is no gradient and the search is measuring noise.

Three system prompts of deliberately different quality, three seeds (7, 42, 1234),
6 tasks per battery, `granite4.1:30b` (the repo's configured default), local Ollama:

| arm | mean testPassRate |
|---|---|
| `s0-minimal` ("You are a helpful assistant.") | **0.000** |
| `s1-plausible` (generic careful-analyst framing) | **0.000** |
| `s2-strong` (explicit 5-step methodology) | **0.000** |

**SPREAD = 0.000 — floor saturation.**

### The instrument is NOT broken — checked, not assumed

A measurement pinned at 0 is as uninformative as one pinned at 1, and the first
suspicion must be harness fault. It is not. A raw probe of the model's response
returns **perfectly well-formed output in exactly the required shape and path**:

```json
{ "totals": { "cust-1105__2026-09": { "orderCount": 16, "revenueCents": 1394844 } } }
```

against an expected `orderCount=15, revenueCents=744035`. Artifact extraction,
the `json-invariant` path resolution, and check evaluation all work correctly.
The model simply gets the arithmetic wrong: one duplicate row not removed, and a
revenue figure ~1.87× high (consistent with mis-parsing bare-cents values as
dollars).

So the floor is a **genuine capability result at this model tier**, not an
instrument fault.

### Two structural observations this forces

1. **The fitness landscape is sparse by construction.** Every check is
   exact-integer equality on a 6-digit `revenueCents`. There is no partial
   credit: a near-miss and a wild miss both score 0. Hill-climbing needs a
   gradient, and exact-match on a 6-digit integer supplies almost none.
2. **The task prompt already carries the methodology.** `buildTasks` spells out
   dedup, the three amount formats, the backup column, the three date formats,
   and the filter. That is most of what a "good" agent definition would say —
   so the *system prompt*, which is the thing a tournament evolves, has little
   headroom to add. This is a property of the phase-1 battery design, discovered
   here, and it is reported whether or not it is convenient.

## 2. Model escalation (pre-registered, not post-hoc shopping)

Escalating model tier is legitimate **only** because the separation gate failed
at the floor, and the design itself predicted this: CONTEXT D3 of phase 1 records
"a small local model is a weaker candidate agent than production" as an accepted
trade. Escalation is declared here, before the tournament, with a fixed list —
not "try models until one splits".

Candidates (all local, $0): `granite4.1:30b` (done, 0.000), `nemotron3:33b`,
`qwen3.6:latest`. `wp-judge-v4` is excluded — it is a judge model, and using a
judge as a candidate would confuse the altitudes.

**The band that matters is `0 < rate < 1`.** A model at 0.000 has no gradient; a
model at 1.000 is recall-saturated. Only the middle admits selection.

## 3. Decision rule + null

Let `B` = baseline agent definition, `W` = tournament winner after bounded
GEPA-style reflective search on the **search set**, both scored on the **held-out
promotion set**.

- **GATE MET (phase 5 unblocked)** iff `W_promotion > B_promotion` on a battery
  whose separation gate showed `0 < rate < 1`, across ≥3 seeds, with the
  search→promotion gap recorded and not pathological (a win on search that
  vanishes on promotion is Goodharting, and counts as NOT met).
- **GATE NOT MET (phase 5 stays gated)** if any of:
  - **no model in the escalation list lands in the discriminating band** — the
    battery cannot grade candidates at any locally-available tier, so there is no
    signal to evolve on. This is the leading hypothesis given §1.
  - `W_promotion ≤ B_promotion` — search produced no transferable gain.
  - `W_search > B_search` but `W_promotion ≤ B_promotion` — measured Goodharting,
    which is a *negative* for phase 5, not a positive.
- **The outcome is reported whatever it is.** A null keeps phase 5 correctly
  gated, which is a real and useful result: it says the machinery is built and
  honest but has not yet earned the next rung. No substrate shopping beyond the
  declared model list; no re-running until a seed cooperates.

## 4. Discipline

Held-out promotion set never used for hill-climbing (enforced structurally in
`src/foundry/battery-types.ts`'s `SplitBattery` and proven behaviourally in
`test/foundry-component-tournament.test.ts`). Bounded reflection budget and hard
horizon cap (`src/foundry/reflective-mutation.ts`). Seeded, deterministic battery
generation. Local inference only — $0, no API spend. N6 replay from the recorded
seeds and prompts.

**Cost note:** every run in this arm is local Ollama. Per the project's standing
billing rule, that is genuinely $0 — no Anthropic API spend is incurred by this
experiment.
