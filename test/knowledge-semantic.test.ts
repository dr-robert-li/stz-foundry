/**
 * Phase 02 (v1.17.0) — the semantic layer's proof burden.
 *
 * Success criterion 1 (a paraphrase-only hit the lexical scorer misses) is
 * validated against a STUBBED `Embedder`, never against the fallback. Every
 * dependency-free deterministic embedder is a smoothed lexical matcher: char
 * n-grams buy morphology ("naming"/"names"), never synonymy
 * ("convention"/"standard"). A paraphrase test written against the fallback
 * would either fail honestly or be gamed by picking a pair that happens to
 * share n-grams — a green test certifying nothing (02-RESEARCH.md §"Fallback
 * embedder — the honest limit").
 *
 * The stub is injected through the same seam the real providers flow through:
 * `Embedder.embed()` produces the vectors, they are handed to `retrieve()` as a
 * `SemanticInput` exactly as `knowledge-query` builds one. The test exercises
 * the production path, not a parallel one.
 *
 * Offline by construction: an Ollama daemon is live on this machine, so
 * `STZ_EMBED=fallback` is pinned even though nothing here selects a provider.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  retrieve,
  DEFAULT_CAPS,
  type RetrievableArtifact,
  type RetrievalQuery,
  type SemanticInput,
} from "../src/knowledge/retrieval.js";
import type { Embedder } from "../src/knowledge/embedder.js";

beforeEach(() => {
  process.env.STZ_EMBED = "fallback";
});
afterEach(() => {
  delete process.env.STZ_EMBED;
});

/**
 * A hand-authored 2-concept lexicon. Anything mentioning the concept lands on
 * one unit vector, everything else on an orthogonal one — so cosine is exactly
 * 1.0 for a paraphrase and exactly 0 otherwise, with no lexical component
 * anywhere in it.
 */
const PARAPHRASE = /convention|standard|house style/i;

const stubEmbedder: Embedder = {
  fingerprint: "stub:paraphrase:4:v1",
  dim: 4,
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => (PARAPHRASE.test(t) ? [1, 0, 0, 0] : [0, 1, 0, 0]));
  },
};

/**
 * Build a `SemanticInput` the way `knowledge-query` does: documents embedded
 * with the document task kind, the joined query keywords with the query kind,
 * both from ONE embedder whose fingerprint rides along.
 */
async function semanticFor(
  embedder: Embedder,
  pool: RetrievableArtifact[],
  query: RetrievalQuery,
): Promise<SemanticInput> {
  const docs = await embedder.embed(
    pool.map((a) => a.text),
    "document",
  );
  const [queryVector] = await embedder.embed([query.keywords.join(" ")], "query");
  const vectors: Record<string, number[]> = {};
  pool.forEach((a, i) => {
    vectors[a.id] = docs[i]!;
  });
  return { vectors, queryVector: queryVector!, embedder: embedder.fingerprint };
}

/** True if the two strings share a whitespace token or any substring of length >= 4. */
function sharesLexically(a: string, b: string): boolean {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  const tokens = new Set(lb.split(/\s+/).filter(Boolean));
  for (const t of la.split(/\s+/)) if (t && tokens.has(t)) return true;
  for (let i = 0; i + 4 <= la.length; i++) if (lb.includes(la.slice(i, i + 4))) return true;
  return false;
}

// The paraphrase pair. "standard" and "naming convention for exported helpers"
// share no whitespace token and no substring of length 4 (the "standard"
// 4-grams are stan/tand/anda/ndar/dard; none occurs in the artifact text), so
// the existing substring-matching lexical scorer CANNOT reach this artifact.
// The property is asserted below rather than only asserted here in prose.
const PARAPHRASE_DOC = "naming convention for exported helpers";
const PARAPHRASE_KEYWORD = "standard";

const conv = (id: string, text: string): RetrievableArtifact => ({
  id,
  kind: "convention",
  trust: "accepted",
  symbols: [],
  text,
});

describe("criterion 1 — a paraphrase hit the lexical scorer provably misses", () => {
  const pool: RetrievableArtifact[] = [conv("20-standards/naming.md", PARAPHRASE_DOC)];
  const query: RetrievalQuery = {
    symbols: [],
    keywords: [PARAPHRASE_KEYWORD],
    requestedKinds: ["convention"],
    stepId: "step-paraphrase",
  };

  it("uses a pair with zero lexical overlap — otherwise the test proves nothing", () => {
    expect(sharesLexically(PARAPHRASE_KEYWORD, PARAPHRASE_DOC)).toBe(false);
    // …and the guard itself has teeth.
    expect(sharesLexically("naming standards", PARAPHRASE_DOC)).toBe(true);
  });

  it("MISSES the artifact on the lexical path (the assertion with the teeth)", () => {
    const ids = retrieve(pool, query, DEFAULT_CAPS).map((h) => h.artifact.id);
    expect(ids).not.toContain("20-standards/naming.md");
    expect(ids).toEqual([]);
  });

  it("RETURNS the same artifact once the stubbed embedder is injected through the seam", async () => {
    const semantic = await semanticFor(stubEmbedder, pool, query);
    const hits = retrieve(pool, query, DEFAULT_CAPS, semantic);
    expect(hits.map((h) => h.artifact.id)).toContain("20-standards/naming.md");
  });

  it("explains the semantic hit as auditably as a lexical one (D3)", async () => {
    const semantic = await semanticFor(stubEmbedder, pool, query);
    const [hit] = retrieve(pool, query, DEFAULT_CAPS, semantic);
    const block = hit!.explanation.semantic!;
    expect(block).toBeDefined();
    expect(block.cosine).toBe(1); // rounded to 4dp
    expect(Number.isInteger(block.points)).toBe(true);
    expect(block.points).toBeGreaterThan(0);
    expect(block.embedder).toBe("stub:paraphrase:4:v1");
    expect(block.sourcePath).toBe("20-standards/naming.md");
    // "the vectors were close" is forbidden: the string must name the miss, the
    // source document and the embedder that produced both vectors.
    const why = hit!.explanation.whySelected;
    expect(why.length).toBeGreaterThan(0);
    expect(why).toContain("no symbol/keyword overlap");
    expect(why).toContain("20-standards/naming.md");
    expect(why).toContain("stub:paraphrase:4:v1");
  });

  it("still caps a kind at its per-kind cap when everything matches semantically", async () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      conv(`20-standards/conv-${i}.md`, `${PARAPHRASE_DOC} ${i}`),
    );
    const semantic = await semanticFor(stubEmbedder, many, query);
    const hits = retrieve(many, query, DEFAULT_CAPS, semantic);
    expect(DEFAULT_CAPS.convention).toBe(2);
    expect(hits.length).toBeLessThanOrEqual(DEFAULT_CAPS.convention);
    expect(hits.length).toBe(2);
  });
});
