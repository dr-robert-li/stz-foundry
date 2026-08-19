# Pre-round ceiling probe readout — instrument-health gate, run against the real slot

## 0. Override framing

This probe, and the whole instrument it belongs to, executes under the 2026-08-11 human
override by Dr. Robert Li as v1.25.0 follow-on work. It is not a Stage-B trigger outcome, not a
retroactive pass of the gate that recorded NOT-MET (`20*(19-17)=40 < 3*24=72`,
`experiments/dualfix-study/STUDY-RESULTS.md`), and not a continuation of milestone v1.24.0, whose
terminal record stays untouched and read-only. Phases 13/14 exist only because Dr. Li explicitly
directed reopening them, overriding the VOID-BY-RULE closure the Stage-B miss would otherwise have
produced — this document states that plainly, in its own words, rather than as a footnote.

## 1. What this probe is, and why a health bar precedes any difficulty reading

`PAIRED-DESIGN-PREREG.md` rev 2 §6 Clause 1 requires at least 48 of the real 60-unit battery's
pairing units to land with both arms scoreable before the paired comparison is judged meaningful at
all — a design that cannot clear its own health bar cannot distinguish a real loss from an
unparseable answer. This probe is a cheap, pre-round check of that same underlying question,
against the real inference slot, before either study arm (W or B) exists: can this instrument's
extraction contract — the three-labelled-line output format, the two closed vocabularies — be
satisfied at all by the pinned model, under the pinned timeout and prompt bound? A format or
extraction confound caught here costs ten short requests; caught only after the real round it costs
the whole 60-unit battery, which the frozen design's no-redraw rule (§4) forbids ever re-drawing.

The probe runs a single neutral diagnostic arm — not W, not B, neither of which is built yet — in
two modes against ten tickets drawn from the probe seed (`CEILING_PROBE_SEED`, 1399), disjoint from
the paired battery's own six seeds (1301-1306) per §4's no-redraw rule: the answer-visible mode
below shows a ticket's resolution verbatim, which would burn a real pairing unit if drawn from the
battery's own seed block.

- **`answer-visible`** — the probe is shown the ticket's own correct resolution verbatim and asked
  only to restate it under the three required labels. This isolates whether the FORMAT contract is
  satisfiable from whether the model can solve the ticket — its scoreable count is what this probe's
  own floor gates on.
- **`normal`** — the probe sees only the ticket, exactly as a real arm would. Its result is recorded
  and reported below as an UNQUALIFIED difficulty reading, with no pass or fail attached: a
  difficulty number this early would be a corridor requirement wearing a different name, which this
  design bars at the root (D-05).

## 2. Run configuration actually captured

Captured at run time into `ceiling-probe-state.json`'s `runConfig` field, not pinned as a design
constant, then carried unchanged into `ceiling-probe-verdict.json`:

| Field | Value |
|---|---|
| Model | `qwen3.6:latest` |
| Resolved model digest (`ollama list`) | `qwen3.6:latest             07d35212591f    23 GB     4 months ago` |
| Ollama version | `ollama version is 0.32.5` |
| Sampler parameters | none sent — no `temperature`, no `max_tokens` override; server/model default applies |
| Client concurrency | 1 (strictly sequential — no concurrency knob exists in `_ceiling-probe.ts`) |
| Task timeout bound | 3,600,000 ms (`PAIRED_TIMEOUT_MS`) |
| Prompt-character bound | 2000 (`PAIRED_MAX_PROMPT_CHARS`) |
| Probe seed | 1399 (`CEILING_PROBE_SEED`) |
| Task count | 10 (`CEILING_PROBE_TASK_COUNT`) |
| Scoreable floor (answer-visible mode) | 8 (`CEILING_PROBE_SCOREABLE_FLOOR`) |
| Task order | task index 0..9, `answer-visible` mode then `normal` mode within each task index — deterministic, total, stable |
| State-file path the verdict was read from | `experiments/paired-comparison-arm/ceiling-probe-state.json` |
| Launcher sole-instance confirmation | `launched OK: node=680505 (verified sole instance tree: pids 680493 680505)` |

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
| `resolution-mismatch` | 0 |
| `resolution-match` | 10 |
| **scoreable (mismatch + match)** | **10** |

**Pass decision — plain integer comparison, never a rate:** `10 >= 8` (scoreable count vs
`CEILING_PROBE_SCOREABLE_FLOOR`) → **PASS**.

## 5. Normal mode — an unqualified reading, no pass or fail attached

| Category | Count |
|---|---|
| `no-artifact` | 0 |
| `non-scoreable` | 0 |
| `resolution-mismatch` | 10 |
| `resolution-match` | 0 |
| scoreable (mismatch + match) | 10 |

This is reported as a plain count, not a gate: every one of the ten normal-mode attempts produced a
scoreable, labelled response (the format contract held even without the answer shown), and every one
mismatched the ticket's true resolution's `parameter` field — the diagnostic arm named the correct
action/category but computed or guessed the wrong monetary figure or catalog lookup in every case.
No pass/fail attaches to this number, and no downstream plan may read it as a difficulty corridor
(D-05); it is recorded here only because the design requires it recorded, not because it gates
anything.

## 6. Per-unit records (all 20, from `ceiling-probe-state.json`)

| task | mode | status | oracle category | score | wall ms |
|---|---|---|---|---|---|
| 0 | answer-visible | ok | resolution-match | 1 | 25,936 |
| 0 | normal | ok | resolution-mismatch | 0 | 21,471 |
| 1 | answer-visible | ok | resolution-match | 1 | 22,850 |
| 1 | normal | ok | resolution-mismatch | 0 | 21,617 |
| 2 | answer-visible | ok | resolution-match | 1 | 25,175 |
| 2 | normal | ok | resolution-mismatch | 0 | 29,612 |
| 3 | answer-visible | ok | resolution-match | 1 | 19,688 |
| 3 | normal | ok | resolution-mismatch | 0 | 23,897 |
| 4 | answer-visible | ok | resolution-match | 1 | 24,420 |
| 4 | normal | ok | resolution-mismatch | 0 | 18,184 |
| 5 | answer-visible | ok | resolution-match | 1 | 11,593 |
| 5 | normal | ok | resolution-mismatch | 0 | 16,743 |
| 6 | answer-visible | ok | resolution-match | 1 | 12,813 |
| 6 | normal | ok | resolution-mismatch | 0 | 35,153 |
| 7 | answer-visible | ok | resolution-match | 1 | 15,590 |
| 7 | normal | ok | resolution-mismatch | 0 | 24,920 |
| 8 | answer-visible | ok | resolution-match | 1 | 17,404 |
| 8 | normal | ok | resolution-mismatch | 0 | 37,046 |
| 9 | answer-visible | ok | resolution-match | 1 | 8,449 |
| 9 | normal | ok | resolution-mismatch | 0 | 23,632 |

## 7. Verdict — CLEARED

The instrument has cleared its own pre-round health gate against the real slot: `10 >= 8`, the
answer-visible mode's scoreable count against the pinned floor, evaluated by plain integer
comparison. `ceiling-probe-verdict.json` carries `complete: true` and `pass: true`, and this readout
is drawn from that completed artifact and from nothing else — never from a log tail, never from
elapsed time.

**This pre-round probe supplements the full battery's own health clause; it does not replace it.**
§6 Clause 1 proper — at least 48 of the real 60-unit battery's pairing units landing with BOTH arms
scoreable — is still evaluated independently by the paired-round driver 14-06 builds, over the real
W and B arms once they exist, and it can still terminate the study at that point regardless of what
this probe found. This probe is a cheap format-confound catch on a single neutral diagnostic arm,
run once before either real arm exists; it is not a substitute for, and does not pre-empt, Clause 1's
own evaluation over the full battery.

## 8. One-shot / no-redraw compliance note

The probe's ten tickets were drawn from `CEILING_PROBE_SEED` (1399) only — disjoint from the paired
battery's own pinned seeds (1301-1306, §9) — so no pairing unit the real 60-unit round will draw was
seen, verbatim-resolution-and-all, by this probe. `PAIRED-DESIGN-PREREG.md` is byte-unchanged since
its freeze commit (`2f9e6095dc6e20bcc8196a293397f7ec07f8c704`), confirmed by hash before this document
was written.
