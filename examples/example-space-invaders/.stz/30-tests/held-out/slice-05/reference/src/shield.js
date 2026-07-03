// SI.Shield — destructible shield factory + pure cell geometry (slice-05,
// P4). No canvas deps. window.SI is bootstrapped once in rng.js (ADR-001).
// Depends on SI.Config only (grid geometry never depends on collision/rng —
// only SI.Game's update loop calls SI.Collision against the rects this
// module computes).
(function () {
  // createShields — factory. Evenly spaces SI.Config.SHIELD_COUNT shields
  // across gameWidth, each a SHIELD_COLS x SHIELD_ROWS flat cell array
  // (row-major: index = row * SHIELD_COLS + col), every cell starting at
  // SHIELD_START_INTEGRITY.
  function createShields(gameWidth, gameHeight) {
    var cfg = window.SI.Config;
    var shieldWidth = cfg.SHIELD_COLS * cfg.SHIELD_CELL_WIDTH;
    var totalWidth = cfg.SHIELD_COUNT * shieldWidth;
    var gap = (gameWidth - totalWidth) / (cfg.SHIELD_COUNT + 1);
    var y = gameHeight - cfg.SHIELD_Y_FROM_BOTTOM;

    var shields = [];
    for (var i = 0; i < cfg.SHIELD_COUNT; i++) {
      var x = gap + i * (shieldWidth + gap);
      var cells = [];
      var totalCells = cfg.SHIELD_COLS * cfg.SHIELD_ROWS;
      for (var c = 0; c < totalCells; c++) {
        cells.push(cfg.SHIELD_START_INTEGRITY);
      }
      shields.push({ x: x, y: y, cells: cells });
    }
    return shields;
  }

  // cellRect — PURE. Given a shield object ({x,y,cells}) and a cellIndex
  // into shield.cells (row-major, SHIELD_COLS wide), returns that cell's
  // {x,y,width,height} geometry, derived only from shield.x/shield.y and
  // SI.Config — never from a private/internal field. Lets tests target a
  // specific cell without knowing the shield's internal layout.
  function cellRect(shield, cellIndex) {
    var cfg = window.SI.Config;
    var col = cellIndex % cfg.SHIELD_COLS;
    var row = Math.floor(cellIndex / cfg.SHIELD_COLS);
    return {
      x: shield.x + col * cfg.SHIELD_CELL_WIDTH,
      y: shield.y + row * cfg.SHIELD_CELL_HEIGHT,
      width: cfg.SHIELD_CELL_WIDTH,
      height: cfg.SHIELD_CELL_HEIGHT,
    };
  }

  window.SI.Shield = {
    createShields: createShields,
    cellRect: cellRect,
  };
})();
