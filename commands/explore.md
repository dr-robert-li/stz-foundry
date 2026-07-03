---
description: Brownfield entry — map an existing codebase (files, exports, tests, public surface) so the slicer can anchor its DAG to real code locations instead of assuming greenfield synthesis.
argument-hint: "[target-dir] (defaults to the repo root)"
---

## Setup: locate the bridge

```bash
if command -v stz >/dev/null 2>&1; then STZ='stz';
elif command -v stz-f >/dev/null 2>&1; then STZ='stz-f';
elif [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/bin/stz.mjs" ]; then STZ="node ${CLAUDE_PLUGIN_ROOT}/bin/stz.mjs";
else STZ="node $(ls -d ~/.claude/plugins/cache/*/stz-f/*/bin/stz.mjs 2>/dev/null | sort -V | tail -1)"; fi
```

# /stz-f:explore — map the existing codebase (brownfield)

STZ is greenfield by default: specimens synthesize files from a contract. To
build **on** an existing codebase you first have to know what is there. This
command produces a deterministic **codebase map** the slicer anchors to, so a
slice that claims to touch `src/auth.ts` is checked against an `src/auth.ts` that
actually exists — no hallucinated paths reach a tournament.

## Steps

1. **Scan (deterministic — the bridge does it, no model).**

   ```bash
   $STZ bridge explore --root . --target .
   ```

   Optional `--include a,b` / `--exclude a,b` (POSIX-relative path substrings).
   This walks the target (skipping `node_modules`, `.git`, `.stz`, build output),
   extracts per-file exported symbols and the public surface (index/main
   exports), flags existing test files, and writes:
   - `10-research/codebase-map.json` — machine-readable, what the slicer reads,
   - `10-research/codebase-map.md` — the human summary table.

2. **Read the map + add judgement (the agent's part).** The scan gives structure,
   not meaning. Spawn `stz-researcher` (or read it yourself) to layer on what the
   map cannot compute: which modules are load-bearing, what invariants the
   existing tests encode, what the public surface promises callers. Write that
   into `10-research/` beside the map. This is what makes the DAG *cognisant of
   its place within the codebase*, not just aware that files exist.

3. **Anchor the slices.** When you run `/stz-f:slice`, each brownfield slice
   carries an **anchor** — how it relates to existing code:
   - `add` — new files only (must NOT collide with existing paths),
   - `extend` — add exports to an existing file (must exist),
   - `edit` — change existing behaviour (must exist),

   plus `preservedExports`: the surrounding contract the slice must not break.
   Validate every anchor against the map before seeding the tournament:

   ```bash
   $STZ bridge anchor-check --root . --anchor <anchor.json>
   ```

   A dangling target file, a missing preserved export, or an `add` that would
   overwrite an existing file makes the anchor invalid (exit 1) — fix the slice
   before it runs, not after a specimen writes against a surface that isn't there.

## What this unblocks

The anchors' `preservedExports` are the surrounding contract a brownfield change
must keep working — the input to the **source-preservation** half of the sealed
end-to-end suite (`/stz-f:integration`). And an `edit`/`extend` anchor is the
signal a slice needs a real per-specimen worktree (a shared repo the specimens
mutate) rather than a synthesis prototype dir — the motivation for that upgrade.
