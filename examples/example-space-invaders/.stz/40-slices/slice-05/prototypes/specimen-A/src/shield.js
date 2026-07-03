// SI.Shield — destructible shield factory + pure cell-geometry math
// (slice-05, P4). A shield is {x,y,cells:[integer integrity...]} where
// `cells` is a row-major flat array (SI.Config.SHIELD_ROWS *
// SHIELD_COLS entries). The actual hit resolution (bullet-vs-cell overlap,
// integrity decrement) is orchestrated by SI.Game.update(); this module only
// creates shields and exposes cellRect() as pure geometry math, per the
// TEST-FACING API (tests target a cell via cellRect() without knowing
// internals). No canvas deps. window.SI is bootstrapped once in rng.js
// (ADR-001), which loads first. Depends on SI.Config only.
(function () {
  // cellRect — PURE. Row-major layout: cellIndex = row * cols + col. Returns
  // the {x,y,width,height} rect for that cell in world space, regardless of
  // the cell's current integrity (geometry doesn't depend on state).
  function cellRect(shield, cellIndex) {
    var cfg = window.SI.Config;
    var cols = cfg.SHIELD_COLS;
    var cellW = cfg.SHIELD_CELL_WIDTH;
    var cellH = cfg.SHIELD_CELL_HEIGHT;

    var row = Math.floor(cellIndex / cols);
    var col = cellIndex % cols;

    return {
      x: shield.x + col * cellW,
      y: shield.y + row * cellH,
      width: cellW,
      height: cellH,
    };
  }

  // createShields — builds SI.Config.SHIELD_COUNT shields, evenly spaced
  // across gameWidth with equal gaps (including the outer margins), each
  // starting at full SHIELD_STARTING_INTEGRITY per cell. Deliberately leaves
  // a clear central gap (see config.js comment) rather than a shield
  // straddling gameWidth/2.
  function createShields(gameWidth, gameHeight) {
    var cfg = window.SI.Config;
    var count = cfg.SHIELD_COUNT;
    var cols = cfg.SHIELD_COLS;
    var rows = cfg.SHIELD_ROWS;
    var totalCells = cols * rows;
    var shieldWidth = cols * cfg.SHIELD_CELL_WIDTH;
    var y = gameHeight - cfg.SHIELD_Y_FROM_BOTTOM;
    var gap = (gameWidth - count * shieldWidth) / (count + 1);

    var shields = [];
    for (var i = 0; i < count; i++) {
      var x = gap + i * (shieldWidth + gap);
      var cells = [];
      for (var c = 0; c < totalCells; c++) {
        cells.push(cfg.SHIELD_STARTING_INTEGRITY);
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
