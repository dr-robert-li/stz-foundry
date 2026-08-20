# Survey — graph engineering harness sweep (REQ-74)

**Phase:** 16-graph-engineering-harness-unconditional-pivot · **Date run: 2026-08-20** · **Author:** Robert Li

This survey executes `experiments/graph-engineering-harness/SEARCH-PROTOCOL.md`, committed at
`9eebeacb7a346e3dc4d2d9688a514f289ee0eb92` — the protocol's own commit hash, recorded here as a literal
so freeze-before-sweep is provable rather than asserted. That commit contains no survey entry.

This document currently carries **one entry, `E-01`**, written by 16-01's tracer task to prove the whole
evidence pipeline — discovery, fetch, quote, entry — end to end on a single real claim before the full
sweep (16-02) scales it. The per-class and per-subdomain floors are not yet expected to be met; that is
16-02's job.

## Search log

- **Query:** all:GraphRAG — SC-A — 2026-08-20 — 231 hits, 1 survivor (arXiv API, `export.arxiv.org`,
  `sortBy=submittedDate&sortOrder=ascending`; the seed/canonical GraphRAG paper was the target of this
  query, examined directly rather than screened from the full hit list, since this task proves the
  pipeline on one claim rather than running the sweep)

## Entries

### E-01 — GraphRAG: an LLM-built entity graph index mediates query-focused summarization over a private corpus

- **Source class:** SC-A
- **Subdomain:** knowledge-graphs
- **Primary source:** https://arxiv.org/abs/2404.16130
- **Published:** 2024-04-24
- **Fetch-verified:** https://arxiv.org/abs/2404.16130 retrieved 2026-08-20; page title and submission date match the arXiv API record for the same identifier
- **Quote:** "Our approach uses an LLM to build a graph index in two stages: first, to derive an entity knowledge graph from the source documents, then to pregenerate community summaries for all groups of closely related entities."
- **Verdict:** validated
- **Bar applied:** D-07 evidence bar — the primary source was fetched directly (arXiv abstract HTML, retrieved 2026-08-20), the publication date was read off the fetched page's own submission line, and the quote above is copied verbatim from the fetched abstract text, not paraphrased or recalled.
- **Relevance:** Directly graph-mediated work under D-02's framing — the entity knowledge graph and its community summaries are the working medium the LLM builds and reads from, and the scored deliverable is the query-focused summary answer, never the graph itself. Deliverable domain is `qa-retrieval` under D-03; subdomain is `knowledge-graphs` under D-01.

## Graph integrity practice

Not yet reported. This section is populated by the full sweep in 16-02, which the protocol's D-04
requires to name at least one supporting entry id once the graph-integrity practice across the field has
actually been surveyed. `E-01` alone does not describe graph-integrity practice (typed graph contracts,
hygiene invariants, replayable mutations) and is not cited here for that reason — citing it would satisfy
the mechanical check without satisfying D-04's actual requirement, which this tracer entry does not
attempt to close.
