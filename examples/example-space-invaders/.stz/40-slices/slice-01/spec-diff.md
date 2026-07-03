---
summary: "Spec diff slice-01: 0 missing, 4 added, 6 kept."
---

# Spec diff — slice-01

Canonical audit record: intent spec vs. as-built spec.

## ✅ Delivered as planned (6)
- window.SI namespace is bootstrapped idempotently (window.SI = window.SI || {}), declared once, and all foundation modules attach to it without clobbering.
- SI.RNG.seed(n)/SI.RNG.next() is a seedable PRNG returning floats in [0,1); same seed reproduces the same sequence, different seeds diverge.
- SI.Collision.aabbOverlap(a,b) on {x,y,w,h} boxes returns true for real overlap/containment and false for separation AND edge-touch (shared boundary excluded).
- SI.Config holds all named constants with exact values: grid 5x11, startingLives 3, alien points 10/20/30, UFO bonus 50-300, positive FIXED_TIMESTEP_MS (~16.667).
- SI.Loop is a fixed-timestep accumulator: calls SI.Game.update(FIXED_TIMESTEP_MS) the correct integer number of times carrying the remainder across frames, caps a huge delta (spiral-of-death guard), and calls SI.Renderer.draw() once per rAF frame.
- build.js (Node fs/path builtins only) concatenates src/*.js in rng->collision->config->loop order into dist/game.js (plain bundle) and dist/index.html (canvas + minimal CSS + ADR-003 window.gameState stub at state:'ready'), idempotently.

## ⚠️ Planned but missing (0)
_none_

## ➕ Built beyond plan (4)
- rng.js defaults to seed(1) at module load time so SI.RNG.next() is deterministic even if no caller ever calls seed() explicitly, beyond the bare 'seedable' requirement.
- Each module is wrapped in its own IIFE to keep internal state (RNG's `state` var, Loop's `accumulator`/`lastTime`/`running`) private and non-global, beyond what the intent claims required.
- SI.Loop exposes a stop() control (running=false) in addition to start(), giving callers a way to halt the rAF loop cleanly, which the intent claims did not explicitly request.
- dist/index.html's gameState stub includes extra fields beyond a bare 'ready' flag — score, lives, wave, fps, player rect, aliens/bullets/shields arrays, and a ufo object — anticipating later slices' state shape.
