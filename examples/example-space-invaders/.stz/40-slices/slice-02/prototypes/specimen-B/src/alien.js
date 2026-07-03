// SI.Alien — static (non-marching, that's a later slice) alien-grid
// entity. Small class wrapping the plain fields; game.js reads/writes
// gameState.aliens as plain {x,y,width,height,row,alive,points} objects
// via toState(), per ADR-003.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  function Alien(x, y, width, height, row, points) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.row = row;
    this.points = points;
    this.alive = true;
  }

  Alien.prototype.toState = function () {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      row: this.row,
      alive: this.alive,
      points: this.points,
    };
  };

  // Classic 5x11 point mapping: back row (row 0, top) worth the most.
  function pointsForRow(row, cfg) {
    if (row === 0) {
      return cfg.ALIEN_POINTS_ROW_HIGH;
    }
    if (row === 1 || row === 2) {
      return cfg.ALIEN_POINTS_ROW_MID;
    }
    return cfg.ALIEN_POINTS_ROW_LOW;
  }

  // Builds the full rows x cols grid, centered horizontally within
  // boundsWidth, starting at originY.
  function buildGrid(opts) {
    var rows = opts.rows;
    var cols = opts.cols;
    var alienWidth = opts.alienWidth;
    var alienHeight = opts.alienHeight;
    var spacingX = opts.spacingX;
    var spacingY = opts.spacingY;
    var originY = opts.originY;
    var cfg = opts.cfg;

    var gridWidth = cols * spacingX;
    var originX = (opts.boundsWidth - gridWidth) / 2 + (spacingX - alienWidth) / 2;

    var aliens = [];
    for (var row = 0; row < rows; row++) {
      var points = pointsForRow(row, cfg);
      for (var col = 0; col < cols; col++) {
        var x = originX + col * spacingX;
        var y = originY + row * spacingY;
        aliens.push(new Alien(x, y, alienWidth, alienHeight, row, points));
      }
    }
    return aliens;
  }

  window.SI.Alien = Alien;
  window.SI.Alien.buildGrid = buildGrid;
  window.SI.Alien.pointsForRow = pointsForRow;
})();
