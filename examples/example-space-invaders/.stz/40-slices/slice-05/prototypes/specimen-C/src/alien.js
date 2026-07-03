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

  // waveMarchTable — a precomputed (table-based) lookup of the "full grid"
  // ceiling interval per wave, built lazily on first use. Index 0 = wave 1,
  // reusing ALIEN_MARCH_MAX_INTERVAL unchanged (P2/P3 compatibility). Each
  // later entry is strictly smaller (WAVE_MARCH_DECAY < 1), floored at
  // WAVE_MARCH_MIN_INTERVAL so the decay can't collapse to 1 within just a
  // few waves.
  var WAVE_MARCH_TABLE_SIZE = 64;
  var waveMarchTable = null;

  function buildWaveMarchTable() {
    var cfg = window.SI.Config;
    var base = cfg.ALIEN_MARCH_MAX_INTERVAL;
    var decay = cfg.WAVE_MARCH_DECAY;
    var minInterval = cfg.WAVE_MARCH_MIN_INTERVAL;

    return Array.from({ length: WAVE_MARCH_TABLE_SIZE }, function (_unused, i) {
      var value = Math.ceil(base * Math.pow(decay, i));
      return value < minInterval ? minInterval : value;
    });
  }

  function maxIntervalForWave(wave) {
    if (waveMarchTable === null) {
      waveMarchTable = buildWaveMarchTable();
    }
    var w = wave;
    if (typeof w !== 'number' || w < 1) {
      w = 1;
    }
    var idx = w - 1;
    if (idx >= waveMarchTable.length) {
      idx = waveMarchTable.length - 1;
    }
    return waveMarchTable[idx];
  }

  // marchInterval — PURE. Returns the integer number of SI.Game.update()
  // steps between horizontal march moves, given the count of aliens still
  // alive and the current wave (defaults to 1, so slice-03 callers that
  // only pass aliveCount are unaffected). Ratio-based speed ramp: interval
  // scales linearly with aliveCount/totalCount against a per-wave ceiling
  // (see waveMarchTable), ceil'd to stay integer and floor-clamped to 1 so
  // the march never stalls. Monotonically non-increasing as aliveCount
  // drops (fewer aliens -> smaller interval -> faster march) for a fixed
  // wave, and strictly decreasing in wave for a fixed aliveCount — in
  // particular the full 55-alien grid's initial interval for wave N+1 is
  // always smaller than wave N's. No state read/written — same input
  // always yields the same output.
  function marchInterval(aliveCount, wave) {
    var cfg = window.SI.Config;
    var totalCount = cfg.ALIEN_ROWS * cfg.ALIEN_COLS;
    var maxInterval = maxIntervalForWave(wave === undefined ? 1 : wave);

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

  // frontlineByColumn — PURE. Index-scans `aliens` once and returns one
  // candidate per column: the alive alien with the greatest y (closest to
  // the player) in that column. Aliens missing/duplicating a `col` field or
  // marked alive === false are ignored, so a directly-injected alien
  // without `col`/`alive` never becomes a firing candidate. Used by
  // SI.Game.update() to pick which column fires next (slice-04, P3) — the
  // actual random pick (SI.RNG.next()) happens in game.js, not here, so
  // this stays a pure/testable function.
  function frontlineByColumn(aliens) {
    var byCol = {};
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      var c = a.col;
      if (c === undefined) {
        continue;
      }
      if (byCol[c] === undefined || a.y > byCol[c].y) {
        byCol[c] = a;
      }
    }
    var candidates = [];
    for (var key in byCol) {
      if (Object.prototype.hasOwnProperty.call(byCol, key)) {
        candidates.push(byCol[key]);
      }
    }
    return candidates;
  }

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    createGrid: createGrid,
    marchInterval: marchInterval,
    frontlineByColumn: frontlineByColumn,
  };
})();
