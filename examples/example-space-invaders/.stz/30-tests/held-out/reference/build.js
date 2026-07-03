// build.js - Node builtins only (fs/path). Concatenates src/*.js in
// ADR-004 dependency order and emits BOTH:
//   dist/game.js     - the plain concatenated JS bundle (attaches to
//                      window.SI, no HTML) - the STZ eval entry point.
//   dist/index.html  - canvas shell + minimal CSS + the same bundle inline
//                      + a window.gameState stub (ADR-003 shape, state:'ready').
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');

// Foundation-scaffold slice: only these modules exist yet. Later slices
// extend this list (audio, renderer, entities/*, game, main) per ADR-004.
const MODULE_ORDER = ['rng.js', 'collision.js', 'config.js', 'loop.js'];

function build() {
  const bundle = MODULE_ORDER.map((name) =>
    fs.readFileSync(path.join(SRC_DIR, name), 'utf8')
  ).join('\n');

  const gameStateStub = `
window.gameState = {
  state: 'ready',
  score: 0,
  lives: 0,
  wave: 1,
  fps: 0,
  player: null,
  aliens: [],
  playerBullets: [],
  alienBullets: [],
  shields: [],
  ufo: null,
};
`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Space Invaders</title>
<style>
  html, body { margin: 0; padding: 0; background: #000; }
  canvas { display: block; margin: 0 auto; background: #000; }
</style>
</head>
<body>
<canvas id="gameCanvas" width="800" height="600"></canvas>
<script>
${bundle}
${gameStateStub}
</script>
</body>
</html>
`;

  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(path.join(DIST_DIR, 'game.js'), bundle, 'utf8');
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), html, 'utf8');
}

build();

module.exports = { build };
