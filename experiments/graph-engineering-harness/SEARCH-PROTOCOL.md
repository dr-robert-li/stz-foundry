# Search protocol — graph engineering harness sweep (REQ-74)

**Phase:** 16-graph-engineering-harness-unconditional-pivot · **Frozen:** 2026-08-20 · **Author:** Robert Li

This protocol is the sweep's own rules, written and committed before the sweep exists. The planning
record each decision below transcribes is not committed to this repository, so this document carries
the operative values in its own words rather than referring to them. Once the first survey entry is
committed, this protocol is not widened, narrowed or reworded — a defect found later is recorded as a
dated amendment, never a silent edit.

## Scope

### D-01 — Breadth

The sweep is a broad survey across all three graph subdomains below. Narrowing happens at candidate
selection, never at sweep time. Each subdomain has a machine-readable identifier and its own minimum
entry count.

- **Subdomain:** knowledge-graphs — GraphRAG, temporal knowledge graphs, entity resolution
  - **Minimum entries:** 4
- **Subdomain:** code-architecture-graphs — code and architecture graphs
  - **Minimum entries:** 4
- **Subdomain:** graph-db-schema — graph-database and schema practice
  - **Minimum entries:** 4

### D-05 — Admissible source classes

Four source classes are admissible, each with an identifier and its own minimum entry count.

- **Source class:** SC-A — academic (arXiv and conference)
  - **Minimum entries:** 4
- **Source class:** SC-B — vendor and framework documentation (Microsoft GraphRAG, Neo4j, LlamaIndex, LangGraph)
  - **Minimum entries:** 4
- **Source class:** SC-C — open-source repositories carrying real adoption signals
  - **Minimum entries:** 4
- **Source class:** SC-D — public benchmarks and datasets
  - **Minimum entries:** 4

**SC-C adoption signal, defined before the sweep runs, in checkable terms:** a repository counts as
carrying a real adoption signal if it shows at least one of — a star count that is non-trivial for its
age and niche, a non-zero dependent-package count reported by its host, a release cadence showing at
least one tagged release in the protocol's 2024-2026 recency window, or a named production user stated
in the repository's own documentation or README. This is left to be read off the repository's own public
signals at sweep time, not to the sweep's unstated judgement.

### D-06 — Recency

- **Recency window:** 2024-2026

Only work published or last substantively revised in 2024, 2025 or 2026 may be cited as evidence of
current practice. Foundational work is admissible only inside a separately headed background section
(entries headed `### B-NN`), labelled as background, never as current-practice evidence. Background
entries are exempt from this window by construction.

### D-02 — Weighting

The harness work product this sweep evaluates practice against is graph-mediated work: the shared graph
is the agents' working memory and context, and the deliverable is something else produced through it.
Fitness measures the downstream deliverable, not the graph. The sweep weights practices that describe
graphs used as a working medium above practices that treat the graph itself as the scored artifact; the
latter are admissible as context but are recorded as such in the entry's relevance field.

### D-03 — Deliverable domains and exclusion rule

Two deliverable domains are admissible, each with an identifier:

- **Deliverable domain:** code-engineering — code and engineering tasks
- **Deliverable domain:** qa-retrieval — question-answering and retrieval tasks

Analysis and research-synthesis deliverables are out of scope because their fail-closed oracle story is
weak. This is an exclusion rule the sweep applies, not a silent omission: a practice whose only
deliverable domain is analysis or research synthesis is recorded in the graph-integrity or relevance
prose as out-of-scope with that reason, rather than dropped without a trace.

### D-04 — Graph integrity

Whether the shared graph itself gets contract discipline — typed graph contracts, hygiene invariants,
replayable mutations — is delegated to this research and decided at selection, never by the sweep. The
survey reports what graph-integrity practice exists in the field under its own dedicated section,
headed exactly:

`## Graph integrity practice`

That section names at least one survey entry id (`E-NN`) that supports what it reports. The sweep is
forbidden from deciding the graph-integrity question itself; it only reports the field's practice.

### D-07 — Evidence bar

Every cited source is fetched and read. Model recall is not an admissible source for any entry — survey
entry or background entry alike. Each entry records the primary source URL, the publication date, a
fetch-verified line with the retrieval date and what the re-fetch matched, a verbatim supporting quote
from the fetched text, a verdict, and the bar the claim was checked against.

## Entry format

The sweep writes one entry per harvested practice as an `### E-NN — <title>` heading (background
entries as `### B-NN — <title>`), followed by nine labelled field lines, each a markdown list item: a
hyphen, one space, the bolded label with its colon inside the bold markers, one space, then the value.
The nine labels, in this exact order and exact spelling, are:

`- **Source class:**`, `- **Subdomain:**`, `- **Primary source:**`, `- **Published:**`,
`- **Fetch-verified:**`, `- **Quote:**`, `- **Verdict:**`, `- **Bar applied:**`, `- **Relevance:**`

Field value conventions, pinned so the specification and the checks cannot drift apart:

- **Source class** is one of `SC-A`, `SC-B`, `SC-C`, `SC-D`.
- **Subdomain** is one of `knowledge-graphs`, `code-architecture-graphs`, `graph-db-schema`.
- **Primary source** is an `http://` or `https://` URL.
- **Published** is an ISO date, `YYYY-MM-DD`.
- **Fetch-verified** is `<url> retrieved <YYYY-MM-DD>; <what the re-fetch matched>` — the URL first,
  then the literal word `retrieved` followed by the retrieval date, then a semicolon and a short note.
- **Quote** is a verbatim excerpt from the fetched text, wrapped in straight double quotes:
  `"the exact clause taken from the source"`.
- **Verdict** (the researcher's own read, not yet independently checked) is one of `validated`,
  `unvalidated`, `unverifiable`.
- **Bar applied** is a short prose statement of what the claim was checked against.
- **Relevance** is a short prose statement of the entry's relevance to the graph-mediated-work framing
  of D-02, and names the D-03 exclusion when it applies.

Class and subdomain floors are declared exactly once each, on the declaration lines under D-01 and D-05
above, and are parsed only from those lines — never from an entry-shaped block — so a worked example's
own `Subdomain` line can never be mistaken for a fourth subdomain declaration: a declaration line is
only a floor declaration when it is immediately followed by a nested `- **Minimum entries:** <int>`
line, which no entry ever carries.

**Search log line format**, one per query, in the entry format section of the sweeping document:

`- **Query:** <query text> — <source class id> — <YYYY-MM-DD date run> — <N> hits, <M> survivors`

### E-00 — worked example (the format specimen)

This entry is the format specimen only. It is not evidence, it is not counted toward any floor, and no
sweep may cite it or mistake it for a fourth subdomain or a sixth source class.

- **Source class:** SC-A
- **Subdomain:** knowledge-graphs
- **Primary source:** https://example.org/specimen
- **Published:** 2025-01-01
- **Fetch-verified:** https://example.org/specimen retrieved 2026-08-20; title and publication date match
- **Quote:** "this is the specimen quote, present only to pin the field-line syntax the checks parse"
- **Verdict:** validated
- **Bar applied:** specimen only — not evidence, not checked against anything
- **Relevance:** specimen only — not evidence, cited by no entry and no section

## Naming authority for later documents

Every literal below is grepped by a check in a later plan of this phase. A document that spells one
differently fails for a formatting reason rather than an evidentiary one, so this section is the phase's
one naming authority for the documents that follow the survey.

**Validation ledger** (`VALIDATION.md`) — one entry per survey entry, heading `### V-NN — <survey entry
id it checks>`, with field lines `- **Claim under check:**` (the survey entry id, e.g. `E-01`),
`- **Re-fetched:**` (`<url> retrieved <YYYY-MM-DD>; <what matched>`, the same convention as
Fetch-verified but with this pass's own retrieval date), `- **Verdict:**` (one of `confirmed`,
`refuted`, `unverifiable`) and `- **Disposition:**` (one of `kept`, `reworked`, `dropped`; a verdict
other than `confirmed` may never carry disposition `kept`). A survey entry that validation drops keeps
its own `### E-NN` heading in `SURVEY.md` and gains a `- **Status:** dropped` field line. The ledger
closes with a `## Totals` section containing the line
`- **Totals:** confirmed=<n>, refuted=<n>, unverifiable=<n>`, where the three counts equal the computed
counts over the ledger's own entries.

**Candidate dossiers** (`CANDIDATE-DOSSIERS.md`) — one heading per candidate, `## C-NN — <name>`, with
field lines `- **Oracle kind:**` (one of `execution`, `constructed`, `replay` — the exogenous set;
`judged` is deliberately excluded), `- **Oracle status:**` (the fixed value `harvested-and-existing`),
`- **Deliverable domain:**` (one of `code-engineering`, `qa-retrieval`), and `- **Evidence:**` (a
comma-separated list of survey entry ids, each of which must exist in `SURVEY.md` with a `VALIDATION.md`
verdict of `confirmed` and disposition of `kept`). Each candidate carries five slate sections as `###`
subheadings under its `## C-NN` heading, in this order: `### Exogenous-oracle analysis`,
`### Backbone-fit map`, `### Collaborative-mode sketch`, `### Effort and risk estimate`, and
`### Validated evidence trail`. The document carries a `## Screened out` heading recording every
longlist direction that did not clear the oracle gate.

**Decision matrix** (`DECISION-MATRIX.md`) — a `## Criteria` section declaring each criterion as
`- **Criterion:** <name>` with a nested `- **Weight:** <positive integer>`; a `## Scores` section with
one `### C-NN` subsection per candidate (naming candidates already declared in the dossiers, no row
without a matching candidate), each cell an integer `0`-`3` written `- **<criterion name>:** <int> —
<one-line justification>`, and a `- **Row total:** <int>` line equal to the weighted sum of that row's
cells recomputed from the declared weights; an `- **Aggregation rule:**` line and a
`- **Decision authority:**` line, both present exactly once in the document.

**Selection** (`SELECTION.md`) — a `- **Selected:**` line naming exactly one candidate id (`C-NN`) that
exists among the dossiers, under a `## Scope of this decision` heading, together with
`- **Decided by:**`, `- **Decided on:** <YYYY-MM-DD>` and `- **Governing text:**` field lines recording
who decided, on what date, and what the decision does and does not authorise.

## Discipline statement

This protocol was applied as written, and no query, source, or exclusion boundary was widened once the
sweep was under way.
