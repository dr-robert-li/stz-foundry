// build.js — Node builtins only (fs, path). Concatenates src/*.js in
// dependency order into dist/game.js (plain JS bundle, no HTML) and inlines
// that same bundle into dist/index.html (canvas shell + minimal CSS + an
// ADR-003 window.gameState stub at state: 'ready'). Idempotent: re-running
// with unchanged src/ produces byte-identical output.
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var SRC_DIR = path.join(ROOT, 'src');
var DIST_DIR = path.join(ROOT, 'dist');

// Dependency order for this slice: rng -> collision -> config -> loop.
var MODULE_ORDER = ['rng.js', 'collision.js', 'config.js', 'loop.js'];

function readModules() {
  return MODULE_ORDER.map(function (name) {
    var filePath = path.join(SRC_DIR, name);
    var contents = fs.readFileSync(filePath, 'utf8');
    return '// ---- src/' + name + ' ----\n' + contents.replace(/\s+$/, '') + '\n';
  }).join('\n');
}

function buildBundle(bundleSrc) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(path.join(DIST_DIR, 'game.js'), bundleSrc, 'utf8');
}

function buildHtml(bundleSrc) {
  // ADR-003 window.gameState stub: minimal shape at the initial 'ready'
  // state. Later slices' modules (SI.Game, entities, etc.) own the real
  // gameplay logic; this slice only guarantees the shape exists.
  var gameStateStub = [
    'window.gameState = {',
    '  state: \'ready\',',
    '  score: 0,',
    '  lives: (window.SI && window.SI.Config) ? window.SI.Config.STARTING_LIVES : 3,',
    '  wave: 1,',
    '  fps: 60,',
    '  player: { x: 0, y: 0, width: 0, height: 0 },',
    '  aliens: [],',
    '  playerBullets: [],',
    '  alienBullets: [],',
    '  shields: [],',
    '  ufo: { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 }',
    '};'
  ].join('\n');

  var html = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<title>Space Invaders</title>',
    '<style>',
    '  html, body { margin: 0; padding: 0; background: #000; height: 100%; }',
    '  body { display: flex; align-items: center; justify-content: center; }',
    '  canvas { background: #000; image-rendering: pixelated; }',
    '</style>',
    '</head>',
    '<body>',
    '<canvas id="game" width="800" height="600"></canvas>',
    '<script>',
    bundleSrc,
    '',
    gameStateStub,
    '</script>',
    '</body>',
    '</html>',
    ''
  ].join('\n');

  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), html, 'utf8');
}

function build() {
  var bundleSrc = readModules();
  buildBundle(bundleSrc);
  buildHtml(bundleSrc);
}

build();
