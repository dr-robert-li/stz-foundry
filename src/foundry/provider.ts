/**
 * Foundry provider abstraction (stage 1 of the Foundry rebuild).
 *
 * The seam between the deterministic STZ spine and *directly-driven* models —
 * the BYO-LLM half of the roadmap's "distinct STZ-native harness". Two wire
 * shapes cover the practical universe:
 *
 *   - **anthropic**: the Anthropic Messages API (`/v1/messages`).
 *   - **openai**: OpenAI-compatible chat completions (`/chat/completions`) —
 *     which is also how local inference servers (Ollama `http://localhost:11434/v1`,
 *     vLLM) and LiteLLM are reached, so one adapter buys all of them.
 *
 * Design rules baked in rather than left to callers:
 *   - **Prompt caching is not optional** on the anthropic path: every request
 *     body carries top-level `cache_control: {type:"ephemeral"}` (automatic
 *     caching of the last cacheable block). Callers keep stable content
 *     (system, shared context) FIRST and volatile content last; this module
 *     never injects timestamps/ids into the prefix.
 *   - **Bounded retries**: 429/5xx/network errors retry up to `maxAttempts`
 *     with fixed backoff; 4xx client errors never retry. The sleep is
 *     injectable so tests run in zero wall-clock time.
 *   - **Zero dependencies**: node:http/https, nothing else. Not global fetch:
 *     undici enforces a 300s headers timeout, and a local inference server
 *     (Ollama) answers a non-streaming completion only after FULL generation —
 *     long generations on slow hardware exceed 300s and surface as spurious
 *     "fetch failed" network errors. node:http has no client timeout.
 */
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  model: string;
  /** Stable instruction prefix. Keep deterministic — it is the cache prefix. */
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
  /** Anthropic prompt-cache reads (0 when absent). Non-zero across repeated
   *  identical-prefix calls is the caching verification signal. */
  cacheReadInputTokens: number;
}

export interface ChatResponse {
  text: string;
  usage: ChatUsage;
  model: string;
}

export type ProviderKind = "anthropic" | "openai";

export interface ProviderSpec {
  kind: ProviderKind;
  /** e.g. https://api.anthropic.com | http://localhost:11434/v1 */
  baseUrl: string;
  apiKey?: string;
  /** Extra headers merged into every request (e.g. LiteLLM routing). */
  headers?: Record<string, string>;
  /** Retry ceiling incl. the first attempt. Default 3. */
  maxAttempts?: number;
  /** Injectable for tests. Default: real setTimeout backoff (500ms * attempt). */
  sleep?: (ms: number) => Promise<void>;
}

export interface Provider {
  readonly kind: ProviderKind;
  readonly baseUrl: string;
  chat(req: ChatRequest): Promise<ChatResponse>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly bodySnippet: string,
    readonly attempts: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

const DEFAULT_MAX_ATTEMPTS = 3;
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function retryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/** One POST over node:http(s) — no client timeout, unlike fetch/undici. */
function rawPost(
  url: string,
  headers: Record<string, string>,
  payload: string,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = (u.protocol === "https:" ? httpsRequest : httpRequest)(
      u,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
          ...headers,
        },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (text += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text }));
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

/** POST JSON with bounded retry. Shared by both adapters. */
async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  maxAttempts: number,
  sleep: (ms: number) => Promise<void>,
): Promise<any> {
  let lastStatus: number | null = null;
  let lastSnippet = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: { status: number; text: string };
    try {
      res = await rawPost(url, headers, JSON.stringify(body));
    } catch (e) {
      lastStatus = null;
      lastSnippet = String(e);
      if (attempt < maxAttempts) await sleep(500 * attempt);
      continue;
    }
    if (res.status >= 200 && res.status < 300) return JSON.parse(res.text);
    lastStatus = res.status;
    lastSnippet = res.text.slice(0, 300);
    if (!retryable(res.status)) {
      throw new ProviderError(
        `provider request failed (${res.status}, non-retryable)`,
        res.status,
        lastSnippet,
        attempt,
      );
    }
    if (attempt < maxAttempts) await sleep(500 * attempt);
  }
  throw new ProviderError(
    `provider request failed after ${maxAttempts} attempts` +
      (lastStatus === null ? " (network error)" : ` (last status ${lastStatus})`),
    lastStatus,
    lastSnippet,
    maxAttempts,
  );
}

class AnthropicProvider implements Provider {
  readonly kind = "anthropic" as const;
  readonly baseUrl: string;
  constructor(private spec: ProviderSpec) {
    this.baseUrl = spec.baseUrl.replace(/\/$/, "");
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      model: req.model,
      max_tokens: req.maxTokens ?? 4096,
      messages: req.messages,
      // UNIVERSAL rule: every Anthropic call caches. Top-level automatic
      // caching marks the last cacheable block; stable-first ordering is the
      // caller's contract (documented in the file header).
      cache_control: { type: "ephemeral" },
    };
    if (req.system !== undefined) body.system = req.system;
    if (req.temperature !== undefined) body.temperature = req.temperature;

    const json = await postJson(
      `${this.baseUrl}/v1/messages`,
      {
        "x-api-key": this.spec.apiKey ?? "",
        "anthropic-version": "2023-06-01",
        ...this.spec.headers,
      },
      body,
      this.spec.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      this.spec.sleep ?? defaultSleep,
    );

    const text = (json.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
    return {
      text,
      model: json.model ?? req.model,
      usage: {
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
        cacheReadInputTokens: json.usage?.cache_read_input_tokens ?? 0,
      },
    };
  }
}

class OpenAiCompatProvider implements Provider {
  readonly kind = "openai" as const;
  readonly baseUrl: string;
  constructor(private spec: ProviderSpec) {
    this.baseUrl = spec.baseUrl.replace(/\/$/, "");
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const messages = [
      ...(req.system !== undefined ? [{ role: "system", content: req.system }] : []),
      ...req.messages,
    ];
    const body: Record<string, unknown> = { model: req.model, messages };
    if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
    if (req.temperature !== undefined) body.temperature = req.temperature;

    const headers: Record<string, string> = { ...this.spec.headers };
    // Local servers (Ollama/vLLM) need no key; hosted ones do.
    if (this.spec.apiKey) headers.authorization = `Bearer ${this.spec.apiKey}`;

    const json = await postJson(
      `${this.baseUrl}/chat/completions`,
      headers,
      body,
      this.spec.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      this.spec.sleep ?? defaultSleep,
    );

    return {
      text: json.choices?.[0]?.message?.content ?? "",
      model: json.model ?? req.model,
      usage: {
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
        cacheReadInputTokens: 0,
      },
    };
  }
}

export function createProvider(spec: ProviderSpec): Provider {
  switch (spec.kind) {
    case "anthropic":
      return new AnthropicProvider(spec);
    case "openai":
      return new OpenAiCompatProvider(spec);
  }
}
