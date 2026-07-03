// SI.Alien — 5x11 alien grid factory + PURE march-cadence helper.
// The march movement itself lives in SI.Game.update() (stateful); this
// module only owns the grid layout and the pure count->interval mapping.
// No canvas deps. window.SI is bootstrapped once in rng.js (ADR-001),
// which loads first. Depends on SI.Config for grid size/points.
(function () {
  var WIDTH = 30;
  var HEIGHT = 20;
  var GAP_X = 10;
  var GAP_Y = 15;
  var START_X = 40;
  var START_Y = 40;

  // Rigid-block march deltas (per march STEP, not per update() step, never
  // scaled by dt). Free constants — the contract fixes only the *shape* of
  // the motion (identical per-step dx for every alien, edge-triggered
  // drop+reverse), not the magnitudes.
  var STEP_DX = 8; // horizontal translation applied to every alive alien
  var ROW_STEP = 18; // vertical drop applied on an edge-triggered step

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

  // PURE: integer number of fixed update() steps between horizontal march
  // moves. Strategy is an explicit ascending threshold TABLE (not an
  // arithmetic formula): intervals grow with the alive count, so read the
  // other way — as the count drops from 55 -> 1 — the interval is
  // monotonically NON-INCREASING, and strictly smaller (faster) at 1 than at
  // 55. Bands are half-open on the high side: the first row whose `upTo`
  // covers `aliveCount` wins. Input is clamped to [1, 55]; the function reads
  // nothing but its argument, so repeated calls with the same count always
  // return the same integer.
  var INTERVAL_TABLE = [
    { upTo: 1, steps: 5 },
    { upTo: 4, steps: 8 },
    { upTo: 10, steps: 12 },
    { upTo: 20, steps: 17 },
    { upTo: 35, steps: 22 },
    { upTo: 48, steps: 27 },
    { upTo: 55, steps: 30 },
  ];

  function marchInterval(aliveCount) {
    var n = aliveCount;
    if (n < 1) {
      n = 1;
    }
    if (n > 55) {
      n = 55;
    }
    for (var i = 0; i < INTERVAL_TABLE.length; i++) {
      if (n <= INTERVAL_TABLE[i].upTo) {
        return INTERVAL_TABLE[i].steps;
      }
    }
    // n is clamped to <= 55 so the loop always returns; this fallback only
    // makes the "always an integer" guarantee total.
    return INTERVAL_TABLE[INTERVAL_TABLE.length - 1].steps;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    STEP_DX: STEP_DX,
    ROW_STEP: ROW_STEP,
    createGrid: createGrid,
    marchInterval: marchInterval,
  };
})();
