// SI.Alien — 5x11 alien grid factory + pure march-interval math (slice-03),
// plus pure alien-fire target selection (slice-04 / P3).
// The actual march and firing are orchestrated by SI.Game.update(); this
// module only creates the grid and exposes pure helpers. No canvas deps.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
// Depends on SI.Config for grid size/points/march tuning.
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

  // marchInterval — PURE. Integer number of SI.Game.update() steps between
  // horizontal march moves, given the count of aliens still alive.
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

  // pickFiringAlien — PURE. Chooses which alien fires next, given the live
  // alien list and one random float `rand` in [0, 1) (the caller supplies
  // SI.RNG.next() so seeding is what makes selection deterministic — this
  // helper reads no RNG itself, which keeps it testable in isolation).
  //
  // Strategy (deliberately table-driven / grouping, not an index scan): the
  // rigid block means every alien in a firing "column" shares the same x, so
  // group live aliens by x into one bottom-most shooter per column, order the
  // columns left-to-right for a stable index, then map `rand` onto a column.
  // Only the front (bottom-most, max-y) alien of a column can fire, like the
  // arcade original. Returns null when there are no aliens.
  function pickFiringAlien(aliens, rand) {
    if (!aliens || aliens.length === 0) {
      return null;
    }

    var frontByColumn = Object.create(null);
    aliens.forEach(function (a) {
      var key = a.x;
      var current = frontByColumn[key];
      if (!current || a.y > current.y) {
        frontByColumn[key] = a;
      }
    });

    var shooters = Object.keys(frontByColumn).map(function (k) {
      return frontByColumn[k];
    });
    shooters.sort(function (p, q) {
      return p.x - q.x;
    });

    var idx = Math.floor(rand * shooters.length);
    if (idx < 0) {
      idx = 0;
    }
    if (idx >= shooters.length) {
      idx = shooters.length - 1; // guards rand === 1 (or FP rounding)
    }
    return shooters[idx];
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
    pickFiringAlien: pickFiringAlien,
  };
})();
