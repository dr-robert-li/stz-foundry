// build.js — concatenates src/*.js (fixed dependency order) into
// dist/game.js and wraps that same bundle in dist/index.html.
// Node builtins only (fs, path), per ADR-004. Idempotent: re-running just
// re-reads src/ and re-writes dist/, same output for the same input.
'use strict';

const fs = require('fs');
const path = require('path');

const ORDER = [
  'rng.js',
  'collision.js',
  'config.js',
  'loop.js',
  'player.js',
  'bullet.js',
  'alien.js',
  'game.js',
];

const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');

function buildBundle() {
  return ORDER.map((file) => {
    const filePath = path.join(SRC_DIR, file);
    return `// ---- ${file} ----\n${fs.readFileSync(filePath, 'utf8')}`;
  }).join('\n');
}

function buildHtml(bundle) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Space Invaders</title>
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
