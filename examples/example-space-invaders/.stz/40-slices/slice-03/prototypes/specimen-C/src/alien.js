// SI.Alien — 5x11 alien grid factory + pure march-interval math (slice-03).
// The actual march (rigid-block move, edge-drop-reverse) is orchestrated by
// SI.Game.update(); this module only creates the grid and exposes
// marchInterval() as pure step-count math. No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config for grid size/points/march tuning.
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

  // marchInterval — PURE. Returns the integer number of SI.Game.update()
  // steps between horizontal march moves, given the count of aliens still
  // alive. Ratio-based speed ramp: interval scales linearly with
  // aliveCount/totalCount, ceil'd to stay integer and floor-clamped to 1 so
  // the march never stalls. Monotonically non-increasing as aliveCount
  // drops (fewer aliens -> smaller interval -> faster march), strictly
  // smaller at aliveCount=1 than at aliveCount=totalCount (the classic
  // 55-alien full grid). No state read/written — same input always yields
  // the same output.
  function marchInterval(aliveCount) {
    var cfg = window.SI.Config;
    var totalCount = cfg.ALIEN_ROWS * cfg.ALIEN_COLS;
    var maxInterval = cfg.ALIEN_MARCH_MAX_INTERVAL;

    var count = aliveCount;
    if (count < 1) {
      count = 1;
    }
    if (count > totalCount) {
      count = totalCount;
    }

    var interval = Math.ceil((maxInterval * count) / totalCount);
    if (interval < 1) {
      interval = 1;
    }
    return interval;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
  };
})();
