#!/usr/bin/env python3
"""
Harvest a seeded, deterministic gold pool of (query, query_id, answer_ids)
pairs from a real PrimeKG split and write it atomically as a fixture JSON
(D-03, D-04, D-05, D-08). Never a hand-authored or hand-edited fixture — the
committed files must be exactly what this script writes.

Usage:
  python harvest_gold.py <kb> --pool selection|heldout \
      [--out-dir DIR] [--seed N] [--size N] [--dry-run N] [--hf-revision SHA]
  # kb   : one of amazon | mag | prime
  # --dry-run N: load, sample, and print the payload with only the first N
  #              pairs to stdout, without writing any file.
"""
import argparse
import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from score_one import (  # noqa: E402
    DATA_ROOT,
    HF_PIN,
    KB_ALLOWLIST,
    assert_pinned_revision,
    _stdout_to_stderr,
)

POOLS = {"selection": ("val", 1801), "heldout": ("test", 1802)}
SAMPLE_SIZE = 75
FIXTURE_DIR = HERE.parent.parent / "test" / "fixtures" / "stark"


def sample_pool(kb, pool, seed, size, root, hf_revision):
    """Load the split, sample `size` distinct indices deterministically from
    `seed`, and resolve each sampled row's own query_id field (never the
    loop/subscript position — Plan 18-01 probe 4 confirmed they never
    coincide once a real split is selected)."""
    from stark_qa import load_qa

    split, _default_seed = POOLS[pool]

    with _stdout_to_stderr():
        assert_pinned_revision(hf_revision)

        from importlib.metadata import version as pkg_version

        print(f"loading qa dataset for kb={kb!r} ...", file=sys.stderr)
        qa_dataset = load_qa(kb, root=str(root))
        subset = qa_dataset.get_subset(split)
        sampled_from_n = len(subset)

        indices = sorted(range(sampled_from_n))
        chosen = random.Random(seed).sample(indices, min(size, sampled_from_n))

        pairs = []
        for idx in chosen:
            row = subset[idx]
            query, row_query_id, answer_ids, _meta = row
            try:
                query_id = int(row_query_id)
            except (TypeError, ValueError):
                raise ValueError(
                    f"sampled row at idx={idx} has non-integer query_id "
                    f"{row_query_id!r} — refusing to fall back to the index"
                )
            pairs.append(
                {
                    "query": str(query),
                    "query_id": query_id,
                    "answer_ids": sorted(int(a) for a in answer_ids),
                }
            )
        pairs.sort(key=lambda p: p["query_id"])
        stark_qa_version = pkg_version("stark-qa")

    meta = {
        "kb": kb,
        "split": split,
        "pool": pool,
        "seed": seed,
        "sample_size": len(pairs),
        "sampled_from_n": sampled_from_n,
        "stark_qa_version": stark_qa_version,
        "hf_revision": hf_revision,
        # ponytail: no harvested_at field — embedding today's date in the
        # hashed/byte-compared payload made the D-04/D-05 byte-identical
        # reproducibility claim date-dependent (WR-03). Harvest date is
        # tracked via git history / raw/harvest.log, not the fixture payload.
        "harvest_script": "tools/stark-eval/harvest_gold.py",
    }
    return build_payload(meta, pairs)


def build_payload(meta, pairs):
    return {"meta": meta, "pairs": pairs}


def write_atomic(payload, dest_path):
    """Write `payload` to a temp file beside `dest_path`, then move it into
    place with a single os.replace() — the destination is never opened for
    writing directly, so a reader can never observe a torn file."""
    import os

    dest_path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    tmp_path = dest_path.parent / f".{dest_path.name}.tmp-{os.getpid()}"
    with open(tmp_path, "w") as f:
        f.write(serialized)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp_path, dest_path)


def build_arg_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kb", help=f"one of {KB_ALLOWLIST}")
    parser.add_argument("--pool", required=True, help=f"one of {tuple(POOLS)}")
    parser.add_argument("--out-dir", default=str(FIXTURE_DIR), help="destination directory")
    parser.add_argument("--seed", type=int, default=None, help="override the pool's default seed")
    parser.add_argument("--size", type=int, default=SAMPLE_SIZE, help="sample size")
    parser.add_argument("--dry-run", type=int, default=None, metavar="N", help="print first N pairs, write nothing")
    parser.add_argument("--hf-revision", default=HF_PIN, help="override the pinned HF dataset revision")
    parser.add_argument("--root", default=str(DATA_ROOT), help="KB/QA data root directory")
    return parser


def main():
    args = build_arg_parser().parse_args()

    if args.kb not in KB_ALLOWLIST:
        print(f"unknown kb {args.kb!r}, expected one of {KB_ALLOWLIST}", file=sys.stderr)
        sys.exit(1)
    if args.pool not in POOLS:
        print(f"unknown pool {args.pool!r}, expected one of {tuple(POOLS)}", file=sys.stderr)
        sys.exit(1)

    _default_split, default_seed = POOLS[args.pool]
    seed = args.seed if args.seed is not None else default_seed

    payload = sample_pool(args.kb, args.pool, seed, args.size, args.root, args.hf_revision)

    if args.dry_run is not None:
        payload = build_payload(payload["meta"], payload["pairs"][: args.dry_run])
        print(json.dumps(payload, indent=2, sort_keys=True))
        return

    dest = Path(args.out_dir) / f"{args.kb}-{args.pool}.json"
    write_atomic(payload, dest)
    print(f"wrote {dest}", file=sys.stderr)


if __name__ == "__main__":
    main()
