# Rev-3 pre-round ceiling probe readout — instrument-health gate, run against the real slot

## 0. What this is, and its relationship to the rev-2 probe

This is the **rev-3** instrument of `PAIRED-DESIGN-PREREG.md` §12 (the amendment frozen at
`8279159aa28885bf0f95afe59db43eceb7921746`, a strict descendant of the rev-2 freeze
`2f9e6095dc6e20bcc8196a293397f7ec07f8c704`) — same pre-round health check `CEILING-PROBE.md`
already ran and reported at rev 2, re-run under the amended pins: executor model `gpt-oss:latest`
(replacing `qwen3.6:latest`), probe seed `1610` (replacing `1399`, `CEILING_PROBE_SEED_REV3`), task
count and scoreable floor explicitly **unchanged** by §12 (10 tasks, floor 8 — reused directly from
`CEILING_PROBE_TASK_COUNT`/`CEILING_PROBE_SCOREABLE_FLOOR`, no rev-3 symbol for either). This
report is its own document, on its own artifact paths (`ceiling-probe-rev3-state.json`,
`ceiling-probe-rev3-verdict.json`); the rev-2 artifacts and `CEILING-PROBE.md` are untouched by this
plan.

## 1. What this probe measures, and what it does not

`PAIRED-DESIGN-PREREG.md` §6 Clause 1 requires at least 72 of the real 90-unit rev-3 battery's
pairing units to land with both arms scoreable before the paired comparison is judged meaningful at
all. This probe is a cheap, pre-round check of that same underlying question, against the real
inference slot, before either study arm (W or B) exists: can this instrument's extraction contract
— the three-labelled-line output format, the two closed vocabularies — be satisfied at all by the
pinned rev-3 model, under the pinned timeout and prompt bound? A format or extraction confound
caught here costs ten short requests; caught only after the real round it costs the whole 90-unit
battery, which §4's no-redraw rule forbids ever re-drawing.

**This measures whether the harness can score this instrument against this model at all — whether
responses come back in a shape the oracle can read. It is not a measurement of either arm's
accuracy and it does not predict the round's outcome.** That distinction matters more at rev 3 than
it did at rev 2: the whole reason for the executor-model swap is that `gpt-oss:latest` is
deliberately not saturating the battery (§12's own calibration-dry-run motivation, C0-C5 measured
70-100%, never 100% across the board) — a reader who confuses this probe's floor with an accuracy
expectation will misread both the probe and the round.

The probe runs a single neutral diagnostic arm — not W, not B, neither of which exists yet at this
point in the phase — in two modes against ten tickets drawn from the rev-3 probe seed
(`CEILING_PROBE_SEED_REV3`, 1610), disjoint from the rev-3 battery's own nine seeds (1601-1609) and
from every prior seed this project has consumed (§12's own 32-number prior union plus the sixteen
new 1601-1616 numbers, checked by exact set computation in `test/paired-constants.test.ts`) — the
answer-visible mode below shows a ticket's resolution verbatim, which would burn a real pairing unit
if drawn from the battery's own seed block.

- **`answer-visible`** (unchanged from rev-2) — the probe is shown the ticket's own correct
  resolution verbatim and asked only to restate it under the three required labels. This isolates
  whether the FORMAT contract is satisfiable from whether the model can solve the ticket — its
  scoreable count is what this probe's own floor gates on.
- **`normal`** — the probe sees only the ticket, exactly as a real arm would. Its result is recorded
  and reported below as an UNQUALIFIED difficulty reading, with no pass or fail attached: a
  difficulty number this early would be a corridor requirement wearing a different name, which this
  design bars at the root (D-05).

## 2. Run configuration actually captured

Captured at run time into `ceiling-probe-rev3-state.json`'s `runConfig` field, not pinned as a
design constant, then carried unchanged into `ceiling-probe-rev3-verdict.json`:

| Field | Value |
|---|---|
| Model | `gpt-oss:latest` |
| Resolved model digest (`ollama list`) | `gpt-oss:latest             17052f91a42e    13 GB     2 weeks ago` |
| Digest matches the rev-3 pin (`PAIRED_MODEL_DIGEST_REV3`) | Yes — `17052f91a42e` |
| Ollama version | `ollama version is 0.32.5` |
| Sampler parameters | none sent — no `temperature`, no `max_tokens` override; server/model default applies |
| Client concurrency | 1 (strictly sequential — no concurrency knob exists in `_ceiling-probe.ts`) |
| Task timeout bound | 3,600,000 ms (`PAIRED_TIMEOUT_MS`) |
| Prompt-character bound | 2,000 (`PAIRED_MAX_PROMPT_CHARS`) |
| Probe seed | 1,610 (`CEILING_PROBE_SEED_REV3`) |
| Task count | 10 (`CEILING_PROBE_TASK_COUNT`, unchanged from rev-2 per §12) |
| Scoreable floor (answer-visible mode) | 8 (`CEILING_PROBE_SCOREABLE_FLOOR`, unchanged from rev-2 per §12) |
| Task order | task index 0..9, `answer-visible` mode then `normal` mode within each task index — deterministic, total, stable |
| State-file path the verdict was read from | `experiments/paired-comparison-arm/ceiling-probe-rev3-state.json` |
| Launcher sole-instance confirmation | `launched OK: node=1566392 (verified sole instance tree: pids 1566380 1566392)` |

## 3. Per-task status accounting (all 20, read BEFORE any aggregate)

| Status | Count |
|---|---|
| `ok` | 20 |
| `timeout` | 0 |
| `error` | 0 |

`state.retries` (the harness-fault retry log, §6's carve-out): **empty** — zero transient
inference-slot faults fired, so zero retries were needed. No task hit the 3,600,000ms timeout
bound. All 20 results (10 tasks × 2 modes) are the harness's first and only attempt.

Per-task status was verified complete and accounted for above before either of the aggregate
figures in §4 below was read, per this project's standing rule.

## 4. Answer-visible mode — the gated accounting, integer comparison shown

| Category | Count |
|---|---|
| `no-artifact` | 0 |
| `non-scoreable` | 0 |
| `resolution-mismatch` | 3 |
| `resolution-match` | 7 |
| **scoreable (mismatch + match)** | **10** |

**Pass decision — plain integer comparison, never a rate:** `10 >= 8` (scoreable count vs
`CEILING_PROBE_SCOREABLE_FLOOR`) → **PASS**.

Unlike the rev-2 readout (10/10 matched as well as scoreable), rev-3's answer-visible mode produced
3 resolution-mismatches even though the correct resolution was shown verbatim — every one of the 3
is a format/vocabulary near-miss consistent with §12's own C6 finding, not an arithmetic error: task
2's answer-visible response used a non-ASCII hyphen (`escalation‑repeat‑defect` with U+2011
non-breaking hyphens, and the wrong verb `escalation-` for `elevate-`) against the correct action
`elevate-repeat-defect`; tasks 4 and 5 both stated `elevate-repeat-defect`/`category: product-quality`
correctly but supplied the wrong `parameter` value (the item name shown in the ticket text rather
than the resolution's own item name) despite the resolution being shown verbatim in the same
message. All three still produced a scoreable, three-labelled response — the FORMAT contract held in
every one of the 20 attempts (0 `no-artifact`, 0 `non-scoreable` in this mode) — the mismatches are
what the oracle's exact-match scoring correctly flags as wrong, not a harness failure.

## 5. Normal mode — an unqualified reading, no pass or fail attached

| Category | Count |
|---|---|
| `no-artifact` | 0 |
| `non-scoreable` | 3 |
| `resolution-mismatch` | 5 |
| `resolution-match` | 2 |
| scoreable (mismatch + match) | 7 |

This is reported as a plain count, not a gate. Of the ten normal-mode attempts: 2 matched the
ticket's true resolution outright; 5 produced a scoreable but mismatched response; 3 produced a
`non-scoreable` response (a labelled response the oracle could not extract cleanly — e.g. commas
inside the three-label line rather than the required per-line format). No pass/fail attaches to this
number, and no downstream plan may read it as a difficulty corridor (D-05); it is recorded here only
because the design requires it recorded, not because it gates anything.

## 6. Per-unit records (all 20, from `ceiling-probe-rev3-state.json`)

| task | mode | status | oracle category | score | wall ms |
|---|---|---|---|---|---|
| 0 | answer-visible | ok | resolution-match | 1 | 8,667 |
| 0 | normal | ok | resolution-mismatch | 0 | 7,766 |
| 1 | answer-visible | ok | resolution-match | 1 | 2,817 |
| 1 | normal | ok | resolution-mismatch | 0 | 20,488 |
| 2 | answer-visible | ok | resolution-mismatch | 0 | 6,357 |
| 2 | normal | ok | non-scoreable | 0 | 7,505 |
| 3 | answer-visible | ok | resolution-match | 1 | 2,641 |
| 3 | normal | ok | resolution-mismatch | 0 | 3,978 |
| 4 | answer-visible | ok | resolution-mismatch | 0 | 2,903 |
| 4 | normal | ok | resolution-mismatch | 0 | 4,198 |
| 5 | answer-visible | ok | resolution-mismatch | 0 | 3,825 |
| 5 | normal | ok | non-scoreable | 0 | 4,072 |
| 6 | answer-visible | ok | resolution-match | 1 | 3,888 |
| 6 | normal | ok | resolution-mismatch | 0 | 8,785 |
| 7 | answer-visible | ok | resolution-match | 1 | 7,305 |
| 7 | normal | ok | resolution-match | 1 | 10,742 |
| 8 | answer-visible | ok | resolution-match | 1 | 3,371 |
| 8 | normal | ok | non-scoreable | 0 | 3,302 |
| 9 | answer-visible | ok | resolution-match | 1 | 2,676 |
| 9 | normal | ok | resolution-match | 1 | 6,736 |

## 7. Verdict — CLEARED

The rev-3 instrument has cleared its own pre-round health gate against the real slot: `10 >= 8`, the
answer-visible mode's scoreable count against the pinned floor, evaluated by plain integer
comparison. `ceiling-probe-rev3-verdict.json` carries `complete: true` and `pass: true`, and this
readout is drawn from that completed artifact and from nothing else — never from a log tail, never
from elapsed time.

**This pre-round probe supplements the full battery's own health clause; it does not replace it.**
§6 Clause 1 proper — at least 72 of the real 90-unit rev-3 battery's pairing units landing with BOTH
arms scoreable — is still evaluated independently by the paired-round driver over the real W and B
arms once they exist, and it can still terminate the study at that point regardless of what this
probe found. This probe is a cheap format-confound catch on a single neutral diagnostic arm, run
once before either real arm exists; it is not a substitute for, and does not pre-empt, Clause 1's
own evaluation over the full battery.

**The gate is PASSED. The phase proceeds to the search (the next plan, building W over the rev-3
seeds).** Because the probe passed, none of the failure-branch remedies apply — no floor was
lowered, no mode was changed, no seed was changed, and nothing was re-run for a better draw; those
remedies are recorded here as explicitly not taken because they were never needed, not because they
were considered and rejected under pressure.

## 8. One-shot / no-redraw and post-freeze-ancestry compliance

The probe's ten tickets were drawn from `CEILING_PROBE_SEED_REV3` (1610) only — disjoint from the
rev-3 battery's own nine pinned seeds (1601-1609) and from every seed this project has ever consumed
(the full 32-number prior union plus the sixteen new 1601-1616 numbers, `test/paired-constants.test.ts`)
— so no pairing unit the real 90-unit round will draw was seen, verbatim-resolution-and-all, by this
probe.

`PAIRED-DESIGN-PREREG.md` §12 is byte-unchanged since its freeze commit
(`8279159aa28885bf0f95afe59db43eceb7921746`), a strict descendant of the rev-2 freeze
(`2f9e6095dc6e20bcc8196a293397f7ec07f8c704`), and that freeze commit is a strict ancestor of the
commit carrying this probe's own artifacts (`git merge-base --is-ancestor
8279159aa28885bf0f95afe59db43eceb7921746 HEAD` exits 0) — proving this run happened after the
freeze, not against a draft.
