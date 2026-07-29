/**
 * STZ 0.9.6 — selective retrieval of promoted artifacts (PHASED-PLAN Phase 6).
 *
 * Deterministic, no FAISS, no vector DB, no bulk injection. Retrieves only
 * ACCEPTED artifacts, only the requested kinds, capped per kind, each with a
 * mandatory explanation (why selected + what it matched). `repo_note` is capped
 * at 0 by default (the CTIM-Rover risk: one noisy note steers the agent to the
 * wrong function); candidate-trust artifacts and patches are never retrievable
 * into a generation context.
 *
 * Scoring is a deterministic overlap: symbol matches weigh more than keyword
 * matches. Same pool + query → same hits, every run (N6).
 *
 * 1.17.0 adds an OPTIONAL semantic layer (4th parameter). Absent, this function
 * behaves exactly as it always has. Present, a cosine over pre-computed unit
 * vectors contributes an INTEGER number of points to the same score, so the
 * `score desc, id asc` comparator below is untouched — a float score would make
 * `y.score - x.score` a tiny non-zero for near-equal scores, the `id asc` branch
 * would never fire, and ordering would be dictated by float noise instead of the
 * documented stable rule. A similarity FLOOR is mandatory rather than cosmetic:
 * every artifact has a non-zero cosine to every query, so without it `score > 0`
 * is always true and the "no bulk dump" guard silently evaporates.
 */
import { cosine } from "./embedder.js";
export type RetrievableKind =
  | "predicate"
  | "contract_delta"
  | "rubric"
  | "search_heuristic"
  | "repo_note"
  // `.stz/` audit-tree documents (cross-slice recall). `repo_note` would be the
  // wrong home: it is capped at 0 for CTIM-Rover reasons, so a hit would silently
  // never appear and raising the cap would undo that safety property.
  | "convention"
  | "decision";

export interface RetrievableArtifact {
  id: string;
  kind: RetrievableKind;
  /** Only `accepted` artifacts may ever be retrieved into a generation context. */
  trust: "accepted" | "candidate";
  /** Anchored code symbols (drive precise matching). */
  symbols: string[];
  /** Title/statement text for keyword matching. */
  text: string;
}

export interface RetrievalQuery {
  symbols: string[];
  keywords: string[];
  requestedKinds: RetrievableKind[];
  /** Per-step retrieval tracking (per-step is the CTIM-Rover-safe trigger). */
  stepId: string;
}

export interface RetrievalExplanation {
  whySelected: string;
  matchedSymbols: string[];
  matchedKeywords: string[];
  score: number;
  /** Present only when the semantic layer actually contributed points. */
  semantic?: {
    /** Raw cosine, rounded to 4dp, for audit. */
    cosine: number;
    /** The integer that entered the score. */
    points: number;
    /** Fingerprint of the embedder that produced BOTH vectors. */
    embedder: string;
    /** `.stz`-relative path the vector came from. */
    sourcePath: string;
  };
}

/**
 * Pre-computed vectors for a semantic pass. `vectors` is keyed by artifact id and
 * `queryVector` MUST come from the same embedder (`embedder` is its fingerprint) —
 * cosines between two different embedders are noise that clears the floor
 * sometimes, which is worse than no semantic layer at all.
 */
export interface SemanticInput {
  vectors: Record<string, number[]>;
  queryVector: number[];
  embedder: string;
  floor?: number;
  weight?: number;
}

/** cos 1.0 ≈ 1.5 symbol matches. LOW-confidence starting value (A2); tunable. */
export const SEMANTIC_WEIGHT = 3;
/**
 * Below the floor, a cosine contributes exactly ZERO.
 *
 * **The floor is per-embedder, because a cosine is only meaningful relative to the
 * model that produced it.** Measured 2026-07-29 over the same 21-document `.stz/`
 * tree, the two embedders that ship here do not even overlap:
 *
 * | embedder                          | noise ceiling | true positives         |
 * |-----------------------------------|---------------|------------------------|
 * | `ollama:nomic-embed-text:768:v1`  | 0.5242        | 0.5504 0.6273 0.7003   |
 * | `fallback:hashed-ngram:256:v1`    | 0.2036        | 0.3953 0.2621 0.2261   |
 *
 * nomic has a high baseline and a narrow band (~0.52–0.55 is the whole usable
 * range); the sparse hashed-n-gram fallback sits near zero and spreads wider. One
 * shared constant is therefore wrong for at least one of them by construction — at
 * nomic's 0.54 the fallback's semantic layer can never fire at all, and at the
 * fallback's 0.24 nomic would return its entire corpus for the word "the".
 *
 * Both numbers are the observed noise ceiling plus a small margin. Both margins are
 * thin (~0.016 and ~0.036) and corpus-dependent — longer documents or a different
 * tree move the ceiling. Re-measure rather than trust; the procedure is in
 * `docs/development/semantic-recall.md`.
 */
export const CALIBRATED_FLOORS: Readonly<Record<string, number>> = {
  "ollama:nomic-embed-text:768:v1": 0.54,
  "fallback:hashed-ngram:256:v1": 0.24,
};

/**
 * Floor for an embedder nobody has calibrated. Deliberately high: an uncalibrated
 * model should contribute almost nothing rather than an unknown amount of noise,
 * because the failure mode of a too-low floor is silent (every artifact clears it,
 * `score > 0` becomes universally true, and the no-bulk-injection guard is gone)
 * while the failure mode of a too-high floor is merely "semantic recall found
 * nothing", which is visible and reported.
 */
export const UNCALIBRATED_SEMANTIC_FLOOR = 0.8;

/** Default for direct callers that pass no explicit floor. */
export const SEMANTIC_FLOOR = UNCALIBRATED_SEMANTIC_FLOOR;

export interface ResolvedFloor {
  floor: number;
  /** `calibrated` = measured for this exact embedder; `env` = operator override. */
  source: "calibrated" | "env" | "uncalibrated";
  fingerprint: string;
}

/**
 * Resolve the floor for a specific embedder identity. Precedence: an explicit
 * `STZ_SEMANTIC_FLOOR` override (an operator who has measured their own corpus),
 * then the calibration table, then the conservative uncalibrated default.
 *
 * An out-of-range override is IGNORED rather than honored: `floor <= 0` does not
 * tune the layer, it deletes the no-bulk-injection guard entirely.
 */
export function resolveSemanticFloor(fingerprint: string, env = process.env): ResolvedFloor {
  const raw = env.STZ_SEMANTIC_FLOOR;
  if (raw !== undefined && raw !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 1)
      return { floor: parsed, source: "env", fingerprint };
  }
  const calibrated = CALIBRATED_FLOORS[fingerprint];
  if (calibrated !== undefined) return { floor: calibrated, source: "calibrated", fingerprint };
  return { floor: UNCALIBRATED_SEMANTIC_FLOOR, source: "uncalibrated", fingerprint };
}

/**
 * Integer points from a cosine. `!(cos >= floor)` is NaN-safe by construction and
 * rejects negatives; the clamp runs BEFORE the round so `Math.round(-0.5) === -0`
 * can never reach the score.
 */
export function semanticPoints(cos: number, floor = SEMANTIC_FLOOR, weight = SEMANTIC_WEIGHT): number {
  if (!(cos >= floor)) return 0;
  return Math.round(weight * Math.min(1, Math.max(0, cos)));
}

export interface RetrievalHit {
  artifact: RetrievableArtifact;
  explanation: RetrievalExplanation;
}

/** Per-kind caps. `repo_note` disabled by default; patches/tests never listed. */
export const DEFAULT_CAPS: Record<RetrievableKind, number> = {
  predicate: 3,
  contract_delta: 2,
  rubric: 1,
  search_heuristic: 1,
  repo_note: 0,
  convention: 2,
  decision: 2,
};

const lc = (s: string) => s.toLowerCase();

function scoreArtifact(
  a: RetrievableArtifact,
  q: RetrievalQuery,
): { score: number; matchedSymbols: string[]; matchedKeywords: string[] } {
  const qsyms = new Set(q.symbols.map(lc));
  const matchedSymbols = a.symbols.filter((s) => qsyms.has(lc(s)));
  const qkw = q.keywords.map(lc);
  const text = lc(a.text);
  const matchedKeywords = qkw.filter((k) => text.includes(k));
  // Symbol matches are worth 2, keyword matches 1 — symbols are the precise anchor.
  const score = 2 * matchedSymbols.length + matchedKeywords.length;
  return { score, matchedSymbols, matchedKeywords };
}

/**
 * Selective, capped, explained retrieval. Pure + deterministic. Returns [] for a
 * kind whose cap is 0. Never returns a non-accepted artifact, an unrequested
 * kind, or a zero-overlap artifact (no bulk).
 */
export function retrieve(
  pool: RetrievableArtifact[],
  query: RetrievalQuery,
  caps: Record<RetrievableKind, number> = DEFAULT_CAPS,
  semantic?: SemanticInput,
): RetrievalHit[] {
  const floor = semantic?.floor ?? SEMANTIC_FLOOR;
  const weight = semantic?.weight ?? SEMANTIC_WEIGHT;
  const hits: RetrievalHit[] = [];
  for (const kind of query.requestedKinds) {
    const cap = caps[kind] ?? 0;
    if (cap === 0) continue;
    const scored = pool
      .filter((a) => a.kind === kind && a.trust === "accepted")
      .map((a) => {
        const lexical = scoreArtifact(a, query);
        const vector = semantic?.vectors[a.id];
        const cos = semantic && vector ? cosine(semantic.queryVector, vector) : 0;
        const points = semantic ? semanticPoints(cos, floor, weight) : 0;
        return { a, ...lexical, score: lexical.score + points, cos, points };
      })
      .filter((x) => x.score > 0) // zero-overlap → not retrieved (no bulk dump)
      // deterministic: score desc, then id asc for stable ties
      .sort((x, y) => y.score - x.score || (x.a.id < y.a.id ? -1 : 1))
      .slice(0, cap);
    for (const x of scored) {
      const lexicalWhy = x.matchedSymbols.length || x.matchedKeywords.length
        ? `matched ${x.matchedSymbols.length} symbol(s) [${x.matchedSymbols.join(", ")}]` +
          (x.matchedKeywords.length ? ` and keyword(s) [${x.matchedKeywords.join(", ")}]` : "")
        : "no symbol/keyword overlap";
      const semanticWhy = x.points > 0
        ? `; semantic match cos=${(Math.round(x.cos * 1e4) / 1e4).toFixed(4)} (${x.points} pts) ` +
          `against ${x.a.id} via ${semantic!.embedder}`
        : "";
      hits.push({
        artifact: x.a,
        explanation: {
          whySelected: lexicalWhy + semanticWhy,
          matchedSymbols: x.matchedSymbols,
          matchedKeywords: x.matchedKeywords,
          score: x.score,
          // Omitted entirely (not set to undefined) when the layer contributed
          // nothing, so a 3-argument call's output is byte-identical to before.
          ...(x.points > 0
            ? {
                semantic: {
                  cosine: Math.round(x.cos * 1e4) / 1e4,
                  points: x.points,
                  embedder: semantic!.embedder,
                  sourcePath: x.a.id,
                },
              }
            : {}),
        },
      });
    }
  }
  return hits;
}

/** Post-hoc audit: which retrieved artifacts the agent actually used. Retrieval
 *  utility = fraction of retrieved items that were used (logged, not guessed). */
export interface RetrievalAudit {
  stepId: string;
  retrieved: string[];
  used: string[];
  utility: number;
}

export function auditRetrieval(query: RetrievalQuery, hits: RetrievalHit[], usedIds: string[]): RetrievalAudit {
  const retrieved = hits.map((h) => h.artifact.id);
  const used = usedIds.filter((id) => retrieved.includes(id));
  return { stepId: query.stepId, retrieved, used, utility: retrieved.length === 0 ? 0 : used.length / retrieved.length };
}
