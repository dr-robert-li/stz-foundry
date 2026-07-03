// build.js — concatenates src/ (dependency order) into dist/game.js and
// wraps it into dist/index.html. Node builtins only (fs, path), per the
// zero-dependency rule. Idempotent: safe to run repeatedly, always
// overwrites dist/ with a fresh build from current src/.
'use strict';

var fs = require('fs');
var path = require('path');

var SRC_DIR = path.join(__dirname, 'src');
var DIST_DIR = path.join(__dirname, 'dist');

// Concatenation order = dependency order (matches conventions.md).
var MODULES = [
  'rng.js',
  'collision.js',
  'config.js',
  'loop.js',
  'player.js',
  'bullet.js',
  'alien.js',
  'game.js',
];

function build() {
  var banner = '// GENERATED FILE — do not hand-edit. Produced by build.js from src/.\n';

  var bundle = banner + MODULES.map(function (name) {
    var filePath = path.join(SRC_DIR, name);
    var contents = fs.readFileSync(filePath, 'utf8');
    return '// ---- ' + name + ' ----\n' + contents;
  }).join('\n');

  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(path.join(DIST_DIR, 'game.js'), bundle);

  var html =
    '<!DOCTYPE html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '  <meta charset="UTF-8">\n' +
    '  <title>Space Invaders</title>\n' +
    '</head>\n' +
    '<body>\n' +
    '<script>\n' +
    bundle +
    '\n</script>\n' +
    '</body>\n' +
    '</html>\n';

  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), html);
}

build();

module.exports = build;
