# Validation ledger — graph engineering harness sweep (REQ-74)

**Phase:** 16-graph-engineering-harness-unconditional-pivot · **Author:** Robert Li

This ledger independently re-fetches each survey entry's primary source and checks it against what the
re-fetch returns, not against what the survey says about it. Verdicts and retrieval dates here are this
pass's own, never copied from the entry under check.

**Pipeline-proof caveat, stated plainly:** this plan's discovery task (Task 2, which wrote `E-01`) and this
validation task (Task 3, which writes `V-01`) run under one executing agent. That is weaker than the
separate-pass discipline the evidence bar asks for — the same agent that harvested the claim is also the
one checking it here, even though the check is a fresh, independent re-fetch rather than a re-read of its
own prior work. `V-01` below is the pipeline proof: it demonstrates the mechanics of the fetch-quote-verdict
chain end to end, not a fully independent second opinion. The full validation pass in 16-03 re-checks every
survey entry, including this one, with its own retrieval dates gathered in that later pass. `E-01` must not
be treated as already-validated in the sense 16-03's pass requires — 16-03 re-checks it in full regardless
of the `confirmed`/`kept` verdict recorded here.

**16-03 supersession note:** the self-graded pipeline-proof verdict this ledger originally recorded as
`V-01` — written by the same agent, in the same pass, that harvested `E-01` — has been removed as a formal
ledger entry by this plan's Task 2, exactly as the caveat above always said it would be. Its content is not
lost: it survives verbatim in this repository's git history at the commit that closed 16-03's Task 1
(`test(16-03): re-fetch the tracer entry...`). `E-01`'s claim is checked in this ledger exactly once, at
`V-02` below, by this pass's own independent fetch and its own retrieval date. `V-02` is the entry every
downstream bijection and dossier check resolves against for `E-01`.

### V-02 — E-01

- **Claim under check:** E-01
- **Re-fetched:** https://arxiv.org/abs/2404.16130 retrieved 2026-08-20; page title, submission date and quote independently confirmed by this pass's own fetch, read before the survey's prose summary
- **Verdict:** confirmed
- **Disposition:** kept

This is the pass's own independent re-check of the tracer entry, run under `16-03`'s separate-pass
discipline rather than reusing `V-01` above. The URL, publication date and quote were read off the survey
entry first (not its prose summary), then the source was fetched fresh via `rtk proxy curl` to a scratch
file, and the fetched text alone was checked against those three fields. The fetched abstract page's
`<title>` reads `[2404.16130] From Local to Global: A Graph RAG Approach to Query-Focused Summarization`,
matching E-01's title; its submission line reads `[Submitted on 24 Apr 2024 (v1), last revised 19 Feb 2025
(this version, v2)]`, matching the 2024-04-24 Published date E-01 records (the v1 date, not the v2 revision
date); and E-01's quote — "Our approach uses an LLM to build a graph index in two stages: first, to derive
an entity knowledge graph from the source documents, then to pregenerate community summaries for all
groups of closely related entities." — is present verbatim in the fetched page's `og:description` /
`citation_abstract` meta content and its rendered Abstract text. Retrieval date 2026-08-20 is not earlier
than E-01's own recorded retrieval date (2026-08-20, same day); the ordering rule is satisfied by equality,
which is the correct edge case for a re-check run on the day of harvest.

### V-03 — E-02

- **Claim under check:** E-02
- **Re-fetched:** https://arxiv.org/abs/2410.20724 retrieved 2026-08-20; page title, submission date and quote all matched independently in the fetched abstract text
- **Verdict:** confirmed
- **Disposition:** kept

The fetched `<title>` reads `[2410.20724] Simple Is Effective: The Roles of Graphs and Large Language
Models in Knowledge-Graph-Based Retrieval-Augmented Generation`, matching E-02's title. The submission line
reads `[Submitted on 28 Oct 2024 (v1), last revised 5 Feb 2025 (this version, v4)]` — the v1 date,
2024-10-28, matches E-02's Published. E-02's quote — "We introduce SubgraphRAG, extending the KG-based RAG
framework that retrieves subgraphs and leverages LLMs for reasoning and answer prediction." — is present
verbatim in the fetched `citation_abstract`/`og:description` content and the rendered Abstract text. Source
class SC-A and subdomain knowledge-graphs both confirmed against the fetched abstract's own subject matter.

### V-04 — E-03

- **Claim under check:** E-03
- **Re-fetched:** https://neo4j.com/docs/neo4j-graphrag-python/current/ retrieved 2026-08-20; quote matched verbatim, and the negative check re-run independently: neither "1.18.0" nor "v1.18" appears anywhere in the fetched docs page HTML
- **Verdict:** confirmed
- **Disposition:** kept

The fetched docs page contains the sentence "This package contains the official Neo4j GraphRAG features for
Python." verbatim, matching E-03's quote. A fresh grep of the fetched HTML confirms neither version string
the entry claims is absent from the page actually appears, independently reconfirming E-03's own negative
check rather than trusting it. `https://pypi.org/pypi/neo4j-graphrag/json` was fetched separately: `info.version`
reads `1.18.0`, and the `releases["1.18.0"]` upload timestamp reads `2026-06-24T09:12:03.525569Z`, matching
E-03's Published date (2026-06-24) exactly. Source class SC-B and subdomain knowledge-graphs both confirmed.

### V-05 — E-04

- **Claim under check:** E-04
- **Re-fetched:** https://github.com/microsoft/graphrag retrieved 2026-08-20; quote matched verbatim, api.github.com/repos/microsoft/graphrag cross-checked independently
- **Verdict:** confirmed
- **Disposition:** kept

Quote — "The GraphRAG project is a data pipeline and transformation suite that is designed to extract
meaningful, structured data from unstructured text using the power of LLMs." — found verbatim on the fetched
repository page. The fetched GitHub REST API record reads 35,588 stars (exact match to E-04's 35,588) and
3,742 forks — one more than E-04's recorded 3,741. A star/fork count is a live counter by construction; a
one-fork drift within the same calendar day as the survey's own retrieval is the expected behaviour of a
changing source, not a misrecorded figure, so this is noted rather than treated as a refutation. A separate
fetch of `api.github.com/repos/microsoft/graphrag/releases/latest` returned tag `v3.1.1` published
`2026-07-18T01:23:18Z`, matching E-04's Published date and its cited release tag exactly. The README's
"largely in maintenance mode" caveat is still present verbatim. Source class SC-C and subdomain
knowledge-graphs both confirmed.

### V-06 — E-05

- **Claim under check:** E-05
- **Re-fetched:** https://stark.stanford.edu/ retrieved 2026-08-20; https://raw.githubusercontent.com/snap-stanford/stark/main/README.md retrieved 2026-08-20; https://huggingface.co/api/datasets/snap-stanford/stark retrieved 2026-08-20 — all three sources E-05 itself cites, none newly discovered
- **Verdict:** confirmed
- **Disposition:** kept

The site's raw HTML wraps two clauses of the quoted sentence in `<span class="highlight1">`/`<span
class="highlight2">` styling tags (`Semi-structured Retrieval Benchmark` and the product/paper/biomedicine
clause); stripping that inline markup, the sentence reads exactly E-05's recorded quote — the same
markup-vs-prose situation E-09's own Bar applied field independently documents for a different vendor's
page. The fetched README documents `eval.py --dataset {amazon,mag,prime}` scoring against
`node_id -> torch.Tensor` candidate embeddings across three named datasets, matching E-05's Bar applied
description of the constructed knowledge bases and the scoring script. The Hugging Face dataset API record
for `snap-stanford/stark` reads `lastModified: 2024-10-20T17:06:53.000Z`, matching E-05's Published date.
Source class SC-D and subdomain knowledge-graphs both confirmed.

### V-07 — E-06

- **Claim under check:** E-06
- **Re-fetched:** https://arxiv.org/abs/2512.07666 retrieved 2026-08-20; title and submission date matched, quote did not
- **Verdict:** refuted
- **Disposition:** reworked

Title (`[2512.07666] Bridging Code Graphs and Large Language Models for Better Code Understanding`) and
submission line (`[Submitted on 8 Dec 2025]`, matching E-06's 2025-12-08 Published) both confirmed. The
recorded quote does not appear verbatim in the fetched abstract. The fetched sentence actually reads: "To
address these limitations, this paper proposes CGBridge, a novel plug-and-play method that enhances LLMs
with Code Graph information through an external, trainable Bridge module." E-06's quote drops the leading
clause "To address these limitations, " and recapitalizes the following "this" to "This", producing a
grammatically complete sentence that is not a literal substring of the source — an edited excerpt presented
as a verbatim quote, the exact D-07 failure mode this pass exists to catch. This is not a markup artifact
like V-06/V-10/V-12/V-14/V-16/V-17 below; real words were removed and a letter recased. The paper's
identity, publication date, and its substantive relevance (a pretrained code-graph encoder bridged into a
frozen LLM via an external module) are independently confirmed by this same fetch and are not in question —
only the Quote field is at fault. Disposition reworked: Task 3 replaces E-06's Quote field with a literal
substring of the fetched abstract, naming `V-07` as the reason for the change.

### V-08 — E-07

- **Claim under check:** E-07
- **Re-fetched:** https://arxiv.org/abs/2607.10265 retrieved 2026-08-20; title, submission date and quote all matched independently
- **Verdict:** confirmed
- **Disposition:** kept

Title (`[2607.10265] TGMS: An Agent-Native Bi-Temporal Graph Management System`), submission line
(`[Submitted on 11 Jul 2026 (v1), last revised 24 Jul 2026 (this version, v2)]` — v1 date matching E-07's
2026-07-11 Published) and the full quoted sentence all confirmed verbatim in the fetched abstract text.
Source class SC-A and subdomain graph-db-schema both confirmed.

### V-09 — E-08

- **Claim under check:** E-08
- **Re-fetched:** https://codeql.github.com/docs/codeql-overview/about-codeql/ retrieved 2026-08-20; quote matched verbatim; api.github.com/repos/github/codeql-action/releases/latest cross-checked independently
- **Verdict:** confirmed
- **Disposition:** kept

Quote — "CodeQL is a language and toolchain for code analysis. It is designed to allow security researchers
to scale their knowledge of a single vulnerability to identify variants of that vulnerability across a wide
range of codebases." — found verbatim on the fetched docs page, which still carries no dateline of its own.
The fetched `codeql-action` release record reads tag `codeql-bundle-v2.26.3`, `published_at:
2026-08-12T15:28:11Z`, matching E-08's Published date and cited bundle version exactly. Source class SC-B
and subdomain code-architecture-graphs both confirmed.

### V-10 — E-09

- **Claim under check:** E-09
- **Re-fetched:** https://neo4j.com/docs/cypher-manual/current/constraints/ retrieved 2026-08-20; quote matched verbatim once its own documented markup is excluded; https://neo4j.com/release-notes/ retrieved 2026-08-20 and cross-checked independently
- **Verdict:** confirmed
- **Disposition:** kept

The fetched page wraps "Property existence constraints" in an `<a class="xref page">` link and appends a
trailing `<span class="label label--enterprise-edition">Enterprise Edition</span>` badge after the quoted
sentence — exactly the two markup elements E-09's own Bar applied field already names. With those excluded,
the sentence matches E-09's quote exactly. The fetched release-notes page's banner reads "The most current
release of Neo4j is 2026.07.1", and the release entry itself is headed "5 August 2026" — matching E-09's
Published date exactly. Source class SC-B and subdomain graph-db-schema both confirmed.

### V-11 — E-10

- **Claim under check:** E-10
- **Re-fetched:** https://neo4j.com/docs/cdc/current/ retrieved 2026-08-20; quote matched verbatim; https://neo4j.com/release-notes/ retrieved 2026-08-20, same cross-check as V-10
- **Verdict:** confirmed
- **Disposition:** kept

Quote — "Change Data Capture (CDC) allows you to capture and track changes to your database in real-time,
enabling you to keep your other data sources up to date with Neo4j." — found verbatim on the fetched docs
page. Published cross-checked against the same `neo4j.com/release-notes/` fetch performed for V-10
(2026.07.1, 5 August 2026), matching E-10's Published date exactly. Source class SC-B and subdomain
graph-db-schema both confirmed.

### V-12 — E-11

- **Claim under check:** E-11
- **Re-fetched:** https://raw.githubusercontent.com/joernio/joern/master/README.md retrieved 2026-08-20 (the exact source github.com/joernio/joern renders); api.github.com/repos/joernio/joern cross-checked independently
- **Verdict:** confirmed
- **Disposition:** kept

The raw README hard-wraps the quoted sentence across three physical lines (standard ~80-column markdown
formatting, not an edited excerpt); after normalizing whitespace, the sentence matches E-11's quote exactly.
The fetched GitHub REST API record reads 3,431 stars and 442 forks (exact match to both figures E-11
records), and the latest tagged release is `v4.0.606`, `published_at: 2026-08-19T08:44:56Z` — one day
before the survey's own retrieval date, matching E-11's Published date and its "active release cadence"
claim. Source class SC-C and subdomain code-architecture-graphs both confirmed.

### V-13 — E-12

- **Claim under check:** E-12
- **Re-fetched:** https://github.com/FalkorDB/FalkorDB retrieved 2026-08-20; quote matched verbatim; api.github.com/repos/FalkorDB/FalkorDB cross-checked independently
- **Verdict:** confirmed
- **Disposition:** kept

Quote — "Our goal is to build a high-performance Knowledge Graph tailored for Large Language Models (LLMs),
prioritizing exceptionally low latency to ensure fast and efficient information delivery through our Graph
Database." — found verbatim on the fetched repository page. The fetched GitHub REST API record reads 5,589
stars and 431 forks (exact match to both figures E-12 records), and the latest tagged release is `v4.20.3`,
`published_at: 2026-08-13T21:52:50Z` (exact match to E-12's Published date and cited tag). Source class
SC-C and subdomain graph-db-schema both confirmed.

### V-14 — E-13

- **Claim under check:** E-13
- **Re-fetched:** https://raw.githubusercontent.com/apache/age/master/README.md retrieved 2026-08-20 (the exact source github.com/apache/age renders); api.github.com/repos/apache/age cross-checked independently
- **Verdict:** confirmed
- **Disposition:** kept

The raw README's sentence reads `[Apache AGE](https://age.apache.org/#) is an extension for PostgreSQL that
enables users to leverage a graph database on top of the existing relational databases.`; after removing the
markdown link syntax around the subject noun, it matches E-13's quote exactly — precisely the normalization
E-13's own Bar applied field already documents. The fetched GitHub REST API record reads 4,764 stars and 521
forks (exact match to both figures E-13 records), and the latest tagged release is `PG18/v1.8.0-rc0`,
`published_at: 2026-07-09T00:21:23Z` (exact match). Source class SC-C and subdomain graph-db-schema both
confirmed.

### V-15 — E-14

- **Claim under check:** E-14
- **Re-fetched:** https://raw.githubusercontent.com/SWE-bench/SWE-bench/main/README.md retrieved 2026-08-20 (the exact source github.com/SWE-bench/SWE-bench renders); api.github.com/repos/SWE-bench/SWE-bench and the Hugging Face API for princeton-nlp/SWE-bench both cross-checked independently
- **Verdict:** confirmed
- **Disposition:** reworked

The corrected Bar applied claims (16-02's own post-completion fix, see that plan's SUMMARY deviation 2) were
independently re-derived rather than trusted: `grep -i "FAIL_TO_PASS\|PASS_TO_PASS"` against this fresh
fetch returns zero matches, reconfirming that terminology is genuinely absent rather than the prior
correction being self-consistent-but-wrong; `swebench eval verified --gold` and `swebench report <run_id> -d
verified # re-grade saved logs, no containers` both appear verbatim in the fetched README, matching E-14's
Bar applied exactly. The fetched GitHub REST API record reads 5,671 stars (exact match) and `pushed_at:
2026-08-18T23:53:40Z` (matching "pushed 2026-08-18"). The Hugging Face API for `princeton-nlp/SWE-bench`
reads `lastModified: 2025-03-03T05:28:08.000Z`, matching E-14's Published date exactly. One field-fidelity
finding on the Quote field itself: the raw README wraps "codebase", "issue" and "patch" in markdown italics
asterisks (`*codebase*`, `*issue*`, `*patch*`); E-14's recorded quote silently strips them. This is the same
class of pure-markup normalization E-13's own Bar applied field documents explicitly (`V-14` above) — E-14's
does not. The underlying sentence is otherwise unmodified (no words dropped, no recapitalization), unlike
`V-07`'s finding, so the verdict is confirmed rather than refuted; the disposition is reworked so Task 3 can
add the same explicit documentation to E-14's Bar applied that E-13 already carries, naming `V-15` as the
reason.

### V-16 — E-15

- **Claim under check:** E-15
- **Re-fetched:** https://huggingface.co/datasets/neo4j/text2cypher-2024v1 retrieved 2026-08-20; https://huggingface.co/api/datasets/neo4j/text2cypher-2024v1 retrieved 2026-08-20
- **Verdict:** confirmed
- **Disposition:** kept

The dataset card's description is delivered inside a JSON data island embedded in the page; that JSON string
carries a literal two-character `\n` escape sequence at the point where the rendered prose has a line break
("publicly available datasets, \ncleaning and organizing them"). Normalizing that escape sequence to a space
reproduces E-15's quote exactly. The same fetch confirms the field/split facts E-15's corrected Bar applied
states: a `question`/`schema`/`cypher` triplet, 44,387 total instances with 39,554 for training and 4,833
for testing (both counts matching exactly), and no exact-match/execution-match scoring method stated
anywhere on the card, reconfirming the prior correction's negative claim rather than trusting it. The
Hugging Face API record reads `lastModified: 2025-08-06T12:07:10.000Z`, matching E-15's Published date
exactly. Source class SC-D and subdomain graph-db-schema both confirmed.

### V-17 — E-16

- **Claim under check:** E-16
- **Re-fetched:** https://huggingface.co/datasets/GraphRAG-Bench/GraphRAG-Bench retrieved 2026-08-20; https://huggingface.co/api/datasets/GraphRAG-Bench/GraphRAG-Bench retrieved 2026-08-20
- **Verdict:** confirmed
- **Disposition:** kept

Quote matched after the same `\n`-escape normalization as V-16. The fetched README's News section states
the release date `2025-05-14` verbatim, matching E-16's Published date exactly. The Hugging Face API's own
`lastModified` field for this dataset reads `2025-07-13T04:40:54.000Z` — a later revision timestamp than
Published — but E-16's own Bar applied field already states Published is sourced from the README's stated
release date, not from `lastModified`, so this is not a discrepancy, just a confirmation that the two dates
answer different questions. Source class SC-D and subdomain knowledge-graphs both confirmed.

## Totals

- **Totals:** confirmed=15, refuted=1, unverifiable=0
