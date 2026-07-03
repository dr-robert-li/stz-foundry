// SI.Shield — destructible shield factory + pure cell geometry (slice-05,
// P4). A shield is {x,y,cells:[integer integrity...]}, a flat row-major
// grid of SHIELD_ROWS x SHIELD_COLS cells. No canvas deps. window.SI is
// bootstrapped once in rng.js (ADR-001), which loads first. Depends on
// SI.Config only — collision resolution (which bullets hit which cells)
// is orchestrated by SI.Game.update(), same division of labor as
// SI.Alien (grid/geometry here, orchestration in game.js).
(function () {
  // createShields — SHIELD_COUNT shields spread evenly across
  // [SHIELD_MARGIN_X, gameWidth - SHIELD_MARGIN_X], sitting
  // SHIELD_Y_OFFSET_FROM_BOTTOM px above the bottom of the field (between
  // the aliens and the player). Every cell starts at SHIELD_CELL_INTEGRITY.
  function createShields(gameWidth, gameHeight) {
    var cfg = window.SI.Config;
    var count = cfg.SHIELD_COUNT;
    var shieldWidth = cfg.SHIELD_COLS * cfg.SHIELD_CELL_WIDTH;
    var y = gameHeight - cfg.SHIELD_Y_OFFSET_FROM_BOTTOM;
    var span = gameWidth - cfg.SHIELD_MARGIN_X * 2;
    var gap = count > 1 ? (span - count * shieldWidth) / (count - 1) : 0;

    var cellCount = cfg.SHIELD_ROWS * cfg.SHIELD_COLS;
    var shields = [];
    for (var i = 0; i < count; i++) {
      var cells = [];
      for (var c = 0; c < cellCount; c++) {
        cells.push(cfg.SHIELD_CELL_INTEGRITY);
      }
      shields.push({
        x: cfg.SHIELD_MARGIN_X + i * (shieldWidth + gap),
        y: y,
        cells: cells,
      });
    }
    return shields;
  }

  // cellRect — PURE. Given a shield and a flat row-major cell index
  // (index = row*SHIELD_COLS + col), returns that cell's world-space
  // {x,y,width,height}, so tests/collision code can target a cell without
  // knowing the internal grid layout. No mutation, no randomness.
  function cellRect(shield, cellIndex) {
    var cfg = window.SI.Config;
    var cols = cfg.SHIELD_COLS;
    var w = cfg.SHIELD_CELL_WIDTH;
    var h = cfg.SHIELD_CELL_HEIGHT;
    var row = Math.floor(cellIndex / cols);
    var col = cellIndex % cols;
    return {
      x: shield.x + col * w,
      y: shield.y + row * h,
      width: w,
      height: h,
    };
  }

  window.SI.Shield = {
    createShields: createShields,
    cellRect: cellRect,
  };
})();
