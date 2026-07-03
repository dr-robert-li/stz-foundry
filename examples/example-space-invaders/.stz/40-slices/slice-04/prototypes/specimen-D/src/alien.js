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
          col: col,
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

  // slice-04 (P3): pick which alien fires on a fire event. Picks a column
  // via SI.RNG.next() (so a given seed always fires from the same column
  // sequence), then the frontmost (largest y = closest to the player)
  // surviving alien in that column. `col` is a fixed identity assigned at
  // grid creation (see createGrid) rather than recomputed from `x`, since
  // the rigid-block march (SI.Game) shifts every alien's x by the same
  // delta and would otherwise desync a position-based column lookup from
  // the true column index. Returns null if no alien survives in the chosen
  // column this event (RNG is still consumed exactly once either way, so
  // the fire schedule stays deterministic under a seed).
  function selectFiringAlien(aliens) {
    var cfg = window.SI.Config;
    var col = Math.floor(window.SI.RNG.next() * cfg.ALIEN_COLS);
    if (col >= cfg.ALIEN_COLS) {
      col = cfg.ALIEN_COLS - 1; // guard the (extremely unlikely) next()===1 edge
    }

    var chosen = null;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.col === col && (chosen === null || a.y > chosen.y)) {
        chosen = a;
      }
    }
    return chosen;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
    selectFiringAlien: selectFiringAlien,
  };
})();
