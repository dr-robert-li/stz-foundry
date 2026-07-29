# Cross-slice semantic recall: the knowledge index

An agent working slice 07 needs to know whether slice 03 already settled a
convention. Before 1.17.0 the only answer was the operator's memory: progressive
disclosure gave you frontmatter summaries and stable claim ids, and nothing else
searched the tree. Cross-slice recall is now a real lookup — over the `.stz/`
markdown tree, capped per kind, explained per hit, scoped to the asking role, and
deterministic on the same tree and query.

It is deliberately not a RAG stack. No vector service, no re-ranker, no chunking
pipeline: one JSON file inside the audit tree it describes, a cosine, and the
same `retrieve()` contract that already governed selective retrieval.

## What is indexable, and why it is an allowlist

Exactly three tiers are ever walked (`INDEXABLE_TIERS`, `src/knowledge/scope.ts`):

| Tier | Written by | Approval gate |
| ---- | ---------- | ------------- |
| `00-intent/` | `/stz-f:new` | elicitation approval |
| `10-research/` | `/stz-f:research` + `/stz-f:validate` | research approval, then ground-truth validation |
| `20-standards/` | `/stz-f:conventions` | conventions approval |

Everything else is **never walked**. Not filtered afterwards — never opened.

This is an allowlist and not a denylist because of what else lives in that tree.
`30-tests/held-out/` is the sealed suite specimens compete against, and it ships
alongside the test author's full reference implementation. `40-slices/` holds
every competing specimen's source; `30-tests/rubric.md` is the judging rubric;
`50-pressure/` holds culled diffs and critiques; `90-audit/calls/` holds raw call
transcripts. A denylist is one new subdirectory away from serving the answer key
into an implementer's context — and it fails silently, because a leak looks
exactly like a good retrieval. An allowlist makes the question moot by
construction: no path-normalization bug, symlink, or future tier can reach
`30-tests/`, because the walk never starts there.

The same three tiers are the warrant for the trust stamp.
`poolFromIndex()` (`src/knowledge/index-store.ts`) is the **sole** producer of
`RetrievableArtifact.trust` in the repo, and it stamps `accepted` — the value
`retrieve()` requires before anything enters a generation context — precisely
because every entry came through a pipeline approval gate. Widen the allowlist
and that one line starts laundering un-approved content into agent prompts.

**The honest caveat:** under `--auto` / dark-factory those gates auto-approve. The
tier is still the approval-gated tier and dark factory is an explicit operator
opt-out, but "human-approved" is weaker in that mode. See
[`dark-factory.md`](./dark-factory.md).

`isIndexable()` is the single guard, used by the walk *and* by the reader of the
stored index, so an untrusted index file cannot smuggle in a key with a `..`
segment or an absolute path.

## The provider seam

`selectEmbedder()` (`src/knowledge/embedder.ts`) picks one of two providers and
always reports which and why — the reason string is printed in the bridge JSON
and stored in the index header:

- **Ollama `nomic-embed-text`** over `POST /api/embed`, when it answers. The
  nomic task prefixes (`search_document: ` / `search_query: `) are part of the
  model's identity, not decoration, and ride in the fingerprint.
- **The deterministic offline embedder**, otherwise. A hashed char-n-gram + token
  bag, no dependencies, sha256-derived buckets, `Math.sqrt` for the norm (never
  `Math.hypot`, which ECMA-262 leaves implementation-approximated).

**Offline reproducibility is a hard requirement, not a nicety.** The whole test
suite and CI run with no daemon and no network, and the fallback returns
byte-identical vectors across processes and machines — proven by a two-process
test, not asserted. The daemon is an optimization; it is never a requirement, and
a run never fails because it is absent.

**There is no separate liveness probe, and that is deliberate.** A daemon can be
up while the model was never pulled — the state of every fresh install — in which
case `/api/version` returns 200 and `/api/embed` returns 404. A liveness check is
therefore a second code path whose answer is a lie. The real embed call *is* the
probe: one call, one failure semantic. Any throw at all (connection refused, 404
model-not-found, timeout, malformed body, dimension drift) means "unavailable,
use the fallback".

**The fallback's honest limit, in one sentence:** it catches morphology
("naming"/"names") and word-order freedom, never synonymy
("convention"/"standard"). Offline recall is a smoothed lexical matcher, not a
semantic one. Paraphrase recall is proven through the seam against a *stubbed*
embedder, because a paraphrase test written against the fallback would either
fail honestly or be gamed into certifying nothing. If you want paraphrase, pull
the model.

The fallback is also **corpus-independent** — a document's vector is a pure
function of its own text. TF-IDF or random indexing would make every stored
vector a function of the whole corpus, so adding one document would invalidate
the entire index and the incremental rebuild below would be a lie.

## The index

`.stz/90-audit/knowledge-index.json` — JSON inside the tree it describes, the
same house pattern as `SEAL.json` and `state.json`. Sorted keys, 6dp vectors, no
timestamps, so two runs over an unchanged tree produce byte-identical output.

It is a **derived artifact and always safe to delete.** Rebuild it with:

```bash
stz bridge knowledge-index --root .
```

That command is what makes a deleted, gitignored, or fingerprint-stale index
recoverable — nothing else is needed and nothing is lost.

It also rebuilds itself at **slice close**: `stz bridge finalize` runs the same
build after `saveState` and reports the outcome under a `knowledgeIndex` key. The
whole hook is wrapped: it may report failure, it can never cause one. A slice
whose tournament succeeded is never marked failed because a daemon hiccuped or
the index path was unwritable.

Rebuild is a sha256 diff, not a re-embed:

- unchanged documents keep their **exact prior vectors**, carried forward rather
  than re-derived;
- only changed documents are embedded (one edited summary = one embed call,
  asserted by counting calls, never by timing);
- a document **deleted from the tree is evicted**, never carried "just in case" —
  a stale index serving a document that was possibly deleted *because* it was
  sensitive is the failure this rule exists to prevent;
- a **fingerprint change discards everything.** Vectors from two different
  embedders are not comparable, and the resulting noise clears the similarity
  floor often enough to look like signal. On `knowledge-index` that means a full
  rebuild under the new identity; on `knowledge-query` it means the semantic layer
  is switched off and says so, naming both the index's fingerprint and the
  identity available offline, so you know which of the two to change.

The hash covers the indexed text (path + frontmatter `summary`), not the whole
file — the ~200-token progressive-disclosure unit, because a full
`conventions.md` blows past the window a local embedder advertises and gets
silently truncated. A body edit that leaves the summary alone costs nothing.

**The gitignore tension is an operator choice, not a default we can pick for
you.** Committing the index makes recall work on a fresh clone, at the cost of a
large diff in the audit tree every time a summary changes. Ignoring it keeps
commits clean but silently disables recall until someone runs a rebuild — and
"silently" is the operative word, because a missing index degrades to lexical-only
retrieval rather than to an error. Pick one deliberately.

## Scoring and scoping

The semantic contribution is **quantized to an integer** before it enters the
score. This is not cosmetic. `retrieve()` sorts by `score desc, id asc`; with a
float score, `y.score - x.score` is a tiny non-zero for near-equal scores, the
`id asc` branch never fires, and hit ordering is dictated by float noise instead
of the documented stable rule.

A **similarity floor** below which a document contributes exactly zero is what
preserves the no-bulk-injection rule. Every artifact has a non-zero cosine to
every query, so without a floor `score > 0` is universally true, every document is
retrievable, and the "no bulk dump" guard silently evaporates while every test
stays green.

`repo_note` stays capped at **0** for every role — per-role caps are merged *over*
`DEFAULT_CAPS`, never substituted for it, so the CTIM-Rover cap survives
role-specific tuning. An **unknown role retrieves nothing**: `resolveRoleScope()`
returns `null` rather than defaulting or unioning, and the check is exact — a
case variant of a real role is an unknown role.

Role scopes are default-deny (`ROLE_SCOPES`). `execution` is the tightest: no
`rubric` (a specimen that reads the judging rubric games the judge) and no
`decision` (architecture rationale is noise to an implementer).

### Calibrating the floor

**The floor is per-embedder, and that is not a detail.** A cosine only means
something relative to the model that produced it. The two embedders that ship here
were measured on 2026-07-29 over the same 21-document `.stz/` tree, and their
ranges do not overlap:

| Embedder | Noise ceiling | True positives | Floor |
| -------- | ------------- | -------------- | ----- |
| `ollama:nomic-embed-text:768:v1` | 0.5242 | 0.5504 · 0.6273 · 0.7003 | **0.54** |
| `fallback:hashed-ngram:256:v1` | 0.2036 | 0.3953 · 0.2621 · 0.2261 | **0.24** |

nomic has a **high baseline and a narrow band** — the entire usable range is
~0.52–0.55. The sparse hashed-n-gram fallback sits near zero and spreads wider.
A single shared constant is therefore wrong for at least one of them by
construction: at nomic's 0.54 the fallback's semantic layer *can never fire at
all*, and at the fallback's 0.24 nomic returns most of the corpus for the word
"the".

The per-nomic detail, since it is the surprising one:

| Query | Max cosine |
| ----- | ---------- |
| deliberately unrelated ("kubernetes ingress certificate rotation") | 0.5242 |
| bare stopword ("the") | 0.5218 |
| true positive — paraphrase of a bundling convention | 0.5504 |
| true positive — fixed-timestep | 0.6273 |
| true positive — Playwright window state | 0.7003 |

An earlier guess of 0.6 sat **above the weakest true positive**, so the semantic
layer never fired on a real corpus while every offline test stayed green — those
tests run on stubbed embedders whose cosines are constructed rather than measured.
That is the characteristic failure here: **a too-high floor is silent.** It
presents as "semantic recall isn't very good", not as an error.

Resolution order, in `resolveSemanticFloor()`:

1. `STZ_SEMANTIC_FLOOR` — an operator who has measured their own corpus. An
   out-of-range value is **ignored, not honored**.
2. the `CALIBRATED_FLOORS` table above.
3. `UNCALIBRATED_SEMANTIC_FLOOR` (0.8) for any embedder nobody has measured —
   deliberately high, so an unknown model contributes almost nothing rather than
   an unknown amount of noise. `knowledge-query` reports `floorSource:
   "uncalibrated"` with a note when this happens, so it is visible rather than
   silently wrong.

**Both margins are thin (~0.016 and ~0.036) and corpus-dependent by nature.** A
different model, or much longer documents, moves the noise ceiling. If you swap
the embedding model, you must re-measure — the table above does not transfer:

1. `ollama pull nomic-embed-text`, daemon running.
2. Build against a real tree with the daemon path — do **not** set `STZ_EMBED`:
   `stz bridge knowledge-index --root <project>`. The printed `provider` must name
   Ollama and `fingerprint` must start with `ollama:`. If it says fallback, fix
   that before judging any cosine.
3. Run three queries and read `explanation.semantic.cosine`, not just the ids:
   one paraphrasing a convention you know is in the tree (should hit), one about
   something the tree genuinely does not cover (should return nothing), and one
   bare common word like "the" (should not return a wall of documents).
   `stz bridge knowledge-query --root <project> --role planning --keywords "<words>"`
4. Set the floor above the highest *unrelated* cosine and at or below the lowest
   *true positive* one. If those two orders overlap, the corpus or the model is
   the problem, not the constant.
5. Record it: add the fingerprint to `CALIBRATED_FLOORS` (permanent, shared) or
   export `STZ_SEMANTIC_FLOOR` (local to your corpus). Repeat the measurement per
   embedder — a number derived from one model says nothing about another.

Warning signs either way: every query returning exactly the cap for every kind
(floor too low), or zero semantic hits ever (floor too high).

**What the floor does NOT do: rank.** It is a noise gate, not a relevance
guarantee. Measured against the live daemon during phase verification, the query
`"house style for identifiers"` returned its intended target at 0.5635 — but an
unrelated storage ADR scored **0.5778 and outranked it**, and 3 of 5 documents
cleared the floor. Off-domain noise is bounded as calibrated (7 unrelated queries
averaged 0.5057, below both the 0.5242 ceiling and the 0.54 floor), but *in-domain
prose from the same project is not separable by cosine alone at this range*. That
is why the per-kind caps and the mandatory explanation matter: a caller is meant
to read `explanation.semantic.cosine` and judge, not to treat rank 1 as the
answer. Do not raise the floor to fix this — it would strand true positives long
before it separated in-domain neighbours.

**Bound: `0 < floor <= 1`.** A floor at or below 0 does not tune the layer, it
deletes the no-bulk-injection guard. If a measurement genuinely suggests one, that
is evidence the scoring model is wrong, not that the floor should be 0. Tests
import the constants rather than hardcoding them, so a recalibration does not
rewrite assertions — and `test/knowledge-semantic.test.ts` pins each floor between
its own measured noise ceiling and its own weakest true positive, so a value that
strands one embedder fails legibly instead of silently.

Also unmeasured and still a guess: `SEMANTIC_WEIGHT = 3` (cos 1.0 ≈ 1.5 symbol
matches). It only affects ranking among hits, never whether something is a hit.

## Configuration

All optional. The default path works with no daemon, no config file, and no pull.

| Variable | Default | Set it when |
| -------- | ------- | ----------- |
| `STZ_EMBED` | unset | `STZ_EMBED=fallback` forces the offline embedder — for CI, air-gapped runs, or reproducing a fallback-fingerprinted index. |
| `STZ_OLLAMA_URL` | `http://127.0.0.1:11434` | The daemon is not on the loopback default. |
| `STZ_EMBED_MODEL` | `nomic-embed-text` | You want a different embedding model. Changing it changes the fingerprint, which forces a full rebuild. |

The embed timeout is not an env knob: it scales with batch size
(`15s + 500ms × inputs`) because a whole rebuild is one batched call. That shape
came from measurement — a cold model load answered a single-input request in
7.9s and a warm 21-document batch took 4.4s, so the original flat 2s bound failed
both the first run of the day and every realistic rebuild, silently landing the
index on the fallback.

`STZ_OLLAMA_URL` points the embed call at an operator-chosen host, which is a
request-forgery surface in principle. It is accepted rather than mitigated: the
default is loopback, the variable is operator-set, and the request body carries
only allowlisted-tier `.stz/` summary text — no credentials, no API key header, no
sealed content.

## What is NOT wired yet

This phase delivers the deterministic engine and the CLI surface. A human at a
shell — or a command markdown that chooses to call it — can run
`knowledge-query` today and get real, capped, explained, role-scoped hits.

**No `commands/*.md` step and no `agents/stz-*.md` instruction invokes it.** A
phase agent does not automatically consult recall mid-slice. Nothing in the
pipeline calls `knowledge-query` on its own.

That wiring is one orchestration line per call site, and it is deliberately
outside this phase's scope fence, which covers "the bridge/CLI surface needed to
build and query the index". It is named here so it is not mistaken for delivered.

The index rebuild *is* wired — `finalize` runs it at slice close automatically.
It is only the query side that has no automatic caller.
