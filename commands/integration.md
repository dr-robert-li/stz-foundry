---
description: Sealed end-to-end integration/functional gate. After the per-slice tournaments, prove the composed slices work TOGETHER against the project intent (greenfield) — and that a brownfield change preserved existing source behaviour.
argument-hint: "(run after all slices are done)"
---

## Setup: locate the bridge

```bash
if command -v stz >/dev/null 2>&1; then STZ='stz';
elif command -v stz-f >/dev/null 2>&1; then STZ='stz-f';
elif [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/bin/stz.mjs" ]; then STZ="node ${CLAUDE_PLUGIN_ROOT}/bin/stz.mjs";
else STZ="node $(ls -d ~/.claude/plugins/cache/*/stz-f/*/bin/stz.mjs 2>/dev/null | sort -V | tail -1)"; fi
```

# /stz-f:integration — the composition-level sealed gate

The per-slice sealed suite is unit-level: it proves each slice satisfies its own
contract. It does NOT prove the assembled slices work together, or that a
brownfield edit preserved end-to-end behaviour. This is that gate — one sealed
suite authored per project, run after aggregation, with the same anti-hacking
discipline as the per-slice suites.

Run this once every slice is `done` (`/stz-f:pipeline` recommends it then).

## Steps

1. **Author the integration suite (blind).** Spawn `stz-test-author` with the
   **project intent** (the `00-intent/` done-predicates) and the composed slice
   contracts — NOT any specimen's code. It writes ONE sealed ESM harness under
   `30-tests/held-out/integration/` that imports the **assembled entry point**
   (the composed artifact, e.g. `dist/` or `src/index`) and asserts end-to-end
   behaviour the whole project promises — the cross-slice scenarios a per-slice
   suite structurally cannot see. Same wire contract as a per-slice suite (final
   JSON line `{passed,total,passRate}`, exit 0 iff passRate 1).

2. **Cross-reference + seal it.** Just like a per-slice suite: have a second,
   independent author write a reference the suite must pass (`seal-crosscheck`),
   then `seal` so the integration suite is frozen by content hash alongside the
   rest of the held-out tree. A divergent crosscheck halts for human
   adjudication — never auto-rewrite.

3. **Gather the preserved surface (brownfield only).** If this is a brownfield
   project (a `10-research/codebase-map.json` exists), collect the
   `preservedExports` across every slice anchor — the public surface the change
   promised to keep working. Greenfield projects skip this.

4. **Run the gate.**

   ```bash
   $STZ bridge integration-gate --root . \
     --suite .stz/30-tests/held-out/integration/integration.mjs \
     --entry <assembled-entry.mjs> \
     --preserved '["exportA","exportB"]'   # brownfield only; omit greenfield
   ```

   The gate seal-verifies the held-out tree first (a tampered integration suite
   is not a gate), runs the sealed suite against the assembled artifact, and
   (brownfield) checks every preserved export still resolves. It writes
   `90-audit/integration.md` and exits non-zero if the composition or the source
   preservation broke.

## On failure

A red gate means the slices don't compose (a cross-slice integration bug the
unit suites missed) or a brownfield change dropped a public export callers
depend on. This is a real defect — do not ship. Reproduce it as a concrete case
and take it through `/stz-f:debug` on the offending slice (mine it into a sealed
regression case, re-run), or, if it's a genuine cross-slice design gap, halt for
human adjudication. Never weaken the integration suite to make it pass.
