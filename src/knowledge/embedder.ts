/**
 * The embedding seam: one interface, a deterministic dependency-free fallback,
 * and an explicit provider-selection report.
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
 * Pick a provider and say why. REQ-06: selection is explicit and reported.
 *
 * ponytail: one branch today — the fallback. 02-02 adds the Ollama branch behind
 * the same `forced` switch; the shape of this function is what stays.
 */
export async function selectEmbedder(
  opts: { offline?: boolean; dim?: number } = {},
): Promise<{ embedder: Embedder; reason: string }> {
  const forced = opts.offline === true || process.env.STZ_EMBED === "fallback";
  return {
    embedder: fallbackEmbedder(opts),
    reason: forced
      ? "offline requested (STZ_EMBED=fallback or offline:true) — deterministic fallback embedder"
      : "no local embedding provider wired yet — deterministic fallback embedder",
  };
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
export function embedderForFingerprint(fingerprint: string): Embedder | null {
  if (!fingerprint.startsWith("fallback:")) return null;
  const dim = Number(fingerprint.split(":")[2]);
  if (!Number.isInteger(dim) || dim <= 0) return null;
  const embedder = fallbackEmbedder({ dim });
  return embedder.fingerprint === fingerprint ? embedder : null;
}
