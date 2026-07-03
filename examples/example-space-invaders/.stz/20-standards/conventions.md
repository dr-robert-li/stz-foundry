---
summary: "House style for the Space Invaders single-file HTML game: vanilla ES2017 JS under one SI namespace, source modules concatenated (never bundled) into one shipped HTML, fixed-timestep game logic exposing window.gameState for Playwright, zero shipped runtime dependencies."
---

# Conventions

This project ships as **one self-contained HTML file** (vanilla JS + Canvas + WebAudio,
zero runtime dependencies) but is *developed* as separate testable JS modules under
`src/`, concatenated into `dist/index.html` by a small build script. Every rule below
exists to serve those two facts: single-file shipping, and deterministic state that
Playwright can assert on via `window.gameState`.

## Repo layout

```
src/
  rng.js            # seedable PRNG — no Math.random() anywhere else
  collision.js       # pure AABB math, no canvas/audio deps
  audio.js            # WebAudio synthesis (SI.Audio)
  renderer.js         # canvas drawing only, reads state, never mutates it
  entities/
    player.js
    alien.js
    bullet.js
    shield.js
    ufo.js
  loop.js              # fixed-timestep accumulator, rAF driver
  game.js              # state machine + orchestration (SI.Game)
  main.js              # bootstrap: canvas/audio-context setup, window.gameState wiring
build.js               # Node script: concatenates src/ in dependency order -> dist/index.html
dist/index.html         # generated shipped artifact — do not hand-edit
tests/                   # Playwright specs, dev-only
```

Module load order (also the concatenation order in `build.js`), matching the
dependency direction below: `rng.js -> collision.js -> audio.js -> renderer.js ->
entities/*.js -> loop.js -> game.js -> main.js`.

## Style

- Plain ES2017+ (const/let, arrow functions, classes optional, template literals).
  No TypeScript, no JSX, no experimental syntax the target browsers (current
  Chrome/Firefox) don't support natively — there is no transpile step, so whatever
  you write is what ships.
- No semicolon-optional style debates: use semicolons, 2-space indent, single quotes.
  If a formatter is added later, Prettier defaults are the fallback; don't hand-debate
  style beyond that.
- No `var`. No implicit globals — every top-level binding in every `src/*.js` file
  must either be `const`/`let` scoped inside an IIFE/function, or a property
  assignment on the `SI` namespace object (see ADR-001). A bare top-level
  `const`/`let`/`function` declaration in a module is a bug: once concatenated,
  every module shares one scope, so a stray top-level name is a silent collision
  waiting to happen.
- Prefer small pure functions for game rules (collision, scoring, march-step math)
  over methods that reach into shared mutable state. Pure logic is what gets tested
  directly; rendering and audio are the impure edges.
- No `Math.random()`. Ever. Use `SI.RNG` (ADR-003) so a given input sequence produces
  a given output sequence, always.
- Avoid cleverness: no bitwise tricks, no unexplained magic numbers. Game constants
  (grid size 5x11, starting lives 3, point values 10/20/30, UFO bonus range 50-300,
  fixed timestep 16.667ms) live in one `SI.Config` object in `main.js` or `game.js`,
  not scattered as literals.

## Naming

- **Namespace**: everything shipped hangs off one global, `window.SI` (see ADR-001).
  Sub-namespaces are capitalized nouns matching the file: `SI.Audio`, `SI.Renderer`,
  `SI.Collision`, `SI.RNG`, `SI.Game`, `SI.Loop`. Entity constructors/factories:
  `SI.Player`, `SI.Alien`, `SI.Bullet`, `SI.Shield`, `SI.Ufo`.
- **Files**: lowercase, hyphen-free, matching the namespace they define —
  `renderer.js` defines `SI.Renderer`, `entities/alien.js` defines `SI.Alien`.
- **Functions**: `camelCase`, verb-first (`updatePlayer`, `spawnBullet`,
  `checkAabbOverlap`, `resetWave`). Pure functions that compute-without-mutating are
  named for what they return (`nextGridDirection`, `alienPoints`), not `getX`.
- **Constants**: `UPPER_SNAKE_CASE` for true constants (`FIXED_TIMESTEP_MS`,
  `ALIEN_ROWS`), grouped under `SI.Config` rather than as bare module-level globals.
- **Tests**: Playwright specs live in `tests/`, one file per done-predicate area,
  named after it — `tests/p1-move-shoot-kill.spec.js`,
  `tests/p2-alien-march.spec.js`, `tests/p3-lives-gameover.spec.js`,
  `tests/p4-waves-shields-ufo.spec.js`, `tests/p5-fps.spec.js`. Test names describe
  the observable behavior, not the implementation.

## Architecture

### Dependency direction

Pure logic never depends on rendering or audio. Renderer and Audio read from game
state but never mutate it. Concretely:

```
rng.js, collision.js        <- no dependencies (pure)
audio.js, renderer.js        <- depend on nothing but the DOM/Canvas/WebAudio APIs
entities/*.js                <- depend on collision.js, rng.js only
game.js                       <- depends on entities/*, collision.js, rng.js, audio.js
loop.js                        <- depends on game.js (calls SI.Game.update/render)
main.js                         <- wires canvas, input, audio-context resume,
                                    window.gameState, calls SI.Loop.start()
```

Renderer and Audio are the only modules allowed to touch `CanvasRenderingContext2D`
or `AudioContext`. Nothing in `entities/` or `game.js` imports Canvas/Audio APIs
directly — that's what makes the update logic testable and deterministic without a
DOM.

### Fixed-timestep loop (see ADR-002)

`SI.Loop` drives `requestAnimationFrame`, accumulates elapsed time, and calls
`SI.Game.update(FIXED_TIMESTEP_MS)` zero or more times per frame at a fixed
16.667ms step, then calls `SI.Renderer.draw(SI.Game.state)` once per frame. Render
never advances game logic. `update()` is the only place state changes; `draw()` is
read-only.

### `window.gameState` contract (see ADR-003)

`main.js` sets `window.gameState = SI.Game.state` once at bootstrap (same object
reference, mutated in place by `update()`, not reassigned per frame) so Playwright's
`page.evaluate(() => window.gameState)` always sees the live, current snapshot. It
must stay JSON-serializable: no functions, no DOM nodes, no circular refs, no
`Map`/`Set` (use plain arrays/objects).

Required shape (extend, don't rename, without updating this doc and the sealed
tests' assumed contract):

```js
window.gameState = {
  state: 'playing',        // 'ready' | 'playing' | 'paused' | 'gameover' | 'won'
  score: 0,
  lives: 3,
  wave: 1,
  fps: 60,                  // rolling median, updated by SI.Loop
  player: { x, y, width, height },
  aliens: [ { x, y, width, height, row, alive, points } ],
  playerBullets: [ { x, y, width, height } ],
  alienBullets: [ { x, y, width, height } ],
  shields: [ { x, y, cells: [ /* integrity per cell */ ] } ],
  ufo: { active: false, x, y, width, height, bonus },
};
```

### State machine

`SI.Game.state` (the `state` field above) is the single source of truth for game
phase. Transitions (`ready -> playing`, `playing -> paused`, `playing -> gameover`,
`playing -> won`/next-wave) happen only inside `SI.Game.update()`, never from input
handlers directly — input handlers set intent flags (`SI.Game.input.fire`, etc.)
that `update()` consumes on the next fixed step. This keeps every state change
reachable from the same deterministic tick, which is what makes Playwright's
"advance N frames, then assert" pattern reliable.

### Error handling

This is a single-player local game with no I/O beyond canvas/audio/keyboard — there
are no network calls, no persistence, nothing to retry. Fail loudly in development
(let exceptions throw, `console.error` from `SI.Audio` if `AudioContext` init
fails so the game still runs without sound) rather than swallowing errors. Do not
add try/catch around game logic "just in case" — a thrown exception during `update()`
is a bug to fix, not a state to recover from.

## Testability rules

- **Determinism is non-negotiable.** No `Math.random()`, no `Date.now()`/`performance.now()`
  reads inside update logic except in `SI.Loop`'s own timestep accounting. All
  randomness (UFO spawn timing, UFO bonus value, alien fire selection) goes through
  `SI.RNG`, which the test harness can seed via `SI.RNG.seed(n)` before a test run.
- **`update()` must be callable directly** with an explicit `dt` (always
  `FIXED_TIMESTEP_MS` in practice) so tests/tools can step the simulation N times
  without waiting on real rAF/wall-clock frames.
- **No hidden state.** Anything the sealed tests need to assert on (P1-P5) must be
  reachable from `window.gameState` — don't keep authoritative data in closures that
  never get copied out.
- **`fps` in gameState is informational for P5**, computed by `SI.Loop` as a rolling
  median over recent frame times; it must not affect `update()` (rendering FPS
  fluctuation must never change game logic timing/outcomes).
- **The single-file build must stay in sync with `src/`.** `dist/index.html` is
  always regenerated by `build.js`, never hand-edited. Tests run against a freshly
  built `dist/index.html`, not against `src/` directly (there's no ES module
  loading in the shipped artifact to test against otherwise).

## Zero-dependency boundary

- The shipped artifact (`dist/index.html`) has **zero runtime dependencies**: no
  CDN `<script src>`, no npm packages, no external fonts/images/audio files. All
  sprites are drawn with Canvas primitives; all sound is synthesized with WebAudio.
- `package.json` may only contain **devDependencies** (`@playwright/test`, and
  nothing else unless there's a concrete need) used for testing and the build
  script. If a proposed dependency would appear in `dist/index.html`, it doesn't
  belong in this project — write the ~20 lines by hand instead.
- `build.js` itself uses only Node.js builtins (`fs`, `path`) — the build script is
  not exempt from the zero-dependency rule.
