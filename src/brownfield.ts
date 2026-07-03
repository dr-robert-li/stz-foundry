/**
 * Brownfield codebase support (cycle item 3).
 *
 * STZ was born greenfield: specimens synthesize files from a contract surface,
 * and the slicer's DAG has no notion of code that already exists. To build ON an
 * existing codebase you first have to KNOW it — what modules exist, what they
 * export, what tests already guard them — and then anchor each slice to real
 * code locations so a slice that claims to touch `src/auth.ts` is checked
 * against a `src/auth.ts` that is actually there.
 *
 * This module is the deterministic half:
 *  - `exploreCodebase` walks a target repo and produces a `CodebaseMap` (files,
 *    per-file exported symbols, existing tests, the public surface) — regex +
 *    fs only, no LLM, so it is exact and replayable (N6/N10).
 *  - `checkAnchor` validates a proposed slice's anchor against that map: an
 *    `edit`/`extend` slice must point at files (and preserved exports) that
 *    exist; an `add` slice must NOT collide with an existing file. A dangling
 *    anchor — a hallucinated path — is caught here, before any specimen runs.
 *
 * The anchor's `preservedExports` are the surrounding contract a brownfield
 * slice must not break; they are the input to the source-preservation half of
 * the sealed end-to-end suite (cycle item 4).
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname, sep } from "node:path";

export interface SourceFile {
  /** POSIX-relative path from the scanned root. */
  path: string;
  lang: string;
  loc: number;
  /** Exported symbols (best-effort, per language). */
  exports: string[];
  isTest: boolean;
}

export interface CodebaseMap {
  files: SourceFile[];
  /** Exports reachable from entry points (index files) — the public surface. */
  publicSurface: string[];
  testFiles: string[];
  summary: { fileCount: number; testCount: number; languages: Record<string, number>; totalLoc: number };
}

const LANG_BY_EXT: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
};

/** Dirs never worth scanning — deps, VCS, build output, STZ's own tree. */
const SKIP_DIRS = new Set(["node_modules", ".git", ".stz", "dist", "build", "coverage", ".next", "__pycache__", ".venv"]);

const toPosix = (p: string): string => p.split(sep).join("/");

/** A test file by conventional name (…​.test.…, …​.spec.…, test_*.py, a tests/ dir). */
export function isTestFile(rel: string): boolean {
  const base = rel.split("/").pop() ?? rel;
  return (
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(base) ||
    /^test_.*\.py$/.test(base) ||
    /_test\.py$/.test(base) ||
    /(^|\/)(tests?|__tests__)\//.test(rel)
  );
}

/**
 * Best-effort exported-symbol extraction. JS/TS: named `export`s (function,
 * class, const/let/var, `export { … }`), plus CommonJS `exports.X` /
 * `module.exports.X`, and a `default` marker for `export default`. Python:
 * top-level `def`/`class` (module public surface). Regex-driven — meant to map
 * the surface, not to be a parser.
 */
export function extractExports(src: string, lang: string): string[] {
  const names = new Set<string>();
  if (lang === "python") {
    for (const m of src.matchAll(/^(?:async\s+)?def\s+([A-Za-z_]\w*)/gm)) names.add(m[1]!);
    for (const m of src.matchAll(/^class\s+([A-Za-z_]\w*)/gm)) names.add(m[1]!);
    return [...names].filter((n) => !n.startsWith("_")); // _private by convention
  }
  // JS/TS
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+\*?\s*([A-Za-z_$][\w$]*)/g)) names.add(m[1]!);
  for (const m of src.matchAll(/export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]!);
  for (const m of src.matchAll(/export\s+(?:const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]!);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1]!.split(",")) {
      const asName = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (asName && /^[A-Za-z_$][\w$]*$/.test(asName)) names.add(asName);
    }
  }
  for (const m of src.matchAll(/(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/g)) names.add(m[1]!);
  if (/export\s+default\b/.test(src)) names.add("default");
  return [...names];
}

/**
 * Walk `dir` and map every source file. `include`/`exclude` are POSIX-relative
 * path substrings (an include list, when given, keeps only matching files).
 */
export function exploreCodebase(
  dir: string,
  opts: { include?: string[]; exclude?: string[] } = {},
): CodebaseMap {
  const files: SourceFile[] = [];
  const walk = (abs: string) => {
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = join(abs, ent.name);
      if (ent.isDirectory()) {
        if (!SKIP_DIRS.has(ent.name) && !ent.name.startsWith(".")) walk(full);
        continue;
      }
      const lang = LANG_BY_EXT[extname(ent.name)];
      if (!lang) continue;
      const rel = toPosix(relative(dir, full));
      if (opts.exclude?.some((e) => rel.includes(e))) continue;
      if (opts.include?.length && !opts.include.some((i) => rel.includes(i))) continue;
      let src = "";
      try {
        src = readFileSync(full, "utf8");
      } catch {
        continue;
      }
      files.push({
        path: rel,
        lang,
        loc: src.split("\n").length,
        exports: extractExports(src, lang),
        isTest: isTestFile(rel),
      });
    }
  };
  walk(dir);
  files.sort((a, b) => (a.path < b.path ? -1 : 1));

  // Public surface: exports of entry-point files (index.* / main / mod.*).
  const publicSurface = [
    ...new Set(
      files
        .filter((f) => !f.isTest && /(^|\/)(index|main|mod)\.[cm]?[jt]sx?$|(^|\/)__init__\.py$/.test(f.path))
        .flatMap((f) => f.exports),
    ),
  ].sort();

  const languages: Record<string, number> = {};
  for (const f of files) languages[f.lang] = (languages[f.lang] ?? 0) + 1;
  const testFiles = files.filter((f) => f.isTest).map((f) => f.path);

  return {
    files,
    publicSurface,
    testFiles,
    summary: {
      fileCount: files.length,
      testCount: testFiles.length,
      languages,
      totalLoc: files.reduce((n, f) => n + f.loc, 0),
    },
  };
}

/** How a brownfield slice relates to existing code. */
export type AnchorMode = "add" | "extend" | "edit";

export interface SliceAnchor {
  sliceId: string;
  mode: AnchorMode;
  /** Real code locations the slice touches (POSIX-relative to the codebase). */
  targetFiles: string[];
  /** Exports that must keep working after the change — the surrounding contract. */
  preservedExports?: string[];
}

export interface AnchorVerdict {
  ok: boolean;
  danglingFiles: string[];
  danglingExports: string[];
  collidingFiles: string[];
  errors: string[];
}

/**
 * Validate an anchor against the map. `edit`/`extend` targets must EXIST (a
 * dangling path is a hallucinated anchor); `preservedExports` must be exported
 * by one of the target files (you cannot promise to preserve what isn't there).
 * `add` targets must NOT already exist (an `add` that collides would silently
 * overwrite). Any violation makes the anchor invalid — caught before a specimen
 * ever runs against a non-existent surface.
 */
export function checkAnchor(map: CodebaseMap, anchor: SliceAnchor): AnchorVerdict {
  const known = new Set(map.files.map((f) => f.path));
  const exportsByFile = new Map(map.files.map((f) => [f.path, new Set(f.exports)]));
  const errors: string[] = [];
  const danglingFiles: string[] = [];
  const collidingFiles: string[] = [];
  const danglingExports: string[] = [];

  if (!anchor.sliceId) errors.push("anchor needs a sliceId");
  if (!["add", "extend", "edit"].includes(anchor.mode)) errors.push(`unknown mode: ${anchor.mode}`);
  if (!anchor.targetFiles?.length) errors.push("anchor needs at least one targetFile");

  for (const f of anchor.targetFiles ?? []) {
    if (anchor.mode === "add") {
      if (known.has(f)) collidingFiles.push(f);
    } else if (!known.has(f)) {
      danglingFiles.push(f);
    }
  }
  for (const e of anchor.preservedExports ?? []) {
    const found = (anchor.targetFiles ?? []).some((f) => exportsByFile.get(f)?.has(e));
    if (!found) danglingExports.push(e);
  }
  if (danglingFiles.length) errors.push(`target file(s) not found in the codebase: ${danglingFiles.join(", ")}`);
  if (collidingFiles.length) errors.push(`add-mode file(s) already exist (would overwrite): ${collidingFiles.join(", ")}`);
  if (danglingExports.length) errors.push(`preserved export(s) not found on any target file: ${danglingExports.join(", ")}`);

  return { ok: errors.length === 0, danglingFiles, danglingExports, collidingFiles, errors };
}
