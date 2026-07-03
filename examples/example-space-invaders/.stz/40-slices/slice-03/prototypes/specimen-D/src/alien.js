// SI.Alien — 5x11 alien grid factory + march-interval lookup (movement
// itself lives in SI.Game.update, which owns the rigid-block/drop-reverse
// state machine). No canvas deps. window.SI is bootstrapped once in rng.js
// (ADR-001), which loads first. Depends on SI.Config for grid size/points
// and the march step table.
(function () {
  var WIDTH = 30;
  var HEIGHT = 20;
  var GAP_X = 10;
  var GAP_Y = 15;
  var START_X = 40;
  var START_Y = 40;

  // Row 0 = top row = highest point value (per SI.Config point tiers).
  function pointsForRow(row) {
    var cfg = window.SI.Config;
    if (row === 0) {
      return cfg.ALIEN_POINTS_ROW_HIGH;
    }
    if (row <= 2) {
      return cfg.ALIEN_POINTS_ROW_MID;
    }
    return cfg.ALIEN_POINTS_ROW_LOW;
  }

  function createGrid() {
    var cfg = window.SI.Config;
    var aliens = [];
    for (var row = 0; row < cfg.ALIEN_ROWS; row++) {
      var points = pointsForRow(row);
      for (var col = 0; col < cfg.ALIEN_COLS; col++) {
        aliens.push({
          x: START_X + col * (WIDTH + GAP_X),
          y: START_Y + row * (HEIGHT + GAP_Y),
          width: WIDTH,
          height: HEIGHT,
          row: row,
          alive: true,
          points: points,
        });
      }
    }
    return aliens;
  }

  // PURE: integer number of SI.Game.update() steps between march moves,
  // driven by SI.Config.MARCH_STEP_TABLE. Table is checked top-down
  // (highest minAlive first); the first tier the count qualifies for wins.
  // Monotonically non-increasing as aliveCount drops across the whole
  // grid's 55->1 lifetime, by construction of the table (see config.js).
  function marchInterval(aliveCount) {
    var table = window.SI.Config.MARCH_STEP_TABLE;
    var count = aliveCount;
    if (count < 1) {
      count = 1;
    }
    var maxAliens = window.SI.Config.ALIEN_ROWS * window.SI.Config.ALIEN_COLS;
    if (count > maxAliens) {
      count = maxAliens;
    }
    for (var i = 0; i < table.length; i++) {
      if (count >= table[i].minAlive) {
        return table[i].interval;
      }
    }
    // Fallback: table's last tier should always have minAlive 1 and catch
    // every clamped count, but guard against a misconfigured table.
    return table[table.length - 1].interval;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
  };
})();
