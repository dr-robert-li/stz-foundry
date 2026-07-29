/**
 * The semantic index over the `.stz/` tree — walk, hash, embed, persist, pool.
 *
 * Location `.stz/90-audit/knowledge-index.json` follows the house pattern: JSON
 * artifacts live inside the tree they describe (`SEAL.json`, `state.json`,
 * `00-intent/run-config.json`). No new tier, `TIERS` unchanged, `writeDoc()` not
 * involved (this is JSON, not a frontmattered markdown doc).
 *
 * Three disciplines carried over from `src/seal.ts`, which already solved them:
 *   - sorted `readdirSync({withFileTypes:true})` walk → byte-stable across machines
 *     (directory iteration order is filesystem-dependent), and a symlinked
 *     directory is neither `isDirectory()` nor `isFile()`, so it is skipped (V12).
 *   - `sha256` content keying, for the incremental diff 02-03 completes.
 *   - POSIX-relative sorted keys, no timestamps → two runs over an unchanged tree
 *     produce a byte-identical file (D2/N6).
 *
 * The walk is deliberately NOT shared with `seal.ts`: that one walks
 * `30-tests/held-out/`, a directory this module must never touch. Coupling them
 * is how the allowlist eventually grows a hole.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative, dirname, sep } from "node:path";
import { stzPath, parseDoc } from "../taxonomy.js";
import { INDEXABLE_TIERS, isIndexable, kindForPath } from "./scope.js";
import type { Embedder } from "./embedder.js";
import type { RetrievableArtifact, RetrievableKind } from "./retrieval.js";

export const INDEX_REL = "90-audit/knowledge-index.json";

export function indexPath(root: string): string {
  return stzPath(root, INDEX_REL);
}

const toPosix = (p: string): string => p.split(sep).join("/");
const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");
/** 6dp keeps the committed index reviewable and its bytes engine-independent. */
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

export interface IndexEntry {
  hash: string;
  kind: RetrievableKind;
  /** The exact text that was embedded — stored so a hit can be explained. */
  summary: string;
  vector: number[];
}

export interface KnowledgeIndex {
  schemaVersion: 1;
  /** Embedder identity. Vectors from a different fingerprint are not comparable. */
  fingerprint: string;
  /** REQ-06: provider selection is explicit and reported. */
  providerReason: string;
  dim: number;
  entries: Record<string, IndexEntry>;
}

/**
 * Every indexable document, sorted by path. The ONLY tree-walk entry point the
 * indexer has, and it starts from `INDEXABLE_TIERS` — nothing outside an
 * allowlisted tier is ever opened, let alone embedded.
 *
 * Documents whose `summary` is empty are skipped: an empty index text yields a
 * zero-norm vector and a `NaN` cosine, which would poison the sort (H6).
 */
export function walkIndexable(root: string): { relPath: string; indexText: string }[] {
  const base = stzPath(root, "");
  const out: { relPath: string; indexText: string }[] = [];

  const walk = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const ent of entries) {
      const abs = join(dir, ent.name);
      // A symlinked directory is neither isDirectory() nor isFile() → skipped.
      if (ent.isDirectory()) {
        walk(abs);
      } else if (ent.isFile() && ent.name.endsWith(".md")) {
        const relPath = toPosix(relative(base, abs));
        if (!isIndexable(relPath)) continue;
        const summary = String(parseDoc(readFileSync(abs, "utf8")).frontmatter.summary ?? "").trim();
        if (!summary) continue;
        // The ~200-token progressive-disclosure unit (N2), not the body: a full
        // conventions.md blows past the 2K window a local embedder advertises and
        // gets silently truncated.
        out.push({ relPath, indexText: `${relPath}\n${summary}` });
      }
    }
  };

  for (const tier of INDEXABLE_TIERS) {
    const dir = join(base, tier);
    if (existsSync(dir)) walk(dir);
  }
  return out.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
}

/**
 * The prior index is UNTRUSTED input (hand-edited, merged, corrupted, crafted).
 * Anything that fails validation returns `null` so the caller full-rebuilds
 * rather than trusting it — in particular every key must pass `isIndexable()`,
 * which rejects `..` segments and absolute paths before any path is built from it.
 */
export function readIndex(root: string): KnowledgeIndex | null {
  const path = indexPath(root);
  if (!existsSync(path)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const idx = raw as Record<string, unknown>;
  if (idx.schemaVersion !== 1) return null;
  if (typeof idx.fingerprint !== "string" || typeof idx.providerReason !== "string") return null;
  const dim = idx.dim;
  if (typeof dim !== "number" || !Number.isInteger(dim) || dim <= 0) return null;
  if (!idx.entries || typeof idx.entries !== "object") return null;

  const entries: Record<string, IndexEntry> = {};
  for (const [key, value] of Object.entries(idx.entries as Record<string, unknown>)) {
    if (!isIndexable(key)) return null;
    if (!value || typeof value !== "object") return null;
    const e = value as Record<string, unknown>;
    if (typeof e.hash !== "string" || typeof e.summary !== "string") return null;
    if (e.kind !== "convention" && e.kind !== "decision") return null;
    if (!Array.isArray(e.vector) || e.vector.length !== dim) return null;
    if (!e.vector.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
    entries[key] = { hash: e.hash, kind: e.kind, summary: e.summary, vector: e.vector as number[] };
  }
  return { schemaVersion: 1, fingerprint: idx.fingerprint, providerReason: idx.providerReason, dim, entries };
}

/** Sorted keys, 6dp vectors, two-space JSON, trailing newline, no timestamps. */
export function writeIndex(root: string, idx: KnowledgeIndex): void {
  const entries: Record<string, IndexEntry> = {};
  for (const key of Object.keys(idx.entries).sort()) {
    const e = idx.entries[key]!;
    entries[key] = { hash: e.hash, kind: e.kind, summary: e.summary, vector: e.vector.map(round6) };
  }
  const path = indexPath(root);
  mkdirSync(dirname(path), { recursive: true });
  const payload = {
    schemaVersion: 1,
    fingerprint: idx.fingerprint,
    providerReason: idx.providerReason,
    dim: idx.dim,
    entries,
  };
  writeFileSync(path, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

export interface BuildResult {
  rebuilt: "full" | "incremental";
  embedded: number;
  evicted: number;
  total: number;
  fingerprint: string;
  provider: string;
}

/**
 * Walk → hash → diff → embed only what changed → persist (D4, REQ-07).
 *
 * The same added/drifted/removed reconciliation `seal()` already does over the
 * held-out suite, keyed the same way (sha256 over content) and for the same
 * reason: re-doing unchanged work is not just slow, it is a chance to produce a
 * different answer for input that did not change.
 *
 * Two rules that are not optimizations and must not be relaxed:
 *   - a prior key absent from the walk is DROPPED, never carried "just in case".
 *     An index serving a document that no longer exists — possibly deleted
 *     *because* it was sensitive — is the exact failure REQ-07 names (T-02-14).
 *   - a fingerprint change discards everything. Vectors from two embedders are
 *     not comparable, and the resulting noise clears the similarity floor often
 *     enough to look like signal (T-02-17), so there is nothing to reconcile.
 */
export async function buildIndex(root: string, embedder: Embedder, providerReason: string): Promise<BuildResult> {
  const docs = walkIndexable(root).map((d) => ({ ...d, hash: sha256(d.indexText) }));
  const prior = readIndex(root);
  const usable = prior && prior.fingerprint === embedder.fingerprint && prior.dim === embedder.dim ? prior : null;

  const changed = docs.filter((d) => usable?.entries[d.relPath]?.hash !== d.hash);
  // Guarded, not merely empty-safe: a no-change rebuild must issue no embed call
  // at all, which is what the counting-embedder test asserts.
  const vectors = changed.length ? await embedder.embed(changed.map((d) => d.indexText), "document") : [];
  const fresh = new Map(changed.map((d, i) => [d.relPath, (vectors[i] ?? []).map(round6)]));

  const entries: Record<string, IndexEntry> = {};
  for (const doc of docs) {
    const vector = fresh.get(doc.relPath);
    // Exactly one branch applies: a document is either in the changed set (fresh
    // vector) or its hash matched a usable prior entry, which is then carried
    // forward untouched — same bytes, not a re-derivation.
    entries[doc.relPath] = vector
      ? { hash: doc.hash, kind: kindForPath(doc.relPath), summary: doc.indexText, vector }
      : usable!.entries[doc.relPath]!;
  }

  // Counted against what was ON DISK, not against `usable`: a document that left
  // the tree is evicted whether or not the embedder identity also changed.
  const evicted = prior ? Object.keys(prior.entries).filter((k) => !(k in entries)).length : 0;
  writeIndex(root, {
    schemaVersion: 1,
    fingerprint: embedder.fingerprint,
    providerReason,
    dim: embedder.dim,
    entries,
  });
  return {
    rebuilt: usable ? "incremental" : "full",
    embedded: changed.length,
    evicted,
    total: docs.length,
    fingerprint: embedder.fingerprint,
    provider: providerReason,
  };
}

/**
 * THE SECURITY BOUNDARY OF THIS PHASE. This is the sole producer of
 * `RetrievableArtifact.trust` in the repo — nothing else constructs one — so
 * whatever it stamps here is what `retrieve()`'s `trust === "accepted"` filter
 * lets into a generation context.
 *
 * `"accepted"` is warranted here and ONLY here because every entry came through
 * `walkIndexable()`, which only ever walks `INDEXABLE_TIERS`, and every one of
 * those tiers is written behind a pipeline approval gate. Widen the allowlist and
 * this line silently starts laundering un-approved content into agent prompts.
 */
export function poolFromIndex(idx: KnowledgeIndex): RetrievableArtifact[] {
  return Object.keys(idx.entries)
    .sort()
    .map((relPath) => {
      const entry = idx.entries[relPath]!;
      return { id: relPath, kind: entry.kind, trust: "accepted" as const, symbols: [], text: entry.summary };
    });
}

export function vectorsFromIndex(idx: KnowledgeIndex): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [key, entry] of Object.entries(idx.entries)) out[key] = entry.vector;
  return out;
}
