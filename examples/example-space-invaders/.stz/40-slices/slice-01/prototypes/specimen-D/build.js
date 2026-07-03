'use strict';

// build.js — Node builtins only (fs, path). Recursively walks src/, but
// always emits modules in the fixed dependency order from ADR-004
// (rng -> collision -> config -> loop [-> future modules]); writes
// dist/game.js (the plain concatenated bundle, no HTML — the harness's
// eval entrypoint) and dist/index.html (canvas shell + minimal CSS +
// ADR-003 gameState stub, inlining that same bundle). Idempotent: running
// it twice in a row produces byte-identical output.

const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const SRC_DIR = path.join(ROOT_DIR, 'src');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

// Authoritative dependency order for the modules this slice owns. Any
// module not listed here (a future entities/*.js, game.js, main.js...)
// still gets discovered by the recursive walk and appended afterwards, in
// deterministic (sorted) order, so the build never silently drops a file.
const FIXED_ORDER = ['rng.js', 'collision.js', 'config.js', 'loop.js'];

function walk(dir) {
  let files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walk(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

function orderedSourceFiles() {
  const discovered = walk(SRC_DIR);
  const byRelPath = new Map();
  for (const file of discovered) {
    const rel = path.relative(SRC_DIR, file).split(path.sep).join('/');
    byRelPath.set(rel, file);
  }

  const ordered = [];
  for (const name of FIXED_ORDER) {
    if (byRelPath.has(name)) {
      ordered.push([name, byRelPath.get(name)]);
      byRelPath.delete(name);
    }
  }

  const remainingKeys = Array.from(byRelPath.keys()).sort();
  for (const key of remainingKeys) {
    ordered.push([key, byRelPath.get(key)]);
  }

  return ordered;
}

function buildBundle() {
  const files = orderedSourceFiles();
  const sections = files.map(([rel, full]) => {
    const code = fs.readFileSync(full, 'utf8').replace(/\s+$/, '');
    return '// --- src/' + rel + ' ---\n' + code + '\n';
  });
  return sections.join('\n');
}

function buildHtml(bundle) {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<title>Space Invaders</title>',
    '<style>',
    '  html, body {',
    '    margin: 0;',
    '    padding: 0;',
    '    height: 100%;',
    '    background: #000;',
    '    display: flex;',
    '    align-items: center;',
    '    justify-content: center;',
    '  }',
    '  canvas {',
    '    background: #000;',
    '    display: block;',
    '    image-rendering: pixelated;',
    '  }',
    '</style>',
    '</head>',
    '<body>',
    '<canvas id="game" width="800" height="600"></canvas>',
    '<script>',
    bundle,
    '// ADR-003 gameState stub: only set here if a later-loaded module',
    "// (main.js, in a future slice) hasn't already wired the live object.",
    'window.gameState = window.gameState || {',
    "  state: 'ready',",
    '  score: 0,',
    '  lives: SI.Config.STARTING_LIVES,',
    '  wave: 1,',
    '  fps: 60,',
    '  player: { x: 0, y: 0, width: 0, height: 0 },',
    '  aliens: [],',
    '  playerBullets: [],',
    '  alienBullets: [],',
    '  shields: [],',
    '  ufo: { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 },',
    '};',
    '</script>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function main() {
  const bundle = buildBundle();
  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(path.join(DIST_DIR, 'game.js'), bundle, 'utf8');
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), buildHtml(bundle), 'utf8');
}

main();
