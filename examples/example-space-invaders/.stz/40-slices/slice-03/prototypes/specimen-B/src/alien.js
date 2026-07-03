// SI.Alien — 5x11 alien grid factory + march-rule pure helpers (slice-03,
// P2). No canvas deps. window.SI is bootstrapped once in rng.js
// (ADR-001), which loads first. Depends on SI.Config for grid size/points.
//
// Strategy: table/band interval lookup + edge-anticipation. marchInterval
// is a straight descending band table (fewer aliens -> smaller band ->
// smaller interval). Edge detection is *anticipatory*: before a horizontal
// step is applied, SI.Alien.anticipateEdge predicts whether the requested
// dx would carry the grid past the play-area bound and, if so, clamps the
// step so the grid comes to rest exactly on the boundary (never overshoots)
// and flags the contact so the caller can queue the drop-and-reverse for
// the next march step.
(function () {
  var WIDTH = 30;
  var HEIGHT = 20;
  var GAP_X = 10;
  var GAP_Y = 15;
  var START_X = 40;
  var START_Y = 40;

  // Per-step horizontal distance and the vertical drop distance applied on
  // edge contact. Named constants, not magic numbers scattered in game.js.
  var MARCH_DX = 10;
  var ROW_STEP = 20;

  // Band table for marchInterval: sorted descending by `min` (minimum
  // alive-alien count the band applies to). `interval` is the number of
  // SI.Game.update() steps between march moves. Strictly decreasing down
  // the table -> marchInterval() is monotonically non-increasing as
  // aliveCount drops from 55 toward 1, and strictly smaller at 1 than 55.
  var INTERVAL_BANDS = [
    { min: 50, interval: 60 },
    { min: 45, interval: 52 },
    { min: 40, interval: 45 },
    { min: 35, interval: 39 },
    { min: 30, interval: 33 },
    { min: 25, interval: 28 },
    { min: 20, interval: 23 },
    { min: 15, interval: 18 },
    { min: 10, interval: 13 },
    { min: 7, interval: 9 },
    { min: 5, interval: 6 },
    { min: 3, interval: 4 },
    { min: 2, interval: 3 },
    { min: 1, interval: 2 },
    { min: 0, interval: 1 },
  ];

  // Pure: integer, positive, band-table lookup. First band (scanning from
  // the highest `min`) that aliveCount qualifies for wins.
  function marchInterval(aliveCount) {
    var n = aliveCount;
    if (typeof n !== 'number' || !isFinite(n) || n < 0) {
      n = 0;
    }
    for (var i = 0; i < INTERVAL_BANDS.length; i++) {
      if (n >= INTERVAL_BANDS[i].min) {
        return INTERVAL_BANDS[i].interval;
      }
    }
    return INTERVAL_BANDS[INTERVAL_BANDS.length - 1].interval;
  }

  // Pure: leftmost/rightmost edge of the current alive-alien block.
  function gridBounds(aliens) {
    if (!aliens || aliens.length === 0) {
      return { minX: 0, maxX: 0 };
    }
    var minX = aliens[0].x;
    var maxX = aliens[0].x + aliens[0].width;
    for (var i = 1; i < aliens.length; i++) {
      var left = aliens[i].x;
      var right = aliens[i].x + aliens[i].width;
      if (left < minX) minX = left;
      if (right > maxX) maxX = right;
    }
    return { minX: minX, maxX: maxX };
  }

  // Pure: given the current bounds and a requested signed dx, predicts
  // whether applying dx would carry the grid past [0, playWidth]. If so,
  // clamps dx to land exactly on the boundary and reports hitEdge: true.
  // Never overshoots the play-area bound.
  function anticipateEdge(bounds, dx, playWidth) {
    if (dx > 0) {
      var roomRight = playWidth - bounds.maxX;
      if (roomRight <= 0) {
        return { dx: 0, hitEdge: true };
      }
      if (dx >= roomRight) {
        return { dx: roomRight, hitEdge: true };
      }
      return { dx: dx, hitEdge: false };
    }
    if (dx < 0) {
      var roomLeft = bounds.minX;
      if (roomLeft <= 0) {
        return { dx: 0, hitEdge: true };
      }
      if (-dx >= roomLeft) {
        return { dx: -roomLeft, hitEdge: true };
      }
      return { dx: dx, hitEdge: false };
    }
    return { dx: 0, hitEdge: false };
  }

  // Rigid-block move: every alien in `aliens` shifts by the SAME (dx, dy).
  // Mutates entries in place, mirrors SI.Bullet.updateBullets' style.
  function marchStep(aliens, dx, dy) {
    for (var i = 0; i < aliens.length; i++) {
      aliens[i].x += dx;
      aliens[i].y += dy;
    }
    return aliens;
  }

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

  window.SI.Alien = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    MARCH_DX: MARCH_DX,
    ROW_STEP: ROW_STEP,
    createGrid: createGrid,
    marchInterval: marchInterval,
    gridBounds: gridBounds,
    anticipateEdge: anticipateEdge,
    marchStep: marchStep,
  };
})();
