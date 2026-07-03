// SI.Alien — static 5x11 grid factory (P1: no march movement in this slice).
// Depends on SI.Config for grid dimensions/point tiers.
(function () {
  var ROWS = window.SI.Config.ALIEN_ROWS; // 5
  var COLS = window.SI.Config.ALIEN_COLS; // 11
  var CELL_W = 30;
  var CELL_H = 20;
  var GAP_X = 10;
  var GAP_Y = 15;
  var MARGIN_TOP = 50;

  // Classic top-rows-score-more layout: row 0 = HIGH, rows 1-2 = MID,
  // rows 3-4 = LOW. All three configured point tiers appear at least once.
  function pointsForRow(row) {
    if (row === 0) return window.SI.Config.ALIEN_POINTS_ROW_HIGH;
    if (row === 1 || row === 2) return window.SI.Config.ALIEN_POINTS_ROW_MID;
    return window.SI.Config.ALIEN_POINTS_ROW_LOW;
  }

  function createGrid(width) {
    var gridWidth = COLS * CELL_W + (COLS - 1) * GAP_X;
    var startX = (width - gridWidth) / 2;
    var aliens = [];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        aliens.push({
          x: startX + c * (CELL_W + GAP_X),
          y: MARGIN_TOP + r * (CELL_H + GAP_Y),
          width: CELL_W,
          height: CELL_H,
          row: r,
          points: pointsForRow(r),
        });
      }
    }
    return aliens;
  }

  window.SI.Alien = {
    createGrid: createGrid,
  };
})();
