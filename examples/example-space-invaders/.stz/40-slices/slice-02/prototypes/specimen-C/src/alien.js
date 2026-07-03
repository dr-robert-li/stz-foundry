// SI.Alien — static 5x11 grid factory (no march movement in this slice).
// Each alien is a plain {x,y,width,height,points} object per the P1
// TEST-FACING API — no private/internal fields.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  window.SI.Config.ALIEN_WIDTH = 30;
  window.SI.Config.ALIEN_HEIGHT = 20;
  window.SI.Config.ALIEN_H_SPACING = 10;
  window.SI.Config.ALIEN_V_SPACING = 15;
  window.SI.Config.ALIEN_TOP_MARGIN = 60;
  window.SI.Config.ALIEN_LEFT_MARGIN = 40;

  // Classic layout: the back (top) row is worth the most, the front (bottom)
  // rows the least — matches SI.Config's LOW/MID/HIGH naming.
  function pointsForRow(row) {
    var cfg = window.SI.Config;
    if (row === 0) return cfg.ALIEN_POINTS_ROW_HIGH;
    if (row === 1 || row === 2) return cfg.ALIEN_POINTS_ROW_MID;
    return cfg.ALIEN_POINTS_ROW_LOW;
  }

  function range(n) {
    return new Array(n).fill(0).map(function (_, i) { return i; });
  }

  function createGrid() {
    var cfg = window.SI.Config;
    return range(cfg.ALIEN_ROWS).reduce(function (acc, row) {
      var rowAliens = range(cfg.ALIEN_COLS).map(function (col) {
        return {
          x: cfg.ALIEN_LEFT_MARGIN + col * (cfg.ALIEN_WIDTH + cfg.ALIEN_H_SPACING),
          y: cfg.ALIEN_TOP_MARGIN + row * (cfg.ALIEN_HEIGHT + cfg.ALIEN_V_SPACING),
          width: cfg.ALIEN_WIDTH,
          height: cfg.ALIEN_HEIGHT,
          points: pointsForRow(row),
        };
      });
      return acc.concat(rowAliens);
    }, []);
  }

  window.SI.Alien = {
    createGrid: createGrid,
    pointsForRow: pointsForRow,
  };
})();
