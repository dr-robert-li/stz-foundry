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

### V-01 — E-01

- **Claim under check:** E-01
- **Re-fetched:** https://arxiv.org/abs/2404.16130 retrieved 2026-08-20; page title, submission date and quote all matched independently
- **Verdict:** confirmed
- **Disposition:** kept

Three things checked independently against the fresh fetch, not against the survey entry's own text:
the source exists at the recorded URL (the abstract page returned the expected title,
"[2404.16130] From Local to Global: A Graph RAG Approach to Query-Focused Summarization"); its publication
date matches what `E-01` recorded ("[Submitted on 24 Apr 2024 (v1), last revised 19 Feb 2025 (this version,
v2)]" — the v1 date, 2024-04-24, is the date `E-01` cites as Published); and `E-01`'s quote — "Our approach
uses an LLM to build a graph index in two stages: first, to derive an entity knowledge graph from the
source documents, then to pregenerate community summaries for all groups of closely related entities." —
appears verbatim in the re-fetched abstract text.

## Totals

- **Totals:** confirmed=1, refuted=0, unverifiable=0
