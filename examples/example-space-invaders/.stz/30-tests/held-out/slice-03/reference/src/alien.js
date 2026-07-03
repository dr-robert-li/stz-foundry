// SI.Alien — 5x11 alien grid factory + march-interval pure function (slice-03,
// P2: rigid-block march, edge drop+reverse, count-driven interval shrink).
// No canvas deps. window.SI is bootstrapped once in rng.js (ADR-001), which
// loads first. Depends on SI.Config for grid size/points.
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

  // marchInterval(aliveCount) — PURE function (TEST-FACING API). Returns the
  // integer number of fixed update() steps between horizontal march moves,
  // monotonically non-increasing as aliveCount drops from 55 to 1 (faster as
  // fewer aliens remain). Linear interpolation between a slow bound (full
  // grid) and a fast bound (last alien); Math.round of a monotonic
  // non-decreasing function of aliveCount is itself monotonic non-decreasing,
  // so the resulting interval(aliveCount) is monotonic non-increasing as
  // aliveCount falls (never ties broken the "wrong" way).
  var MAX_INTERVAL = 45; // steps between moves at aliveCount>=55 (slowest)
  var MIN_INTERVAL = 4; // steps between moves at aliveCount<=1 (fastest)
  var FULL_COUNT = 55;

  function marchInterval(aliveCount) {
    var n = Math.floor(aliveCount);
    if (!(n > 0)) {
      n = 0;
    }
    if (n >= FULL_COUNT) {
      return MAX_INTERVAL;
    }
    if (n <= 1) {
      return MIN_INTERVAL;
    }
    var t = (n - 1) / (FULL_COUNT - 1);
    return Math.round(MIN_INTERVAL + t * (MAX_INTERVAL - MIN_INTERVAL));
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
  };
})();
