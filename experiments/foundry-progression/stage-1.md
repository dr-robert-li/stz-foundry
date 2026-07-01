# Stage 1 — Provider abstraction (v1.1.0)

**Verdict: ✅ EARNED** (deterministic, 2026-07-02)

## What was built

`src/foundry/provider.ts` — the BYO-LLM seam. Two wire adapters behind one
`Provider` interface (`chat(ChatRequest) → ChatResponse`), created by
`createProvider(ProviderSpec)`:

- **anthropic** — Anthropic Messages API (`/v1/messages`, `x-api-key`,
  `anthropic-version`). **Prompt caching is mandatory, not caller-optional**:
  every request body carries top-level `cache_control: {type:"ephemeral"}`;
  the stable-first prefix contract (system/shared context before volatile
  content) is documented at the seam and honored by the request builder
  (system rides the dedicated `system` field; nothing volatile is injected
  into the prefix by the adapter itself). `cache_read_input_tokens` is
  surfaced in `ChatUsage` so callers can verify caching is actually hitting.
- **openai** — OpenAI-compatible `/chat/completions`. One adapter covers
  hosted OpenAI-shaped endpoints, **LiteLLM**, and **local inference**
  (Ollama `http://localhost:11434/v1`, vLLM) — keyless operation supported
  (no Authorization header when no key), which is the local/no-egress path.

Shared machinery: bounded retry (429/5xx/network retry with backoff,
4xx never retries, injectable sleep), `ProviderError` carrying
status/body-snippet/attempts, zero dependencies (global `fetch`, Node 20+).

## Eval design

Deterministic, no LLM, no real network egress: `test/foundry-provider.test.ts`
boots real `node:http` servers in-process and asserts the actual bytes on the
wire — not mocks of `fetch`.

1. **Anthropic request shape** — path, auth headers, `cache_control` present
   on the body (the universal caching rule made machine-checked), stable
   system prefix + volatile message split, multi-block text join, usage
   mapping incl. `cache_read_input_tokens`.
2. **OpenAI request shape** — path, bearer auth, system folded as first
   message, usage mapping.
3. **Local-inference shape** — keyless call against an Ollama-shaped fake:
   no auth header emitted, trailing-slash base URL normalized.
4. **Retry semantics** — 5xx→5xx→200 succeeds at attempt 3 (server saw
   exactly 3 requests); 400 throws immediately (exactly 1 request); persistent
   429 exhausts `maxAttempts` and throws `ProviderError` with the attempt
   count. Injectable no-op sleep ⇒ zero wall-clock.

## Results

- 6/6 stage-1 tests green; full suite **255/255**; typecheck clean.
- The seam is now real: anything that can serve one of the two wire shapes is
  a legal specimen/judge/test-author backend. Stage 2 builds the `ModelLayer`
  on top of it.

## Honesty caveats

- Caching is *asserted at the request layer* (the body carries the directive);
  whether a given deployment actually caches is only verifiable against a live
  Anthropic endpoint (`cache_read_input_tokens > 0`), which is out of scope at
  $0 budget. The field is plumbed so the check is one live call away.
- No streaming; tournament roles consume complete responses. Add if a live
  run shows timeout pressure on long generations.
- `max_tokens` is used for the OpenAI shape (broadest local-server compat);
  newer hosted endpoints preferring `max_completion_tokens` may need a spec
  flag later.
