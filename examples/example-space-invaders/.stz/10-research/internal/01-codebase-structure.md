---
summary: "Codebase is empty (no source code yet); project root contains only .stz/ intent tier. Architecture should follow modular structure: audio, renderer, collision, game objects (player, aliens, shields, UFO), main game loop."
---

# Internal Codebase Structure

## Current State

**Confirmed**: The project root contains only the `.stz/` directory with intent and audit files. No source code exists yet.

```
/home/robert_li/Desktop/projects/example-stz-f/
├── .stz/
│   ├── 00-intent/          (intent files, donePredicates, etc.)
│   └── 90-audit/           (project state)
└── (empty)
```

## Recommended Module Architecture

Based on the intent and sealed tests (P1–P5), the codebase should follow this structure during development:

```
src/
├── index.html              (development entry point for manual testing)
├── audio.js                (WebAudio synthesis: playShoot, playExplosion, etc.)
├── renderer.js             (Canvas drawing: aliens, player, bullets, shields)
├── collision.js            (AABB collision detection helpers)
├── player.js               (Player class: position, bounds, bullets, lives)
├── alien.js                (Alien class: grid, march, fire, health)
├── shield.js               (Shield class: blocks, integrity, rendering)
├── ufo.js                  (UFO class: spawning, traversal, scoring)
├── game.js                 (Game state and loop: init, update, render)
└── main.js                 (Entry point: canvas setup, game loop start, window.gameState)

dist/
└── game.html               (Final bundled single-file artifact)

tests/
└── game.spec.js            (Playwright sealed test suite for P1–P5)

build.sh                    (Script to concatenate src/*.js into dist/game.html)
```

## Key Modules & Responsibilities

### audio.js
- WebAudio context initialization.
- SFX playback functions: `playShoot()`, `playAlienFire()`, `playHit()`, `playExplosion()`, `playCoinPickup()`.
- No external dependencies.

### renderer.js
- Canvas context and drawing functions.
- `drawAlien(x, y)`, `drawPlayer(x, y)`, `drawBullet(x, y)`, `drawShield(blocks)`, `drawUFO(x, y)`.
- `clearScreen()`, `drawScore(score)`, `drawLives(lives)`.
- Pixel-art sprite rendering (no image assets; drawn programmatically or from sprite data).

### collision.js
- Pure collision detection: `rectCollide(a, b)` (AABB).
- Query functions: `checkAlienBulletHitsPlayer()`, `checkPlayerBulletHitsAliens()`, `checkBulletHitsShield()`.
- Helpers for screen-boundary detection: `isOffScreen(obj)`, `alienTouchesBottom()`.

### player.js
- Player state: `x`, `y`, `width`, `height`, `lives`, `bullets[]`, `speed`.
- Methods: `moveLeft()`, `moveRight()`, `clampX()`, `fire()`, `takeDamage()`.
- Exposed on global namespace: `const Player = { /* ... */ };`

### alien.js
- Alien grid state: `aliens[][]` (2D array), `direction`, `speed`, `marchInterval`, `marchTimer`.
- Methods: `init(count)`, `step()`, `march()`, `fire()`, `removeAlien(row, col)`.
- Speed scaling: `updateSpeed()` based on `remainingCount / totalCount`.
- Exposed on global namespace: `const Aliens = { /* ... */ };`

### shield.js
- Shield state: `shields[]`, each with `blocks[][]` (2D grid of block objects).
- Block object: `{ x, y, health }`.
- Methods: `init()`, `update()`, `hit(x, y)`, `draw(ctx)`.
- Exposed on global namespace: `const Shields = { /* ... */ };`

### ufo.js
- UFO state: `active`, `x`, `y`, `speed`, `spawnChance`.
- Methods: `update()`, `draw(ctx)`, `spawn()`, `despawn()`.
- Exposed on global namespace: `const UFO = { /* ... */ };`

### game.js
- Game state object: `gameState = { lives, score, wave, state, aliens, player, shields, ufo, bullets, fpsSamples, medianFps }`.
- Methods: `init()`, `update(dt)`, `render()`, `checkCollisions()`, `checkGameOver()`, `nextWave()`, `handleInput()`.
- Exposed on global namespace: `const Game = { /* ... */ };`

### main.js
- Canvas setup: `const canvas = document.getElementById('gameCanvas');`
- Game initialization: `Game.init();`
- Input listeners: `addEventListener('keydown', ...)`, etc.
- Game loop: `requestAnimationFrame(gameLoop)` with fixed timestep.
- Window exposure: `window.gameState = Game.gameState;` for Playwright testing.
- FPS tracking: Accumulate samples and calculate median every 1–2 seconds.

## Testing Entry Point

**Development**: Open `src/index.html` in a browser to play/test manually.

**Sealed Tests**: Playwright opens `dist/game.html` and asserts on `window.gameState` after simulated input.

### Example: index.html (Development)

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Space Invaders - Dev</title>
</head>
<body>
  <canvas id="gameCanvas" width="800" height="600"></canvas>
  <script type="module" src="main.js"></script>
</body>
</html>
```

During development, `main.js` can import other modules:

```javascript
// main.js (development, using ES6 modules)
import { Audio } from './audio.js';
import { Renderer } from './renderer.js';
import { Game } from './game.js';

window.gameState = Game.gameState;
// ... etc.
```

During shipping, `build.sh` concatenates all .js files into the single HTML, removing import statements.

## Global Namespace Convention

All modules export a single object to the global scope:

```javascript
// audio.js
const Audio = {
  context: null,
  playShoot() { /* ... */ }
};

// game.js
const Game = {
  gameState: { lives: 3, score: 0, /* ... */ },
  init() { /* ... */ }
};

// main.js
window.gameState = Game.gameState;  // For Playwright
window.startGame = () => Game.init();
```

This avoids polluting the global scope and makes dependencies explicit (e.g., `Game.init()` calls `Audio.playShoot()`).

## Conventions for P1–P5 Compliance

### P1 (move-shoot-kill)
- `Player.fire()` creates a bullet object in `gameState.playerBullets[]`.
- `Game.checkCollisions()` iterates bullets and aliens, uses AABB.
- On hit: remove alien from `gameState.aliens`, increment `gameState.score`.

### P2 (alien-march)
- `Aliens.step()` increments x position by direction * speed.
- On edge: `direction *= -1`, `y += stepDown`, reset x.
- Speed updates: `Aliens.updateSpeed()` scales interval by remaining count.

### P3 (lives-gameover)
- Alien bullet hits player: `Player.takeDamage()`, decrement `gameState.lives`.
- Check: `lives === 0` or `alienY >= playerY` → `gameState.state = 'gameover'`.

### P4 (waves-shields-ufo)
- Last alien destroyed: `gameState.wave++`, spawn new grid.
- Shield collision: decrement block health, remove block if health <= 0.
- UFO hit: `gameState.score += ufoPoints`, despawn UFO.

### P5 (fps)
- Track frame count in game loop.
- Every 1 second, calculate FPS and push to `gameState.fpsSamples[]`.
- After 5 seconds, calculate `gameState.medianFps`.

## No External Dependencies

All modules use only:
- Canvas 2D API (built-in).
- WebAudio API (built-in).
- Vanilla JavaScript (no frameworks, no libraries).

## Build and Deploy Process

1. **Develop**: Edit `src/*.js`, test in `src/index.html`.
2. **Build**: Run `build.sh` to concatenate files into `dist/game.html`.
3. **Ship**: Upload `dist/game.html` (single file).
4. **Run**: User opens `dist/game.html` in browser (no server, no build step on user side).
5. **Test**: Playwright launches Chromium, opens `dist/game.html`, asserts on `window.gameState`.

## Summary

The codebase is empty but structured intentionally:
- Modular during development (for testability and clarity).
- Single-file on shipping (for portability and simplicity).
- No external dependencies (vanilla JS + Canvas + WebAudio).
- Global namespace convention prevents pollution.
- Window-exposed state enables sealed test assertions.
