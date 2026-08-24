# Collaborative-round calibration probe readout — real per-call latency and structural-validity measurement against the pinned model

## 0. What this probe was, and why it exists

Before this probe ran, no real per-call latency figure existed for the
collaborative runner's builder/answerer roles against the D-13 pinned model.
Phase 22's live smoke (`test/collaborative-runner-live-smoke.test.ts`,
22-04) measured real neighbourhood-extraction (~9.6-9.7s) and real scoring
(~9.3s) wall times, but its provider double is a scripted stub — its
recorded timings cover only the Python-side neighbourhood and scoring calls,
never a real LLM round trip through Ollama for either the builder or the
answerer role. Choosing the powered round's per-call ceiling from that smoke,
or from any other unmeasured guess, risks turning every real call into a
false timeout, corrupting the very comparison the ablation gate depends on
(D-03, D-16).

This probe (`_collab-probe.ts`, D-03) ran each of the three seeded
builder/answerer pairs on 10 selection-pool queries each (30 units total)
against the real local inference slot, through the same collaborative-runner
code path Plan 07's round driver uses, checkpointed per unit, launched
through this directory's sole-instance launcher. It draws only from the
selection pool; the sealed heldout suite is untouched.

## 1. Run configuration (transcribed from `collab-probe-verdict.json`'s `runConfig`)

| Field | Value |
|---|---|
| Repository commit recorded in `runConfig` | `e68de5be59ddda82c0670e61b1d31ae4181fe154` |
| Pair-file commit | `3a1e80981af5d2b56c10ac19e6af84110e767020` |
| Model | `gpt-oss:latest` |
| Model digest (pinned, D-13) | `17052f91a42e` |
| Base URL | `http://localhost:11434/v1` |
| Sample size (per pair) | 10 |
| Concurrency | 1 |
| Gate threshold | 0.01 |
| Started at | `2026-08-23T06:11:13.711Z` |

**Provenance note — the recorded `repositoryCommit` is not the only commit the completed units ran under.** `runConfig` is captured once, when the state file is first created, and is preserved unchanged by the checkpoint across every subsequent relaunch. This run's state file was first created at commit `e68de5b` (launch attempt 4). Between that launch and the run's completion, six further Rule-1/Rule-2 fixes landed on `main` while the probe was paused between relaunches (all documented in `23-06-SUMMARY.md`'s Deviations section and `deferred-items.md`):

- `9b6845d` — catch the KB-neighbourhood refusal (FA-7 empty seed) instead of crashing.
- `d143c8f` — raise `spawnSync`'s `maxBuffer` for the neighbourhood/scoring children (the fix for the 2,168,562-byte query-1528 neighbourhood that SIGTERM'd every earlier relaunch).
- `a9988fa` — add `classifyBuilderArtifactFailure` and the per-unit `handoffFailureKinds`/`handoffFailureDetail` fields.
- `cbfb9cd` — export `runOneUnit` (no behaviour change), used for the live query-97 re-diagnosis in §6.

Concretely: pair `cd79c7867f6b28cc`'s first 9 units (queries 97, 131, 482, 586, 843, 1040, 1199, 1297, 1384) were checkpointed **before** `d143c8f`/`a9988fa` landed — this is why only 1 of that pair's 10 units carries a `handoffFailureKinds` entry (unit 10, query 1528, recorded after the fix). Every unit for pairs `2ae32511d7b45fb3` and `b1534c69c00e8d08` was recorded **after** all six fixes, at `HEAD = cbfb9cd`, which is also the commit this note and the run's committed artifacts land on. No fix changed the pair prompts (D-02 froze those at `3a1e809`) or the model pinned; the fixes only changed how the harness classifies and survives a failed handoff, so the run's measured latency and structural-validity numbers are not contaminated by any of the six fixes — they measure the same real model behaviour throughout.

## 2. Measurements — raw recorded figures, per pair and overall

These are the raw millisecond figures transcribed directly from `collab-probe-verdict.json`; no figure below is re-derived from a rounded intermediate.

### Overall (30 units)

| Metric | Value |
|---|---|
| Unit count | 30 |
| Outcome tally | `all-handoffs-failed-battery-refused`: 27, `neighbourhood-refused`: 3 |
| Structural validity | 0 / 30 |
| Wall ms (min / median / max) | 22,861 / 118,567 / 375,305 |

### Overall `handoffFailureKindCounts`

Recorded **only** on units run after commit `a9988fa` (21 of the 30 units — the 9 pre-existing pair-1 units checkpointed before that commit carry no classification, per §1's provenance note).

| Kind | Count |
|---|---|
| `artifact-absent` | 9 |
| `cd05-violation` | 8 |
| `unparseable` | 2 |
| `neighbourhood-refused` | 2 |

### Per pair

| Pair | File | Units | Outcome tally | Structural validity | Wall ms (min / median / max) | `handoffFailureKindCounts` |
|---|---|---|---|---|---|---|
| `cd79c7867f6b28cc` | `_pair-conservative-prune.md` | 10 | all-handoffs-failed: 9, neighbourhood-refused: 1 | 0 / 10 | 23,118 / 100,204.5 / 236,591 | `unparseable`: 1 |
| `2ae32511d7b45fb3` | `_pair-relation-focused.md` | 10 | all-handoffs-failed: 9, neighbourhood-refused: 1 | 0 / 10 | 22,861 / 135,220 / 254,390 | `artifact-absent`: 4, `cd05-violation`: 4, `neighbourhood-refused`: 1, `unparseable`: 1 |
| `b1534c69c00e8d08` | `_pair-breadth.md` | 10 | all-handoffs-failed: 9, neighbourhood-refused: 1 | 0 / 10 | 22,920 / 113,434 / 375,305 | `artifact-absent`: 5, `cd05-violation`: 4, `neighbourhood-refused`: 1 |

**Note on the wall-time mix:** these order statistics include failed-unit `wallMs` values (typically shorter than a hypothetical full-success unit would be), which can pull `min`/`median` downward but cannot inflate `max` — the overall `max` (375,305 ms, pair `b1534c69c00e8d08`) is a real observed unit wall time regardless of that unit's outcome. §3's ceiling derives from this maximum, so the derivation is unaffected by the mix.

### Live query-97 re-diagnosis (not part of the checkpointed 30 units — a separate, additional live re-measurement)

During this plan's execution, one already-checkpointed miss (pair `cd79c7867f6b28cc`, query 97) was re-run live, twice, with the post-`a9988fa` diagnostics active, to establish whether the miss was a harness bug or a genuine model behaviour. Both calls (`wallMs` 102,775 and 46,557) classified as `artifact-absent`. The second call's raw builder response, captured verbatim via a logging shim around the provider (no change to `_collab-probe.ts` or `runOneUnit`):

> "I'm sorry, but the full neighbourhood data you provided is far too large for me to enumerate completely in this response."

This is a **genuine model refusal**, not a harness or JSON-envelope bug: `gpt-oss:latest` received the builder prompt (which embeds the full pre-extracted neighbourhood, up to 400 nodes) and declined to attempt producing a subgraph at all, so no fenced `path=subgraph.json` block was ever emitted and the harness correctly found nothing to write.

## 3. Derived per-call ceiling

**Rule:** 4x the observed maximum unit wall time (375,305 ms), rounded up to a whole number of minutes, floored at a generous 20-minute lower bound so a slow tail cannot manufacture a false timeout. The 4x multiple is deliberately generous because the ceiling bounds a single LLM call (per D-16), while the unit wall time it is derived from already includes a preflight warm-up call plus the builder call (and, for a surviving unit, the answerer call and scoring) — so 4x the whole unit's observed maximum is a wide margin above any single call within it.

- 4 x 375,305 ms = 1,501,220 ms = 25.02 minutes.
- Rounded up to a whole minute: **26 minutes**.
- 26 minutes clears the 20-minute floor (the floor does not bind here), and lands within D-16's stated order of 20-30 minutes.

**Resulting value: 1,560,000 ms (26 minutes).**

This is the value Plan 08 supplies to the round driver as the required `COLLAB_ROUND_CEILING_MS`-shaped input (per Plan 07's `requireEnv`-guarded contract). It lives here and, from Plan 08 onward, in the round's own recorded `runConfig` — never as a constant in any source file (Plan 07's `_collab-round.ts` refuses to start without this value supplied as an environment input).

## 4. Projected wall-clock for the powered round

This is a **projection for operator planning only — it is not a gate.** Nothing in the round driver reads this file.

- Selection round: derived from the selection pool's split, roughly 113 units.
- Heldout round (only for the promoted winner, D-04): 150 units (75 heldout queries x 2 arms, D-06 per-query interleaving).
- Per-call preflight overhead: the probe's own unit wall times already include one preflight warm-up call per unit (the single-task-per-call interleaving choice Plan 07 records), so this overhead is already baked into the median used below — no separate addition is needed.
- Using the probe's overall median unit wall time (118,567 ms = ~118.6 s) as the per-unit planning figure:
  - Selection round: 113 x 118.6 s = ~13,398 s = **~3.7 hours**.
  - Heldout round: 150 x 118.6 s = ~17,785 s = **~4.9 hours**.
  - Combined (if the heldout round runs at all): **~8.7 hours** of real inference-slot time.

Tractable on this machine as continuous slot time, but long enough that the D-12 promotion-refusal path (see §5) will likely stop the round before the heldout round is ever reached.

## 5. Operator advice

**No pair produced a single structurally valid builder artifact across all 30 units (0/30 overall, 0/10 per pair).** Every pair failed on every unit. The failure modes differ meaningfully by pair and are not uniform:

- `cd79c7867f6b28cc` (conservative-prune): mostly unclassified (9/10 units predate the diagnostic feature), but the one live-classified unit was `unparseable` (a JS-style `//` comment embedded in the fenced JSON block), and the separate live re-diagnosis of query 97 (§2) shows this pair's builder sometimes refuses outright when it judges the pre-extracted neighbourhood too large to enumerate.
- `2ae32511d7b45fb3` (relation-focused) and `b1534c69c00e8d08` (breadth): a genuine mix of `artifact-absent` (the builder wrote nothing) and `cd05-violation` (the builder wrote a structurally invalid subgraph — disconnected nodes, fabricated edges, below the minimum node count), plus one `neighbourhood-refused` (FA-7 empty seed, deterministic, unrelated to model behaviour) each.

No repeated harness fault appears in `state.retries` (empty in the completed verdict) — the two mechanical faults this plan's execution found and fixed (the model-pin fallthrough and the `maxBuffer` overrun) were both fixed in `src/`/the probe script before any of the 30 completed units were recorded, so none of the 30 recorded misses are harness artifacts of either bug. The misses that are classified are real: either the builder produced nothing, produced something structurally invalid, produced something unparseable, or (for the `neighbourhood-refused` outcome) the query's KB neighbourhood had no matching seed entity at all.

## 6. Advice, not a gate

This note is advice the operator reads before choosing the round's per-call ceiling and before deciding whether to launch the powered round at all. **Nothing in the round driver reads this file or the probe's artifacts (`collab-probe-verdict.json`, `collab-probe-state.json`).** The round's entry conditions remain exactly the frozen ones (D-03's boundary); the 0/30 structural-validity finding above is reported for Plan 08's go/no-go decision, not wired into it — Plan 08 evaluates the real round's own entry conditions independently, and a likely outcome given this probe's finding is a D-12 promotion refusal once the selection round runs its own structural-validity accounting over the real, larger query set.

---

## Addendum: re-run under the capped renderer (2026-08-24)

The original probe above ran BEFORE the Phase 23-08 prompt-budget fix
(`dc786f4`/`1af4571`): the ollama journal for its boot shows `truncating
input prompt` lines, so every builder measurement above was taken on
prompts the model saw only a truncated tail of. Per the operator's
directive the probe re-ran under the capped renderer before any round
relaunch decision.

**Re-run configuration:** same launcher, same pinned pairs commit
`3a1e80981af5d2b56c10ac19e6af84110e767020` (verified byte-identical at
re-run HEAD), same model `gpt-oss:latest` (`17052f91a42e`), sample size
10 × 3 pairs, repository commit `5e1754381768e2efd1610fe8e799fcbc44894d4f`,
started 2026-08-24T01:45:01Z, finished 02:13Z. Host telemetry sidecar ran
throughout; no host instability.

**Field acceptance of the fix: PASSED.** Zero `truncating input prompt`
lines in the ollama journal across the entire re-run (checked live via a
journal follow and again post-completion over the full window). Median
per-unit wall time fell from 118,567 ms to 54,858 ms (max 375,305 →
137,574 ms) — consistent with prompts that no longer carry a ~65k-token
truncated prefill.

**Merit result: structural validity is 0/30 AGAIN — now on intact
prompts.** Failure mix (per-task handoff kinds): `artifact-absent` 17,
`schema-invalid` 7, `cd05-violation` 3, `neighbourhood-refused` 3. All
three pairs 0/10. No retries.

**Reading.** The original 0/30 is now decontaminated: it was NOT an
artifact of truncation. `gpt-oss:latest` fails to emit a structurally
valid subgraph artifact even when it sees the full task prompt, node list
and capped edge list. The 23-07 go/no-go therefore stands on real
evidence: the powered round was NOT relaunched — a graph arm measured at
0/30 would burn the sealed heldout suite on a candidate known to produce
an all-miss arm. Paths forward (operator decision): a different builder
model, iterated pair prompts re-probed under this same protocol, or
accepting the no-go as this study's result.
