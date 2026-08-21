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
