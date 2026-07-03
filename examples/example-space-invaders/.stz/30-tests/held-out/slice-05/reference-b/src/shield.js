// SI.Shield — destructible shields (slice-05, P4). A shield is a plain
// {x, y, cells:[integrity...]} record where `cells` is a FLAT, row-major
// integrity array over an SHIELD_CELL_COLS x SHIELD_CELL_ROWS block:
// index = row * cols + col. Every cell starts at SHIELD_MAX_INTEGRITY.
//
// The module keeps two responsibilities and no more: build the initial
// shield row (createShields), and expose the PURE geometry map
// cellRect(shield, cellIndex) -> {x,y,width,height} so tests (and the
// renderer) can locate any cell from its flat index without knowing the
// internal layout. All bullet/cell collision + integrity mutation lives in
// SI.Game.update(); this module never mutates game state.
//
// window.SI is bootstrapped once in rng.js (ADR-001). Depends only on
// SI.Config (grid dimensions), matching the entities/* dependency rule.
(function () {
  // cellRect — PURE. Maps a flat cell index to its on-field rectangle using
  // the shield's own top-left (x,y) plus the fixed cell size from SI.Config.
  // Row-major: col = index % cols, row = floor(index / cols). Does not read
  // or care about the cell's integrity — geometry is fixed for the life of
  // the shield, so a fully-destroyed cell still reports its rect (which is
  // what lets a test target "the cell at index i" regardless of its state).
  function cellRect(shield, cellIndex) {
    var cfg = window.SI.Config;
    var cols = cfg.SHIELD_CELL_COLS;
    var cw = cfg.SHIELD_CELL_WIDTH;
    var ch = cfg.SHIELD_CELL_HEIGHT;
    var col = cellIndex % cols;
    var row = Math.floor(cellIndex / cols);
    return {
      x: shield.x + col * cw,
      y: shield.y + row * ch,
      width: cw,
      height: ch,
    };
  }

  // createShields — builds SHIELD_COUNT shields spread evenly across the
  // field width, all sharing SHIELD_Y as their top edge. Each shield's
  // `cells` is a fresh flat array of SHIELD_MAX_INTEGRITY values. Returns a
  // new array of plain records (JSON-serializable, per ADR-003).
  function createShields(gameWidth) {
    var cfg = window.SI.Config;
    var count = cfg.SHIELD_COUNT;
    var cols = cfg.SHIELD_CELL_COLS;
    var rows = cfg.SHIELD_CELL_ROWS;
    var blockWidth = cols * cfg.SHIELD_CELL_WIDTH;
    var cellCount = cols * rows;

    // Evenly space `count` blocks: distribute the leftover width into the
    // count+1 gaps (before, between, after) so the row is centered.
    var totalBlocks = count * blockWidth;
    var gap = (gameWidth - totalBlocks) / (count + 1);

    var shields = [];
    for (var s = 0; s < count; s++) {
      var cells = [];
      for (var c = 0; c < cellCount; c++) {
        cells.push(cfg.SHIELD_MAX_INTEGRITY);
      }
      shields.push({
        x: gap + s * (blockWidth + gap),
        y: cfg.SHIELD_Y,
        cells: cells,
      });
    }
    return shields;
  }

  window.SI.Shield = {
    cellRect: cellRect,
    createShields: createShields,
  };
})();
