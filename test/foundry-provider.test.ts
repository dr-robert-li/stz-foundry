/**
 * Stage-1 earn instrument (Foundry rebuild): the provider abstraction speaks
 * both wire shapes correctly against real in-process HTTP servers — request
 * shape, mandatory prompt caching on the anthropic path, usage mapping, and
 * bounded retry semantics. No network, no LLM, zero wall-clock sleeps.
 * See experiments/foundry-progression/stage-1.md.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server, type IncomingMessage } from "node:http";
import { createProvider, ProviderError } from "../src/foundry/provider.js";

type Handler = (req: IncomingMessage, body: any) => { status: number; json: unknown };

const servers: Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

/** Boot an in-process HTTP server; returns its base URL and captured requests. */
async function fakeServer(handler: Handler): Promise<{
  url: string;
  requests: Array<{ path: string; headers: Record<string, string | string[] | undefined>; body: any }>;
}> {
  const requests: Array<{ path: string; headers: any; body: any }> = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : null;
      requests.push({ path: req.url ?? "", headers: req.headers, body });
      const out = handler(req, body);
      res.writeHead(out.status, { "content-type": "application/json" });
      res.end(JSON.stringify(out.json));
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address() as { port: number };
  return { url: `http://127.0.0.1:${addr.port}`, requests };
}

const noSleep = () => Promise.resolve();

describe("anthropic adapter (stage 1)", () => {
  it("sends the Messages API shape with mandatory prompt caching", async () => {
    const srv = await fakeServer(() => ({
      status: 200,
      json: {
        model: "claude-sonnet-5",
        content: [{ type: "text", text: "hello " }, { type: "text", text: "world" }],
        usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 7 },
      },
    }));
    const p = createProvider({ kind: "anthropic", baseUrl: srv.url, apiKey: "k1", sleep: noSleep });
    const res = await p.chat({
      model: "claude-sonnet-5",
      system: "stable system prefix",
      messages: [{ role: "user", content: "volatile question" }],
      maxTokens: 128,
      temperature: 0,
    });

    const req = srv.requests[0]!;
    expect(req.path).toBe("/v1/messages");
    expect(req.headers["x-api-key"]).toBe("k1");
    expect(req.headers["anthropic-version"]).toBe("2023-06-01");
    // the UNIVERSAL caching rule: cache_control on every call
    expect(req.body.cache_control).toEqual({ type: "ephemeral" });
    // stable-first render order: system present, volatile content in messages
    expect(req.body.system).toBe("stable system prefix");
    expect(req.body.messages).toEqual([{ role: "user", content: "volatile question" }]);
    expect(req.body.max_tokens).toBe(128);

    expect(res.text).toBe("hello world");
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 7 });
  });
});

describe("openai-compatible adapter (stage 1)", () => {
  it("sends chat/completions with system folded first and bearer auth", async () => {
    const srv = await fakeServer(() => ({
      status: 200,
      json: {
        model: "gpt-x",
        choices: [{ message: { role: "assistant", content: "ok" } }],
        usage: { prompt_tokens: 20, completion_tokens: 3 },
      },
    }));
    const p = createProvider({ kind: "openai", baseUrl: srv.url, apiKey: "sk-test", sleep: noSleep });
    const res = await p.chat({
      model: "gpt-x",
      system: "sys",
      messages: [{ role: "user", content: "q" }],
    });

    const req = srv.requests[0]!;
    expect(req.path).toBe("/chat/completions");
    expect(req.headers.authorization).toBe("Bearer sk-test");
    expect(req.body.messages[0]).toEqual({ role: "system", content: "sys" });
    expect(req.body.messages[1]).toEqual({ role: "user", content: "q" });
    expect(res.text).toBe("ok");
    expect(res.usage).toEqual({ inputTokens: 20, outputTokens: 3, cacheReadInputTokens: 0 });
  });

  it("works keyless against a local-inference (Ollama-shaped) endpoint", async () => {
    const srv = await fakeServer(() => ({
      status: 200,
      json: {
        model: "qwen3.6:latest",
        choices: [{ message: { role: "assistant", content: "local" } }],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      },
    }));
    const p = createProvider({ kind: "openai", baseUrl: `${srv.url}/`, sleep: noSleep });
    const res = await p.chat({ model: "qwen3.6:latest", messages: [{ role: "user", content: "q" }] });
    expect(srv.requests[0]!.headers.authorization).toBeUndefined();
    // trailing-slash base URL normalized, no system message injected when absent
    expect(srv.requests[0]!.path).toBe("/chat/completions");
    expect(srv.requests[0]!.body.messages).toHaveLength(1);
    expect(res.text).toBe("local");
  });
});

describe("retry semantics (stage 1)", () => {
  it("retries 5xx then succeeds within maxAttempts", async () => {
    let n = 0;
    const srv = await fakeServer(() => {
      n++;
      return n < 3
        ? { status: 500, json: { error: "boom" } }
        : {
            status: 200,
            json: { choices: [{ message: { content: "recovered" } }], usage: {} },
          };
    });
    const p = createProvider({ kind: "openai", baseUrl: srv.url, sleep: noSleep });
    const res = await p.chat({ model: "m", messages: [{ role: "user", content: "q" }] });
    expect(res.text).toBe("recovered");
    expect(srv.requests).toHaveLength(3);
  });

  it("never retries a 4xx client error", async () => {
    const srv = await fakeServer(() => ({ status: 400, json: { error: "bad request" } }));
    const p = createProvider({ kind: "openai", baseUrl: srv.url, sleep: noSleep });
    await expect(
      p.chat({ model: "m", messages: [{ role: "user", content: "q" }] }),
    ).rejects.toMatchObject({ name: "ProviderError", status: 400, attempts: 1 });
    expect(srv.requests).toHaveLength(1);
  });

  it("throws ProviderError after exhausting retries on persistent 429", async () => {
    const srv = await fakeServer(() => ({ status: 429, json: { error: "rate" } }));
    const p = createProvider({ kind: "openai", baseUrl: srv.url, maxAttempts: 2, sleep: noSleep });
    const err = await p
      .chat({ model: "m", messages: [{ role: "user", content: "q" }] })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.status).toBe(429);
    expect(err.attempts).toBe(2);
    expect(srv.requests).toHaveLength(2);
  });
});
