// SI.Alien — static 5x11 alien grid factory, plus the PURE march-cadence
// formula (SI.Alien.marchInterval) consumed by SI.Game.update() to drive
// rigid-block horizontal march (slice-03, P2). No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config for grid size/points.
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

  // March cadence (TEST-FACING, slice-03/P2): PURE, integer, positive,
  // monotonically NON-INCREASING as aliveCount drops from full strength to 1
  // (fewer survivors -> faster marching). Linear interpolation between a slow
  // interval at full strength and a fast (1-step) interval with a single
  // alien left. FULL_STRENGTH is read from SI.Config once at module-load
  // time (not per call) so the function itself stays a pure computation of
  // its one argument.
  var MARCH_INTERVAL_BASE = 30; // update()-call steps between marches at full strength
  var FULL_STRENGTH = window.SI.Config.ALIEN_ROWS * window.SI.Config.ALIEN_COLS;

  function marchInterval(aliveCount) {
    var n = aliveCount > 0 ? aliveCount : 0;
    var interval = Math.round((MARCH_INTERVAL_BASE * n) / FULL_STRENGTH);
    return interval < 1 ? 1 : interval;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
  };
})();
