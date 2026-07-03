---
summary: "ADR: use one global window.SI namespace object (not per-module top-level globals) so concatenated modules never collide with each other or with browser built-ins."
---

# ADR-001: Single root namespace (`SI`), not per-module globals

## Status
Accepted.

## Context
The shipped artifact is produced by concatenating `src/*.js` files into one
`<script>` block (validated, confirmed workable strategy — see
`.stz/10-research/external/07-bundling-strategy.md`). All concatenated top-level
code shares one global scope; there is no module system in the shipped file. The
research doc's sketched pattern used bare top-level names per module, e.g.
`const Audio = {...}`, `const Game = {...}`.

That specific sketch has a real collision risk: `window.Audio` is a built-in
browser constructor (the `HTMLAudioElement`/`Audio()` audio-tag API). Declaring a
top-level `const Audio = {...}` shadows it. It happens to be harmless *today*
because this project never uses `new Audio()`, but it's exactly the kind of
silent, easy-to-trip landmine that should be designed out rather than remembered.
The same risk exists more generally: any module could pick a name (`Game`,
`Player`, `Image`, `Audio`, `location`) that shadows a existing global or a
future addition shadows an existing module global.

## Decision
Every module attaches to exactly one root object, `window.SI` (declared once in
`rng.js`, the first file in load order: `window.SI = window.SI || {};`). Each
module then does `SI.Audio = {...}`, `SI.Renderer = {...}`, `SI.Collision =
{...}`, `SI.RNG = {...}`, `SI.Player = {...}`, etc. No module declares a bare
top-level `const`/`let`/`function` that isn't immediately scoped inside an IIFE.

`window.gameState` remains a separate, deliberately top-level property (not
`SI.gameState`) because the sealed Playwright tests read `window.gameState`
directly per the intent's fixed contract — that name is not ours to change.

## Consequences
- One inspectable root (`window.SI`) in devtools/tests instead of N ad hoc
  globals; trivially greppable for what's exposed.
- Zero collision risk with current or future browser built-ins.
- Slightly more typing (`SI.Audio.playShoot()` vs `Audio.playShoot()`) — accepted
  as the smaller cost.
- Concatenation order still matters (a module referencing `SI.Renderer` before
  `renderer.js` has run will fail), so `build.js`'s ordering is still the
  authoritative dependency graph, documented in `conventions.md`.
