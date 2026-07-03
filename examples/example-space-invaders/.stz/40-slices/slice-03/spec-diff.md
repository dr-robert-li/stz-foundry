---
summary: "Spec diff slice-03: 0 missing, 3 added, 5 kept."
---

# Spec diff — slice-03

Canonical audit record: intent spec vs. as-built spec.

## ✅ Delivered as planned (5)
- SI.Alien.marchInterval(aliveCount) is pure, returns a positive integer, and is monotonically non-increasing as aliveCount drops 55->1, strictly faster (smaller interval) at 1 than at 55.
- Each march step translates the whole grid as one rigid block: every alive alien moves by the same x-delta that step, across multiple starting configs and after removals.
- On any alien touching a screen edge, the whole grid steps down by rowStep and horizontal direction reverses on the very next march step.
- March cadence is driven deterministically by SI.Game.update(dt) call count (internal accumulated-step counter), never wall-clock; repeated update() calls reproduce the march exactly, independent of dt magnitude.
- Aliens remain plain {x,y,width,height,points} entities through marching (shape preserved; only positions/direction change).

## ⚠️ Planned but missing (0)
_none_

## ➕ Built beyond plan (3)
- Alien entities created in alien.js carry two fields beyond the claimed {x,y,width,height,points} shape: `row` (used once at creation for pointsForRow tiering, never read again) and `alive: true` (set once, never read — dead removal is done by splicing aliens out of state.aliens in resolveBulletAlienCollisions, not by flipping this flag).
- marchInterval's speed ramp uses a distinct tuning ceiling (ALIEN_MARCH_MAX_INTERVAL=48) rather than the grid's total alien count (55), so the ratio math is a real ceil() rather than an identity mapping — a design choice left open by the intent.
- Loop.js adds a spiral-of-death guard (delta capped at 3x fixed step) around the fixed-timestep accumulator feeding SI.Game.update(), independent of the march determinism contract.
