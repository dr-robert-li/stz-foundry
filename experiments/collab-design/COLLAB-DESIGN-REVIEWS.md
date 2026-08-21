# C-01 design panel — record

## Reachability probe

**Probe question, verbatim.** "This is a reachability probe for a five-lane review
panel that will later review a design document. This is NOT the review itself — it
produces no findings and nothing you say here will be adjudicated. Answer in two or
three sentences only. Question: In your view, what is the single most common failure
mode of a design document that specifies a hash-verified handoff between two agents
(one agent produces an artifact, hashes it, and hands it to a second agent, which
re-hashes the artifact before reading it and must fail closed on any mismatch)? Keep
your answer short and generic — you do not have the actual design document, so answer
from general experience with this kind of contract."

**Lane roll-call.** Five of five target lanes attempted; five of five produced output
on the first attempt — `gpt-sol-pro` (answered), `kimi-k3` (answered), `qwen-max`
(answered), `gemma4` (answered), `gpt-oss` (answered). No lane was dropped or retried.

**Dead lanes:** None.

### gpt-sol-pro

Transcript: `raw/probe-gpt-sol-pro.md`.

> The most common failure mode is ambiguity about exactly which bytes are hashed,
> including serialization, encoding, line endings, metadata, and canonicalization. If
> producer and consumer do not share one deterministic byte-level representation,
> legitimate artifacts mismatch or, worse, verification covers different content than
> what the second agent reads.

### kimi-k3

Transcript: `raw/probe-kimi-k3.md`.

> The most common failure mode is under-specifying the canonical form being hashed:
> the doc says "hash the artifact" without pinning serialization (encoding, key
> ordering, trailing newlines, timestamps, or whether the hash covers the payload or
> the payload-plus-metadata envelope), so producer and verifier compute hashes over
> different byte sequences and every legitimate handoff fails closed — or, worse,
> someone "fixes" it by loosening the check. A close second is vague fail-closed
> semantics: no defined behavior for retry, quarantine, or escalation after a
> mismatch, so the receiving agent's error path is left as an exercise for the
> implementer.

### qwen-max

Transcript: `raw/probe-qwen-max.md`.

> The most common failure mode is that the consuming agent silently skips or bypasses
> the hash check on a mismatch — logging a warning instead of failing closed — which
> turns the integrity gate into a no-op. The second most common is hashing a different
> representation than what was transmitted (e.g., hashing the in-memory object but
> receiving a serialized copy), causing every legitimate handoff to fail.

### gemma4

Transcript: `raw/probe-gemma4.json`. Reported `prompt_eval_count: 164`.

> The most common failure mode is a discrepancy in how each agent serializes or
> canonicalizes the data before hashing, leading to consistent mismatches for
> logically identical artifacts. Additionally, designs often overlook
> Time-of-Check to Time-of-Use (TOCTOU) vulnerabilities, where the artifact is
> modified in shared storage after verification but before it is actually read.

### gpt-oss

Transcript: `raw/probe-gpt-oss.json`. Reported `prompt_eval_count: 215`.

> The most frequent failure is that the two agents end up hashing different byte
> streams — typically because one side includes extra metadata or applies a different
> text-normalization (e.g., CRLF vs LF, character encoding) while the other does not.
> The mismatch triggers an automatic fail-closed even though the artifact itself was
> unchanged and untampered.

**Invocation-path note (three OpenRouter lanes).** All three ran through the house
seam — `node ~/.claude/gsd-core/bin/gsd-tools.cjs query review-lane invoke --slug
opencode --model <id from review.reviewer_instances> --as <name> --run-dir <scratch>
--repo-root <repo> --prompt-file <scratch>/probe.md`, with `~/.opencode/bin` prepended
to `PATH` — all three succeeded on the first attempt (`{ok: true, stubbed: false}`
from the seam for every lane), no retry or fallback taken. Model ids were taken
verbatim from `.planning/config.json`'s `review.reviewer_instances`:
`openrouter/openai/gpt-5.6-sol-pro` (`gpt-sol-pro`),
`openrouter/moonshotai/kimi-k3` (`kimi-k3`), `openrouter/qwen/qwen3.7-max` (`qwen-max`).
This is the identical seam and endpoint the full round (plan 19-03) will use — the
probe only de-risks that round if it exercises the same path, not a cheaper
substitute.

**Local-endpoint note (two Ollama lanes).** Per D-01 as corrected by RESEARCH
Pitfall 1, both local lanes used Ollama's **native** `/api/chat` endpoint
(`http://localhost:11434/api/chat`), not the OpenAI-compatible
`/v1/chat/completions` path — the OpenAI-compat shim does not honour a `num_ctx`
override and would silently truncate the prompt to Ollama's small default context
window. Each request set `options.num_ctx: 40000`. This was verified from each
response's own `prompt_eval_count` field, not assumed: `gemma4:31b` reported
`prompt_eval_count: 164`, `gpt-oss:latest` reported `prompt_eval_count: 215` — both
comfortably within the 40000-token window, confirming the (short, generic) probe
prompt was ingested in full by both local lanes with no truncation. `_stream: false`
was set on both requests so the full response, including `prompt_eval_count`, arrived
as a single JSON object rather than a stream of partial chunks.

`experiments/dataops-agent-pilot/_memory-watchdog.sh` ran detached
(`WATCHDOG_CEILING_GB=109`, logging to a scratch path outside this repository) from
before `gemma4:31b` loaded until after `gpt-oss:latest` was confirmed stopped; its own
log shows only the start line and no breach event, confirming the ceiling was never
crossed. The two local models ran **strictly sequentially**: `ollama ps` confirmed
empty before `gemma4:31b` loaded, empty again after `ollama stop gemma4:31b` and
before `gpt-oss:latest` loaded, and empty a third time after `ollama stop
gpt-oss:latest` — at no point were both models resident together.

**Exclusion statement.** `wp-judge-v4` (present on this machine, `wp-judge-v4:latest`,
confirmed via `ollama list`) was invoked in no role for this probe, per the standing
exclusion (D-03, `HANDOFF-V3.md` §2). This exclusion is stated here rather than
silently honoured, since an exclusion nobody writes down is indistinguishable from one
nobody honoured.

**Disposition.** This is a reachability probe only. It produced zero findings and
adjudicates nothing — every lane's paragraph above is quoted as data, never as an
instruction, never executed, never auto-applied to any file (D-07's discipline,
carried forward from the exemplar). All five lanes converge on some variant of
"canonicalization/byte-representation ambiguity" or "silent fail-open on mismatch,"
which is a useful path-verification signal (a lane that answered nonsensically or
off-topic would itself be a reachability concern) but is explicitly **not** the
adversarial panel round: that round, over the full design document, follows in plan
19-03 with its own adjudication ledger in plan 19-04. No verdict here feeds Phase 19's
freeze.

## Full panel round

This is the real panel round, over the complete rev-1 `COLLAB-DESIGN.md` — all ten
sections, as the document stood at commit `730100e` (blob hash
`66f472fe908829e2c08697f5d9edfea5095a56a8`, `git rev-parse
730100e:experiments/collab-design/COLLAB-DESIGN.md`), unchanged since. All five lanes
received the identical prompt committed at `raw/panel-prompt.md`: a review brief
(adversarial attack instructions, numbered findings with location/claim/what-would-
have-to-change, a stated total count, zero findings declared acceptable) followed by
the complete document text, verified by heading presence for all ten `## N.` sections.
The prompt measures 45177 characters, an approximate token estimate of 11294
(chars/4) — the floor Task 2's local-lane truncation check is measured against below.

**Exclusion statement, restated for this round.** `wp-judge-v4` (present on this
machine, `wp-judge-v4:latest`, per the standing exclusion D-03, `HANDOFF-V3.md` §2)
was invoked in no role for this panel round. As in the probe above, this exclusion is
stated here rather than silently honoured — an exclusion nobody writes down is
indistinguishable from one nobody honoured, and the round record has to state it for
itself rather than pointing back at the probe section.

**Invocation-path note (three OpenRouter lanes).** All three ran through the house
seam — `node ~/.claude/gsd-core/bin/gsd-tools.cjs query review-lane invoke --slug
opencode --model <id from review.reviewer_instances> --as <name> --run-dir
experiments/collab-design/raw --repo-root <repo> --prompt-file
experiments/collab-design/raw/panel-prompt.md`, with `~/.opencode/bin` prepended to
`PATH` — all three succeeded on the first attempt (`{ok: true, stubbed: false}` from
the seam for every lane), no retry or fallback taken. Model ids were taken verbatim
from `.planning/config.json`'s `review.reviewer_instances`:
`openrouter/openai/gpt-5.6-sol-pro` (`gpt-sol-pro`),
`openrouter/moonshotai/kimi-k3` (`kimi-k3`), `openrouter/qwen/qwen3.7-max`
(`qwen-max`). This is the same seam the reachability probe above proved live.

**Local-endpoint note (two Ollama lanes).** Per D-01 as corrected by RESEARCH
Pitfall 1, both local lanes used Ollama's **native** `/api/chat` endpoint
(`http://localhost:11434/api/chat`), not the OpenAI-compatible
`/v1/chat/completions` path, with `options.num_ctx: 40000` set on both requests — the
OpenAI-compat shim does not honour a `num_ctx` override and would silently truncate
this full-draft prompt. This was verified from each response's own
`prompt_eval_count` field against the prompt's own 11294-token estimate, not assumed:
`gemma4:31b` reported `prompt_eval_count: 12140` (107% of the estimate),
`gpt-oss:latest` reported `prompt_eval_count: 11342` (100% of the estimate) — both
comfortably above the 80% floor this project uses to detect truncation, confirming
the full, untrimmed, identical prompt (the same one the three OpenRouter lanes
received) was ingested by both local lanes with no re-run required. `_stream: false`
was set on both requests so the full response, including `prompt_eval_count`, arrived
as a single JSON object.

`experiments/dataops-agent-pilot/_memory-watchdog.sh` ran detached
(`WATCHDOG_CEILING_GB=109`, logging to a scratch path outside this repository) from
before `gemma4:31b` loaded until after `gpt-oss:latest` was confirmed stopped; its log
shows only the start line and no breach event. The two local models ran **strictly
sequentially**: `ollama ps` confirmed empty before `gemma4:31b` loaded, empty again
after `ollama stop gemma4:31b` and before `gpt-oss:latest` loaded, and empty a third
time after `ollama stop gpt-oss:latest` — at no point were both models resident
together.

### gpt-sol-pro

Transcript: `raw/round-gpt-sol-pro.md`. Stated finding count: **21** (`Total findings:
21`, matching the 21 numbered findings actually reproduced under this heading).

- **L1-F1** — §3, TOCTOU residual window. Re-hashing "before the answerer reads"
  leaves a window between verify and open/read where a file could still be replaced,
  symlink-retargeted, or mutated. *Change:* open once into an immutable buffer (or
  same fd), hash exactly those bytes, pass only verified bytes onward; specify
  symlink and concurrent-write handling.
- **L1-F2** — §3, "hash recorded in the task record." Nothing protects the task
  record itself; an actor able to replace the artifact can replace its recorded hash
  too, and the hash is not bound to task/query/attempt/candidate/KB revision, so a
  valid pair could be transplanted from another task. *Change:* define an
  immutable/authenticated handoff record binding `artifactHash`, `query_id`, attempt
  id, candidate `definitionHash`, KB identity/revision, artifact schema version.
- **L1-F3** — §3, failure-mode list completeness. Uncovered modes: artifact+hash-record
  replaced together, symlink/path retargeting, mutation-after-verification, partial
  writes during hashing, unreadable/special files, oversized artifacts, malformed
  serialization, parser/schema-version drift. *Change:* add explicit behaviour for
  each.
- **L1-F4** — §2/§5, builder output contract not mechanically defined. "Connected",
  "query-linked", "seed entities" specify no schema, field set, or ordering rule — a
  builder could smuggle information through node/edge order, labels, or free text
  without violating the stated constraints. *Change:* a closed, versioned schema and
  deterministic validator rejecting unrecognized/free-form fields.
- **L1-F5** — §2, builder's gold-`answer_ids` boundary. "Nothing in its inputs
  includes them" is field-omission only — no statement of filesystem, tool, cache, or
  fixture access that could reach gold-bearing files by another path. *Change:*
  specify a mechanically enforced builder input/capability boundary comparable to the
  answerer's strip boundary.
- **L1-F6** — §5/§6, `query_id` global-uniqueness claim. The cited evidence
  (`row_query_id != idx`) proves IDs are not positional, not that they are globally
  unique across KB/split/revision or that a lookup returns exactly one row. *Change:*
  cite a uniqueness invariant or key by a compound identity, reject zero/multiple
  matches.
- **L1-F7** — §4, decision statement's size/licence grounds. A PrimeKG-only size
  measurement cannot support a *comparative* decision with no Amazon/MAG size
  evidence; the licence ground is undercut by the document's own admission that the
  PrimeKG dataset licence is unverified. *Change:* drop size/licence as comparative
  grounds, or supply comparable evidence for all three KBs.
- **L1-F8** — §6, out-of-pool prediction handling is non-deterministic for mixed
  predictions. Removing one invalid id can promote later ids and change Hit@k/MRR;
  the empty-list, duplicate-id, and tie-breaking cases are unspecified. *Change:*
  define one exact transformation, or fail the whole attempt as a miss on any invalid
  entry.
- **L1-F9** — §6, oracle fail-closed contract incomplete. No defined bridge outcome
  for timeout, signal termination, malformed/multiple JSON, missing metrics,
  stderr-only warnings, or receipt-construction failure. *Change:* a closed outcome
  table mapping every subprocess/parse failure to a deterministic miss/error record.
- **L1-F10** — §6, revision pinning checks the live Hub head, not the bytes actually
  loaded; a stale local cache can pass the assertion while serving different bytes.
  *Change:* load by immutable revision where possible or verify artifact manifests;
  treat the live-head check as freshness policy, not content pinning.
- **L1-F11** — §6, receipt discipline doesn't bind the receipt to the concrete
  query/prediction/metrics/attempt — a valid receipt could be attached to a different
  result. *Change:* bind compound query identity, prediction payload, metrics,
  scorer version, and attempt identity into the record or a separately hashed
  scoring record.
- **L1-F12** — §7, primary-gate explanation's wording reverses "fires": when null is
  close to or above graph, the inequality is *false* (gate fails), it does not
  "fire". *Change:* state mechanically `PASS iff graphHits - nullHits >= 6; otherwise
  FAIL`, avoid "fires" language for the primary condition.
- **L1-F13** — §7, secondary-check "more sensitive" framing is misleading — the two
  thresholds run in opposite directions and don't compete on a common swing; any
  harmful difference meeting δ2 already fails the primary by 11+ queries. *Change:*
  describe the secondary as a directional diagnostic within primary failures, justify
  δ2's own value independently.
- **L1-F14** — §7/§10, no source, run, or variance estimate is supplied for the
  "4-8 query" recommended range, yet §10 asks reviewers to produce evidence to
  overturn a value the design itself doesn't evidence. *Change:* cite the derivation
  or preregister a variance estimate; otherwise label the margins policy choices, not
  evidence-based.
- **L1-F15** — §7, critical-value table transcription risk. The listed values are
  arithmetically consistent with the stated rule (endpoints `c(20)=15`, `c(75)=47`
  confirmed correct), but no code regenerates or mechanically verifies the 56
  transcribed constants against the formula. *Change:* a test that derives every row
  and compares to the pinned table.
- **L1-F16** — §8, `componentVariantId` "unchanged... produces the 32-byte digests"
  is self-contradictory: the cited implementation returns a 16-hex truncated string,
  not a 32-byte digest. *Change:* name the actual full-digest producer as a distinct
  function; `componentVariantId` produces only the truncated diagnostic hashes.
- **L1-F17** — §8, "prevents distinct prompt pairs from sharing a hash" overstates —
  the outer id is truncated to 64 bits (collision-plausible at ~2^32 by birthday
  scaling), and prompt-to-byte encoding (UTF-8 surrogate handling) is unspecified.
  *Change:* state a collision-resistance claim, not an absolute-uniqueness claim;
  define the encoding and surrogate policy.
- **L1-F18** — §8, "same pair, same id" doesn't specify whether line endings,
  Unicode normalization, BOM, trailing whitespace, or role/tool scaffolding are
  identity-bearing. *Change:* define the exact candidate-definition payload and
  canonical serialization.
- **L1-F19** — §1/§9, filename-only ancestry pinning cannot reliably identify
  renamed files, alternate modules, or implementation under an unexpected subtree
  while directory placement stays explicitly unsettled. *Change:* pin full
  repository-relative paths before freeze, or add an import/manifest-based guard.
- **L1-F20** — §1, amendment protocol's "documented amendment entry" branch permits
  substantive changes to ship without a new panel, defeating the freeze's stated
  purpose. *Change:* restrict no-panel amendments to explicitly defined
  non-substantive corrections.
- **L1-F21** — §5, `runAgentBattery` reuse doesn't specify the candidate x query
  expansion (one candidate across 75 queries vs. Cartesian product), which affects
  task identity, retries, and artifact ownership. *Change:* define the deterministic
  expansion from candidates and query fixtures into attempt ids.

**Raw finding count — gpt-sol-pro: 21 (F1–F21).**

### kimi-k3

Transcript: `raw/round-kimi-k3.md`. Stated finding count: **8** (`Total findings: 8`,
matching the 8 numbered findings actually reproduced under this heading).

- **L2-F1** — §7, "one row past that table's own ceiling" is arithmetically wrong:
  75 − 60 = 15, not 1. *Change:* state the actual 15-row gap (n_d 61–75 uncovered).
- **L2-F2** — §8, the stated reason for rejecting truncated 64-bit per-role hashes
  ("would narrow the outer hash's own collision resistance") is incoherent with the
  section's own later truncation of the *outer* hash to the same 64-bit width — the
  outer hash is 64-bit regardless of inner-hash width. *Change:* state honestly that
  the id space is 64-bit by house convention, or widen the output.
- **L2-F3** — §8, `componentVariantId` cannot both be "unchanged" and "produce the
  32-byte digests the outer hash consumes" — the cited implementation truncates to
  16 hex characters. *Change:* name the actual full-digest producer as a distinct
  code path.
- **L2-F4** — §5, "for the CD-04 hash, §9" is a wrong cross-reference — the CD-04
  hash is specified in §8, not §9. *Change:* change "§9" to "§8".
- **L2-F5** — §3, the re-hash-then-read sequence leaves a residual TOCTOU window
  between re-hash and the actual open/read, and the five named failure modes cover
  only the artifact side, not the recorded handoff hash being absent, corrupted, or
  mismatched. *Change:* verify the exact bytes read (not a re-opened path), and add
  failure modes for the recorded-hash side.
- **L2-F6** — §2, the builder's gold-`answer_ids` boundary is asserted ("nothing in
  its inputs includes them") with no named mechanical check, unlike the answerer's
  REQ-78 strip boundary — and the flagged gap (content-smuggling, output side) is a
  different leak from the builder reading gold ids via the shared QA/KB dataset
  (input side). *Change:* state the mechanical input-side constraint or add this gap
  to the flagged-gaps list.
- **L2-F7** — §4, the decision statement counts the STaRK cc-by-4.0 licence as a
  ground favoring PrimeKG, but that licence attaches identically to Amazon and MAG
  too (non-discriminating), while the licence that would actually discriminate
  (PrimeKG's own dataset licence) is stated as unverified in the same section.
  *Change:* reword the decision statement so licence reads as unresolved, not a
  selection ground.
- **L2-F8** — §1/§9, the "pinned mechanically" ancestry claim is stronger than what
  §9 delivers — a path-watching guard cannot watch an unsettled directory; until
  Phase 20 picks one, the guard either watches nothing or a guessed path, both
  vacuous passes during exactly the window it exists to cover. *Change:* pin full
  relative paths in §9, or state in §1 that the guard is inert until the directory
  decision lands.

**Raw finding count — kimi-k3: 8 (F1–F8).**

### qwen-max

Transcript: `raw/round-qwen-max.md`. Stated finding count: **5** (`Total findings: 5`,
matching the 5 numbered findings actually reproduced under this heading).

- **L3-F1** — §7, "one row past that table's own ceiling" is arithmetically wrong:
  75 − 60 = 15, not 1. *Change:* replace "one row past" with the correct gap.
- **L3-F2** — §7, the "transcribed verbatim" error message
  (`no pinned critical value for discordantCount ...`) is not what actually fires for
  out-of-range counts in `_paired-gate.ts` — a range guard fires first with a
  different message; the transcribed message is a fallback for an in-range missing
  entry, which cannot occur against the default table. *Change:* transcribe the
  range-guard message that actually fires, or name both checks.
- **L3-F3** — §8, the claim that truncated 64-bit inner hashes would "narrow the
  outer hash's own collision resistance" is contradicted by the outer hash's own
  16-hex truncation two paragraphs later — the outer hash is 64 bits regardless.
  *Change:* restate the rejection reason as "adds independent inner collision
  surfaces," not "narrows the outer hash's resistance."
- **L3-F4** — §3, the five named failure modes omit a sixth: the stored handoff hash
  itself being corrupted, wrong from the start, or mutated alongside the artifact if
  the task record sits in a mutable store. *Change:* add a failure mode for a
  corrupted/incorrectly-recorded stored hash.
- **L3-F5** — §4, the cc-by-4.0 licence verified for the STaRK benchmark dataset does
  not differentiate PrimeKG from Amazon/MAG (it applies to all three identically),
  while the PrimeKG dataset's own licence — which would differentiate — is stated as
  unverified in the same section. *Change:* restate licence as covering the STaRK
  benchmark only and drop it as a KB differentiator, or fetch and cite PrimeKG's own
  dataset licence.

**Raw finding count — qwen-max: 5 (F1–F5).**

### gemma4

Transcript: `raw/round-gemma4.json`. Reported `prompt_eval_count: 12140`. Stated
finding count: **3** (`Total findings: 3`, matching the 3 numbered findings actually
reproduced under this heading).

- **L4-F1** — §6, the fail-closed contract doesn't distinguish a bridge pre-filter
  miss from a genuine oracle-process crash (OOM, segfault) — both currently present
  as "non-zero exit, empty stdout." *Change:* the bridge must log and differentiate
  its own pre-filter misses from oracle process failures.
- **L4-F2** — §3, the design doesn't state *who* performs the handoff hash — if the
  builder agent itself both hashes and records, the check only proves the file
  hasn't changed since the builder's own claim, not that it's trustworthy. *Change:*
  state explicitly that the runner/orchestrator, not the agent, performs both
  handoff-hash and read-verify hash.
- **L4-F3** — §7, the design doesn't specify whether the sign-test precision
  statement is marked `UNDERPOWERED`/`N/A` in the final report when n_d < 20, only
  that it doesn't block the primary gate. *Change:* add a requirement to explicitly
  mark the precision statement as such below the floor.

**Raw finding count — gemma4: 3 (F1–F3).**

### gpt-oss

Transcript: `raw/round-gpt-oss.json`. Reported `prompt_eval_count: 11342`. Stated
finding count: **10** (`Total findings: 10`, matching the 10 numbered findings
actually reproduced under this heading).

- **L5-F1** — §7, inconsistent description of critical-value table coverage: the
  section states the existing table "covers `[20,60]`" and elsewhere that "this
  design pins its own table covering... including 75," without clarifying which
  table the gate actually uses. *Change:* clarify which table is used and delete the
  contradictory wording.
- **L5-F2** — §3, no canonical serialization is defined for the artifact before
  hashing (key ordering, encoding, whitespace) — the same byte stream isn't
  guaranteed without one. *Change:* define a precise canonical serialization format.
- **L5-F3** — §3, the failure-mode list doesn't cover a syntactically empty or
  malformed artifact that still yields a matching hash. *Change:* add a failure mode
  for "artifact is syntactically invalid or empty after handoff," fail-closed.
- **L5-F4** — §8, `definitionHash` truncated to 16 hex characters (64 bits) risks
  collision. *Change:* use the full 32-byte digest, document the accepted 2⁻⁶⁴
  probability, or widen the truncation.
- **L5-F5** — §8, ambiguity about whether the inner sha256 digests are raw binary or
  hex-encoded bytes before the outer concatenation. *Change:* specify raw 32-byte
  binary digests, not hex strings, before concatenation.
- **L5-F6** — §6, claims about `score_one.py`'s stdout purity ("prints exactly one
  JSON object," "redirects real stdout to stderr") aren't backed by a cited source
  file in this document. *Change:* cite the actual wrapper source or reference the
  code alongside the contract statement.
- **L5-F7** — §6, the `OracleReceipt` structure and lineage strings aren't directly
  cited to the TypeScript type or the fixture file. *Change:* cite the actual
  `OracleReceipt` type and the fixture file directly.
- **L5-F8** — §5, the 3-node minimum / 200-node maximum structural bounds carry no
  data-driven justification. *Change:* add statistics on typical PrimeKG query-linked
  neighbourhood sizes or reference a supporting experiment.
- **L5-F9** — §7, δ1/δ2 are stated as query counts (6, 5) but the surrounding text
  also frames them in percentage points, while the inequalities themselves use raw
  hit counts — a unit inconsistency. *Change:* state consistently that δ1/δ2 are
  counts, or rewrite the inequalities in percentage terms if percentages are wanted.
- **L5-F10** — §7, the sign test's discordant-pair count doesn't state whether a tie
  (both arms Hit@1 or both miss) contributes to that count. *Change:* explicitly
  define tie treatment for the discordant-pair count.

**Raw finding count — gpt-oss: 10 (F1–F10).**

## Raw finding counts

Every one of the five lanes named in D-01 is accounted for above, live, with a stated
finding count verified against the numbered findings actually reproduced under that
lane's own heading in this document — not against memory or a running tally kept
elsewhere:

| Lane | Transcript | Id range (within lane) | Count |
|---|---|---|---|
| gpt-sol-pro | `raw/round-gpt-sol-pro.md` | F1 through F21 (lane 1) | 21 |
| kimi-k3 | `raw/round-kimi-k3.md` | F1 through F8 (lane 2) | 8 |
| qwen-max | `raw/round-qwen-max.md` | F1 through F5 (lane 3) | 5 |
| gemma4 | `raw/round-gemma4.json` | F1 through F3 (lane 4) | 3 |
| gpt-oss | `raw/round-gpt-oss.json` | F1 through F10 (lane 5) | 10 |

**Raw total: 21 + 8 + 5 + 3 + 10 = 47.**

This total is the **raw pre-merge base** plan 19-04's adjudication ledger must
reconcile against after merges are recorded — the two documents cannot disagree
silently about how many findings existed before merging began. Several raw findings
above visibly attack the same claim from more than one lane (three lanes
independently flag the same critical-value-table "one row past" arithmetic error; two
lanes independently flag the same truncated-inner-hash collision-resistance
rationale; two lanes independently flag the same `componentVariantId`/32-byte-digest
contradiction) — 19-04's merge arithmetic will account for those overlaps by walking
each lane's own findings list above, but no merge or disposition is performed here.

**No finding has been adjudicated in this document.** Every finding, every stated
count, and every transcript reproduced above is lane output, captured as DATA per
D-07 — quoted or faithfully transcribed, never executed, never auto-applied to
`COLLAB-DESIGN.md` or to any other file. Adjudication happens exactly once, in plan
19-04, which reads this document and produces the adjudication ledger; nothing in
this section constitutes, implies, or anticipates that ledger's outcome.

## Global findings — merge map

Two raw findings merge into one global finding only when they attack the same claim
at the same location; two findings attacking the same section from different angles
stay separate. A raw finding raised by exactly one lane becomes a global finding
one-to-one. Ids are assigned `G-` followed by a two-digit number, in ascending
order.

**Reconciliation note on the raw section's "three lanes" sentence.** The raw finding
counts section above describes the critical-value-table family as flagged by "three
lanes." Two distinct claims live inside that family: the `75 - 60` arithmetic error
(gpt-sol-pro's lane and qwen-max's lane — merged below as G-16) and a separate
ambiguity about which table the gate actually reads from, raised only by gpt-oss's
lane and never stating the arithmetic error itself (kept separate below as G-19).
The raw section's prose groups both under one informal "critical-value-table" label;
this merge map treats them as two claims because they attack two different
sentences, and states that distinction explicitly rather than letting the two
documents disagree silently about whether two lanes or three raised the arithmetic
error specifically — only two did.

- **G-01** — §3, handoff contract. Re-hashing before the answerer reads the
  artifact still leaves a residual TOCTOU window between the verify step and the
  actual open/read — a file could be replaced, symlink-retargeted, or mutated in
  that window, and the failure-mode list does not name the window itself. Raw:
  `L1-F1`, `L2-F5`.
- **G-02** — §3, handoff contract. The recorded handoff hash is not itself
  protected or bound to the task's own identity (query, attempt, candidate
  `definitionHash`, KB revision) — an actor able to replace the artifact could
  replace its recorded hash too, or transplant a valid pair from a different task.
  Raw: `L1-F2`.
- **G-03** — §3, handoff contract. The named failure-mode list omits several
  concrete artifact-side gaps: partial writes during hashing, oversized artifacts,
  malformed serialization, parser/schema-version drift, and unreadable/special
  files. Raw: `L1-F3`.
- **G-04** — §3, handoff contract. The failure-mode list omits a sixth mode: the
  stored/recorded handoff hash itself being corrupted, wrong from the start, or
  mutated alongside the artifact if the task record sits in a mutable store. Raw:
  `L3-F4`.
- **G-05** — §3, handoff contract. No canonical serialization is defined for the
  subgraph artifact before hashing (key ordering, encoding, whitespace), so two
  structurally identical subgraphs are not guaranteed to hash identically. Raw:
  `L5-F2`.
- **G-06** — §3, handoff contract. The failure-mode list does not cover a
  syntactically empty or malformed artifact that still yields a matching hash. Raw:
  `L5-F3`.
- **G-07** — §3, handoff contract. The document does not state who performs the
  handoff hash — if the builder agent itself both hashes and records, the check
  only proves the file matches the builder's own claim, not that the claim is
  trustworthy. Raw: `L4-F2`.
- **G-08** — §2, builder role. The builder's subgraph output contract is not
  mechanically defined — no closed schema, field set, or ordering rule, leaving
  room to smuggle information through structure rather than content. Raw: `L1-F4`.
- **G-09** — §2, builder role. The builder's gold-`answer_ids` boundary is stated
  only as field-omission on the input side, with no named filesystem, tool, cache,
  or fixture-access constraint preventing the builder from reaching gold-bearing
  data by another path. Raw: `L1-F5`, `L2-F6`.
- **G-10** — §4, KB selection. The decision statement cites size and licence as
  comparative grounds, but the document's own body text shows neither
  discriminates among the three candidate KBs the way the statement implies. Raw:
  `L1-F7`.
- **G-11** — §4, KB selection. The STaRK dataset's cc-by-4.0 licence, cited as a
  ground for PrimeKG, applies identically to Amazon and MAG — it does not
  discriminate — while the licence that would discriminate (PrimeKG's own dataset
  licence) is stated as unverified in the same section. Raw: `L2-F7`, `L3-F5`.
- **G-12** — §7, ablation gate. The primary-gate explanation's "fires" language is
  reversed or misleading for what is a binary PASS/FAIL condition, not an
  alarm-style trigger. Raw: `L1-F12`.
- **G-13** — §7, ablation gate. The secondary do-no-harm check's "more sensitive"
  framing is misleading — the two thresholds read from the same paired-difference
  statistic in opposite directions and do not compete as independent detectors.
  Raw: `L1-F13`.
- **G-14** — §7/§10, ablation gate. No source, prior run, or variance estimate is
  cited for the "4-8 query" range that produced δ1, yet §10 asks a reviewer to
  supply exactly that kind of evidence to overturn it. Raw: `L1-F14`.
- **G-15** — §7, ablation gate. No code regenerates or mechanically verifies the
  56 transcribed critical-value constants against the stated combinatorial
  formula. Raw: `L1-F15`.
- **G-16** — §7, ablation gate. "One row past that table's own ceiling" is
  arithmetically wrong: `75 - 60 = 15`, not 1. Raw: `L2-F1`, `L3-F1`.
- **G-17** — §7, ablation gate. The transcribed error message
  (`no pinned critical value for discordantCount ...`) is not what actually fires
  for an out-of-range count in `_paired-gate.ts` — a separate range guard fires
  first, with a different message. Raw: `L3-F2`.
- **G-18** — §7, ablation gate. The document does not specify whether the sign
  test's UNDERPOWERED precision statement is surfaced in the final report when
  `n_d` falls below the 20-discordant floor. Raw: `L4-F3`.
- **G-19** — §7, ablation gate. The description of critical-value table coverage
  is ambiguous about which table — the existing `[20,60]` table or this design's
  own extended table — the gate actually reads from. Raw: `L5-F1`.
- **G-20** — §7, ablation gate. δ1/δ2 are defined as query counts (6, 5) and
  restated as percentage points, but the inequalities themselves are written
  against `hit@1`, which reads as a rate — a unit mismatch between the margin's
  definition and its use in the formula. Raw: `L5-F9`.
- **G-21** — §7, ablation gate. The sign test's discordant-pair count does not
  state whether a tie (both arms hit or both miss) contributes to that count. Raw:
  `L5-F10`.
- **G-22** — §8, candidate hash. The claim that `componentVariantId` is
  "unchanged" and "produces the 32-byte digests" is self-contradictory — the cited
  implementation returns a 16-hex truncated string, not a 32-byte digest. Raw:
  `L1-F16`, `L2-F3`.
- **G-23** — §8, candidate hash. The outer `definitionHash` is truncated to 16 hex
  characters (64 bits); the document's "prevents distinct prompt pairs from
  sharing a hash" language reads as an absolute-uniqueness claim the truncated
  width cannot support, and no collision probability is disclosed for that final
  truncation. Raw: `L1-F17`, `L5-F4`.
- **G-24** — §8, candidate hash. The "same pair, same id" guarantee does not
  specify whether line endings, Unicode normalization, BOM, trailing whitespace,
  or role/tool scaffolding are identity-bearing in the hashed payload. Raw:
  `L1-F18`.
- **G-25** — §8, candidate hash. The stated reason for rejecting truncated 64-bit
  per-role hashes as inputs — that it would "narrow the outer hash's own
  effective collision resistance" — is imprecise given the outer hash's own
  *output* is truncated to that same 64-bit width regardless of the inner hashes'
  width. Raw: `L2-F2`, `L3-F3`.
- **G-26** — §5, battery shape. A cross-reference is wrong: "for the CD-04 hash,
  §9" should read "§8", where the CD-04 hash is actually specified. Raw: `L2-F4`.
- **G-27** — §8, candidate hash. Ambiguity about whether the inner sha256 digests
  are raw binary or hex-encoded bytes before the outer concatenation. Raw:
  `L5-F5`.
- **G-28** — §6, oracle interface. Out-of-pool prediction handling is
  non-deterministic for mixed predictions — removing an invalid id can promote
  later ids and change Hit@k/MRR, and the empty-list, duplicate-id, and
  tie-breaking cases are unspecified. Raw: `L1-F8`.
- **G-29** — §6, oracle interface. The fail-closed contract is incomplete — no
  defined bridge outcome for timeout, signal termination, malformed or multiple
  JSON on stdout, missing metric keys, stderr-only warnings, or
  receipt-construction failure. Raw: `L1-F9`.
- **G-30** — §6, oracle interface. Revision pinning checks the Hugging Face Hub's
  live head, not the bytes actually loaded from the local cache — a stale local
  cache can pass the assertion while serving different bytes. Raw: `L1-F10`.
- **G-31** — §6, oracle interface. The receipt discipline states lineage and
  `acceptedBy` fields but does not bind a given receipt to the concrete
  query/prediction/metrics/attempt that produced it. Raw: `L1-F11`.
- **G-32** — §6, oracle interface. The fail-closed contract does not distinguish
  a bridge pre-filter miss (an expected, defined outcome) from a genuine
  oracle-process crash (OOM, segfault) — both currently present identically as
  "non-zero exit, empty stdout." Raw: `L4-F1`.
- **G-33** — §6, oracle interface. The claim that `score_one.py` redirects stdout
  during loads to keep stdout pure is cited only to `SPIKE-FINDINGS.md`'s prose,
  not to the wrapper's own source lines. Raw: `L5-F6`.
- **G-34** — §6, oracle interface. The `OracleReceipt` structure and lineage
  strings are asserted without being directly cited to the TypeScript type or the
  fixture file. Raw: `L5-F7`.
- **G-35** — §1/§9, freeze and module naming. The "pinned mechanically" language
  for the module-filename table claims more than §9 currently delivers — with
  directory placement unsettled until Phase 20, a path-watching guard has nothing
  concrete to watch yet, and filenames alone cannot reliably distinguish a rename
  from an unrelated file. Raw: `L1-F19`, `L2-F8`.
- **G-36** — §1, amendment protocol. The "documented amendment entry" branch has
  no stated bound on what counts as non-substantive, so a substantive change
  could ship without a new panel round, undercutting the freeze's own stated
  purpose. Raw: `L1-F20`.
- **G-37** — §5, battery shape. `runAgentBattery` reuse does not specify the
  candidate × query expansion into task identities, which affects retries and
  artifact ownership. Raw: `L1-F21`.
- **G-38** — §5/§6, battery shape. The `query_id` global-uniqueness claim is
  overstated — the cited evidence (`row_query_id != idx`) proves ids are not
  positional, not that they are globally unique or that a lookup returns exactly
  one row. Raw: `L1-F6`.
- **G-39** — §5, battery shape. The proposed structural bounds (minimum 3 nodes,
  maximum 200 nodes) carry no data-driven justification. Raw: `L5-F8`.

```reconciliation
raw_total = 21 + 8 + 5 + 3 + 10 = 47
merged = 47 - 8 = 39
```

Of the 47 raw findings, 16 cluster into 8 global findings — each cluster holds
exactly 2 raw findings, so 8 clusters contribute 8 global findings in place of 16
raw sources, a reduction of 8 (`16 - 8 = 8`). The remaining 31 raw findings are
raised by exactly one lane each and become 31 global findings one-to-one. Global
count: `8 + 31 = 39`, matching `47 - 8 = 39` above.
