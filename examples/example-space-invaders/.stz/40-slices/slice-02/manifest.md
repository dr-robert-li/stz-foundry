---
summary: "First playable vertical slice: input -> player movement (clamped) -> bullet spawn -> collision -> alien removal + exact score increment, on a static (non-marching) grid."
contract: SI.Player (position/velocity, horizontal clamp to [0, width - shipWidth]); SI.Bullet player-bullet factory and straight-line update; static SI.Alien grid (5x11, per-row point values 10/20/30, no march movement); SI.Game.update(dt) consumes SI.Game.input.fire to spawn exactly one playerBullets entry per press, moves/clamps the player every step, and runs bullet-vs-alien collision via SI.Collision.aabbOverlap that removes the hit alien and adds its exact row point value to score. Populates window.gameState.player, .aliens, .playerBullets per the ADR-003 contract.
complexity: 3
traceTier: sealed
votesPerPair: undefined
---

# slice-02 — player-move-shoot-kill

## Contract

`SI.Player (position/velocity, horizontal clamp to [0, width - shipWidth]); SI.Bullet player-bullet factory and straight-line update; static SI.Alien grid (5x11, per-row point values 10/20/30, no march movement); SI.Game.update(dt) consumes SI.Game.input.fire to spawn exactly one playerBullets entry per press, moves/clamps the player every step, and runs bullet-vs-alien collision via SI.Collision.aabbOverlap that removes the hit alien and adds its exact row point value to score. Populates window.gameState.player, .aliens, .playerBullets per the ADR-003 contract.`

## Done predicates
- `undefined` (undefined)
