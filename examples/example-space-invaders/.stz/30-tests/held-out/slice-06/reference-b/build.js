// build.js (reference-b) — concatenates src/*.js in dependency order into
// dist/game.js and wraps that same bundle in dist/index.html. Node builtins
// only (ADR-004). Idempotent: same src -> byte-identical dist every run.
'use strict';

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');

// Load/concat order per conventions.md: rng -> collision -> config ->
// audio -> renderer -> entities -> loop -> game -> main. audio.js and
// renderer.js only touch DOM/WebAudio APIs (no other module deps) and are
// referenced at runtime by loop/main, so they load before those. main.js is
// LAST (it calls SI.Game.init(), SI.Loop.start()).
const MODULE_ORDER = [
  'rng.js',
  'collision.js',
  'config.js',
  'audio.js',
  'renderer.js',
  'player.js',
  'bullet.js',
  'alien.js',
  'shield.js',
  'ufo.js',
  'loop.js',
  'game.js',
  'main.js',
];

function buildBundle() {
  const parts = MODULE_ORDER.map((name) => {
    const filePath = path.join(SRC_DIR, name);
    return `// ---- src/${name} ----\n` + fs.readFileSync(filePath, 'utf8');
  });
  return parts.join('\n');
}

function buildHtml(bundle) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Space Invaders</title>
<style>
  html, body { margin: 0; padding: 0; background: #000; height: 100%; }
  canvas { display: block; margin: 0 auto; background: #000; }
</style>
</head>
<body>
<canvas id="game" width="800" height="600"></canvas>
<script>
// Pre-boot stub so window.gameState exists before the bundle runs; SI.Game
// reuses this exact object (live reference, ADR-003) and main.js's
// SI.Game.init() populates it in place.
window.gameState = {
  state: 'ready',
  score: 0,
  lives: 3,
  wave: 1,
  fps: 60,
  player: { x: 0, y: 0, width: 0, height: 0 },
  aliens: [],
  playerBullets: [],
  alienBullets: [],
  shields: [],
  ufo: { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 },
};
</script>
<script>
${bundle}
</script>
</body>
</html>
`;
}

function main() {
  fs.mkdirSync(DIST_DIR, { recursive: true });
  const bundle = buildBundle();
  fs.writeFileSync(path.join(DIST_DIR, 'game.js'), bundle);
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), buildHtml(bundle));
}

main();
