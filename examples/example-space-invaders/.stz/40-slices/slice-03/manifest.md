---
summary: Adds rigid-block march, edge-triggered drop-and-reverse, and count-driven interval shrink on top of slice-02's alien grid entity.
contract: "Extends SI.Alien's grid with march behavior inside SI.Game.update(dt): the whole grid translates as one rigid block each march step (identical per-step x-delta for every alien, verified across multiple starting configurations); on any alien touching a screen edge, the whole grid steps down by rowStep and horizontal direction reverses on the very next step; march step interval is derived from remaining-alive-alien count and is monotonically non-increasing as that count drops from 55 to 1. TEST-FACING API: expose SI.Alien.marchInterval(aliveCount) — a PURE function returning the integer number of fixed update() steps between horizontal march moves, monotonically NON-INCREASING as aliveCount drops from 55 to 1 (faster as fewer remain). March is driven deterministically by SI.Game.update(dt) call count (an internal accumulated-step counter), NEVER wall-clock, so repeated update() calls reproduce the march exactly. Aliens remain plain {x,y,width,height,points} entities (may carry an alive/dead marker); grid horizontal direction and the pending drop are internal SI.Game/SI.Alien state observable only via alien positions across steps. build.js still emits dist/game.js + dist/index.html; the eval entry is dist/game.js."
complexity: 3
traceTier: sealed
votesPerPair: undefined
---

# slice-03 — alien-grid-march

## Contract

`Extends SI.Alien's grid with march behavior inside SI.Game.update(dt): the whole grid translates as one rigid block each march step (identical per-step x-delta for every alien, verified across multiple starting configurations); on any alien touching a screen edge, the whole grid steps down by rowStep and horizontal direction reverses on the very next step; march step interval is derived from remaining-alive-alien count and is monotonically non-increasing as that count drops from 55 to 1. TEST-FACING API: expose SI.Alien.marchInterval(aliveCount) — a PURE function returning the integer number of fixed update() steps between horizontal march moves, monotonically NON-INCREASING as aliveCount drops from 55 to 1 (faster as fewer remain). March is driven deterministically by SI.Game.update(dt) call count (an internal accumulated-step counter), NEVER wall-clock, so repeated update() calls reproduce the march exactly. Aliens remain plain {x,y,width,height,points} entities (may carry an alive/dead marker); grid horizontal direction and the pending drop are internal SI.Game/SI.Alien state observable only via alien positions across steps. build.js still emits dist/game.js + dist/index.html; the eval entry is dist/game.js.`

## Done predicates
- `undefined` (undefined)
