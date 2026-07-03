---
summary: "Single-file HTML bundling options: manual script concatenation (simplest, zero tooling), or bundler plugins (Vite + vite-plugin-singlefile); prefer manual for determinism."
---

# Single-File HTML Bundling Strategy

## Intent Requirement

The intent specifies:
- "Deliverable is ONE self-contained HTML file (vanilla JS + HTML5 Canvas), zero runtime dependencies."
- "Develop as testable JS modules, then inline/bundle into the single HTML file as the shipped artifact."

The shipped artifact must be a single `.html` file that runs with no build step, no external resources, no network requests.

## Bundling Approaches

### Option 1: Manual Script Concatenation (Simplest, Recommended)

Sources: [JavaScript Modules Part 2: Module Bundling](https://www.freecodecamp.org/news/javascript-modules-part-2-module-bundling-5020383cf306/), [How to bundle multiple JS and CSS files into single bundle](https://dev.to/shaijut/how-to-bundle-mutiple-js-and-css-files-into-single-bundle-2a70)

**Philosophy**: Zero tooling, maximum control, maximum simplicity.

**Process**:

1. Develop as separate ES6 modules during development:
   - `src/audio.js`, `src/renderer.js`, `src/collision.js`, `src/player.js`, `src/alien.js`, `src/game.js`

2. Ship: Concatenate all JS into a single HTML file in dependency order.

3. Manual build step (simple Node.js or bash script) combines files.

**Advantages**:
- No external tools; works with plain Node.js or bash.
- Deterministic; no bundler surprises.
- Easy to debug; code is plaintext in final HTML.
- Development uses modules; shipping is a single file.

**Disadvantages**:
- Manual file ordering required (must handle dependencies).
- No module system in final file (all scripts share global scope).

**Mitigation**: Use namespace pattern to avoid global pollution:

```javascript
// audio.js
const Audio = {
  playShoot() { /* ... */ },
  playExplosion() { /* ... */ }
};

// game.js
const Game = {
  update(dt) { /* ... */ },
  render() { Renderer.draw(); }
};
```

### Option 2: Vite + vite-plugin-singlefile (Bundler Approach)

Source: [vite-plugin-singlefile - npm](https://www.npmjs.com/package/vite-plugin-singlefile)

**Process**:
- Install Vite and plugin (build-time dependencies only).
- Configure to output single HTML with inlined assets.
- Run `vite build` to generate `dist/index.html`.

**Advantages**:
- Automatic dependency resolution and minification.
- Modern development experience.

**Disadvantages**:
- Adds npm and bundler tooling (Vite, plugin dependencies).
- Overkill for a no-dependency vanilla game.
- Longer build times.

### Recommendation: Manual Bundling for Space Invaders

**Rationale**:
- Simple to understand and modify.
- No build-time external dependencies.
- Faster iteration and deterministic output.
- Sufficient for a single-file game with ~5–7 source modules.

## Module Bundling Order (Dependency Resolution)

```
1. audio.js              (no dependencies)
2. renderer.js           (no dependencies; uses canvas)
3. collision.js          (no dependencies; pure math)
4. player.js             (depends on: renderer, collision)
5. alien.js              (depends on: renderer, collision)
6. shield.js             (depends on: renderer, collision)
7. ufo.js                (depends on: renderer, collision)
8. game.js               (depends on: all above)
9. main.js               (initializes game, sets window.gameState)
```

## Namespace Convention

To prevent global scope pollution:

```javascript
// Each module exports to a global namespace object:
const Audio = { /* methods */ };
const Renderer = { /* methods */ };
const Game = { /* state and methods */ };

// main.js exposes game state for testing:
window.gameState = Game.state;
window.startGame = () => Game.init();
```

## Final HTML Structure

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Space Invaders</title>
  <style>
    body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background: #000; }
    canvas { border: 1px solid #0f0; display: block; }
  </style>
</head>
<body>
  <canvas id="gameCanvas" width="800" height="600"></canvas>
  <script>
    // All source code inlined here, in dependency order
    // (audio.js, renderer.js, collision.js, player.js, alien.js, shield.js, ufo.js, game.js, main.js)
  </script>
</body>
</html>
```

## Build Script Example (Bash)

A simple `build.sh` concatenates files in order:

```bash
cat > dist/game.html << 'HTMLEOF'
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Space Invaders</title>
</head>
<body>
  <canvas id="gameCanvas" width="800" height="600"></canvas>
  <script>
HTMLEOF

cat src/audio.js src/renderer.js src/collision.js src/player.js \
    src/alien.js src/shield.js src/ufo.js src/game.js src/main.js >> dist/game.html

cat >> dist/game.html << 'HTMLEOF'
  </script>
</body>
</html>
HTMLEOF
```

## Relevance to Intent

The intent requires:
> "Develop as testable JS modules, then inline/bundle into the single HTML file as the shipped artifact."

Manual bundling directly satisfies this contract:
- Development: Separate modules with clear responsibilities (testable in isolation, per P1–P4).
- Shipping: Single HTML file (no build step for end-user, no runtime dependencies).

A simple concatenation script is sufficient; no additional complexity is needed.
