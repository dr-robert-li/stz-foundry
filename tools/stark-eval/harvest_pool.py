#!/usr/bin/env python3
"""
Harvest the STaRK candidate-pool manifest for a KB from its loaded SKB's own
candidate ids and write it atomically as a fixture JSON (D-03, D-04). Never a
hand-authored or hand-edited fixture — the committed file must be exactly
what this script writes. Re-running this tool against the pinned revision
must reproduce the file byte for byte (no timestamp, hostname, or absolute
path in the payload).

Usage:
  python harvest_pool.py <kb> [--out-dir DIR] [--dry-run N] \
      [--hf-revision SHA] [--root DIR]
  # kb   : one of amazon | mag | prime
  # --dry-run N: assert the pin, load, and print the payload summary plus the
  #              first N ids to stderr, without writing any file.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from score_one import (  # noqa: E402
    DATA_ROOT,
    HF_PIN,
    KB_ALLOWLIST,
    assert_pinned_revision,
    resolve_candidate_ids,
    _stdout_to_stderr,
)

FIXTURE_DIR = HERE.parent.parent / "test" / "fixtures" / "stark"


def build_pool_payload(kb, hf_revision, ids):
    """`ids` must already be the sorted, deduplicated candidate id list.
    Verifies uniqueness and contiguity rather than assuming them (D-04) —
    only when `count == max - min + 1` does the manifest omit the full id
    list and rely on bounds+count for membership checks."""
    if not ids:
        raise ValueError(f"candidate pool for kb={kb!r} is empty, refusing to harvest")

    count = len(ids)
    if len(set(ids)) != count:
        duplicate_count = count - len(set(ids))
        raise ValueError(
            f"candidate pool for kb={kb!r} has {duplicate_count} duplicate id(s) "
            "among the sorted list — resolve_candidate_ids must return a set-like pool"
        )

    lo, hi = ids[0], ids[-1]
    is_contiguous = count == hi - lo + 1

    # Recipe: sha256 over the sorted full id list, one id per line, joined by
    # a single "\n" with NO trailing newline. test/stark-manifests.test.ts
    # re-derives this exact digest in TypeScript; a divergence is a red test.
    id_list_sha256 = hashlib.sha256("\n".join(str(i) for i in ids).encode("utf-8")).hexdigest()

    payload = {
        "kb": kb,
        "hfRevision": hf_revision,
        "count": count,
        "min": lo,
        "max": hi,
        "idListSha256": id_list_sha256,
    }

    if is_contiguous:
        payload["form"] = "bounds"
        print(
            f"pool is dense/contiguous (count={count} == max-min+1={hi - lo + 1}); "
            "emitting form=bounds, omitting explicit ids list",
            file=sys.stderr,
        )
    else:
        payload["form"] = "explicit"
        payload["ids"] = ids
        print(
            f"pool is NOT contiguous (count={count} != max-min+1={hi - lo + 1}); "
            "emitting form=explicit with the full sorted ids list",
            file=sys.stderr,
        )

    return payload


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
    parser.add_argument("--out-dir", default=str(FIXTURE_DIR), help="destination directory")
    parser.add_argument("--dry-run", type=int, default=None, metavar="N", help="print first N ids, write nothing")
    parser.add_argument("--hf-revision", default=HF_PIN, help="override the pinned HF dataset revision")
    parser.add_argument("--root", default=str(DATA_ROOT), help="KB/QA data root directory")
    return parser


def main():
    args = build_arg_parser().parse_args()

    if args.kb not in KB_ALLOWLIST:
        print(f"unknown kb {args.kb!r}, expected one of {KB_ALLOWLIST}", file=sys.stderr)
        sys.exit(1)

    # Fail closed BEFORE any load, exactly as score_one.py does.
    assert_pinned_revision(args.hf_revision)

    with _stdout_to_stderr():
        from stark_qa import load_skb

        print(f"loading skb for kb={args.kb!r} (download_processed=True) ...", file=sys.stderr)
        skb = load_skb(args.kb, root=str(args.root), download_processed=True)
        ids = sorted(int(x) for x in resolve_candidate_ids(skb))

    payload = build_pool_payload(args.kb, args.hf_revision, ids)

    if args.dry_run is not None:
        print(
            f"kb={payload['kb']} hfRevision={payload['hfRevision']} form={payload['form']} "
            f"count={payload['count']} min={payload['min']} max={payload['max']} "
            f"idListSha256={payload['idListSha256']}",
            file=sys.stderr,
        )
        print(f"first {args.dry_run} ids: {ids[: args.dry_run]}", file=sys.stderr)
        return

    dest = Path(args.out_dir) / f"{args.kb}-pool-manifest.json"
    write_atomic(payload, dest)
    print(f"wrote {dest}", file=sys.stderr)


if __name__ == "__main__":
    main()
