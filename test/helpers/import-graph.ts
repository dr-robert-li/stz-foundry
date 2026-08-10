/**
 * Shared import-graph walker (Phase 8 — Admission + build, Plan 08-01,
 * REQ-52's F-22 mechanical-independence-enforcement obligation). Migrated
 * out of `test/foundry-fixture-warehouse.test.ts`'s own local copy so
 * `test/foundry-bi-warehouse.test.ts` reuses the SAME walker rather than
 * writing a second one — this plan's own instruction ("do not write a
 * second walker").
 *
 * NOT collected as a vitest suite (`vitest.config.ts` only globs
 * `test/**\/*.test.ts`), but IS typechecked (`tsconfig.json` includes
 * `test`) — the same posture `test/helpers/fake-server.ts` already uses.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve as resolvePath, relative } from "node:path";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Resolves every RELATIVE `from "<specifier>"` in `entryFile` transitively —
 * both value and type imports (a type-only import is still a signal worth
 * refusing, so the regex does not distinguish `import type` from `import`).
 * A `.js` suffix is rewritten to `.ts` (the project's own
 * ESM-specifiers-resolve-to-.ts convention) and each specifier is resolved
 * against the IMPORTING file's own directory, then recursed with a visited
 * set. Bare specifiers (`node:crypto`, `vitest`, ...) are skipped — this
 * walker only follows the repo's own module graph. Returns REPO-ROOT-RELATIVE
 * paths, including the entry file itself (so "the set is non-empty" is a
 * meaningful assertion even for a leaf module).
 */
export function walkImportGraph(entryFile: string): Set<string> {
  const visited = new Set<string>();
  const stack = [resolvePath(entryFile)];
  while (stack.length > 0) {
    const abs = stack.pop()!;
    const relPath = relative(REPO_ROOT, abs);
    if (visited.has(relPath)) continue;
    visited.add(relPath);
    let content: string;
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      continue; // unreadable — recorded as reachable, cannot be followed further
    }
    for (const match of content.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
      const specifier = match[1]!;
      if (!specifier.startsWith(".")) continue; // bare specifier — skipped
      const rewritten = specifier.endsWith(".js") ? specifier.slice(0, -3) + ".ts" : specifier;
      stack.push(resolvePath(dirname(abs), rewritten));
    }
  }
  return visited;
}
