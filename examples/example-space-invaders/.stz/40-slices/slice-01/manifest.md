---
summary: Namespace, seedable RNG, AABB collision math, fixed-timestep loop skeleton, and the concatenation build pipeline — the shared substrate every predicate slice builds on; owns no done-predicate itself.
contract: "window.SI namespace bootstrap (window.SI = window.SI || {}); SI.RNG.seed(n) / SI.RNG.next() seedable PRNG with Math.random()-compatible interface; SI.Collision.aabbOverlap(a, b) pure AABB overlap with edge-touch excluded; SI.Config holding all named game constants (grid 5x11, starting lives 3, point values 10/20/30, UFO bonus 50-300, FIXED_TIMESTEP_MS); SI.Loop fixed-timestep accumulator skeleton (SI.Loop.start(), capped delta, calls SI.Game.update(FIXED_TIMESTEP_MS) in a while-loop then SI.Renderer.draw() once per rAF frame) with no game rules behind it yet; build.js (Node builtins fs/path only) concatenating src/*.js in the ADR-004 dependency order into dist/index.html (canvas shell + minimal CSS + stub window.gameState at state:'ready' matching the ADR-003 field shape)."
complexity: 3
traceTier: unit
votesPerPair: undefined
---

# slice-01 — foundation-scaffold

## Contract

`window.SI namespace bootstrap (window.SI = window.SI || {}); SI.RNG.seed(n) / SI.RNG.next() seedable PRNG with Math.random()-compatible interface; SI.Collision.aabbOverlap(a, b) pure AABB overlap with edge-touch excluded; SI.Config holding all named game constants (grid 5x11, starting lives 3, point values 10/20/30, UFO bonus 50-300, FIXED_TIMESTEP_MS); SI.Loop fixed-timestep accumulator skeleton (SI.Loop.start(), capped delta, calls SI.Game.update(FIXED_TIMESTEP_MS) in a while-loop then SI.Renderer.draw() once per rAF frame) with no game rules behind it yet; build.js (Node builtins fs/path only) concatenating src/*.js in the ADR-004 dependency order into dist/index.html (canvas shell + minimal CSS + stub window.gameState at state:'ready' matching the ADR-003 field shape).`

## Done predicates
