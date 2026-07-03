// build.js — concatenates src/*.js (dependency order) into dist/game.js and
// inlines that bundle into dist/index.html. Node builtins only (fs, path),
// per ADR-004. Idempotent: re-running produces the same output.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

// Fixed dependency order for this slice: rng -> collision -> config -> loop.
const MODULE_ORDER = ['rng.js', 'collision.js', 'config.js', 'loop.js'];

function buildBundle() {
  const parts = MODULE_ORDER.map(function (file) {
    const filePath = path.join(SRC, file);
    const src = fs.readFileSync(filePath, 'utf8');
    return '// ---- src/' + file + ' ----\n' + src.trimEnd();
  });
  return parts.join('\n\n') + '\n';
}

function buildHtml(bundle) {
  return (
    '<!DOCTYPE html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '<meta charset="utf-8">\n' +
    '<title>Space Invaders</title>\n' +
    '<style>\n' +
    '  html, body { margin: 0; padding: 0; background: #000; }\n' +
    '  canvas { display: block; margin: 0 auto; background: #000; }\n' +
    '</style>\n' +
    '</head>\n' +
    '<body>\n' +
    '<canvas id="game" width="800" height="600"></canvas>\n' +
    '<script>\n' +
    // ADR-003 gameState stub: field shape matches conventions.md; real
    // game logic (SI.Game) fills this in in a later slice.
    'window.gameState = {\n' +
    "  state: 'ready',\n" +
    '  score: 0,\n' +
    '  lives: 3,\n' +
    '  wave: 1,\n' +
    '  fps: 60,\n' +
    '  player: { x: 0, y: 0, width: 0, height: 0 },\n' +
    '  aliens: [],\n' +
    '  playerBullets: [],\n' +
    '  alienBullets: [],\n' +
    '  shields: [],\n' +
    '  ufo: { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 },\n' +
    '};\n\n' +
    bundle +
    '</script>\n' +
    '</body>\n' +
    '</html>\n'
  );
}

function build() {
  fs.mkdirSync(DIST, { recursive: true });

  const bundle = buildBundle();
  fs.writeFileSync(path.join(DIST, 'game.js'), bundle);

  const html = buildHtml(bundle);
  fs.writeFileSync(path.join(DIST, 'index.html'), html);
}

build();
