---
summary: "Spec diff slice-02: 0 missing, 5 added, 6 kept."
---

# Spec diff — slice-02

Canonical audit record: intent spec vs. as-built spec.

## ✅ Delivered as planned (6)
- SI.Game.init(opts?) initializes window.gameState in place: state 'playing', score 0, player centered, aliens a 5x11 grid each with numeric points 10/20/30 by row, empty playerBullets/alienBullets; re-init fully resets even after prior mutation.
- Player moves left/right per SI.Game.input and clamps player.x to [0, width - player.width], never off either edge on any step.
- SI.Game.input.fire is edge-triggered: exactly one entry is added to playerBullets per press-edge; holding fire does not spawn every frame; release-then-press spawns another.
- A player bullet overlapping an alien (via SI.Collision.aabbOverlap) removes exactly that alien and adds its exact row point value to score; a bare {x,y,width,height} entry in playerBullets is a live collidable bullet.
- SI.Game.update(dt) advances exactly one fixed step; movement per call is constant, independent of the dt argument magnitude (ADR-002 fixed timestep).
- window.gameState === SI.Game.state, a live object mutated in place (arrays replaced wholesale, never reassigning gameState after bootstrap).

## ⚠️ Planned but missing (0)
_none_

## ➕ Built beyond plan (5)
- gameState carries extra fields beyond the slice contract (lives, wave, fps, shields, ufo stub) already wired for later slices.
- SI.RNG is a seedable mulberry32 PRNG with deterministic default seed(1), and init(opts.seed) can reseed it — not required by any c1-c6 claim.
- loop.js implements a fixed-timestep accumulator with a spiral-of-death guard (caps catch-up delta at 3x step) — robustness beyond what c5 strictly requires.
- alien objects retain an `alive: true` and `row` field even though collision resolution removes dead aliens via array filtering rather than reading `alive`.
- No MAX_PLAYER_BULLETS or similar cap exists on playerBullets array size; only off-screen (y+height<=0) bullets are pruned per step.
