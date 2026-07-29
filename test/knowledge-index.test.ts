/**
 * REQ-07 / D4 in executable form — the incremental rebuild, its eviction rule,
 * and the untrusted-read boundary that discards a hand-edited index.
 *
 * The incremental claim is asserted on a COUNTING embedder: what matters is that
 * an unchanged document is never handed to `embed()` at all, and wall-clock
 * timing cannot prove that (a fast run and a cached run look identical).
 *
 * Everything runs offline. `STZ_EMBED=fallback` is set in `beforeEach` and every
 * embedder is constructed explicitly, so no daemon is reached even on a machine
 * with Ollama running.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffold, writeDoc, STZ_DIR } from "../src/taxonomy.js";
import { runBridge } from "../src/bridge.js";
import { fallbackEmbedder, type Embedder } from "../src/knowledge/embedder.js";
import { buildIndex, readIndex, indexPath, type KnowledgeIndex } from "../src/knowledge/index-store.js";

let root: string;
let captured: string;
const origWrite = process.stdout.write.bind(process.stdout);

interface CountingEmbedder extends Embedder {
  /** Every text this embedder was asked to embed, in order. */
  readonly texts: string[];
}

/** A real (deterministic) embedder that records what it was asked to embed. */
function countingEmbedder(dim = 32): CountingEmbedder {
  const inner = fallbackEmbedder({ dim });
  const texts: string[] = [];
  return {
    fingerprint: inner.fingerprint,
    dim,
    texts,
    async embed(batch: string[], kind: "document" | "query"): Promise<number[][]> {
      texts.push(...batch);
      return inner.embed(batch, kind);
    },
  };
}

const DOCS: Record<string, string> = {
  "00-intent/project.md": "the project builds a deterministic slice pipeline",
  "20-standards/conventions.md": "naming conventions: camelCase functions and kebab-case files",
  "20-standards/architecture-decisions/001-storage.md": "storage decision: a markdown tree over a hosted database",
};
const UNCHANGED = ["00-intent/project.md", "20-standards/architecture-decisions/001-storage.md"];

async function tree(): Promise<void> {
  await scaffold(root);
  for (const [rel, summary] of Object.entries(DOCS)) {
    await writeDoc(root, rel, { frontmatter: { summary }, body: "# doc" });
  }
}

const onDisk = async (): Promise<KnowledgeIndex> =>
  JSON.parse(await readFile(indexPath(root), "utf8")) as KnowledgeIndex;

/** Hand-edit the persisted index — this is the untrusted-input scenario. */
async function craft(mutate: (idx: Record<string, any>) => void): Promise<void> {
  const raw = JSON.parse(await readFile(indexPath(root), "utf8")) as Record<string, any>;
  mutate(raw);
  await writeFile(indexPath(root), JSON.stringify(raw, null, 2) + "\n", "utf8");
}

function lastJSON<T>(): T {
  return JSON.parse(captured) as T;
}

beforeEach(async () => {
  process.env.STZ_EMBED = "fallback";
  root = await mkdtemp(join(tmpdir(), "stz-kindex-"));
  captured = "";
  (process.stdout.write as unknown as (s: string) => boolean) = (s: string) => {
    captured += s;
    return true;
  };
});
afterEach(async () => {
  process.stdout.write = origWrite;
  delete process.env.STZ_EMBED;
  await rm(root, { recursive: true, force: true });
});

describe("knowledge index — incremental rebuild (REQ-07, D4)", () => {
  it("re-embeds exactly the one document that changed — counted, never timed", async () => {
    await tree();
    const first = countingEmbedder();
    const a = await buildIndex(root, first, "test");
    expect(a.rebuilt).toBe("full"); // no prior index
    expect(a.embedded).toBe(3);
    expect(first.texts.length).toBe(3);
    const before = await onDisk();

    await writeDoc(root, "20-standards/conventions.md", {
      frontmatter: { summary: "naming conventions: snake_case functions and kebab-case files" },
      body: "# doc",
    });

    const second = countingEmbedder();
    const b = await buildIndex(root, second, "test");
    // THE assertion this test exists for: one document changed, one embed input.
    expect(second.texts.length).toBe(1);
    expect(second.texts[0]).toContain("snake_case");
    expect(b.rebuilt).toBe("incremental");
    expect(b.embedded).toBe(1);
    expect(b.evicted).toBe(0);
    expect(b.total).toBe(3);

    const after = await onDisk();
    // The unchanged entries are carried forward byte-for-byte, vectors included.
    for (const key of UNCHANGED) expect(after.entries[key]).toEqual(before.entries[key]);
    expect(after.entries["20-standards/conventions.md"]!.vector).not.toEqual(
      before.entries["20-standards/conventions.md"]!.vector,
    );
    expect(after.entries["20-standards/conventions.md"]!.hash).not.toBe(
      before.entries["20-standards/conventions.md"]!.hash,
    );
  });

  it("embeds nothing at all when the tree has not changed, and rewrites the same bytes", async () => {
    await tree();
    await buildIndex(root, countingEmbedder(), "test");
    const before = await readFile(indexPath(root), "utf8");

    const again = countingEmbedder();
    const r = await buildIndex(root, again, "test");
    expect(again.texts).toEqual([]); // zero embed calls, not "a fast one"
    expect(r.embedded).toBe(0);
    expect(r.rebuilt).toBe("incremental");
    expect(await readFile(indexPath(root), "utf8")).toBe(before);
  });

  it("evicts a document deleted from the tree — a stale index cannot serve it", async () => {
    await tree();
    await buildIndex(root, countingEmbedder(), "test");
    await rm(join(root, STZ_DIR, "20-standards", "conventions.md"));

    const emb = countingEmbedder();
    const r = await buildIndex(root, emb, "test");
    expect(r.evicted).toBe(1);
    expect(r.total).toBe(2);
    expect(emb.texts).toEqual([]); // eviction costs no embedding
    const idx = readIndex(root)!;
    expect(Object.keys(idx.entries).sort()).toEqual(UNCHANGED.slice().sort());
    expect(idx.entries["20-standards/conventions.md"]).toBeUndefined();
  });

  it("does not re-embed a body edit — the indexed text is the path plus the summary", async () => {
    await tree();
    await buildIndex(root, countingEmbedder(), "test");
    await writeDoc(root, "20-standards/conventions.md", {
      frontmatter: { summary: DOCS["20-standards/conventions.md"]! },
      body: "# doc\n\nAn entirely rewritten body with several new paragraphs of prose.\n",
    });

    const emb = countingEmbedder();
    const r = await buildIndex(root, emb, "test");
    expect(emb.texts).toEqual([]);
    expect(r.embedded).toBe(0);
  });
});

describe("knowledge index — the prior index is untrusted input", () => {
  const CRAFTED: [string, (idx: Record<string, any>) => void][] = [
    ["a schemaVersion this build does not know", (i) => { i.schemaVersion = 2; }],
    ["a dim that disagrees with every stored vector", (i) => { i.dim = 999; }],
    ["a non-integer dim", (i) => { i.dim = 32.5; }],
    ["a truncated vector", (i) => { i.entries["20-standards/conventions.md"].vector = [0.1, 0.2]; }],
    ["a non-finite vector component", (i) => { i.entries["20-standards/conventions.md"].vector[0] = null; }],
    ["an entry missing its hash", (i) => { delete i.entries["20-standards/conventions.md"].hash; }],
    ["a key outside the allowlisted tiers", (i) => {
      i.entries["30-tests/held-out/reference.md"] = { ...i.entries["20-standards/conventions.md"] };
    }],
    ["a key that walks out of the tree", (i) => {
      i.entries["20-standards/../../../etc/passwd.md"] = { ...i.entries["20-standards/conventions.md"] };
    }],
    ["a key carrying a backslash separator", (i) => {
      i.entries["20-standards\\conventions.md"] = { ...i.entries["20-standards/conventions.md"] };
    }],
  ];

  for (const [label, mutate] of CRAFTED) {
    it(`discards an index with ${label}`, async () => {
      await tree();
      await buildIndex(root, countingEmbedder(), "test");
      await craft(mutate);
      expect(readIndex(root)).toBeNull();
    });
  }

  it("full-rebuilds rather than trusting a discarded index", async () => {
    await tree();
    await buildIndex(root, countingEmbedder(), "test");
    await craft((i) => {
      i.entries["30-tests/held-out/reference.md"] = { ...i.entries["20-standards/conventions.md"] };
    });

    const emb = countingEmbedder();
    const r = await buildIndex(root, emb, "test");
    expect(r.rebuilt).toBe("full");
    expect(emb.texts.length).toBe(3);
    // The crafted sealed-tier key is gone: the file was discarded, not merged.
    expect(Object.keys(readIndex(root)!.entries)).toEqual(Object.keys(DOCS).sort());
  });
});
describe("knowledge index — embedder identity invalidates the index", () => {
  it("rebuilds in full when the fingerprint changed, discarding every prior vector", async () => {
    await tree();
    const first = countingEmbedder(32);
    await buildIndex(root, first, "test");

    const other = countingEmbedder(64); // a different fingerprint entirely
    expect(other.fingerprint).not.toBe(first.fingerprint);
    const r = await buildIndex(root, other, "test");
    expect(r.rebuilt).toBe("full");
    expect(r.embedded).toBe(3);
    expect(r.total).toBe(3);
    expect(other.texts.length).toBe(3);

    const idx = readIndex(root)!;
    expect(idx.fingerprint).toBe(other.fingerprint);
    expect(idx.dim).toBe(64);
    for (const e of Object.values(idx.entries)) expect(e.vector.length).toBe(64);
  });

  it("disables the semantic layer visibly when the index fingerprint cannot be reconstructed", async () => {
    await tree();
    await buildIndex(root, fallbackEmbedder({ dim: 32 }), "test");
    const foreign = "sentence-transformers:all-MiniLM-L6-v2:32:v1";
    await craft((i) => { i.fingerprint = foreign; });
    const before = await readFile(indexPath(root), "utf8");

    captured = "";
    await runBridge(["knowledge-query", "--root", root, "--role", "planning", "--keywords", "conventions"]);
    const q = lastJSON<{
      hits: { artifact: { id: string } }[];
      semantic: { enabled: boolean; reason: string };
    }>();

    expect(q.semantic.enabled).toBe(false);
    // Both identities are named — "the vectors were close" is not an explanation,
    // and neither is "semantic disabled" with no fingerprints in it.
    expect(q.semantic.reason).toContain(foreign);
    expect(q.semantic.reason).toContain(fallbackEmbedder().fingerprint);
    // Degradation is to lexical, not to nothing.
    expect(q.hits.map((h) => h.artifact.id)).toContain("20-standards/conventions.md");
    expect(await readFile(indexPath(root), "utf8")).toBe(before);
  });

  it("never writes the index on the query path", async () => {
    await tree();
    await buildIndex(root, fallbackEmbedder({ dim: 32 }), "test");
    const before = await readFile(indexPath(root), "utf8");

    captured = "";
    await runBridge(["knowledge-query", "--root", root, "--role", "planning", "--keywords", "conventions"]);
    expect(lastJSON<{ semantic: { enabled: boolean } }>().semantic.enabled).toBe(true);
    expect(await readFile(indexPath(root), "utf8")).toBe(before);
  });
});
