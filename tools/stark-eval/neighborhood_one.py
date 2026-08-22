#!/usr/bin/env python3
"""
Extract one query's gold-free seed entities and k-hop knowledge-base
neighbourhood as JSON on stdout (Phase 22 Plan 04, D-01) -- mirrors
score_one.py's CLI idiom (argv, pinned revision, JSON-only stdout) so an
operator who knows one script knows both.

Usage:
  python neighborhood_one.py <kb> <query_id> [--hf-revision SHA] \
      [--hops N] [--cap N] [--root DIR]
  # kb       : one of amazon | mag | prime
  # query_id : the STaRK query's own query_id field (not a loop index)

Prints exactly one JSON object to stdout:
  {"kb", "queryId", "revision", "seeds", "nodes", "edges", "relationNames"}
or, when query-text seeding finds no entry point:
  {"kb", "queryId", "revision", "seeds": [], "reason": "..."}
All progress/diagnostic text goes to stderr (the same _stdout_to_stderr
window score_one.py uses for its own KB-loading window), so the Node-side
dispatch can JSON.parse stdout directly.

Contract: gold-free (this script never reads, imports, derives from, or
prints the query's constructed-answer field, and never seeds its walk from
it -- the query's own free-text prompt is the only signal this script reads
off a query row); revision-pinned (fails closed before any load if the KB's
resolved revision does not match --hf-revision); JSON-only stdout;
deterministic truncation (breadth-first by hop distance, then ascending
node id within a hop, so replaying the same query id always yields the same
neighbourhood). A non-zero exit means refusal -- the Node side must never
parse partial stdout.
"""
import argparse
import json
import re
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

DEFAULT_HOPS = 2
DEFAULT_CAP = 400
MIN_SEED_NAME_LEN = 3


def load_query_text(kb, query_id, root):
    """Return ONLY the query's own free-text prompt for `query_id` -- the
    row's constructed-answer field is unpacked into a throwaway name and
    never read, printed, or used to seed the walk. Mirrors score_one.py's
    own row-scan-by-query_id loop (query_id never coincides with the
    subscript index, confirmed hands-on in Phase 18), minus the one field
    this script must never touch."""
    from stark_qa import load_qa

    qa_dataset = load_qa(kb, root=str(root))
    for idx in range(len(qa_dataset)):
        row = qa_dataset[idx]
        query_text, row_query_id, _unused_gold_field, _meta = row
        if row_query_id == query_id:
            print(f"resolved query_id={query_id} at subscript idx={idx}", file=sys.stderr)
            return query_text
    raise ValueError(f"no row in {kb} qa dataset has query_id == {query_id}")


def find_seeds(skb, query_text):
    """KB node names matched against the query text -- the implementable,
    gold-free reading of "the query's entry points into the KB" (no
    candidate id and no gold-adjacent field is ever consulted). Case-
    insensitive, WORD-BOUNDARY-AWARE match (IN-01): a name only seeds when
    the characters immediately before and after its occurrence are not
    alphanumeric, so a short name (e.g. "Sun") no longer seeds off sitting
    inside an unrelated longer word (e.g. "Sunday"). Lookaround assertions
    are used rather than \\b: several KB entity names begin or end with a
    non-word character (parentheses, commas, hyphens), and \\b asserts a
    WORD/non-word transition, which silently inverts its meaning for those
    names. Names shorter than MIN_SEED_NAME_LEN are skipped to avoid
    noise-prone single-token collisions. Deterministic: node ids are visited
    in ascending order, so the returned seed list is always ascending too."""
    lowered_query = query_text.lower()
    seeds = []
    for idx in sorted(skb.node_info.keys()):
        name = skb.node_info[idx].get("name")
        if not isinstance(name, str) or len(name) < MIN_SEED_NAME_LEN:
            continue
        pattern = r"(?<![A-Za-z0-9])" + re.escape(name.lower()) + r"(?![A-Za-z0-9])"
        if re.search(pattern, lowered_query):
            seeds.append(idx)
    return seeds


def bfs_neighbourhood(skb, seeds, hops, cap):
    """Breadth-first from `seeds` out to `hops`, deterministic truncation:
    within each hop's newly-discovered frontier, sort candidates by
    ascending node id, keep only as many as the remaining cap allows, then
    stop expanding once the cap is reached -- so the same query always
    replays to the same neighbourhood, regardless of node-degree order."""
    visited = set(seeds)
    order = sorted(seeds)
    frontier = sorted(seeds)
    for _hop in range(hops):
        if len(visited) >= cap or not frontier:
            break
        candidates = set()
        for node_idx in frontier:
            for neighbor in skb.get_neighbor_nodes(node_idx):
                if neighbor not in visited:
                    candidates.add(neighbor)
        next_frontier = sorted(candidates)
        remaining = cap - len(visited)
        kept = next_frontier[:remaining]
        visited.update(kept)
        order.extend(kept)
        frontier = kept
    return order


def induced_edges(skb, node_ids):
    """Edges among exactly `node_ids` (the final neighbourhood), read off
    the SKB's own already-undirected edge_index/edge_types tensors in one
    vectorised pass rather than per-node lookups. Sorted by
    (source, destination, relationId) for replay determinism, matching this
    repo's canonical-ordering convention elsewhere (collaborative-runner.ts's
    canonicalSubgraphBytes)."""
    import torch

    node_mask = torch.zeros(skb.num_nodes(), dtype=torch.bool)
    node_mask[torch.tensor(sorted(node_ids), dtype=torch.long)] = True
    src, dst = skb.edge_index
    edge_mask = node_mask[src] & node_mask[dst]
    triples = list(
        zip(src[edge_mask].tolist(), dst[edge_mask].tolist(), skb.edge_types[edge_mask].tolist())
    )
    triples.sort()
    return triples


def build_neighbourhood_payload(skb, query_text, hops, cap):
    """The seeds-then-walk pipeline, gold-free end to end. An empty seed set
    is emitted as an explicit, named reason -- never silently degraded into
    an empty-but-successful neighbourhood (FA-7's stated no-fallback rule)."""
    seeds = find_seeds(skb, query_text)
    if not seeds:
        return {
            "seeds": [],
            "reason": "no KB node name matched the query text via query-text seeding (FA-7)",
        }

    node_ids = bfs_neighbourhood(skb, seeds, hops, cap)
    edges = induced_edges(skb, node_ids)
    relation_ids = sorted({rel for _src, _dst, rel in edges})
    nodes = [
        {"id": idx, "label": skb.node_info[idx]["name"], "type": skb.get_node_type_by_id(idx)}
        for idx in node_ids
    ]
    relation_names = {str(rel): skb.edge_type_dict[rel] for rel in relation_ids}
    return {
        "seeds": seeds,
        "nodes": nodes,
        "edges": [[src, dst, rel] for src, dst, rel in edges],
        "relationNames": relation_names,
    }


def build_arg_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kb", help=f"one of {KB_ALLOWLIST}")
    parser.add_argument("query_id", help="the query's own query_id field")
    parser.add_argument(
        "--hf-revision",
        default=HF_PIN,
        help="override the pinned HF dataset revision (testable pin mismatch path)",
    )
    parser.add_argument("--hops", type=int, default=DEFAULT_HOPS, help="breadth-first hop count")
    parser.add_argument("--cap", type=int, default=DEFAULT_CAP, help="maximum neighbourhood node count")
    parser.add_argument("--root", default=str(DATA_ROOT), help="KB/QA data root directory")
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

    with _stdout_to_stderr():
        assert_pinned_revision(args.hf_revision)

        from stark_qa import load_skb

        query_text = load_query_text(args.kb, query_id, args.root)

        print(f"loading skb for kb={args.kb!r} (download_processed=True) ...", file=sys.stderr)
        skb = load_skb(args.kb, root=str(args.root), download_processed=True)

        payload = build_neighbourhood_payload(skb, query_text, args.hops, args.cap)

    print(
        json.dumps(
            {
                "kb": args.kb,
                "queryId": query_id,
                "revision": args.hf_revision,
                **payload,
            }
        )
    )


if __name__ == "__main__":
    main()
