#!/usr/bin/env python3
"""
Score one real PrimeKG (or other STaRK KB) query's ranked prediction against
STaRK's own gold answer_ids, via stark_qa.evaluator.Evaluator.evaluate() —
never a project-side metric reimplementation (REQ-77, D-07).

Usage:
  echo '{"1234": 1.0, "5678": 0.5}' | python score_one.py <kb> <query_id> \
      [--hf-revision SHA] [--metrics mrr,hit@1,hit@5,recall@20] [--root DIR]
  # kb   : one of amazon | mag | prime
  # query_id : the STaRK query's own query_id field (not a loop index)
  # stdin: JSON object mapping candidate node id (string) -> score, <=20 entries (CD-01)

Prints exactly one JSON object to stdout: {"kb", "query_id", "hf_revision", "metrics"}.
All progress/diagnostic text goes to stderr, so a future Node bridge can
JSON.parse stdout directly (D-07, execution-oracle.ts idiom).
"""
import argparse
import contextlib
import json
import math
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
HF_REPO_ID = "snap-stanford/stark"
# Observed live twice (research pass + planning pass), lastModified 2024-10-20,
# unchanged (RESEARCH.md Pitfall 2 / Common Pitfalls #2).
HF_PIN = "88269e23e90587f99476c5dd74e235a0877e69be"
KB_ALLOWLIST = ("amazon", "mag", "prime")
DATA_ROOT = HERE / "data"
DEFAULT_METRICS = ["mrr", "hit@1", "hit@5", "recall@20"]


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


def parse_pred_dict(raw):
    """Parse-or-reject the stdin prediction object at the CLI boundary
    (ASVS V5) — never coerce silently, never drop an entry."""
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"stdin is not valid JSON: {e}") from e
    if not isinstance(obj, dict):
        raise ValueError(f"stdin must be a JSON object, got {type(obj).__name__}")
    if not obj:
        raise ValueError("stdin prediction object is empty")
    if len(obj) > 20:
        raise ValueError(f"stdin prediction object has {len(obj)} entries, CD-01 caps at 20")
    pred_dict = {}
    for k, v in obj.items():
        try:
            key = int(k)
        except (TypeError, ValueError):
            raise ValueError(f"prediction key {k!r} does not parse as an integer node id")
        if key in pred_dict:
            raise ValueError(f"prediction key {k!r} duplicates node id {key} already seen")
        try:
            val = float(v)
        except (TypeError, ValueError):
            raise ValueError(f"prediction value {v!r} for key {k!r} does not parse as a float")
        if not math.isfinite(val):
            raise ValueError(f"prediction value {v!r} for key {k!r} must be finite (got NaN/Infinity)")
        pred_dict[key] = val
    return pred_dict


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


def assert_pinned_revision(expected_revision):
    """Fail closed BEFORE any KB load or scoring if the Hub's currently
    resolved commit sha for HF_REPO_ID does not match expected_revision.
    Neither load_qa nor load_skb exposes a revision kwarg (D-08) — this is
    the check standing in for a pass-through pin that does not exist
    upstream (RESEARCH Common Pitfalls #2, mechanism C)."""
    from huggingface_hub import HfApi

    resolved = HfApi().dataset_info(HF_REPO_ID).sha
    if resolved != expected_revision:
        print(
            f"HF revision pin mismatch for {HF_REPO_ID}: expected "
            f"{expected_revision}, Hub currently resolves to {resolved}",
            file=sys.stderr,
        )
        sys.exit(1)
    print(f"revision pin OK: {HF_REPO_ID}@{expected_revision}", file=sys.stderr)


def load_split(kb, query_id, root):
    from stark_qa import load_qa, load_skb

    print(f"loading skb for kb={kb!r} (download_processed=True) ...", file=sys.stderr)
    skb = load_skb(kb, root=str(root), download_processed=True)
    print(f"loading qa dataset for kb={kb!r} ...", file=sys.stderr)
    qa_dataset = load_qa(kb, root=str(root))

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


def build_arg_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kb", help=f"one of {KB_ALLOWLIST}")
    parser.add_argument("query_id", help="the query's own query_id field")
    parser.add_argument(
        "--hf-revision",
        default=HF_PIN,
        help="override the pinned HF dataset revision (testable pin mismatch path)",
    )
    parser.add_argument(
        "--metrics",
        default=",".join(DEFAULT_METRICS),
        help="comma-separated metric names passed to Evaluator.evaluate()",
    )
    parser.add_argument(
        "--root",
        default=str(DATA_ROOT),
        help="KB/QA data root directory",
    )
    return parser


def main():
    args = build_arg_parser().parse_args()

    if args.kb not in KB_ALLOWLIST:
        print(f"unknown kb {args.kb!r}, expected one of {KB_ALLOWLIST}", file=sys.stderr)
        sys.exit(1)
    try:
        query_id = int(args.query_id)
    except ValueError:
        print(f"query_id {args.query_id!r} does not parse as an integer", file=sys.stderr)
        sys.exit(1)

    metrics_list = [m.strip() for m in args.metrics.split(",") if m.strip()]

    try:
        pred_dict = parse_pred_dict(sys.stdin.read())
    except ValueError as e:
        print(f"invalid prediction on stdin: {e}", file=sys.stderr)
        sys.exit(1)

    with _stdout_to_stderr():
        assert_pinned_revision(args.hf_revision)

        import torch
        from stark_qa.evaluator import Evaluator

        skb, _qa_dataset, answer_ids = load_split(args.kb, query_id, args.root)
        candidate_ids = resolve_candidate_ids(skb)

        evaluator = Evaluator(candidate_ids=candidate_ids)
        # Evaluator.evaluate() calls answer_ids.view(-1) internally — it
        # requires a torch.LongTensor, not the plain list stark_qa's own
        # qa_dataset row returns (observed hands-on; RESEARCH's sketch
        # passed the list through untouched).
        metrics = evaluator.evaluate(
            pred_dict, torch.LongTensor(answer_ids), metrics=metrics_list
        )

    print(
        json.dumps(
            {
                "kb": args.kb,
                "query_id": query_id,
                "hf_revision": args.hf_revision,
                "metrics": metrics,
            }
        )
    )


if __name__ == "__main__":
    main()
