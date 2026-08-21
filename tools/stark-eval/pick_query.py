#!/usr/bin/env python3
"""
Print one PrimeKG QA split row as JSON, so score_one.py can be driven and
re-verified without anyone knowing a query_id in advance. Spike utility only
(not part of the Phase 21 bridge surface).

Usage:
  python pick_query.py <kb> <split> <index>
  # e.g. python pick_query.py prime val 0
"""
import contextlib
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA_ROOT = HERE / "data"
KB_ALLOWLIST = ("amazon", "mag", "prime")


@contextlib.contextmanager
def _stdout_to_stderr():
    """stark_qa's transitive deps print progress/warning lines with bare
    print() straight to real stdout — redirect the process's stdout fd to
    stderr's fd for the duration of the load (see score_one.py sibling)."""
    stdout_fd = sys.stdout.fileno()
    saved_fd = os.dup(stdout_fd)
    try:
        os.dup2(sys.stderr.fileno(), stdout_fd)
        yield
    finally:
        sys.stdout.flush()
        os.dup2(saved_fd, stdout_fd)
        os.close(saved_fd)


def main():
    if len(sys.argv) != 4:
        print("usage: pick_query.py <kb> <split> <index>", file=sys.stderr)
        sys.exit(1)
    kb, split, index_str = sys.argv[1], sys.argv[2], sys.argv[3]
    if kb not in KB_ALLOWLIST:
        print(f"unknown kb {kb!r}, expected one of {KB_ALLOWLIST}", file=sys.stderr)
        sys.exit(1)
    index = int(index_str)

    with _stdout_to_stderr():
        from stark_qa import load_qa

        qa_dataset = load_qa(kb, root=str(DATA_ROOT))
        row = qa_dataset[index]
    # Row shape observed hands-on (see raw/tracer-score-one.log for the exact
    # tuple this returned) — print both the subscript used and the row's own
    # query_id so index-vs-query_id divergence is observable, not assumed.
    query, query_id, answer_ids, _meta = row
    print(
        json.dumps(
            {
                "index": index,
                "query_id": query_id,
                "gold": answer_ids[0],
                "answer_ids": answer_ids,
            }
        )
    )


if __name__ == "__main__":
    main()
