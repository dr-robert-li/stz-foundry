/**
 * The embedding seam: one interface, two providers (Ollama when it answers, a
 * deterministic dependency-free fallback otherwise), and an explicit
 * provider-selection report.
 *
 * D1 makes a local daemon an optimization and never a requirement, so the seam
 * exists so the *decision* ("which provider, and why") lives in TypeScript rather
 * than in agent prose (CLAUDE.md architecture rule). `selectEmbedder()` returns a
 * `reason` alongside the embedder because REQ-06 requires provider selection to be
 * explicit and reported — it is printed in the bridge JSON and stored in the index
 * header.
 *
 * The fallback is a hashed char-n-gram + token bag. It is honestly NOT a semantic
 * embedder: it catches morphology ("naming"/"names") and word-order freedom, never
 * synonymy ("convention"/"standard"). What it is, is **corpus-independent** — a
 * document's vector is a pure function of its own text — which is what keeps the
 * incremental rebuild honest. TF-IDF and random indexing would make every stored
 * vector a function of the whole corpus, so adding one document would invalidate
 * the entire index.
 *
 * Determinism (D2/N6) is load-bearing here: same input → same vector, across runs
 * and across processes. `Math.sqrt` is used for the norm and NOT `Math.hypot` —
 * ECMA-262 lists `hypot` as implementation-approximated and the two disagree in
 * the last ulp on this machine. Vector summation always iterates by ascending
 * index so the float summation order is fixed.
 */
import { createHash } from "node:crypto";
import { postJson } from "../foundry/provider.js";

export interface Embedder {
  /** Stable identity. Vectors from different fingerprints are NOT comparable. */
  readonly fingerprint: string;
  readonly dim: number;
  /** Unit-normalized vectors, one per input, in input order. */
  embed(texts: string[], kind: "document" | "query"): Promise<number[][]>;
}

export const FALLBACK_DIM = 256;

/** L2 normalize. `Math.sqrt`, never `Math.hypot` (implementation-approximated). */
export function l2Normalize(v: number[]): number[] {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i]! * v[i]!;
  const norm = Math.sqrt(sum);
  if (norm === 0) return v.slice();
  const out = new Array<number>(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i]! / norm;
  return out;
}

/** Cosine of two already-unit vectors = plain dot product. `0` if incomparable. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
  return dot;
}

/** Whitespace tokens plus character 3/4/5-grams. Order is deterministic. */
function features(text: string): string[] {
  const lower = text.toLowerCase();
  const out: string[] = [];
  for (const tok of lower.split(/\s+/)) if (tok) out.push(`t:${tok}`);
  for (const n of [3, 4, 5]) {
    for (let i = 0; i + n <= lower.length; i++) out.push(`g:${lower.slice(i, i + n)}`);
  }
  return out;
}

/** sha256-derived bucket + sign — stable across processes, engines and machines. */
function bucket(feature: string, dim: number): { index: number; sign: number } {
  const digest = createHash("sha256").update(feature).digest();
  return { index: digest.readUInt32BE(0) % dim, sign: (digest[8]! & 1) === 0 ? 1 : -1 };
}

export function fallbackEmbedder(opts: { dim?: number } = {}): Embedder {
  const dim = opts.dim ?? FALLBACK_DIM;
  return {
    fingerprint: `fallback:hashed-ngram:${dim}:v1`,
    dim,
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map((text) => {
        const v = new Array<number>(dim).fill(0);
        for (const f of features(text)) {
          const { index, sign } = bucket(f, dim);
          v[index] = v[index]! + sign;
        }
        return l2Normalize(v);
      });
    },
  };
}

/**
 * The nomic task prefixes are part of the model's IDENTITY, not decoration: the
 * family measurably degrades when a document is embedded with no prefix or with
 * the query prefix, and changing either one invalidates every stored vector.
 * That is why they are pinned here and why the `v1` suffix rides in the
 * fingerprint — a prefix change is a fingerprint change is a full rebuild.
 */
export const SEARCH_DOCUMENT_PREFIX = "search_document: ";
export const SEARCH_QUERY_PREFIX = "search_query: ";
export const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
export const DEFAULT_EMBED_MODEL = "nomic-embed-text";
/**
 * The bound scales with batch size, because a whole rebuild is ONE call.
 *
 * Measured on this host against real `nomic-embed-text` (2026-07-29), which is
 * what retired the original flat 2s guess: a cold model load answered a
 * single-input request in **7.9s**, and a warm 21-document batch took **4.4s**.
 * A flat 2s therefore failed both the first run of the day AND every realistic
 * rebuild, silently landing the index on the fallback embedder — the failure is
 * quiet by design (any throw degrades), so it presented as "semantic recall just
 * isn't very good" rather than as an error.
 *
 * Base covers cold load; the per-input term covers the batch. Still strictly
 * bounded — an unbounded embed hangs the run, which is the thing this exists to
 * prevent. `keep_alive: "5m"` keeps the next run warm.
 * ponytail: linear in batch size, which is the shape the measurement showed;
 * if very large trees overshoot, chunk the batch rather than raising the base.
 */
export const EMBED_TIMEOUT_BASE_MS = 15_000;
export const EMBED_TIMEOUT_PER_INPUT_MS = 500;

/** Bound for a batch of `n` inputs. */
export function embedTimeoutMs(n: number): number {
  return EMBED_TIMEOUT_BASE_MS + EMBED_TIMEOUT_PER_INPUT_MS * Math.max(1, n);
}

/** Env overrides so zero-config works and a non-default daemon needs no file. */
function resolveOllama(opts: { baseUrl?: string; model?: string }): { baseUrl: string; model: string } {
  return {
    baseUrl: (opts.baseUrl ?? process.env.STZ_OLLAMA_URL ?? DEFAULT_OLLAMA_URL).replace(/\/+$/, ""),
    model: opts.model ?? process.env.STZ_EMBED_MODEL ?? DEFAULT_EMBED_MODEL,
  };
}

export interface OllamaEmbedderOptions {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  /** Pin the dimension up front (fingerprint reconstruction). Otherwise the first response fixes it. */
  dim?: number;
}

/**
 * Ollama `POST /api/embed`. No API key — Ollama is keyless.
 *
 * `maxAttempts: 1` is deliberate. The dominant failure here is a model that was
 * never pulled, which is not a transient condition: retrying it three times only
 * delays the fallback by two round trips. Anything this throws means "unavailable".
 *
 * The response is untrusted input (T-02-11): shape and width are validated before
 * use, and every vector is re-normalized locally regardless of what the server
 * claims, because a non-unit vector silently makes the dot product not a cosine.
 */
export function ollamaEmbedder(opts: OllamaEmbedderOptions = {}): Embedder {
  const { baseUrl, model } = resolveOllama(opts);
  // An explicit override is a flat bound; otherwise the bound scales per batch.
  const timeoutOverride = opts.timeoutMs;
  // 0 = "not yet known"; the first response fixes it and it may never move again.
  let dim = opts.dim ?? 0;
  return {
    get fingerprint(): string {
      return `ollama:${model}:${dim}:v1`;
    },
    get dim(): number {
      return dim;
    },
    async embed(texts: string[], kind: "document" | "query"): Promise<number[][]> {
      const prefix = kind === "query" ? SEARCH_QUERY_PREFIX : SEARCH_DOCUMENT_PREFIX;
      const json = await postJson(
        `${baseUrl}/api/embed`,
        {},
        // `input` accepts an array, so a whole rebuild batches into one call.
        { model, input: texts.map((t) => prefix + t), truncate: true, keep_alive: "5m" },
        1,
        () => Promise.resolve(),
        timeoutOverride ?? embedTimeoutMs(texts.length),
      );
      const raw: unknown = json?.embeddings;
      if (!Array.isArray(raw) || raw.length !== texts.length)
        throw new Error(`ollama /api/embed returned ${Array.isArray(raw) ? raw.length : "no"} embeddings for ${texts.length} inputs`);
      const width = Array.isArray(raw[0]) ? (raw[0] as unknown[]).length : 0;
      if (width === 0) throw new Error("ollama /api/embed returned an empty vector");
      for (const v of raw as unknown[]) {
        if (!Array.isArray(v) || v.length !== width || !v.every((n) => typeof n === "number" && Number.isFinite(n)))
          throw new Error("ollama /api/embed returned a malformed vector (ragged, non-numeric or non-finite)");
      }
      // The fingerprint is decided once and never moves mid-rebuild — otherwise
      // half an index is daemon vectors and half is something else under one
      // identity, which is unrecoverable because nothing records the seam (T-02-12).
      if (dim === 0) dim = width;
      else if (width !== dim)
        throw new Error(`ollama /api/embed changed dimension mid-run (${dim} -> ${width})`);
      return (raw as number[][]).map(l2Normalize);
    },
  };
}

/** Keep a reason line readable when it carries an arbitrary error string. */
const truncate = (s: string, n = 160): string => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * Pick a provider and say why. REQ-06: selection is explicit and reported.
 *
 * THE REAL EMBED CALL IS THE PROBE. There is deliberately no `/api/version`
 * liveness check: it answers 200 while `/api/embed` returns 404 for a model that
 * was never pulled — the exact state of a fresh install — so a liveness probe is
 * a second code path whose answer is a lie. One call, one failure semantic: any
 * throw at all (connection refused, 404 model-not-found, timeout, malformed
 * body) means "unavailable, use the fallback". D1: the daemon is an optimization,
 * never a requirement, so this function does not have a failing exit.
 */
export async function selectEmbedder(
  opts: { offline?: boolean; dim?: number; baseUrl?: string; model?: string; timeoutMs?: number } = {},
): Promise<{ embedder: Embedder; reason: string }> {
  const forced = opts.offline === true || process.env.STZ_EMBED === "fallback";
  if (forced)
    return {
      embedder: fallbackEmbedder(opts),
      reason: "offline requested (STZ_EMBED=fallback or offline:true) — deterministic fallback embedder",
    };
  const { baseUrl, model } = resolveOllama(opts);
  try {
    const embedder = ollamaEmbedder(opts);
    await embedder.embed(["stz embedding provider probe"], "query");
    return { embedder, reason: `ollama ${model} at ${baseUrl} — ${embedder.dim}-dim vectors from the daemon` };
  } catch (e) {
    return {
      embedder: fallbackEmbedder(opts),
      reason: `ollama ${model} at ${baseUrl} unavailable (${truncate(String(e))}) — deterministic fallback embedder`,
    };
  }
}

/**
 * Rebuild the embedder that produced a stored fingerprint, or `null`.
 *
 * The query path uses this so the query vector always comes from the *same*
 * embedder that produced the index. `null` means the semantic layer is disabled
 * and reported — never that vectors from two different embedders get compared,
 * which is worse than no semantic layer because the noise clears the floor
 * sometimes.
 */
export function embedderForFingerprint(
  fingerprint: string,
  opts: { baseUrl?: string; timeoutMs?: number } = {},
): Embedder | null {
  let embedder: Embedder;
  if (fingerprint.startsWith("fallback:")) {
    const dim = Number(fingerprint.split(":")[2]);
    if (!Number.isInteger(dim) || dim <= 0) return null;
    embedder = fallbackEmbedder({ dim });
  } else if (fingerprint.startsWith("ollama:")) {
    // Parsed from the ENDS, not by index: an Ollama model name legitimately
    // carries its own colon (`nomic-embed-text:v1.5`), so the model is whatever
    // sits between the scheme and the trailing `<dim>:v1`.
    const parts = fingerprint.split(":");
    if (parts.length < 4 || parts[parts.length - 1] !== "v1") return null;
    const dim = Number(parts[parts.length - 2]);
    const model = parts.slice(1, -2).join(":");
    if (!model || !Number.isInteger(dim) || dim <= 0) return null;
    embedder = ollamaEmbedder({ ...opts, model, dim });
  } else return null;
  // Reconstruct, then verify identity: a fingerprint that parses but does not
  // round-trip disables the semantic layer instead of silently comparing across
  // embedders.
  return embedder.fingerprint === fingerprint ? embedder : null;
}
