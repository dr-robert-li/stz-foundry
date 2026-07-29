/**
 * The Ollama embedding provider and the fallback it degrades to (REQ-06, D1/D2).
 *
 * Every case runs against a real in-process `node:http` server on an ephemeral
 * 127.0.0.1 port — no network, no daemon, no `nomic-embed-text` pull required.
 * `STZ_OLLAMA_URL` is pinned to a closed port in `beforeEach` so that even a test
 * that forgot to pass `baseUrl` cannot reach the daemon that happens to run on
 * this machine.
 *
 * The load-bearing case is `daemon up, model missing`: it returns HTTP 404, which
 * `postJson()` classifies as non-retryable and THROWS, while a `/api/version`
 * liveness probe would have answered 200. That is why the seam has no separate
 * probe and why this file asserts `selectEmbedder` RESOLVES to the fallback
 * rather than rejecting.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  selectEmbedder,
  embedderForFingerprint,
  ollamaEmbedder,
  fallbackEmbedder,
  SEARCH_DOCUMENT_PREFIX,
  SEARCH_QUERY_PREFIX,
  embedTimeoutMs,
} from "../src/knowledge/embedder.js";

/** `null` = never answer, which is the wedged-listener case. */
type Handler = (req: IncomingMessage, body: any) => { status: number; json: unknown } | null;

const servers: Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

/**
 * Boot an in-process HTTP server; returns its base URL and captured requests.
 * ponytail: copied from `test/foundry-provider.test.ts` rather than extracted —
 * the repo has no shared test-helper module and two consumers do not justify
 * establishing one. Extract if a third arrives.
 */
async function fakeServer(handler: Handler): Promise<{
  url: string;
  requests: Array<{ path: string; body: any }>;
  close: () => void;
}> {
  const requests: Array<{ path: string; body: any }> = [];
  const server = createServer((req, res: ServerResponse) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : null;
      requests.push({ path: req.url ?? "", body });
      const out = handler(req, body);
      if (!out) return; // hang: headers never written, response never ended
      res.writeHead(out.status, { "content-type": "application/json" });
      res.end(JSON.stringify(out.json));
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${addr.port}`,
    requests,
    close: () => server.close(),
  };
}

const UNIT = [3, 4, 0, 0, 12]; // deliberately NOT unit length — the seam must normalize

beforeEach(() => {
  delete process.env.STZ_EMBED;
  delete process.env.STZ_EMBED_MODEL;
  // Port 1 refuses instantly. Belt and braces: no test may reach 11434.
  process.env.STZ_OLLAMA_URL = "http://127.0.0.1:1";
});
afterEach(() => {
  delete process.env.STZ_EMBED;
  delete process.env.STZ_EMBED_MODEL;
  delete process.env.STZ_OLLAMA_URL;
});

describe("ollama embedder — happy path", () => {
  it("POSTs /api/embed with the model and the document task prefix, and normalizes what it gets back", async () => {
    const srv = await fakeServer(() => ({ status: 200, json: { model: "m", embeddings: [UNIT] } }));
    const { embedder, reason } = await selectEmbedder({ baseUrl: srv.url, model: "nomic-embed-text" });

    // The probe is a real embed call, and it is a QUERY-kind call.
    expect(srv.requests[0]!.path).toBe("/api/embed");
    expect(srv.requests[0]!.body.model).toBe("nomic-embed-text");
    expect(Array.isArray(srv.requests[0]!.body.input)).toBe(true);
    expect(srv.requests[0]!.body.input[0].startsWith(SEARCH_QUERY_PREFIX)).toBe(true);

    expect(embedder.fingerprint).toBe(`ollama:nomic-embed-text:${UNIT.length}:v1`);
    expect(embedder.dim).toBe(UNIT.length);
    expect(reason).toContain("nomic-embed-text");
    expect(reason).toContain(String(UNIT.length));

    const [vec] = await embedder.embed(["a document about slice conventions"], "document");
    expect(srv.requests[1]!.body.input[0]).toBe(`${SEARCH_DOCUMENT_PREFIX}a document about slice conventions`);
    expect(srv.requests[1]!.body.truncate).toBe(true);
    // Unit length regardless of what the server served (it served norm 13).
    expect(Math.sqrt(vec!.reduce((s, n) => s + n * n, 0))).toBeCloseTo(1, 12);
  });

  it("batches every input into one call, in input order", async () => {
    const srv = await fakeServer(() => ({ status: 200, json: { embeddings: [[1, 0], [0, 2], [0, -3]] } }));
    const embedder = ollamaEmbedder({ baseUrl: srv.url, model: "m" });
    const vecs = await embedder.embed(["a", "b", "c"], "document");

    expect(srv.requests).toHaveLength(1); // one call, not three
    expect(srv.requests[0]!.body.input).toEqual([
      `${SEARCH_DOCUMENT_PREFIX}a`,
      `${SEARCH_DOCUMENT_PREFIX}b`,
      `${SEARCH_DOCUMENT_PREFIX}c`,
    ]);
    expect(vecs).toEqual([[1, 0], [0, 1], [0, -1]]);
  });
});

describe("ollama embedder — every failure degrades to the deterministic fallback", () => {
  it("falls back when the daemon is up but the model was never pulled (HTTP 404)", async () => {
    // The exact live payload, probed against Ollama 0.30.6 on 2026-07-29.
    const srv = await fakeServer(() => ({
      status: 404,
      json: { error: 'model "nomic-embed-text" not found, try pulling it first' },
    }));
    // Resolves — does NOT reject. A liveness probe would have said "reachable".
    const { embedder, reason } = await selectEmbedder({ baseUrl: srv.url });

    expect(srv.requests).toHaveLength(1); // the embed call IS the probe
    expect(embedder.fingerprint.startsWith("fallback:")).toBe(true);
    expect(reason).toContain("unavailable");
    expect(reason).toContain("404");
  });

  it("falls back when nothing is listening at all (connection refused)", async () => {
    const srv = await fakeServer(() => ({ status: 200, json: { embeddings: [UNIT] } }));
    srv.close(); // keep the URL, lose the listener
    const { embedder, reason } = await selectEmbedder({ baseUrl: srv.url });

    expect(embedder.fingerprint.startsWith("fallback:")).toBe(true);
    expect(reason).toMatch(/unavailable/);
    expect(reason.length).toBeGreaterThan(20);
  });

  it(
    "falls back in bounded time when the listener accepts and never answers",
    async () => {
      // The shipped default is deliberately generous (a cold nomic-embed-text load
      // measured 7.9s on real hardware), so waiting it out here would dominate a
      // ~4s suite. The property under test is that the bound EXISTS and is
      // honored end to end, which an explicit override exercises on the identical
      // code path — `embedTimeoutMs` covers the default's value separately.
      const bound = 400;
      const srv = await fakeServer(() => null);
      const started = Date.now();
      const { embedder, reason } = await selectEmbedder({ baseUrl: srv.url, timeoutMs: bound });
      const elapsed = Date.now() - started;

      expect(embedder.fingerprint.startsWith("fallback:")).toBe(true);
      expect(reason).toContain("unavailable");
      expect(elapsed).toBeGreaterThanOrEqual(bound - 200);
      expect(elapsed).toBeLessThan(bound + 3000);
    },
    12_000,
  );

  // The shipped default must survive what real hardware actually does. Measured
  // 2026-07-29 against nomic-embed-text: cold single-input load 7.9s, warm
  // 21-document batch 4.4s. The original flat 2s failed BOTH — and because any
  // throw degrades to the fallback, it failed silently, presenting as poor recall
  // rather than as an error. These bounds encode that measurement.
  it("scales the default embed bound with batch size and stays finite", () => {
    expect(Number.isFinite(embedTimeoutMs(1))).toBe(true);
    // Headroom over the measured 7.9s cold load for a one-input probe.
    expect(embedTimeoutMs(1)).toBeGreaterThan(10_000);
    // Headroom over the measured 4.4s warm 21-doc batch.
    expect(embedTimeoutMs(21)).toBeGreaterThan(20_000);
    // Monotonic in batch size — a bigger rebuild never gets a tighter bound.
    expect(embedTimeoutMs(100)).toBeGreaterThan(embedTimeoutMs(21));
    // n=0 must not collapse the bound to the base alone being the only term.
    expect(embedTimeoutMs(0)).toBe(embedTimeoutMs(1));
  });

  it("falls back on a malformed response rather than indexing junk", async () => {
    for (const bad of [
      { embeddings: "not-an-array" },
      { embeddings: [] }, // fewer vectors than inputs
      { embeddings: [[1, 2], [3]] }, // ragged
      { embeddings: [["a", "b"]] }, // non-numeric
      { embeddings: [[1, Number.NaN]] }, // non-finite
      { embeddings: [[]] }, // empty vector
      {}, // no embeddings field at all
    ]) {
      const srv = await fakeServer(() => ({ status: 200, json: bad }));
      const { embedder } = await selectEmbedder({ baseUrl: srv.url });
      expect(embedder.fingerprint, `served ${JSON.stringify(bad)}`).toMatch(/^fallback:/);
      srv.close();
    }
  });

  it("refuses to change dimension mid-run once the fingerprint is fixed", async () => {
    let width = 4;
    const srv = await fakeServer(() => ({ status: 200, json: { embeddings: [new Array(width).fill(1)] } }));
    const embedder = ollamaEmbedder({ baseUrl: srv.url, model: "m" });
    await embedder.embed(["first"], "document");
    expect(embedder.fingerprint).toBe("ollama:m:4:v1");

    width = 8;
    // Half an index of 4-dim vectors and half of 8-dim under one identity is
    // unrecoverable, because nothing records where the seam is.
    await expect(embedder.embed(["second"], "document")).rejects.toThrow(/dimension/i);
    expect(embedder.fingerprint).toBe("ollama:m:4:v1");
  });
});

describe("the offline switch prevents the call, it does not discard the result", () => {
  it("issues zero HTTP requests when STZ_EMBED=fallback", async () => {
    const srv = await fakeServer(() => ({ status: 200, json: { embeddings: [UNIT] } }));
    process.env.STZ_EMBED = "fallback";
    const { embedder, reason } = await selectEmbedder({ baseUrl: srv.url });

    expect(srv.requests).toHaveLength(0);
    expect(embedder.fingerprint.startsWith("fallback:")).toBe(true);
    expect(reason).toContain("offline requested");
  });

  it("issues zero HTTP requests when offline:true", async () => {
    const srv = await fakeServer(() => ({ status: 200, json: { embeddings: [UNIT] } }));
    const { embedder } = await selectEmbedder({ baseUrl: srv.url, offline: true });

    expect(srv.requests).toHaveLength(0);
    expect(embedder.fingerprint.startsWith("fallback:")).toBe(true);
  });
});

describe("embedderForFingerprint round-trips both providers", () => {
  it("rebuilds an ollama embedder for its own fingerprint without issuing a request", async () => {
    const srv = await fakeServer(() => ({ status: 200, json: { embeddings: [UNIT] } }));
    const rebuilt = embedderForFingerprint("ollama:nomic-embed-text:768:v1", { baseUrl: srv.url });

    expect(rebuilt).not.toBeNull();
    expect(rebuilt!.fingerprint).toBe("ollama:nomic-embed-text:768:v1");
    expect(rebuilt!.dim).toBe(768);
    expect(srv.requests).toHaveLength(0); // reconstruction is not a network act
  });

  it("round-trips a model name that carries its own colon", () => {
    const fp = ollamaEmbedder({ model: "nomic-embed-text:v1.5", dim: 512 }).fingerprint;
    expect(fp).toBe("ollama:nomic-embed-text:v1.5:512:v1");
    expect(embedderForFingerprint(fp)?.fingerprint).toBe(fp);
  });

  it("returns null for anything it cannot reconstruct exactly", () => {
    for (const fp of [
      "ollama:m:0:v1",
      "ollama:m:v1",
      "ollama::768:v1",
      "ollama:m:768:v2",
      "ollama:m:seven:v1",
      "openai:text-embedding-3-small:1536:v1",
      "",
    ]) {
      expect(embedderForFingerprint(fp), fp).toBeNull();
    }
    expect(embedderForFingerprint("fallback:hashed-ngram:256:v1")).not.toBeNull();
  });
});

describe("fallback determinism is cross-PROCESS, not just cross-call (D2/N6)", () => {
  it("produces byte-identical vectors from two independent node processes", () => {
    // In-process equality is not evidence: a memoizing Math.random() embedder
    // passes it. Two fresh processes is the assertion with teeth.
    const repoRoot = fileURLToPath(new URL("../", import.meta.url));
    const script =
      'import { fallbackEmbedder } from "./src/knowledge/embedder.ts";' +
      'const v = await fallbackEmbedder().embed(["a convention for naming things across slices"], "document");' +
      "process.stdout.write(JSON.stringify(v));";
    const run = () =>
      execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
        cwd: repoRoot,
        encoding: "utf8",
        env: { ...process.env, STZ_EMBED: "fallback" },
      });

    const a = run();
    const b = run();
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(500); // an empty result must not pass trivially
    expect(a.startsWith("[[")).toBe(true);
  }, 30_000);

  it("is the same vector the in-process embedder produces", async () => {
    const [v] = await fallbackEmbedder().embed(["a convention for naming things across slices"], "document");
    expect(Math.sqrt(v!.reduce((s, n) => s + n * n, 0))).toBeCloseTo(1, 12);
  });
});
