// SI.Alien — static 5x11 grid (no march movement in this slice). Row point
// values come straight from the SI.Config.ALIEN_ROW_POINTS data table, a
// plain array lookup by row index rather than a branch per row.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  function createGrid() {
    var cfg = window.SI.Config;
    var rowHeight = cfg.ALIEN_HEIGHT + cfg.ALIEN_V_SPACING;
    var colWidth = cfg.ALIEN_WIDTH + cfg.ALIEN_H_SPACING;
    var aliens = [];

    for (var row = 0; row < cfg.ALIEN_ROWS; row++) {
      var points = cfg.ALIEN_ROW_POINTS[row];
      var y = cfg.ALIEN_GRID_TOP + row * rowHeight;
      for (var col = 0; col < cfg.ALIEN_COLS; col++) {
        aliens.push({
          x: cfg.ALIEN_GRID_LEFT + col * colWidth,
          y: y,
          width: cfg.ALIEN_WIDTH,
          height: cfg.ALIEN_HEIGHT,
          points: points,
        });
      }
    }

    return aliens;
  }

  window.SI.Alien = {
    createGrid: createGrid,
  };
})();
