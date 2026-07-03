// SI.Shield — destructible-shield factory + pure cell geometry (slice-05,
// P4). Each shield is a flat integrity array over a 2D (rows x cols) cell
// grid; SI.Shield.cellRect maps a flat cell index to on-screen geometry so
// collision/testing code never needs to know the row/col layout directly.
// No canvas deps. window.SI is bootstrapped once in rng.js (ADR-001).
// Depends on SI.Config only.
(function () {
  // cellRect — PURE. Given a shield ({x,y,cells}) and a flat cell index,
  // returns {x,y,width,height} for that cell using row-major mapping
  // (row = floor(index/cols), col = index % cols) over SI.Config's fixed
  // cell dimensions. No state read/written beyond the passed-in shield.
  function cellRect(shield, cellIndex) {
    var cfg = window.SI.Config;
    var cols = cfg.SHIELD_COLS;
    var cellWidth = cfg.SHIELD_CELL_WIDTH;
    var cellHeight = cfg.SHIELD_CELL_HEIGHT;
    var row = Math.floor(cellIndex / cols);
    var col = cellIndex % cols;
    return {
      x: shield.x + col * cellWidth,
      y: shield.y + row * cellHeight,
      width: cellWidth,
      height: cellHeight,
    };
  }

  // createShields — factory for gameState.shields (slice-05, TEST-FACING
  // shape: array of {x,y,cells:[integer integrity...]}). Shields are
  // evenly spaced across gameWidth, positioned SHIELD_Y_FROM_BOTTOM px
  // above the bottom of the field (between the alien grid and the
  // player). Every cell starts at SHIELD_CELL_INTEGRITY.
  function createShields(gameWidth, gameHeight) {
    var cfg = window.SI.Config;
    var count = cfg.SHIELD_COUNT;
    var totalCells = cfg.SHIELD_ROWS * cfg.SHIELD_COLS;
    var shieldWidth = cfg.SHIELD_COLS * cfg.SHIELD_CELL_WIDTH;
    var y = gameHeight - cfg.SHIELD_Y_FROM_BOTTOM;
    var gap = (gameWidth - count * shieldWidth) / (count + 1);

    var shields = [];
    for (var i = 0; i < count; i++) {
      var x = gap * (i + 1) + shieldWidth * i;
      var cells = [];
      for (var c = 0; c < totalCells; c++) {
        cells.push(cfg.SHIELD_CELL_INTEGRITY);
      }
      shields.push({ x: x, y: y, cells: cells });
    }
    return shields;
  }

  window.SI.Shield = {
    cellRect: cellRect,
    createShields: createShields,
  };
})();
