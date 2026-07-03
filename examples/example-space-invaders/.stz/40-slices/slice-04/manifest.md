---
summary: "Closes the core loss loop: alien fire, lives decrement, dual gameover trigger (lives-zero or alien-reaches-row), and gameover terminality."
contract: "Alien-bullet variant of SI.Bullet plus alien-fire-column selection via SI.RNG.next(); collision of alienBullets vs SI.Player inside SI.Game.update(dt) decrements lives by exactly 1 and consumes the bullet; SI.Game.state transitions to 'gameover' when lives === 0 OR any alive alien's row (per slice-03's live march/grid-position data) reaches the player's row; gameover is terminal — once state === 'gameover', further update(dt) calls never change lives, score, or state. TEST-FACING API: alienBullets entries are plain {x,y,width,height} objects and are LIVE by array-membership alone (same rule as playerBullets) — an alien bullet overlapping SI.Player (via SI.Collision.aabbOverlap) decrements gameState.lives by exactly 1 and is removed, even one injected directly into gameState.alienBullets. Alien-fire column selection calls SI.RNG.next() so seeding via SI.Game.init({seed}) or SI.RNG.seed(n) makes firing deterministic. Gameover-by-reaching-row trigger is geometric and observable: state becomes gameover when any ALIVE alien reaches the player row, i.e. alien.y + alien.height >= player.y. Gameover is TERMINAL: once gameState.state===\"gameover\", any further SI.Game.update(dt) leaves lives, score, and state unchanged. Do not break P1 (move/shoot/kill) or P2 (march). build.js still emits dist/game.js (eval entry) + dist/index.html."
complexity: 3
traceTier: sealed
votesPerPair: undefined
---

# slice-04 — lives-and-gameover

## Contract

`Alien-bullet variant of SI.Bullet plus alien-fire-column selection via SI.RNG.next(); collision of alienBullets vs SI.Player inside SI.Game.update(dt) decrements lives by exactly 1 and consumes the bullet; SI.Game.state transitions to 'gameover' when lives === 0 OR any alive alien's row (per slice-03's live march/grid-position data) reaches the player's row; gameover is terminal — once state === 'gameover', further update(dt) calls never change lives, score, or state. TEST-FACING API: alienBullets entries are plain {x,y,width,height} objects and are LIVE by array-membership alone (same rule as playerBullets) — an alien bullet overlapping SI.Player (via SI.Collision.aabbOverlap) decrements gameState.lives by exactly 1 and is removed, even one injected directly into gameState.alienBullets. Alien-fire column selection calls SI.RNG.next() so seeding via SI.Game.init({seed}) or SI.RNG.seed(n) makes firing deterministic. Gameover-by-reaching-row trigger is geometric and observable: state becomes gameover when any ALIVE alien reaches the player row, i.e. alien.y + alien.height >= player.y. Gameover is TERMINAL: once gameState.state==="gameover", any further SI.Game.update(dt) leaves lives, score, and state unchanged. Do not break P1 (move/shoot/kill) or P2 (march). build.js still emits dist/game.js (eval entry) + dist/index.html.`

## Done predicates
- `undefined` (undefined)
