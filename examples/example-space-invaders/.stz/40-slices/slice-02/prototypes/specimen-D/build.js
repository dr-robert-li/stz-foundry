// build.js — concatenates src/*.js (fixed dependency order) into
// dist/game.js and wraps it in a minimal dist/index.html. Node.js builtins
// only (fs, path), per ADR-004. Idempotent: safe to run any number of times,
// always produces the same output for the same src/.
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');

// rng -> collision -> config -> loop -> player -> bullet -> alien -> game
const MODULE_ORDER = [
  'rng.js',
  'collision.js',
  'config.js',
  'loop.js',
  'player.js',
  'bullet.js',
  'alien.js',
  'game.js',
];

function buildBundle() {
  return MODULE_ORDER.map((name) => {
    const filePath = path.join(SRC_DIR, name);
    return `// --- ${name} ---\n` + fs.readFileSync(filePath, 'utf8');
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
<canvas id="game"></canvas>
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
