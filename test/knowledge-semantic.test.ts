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
  semanticPoints,
  DEFAULT_CAPS,
  SEMANTIC_FLOOR,
  SEMANTIC_WEIGHT,
  type RetrievableArtifact,
  type RetrievableKind,
  type RetrievalQuery,
  type SemanticInput,
} from "../src/knowledge/retrieval.js";
import type { Embedder } from "../src/knowledge/embedder.js";
import { resolveRoleScope, capsForRole } from "../src/knowledge/scope.js";
import { STZ_ROLES } from "../src/types.js";

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

// ── the floor, the integer score, and the caps under semantic pressure ───────

/**
 * A vector whose cosine against `[1, 0]` is EXACTLY `cos`: the second component
 * multiplies by zero in the dot product, so no float error can enter and the
 * boundary cases land on the boundary rather than one ulp either side of it.
 */
const atCosine = (cos: number): number[] => [cos, Math.sqrt(Math.max(0, 1 - cos * cos))];

function semanticAt(cosines: Record<string, number>): SemanticInput {
  const vectors: Record<string, number[]> = {};
  for (const [id, cos] of Object.entries(cosines)) vectors[id] = atCosine(cos);
  return { vectors, queryVector: [1, 0], embedder: "stub:cosine:2:v1" };
}

/** Shares nothing with any artifact text below — the score is purely semantic. */
const NO_OVERLAP = "zzzz-no-lexical-overlap";

const kindArt = (id: string, kind: RetrievableKind): RetrievableArtifact => ({
  id,
  kind,
  trust: "accepted",
  symbols: [],
  text: "house style for module layout",
});

describe("the similarity floor — the no-bulk-dump guard under semantic pressure", () => {
  const query: RetrievalQuery = {
    symbols: [],
    keywords: [NO_OVERLAP],
    requestedKinds: ["convention"],
    stepId: "step-floor",
  };
  const pool = [kindArt("20-standards/a.md", "convention")];

  it("drops an artifact whose cosine is strictly positive but below the floor", () => {
    // Named-constant guard: a positive-but-below-floor cosine only EXISTS while
    // the floor is in (0, 1]. 02-05 recalibrates SEMANTIC_FLOOR, and a
    // recalibration out of that range must fail here, naming the constant,
    // rather than failing opaquely inside a fixture that cannot be built.
    expect(SEMANTIC_FLOOR).toBeGreaterThan(0);
    expect(SEMANTIC_FLOOR).toBeLessThanOrEqual(1);

    const below = SEMANTIC_FLOOR / 2;
    expect(below).toBeGreaterThan(0); // every artifact has a non-zero cosine
    const hits = retrieve(pool, query, DEFAULT_CAPS, semanticAt({ "20-standards/a.md": below }));
    // Without the floor, `score > 0` is universally true and the guard evaporates
    // while every pre-existing test stays green (they all pass zero-cosine data).
    expect(hits).toEqual([]);
  });

  it("keeps an artifact sitting exactly ON the floor (inclusive boundary, pinned)", () => {
    const hits = retrieve(pool, query, DEFAULT_CAPS, semanticAt({ "20-standards/a.md": SEMANTIC_FLOOR }));
    expect(hits.map((h) => h.artifact.id)).toEqual(["20-standards/a.md"]);
    expect(hits[0]!.explanation.semantic!.points).toBeGreaterThan(0);
  });
});

describe("semanticPoints — integer quantization, NaN-safe, never negative", () => {
  it("returns an integer for every cosine that clears the floor", () => {
    for (const cos of [0.6, 0.75, 0.99, 1.0]) {
      const pts = semanticPoints(cos);
      expect(Number.isInteger(pts), `cos=${cos} -> ${pts}`).toBe(true);
      expect(pts).toBeGreaterThanOrEqual(0);
      expect(pts).toBeLessThanOrEqual(SEMANTIC_WEIGHT);
    }
  });

  it("returns exactly 0 for NaN, for a negative cosine, and below the floor", () => {
    for (const cos of [Number.NaN, -0.5, -1, SEMANTIC_FLOOR / 2]) {
      const pts = semanticPoints(cos);
      expect(pts, `cos=${cos}`).toBe(0);
      // `Math.round(-0.5)` is `-0`; a negative zero reaching the score would sort
      // as a number that is neither above nor below its peers by `y - x`.
      expect(Object.is(pts, -0), `cos=${cos} produced -0`).toBe(false);
    }
  });
});

describe("deterministic tie-ordering survives semantic scoring (N6, H1)", () => {
  const query: RetrievalQuery = {
    symbols: [],
    keywords: [NO_OVERLAP],
    requestedKinds: ["convention"],
    stepId: "step-ties",
  };
  const a = kindArt("20-standards/a.md", "convention");
  const b = kindArt("20-standards/b.md", "convention");
  // Cosines that differ only in the third decimal. A FLOAT score would make
  // `y.score - x.score` a tiny non-zero here, the `id asc` branch would never
  // fire, and float noise would dictate the order. The integer quantization is
  // what keeps this a tie at all.
  const cosines = { "20-standards/a.md": 1.0, "20-standards/b.md": 0.999 };

  it("quantizes near-equal cosines to the same integer", () => {
    expect(SEMANTIC_FLOOR).toBeLessThanOrEqual(0.999); // else the pair cannot be built
    expect(semanticPoints(1.0)).toBe(semanticPoints(0.999));
  });

  it("orders equal-scoring hits by id ascending, identically across runs and pool orders", () => {
    const semantic = semanticAt(cosines);
    const forward = retrieve([a, b], query, DEFAULT_CAPS, semantic);
    const reversed = retrieve([b, a], query, DEFAULT_CAPS, semantic);
    const repeat = retrieve([a, b], query, DEFAULT_CAPS, semantic);

    expect(forward.map((h) => h.artifact.id)).toEqual(["20-standards/a.md", "20-standards/b.md"]);
    expect(forward[0]!.explanation.score).toBe(forward[1]!.explanation.score); // a genuine tie
    expect(reversed.map((h) => h.artifact.id)).toEqual(forward.map((h) => h.artifact.id));
    expect(repeat).toEqual(forward);
  });
});

describe("repo_note stays capped at 0 with the semantic layer engaged (CTIM-Rover)", () => {
  it("returns zero hits for a perfect-cosine repo_note under DEFAULT_CAPS", () => {
    const note = kindArt("note.messy", "repo_note");
    const query: RetrievalQuery = {
      symbols: [],
      keywords: [NO_OVERLAP],
      requestedKinds: ["repo_note"], // requested EXPLICITLY — the cap is the control
      stepId: "step-repo-note",
    };
    const hits = retrieve([note], query, DEFAULT_CAPS, semanticAt({ "note.messy": 1.0 }));
    expect(DEFAULT_CAPS.repo_note).toBe(0);
    expect(hits).toEqual([]);
  });
});

// ── role scoping is default-deny, not default-everything (REQ-08) ────────────

describe("role scoping — an unknown role retrieves nothing", () => {
  it("returns null for every string outside STZ_ROLES", () => {
    // The case-variant matters most: a case-insensitive lookup is the most
    // tempting "helpful" simplification and it turns a typo into a successful
    // privilege grant. A role string is the only thing standing between an
    // `execution` specimen and the judging rubric.
    for (const bad of ["", " ", "not-a-role", "executon", "plannning", "EXECUTION", "Judging", "*"]) {
      expect(resolveRoleScope(bad), bad).toBeNull();
      expect(capsForRole(bad), bad).toBeNull();
    }
  });

  it("resolves a scope for EVERY member of STZ_ROLES — asserted by ITERATING the constant", () => {
    // Iterated, never a hardcoded list of six names: a seventh role added to
    // `src/types.ts` fails here instead of quietly falling through the lookup.
    expect(STZ_ROLES.length).toBeGreaterThan(0);
    for (const role of STZ_ROLES) {
      const scope = resolveRoleScope(role);
      expect(scope, role).not.toBeNull();
      expect(scope!.kinds.length, role).toBeGreaterThan(0);
    }
  });

  it("merges every role's caps OVER DEFAULT_CAPS, so repo_note stays 0 for all of them", () => {
    // `DEFAULT_CAPS` is typed `Record<RetrievableKind, number>`, so its keys ARE
    // the union: a new kind must be added there (typecheck) and is then covered
    // here automatically. A role that REPLACED the defaults instead of merging
    // over them would drop `repo_note: 0` and silently re-enable the one kind
    // the whole CTIM-Rover mitigation exists to disable.
    const everyKind = Object.keys(DEFAULT_CAPS) as RetrievableKind[];
    for (const role of STZ_ROLES) {
      const caps = capsForRole(role)!;
      expect(Object.keys(caps).sort(), role).toEqual(everyKind.slice().sort());
      expect(caps.repo_note, role).toBe(0);
    }
  });

  it("keeps the judging rubric out of the execution scope — structurally and end to end", () => {
    const execution = resolveRoleScope("execution")!;
    expect(execution.kinds).not.toContain("rubric");

    // …and the structural fact is enforced where it matters: `requestedKinds`
    // comes from the scope's kinds, so a perfect-cosine rubric is unreachable.
    // `capsForRole()` CANNOT be the control — it merges over DEFAULT_CAPS and
    // therefore still carries a non-zero cap for `rubric`.
    expect(capsForRole("execution")!.rubric).toBeGreaterThan(0);

    const pool = [kindArt("20-standards/rubric.md", "rubric"), kindArt("20-standards/conv.md", "convention")];
    const semantic = semanticAt({ "20-standards/rubric.md": 1.0, "20-standards/conv.md": 1.0 });
    const hits = retrieve(
      pool,
      { symbols: [], keywords: [NO_OVERLAP], requestedKinds: execution.kinds, stepId: "step-role" },
      capsForRole("execution")!,
      semantic,
    );
    const ids = hits.map((h) => h.artifact.id);
    expect(ids).not.toContain("20-standards/rubric.md");
    expect(ids).toContain("20-standards/conv.md"); // the deny cannot pass trivially
  });
});
