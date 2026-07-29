/**
 * REQ-09 / REQ-08 in executable form — the tier allowlist and the role scope,
 * both default-deny, proven over a REAL 16-tier `.stz/` scaffold.
 *
 * Every assertion runs offline against a temp directory. `STZ_EMBED=fallback` is
 * set in `beforeEach` so no daemon is ever reached, even on a developer machine
 * running Ollama.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffold, writeDoc, STZ_DIR, TIERS } from "../src/taxonomy.js";
import { STZ_ROLES } from "../src/types.js";
import { runBridge } from "../src/bridge.js";
import {
  INDEXABLE_TIERS,
  isIndexable,
  kindForPath,
  resolveRoleScope,
  capsForRole,
} from "../src/knowledge/scope.js";
import { fallbackEmbedder, FALLBACK_DIM, selectEmbedder } from "../src/knowledge/embedder.js";
import {
  walkIndexable,
  writeIndex,
  readIndex,
  buildIndex,
  poolFromIndex,
  type KnowledgeIndex,
} from "../src/knowledge/index-store.js";
import { retrieve, type RetrievableArtifact, type RetrievalQuery } from "../src/knowledge/retrieval.js";

let root: string;
let captured: string;
const origWrite = process.stdout.write.bind(process.stdout);

/** The allowlisted documents the fixture plants — one per allowlisted tier. */
const ALLOWLISTED_DOCS = [
  "00-intent/project.md",
  "10-research/external/prior-art.md",
  "20-standards/conventions.md",
  "20-standards/architecture-decisions/001-storage.md",
];

async function fixtureTree(): Promise<void> {
  await scaffold(root); // all 16 tiers really exist
  await writeDoc(root, "00-intent/project.md", {
    frontmatter: { summary: "the project builds a deterministic slice pipeline" },
    body: "# Intent",
  });
  await writeDoc(root, "10-research/external/prior-art.md", {
    frontmatter: { summary: "prior art on tournament selection and sealed suites" },
    body: "# Research",
  });
  await writeDoc(root, "20-standards/conventions.md", {
    frontmatter: { summary: "naming conventions: camelCase functions, kebab-case files" },
    body: "# Conventions",
  });
  await writeDoc(root, "20-standards/architecture-decisions/001-storage.md", {
    frontmatter: { summary: "storage decision: markdown tree over a hosted database" },
    body: "# ADR 001",
  });
}

/**
 * The leak inventory, planted. Everything a wholesale index would serve into an
 * implementer's context: the sealed suite, the test author's reference
 * implementation, the judging rubric, a competing specimen's source, a culled
 * specimen's failure detail, the mutator specs, and a raw model transcript.
 */
async function plantForbiddenContent(): Promise<void> {
  const abs = (rel: string) => join(root, STZ_DIR, rel);
  await mkdir(abs("40-slices/slice-01/prototypes/specimen-a"), { recursive: true });
  await writeFile(abs("30-tests/held-out/sealed.mjs"), "export const cases = [[1, 2], [3, 4]];\n", "utf8");
  await writeFile(abs("40-slices/slice-01/prototypes/specimen-a/impl.ts"), "export const run = (x: number) => x * 2;\n", "utf8");
  await writeDoc(root, "30-tests/held-out/reference.md", {
    frontmatter: { summary: "reference implementation: the naming conventions markdown answer key" },
    body: "# Reference",
  });
  await writeDoc(root, "30-tests/rubric.md", {
    frontmatter: { summary: "judging rubric: how specimens are scored on conventions and markdown" },
    body: "# Rubric",
  });
  await writeDoc(root, "50-pressure/slice-01/pressure.md", {
    frontmatter: { summary: "culled specimen source and its sealed-suite failure detail" },
    body: "# Pressure",
  });
  await writeDoc(root, "60-harness/variants/mutator-01.md", {
    frontmatter: { summary: "mutator spec: operators the mutation battery injects" },
    body: "# Mutator",
  });
  await writeDoc(root, "90-audit/calls/call-0001.md", {
    frontmatter: { summary: "raw model IO transcript for the conventions markdown call" },
    body: "# Call",
  });
}

/** True when an allowlisted tier covers this `TIERS` entry (or its parent). */
const coveredByAllowlist = (tier: string): boolean =>
  INDEXABLE_TIERS.some((allowed) => tier === allowed || tier.startsWith(`${allowed}/`));

function lastJSON<T>(): T {
  return JSON.parse(captured) as T;
}

beforeEach(async () => {
  process.env.STZ_EMBED = "fallback";
  root = await mkdtemp(join(tmpdir(), "stz-knowledge-"));
  captured = "";
  (process.stdout.write as unknown as (s: string) => boolean) = (s: string) => {
    captured += s;
    return true;
  };
});
afterEach(async () => {
  process.stdout.write = origWrite;
  await rm(root, { recursive: true, force: true });
});

describe("tier allowlist — the data-layer default-deny control", () => {
  it("walks only allowlisted tiers, sorted, over a full 16-tier scaffold", async () => {
    await fixtureTree();
    // Non-allowlisted content that must be invisible to the walk.
    await writeDoc(root, "30-tests/rubric.md", { frontmatter: { summary: "judging rubric" }, body: "x" });
    await writeDoc(root, "30-tests/held-out/reference.md", { frontmatter: { summary: "reference impl" }, body: "x" });
    await writeDoc(root, "50-pressure/slice-01/pressure.md", { frontmatter: { summary: "culled source" }, body: "x" });
    await writeDoc(root, "90-audit/calls/call-1.md", { frontmatter: { summary: "raw transcript" }, body: "x" });

    const walked = walkIndexable(root).map((d) => d.relPath);
    expect(walked).toEqual(ALLOWLISTED_DOCS.slice().sort());
    expect(walked.every(isIndexable)).toBe(true);
  });

  it("skips documents with an empty summary (a zero-norm vector gives a NaN cosine)", async () => {
    await fixtureTree();
    await writeDoc(root, "20-standards/blank.md", { frontmatter: { summary: "   " }, body: "x" });
    expect(walkIndexable(root).map((d) => d.relPath)).not.toContain("20-standards/blank.md");
  });

  it("infers the kind from the path, deterministically", () => {
    expect(kindForPath("20-standards/architecture-decisions/001-storage.md")).toBe("decision");
    expect(kindForPath("20-standards/conventions.md")).toBe("convention");
    expect(kindForPath("00-intent/project.md")).toBe("convention");
  });

  it("rejects traversal and absolute paths at the single allowlist guard", () => {
    expect(isIndexable("20-standards/conventions.md")).toBe(true);
    expect(isIndexable("20-standards/../30-tests/held-out/sealed.mjs")).toBe(false);
    expect(isIndexable("/20-standards/conventions.md")).toBe(false);
    expect(isIndexable("30-tests/held-out/sealed.mjs")).toBe(false);
    expect(isIndexable("20-standards")).toBe(false); // the tier dir itself is not a document
  });
});

describe("fallback embedder — deterministic, corpus-independent, unit-norm", () => {
  it("returns unit vectors of FALLBACK_DIM length", async () => {
    const e = fallbackEmbedder();
    expect(e.dim).toBe(FALLBACK_DIM);
    const [v] = await e.embed(["naming conventions for files"], "document");
    expect(v!.length).toBe(FALLBACK_DIM);
    const norm = Math.sqrt(v!.reduce((s, x) => s + x * x, 0));
    expect(Math.abs(norm - 1)).toBeLessThan(1e-12);
  });

  it("returns an identical vector for an identical input on a second call", async () => {
    const e = fallbackEmbedder();
    const [a] = await e.embed(["storage decision: markdown tree"], "document");
    const [b] = await e.embed(["storage decision: markdown tree"], "document");
    expect(a).toEqual(b);
    // A fresh embedder instance must agree too — no per-instance state.
    const [c] = await fallbackEmbedder().embed(["storage decision: markdown tree"], "document");
    expect(a).toEqual(c);
  });

  it("reports the selected provider explicitly (REQ-06)", async () => {
    const { embedder, reason } = await selectEmbedder();
    expect(embedder.fingerprint).toBe(`fallback:hashed-ngram:${FALLBACK_DIM}:v1`);
    expect(reason.length).toBeGreaterThan(0);
  });
});

describe("index store — round-trip and pool construction", () => {
  it("round-trips an index without vector drift", async () => {
    await fixtureTree();
    const { embedder, reason } = await selectEmbedder();
    await buildIndex(root, embedder, reason);

    const first = readIndex(root);
    expect(first).not.toBeNull();
    writeIndex(root, first as KnowledgeIndex);
    const second = readIndex(root);
    expect(second).toEqual(first);
    expect(Object.keys(first!.entries)).toEqual(ALLOWLISTED_DOCS.slice().sort());
    expect(first!.dim).toBe(embedder.dim);
    expect(first!.fingerprint).toBe(embedder.fingerprint);
  });

  it("discards a crafted index rather than trusting it", async () => {
    await fixtureTree();
    const { embedder, reason } = await selectEmbedder();
    await buildIndex(root, embedder, reason);
    const good = readIndex(root)!;

    const crafted: KnowledgeIndex = {
      ...good,
      entries: { "30-tests/held-out/sealed.mjs": Object.values(good.entries)[0]! },
    };
    await writeFile(
      join(root, STZ_DIR, "90-audit", "knowledge-index.json"),
      JSON.stringify(crafted, null, 2),
      "utf8",
    );
    expect(readIndex(root)).toBeNull();
  });

  it("stamps trust:accepted — and only accepted — for allowlisted tiers", async () => {
    await fixtureTree();
    const { embedder, reason } = await selectEmbedder();
    await buildIndex(root, embedder, reason);
    const pool = poolFromIndex(readIndex(root)!);
    expect(pool.length).toBe(ALLOWLISTED_DOCS.length);
    expect(pool.every((a) => a.trust === "accepted")).toBe(true);
    expect(pool.every((a) => isIndexable(a.id))).toBe(true);
  });
});

describe("role scope — the query-layer default-deny control", () => {
  it("resolves a scope for every StzRole and null for anything else", () => {
    for (const role of STZ_ROLES) {
      const scope = resolveRoleScope(role);
      expect(scope, role).not.toBeNull();
      expect(scope!.kinds.length).toBeGreaterThan(0);
      expect(capsForRole(role)).not.toBeNull();
    }
    expect(resolveRoleScope("not-a-role")).toBeNull();
    expect(resolveRoleScope("")).toBeNull();
    expect(resolveRoleScope("EXECUTION")).toBeNull();
    expect(capsForRole("not-a-role")).toBeNull();
  });

  it("keeps repo_note capped at 0 for every role (caps merge OVER DEFAULT_CAPS)", () => {
    for (const role of STZ_ROLES) expect(capsForRole(role)!.repo_note, role).toBe(0);
  });

  it("excludes the judging rubric and architecture decisions from the execution scope", () => {
    const execution = resolveRoleScope("execution")!;
    expect(execution.kinds).not.toContain("rubric");
    expect(execution.kinds).not.toContain("decision");
    // …while the cap table still carries a non-zero cap for them, which is exactly
    // why capsForRole() cannot substitute for the scope when building requestedKinds.
    expect(capsForRole("execution")!.decision).toBeGreaterThan(0);
  });
});

describe("the allowlist constant itself", () => {
  it("has exactly the approved tiers — widening it fails here first", () => {
    expect(INDEXABLE_TIERS).toEqual(["00-intent", "10-research", "20-standards"]);
    expect(INDEXABLE_TIERS.length).toBe(3);
  });
});

describe("the leak inventory — proven unreachable through the index", () => {
  /** Index a tree where every one of the 16 tiers has content. */
  async function indexFullTree(): Promise<string[]> {
    await fixtureTree();
    await plantForbiddenContent();
    const { embedder, reason } = await selectEmbedder();
    await buildIndex(root, embedder, reason);
    return Object.keys(readIndex(root)!.entries);
  }

  it("indexes exactly the planted allowlisted documents and nothing else", async () => {
    const keys = await indexFullTree();
    expect(keys).toEqual(ALLOWLISTED_DOCS.slice().sort());
    expect(keys.every(isIndexable)).toBe(true);
  });

  it("emits zero entries for every tier outside INDEXABLE_TIERS — asserted by ITERATING TIERS", async () => {
    const keys = await indexFullTree();
    // Generated from the constants, never a hand-written path list: a tier added
    // to TIERS in a future release is covered by this assertion automatically.
    const forbidden = TIERS.filter((tier) => !coveredByAllowlist(tier));
    expect(forbidden.length).toBeGreaterThan(0); // the assertion must have teeth
    for (const tier of forbidden) {
      for (const key of keys) {
        expect(key.startsWith(`${tier}/`), `${key} leaked from ${tier}`).toBe(false);
      }
    }
  });

  it("does not follow a directory symlink out of an allowlisted tier into the sealed tier", async () => {
    const before = await indexFullTree();
    await symlink(
      join(root, STZ_DIR, "30-tests", "held-out"),
      join(root, STZ_DIR, "20-standards", "smuggled"),
      "dir",
    );
    const { embedder, reason } = await selectEmbedder();
    await buildIndex(root, embedder, reason);
    const after = Object.keys(readIndex(root)!.entries);
    // isDirectory() is false for a symlink, so the walk skips it entirely.
    expect(after).toEqual(before);
  });
});

describe("trust filter — the semantic layer is not a bypass", () => {
  it("drops a candidate-trust artifact even at cosine 1.0", () => {
    const art = (id: string, trust: RetrievableArtifact["trust"]): RetrievableArtifact => ({
      id,
      kind: "convention",
      trust,
      symbols: [],
      text: "house style for module layout",
    });
    const pool = [art("candidate.md", "candidate"), art("accepted.md", "accepted")];
    const query: RetrievalQuery = {
      symbols: [],
      keywords: ["zzzz-no-lexical-overlap"],
      requestedKinds: ["convention"],
      stepId: "step-trust",
    };
    // Both vectors are identical to the query vector — cosine 1.0 for each.
    const hits = retrieve(pool, query, undefined, {
      vectors: { "candidate.md": [1, 0], "accepted.md": [1, 0] },
      queryVector: [1, 0],
      embedder: "stub:trust:2:v1",
    });
    const ids = hits.map((h) => h.artifact.id);
    expect(ids).toContain("accepted.md"); // the semantic layer really did fire
    expect(ids).not.toContain("candidate.md");
    expect(hits[0]!.explanation.semantic!.points).toBeGreaterThan(0);
    expect(hits[0]!.explanation.semantic!.embedder).toBe("stub:trust:2:v1");
  });

  it("keeps the no-bulk guard alive — a sub-floor cosine contributes zero", () => {
    const pool: RetrievableArtifact[] = [
      { id: "unrelated.md", kind: "convention", trust: "accepted", symbols: [], text: "house style" },
    ];
    const query: RetrievalQuery = {
      symbols: [],
      keywords: ["zzzz-no-lexical-overlap"],
      requestedKinds: ["convention"],
      stepId: "step-floor",
    };
    // Cosine 0.3 — non-zero, as every embedding pair is, but below the floor.
    const hits = retrieve(pool, query, undefined, {
      vectors: { "unrelated.md": [0.3, Math.sqrt(1 - 0.09)] },
      queryVector: [1, 0],
      embedder: "stub:floor:2:v1",
    });
    expect(hits).toEqual([]);
  });
});

describe("role scoping through the bridge verb — the only surface an agent touches", () => {
  async function indexedTree(): Promise<void> {
    await fixtureTree();
    await plantForbiddenContent();
    captured = "";
    await runBridge(["knowledge-index", "--root", root]);
  }

  type QueryOut = {
    role: string;
    denied: boolean;
    requestedKinds: string[];
    hits: { artifact: { id: string; kind: string } }[];
  };

  async function query(role: string): Promise<QueryOut> {
    captured = "";
    // "markdown" appears only in the architecture-decision summary; "conventions"
    // only in the conventions document. One query, two kinds in play.
    await runBridge(["knowledge-query", "--root", root, "--role", role, "--keywords", "markdown,conventions"]);
    return lastJSON<QueryOut>();
  }

  const ADR = "20-standards/architecture-decisions/001-storage.md";

  it("returns zero decision-kind hits for --role execution, and is NOT empty (so the assertion has teeth)", async () => {
    await indexedTree();
    const out = await query("execution");
    expect(out.denied).toBe(false);
    expect(out.requestedKinds).not.toContain("decision");
    expect(out.hits.length).toBeGreaterThan(0); // the query really did retrieve
    expect(out.hits.map((h) => h.artifact.kind)).not.toContain("decision");
    expect(out.hits.map((h) => h.artifact.id)).not.toContain(ADR);
  });

  it("returns that same document for --role planning — same tree, same keywords", async () => {
    await indexedTree();
    const out = await query("planning");
    expect(out.denied).toBe(false);
    expect(out.requestedKinds).toContain("decision");
    expect(out.hits.map((h) => h.artifact.id)).toContain(ADR);
  });

  it("never surfaces forbidden content to any role", async () => {
    await indexedTree();
    for (const role of STZ_ROLES) {
      const out = await query(role);
      for (const hit of out.hits) expect(isIndexable(hit.artifact.id), `${role} → ${hit.artifact.id}`).toBe(true);
    }
  });
});
