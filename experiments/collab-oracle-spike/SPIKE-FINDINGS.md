# Collab-oracle-spike — STaRK gold-harvest findings (REQ-77)

This record answers one question: does a real, hands-on invocation of `stark_qa.evaluator.Evaluator.evaluate()` against a real, revision-pinned PrimeKG download replace the C-01 dossier's `eval.py`-shell-out oracle assumption, and what exactly does Phase 19 need to know about the working shape to freeze its design on it? Written now, at the close of Plans 18-01/18-02, because every claim below traces to a transcript committed under `raw/` during those two plans plus one measurement (`download-size.log`) taken at the start of this plan — not to research notes or recollection.

## Verdict

Yes — the dossier's `eval.py`-shell-out assumption is replaced by a verified working path. `tools/stark-eval/score_one.py` scores a real PrimeKG query end to end through `stark_qa.evaluator.Evaluator.evaluate()`, prints one JSON object, and fails closed on a wrong revision pin, an unknown KB, and malformed stdin (`raw/tracer-score-one.log`, `raw/probe-pin-mismatch.log`). The phase now knows, hands-on rather than assumed: scoring is per-query (no batch workaround needed), `candidate_ids` comes from the loaded SKB not from the caller's prediction keys, the query's `query_id` never coincides with its positional index once a real split is selected, and an out-of-candidates prediction id raises `IndexError` rather than scoring 0 or being silently dropped — a fact Phase 21's bridge design must account for.

## Working invocation shape

Exact imports (`tools/stark-eval/score_one.py:111-117, 183-184`):
```python
from stark_qa import load_qa, load_skb
import torch
from stark_qa.evaluator import Evaluator
```

Exact CLI/stdin contract: `<kb>` and `<query_id>` positional argv, `[--hf-revision SHA] [--metrics ...] [--root DIR]` optional flags, the ranked prediction JSON object piped on stdin (`{node_id_str: score, ...}`, ≤20 entries per CD-01). Exact command run (`raw/tracer-score-one.log`):
```
$ printf '{"7570": 1.0}' | tools/stark-eval/.venv/bin/python tools/stark-eval/score_one.py prime 274
```
producing, verbatim (`raw/tracer-score-one.log` line 14):
```json
{"kb": "prime", "query_id": 274, "hf_revision": "88269e23e90587f99476c5dd74e235a0877e69be", "metrics": {"mrr": 1.0, "hit@1": 1.0, "hit@5": 1.0, "recall@20": 1.0}}
```

## Evaluator construction and candidate_ids

`Evaluator(candidate_ids=candidate_ids)` — the constructor takes only `candidate_ids`, resolved from the loaded SKB's own `.candidate_ids` accessor (`score_one.py:78-89`, `resolve_candidate_ids`), never from `pred_dict.keys()`. Probe 4 confirmed hands-on (`raw/probe-candidate-ids.log`, lines 6-9):
```
candidate_ids accessor used: skb.candidate_ids
candidate_ids cardinality: 129375
candidate_ids range: min=0 max=129374
```
This closes RESEARCH Open Question 1: the accessor exists directly on the SKB (`skb.candidate_ids`, not the fallback `get_candidate_ids()`), cardinality 129375 — the full KB node-id pool, dense and contiguous (`size == max+1`) — matching the expectation that candidate_ids is the KB's candidate pool, not the caller's prediction keys.

## Prediction shape (ranked list, CD-01)

`pred_dict` is a `Dict[int, float]` (candidate node id → score), parsed from a JSON object on stdin and validated key-by-key before use (`score_one.py:53-75`, `parse_pred_dict`). A real example from `raw/probe-three-predictions.log` (case a):
```
$ printf '{"95886": 1.0}' | score_one.py prime 0
```
This confirms the shape is a ranked candidate list rather than a single node id — the CLI accepts any number of `(id, score)` entries up to CD-01's 20-entry cap, and `Evaluator.evaluate()` ranks internally from the scores.

## Metrics requested and returned

Exact `metrics=[...]` list passed (`score_one.py:32`, `DEFAULT_METRICS`, also the argparse default at line 148-150): `["mrr", "hit@1", "hit@5", "recall@20"]`. Exact dict `evaluate()` returned, verbatim, matching `raw/tracer-score-one.log` line 14 and `raw/probe-granularity-loop.log` line 13:
```json
{"mrr": 1.0, "hit@1": 1.0, "hit@5": 1.0, "recall@20": 1.0}
```
`raw/probe-three-predictions.log` shows the same metric keys scoring `0.0` across the board for a valid-but-wrong candidate (case b, line 24): `{"mrr": 0.0, "hit@1": 0.0, "hit@5": 0.0, "recall@20": 0.0}` — the metric shape is stable across correct and incorrect predictions, only the values change.

## Three test predictions

`raw/probe-three-predictions.log`, query_id=0, gold=95886, candidate pool 0..129374 (size 129375):

- **(a) gold ranked first** (`{"95886": 1.0}`): `hit@1=1.0, mrr=1.0` — scores as correct.
- **(b) valid candidate, not gold** (`{"0": 1.0}`): `hit@1=0.0, mrr=0.0` — scores as incorrect, a sane baseline.
- **(c) node id outside `candidate_ids`** (`{"1129374": 1.0}`, pool is 0..129374): `Evaluator.evaluate()` **raises `IndexError`** — `"index 1129374 is out of bounds for dimension 0 with size 129375"` from `all_pred[pred_ids] = pred` inside `stark_qa`'s own `evaluator.py:62`. This is a raised exception, not a zeroed metric and not a silent pass: the process exits non-zero, stdout stays empty (0 bytes), the traceback goes to stderr only (`raw/probe-three-predictions.log` lines 35-45). **Phase 21's bridge must pre-filter predicted node ids to the candidate pool before calling this script, or catch `IndexError` specifically** — an out-of-candidates id is not safely passed through untouched.

## Per-query granularity

Confirmed per-query hands-on — no batch workaround was needed. `Evaluator.evaluate()` is already single-query-shaped (one `pred_dict` + one `answer_ids` tensor per call); the per-query CLI contract required no change from the plan's original design. Five distinct real PrimeKG val queries, one `Evaluator.evaluate()` call each (`raw/probe-granularity-loop.log`):

| val index | query_id | gold | result |
|---|---|---|---|
| 0 | 274 | 7570 | `hit@1=1.0, mrr=1.0` |
| 1 | 3140 | 63024 | `hit@1=1.0, mrr=1.0` |
| 2 | 7327 | 6541 | `hit@1=1.0, mrr=1.0` |
| 3 | 3826 | 95641 | `hit@1=1.0, mrr=1.0` |
| 4 | 8029 | 62352 | `hit@1=1.0, mrr=1.0` |

(All five predictions in this probe were seeded with the gold id, so all scored 1.0 — the point of this probe was granularity, not accuracy variance; case (b) in the Three Test Predictions section above already shows a non-gold prediction scoring 0.0 through the same call shape.)

## Hugging Face revision pin

Mechanism **(C)** from RESEARCH's Common Pitfalls #2 was used: a checked, fail-closed assertion (`assert_pinned_revision()`, `score_one.py:92-108`) that queries `huggingface_hub.HfApi().dataset_info(repo_id).sha` live and compares it to a `HF_PIN` constant embedded in the wrapper, aborting before any KB load on mismatch. Mechanisms (A) prefetch-into-`root=`) and (B) (`HF_HUB_OFFLINE` cache pin) were not wired — (C) alone satisfies D-08's "constant in the wrapper, echoed into findings + receipt" requirement and converts the pin from a claim into a checked fact.

Revision actually pinned and observed live: `88269e23e90587f99476c5dd74e235a0877e69be` (`score_one.py:29`, confirmed against the live Hub on every run — `raw/tracer-score-one.log` line 7, `raw/probe-granularity-loop.log`, `raw/harvest.log`, all print `revision pin OK: snap-stanford/stark@88269e23e90587f99476c5dd74e235a0877e69be`). Deliberately-wrong-pin abort, quoted verbatim from `raw/probe-pin-mismatch.log`:
```
$ printf '{"95886": 1.0}' | score_one.py prime 0 --hf-revision deadbeefdeadbeefdeadbeefdeadbeefdeadbeef
exit=1
--- stderr ---
HF revision pin mismatch for snap-stanford/stark: expected deadbeefdeadbeefdeadbeefdeadbeefdeadbeef, Hub currently resolves to 88269e23e90587f99476c5dd74e235a0877e69be
```

## query_id vs positional index

They **do not coincide** once a real split is selected. Probe 4 checked all 10 rows across both splits (`raw/probe-candidate-ids.log`, lines 10-21) — every `row_query_id != idx`:
```
=== split=val (get_subset('val'), 2241 rows) ===
  idx=0 row_query_id=274 coincide_with_subscript=False
  idx=1 row_query_id=3140 coincide_with_subscript=False
  ...
=== split=test (get_subset('test'), 2801 rows) ===
  idx=0 row_query_id=6517 coincide_with_subscript=False
  ...
```
`query_id` is a global id into the full un-split dataset (val has 2241 rows, test has 2801, both drawn from the ~10k-query pool), not a per-split sequential counter. This closes RESEARCH Open Question 3 / Assumption A6, the highest-severity assumption in the phase — a silent mispairing here would have propagated into every fixture. Both `score_one.py`'s `load_split()` (full-dataset linear scan, keyed on the row's own `query_id` field) and `harvest_gold.py`'s sampler key exclusively off the row's own `query_id` field, never the loop index.

## Sample seeds and pools

Two pools harvested from PrimeKG, both revision-pinned to `88269e23e90587f99476c5dd74e235a0877e69be`, stark-qa `1.1.0`:

| pool | file | split | seed | sample_size | sampled_from_n |
|---|---|---|---|---|---|
| selection | `test/fixtures/stark/prime-selection.json` | val | 1801 | 75 | 2241 |
| heldout | `test/fixtures/stark/prime-heldout.json` | test | 1802 | 75 | 2801 |

Both harvest runs recorded in `raw/harvest.log`. Determinism confirmed: a fresh re-run into a scratch directory diffed byte-identical against both committed fixtures (`raw/harvest-determinism.log`):
```
--- diff selection ---
EMPTY DIFF: selection byte-identical
--- diff heldout ---
EMPTY DIFF: heldout byte-identical
```
**Correction (WR-03, post-review):** the fixture payload originally embedded
`meta.harvested_at = date.today().isoformat()`, which was captured in the
byte-identical comparison above but is not itself reproducible across days —
re-running the documented verification procedure on any later date would
diff non-empty on that one field alone, even though nothing about the sample
changed. `harvested_at` has been dropped from the fixture payload entirely
(harvest date is tracked via git history / `raw/harvest.log`, not the
committed JSON); the byte-identical claim is now truly day-independent, not
just true today, re-confirmed with the field removed (`raw/wr03-harvest-refresh.log`).

## Download size and wall-clock

On-disk footprint of the downloaded, revision-pinned PrimeKG processed artifact, measured at the start of this plan (`raw/download-size.log`):
```
$ du -sh tools/stark-eval/data
256M	tools/stark-eval/data
$ du -sh tools/stark-eval/data/prime/processed
254M	tools/stark-eval/data/prime/processed
$ du -sh tools/stark-eval/data/prime/stark_qa
2.0M	tools/stark-eval/data/prime/stark_qa
$ du -sh tools/stark-eval/data/prime/split
68K	tools/stark-eval/data/prime/split
```
No transcript from Plans 18-01/18-02 captured install/download wall-clock timing — `setup.log` records the pip install phase for `stark-qa` and its transitive dependencies (`torch`, `torch_geometric`, `huggingface_hub`, and a long dependency chain — see `raw/setup.log`'s `Successfully installed` line), not the KB download, which happens lazily inside `load_skb`/`load_qa` on first use and was observed only indirectly (`raw/tracer-score-one.log` line 12, `"Loading from .../data/prime/processed!"`). This is recorded here as an honest gap rather than a fabricated number.

**Per-call scoring wall time — the first real measurement (Plan 21-04, `raw/score-one-walltime.log`).** The gap above covers download/install timing, not per-call scoring timing; the same honesty rule applied there. Plan 21-01 set `SCORING_TIMEOUT_MS = 600000` as a reasoned default specifically because this transcript did not yet exist. `raw/score-one-walltime.log` closes that gap: two consecutive live `runScoringPreflight` warm-up calls against the real venv, the real `score_one.py`, and the committed pool/fingerprint manifests measured `warmUpWallTimeMs` of 9755ms and 9147ms (61-66x headroom under the 600000ms ceiling) — a warm-cache measurement on one machine, not a cold-start distribution, per that log's own closing caveat.

## Corrections to the C-01 dossier assumption

The dossier's original assumption (`experiments/graph-engineering-harness/CANDIDATE-DOSSIERS.md`, "Exogenous-oracle analysis" section):

> "The oracle is STaRK's own scoring script (`E-05`'s Bar applied: `eval.py --dataset {amazon,mag,prime}`, ranking candidate `node_id -> torch.Tensor` embeddings against the gold node id, reportable to STaRK's own public Hugging Face leaderboard)."

and, in the collaborative-mode sketch: "...the answer-agent... writes the final predicted node id, which STaRK's `eval.py` scores against the gold id."

**This is corrected.** `eval.py` has no external-prediction flag — it drives only STaRK's five built-in baseline retrievers (confirmed in prior research, `PITFALLS.md`, not re-verified hands-on this phase since Plan 18-01's own working alternative made the question moot). The replacement, verified hands-on this phase: a thin project-authored wrapper (`tools/stark-eval/score_one.py`) calling `stark_qa.evaluator.Evaluator.evaluate()` directly, accepting a ranked candidate list on stdin (not the dossier's implied single predicted node id) and printing a JSON verdict. The oracle itself is still `stark_qa`'s own metric computation — nothing is reimplemented — but the invocation path is a direct `Evaluator` call, not an `eval.py` shell-out.

Every one of RESEARCH's six assumptions, addressed by name:

- **A1** (per-query, not batch-only) — **resolved, confirmed correct.** `raw/probe-granularity-loop.log`, five distinct queries, one `evaluate()` call each, no workaround needed.
- **A2** (HF pinning requires a workaround, not a kwarg) — **resolved, confirmed correct.** Mechanism (C) implemented and proven fail-closed; see Hugging Face revision pin above.
- **A3** (observed sha `88269e23e90587f99476c5dd74e235a0877e69be` is accurate and current) — **resolved, confirmed correct on live re-fetch.** Every run in `raw/` that reaches `assert_pinned_revision()` prints `revision pin OK` against this exact sha, most recently at harvest time (`raw/harvest.log`, `raw/harvest-determinism.log`).
- **A4** (`acceptedBy: "dr-robert-li"` is the correct human identity) — **resolved, confirmed correct.** Human-approved during Plan 18-01's Task 1 gate (`raw/task1-package-legitimacy-gate.log`, "acceptedBy identity for the committed OracleReceipt fixture" section), and the committed `test/fixtures/stark/oracle-receipt.json` uses it.
- **A5** (`eval.py`'s baseline model classes subclass/wrap `Evaluator`, corroborating per-query granularity) — **left open, superseded rather than resolved.** This phase never needed to inspect `eval.py`'s baseline classes because `score_one.py` calls `Evaluator.evaluate()` directly and confirmed per-query granularity independently (A1 above); whether `eval.py`'s own baselines subclass `Evaluator` was not re-checked hands-on and remains an unverified corroboration from prior research, now moot to this project's own invocation path.
- **A6** (`qa_dataset[i]`'s index coincides with `query_id`) — **resolved, refuted.** They do not coincide once a real split is selected — see query_id vs positional index above. This was the highest-severity assumption in the phase; both `score_one.py` and `harvest_gold.py` key exclusively off the row's own `query_id` field as a direct consequence.

One additional refutation the hands-on run surfaced beyond RESEARCH's own assumptions log: RESEARCH's Pattern 1 code sketch assumed `qa_dataset[int(query_id_str)]` would resolve the correct row by direct subscript — this is exactly the A6 assumption, and the sketch's own caution note ("verify hands-on before the harvest script keys fixtures off this line") is what Plan 18-01 followed. A second, implementation-level defect (not a RESEARCH assumption, but worth recording here since it shaped `pick_query.py`'s final shape) is documented in `18-01-SUMMARY.md`: an early draft of `pick_query.py` silently ignored its own `<split>` CLI argument, indexing the full un-split dataset regardless of `val`/`test`; found during Probe 4 when both splits returned identical rows, fixed to `qa_dataset.get_subset(split)[index]` (`raw/probe-candidate-ids.log`, "Deviation found and fixed during this probe" section).

## Evidence index

| File | Command that produced it | Section(s) citing it |
|---|---|---|
| `raw/setup.log` | `tools/stark-eval/setup.sh` (uv venv creation + `pip install -r requirements.txt`) | Download size and wall-clock |
| `raw/task1-package-legitimacy-gate.log` | Human-verify checkpoint transcript, Plan 18-01 Task 1 | Corrections to the C-01 dossier assumption (A4) |
| `raw/setuptools-fix.log` | `pip install setuptools==77.0.3` defect investigation | (Background — cited in 18-01-SUMMARY.md; setuptools/pkg_resources defect, not itself a SPIKE-FINDINGS section but is a `raw/` file that must be present for D-08's install reproducibility) |
| `raw/tracer-score-one.log` | `pick_query.py prime val 0` then `score_one.py prime 274` | Working invocation shape, Metrics requested and returned, Hugging Face revision pin |
| `raw/probe-three-predictions.log` | Three `score_one.py prime 0` runs (gold / wrong / out-of-candidates) | Three test predictions, Metrics requested and returned |
| `raw/probe-granularity-loop.log` | Five `pick_query.py` + `score_one.py` pairs over val indices 0-4 | Per-query granularity, Metrics requested and returned, Hugging Face revision pin |
| `raw/probe-pin-mismatch.log` | `score_one.py prime 0 --hf-revision deadbeef...` | Hugging Face revision pin |
| `raw/probe-candidate-ids.log` | `Evaluator` candidate_ids inspection + query_id/index coincidence check across val/test | Evaluator construction and candidate_ids, query_id vs positional index, Corrections to the C-01 dossier assumption |
| `raw/harvest.log` | `harvest_gold.py prime --pool selection` and `--pool heldout` | Sample seeds and pools, Hugging Face revision pin |
| `raw/harvest-determinism.log` | Fresh `harvest_gold.py` re-run into a scratch dir, diffed against committed fixtures | Sample seeds and pools |
| `raw/d09-guard-red-proof.log` | `test/stark-fixtures.test.ts` run against a deliberately marker-injected `test/budget.test.ts` | (Background — proves the D-09 CI-boundary guard's own failure mode; cited in 18-02-SUMMARY.md, not itself a scoring-shape finding but present in `raw/` and must be cited here to satisfy the evidence-citation guard) |
| `raw/download-size.log` | `du -sh` over `tools/stark-eval/data` and its subdirectories, run at the start of this plan | Download size and wall-clock |
| `raw/wr03-harvest-refresh.log` | Post-WR-03-fix `harvest_gold.py` re-run (fixture regen + fresh scratch-dir re-run + diff), after dropping `meta.harvested_at` | Sample seeds and pools |
| `raw/score-one-walltime.log` | Two live `runScoringPreflight` warm-up calls via a throwaway script, Plan 21-04 | Download size and wall-clock |
