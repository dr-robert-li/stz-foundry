/**
 * REQ-09 / REQ-08 in executable form — the tier allowlist and the role scope,
 * both default-deny, proven over a REAL 16-tier `.stz/` scaffold.
 *
 * Every assertion runs offline against a temp directory. `STZ_EMBED=fallback` is
 * set in `beforeEach` so no daemon is ever reached, even on a developer machine
 * running Ollama.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffold, writeDoc, STZ_DIR } from "../src/taxonomy.js";
import { STZ_ROLES } from "../src/types.js";
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

let root: string;

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

beforeEach(async () => {
  process.env.STZ_EMBED = "fallback";
  root = await mkdtemp(join(tmpdir(), "stz-knowledge-"));
});
afterEach(async () => {
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
