#!/usr/bin/env python3
"""
Capture the committed environment-fingerprint manifest (D-05, D-06): the
provisioned venv's interpreter path/version, the stark_qa/torch package
versions, the pinned HF revision, a hash of score_one.py itself, and content
hashes of key files in BOTH on-disk cache locations the KB load path touches
— the SKB processed dir under tools/stark-eval/data/ and the Hugging Face
hub snapshot dir named for the pin. Never a hand-authored or hand-edited
fixture — the committed file must be exactly what this script writes.

This tool makes no network call and performs no KB load: it only reads
already-resolved versions and hashes files that must already exist on disk,
so it stays fast and runnable without the Hub.

Usage:
  python capture_fingerprint.py [--out-dir DIR] [--hub-cache-root DIR] \
      [--hf-revision SHA] [--dry-run]
"""
import argparse
import hashlib
import json
import os
import platform
import sys
from importlib.metadata import version as pkg_version
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from score_one import DATA_ROOT, HF_PIN  # noqa: E402

FIXTURE_DIR = HERE.parent.parent / "test" / "fixtures" / "stark"

# SKB-side key files, relative to DATA_ROOT — small, stable files that still
# change if the processed artifact is regenerated or tampered with.
SKB_KEY_FILES = (
    "prime/processed/edge_type_dict.pkl",
    "prime/processed/node_type_dict.pkl",
    "prime/processed/node_types.pt",
)

# Hub-side key files, relative to the pinned snapshot dir — symlinks into the
# hub's blob store; hashing follows the symlink to the resolved content.
HUB_KEY_FILES = (
    "qa/prime/stark_qa/stark_qa.csv",
    "qa/prime/stark_qa/stark_qa_human_generated_eval.csv",
)


def sha256_file(path):
    """Stream `path` in chunks and return the lowercase hex digest."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def build_fingerprint_payload(repo_root, hub_cache_root, hf_revision):
    # ponytail: Path(sys.executable).resolve() would follow the venv/bin/python
    # symlink all the way to uv's shared interpreter store outside the repo
    # (observed hands-on: uv-managed venvs symlink out, unlike a copied
    # venv). os.path.abspath() normalizes without dereferencing symlinks, so
    # the committed value stays "tools/stark-eval/.venv/bin/python" in the
    # common case.
    python_path = Path(os.path.abspath(sys.executable))
    try:
        python_path_rel = python_path.relative_to(repo_root)
    except ValueError:
        # ponytail: a git-worktree-isolated execution (this repo's own
        # dev workflow) intentionally keeps the untracked, provisioned venv
        # only in the main checkout, not in the worktree — so the running
        # interpreter's absolute path legitimately sits outside THIS repo
        # root even though it is the correct venv. Fall back to matching the
        # well-known venv tail (tools/stark-eval/.venv/bin/<python...>)
        # rather than raising, so the committed value is still the portable
        # repo-relative path and not a fixture wrongly refused because of
        # where the harvest happened to run.
        expected_tail = ("tools", "stark-eval", ".venv", "bin")
        if python_path.parts[-5:-1] == expected_tail:
            python_path_rel = Path(*python_path.parts[-5:])
        else:
            raise ValueError(
                f"interpreter {python_path} is outside repo root {repo_root} and "
                "does not match tools/stark-eval/.venv/bin/<python> — "
                "run this tool with the provisioned tools/stark-eval/.venv interpreter"
            )

    cache_key_file_sha256 = {}

    for rel in SKB_KEY_FILES:
        path = DATA_ROOT / rel
        if not path.is_file():
            raise ValueError(f"SKB key file missing: {path}")
        cache_key_file_sha256[f"skb:{rel}"] = sha256_file(path)

    snapshot_dir = Path(hub_cache_root) / "datasets--snap-stanford--stark" / "snapshots" / hf_revision
    for rel in HUB_KEY_FILES:
        path = snapshot_dir / rel
        if not path.is_file():
            raise ValueError(f"hub key file missing: {path}")
        cache_key_file_sha256[f"hub:{rel}"] = sha256_file(path)

    if not any(k.startswith("skb:") for k in cache_key_file_sha256):
        raise ValueError("no skb: namespace key files hashed — D-06 requires both cache locations")
    if not any(k.startswith("hub:") for k in cache_key_file_sha256):
        raise ValueError("no hub: namespace key files hashed — D-06 requires both cache locations")

    return {
        "pythonPath": str(python_path_rel),
        "pythonVersion": platform.python_version(),
        "starkQaVersion": pkg_version("stark-qa"),
        "torchVersion": pkg_version("torch"),
        "hfPin": hf_revision,
        "scoreOneSha256": sha256_file(HERE / "score_one.py"),
        "cacheKeyFileSha256": cache_key_file_sha256,
    }


def write_atomic(payload, dest_path):
    """Write `payload` to a temp file beside `dest_path`, then move it into
    place with a single os.replace() — the destination is never opened for
    writing directly, so a reader can never observe a torn file."""
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    tmp_path = dest_path.parent / f".{dest_path.name}.tmp-{os.getpid()}"
    with open(tmp_path, "w") as f:
        f.write(serialized)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp_path, dest_path)


def build_arg_parser():
    default_hub_cache_root = os.environ.get("HF_HUB_CACHE") or os.path.join(
        os.environ.get("HF_HOME", os.path.expanduser("~/.cache/huggingface")), "hub"
    )
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", default=str(FIXTURE_DIR), help="destination directory")
    parser.add_argument("--hub-cache-root", default=default_hub_cache_root, help="HF hub cache root directory")
    parser.add_argument("--hf-revision", default=HF_PIN, help="override the pinned HF dataset revision")
    parser.add_argument("--dry-run", action="store_true", help="print the payload to stdout, write nothing")
    return parser


def main():
    args = build_arg_parser().parse_args()
    repo_root = HERE.parent.parent

    payload = build_fingerprint_payload(repo_root, args.hub_cache_root, args.hf_revision)

    if args.dry_run:
        print(json.dumps(payload, indent=2, sort_keys=True))
        return

    dest = Path(args.out_dir) / "fingerprint-manifest.json"
    write_atomic(payload, dest)
    print(f"wrote {dest}", file=sys.stderr)


if __name__ == "__main__":
    main()
