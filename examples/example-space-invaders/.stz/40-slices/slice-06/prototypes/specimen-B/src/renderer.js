// SI.Renderer — canvas drawing only. Read-only w.r.t. state (never mutates
// it) and never throws (the whole draw() body is guarded — a bad frame is
// skipped, not fatal). Strategy: batch same-color fills. Aliens are grouped
// by row-color, shield cells by integrity-color band, bullets by kind —
// each group gets ONE beginPath()/fill() instead of one fill per rect, to
// keep draw() light even with 55 aliens + shield cells on screen.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var ctx = null;
  var width = 800;
  var height = 600;

  // init — caches the 2D context + canvas size. Called by main.js at boot;
  // draw() also lazily self-inits (ensureContext) so it still works if a
  // caller forgets to call init() explicitly, as long as a #game canvas
  // exists in the document.
  function init(canvas) {
    try {
      if (!canvas || typeof canvas.getContext !== 'function') {
        return;
      }
      ctx = canvas.getContext('2d');
      width = canvas.width || width;
      height = canvas.height || height;
    } catch (e) {
      ctx = null;
    }
  }

  function ensureContext() {
    if (ctx) {
      return ctx;
    }
    try {
      if (typeof document === 'undefined' || typeof document.getElementById !== 'function') {
        return null;
      }
      var canvas = document.getElementById('game');
      if (!canvas) {
        return null;
      }
      init(canvas);
      return ctx;
    } catch (e) {
      return null;
    }
  }

  function identityRect(entity) {
    return entity;
  }

  // fillBatch — draws every rect (as returned by getRect(item)) in `items`
  // with a single beginPath()/fill() call for `color`, instead of one
  // fill per rect. Read-only: never mutates `items` or its entries.
  function fillBatch(c, color, items, getRect) {
    if (!items || items.length === 0) {
      return;
    }
    c.fillStyle = color;
    c.beginPath();
    for (var i = 0; i < items.length; i++) {
      var r = getRect(items[i]);
      c.rect(r.x, r.y, r.width, r.height);
    }
    c.fill();
  }

  function alienColor(row) {
    if (row === 0) return '#ff5050';
    if (row <= 2) return '#50ff9c';
    return '#50c8ff';
  }

  function shieldColor(integrity, maxIntegrity) {
    if (integrity <= 0) {
      return null; // destroyed cell — nothing to draw
    }
    var ratio = integrity / maxIntegrity;
    if (ratio > 0.66) return '#33cc66';
    if (ratio > 0.33) return '#cccc33';
    return '#cc6633';
  }

  // groupByColor — buckets `items` into { color: [item, ...] } using
  // colorFn(item), preserving first-seen color order (so fill order is
  // stable, not that it matters visually). Skips items where colorFn
  // returns null/undefined (nothing to draw for that item).
  function groupByColor(items, colorFn) {
    var groups = {};
    var order = [];
    for (var i = 0; i < items.length; i++) {
      var color = colorFn(items[i]);
      if (!color) {
        continue;
      }
      if (!groups[color]) {
        groups[color] = [];
        order.push(color);
      }
      groups[color].push(items[i]);
    }
    return { order: order, groups: groups };
  }

  function drawAliens(c, aliens) {
    var alive = [];
    for (var i = 0; i < aliens.length; i++) {
      if (aliens[i].alive !== false) {
        alive.push(aliens[i]);
      }
    }
    var batched = groupByColor(alive, function (a) {
      return alienColor(a.row);
    });
    for (var g = 0; g < batched.order.length; g++) {
      var color = batched.order[g];
      fillBatch(c, color, batched.groups[color], identityRect);
    }
  }

  function drawShields(c, shields) {
    var cfg = window.SI.Config;
    var maxIntegrity = (cfg && cfg.SHIELD_CELL_INTEGRITY) || 4;
    var rects = [];
    for (var si = 0; si < shields.length; si++) {
      var shield = shields[si];
      for (var ci = 0; ci < shield.cells.length; ci++) {
        var integrity = shield.cells[ci];
        var rect = window.SI.Shield.cellRect(shield, ci);
        rect.integrity = integrity; // local copy only, not the real cell
        rects.push(rect);
      }
    }
    var batched = groupByColor(rects, function (r) {
      return shieldColor(r.integrity, maxIntegrity);
    });
    for (var g = 0; g < batched.order.length; g++) {
      var color = batched.order[g];
      fillBatch(c, color, batched.groups[color], identityRect);
    }
  }

  function drawHud(c, state) {
    c.fillStyle = '#ffffff';
    c.font = '14px monospace';
    c.textBaseline = 'top';
    c.fillText('SCORE ' + state.score, 8, 8);
    c.fillText('LIVES ' + state.lives, 150, 8);
    c.fillText('WAVE ' + state.wave, 250, 8);
    c.fillText('FPS ' + Math.round(state.fps || 0), 340, 8);
    if (state.state && state.state !== 'playing') {
      c.fillText(String(state.state).toUpperCase(), 430, 8);
    }
  }

  // draw — the contract entrypoint: SI.Renderer.draw(state). Never throws;
  // never mutates state. If there's no usable 2D context (headless Node,
  // missing canvas), it's a silent no-op.
  function draw(state) {
    try {
      var c = ensureContext();
      if (!c || !state) {
        return;
      }

      c.fillStyle = '#000000';
      c.fillRect(0, 0, width, height);

      if (state.shields) {
        drawShields(c, state.shields);
      }
      if (state.aliens) {
        drawAliens(c, state.aliens);
      }

      if (state.player) {
        c.fillStyle = '#ffffff';
        c.fillRect(state.player.x, state.player.y, state.player.width, state.player.height);
      }

      if (state.playerBullets && state.playerBullets.length) {
        fillBatch(c, '#ffffff', state.playerBullets, identityRect);
      }
      if (state.alienBullets && state.alienBullets.length) {
        fillBatch(c, '#ff3333', state.alienBullets, identityRect);
      }

      if (state.ufo && state.ufo.active) {
        c.fillStyle = '#ff00ff';
        c.fillRect(state.ufo.x, state.ufo.y, state.ufo.width, state.ufo.height);
      }

      drawHud(c, state);
    } catch (e) {
      // Renderer must never throw (contract) — swallow, skip this frame.
    }
  }

  window.SI.Renderer = {
    init: init,
    draw: draw,
  };
})();
