// SI.Shield — destructible shield factory + pure cell geometry + a
// functional bullet-vs-shield resolver (slice-05, P4). No canvas deps.
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config (cell/grid sizing) and SI.Collision (aabb overlap) only.
(function () {
  // Bridges an {x,y,width,height}-shaped entity into the {x,y,w,h} shape
  // SI.Collision.aabbOverlap reads, without mutating the source object.
  function toAabb(entity) {
    return { x: entity.x, y: entity.y, w: entity.width, h: entity.height };
  }

  // cellRect — PURE. Given a shield ({x,y,cells}) and a cell index, returns
  // that cell's {x,y,width,height} geometry. Cells are laid out row-major
  // (SHIELD_COLS wide) starting at the shield's own {x,y} origin. Does not
  // read/require cells[cellIndex] itself — geometry is independent of
  // integrity, so tests can target a cell rect without knowing internals.
  function cellRect(shield, cellIndex) {
    var cfg = window.SI.Config;
    var cols = cfg.SHIELD_COLS;
    var col = cellIndex % cols;
    var row = Math.floor(cellIndex / cols);
    return {
      x: shield.x + col * cfg.SHIELD_CELL_WIDTH,
      y: shield.y + row * cfg.SHIELD_CELL_HEIGHT,
      width: cfg.SHIELD_CELL_WIDTH,
      height: cfg.SHIELD_CELL_HEIGHT,
    };
  }

  // createShields — factory. Spaces SI.Config.SHIELD_COUNT shields evenly
  // across [0, gameWidth], row-of-cells sitting just above the player, each
  // cell starting at SHIELD_START_INTEGRITY.
  function createShields(gameWidth, playerY) {
    var cfg = window.SI.Config;
    var count = cfg.SHIELD_COUNT;
    var totalCells = cfg.SHIELD_COLS * cfg.SHIELD_ROWS;
    var shieldWidth = cfg.SHIELD_COLS * cfg.SHIELD_CELL_WIDTH;
    var shieldHeight = cfg.SHIELD_ROWS * cfg.SHIELD_CELL_HEIGHT;
    var y = playerY - cfg.SHIELD_MARGIN_ABOVE_PLAYER - shieldHeight;
    var spacing = gameWidth / (count + 1);

    return Array.from({ length: count }, function (_unused, i) {
      return {
        x: spacing * (i + 1) - shieldWidth / 2,
        y: y,
        cells: Array.from({ length: totalCells }, function () {
          return cfg.SHIELD_START_INTEGRITY;
        }),
      };
    });
  }

  // resolveBulletHits — PURE functional pipeline. Given the current
  // `shields` array and a `bullets` array (player OR alien bullets — either
  // is treated as a live collidable bullet purely by array membership, per
  // the TEST-FACING API, so a bare injected bullet still hits), returns a
  // NEW {shields, bullets} pair: any bullet overlapping a cell rect
  // decrements that cell's integrity by one (floored at 0, never negative)
  // and is removed from the surviving bullets. Cell geometry persists even
  // once a cell's integrity has reached 0 (it still blocks/consumes
  // bullets — only the integrity number is clamped, not the cell itself).
  // At most one bullet is consumed per cell per call, scanning cells in
  // index order.
  function resolveBulletHits(shields, bullets) {
    var consumed = bullets.map(function () {
      return false;
    });

    var newShields = shields.map(function (shield) {
      var newCells = shield.cells.slice();

      for (var cellIndex = 0; cellIndex < newCells.length; cellIndex++) {
        var rect = cellRect(shield, cellIndex);
        var rectAabb = toAabb(rect);

        for (var bi = 0; bi < bullets.length; bi++) {
          if (consumed[bi]) {
            continue;
          }
          if (window.SI.Collision.aabbOverlap(toAabb(bullets[bi]), rectAabb)) {
            newCells[cellIndex] = Math.max(0, newCells[cellIndex] - 1);
            consumed[bi] = true;
            break; // this cell took its one hit this call; move to the next cell
          }
        }
      }

      return { x: shield.x, y: shield.y, cells: newCells };
    });

    var survivingBullets = bullets.filter(function (_bullet, bi) {
      return !consumed[bi];
    });

    return { shields: newShields, bullets: survivingBullets };
  }

  window.SI.Shield = {
    cellRect: cellRect,
    createShields: createShields,
    resolveBulletHits: resolveBulletHits,
  };
})();
