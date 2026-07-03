// build.js — concatenates src/*.js (dependency order) into dist/game.js and
// wraps that same bundle in dist/index.html with a real <canvas> and an
// auto-booting inline <script>. Node builtins only (ADR-004). Idempotent:
// always overwrites dist/ from the current src/, never reads dist/.
'use strict';

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');

// Dependency order (conventions.md): rng -> collision -> config -> audio ->
// renderer -> entities (player/bullet/alien/shield/ufo) -> loop -> game ->
// main. main.js must load LAST (it boots on load and references every
// other SI.* namespace).
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
