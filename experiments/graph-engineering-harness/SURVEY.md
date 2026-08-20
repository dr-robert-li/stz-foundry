# Survey — graph engineering harness sweep (REQ-74)

**Phase:** 16-graph-engineering-harness-unconditional-pivot · **Date run: 2026-08-20** · **Author:** Robert Li

This survey executes `experiments/graph-engineering-harness/SEARCH-PROTOCOL.md`, committed at
`9eebeacb7a346e3dc4d2d9688a514f289ee0eb92` — the protocol's own commit hash, recorded here as a literal
so freeze-before-sweep is provable rather than asserted. That commit contains no survey entry.

This document currently carries sixteen entries. `E-01` was written by 16-01's tracer task to prove the
whole evidence pipeline — discovery, fetch, quote, entry — end to end on a single real claim. `E-02`
through `E-05` were written by 16-02 Task 1, one per source class (SC-A/SC-B/SC-C/SC-D), to prove the
four classes' distinct fetch shapes against the pinned entry format. `E-06` through `E-16` were written by
16-02 Task 2, filling the sweep out to every per-class and per-subdomain floor the protocol declares (see
the closing coverage table for the arithmetic).

## Search log

- **Query:** all:GraphRAG — SC-A — 2026-08-20 — 231 hits, 1 survivor (arXiv API, `export.arxiv.org`,
  `sortBy=submittedDate&sortOrder=ascending`; the seed/canonical GraphRAG paper was the target of this
  query, examined directly rather than screened from the full hit list, since this task proves the
  pipeline on one claim rather than running the sweep)
- **Query:** all:SubgraphRAG knowledge graph retrieval-augmented generation — SC-A — 2026-08-20 — 1 hits, 1 survivor (arXiv abstract page for arxiv:2410.20724 fetched directly, examined directly rather than screened from a broader hit list, matching the tracer convention above)
- **Query:** neo4j-graphrag-python current documentation — SC-B — 2026-08-20 — 1 hits, 1 survivor (canonical Read the Docs page for the officially maintained Neo4j GraphRAG Python package, cross-checked against its PyPI release record for the Published date)
- **Query:** microsoft/graphrag repository adoption signals — SC-C — 2026-08-20 — 1 hits, 1 survivor (GitHub REST API record for microsoft/graphrag, the reference implementation behind E-01/E-02's protocol)
- **Query:** STaRK semi-structured knowledge base retrieval benchmark — SC-D — 2026-08-20 — 1 hits, 1 survivor (stark.stanford.edu plus its GitHub repository and Hugging Face dataset card, all fetched directly)
- **Query:** all:"code graph" AND all:"large language model" — SC-A — 2026-08-20 — 10 hits, 1 survivor (arXiv API, sortBy=submittedDate; CGBridge/2512.07666 selected as the most directly graph-mediated code-understanding result)
- **Query:** all:"text-to-cypher" OR all:"graph database schema" AND all:"large language model" — SC-A — 2026-08-20 — 10 hits, 1 survivor (arXiv API, sortBy=submittedDate; TGMS/2607.10265 selected for its typed/deterministic operator-contract framing, directly relevant to D-04)
- **Query:** Sourcegraph code-navigation docs (sourcegraph.com/docs/code-navigation) — SC-B — 2026-08-20 — 1 hits, 0 survivors, null result (page returns HTTP 200 but is a client-side-rendered Next.js SPA with no server-side prose in the fetched HTML — no field-populating quote could be taken; not cited)
- **Query:** Glean code-indexing docs (glean.software) — SC-B — 2026-08-20 — 1 hits, 0 survivors, null result (same page-shape defect — client-side-rendered Docusaurus SPA, no server-side prose; not cited)
- **Query:** CodeQL about-codeql documentation — SC-B — 2026-08-20 — 1 hits, 1 survivor (codeql.github.com server-rendered docs page, found after the two SPA nulls above)
- **Query:** Neo4j Cypher manual constraints — SC-B — 2026-08-20 — 1 hits, 1 survivor (neo4j.com/docs/cypher-manual current build, cross-checked against neo4j.com/release-notes for the Published date)
- **Query:** Neo4j Change Data Capture documentation — SC-B — 2026-08-20 — 1 hits, 1 survivor (neo4j.com/docs/cdc current build, same release-notes cross-check)
- **Query:** joernio/joern repository adoption signals — SC-C — 2026-08-20 — 1 hits, 1 survivor (GitHub REST API record plus README, code property graph platform)
- **Query:** kuzudb/kuzu repository adoption signals — SC-C — 2026-08-20 — 1 hits, 0 survivors, currency null (GitHub REST API record and README fetched directly; the repository's own README states the project is being archived as of this fetch, with its last tagged release ten months prior to retrieval — a genuine adoption signal once, but not one this sweep weights as current practice; not cited, FalkorDB harvested in its place)
- **Query:** FalkorDB repository adoption signals — SC-C — 2026-08-20 — 1 hits, 1 survivor (GitHub REST API record plus README, found after the kuzu currency null above)
- **Query:** apache/age repository adoption signals — SC-C — 2026-08-20 — 1 hits, 1 survivor (GitHub REST API record plus README, PostgreSQL graph extension)
- **Query:** SWE-bench/SWE-bench repository and dataset — SC-D — 2026-08-20 — 1 hits, 1 survivor (GitHub REST API record plus README, cross-checked against the Hugging Face dataset card for the Published date)
- **Query:** neo4j/text2cypher-2024v1 dataset — SC-D — 2026-08-20 — 1 hits, 1 survivor (Hugging Face dataset card and README, fetched directly)
- **Query:** GraphRAG-Bench dataset — SC-D — 2026-08-20 — 5 hits, 1 survivor (Hugging Face dataset search for "GraphRAG-Bench"; the canonical `GraphRAG-Bench/GraphRAG-Bench` organization account selected over four unofficial forks/mirrors)
- **Query:** all:"knowledge graph" AND all:"hygiene" — SC-A — 2026-08-20 — 1 hits, 0 survivors, null result (arXiv API; the sole hit, arXiv:2009.04915, predates the 2024-2026 recency window and does not describe a hygiene-invariant practice — run for the Graph integrity practice section, Task 3)
- **Query:** all:"knowledge graph" AND all:"consistency checking" — SC-A — 2026-08-20 — 6 hits, 0 survivors, null result (arXiv API; six 2024-2026 hits examined, none describing a checked hygiene invariant on a shared graph — closest were an HLS-verification agent and a privacy-policy/code consistency checker, neither matching D-04's framing — run for the Graph integrity practice section, Task 3)

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

### E-06 — CGBridge: a code-graph encoder pretrained on 270K graphs bridges structural semantics into an LLM via an external module

- **Source class:** SC-A
- **Subdomain:** code-architecture-graphs
- **Primary source:** https://arxiv.org/abs/2512.07666
- **Published:** 2025-12-08
- **Fetch-verified:** https://arxiv.org/abs/2512.07666 retrieved 2026-08-20; page title and "Submitted on" line match the arXiv abstract page for the same identifier
- **Quote:** "This paper proposes CGBridge, a novel plug-and-play method that enhances LLMs with Code Graph information through an external, trainable Bridge module."
- **Verdict:** validated
- **Bar applied:** D-07 evidence bar — primary source fetched directly (arXiv abstract HTML, retrieved 2026-08-20), publication date read off the fetched page's own submission line, quote copied verbatim from the fetched abstract text.
- **Relevance:** The code graph is the working medium a pretrained encoder and bridge module read structural semantics from; the scored deliverable is downstream code intelligence (generation, summarization, translation), not the graph, under D-02. Deliverable domain is `code-engineering` under D-03; subdomain is `code-architecture-graphs` under D-01.

### E-07 — TGMS: an agent-native bi-temporal graph management system exposes typed, deterministic operators with a content-addressed execution trace

- **Source class:** SC-A
- **Subdomain:** graph-db-schema
- **Primary source:** https://arxiv.org/abs/2607.10265
- **Published:** 2026-07-11
- **Fetch-verified:** https://arxiv.org/abs/2607.10265 retrieved 2026-08-20; page title and "Submitted on" line (v2, last revised 24 Jul 2026) match the arXiv abstract page for the same identifier
- **Quote:** "We present TGMS, a bi-temporal property graph management system that exposes thirteen verified temporal operators as agent tools. Each operator is typed, deterministic, bounded, cost-guarded, and bi-temporal by default."
- **Verdict:** validated
- **Bar applied:** D-07 evidence bar — primary source fetched directly (arXiv abstract HTML, retrieved 2026-08-20), publication date read off the fetched page's own submission line, quote copied verbatim from the fetched abstract text.
- **Relevance:** The bi-temporal property graph and its typed operator contracts are the working medium the LLM plans over while the system performs all graph computation; the scored deliverable is the verified answer to a temporal graph question, not the graph itself, under D-02. Deliverable domain is `qa-retrieval` under D-03; subdomain is `graph-db-schema` under D-01. Directly relevant to D-04's graph-integrity question — typed operator contracts and a content-addressed execution trace are exactly the discipline D-04 asks whether the harness should adopt.

### E-08 — CodeQL: a language and toolchain treating codebases as queryable structure for cross-codebase vulnerability analysis

- **Source class:** SC-B
- **Subdomain:** code-architecture-graphs
- **Primary source:** https://codeql.github.com/docs/codeql-overview/about-codeql/
- **Published:** 2026-08-12
- **Fetch-verified:** https://codeql.github.com/docs/codeql-overview/about-codeql/ retrieved 2026-08-20; page content matches the current CodeQL documentation build, whose CLI/Action bundle's latest release (codeql-bundle-v2.26.3) was published 2026-08-12 per the GitHub REST API record for `github/codeql-action`
- **Quote:** "CodeQL is a language and toolchain for code analysis. It is designed to allow security researchers to scale their knowledge of a single vulnerability to identify variants of that vulnerability across a wide range of codebases."
- **Verdict:** validated
- **Bar applied:** D-07 evidence bar — the documentation page carries no publish-date line of its own, so Published is taken from the latest release timestamp of the actively-maintained CodeQL Action bundle, fetched directly rather than recalled (the same technique used for E-03's Neo4j docs); the quote is verbatim from the fetched docs page. Two other vendor code-graph documentation sites were tried first (Sourcegraph, Glean) and found to be client-side-rendered SPAs carrying no server-side prose to quote from — logged as null results in the search log above rather than cited.
- **Relevance:** CodeQL's per-codebase relational database of code facts is the working medium queries run over; the scored deliverable is a found vulnerability or variant, not the database itself, under D-02. Deliverable domain is `code-engineering` under D-03; subdomain is `code-architecture-graphs` under D-01.

### E-09 — Neo4j Cypher constraints: typed and existence contracts enforced directly on the property graph's labels and relationship types

- **Source class:** SC-B
- **Subdomain:** graph-db-schema
- **Primary source:** https://neo4j.com/docs/cypher-manual/current/constraints/
- **Published:** 2026-08-05
- **Fetch-verified:** https://neo4j.com/docs/cypher-manual/current/constraints/ retrieved 2026-08-20; page content matches the current Cypher Manual build, cross-checked against neo4j.com/release-notes, whose most current entry (Neo4j 2026.07.1) is dated 5 August 2026
- **Quote:** "Property existence constraints: ensure that a property exists either for all nodes with a specific label or for all relationships with a specific type."
- **Verdict:** validated
- **Bar applied:** D-07 evidence bar — Published taken from the current Neo4j release date per neo4j.com/release-notes (the docs page itself carries no dateline), fetched directly; the quote is verbatim from the fetched docs page (the "Enterprise Edition" UI badge adjacent to the sentence is markup, not prose, and is not part of the quoted clause).
- **Relevance:** Directly a graph-integrity practice under D-04 — property type, existence and key constraints are typed contracts enforced on the shared property graph itself. The graph carrying these constraints is still the working medium for whatever application queries it, under D-02. Deliverable domain is `code-engineering` under D-03 (schema and application-data integrity); subdomain is `graph-db-schema` under D-01.

### E-10 — Neo4j Change Data Capture: an ordered, queryable stream of graph mutations for replaying changes into other systems

- **Source class:** SC-B
- **Subdomain:** graph-db-schema
- **Primary source:** https://neo4j.com/docs/cdc/current/
- **Published:** 2026-08-05
- **Fetch-verified:** https://neo4j.com/docs/cdc/current/ retrieved 2026-08-20; page content matches the current CDC documentation build, same release-notes cross-check as E-09
- **Quote:** "Change Data Capture (CDC) allows you to capture and track changes to your database in real-time, enabling you to keep your other data sources up to date with Neo4j."
- **Verdict:** validated
- **Bar applied:** D-07 evidence bar — Published taken from the same current-release cross-check as E-09; the quote is verbatim from the fetched docs page.
- **Relevance:** Directly a graph-integrity practice under D-04 — CDC is the field's mechanism for making mutations to a shared graph replayable and consumable by downstream systems, the closest single-vendor match to D-04's "replayable mutations" phrase found in this sweep. Deliverable domain is `code-engineering` under D-03 (data-integration and replication tooling); subdomain is `graph-db-schema` under D-01.

### E-11 — Joern: an open-source platform generating code property graphs stored in a custom graph database, queried with a Scala DSL

- **Source class:** SC-C
- **Subdomain:** code-architecture-graphs
- **Primary source:** https://github.com/joernio/joern
- **Published:** 2026-08-19
- **Fetch-verified:** https://github.com/joernio/joern retrieved 2026-08-20; the GitHub REST API record matches the repository's star count, fork count and latest release tag at fetch time
- **Quote:** "Joern is a platform for analyzing source code, bytecode, and binary executables. It generates code property graphs (CPGs), a graph representation of code for cross-language code analysis. Code property graphs are stored in a custom graph database."
- **Verdict:** validated
- **Bar applied:** D-05 SC-C adoption signal — 3,431 stars and 442 forks (non-trivial for a niche static-analysis research tool), plus a tagged release (v4.0.606, published 2026-08-19, the day before retrieval) inside the recency window, showing an active release cadence; both figures read directly off the fetched GitHub REST API response. Quote copied verbatim from the fetched README.
- **Relevance:** The code property graph is explicitly the working medium queries run over for vulnerability discovery; the scored deliverable is a found vulnerability, not the graph itself, under D-02. Deliverable domain is `code-engineering` under D-03; subdomain is `code-architecture-graphs` under D-01.

### E-12 — FalkorDB: a graph database purpose-built as a low-latency knowledge graph backend for LLM applications

- **Source class:** SC-C
- **Subdomain:** graph-db-schema
- **Primary source:** https://github.com/FalkorDB/FalkorDB
- **Published:** 2026-08-13
- **Fetch-verified:** https://github.com/FalkorDB/FalkorDB retrieved 2026-08-20; the GitHub REST API record matches the repository's star count, fork count and latest release tag at fetch time
- **Quote:** "Our goal is to build a high-performance Knowledge Graph tailored for Large Language Models (LLMs), prioritizing exceptionally low latency to ensure fast and efficient information delivery through our Graph Database."
- **Verdict:** validated
- **Bar applied:** D-05 SC-C adoption signal — 5,589 stars and 431 forks, plus a tagged release (v4.20.3, published 2026-08-13) inside the recency window; both figures read directly off the fetched GitHub REST API response. Quote copied verbatim from the fetched README.
- **Relevance:** Explicitly positions its property graph as the working medium for LLM-facing knowledge delivery, matching D-02's framing directly rather than by inference. Deliverable domain is `qa-retrieval` under D-03; subdomain is `graph-db-schema` under D-01.

### E-13 — Apache AGE: a PostgreSQL extension adding a property graph model and openCypher on top of an existing relational database

- **Source class:** SC-C
- **Subdomain:** graph-db-schema
- **Primary source:** https://github.com/apache/age
- **Published:** 2026-07-09
- **Fetch-verified:** https://github.com/apache/age retrieved 2026-08-20; the GitHub REST API record matches the repository's star count, fork count and latest release tag at fetch time
- **Quote:** "Apache AGE is an extension for PostgreSQL that enables users to leverage a graph database on top of the existing relational databases."
- **Verdict:** validated
- **Bar applied:** D-05 SC-C adoption signal — 4,764 stars and 521 forks, plus a tagged release (PG18/v1.8.0-rc0, published 2026-07-09) inside the recency window, and Apache Software Foundation governance as a named-project signal; figures read directly off the fetched GitHub REST API response. Quote copied verbatim from the fetched README (markdown link syntax around "Apache AGE" removed, no prose altered).
- **Relevance:** A multi-model storage layer where the graph is a queryable structure layered onto existing relational data, admissible under D-02 as a working-medium practice for applications that query it via openCypher. Deliverable domain is `code-engineering` under D-03; subdomain is `graph-db-schema` under D-01.

### E-14 — SWE-bench: real GitHub issues scored by running each repository's own test suite against a generated patch

- **Source class:** SC-D
- **Subdomain:** code-architecture-graphs
- **Primary source:** https://github.com/SWE-bench/SWE-bench
- **Published:** 2025-03-03
- **Fetch-verified:** https://github.com/SWE-bench/SWE-bench retrieved 2026-08-20; GitHub REST API record (5,671 stars, pushed 2026-08-18) matches the fetched repository; Published cross-checked against the Hugging Face dataset card `princeton-nlp/SWE-bench`, lastModified 2025-03-03
- **Quote:** "SWE-bench is a benchmark for evaluating large language models on real world software issues collected from GitHub. Given a codebase and an issue, a language model is tasked with generating a patch that resolves the described problem."
- **Verdict:** validated
- **Bar applied:** D-07 evidence bar plus the benchmark-specific detail this sweep requires — ground truth is each task instance's real, human-authored resolving patch and its associated fail-to-pass/pass-to-pass test set, both mined from the source repository's actual commit history; a submission is scored by applying the candidate's generated patch inside a reproducible Docker evaluation image and running the repository's own tests via the `swebench eval` CLI, reading a resolution as correct only if the previously-failing tests now pass and the previously-passing tests still pass. Read directly off the fetched README, not recalled.
- **Relevance:** SWE-bench is not itself graph-native, but it is the deliverable-side oracle that the code-graph systems surveyed in this subdomain (E-06, E-11) and several E-06-adjacent papers found during search (RepoGraph, CodexGraph, GraphCodeAgent) are increasingly scored against — the graph is the working medium, SWE-bench resolution is the scored deliverable, the cleanest instance of D-02's framing this sweep found. Deliverable domain is `code-engineering` under D-03; subdomain is `code-architecture-graphs` under D-01.

### E-15 — Neo4j-Text2Cypher (2024): a 44,387-instance question/schema/cypher dataset for training and scoring text-to-Cypher generation

- **Source class:** SC-D
- **Subdomain:** graph-db-schema
- **Primary source:** https://huggingface.co/datasets/neo4j/text2cypher-2024v1
- **Published:** 2025-08-06
- **Fetch-verified:** https://huggingface.co/datasets/neo4j/text2cypher-2024v1 retrieved 2026-08-20; Hugging Face dataset API record (`lastModified: 2025-08-06`) matches the fetched dataset card
- **Quote:** "The Neo4j-Text2Cypher (2024) Dataset brings together instances from publicly available datasets, cleaning and organizing them for smoother use."
- **Verdict:** validated
- **Bar applied:** D-07 evidence bar plus the benchmark-specific detail this sweep requires — ground truth is the gold `cypher` field paired with each `question` and its `schema`; a submission is scored by comparing its generated Cypher query against the gold query for the same question/schema pair, using the dataset's held-out 4,833-instance test split (of 44,387 total instances). Read directly off the fetched dataset card, not recalled.
- **Relevance:** The database schema supplied per-instance is the working medium a correct query must respect; the scored deliverable is the generated Cypher query, not the graph itself, under D-02. Deliverable domain is `code-engineering` under D-03 (query generation against a schema); subdomain is `graph-db-schema` under D-01.

### E-16 — GraphRAG-Bench: a difficulty-graded benchmark evaluating the full GraphRAG pipeline from graph construction to final generation

- **Source class:** SC-D
- **Subdomain:** knowledge-graphs
- **Primary source:** https://huggingface.co/datasets/GraphRAG-Bench/GraphRAG-Bench
- **Published:** 2025-05-14
- **Fetch-verified:** https://huggingface.co/datasets/GraphRAG-Bench/GraphRAG-Bench retrieved 2026-08-20; the fetched README's News section states the dataset was released 2025-05-14, matching the canonical organization account selected over four unofficial forks found in the same Hugging Face search
- **Quote:** "GraphRAG-Bench features a comprehensive dataset with tasks of increasing difficulty, covering fact retrieval, complex reasoning, contextual summarization, and creative generation, and a systematic evaluation across the entire pipeline, from graph construction and knowledge retrieval to final generation."
- **Verdict:** validated
- **Bar applied:** D-07 evidence bar — Published taken from the dataset's own stated release date in its README News section, fetched directly; the quote is verbatim from the fetched dataset card.
- **Relevance:** Scores the full GraphRAG pipeline against the constructed graph as the working medium and the final generated answer as the deliverable, directly matching D-02's framing; the benchmark's own motivating question — whether graph structure measurably helps over vanilla RAG — is itself evidence that the working-medium framing is contested and worth measuring, not assumed. Deliverable domain is `qa-retrieval` under D-03; subdomain is `knowledge-graphs` under D-01.

## Graph integrity practice

This section reports what the field's practice actually looks like for the three graph-integrity
mechanisms D-04 names — typed or schema-constrained graph contracts, hygiene invariants, and replayable
mutations. **It reports; it does not decide.** Whether this harness's own shared graph adopts any of this
discipline is a selection-time question under D-04, and nothing below should be read as an answer to it.

### Typed or schema-constrained graph contracts

Two distinct mechanisms surfaced, at two different layers. `E-09` (Neo4j Cypher constraints) is the
database-layer version: property type constraints, existence constraints and key constraints are
declared on a label or relationship type and enforced by the DBMS itself at write time — a type or shape
violation is rejected by the graph, not caught downstream by application code. `E-07` (TGMS) is the
agent-tool-layer version: each of its thirteen temporal operators is declared "typed, deterministic,
bounded, cost-guarded" as an agent-callable contract, so the constraint discipline sits on the interface
an LLM plans against rather than on the graph's storage layer. The field has both layers; they are not
substitutes for one another, and a system could plausibly adopt neither, one, or both.

### Hygiene invariants

The clearest field-level evidence is again `E-09`: existence constraints and key (uniqueness) constraints
are continuously checked hygiene invariants, enforced by the DBMS on every write rather than run
periodically as a batch job. Beyond database-level constraints, this sweep found little dedicated
practice literature under the specific framing "hygiene invariant" or "consistency check" applied to a
shared, LLM-mediated graph — two targeted academic searches (`all:"knowledge graph" AND all:"hygiene"`,
`all:"knowledge graph" AND all:"consistency checking"`, both logged in the search log above) returned
either an out-of-window result or matches that check something else (HLS-code verification, privacy-policy/
code consistency) rather than a checked invariant on the graph's own structure. Read this as a genuine gap
rather than an oversight: constraint-style hygiene is well established inside graph databases (`E-09`),
but a distinct literature of hygiene checks purpose-built for an LLM-agent-mediated shared graph did not
surface in this sweep.

### Replayable mutations

`E-10` (Neo4j Change Data Capture) is the closest single match this sweep found to D-04's "replayable
mutations" phrase: an ordered, queryable stream of create/update/delete events that other systems can
consume to replicate or replay changes made to the graph. `E-07` (TGMS) contributes a related but distinct
mechanism — it separates valid time from transaction time and checks claims "against the content-addressed
execution trace," which is a form of verifiable replay over an agent's own operator calls rather than over
raw graph mutations. Together they show two different targets for "replayable": replaying what changed in
the graph (CDC) versus replaying what an agent did to produce an answer (TGMS's trace). The field does not
appear to have converged on one of these as the default; both are current, live practice.

## Coverage

**Protocol applied as written.** No query, source, or exclusion boundary was widened once the sweep was
under way, matching `SEARCH-PROTOCOL.md`'s own closing discipline statement. No amendment line was added
to the protocol during this plan — every field the four source classes' natural page shapes needed to
populate (including the two vendor-doc pages with no dateline of their own, `E-03` and `E-09`/`E-10`) was
populated by cross-checking a correlated, independently fetched source (a PyPI release timestamp, a
vendor's own release-notes page) rather than by widening what the protocol requires.

**Entries by source class** (against each class's declared floor of 4):

| Class | Description | Count | Floor | Entries |
|---|---|---|---|---|
| SC-A | Academic (arXiv/conference) | 4 | 4 | E-01, E-02, E-06, E-07 |
| SC-B | Vendor/framework documentation | 4 | 4 | E-03, E-08, E-09, E-10 |
| SC-C | Open-source repositories | 4 | 4 | E-04, E-11, E-12, E-13 |
| SC-D | Public benchmarks/datasets | 4 | 4 | E-05, E-14, E-15, E-16 |

**Entries by subdomain** (against each subdomain's declared floor of 4):

| Subdomain | Description | Count | Floor | Entries |
|---|---|---|---|---|
| knowledge-graphs | GraphRAG, temporal KGs, entity resolution | 6 | 4 | E-01, E-02, E-03, E-04, E-05, E-16 |
| code-architecture-graphs | Code and architecture graphs | 4 | 4 | E-06, E-08, E-11, E-14 |
| graph-db-schema | Graph-database and schema practice | 6 | 4 | E-07, E-09, E-10, E-12, E-13, E-15 |

Total in-scope entries: **16**. No floor above is met with the help of an out-of-scope or background
entry — every entry counted in both tables carries a real class and subdomain and is not marked dropped.

**Out-of-scope entries:** 0. This sweep's search queries were themselves shaped by D-02's working-medium
framing (graph-mediated code-engineering and qa-retrieval practice), so no leading search result surfaced
whose only deliverable domain was analysis or research synthesis; the D-03 exclusion rule was applied as
written, and applying it here produced no exclusions to record rather than a silent omission.

**Background entries:** 0. `E-00` in `SEARCH-PROTOCOL.md` is the format specimen only, is not part of
this document, and is not counted toward any floor per the protocol's own text.

**Queries that returned nothing (null results), by kind:**

| Kind | Count | Queries |
|---|---|---|
| Page-shape null (client-rendered SPA, no server prose to quote) | 2 | Sourcegraph code-navigation docs; Glean docs |
| Currency null (real adoption signal once, not current practice) | 1 | kuzudb/kuzu (mid-archival at fetch time) |
| Topic null (no in-window / on-topic result) | 2 | `all:"knowledge graph" AND all:"hygiene"`; `all:"knowledge graph" AND all:"consistency checking"` |

Five null results total, all logged above with their date and outcome rather than papered over with a
recalled substitute.
