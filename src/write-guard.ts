/**
 * The repo's ONE path-containment guard (Phase 1 — Agentic eval seam,
 * Plan 01-03). Extracted from `src/mock/orchestrator.ts`'s `writeSpecimenFiles`
 * (added v1.17.0, T-01-13, commit `6e2a6e8`): a model-produced file map with
 * `../../etc/x`-shaped keys reaches a write loop, and since v1.17.0 one of the
 * destinations is a real worktree of the operator's repo. The commit's own
 * stated principle — "a guard bolted onto the newer call site alone would
 * leave the older one wide open" — is exactly why an agent battery's
 * artifact map (the same untrusted shape) reuses this guard rather than
 * growing a second one. Both `src/mock/orchestrator.ts` and
 * `src/foundry/agent-runner.ts` import from here; this is the only file in
 * `src/` that declares the containment check.
 */
import { join, resolve, sep } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

/**
 * Resolve `relPath` against `baseDir`, throwing if the result escapes it.
 *
 * `resolve` also neutralizes an absolute key: `resolve(base, "/tmp/x")` is
 * `/tmp/x`, which fails the prefix test.
 *
 * ponytail: the containment check is LEXICAL, not `realpathSync`. A symlinked
 * parent INSIDE `baseDir` is out of scope — reaching it needs a specimen to
 * have planted a symlink in a directory STZ created moments earlier in the
 * same round, and realpath-ing every entry costs a syscall per file for a
 * case that cannot currently occur. Swap in `realpathSync` on the resolved
 * parent if specimens ever gain a write that lands before materialization.
 */
export function resolveContained(baseDir: string, relPath: string): string {
  const base = resolve(baseDir);
  const full = resolve(base, relPath);
  if (!full.startsWith(base + sep)) {
    throw new Error(
      `unsafe specimen file path ${JSON.stringify(relPath)} — escapes ` +
        `${JSON.stringify(base)} (path-traversal guard)`,
    );
  }
  return full;
}

/**
 * Write a specimen's returned files into `dir`, rejecting any key that
 * escapes it (T-01-13). `files` is a MODEL-PRODUCED map, so `../../etc/x`,
 * `/tmp/x` and `a/../../x` all reach this loop. Both `orchestrator.ts`'s
 * two call sites and `agent-runner.ts`'s optional materialization go through
 * here, so one check covers all of them.
 */
export async function writeSpecimenFiles(dir: string, files: Record<string, string>): Promise<void> {
  const base = resolve(dir);
  await mkdir(base, { recursive: true });
  for (const [path, contents] of Object.entries(files)) {
    const full = resolveContained(base, path);
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, contents, "utf8");
  }
}
