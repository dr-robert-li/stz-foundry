# Survey — graph engineering harness sweep (REQ-74)

**Phase:** 16-graph-engineering-harness-unconditional-pivot · **Date run: 2026-08-20** · **Author:** Robert Li

This survey executes `experiments/graph-engineering-harness/SEARCH-PROTOCOL.md`, committed at
`9eebeacb7a346e3dc4d2d9688a514f289ee0eb92` — the protocol's own commit hash, recorded here as a literal
so freeze-before-sweep is provable rather than asserted. That commit contains no survey entry.

This document currently carries five entries. `E-01` was written by 16-01's tracer task to prove the
whole evidence pipeline — discovery, fetch, quote, entry — end to end on a single real claim. `E-02`
through `E-05` were written by 16-02 Task 1, one per source class (SC-A/SC-B/SC-C/SC-D), to prove the
four classes' distinct fetch shapes against the pinned entry format before the full sweep scales out. The
per-class and per-subdomain floors are not yet expected to be met; that is the rest of 16-02's job.

## Search log

- **Query:** all:GraphRAG — SC-A — 2026-08-20 — 231 hits, 1 survivor (arXiv API, `export.arxiv.org`,
  `sortBy=submittedDate&sortOrder=ascending`; the seed/canonical GraphRAG paper was the target of this
  query, examined directly rather than screened from the full hit list, since this task proves the
  pipeline on one claim rather than running the sweep)
- **Query:** all:SubgraphRAG knowledge graph retrieval-augmented generation — SC-A — 2026-08-20 — 1 hits, 1 survivor (arXiv abstract page for arxiv:2410.20724 fetched directly, examined directly rather than screened from a broader hit list, matching the tracer convention above)
- **Query:** neo4j-graphrag-python current documentation — SC-B — 2026-08-20 — 1 hits, 1 survivor (canonical Read the Docs page for the officially maintained Neo4j GraphRAG Python package, cross-checked against its PyPI release record for the Published date)
- **Query:** microsoft/graphrag repository adoption signals — SC-C — 2026-08-20 — 1 hits, 1 survivor (GitHub REST API record for microsoft/graphrag, the reference implementation behind E-01/E-02's protocol)
- **Query:** STaRK semi-structured knowledge base retrieval benchmark — SC-D — 2026-08-20 — 1 hits, 1 survivor (stark.stanford.edu plus its GitHub repository and Hugging Face dataset card, all fetched directly)

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

### E-02 — SubgraphRAG: a lightweight scorer retrieves flexibly-sized subgraphs for LLM reasoning

- **Source class:** SC-A
- **Subdomain:** knowledge-graphs
- **Primary source:** https://arxiv.org/abs/2410.20724
- **Published:** 2024-10-28
- **Fetch-verified:** https://arxiv.org/abs/2410.20724 retrieved 2026-08-20; page title and "Submitted on" line match the arXiv abstract page for the same identifier
- **Quote:** "We introduce SubgraphRAG, extending the KG-based RAG framework that retrieves subgraphs and leverages LLMs for reasoning and answer prediction."
- **Verdict:** validated
- **Bar applied:** D-07 evidence bar — the primary source was fetched directly (arXiv abstract HTML, retrieved 2026-08-20), the publication date was read off the fetched page's own submission line, and the quote above is copied verbatim from the fetched abstract text, not paraphrased or recalled.
- **Relevance:** Directly graph-mediated work under D-02's framing — the retrieved subgraph is the working medium the LLM reasons over, and the scored deliverable is the predicted answer, never the graph itself. Deliverable domain is `qa-retrieval` under D-03; subdomain is `knowledge-graphs` under D-01.

### E-03 — Neo4j GraphRAG for Python: a first-party vendor package for building and retrieving over a Neo4j-backed entity graph

- **Source class:** SC-B
- **Subdomain:** knowledge-graphs
- **Primary source:** https://neo4j.com/docs/neo4j-graphrag-python/current/
- **Published:** 2026-06-24
- **Fetch-verified:** https://neo4j.com/docs/neo4j-graphrag-python/current/ retrieved 2026-08-20; page content matches the current documentation build for package version v1.18.0, whose release-upload timestamp matches the PyPI record fetched at https://pypi.org/pypi/neo4j-graphrag/json
- **Quote:** "This package contains the official Neo4j GraphRAG features for Python."
- **Verdict:** validated
- **Bar applied:** D-07 evidence bar — the documentation page itself carries no publish-date line, so Published is taken from the PyPI release-upload timestamp for the current package version (v1.18.0, 2026-06-24), fetched directly rather than recalled; the quote is verbatim from the fetched docs page.
- **Relevance:** Vendor framework whose pipeline (entity/relation extraction into a Neo4j property graph, then retrieval over it) is the working medium for downstream question answering under D-02. Deliverable domain is `qa-retrieval` under D-03; subdomain is `knowledge-graphs` under D-01.

### E-04 — microsoft/graphrag: the reference implementation behind GraphRAG, carrying strong open-source adoption signals

- **Source class:** SC-C
- **Subdomain:** knowledge-graphs
- **Primary source:** https://github.com/microsoft/graphrag
- **Published:** 2026-07-18
- **Fetch-verified:** https://github.com/microsoft/graphrag retrieved 2026-08-20; the GitHub REST API record (api.github.com/repos/microsoft/graphrag) matches the repository's star count, fork count and latest release tag at fetch time
- **Quote:** "The GraphRAG project is a data pipeline and transformation suite that is designed to extract meaningful, structured data from unstructured text using the power of LLMs."
- **Verdict:** validated
- **Bar applied:** D-05 SC-C adoption signal — 35,588 stars and 3,741 forks (non-trivial for a research repository of this age and niche), plus a tagged release (v3.1.1, published 2026-07-18) inside the 2024-2026 recency window; both figures read directly off the fetched GitHub REST API response, not asserted. The repository's own README states the project is "largely in maintenance mode" as of this fetch, recorded here as a currency caveat rather than omitted.
- **Relevance:** The reference implementation of E-01's protocol — the entity/community graph it builds is the working medium for the query-focused summarization deliverable, not the scored artifact, under D-02. Deliverable domain is `qa-retrieval` under D-03; subdomain is `knowledge-graphs` under D-01.

### E-05 — STaRK: a benchmark scoring retrieval against gold node ids inside constructed semi-structured knowledge bases

- **Source class:** SC-D
- **Subdomain:** knowledge-graphs
- **Primary source:** https://stark.stanford.edu/
- **Published:** 2024-10-20
- **Fetch-verified:** https://stark.stanford.edu/ retrieved 2026-08-20; site content matches the benchmark's GitHub repository (snap-stanford/stark) and its Hugging Face dataset card (snap-stanford/stark, lastModified 2024-10-20), both fetched at the same time
- **Quote:** "STaRK is a large-scale Semi-structured Retrieval Benchmark on Textual and Relational Knowledge bases, covering applications in product search, academic paper search, and biomedicine inquiries."
- **Verdict:** validated
- **Bar applied:** D-07 evidence bar plus the benchmark-specific detail this task requires — ground truth is a set of natural-language queries paired with gold target node ids inside one of three constructed knowledge bases (an Amazon product graph, a MAG academic-paper graph, a PrimeKG biomedical graph); a submission is scored by the benchmark's own `eval.py`, which ranks candidate node embeddings against each query and reports retrieval metrics against the gold node id, reportable to the project's public Hugging Face leaderboard. Read directly off the fetched README at `raw.githubusercontent.com/snap-stanford/stark/main/README.md`, not recalled.
- **Relevance:** The three constructed knowledge bases are the working medium candidates retrieve over; the scored deliverable is retrieval accuracy against the gold node, not the graph itself, under D-02. Deliverable domain is `qa-retrieval` under D-03; subdomain is `knowledge-graphs` under D-01.

## Graph integrity practice

Not yet reported. This section is populated by the full sweep in 16-02, which the protocol's D-04
requires to name at least one supporting entry id once the graph-integrity practice across the field has
actually been surveyed. `E-01` alone does not describe graph-integrity practice (typed graph contracts,
hygiene invariants, replayable mutations) and is not cited here for that reason — citing it would satisfy
the mechanical check without satisfying D-04's actual requirement, which this tracer entry does not
attempt to close.
