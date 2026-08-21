#!/usr/bin/env python3
"""
Score one real PrimeKG (or other STaRK KB) query's ranked prediction against
STaRK's own gold answer_ids, via stark_qa.evaluator.Evaluator.evaluate() —
never a project-side metric reimplementation (REQ-77, D-07).

Usage:
  echo '{"1234": 1.0, "5678": 0.5}' | python score_one.py <kb> <query_id>
  # kb   : one of amazon | mag | prime
  # query_id : the STaRK query's own query_id field (not a loop index)
  # stdin: JSON object mapping candidate node id (string) -> score, ≤20 entries (CD-01)

Prints exactly one JSON object to stdout: {"kb", "query_id", "hf_revision", "metrics"}.
All progress/diagnostic text goes to stderr, so a future Node bridge can
JSON.parse stdout directly (D-07, execution-oracle.ts idiom).
"""
import contextlib
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


@contextlib.contextmanager
def _stdout_to_stderr():
    """stark_qa's transitive deps (colbert, tdc's download_hf) print
    progress/warning lines with bare print() straight to real stdout, which
    would break the single-JSON-object-on-stdout contract (D-07). Redirect
    the process's stdout fd to stderr's fd for the duration of the load;
    sys.stderr writes are unaffected since they target fd 2 directly."""
    stdout_fd = sys.stdout.fileno()
    saved_fd = os.dup(stdout_fd)
    try:
        os.dup2(sys.stderr.fileno(), stdout_fd)
        yield
    finally:
        sys.stdout.flush()
        os.dup2(saved_fd, stdout_fd)
        os.close(saved_fd)
HF_REPO_ID = "snap-stanford/stark"
# Observed live twice (research pass + planning pass), lastModified 2024-10-20,
# unchanged (RESEARCH.md Pitfall 2 / Common Pitfalls #2).
HF_PIN = "88269e23e90587f99476c5dd74e235a0877e69be"
KB_ALLOWLIST = ("amazon", "mag", "prime")
DATA_ROOT = HERE / "data"
DEFAULT_METRICS = ["mrr", "hit@1", "hit@5", "recall@20"]


def parse_pred_dict(raw):
    pred_dict = json.loads(raw)
    return {int(k): float(v) for k, v in pred_dict.items()}


def resolve_candidate_ids(skb):
    """Candidate node ids come from the loaded SKB's own candidate pool, never
    from pred_dict.keys() — otherwise recall@k denominators stop meaning what
    STaRK means by them (RESEARCH Open Question 1)."""
    if hasattr(skb, "candidate_ids"):
        return list(skb.candidate_ids)
    if hasattr(skb, "get_candidate_ids"):
        return list(skb.get_candidate_ids())
    raise AttributeError(
        "loaded SKB exposes neither .candidate_ids nor .get_candidate_ids() — "
        "record this deviation verbatim in the transcript"
    )


def load_split(kb, query_id):
    from stark_qa import load_qa, load_skb

    print(f"loading skb for kb={kb!r} (download_processed=True) ...", file=sys.stderr)
    skb = load_skb(kb, root=str(DATA_ROOT), download_processed=True)
    print(f"loading qa dataset for kb={kb!r} ...", file=sys.stderr)
    qa_dataset = load_qa(kb, root=str(DATA_ROOT))

    row = None
    for idx in range(len(qa_dataset)):
        candidate_row = qa_dataset[idx]
        row_query_id = candidate_row[1]
        if row_query_id == query_id:
            row = candidate_row
            print(
                f"resolved query_id={query_id} at subscript idx={idx} "
                f"(row's own query_id field={row_query_id})",
                file=sys.stderr,
            )
            break
    if row is None:
        raise ValueError(f"no row in {kb} qa dataset has query_id == {query_id}")

    _query, _row_query_id, answer_ids, _meta = row
    return skb, qa_dataset, answer_ids


def main():
    if len(sys.argv) != 3:
        print("usage: score_one.py <kb> <query_id>", file=sys.stderr)
        sys.exit(1)
    kb, query_id_str = sys.argv[1], sys.argv[2]
    if kb not in KB_ALLOWLIST:
        print(f"unknown kb {kb!r}, expected one of {KB_ALLOWLIST}", file=sys.stderr)
        sys.exit(1)
    query_id = int(query_id_str)

    pred_dict = parse_pred_dict(sys.stdin.read())

    with _stdout_to_stderr():
        import torch
        from stark_qa.evaluator import Evaluator

        skb, _qa_dataset, answer_ids = load_split(kb, query_id)
        candidate_ids = resolve_candidate_ids(skb)

        evaluator = Evaluator(candidate_ids=candidate_ids)
        # Evaluator.evaluate() calls answer_ids.view(-1) internally — it
        # requires a torch.LongTensor, not the plain list stark_qa's own
        # qa_dataset row returns (observed hands-on; RESEARCH's sketch
        # passed the list through untouched).
        metrics = evaluator.evaluate(
            pred_dict, torch.LongTensor(answer_ids), metrics=DEFAULT_METRICS
        )

    print(
        json.dumps(
            {
                "kb": kb,
                "query_id": query_id,
                "hf_revision": HF_PIN,
                "metrics": metrics,
            }
        )
    )


if __name__ == "__main__":
    main()
