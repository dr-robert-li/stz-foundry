# HANDOFF — the phase-5 gate arm

**Written:** 2026-07-30 · **Purpose:** resume the phase-5 gate cold in a fresh session.
Everything needed is here or pointed at from here.

---

## ✅ SUPERSEDED — the gate was run, 2026-07-31. Read `PILOT-RESULTS.md` first.

The §5 action below was executed, then extended to the full pre-registered seed
list. **Outcome: GATE NOT MET.** `qwen3.6` lands in the band, but the three arms
are statistically indistinguishable (spread 0.111 vs SE 0.137) and their rank
order reverses between seeds. **No tournament was run**; phase 5 stays gated and
the actionable work is a phase-3 battery revision.

Two things below are now known to be wrong, kept visible because they misled:

- **§5's `~2.7h` and its implied single-seed read.** One seed is not enough —
  seed 7 alone showed spread 0.500 with the gradient *inverted*, and seeds
  42+1234 showed 0.417 with it correct. Both were noise. Only the pooled figure
  is interpretable.
- **§5 step 4's timeout.** The `taskTimeoutMs` used must be ≥ 3600000 for
  `qwen3.6`. A 1200000 cap silently kills `s0-minimal` tasks and reports the
  kills as a capability floor (`PILOT-RESULTS.md`, defect 1).

The rest of this file stands as the record of why the ordering mattered.

---

## ⛔ READ THIS FIRST — do NOT start the tournament

The instruction that produced this handoff was *"kick off the tournament."*
**Do not do that yet.** One cheap step comes first, and skipping it would
manufacture exactly the failure this whole milestone was built to prevent.

**The tournament must not run until the discriminating band is established.**
Selecting agent definitions on a battery that every candidate passes (or fails)
produces a "winner" that reflects noise, not competence — a fabricated gain, the
α→0 negative at the altitude the design is most careful about.

Order is: **reduced separation gate → read the spread → only then, maybe, a tournament.**

---

## 1. Repo state

- **Branch:** `main`, clean, `== origin/main`, pushed. Only untracked path is
  `.tokensave/` (pre-existing, unrelated — leave it).
- **Version:** `1.20.0`, synced across `package.json` + both `.claude-plugin/*.json`.
- **Suite:** 745 tests green, `npm run typecheck` clean, ~3.6s.
- **Item 8 status:** phases 1–4 **built**; **phase 5 gated and unbuilt** — correctly
  so, and `docs/ROADMAP.md` says exactly that. Do not mark phase 5 anything until
  the gate is decided.
- **Relevant commits:** `3361b42` (prereg), `7b46b20` (interim results).

## 2. What the phase-5 gate is

`docs/ROADMAP.md` item 8 phase 5 (harness-level evolve) is **explicitly gated on
phases 1–4 showing gains**. The machinery is built, but **no tournament has ever
been run against a real battery**, so the gate's input does not exist. This arm
supplies it.

The decision rule, the null conditions, and the model-escalation list were all
**pre-registered before any blind data** — `PREREG.md`, commit `3361b42`. Read it
before running anything. Do not rewrite it; results go in `PILOT-RESULTS.md`.

## 3. What is already established

| finding | status |
|---|---|
| Instrument (battery → artifact → checks) is sound | **verified**, not assumed |
| `granite4.1:30b` (configured default) floor-saturates | **0.000**, spread 0.000 across 3 prompt arms × 3 seeds |
| `qwen3.6:latest` solves a task **exactly** (`15 / 744035`) | **confirmed**, n=1 |
| `nemotron3:33b` | **unusable** — 3220s → unparseable |
| Scoring is non-deterministic run-to-run | confirmed (`16/1394844` then `14/1445438`) |

**A correction is on the record:** the interim read during the run was that floor
saturation would prove *structural* — that no local model could grade this battery.
`qwen3.6`'s exact hit **disproves** that. Do not carry the old belief forward.

## 4. The one open question

**Does `qwen3.6:latest` land in the discriminating band `0 < rate < 1`?**

- **spread > 0** → a gradient exists → a tournament is justified.
- **spread ≈ 0 at the ceiling** (~1.000 regardless of prompt quality) → **gate NOT
  MET**, same as the floor case: nothing to select on. This is the recall-saturation
  null that five of this repo's six prior arms hit (`../EXPERIMENT-SUMMARY.md`).

Current evidence is **n=1** (one task, one seed, one prompt). That is not evidence
about the band.

## 5. Next action — the reduced separation gate

**Cost: ~2.7h wall-clock, unattended. Local Ollama only — genuinely $0, no API spend.**
(`qwen3.6` runs ~541s/task; 3 prompts × 1 seed × 6 tasks = 18 calls.)

1. Confirm Ollama is up and has `qwen3.6:latest`:
   ```
   ollama list
   ```
2. Point `_separation.ts` at `qwen3.6:latest`. It currently uses the configured
   default (`granite4.1:30b`) via `resolveProviderSelection`. Pass an explicit
   provider through `runAgentBattery`'s options — see `_modelsweep.ts`, which
   already does exactly this, for the shape.
3. Reduce `SEEDS` to a single seed (`[7]`) for the reduced gate. Keep all three
   prompt arms — the spread *between arms* is the entire measurement.
4. Run **detached**, not in the foreground; a 10-minute tool timeout will kill it:
   ```
   nohup ./node_modules/.bin/tsx experiments/dataops-agent-pilot/_separation.ts \
     > experiments/dataops-agent-pilot/sepgate-qwen.log 2>&1 &
   ```
5. Poll the log. The script prints a SPREAD line and its own verdict at the end.

## 6. What to do with each outcome

**spread ≈ 0 (ceiling-saturated) → GATE NOT MET.**
Record it in `PILOT-RESULTS.md`. Phase 5 stays gated. The actionable work is a
**phase-3 battery revision, not a phase-5 build**:
- graded / partial-credit checks instead of exact-integer equality on a 6-digit
  `revenueCents` (the landscape is sparse by construction — a near-miss and a wild
  miss both score 0, so there is almost no gradient);
- less prescriptive task prompts — `buildTasks` currently spells out dedup, all
  three amount formats, the backup column, all three date formats and the filter,
  which is most of what a good agent definition would say, leaving the evolved
  system prompt little headroom;
- something to damp the run-to-run scoring noise.

**spread > 0 → band exists → the tournament is justified.**
Design it against `PREREG.md` §3's decision rule:
- baseline `B` vs tournament winner `W`, both scored on the **held-out promotion
  set** (never hill-climbed against — enforced structurally by `SplitBattery`);
- ≥3 seeds;
- record the search→promotion gap. **A win on search that vanishes on promotion is
  Goodharting and counts as NOT met**, not as a partial win;
- budget days of wall-clock, not hours. Schedule it as a long-running detached job.

## 7. Traps

- **Do not run the tournament on a saturated battery.** §0. This is the whole point.
- **Do not shop for models.** The escalation list is fixed in `PREREG.md` §2:
  `granite4.1:30b`, `nemotron3:33b`, `qwen3.6:latest`. `wp-judge-v4` is a *judge*
  model and must not be used as a candidate — that confuses the altitudes.
- **Do not rewrite `PREREG.md`.** Its git commit is its timestamp; rewriting it
  destroys the pre-registration's entire value. Results go in `PILOT-RESULTS.md`.
- **Do not treat a null as failure.** A null keeps phase 5 correctly gated and
  redirects effort to the battery. That is a real result and the repo's own
  `EXPERIMENT-SUMMARY.md` is built on exactly such findings.
- **Do not run inference in the foreground.** Tool calls cap at 10 minutes;
  `qwen3.6` needs ~9 minutes *per task*.
- **`_separation.ts` and `_modelsweep.ts` are committed** — extend them rather
  than writing new scripts, so the reproduce instructions stay true.

## 8. Files

| file | what |
|---|---|
| `PREREG.md` | decision rule + nulls, fixed before blind data. **Authoritative.** |
| `PILOT-RESULTS.md` | interim findings, the correction, cost table, recommended next move |
| `_separation.ts` | the separation gate (3 prompt arms × seeds) |
| `_modelsweep.ts` | single-task model comparison; shows the explicit-provider idiom |
| `_probe.ts` | raw model response vs expected — how instrument validity was checked |
| `sweep.log` | the recorded model-sweep output |
| `../EXPERIMENT-SUMMARY.md` | the repo's prior: six arms, broad competency positive not obtainable |
