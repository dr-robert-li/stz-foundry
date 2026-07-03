---
summary: "Spec diff slice-04: 0 missing, 0 added, 6 kept."
---

# Spec diff — slice-04

Canonical audit record: intent spec vs. as-built spec.

## ✅ Delivered as planned (6)
- Aliens fire an alien-bullet variant whose firing column is chosen via SI.RNG.next(), so firing is deterministic under a fixed seed (init twice with same seed reproduces the alienBullets sequence).
- An alien bullet overlapping SI.Player (via SI.Collision.aabbOverlap) decrements gameState.lives by exactly 1 and removes that bullet; alienBullets entries are live by array-membership (a bare {x,y,width,height} injected bullet still hits).
- gameState.state transitions to 'gameover' when lives reaches 0.
- gameState.state transitions to 'gameover' when any alive alien reaches the player row (alien.y + alien.height >= player.y).
- Gameover is terminal: once state==='gameover', further SI.Game.update(dt) leaves lives, score, and state unchanged.
- P1 (move/shoot/kill/score) and P2 (rigid march, drop/reverse, monotonic interval) still hold after adding P3.

## ⚠️ Planned but missing (0)
_none_

## ➕ Built beyond plan (0)
_none_
