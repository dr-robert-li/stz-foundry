// SI.Alien — the static invader grid (no march movement in this slice).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  const ALIEN_WIDTH = 24;
  const ALIEN_HEIGHT = 16;
  const H_GAP = 12;
  const V_GAP = 12;
  const TOP_MARGIN = 56;

  // Per-row point values, indexed by row (0 = top). Arcade tradition: the single
  // top row is worth the most, the two middle rows a medium value, the two
  // bottom rows the least. Table-driven so the mapping is data, not branches.
  // Values come from SI.Config so the numbers live in exactly one place.
  function pointsTable() {
    const C = window.SI.Config;
    return [
      C.ALIEN_POINTS_ROW_HIGH, // row 0 (top)
      C.ALIEN_POINTS_ROW_MID,  // row 1
      C.ALIEN_POINTS_ROW_MID,  // row 2
      C.ALIEN_POINTS_ROW_LOW,  // row 3
      C.ALIEN_POINTS_ROW_LOW,  // row 4 (bottom)
    ];
  }

  // pointsForRow — score value awarded for destroying an alien on `row`.
  function pointsForRow(row) {
    return pointsTable()[row];
  }

  // createGrid — a rows x cols block, horizontally centered in the field.
  // Each alien is a plain record carrying its grid coordinates, an `alive`
  // flag (per the gameState contract) and its numeric `points` value.
  function createGrid(fieldWidth) {
    const rows = window.SI.Config.ALIEN_ROWS;
    const cols = window.SI.Config.ALIEN_COLS;
    const table = pointsTable();

    const blockWidth = cols * ALIEN_WIDTH + (cols - 1) * H_GAP;
    const startX = (fieldWidth - blockWidth) / 2;

    // Build declaratively: a flat list produced from the row x col index space.
    const grid = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        grid.push({
          x: startX + col * (ALIEN_WIDTH + H_GAP),
          y: TOP_MARGIN + row * (ALIEN_HEIGHT + V_GAP),
          width: ALIEN_WIDTH,
          height: ALIEN_HEIGHT,
          row: row,
          col: col,
          alive: true,
          points: table[row],
        });
      }
    }
    return grid;
  }

  window.SI.Alien = {
    ALIEN_WIDTH: ALIEN_WIDTH,
    ALIEN_HEIGHT: ALIEN_HEIGHT,
    pointsForRow: pointsForRow,
    createGrid: createGrid,
  };
})();
