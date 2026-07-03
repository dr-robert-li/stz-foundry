---
summary: "Spec diff slice-05: 0 missing, 4 added, 4 kept."
---

# Spec diff — slice-05

Canonical audit record: intent spec vs. as-built spec.

## ✅ Delivered as planned (4)
- gameState.shields is an array of {x,y,cells:[integer integrity...]}; SI.Shield.cellRect(shield,i) is pure; any bullet (player or alien) overlapping a cell rect reduces that cell's integrity by 1 (floored at 0, never negative) and is consumed; a bare injected bullet over a cell still hits.
- gameState.ufo={active,x,y,width,height,bonus}; UFO spawns on an SI.RNG.next()-timed schedule with bonus in [50,300] drawn via SI.RNG.next() (deterministic under seed); a player bullet overlapping an active UFO sets ufo.active=false and adds ufo.bonus (>0) to score.
- gameState.wave starts 1; killing the last alive alien increments wave and respawns a full 55-alien grid; SI.Alien.marchInterval(aliveCount, wave=1) is pure, monotonic non-increasing in aliveCount, and strictly decreasing in wave for fixed aliveCount (wave defaults 1).
- P1 (move/shoot/kill/score), P2 (march), and P3 (lives/gameover/terminality) all still hold after adding P4.

## ⚠️ Planned but missing (0)
_none_

## ➕ Built beyond plan (4)
- Shields are positioned automatically between aliens and player (SHIELD_Y_OFFSET_FROM_BOTTOM) and evenly spread across the field width via computed gap math in createShields(), not just an arbitrary fixed layout.
- Shields block both playerBullets and alienBullets symmetrically (resolveBulletShieldCollisions is called for both directions), beyond the minimum of just blocking player fire.
- UFO collision is checked pre-movement each step (before ufo.x += UFO_SPEED) specifically so a same-step injected bullet+ufo test registers a hit against the position set that step, an explicit ordering guarantee beyond the bare shape/behavior contract.
- UFO deactivation (hit or off-screen) immediately redraws the next RNG-timed spawn delay in the same step, keeping the spawn schedule continuously advancing rather than needing a separate trigger.
