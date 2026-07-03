---
summary: "ADR: dist/index.html is produced by a small Node.js script that concatenates src/*.js in a fixed dependency order into one <script> block, in preference to a bundler (Vite/webpack/esbuild) — no build-tool runtime dependency, deterministic output, matches the intent's 'develop as modules, ship as one file' constraint exactly."
---

# ADR-004: Build by manual concatenation, not a bundler

## Status
Accepted.

## Context
The intent requires developing as "testable JS modules" and shipping "ONE
self-contained HTML file... zero runtime dependencies," with Playwright as the
only acceptable test-only dependency. The research
(`.stz/10-research/external/07-bundling-strategy.md`) evaluated manual
concatenation against a bundler (Vite + vite-plugin-singlefile) and recommended
manual concatenation; validation confirmed this fits the constraints and that
plain `<script>` concatenation (no ES module `import`/`export` syntax, global
namespace objects instead) is standard, well-understood JS behavior with no
surprises.

## Decision
`build.js` (Node.js builtins only — `fs`, `path`) reads `src/*.js` in the fixed
dependency order documented in `conventions.md`
(`rng -> collision -> audio -> renderer -> entities/* -> loop -> game -> main`),
concatenates their contents into the `<script>` block of a static HTML shell
(canvas element + minimal CSS), and writes `dist/index.html`. No bundler, no
minifier, no ES module loader is used. `dist/index.html` is a generated artifact:
it is rebuilt from `src/`, never hand-edited, and Playwright tests run against
the built `dist/index.html`, not against `src/` directly.

Rejected alternative: Vite + `vite-plugin-singlefile`. Would add build-time npm
dependencies for a project whose entire premise is zero-dependency, zero-build-
step simplicity for ~9 small modules — meaningfully more tooling for no benefit
this project needs (no minification requirement, no HMR need, no TypeScript).

## Consequences
- Adding a new module means: create `src/<name>.js`, add it to the ordered list
  in `build.js` at the correct dependency position, and to the load-order table
  in `conventions.md`. Forgetting the `build.js` entry means the module silently
  isn't shipped — this is a manual step, not automatically discovered import
  resolution, and is the accepted tradeoff for zero tooling.
- No source maps, no minification — acceptable, since correctness (not payload
  size or original-source debugging in prod) is the stated priority, and the code
  is small enough to debug directly in the shipped `<script>` block if needed.
- CI/dev workflow must always run `node build.js` before running Playwright
  against `dist/index.html`, so build.js should be idempotent and fast (it is —
  it's just file reads and a concatenation).
