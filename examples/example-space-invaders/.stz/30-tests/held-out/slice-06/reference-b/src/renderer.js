// SI.Renderer — canvas drawing only (slice-06). Reads gameState, NEVER
// mutates it. MUST never throw: every entry point is defensively guarded so
// a missing document/canvas/2d-context (headless smoke, Node vm) is a
// silent no-op rather than an exception. window.SI is bootstrapped once in
// rng.js (ADR-001), which loads first. Depends on nothing but the Canvas
// 2D API.
//
// Strategy: the context is looked up lazily and cached, so main.js doesn't
// have to hand it in and draw() is self-contained. Drawing is intentionally
// cheap — flat filled rectangles + a little text — so the rAF loop clears
// the 50fps bar (P5) with headroom. A tiny palette table keyed by the
// alien's own `points` value picks colors without per-entity branching.
(function () {
  var CANVAS_ID = 'game';

  var ctx = null;
  var canvasW = 0;
  var canvasH = 0;

  // Colors keyed by point value (10/20/30). Falls back to white for any
  // injected alien with an unexpected `points`.
  var ALIEN_COLORS = { 10: '#3cf04b', 20: '#4bc6ff', 30: '#ff5b5b' };

  function resolveContext() {
    if (ctx) {
      return ctx;
    }
    if (typeof document === 'undefined' || !document.getElementById) {
      return null;
    }
    var canvas = document.getElementById(CANVAS_ID);
    if (!canvas || typeof canvas.getContext !== 'function') {
      return null;
    }
    ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    canvasW = canvas.width;
    canvasH = canvas.height;
    return ctx;
  }

  function fillRects(c, list, color) {
    if (!list || list.length === 0) {
      return;
    }
    c.fillStyle = color;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      c.fillRect(e.x, e.y, e.width, e.height);
    }
  }

  function drawAliens(c, aliens) {
    if (!aliens) {
      return;
    }
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      c.fillStyle = ALIEN_COLORS[a.points] || '#ffffff';
      c.fillRect(a.x, a.y, a.width, a.height);
    }
  }

  function drawShields(c, shields) {
    if (!shields) {
      return;
    }
    c.fillStyle = '#8be08b';
    for (var s = 0; s < shields.length; s++) {
      var shield = shields[s];
      var cells = shield.cells || [];
      for (var ci = 0; ci < cells.length; ci++) {
        if (cells[ci] <= 0) {
          continue; // destroyed cell: nothing to paint
        }
        var rect = window.SI.Shield.cellRect(shield, ci);
        c.fillRect(rect.x, rect.y, rect.width, rect.height);
      }
    }
  }

  function drawHud(c, state) {
    c.fillStyle = '#ffffff';
    c.font = '16px monospace';
    c.textBaseline = 'top';
    c.fillText('SCORE ' + (state.score || 0), 10, 8);
    c.fillText('LIVES ' + (state.lives || 0), 200, 8);
    c.fillText('WAVE ' + (state.wave || 0), 360, 8);
    if (state.state === 'gameover') {
      c.fillText('GAME OVER', canvasW / 2 - 40, canvasH / 2);
    } else if (state.state === 'won') {
      c.fillText('YOU WIN', canvasW / 2 - 32, canvasH / 2);
    }
  }

  // draw — clears the frame and paints every entity. Read-only w.r.t.
  // `state`. Whole body guarded: a throw from any canvas op is caught and
  // logged, never propagated (contract: draw MUST never throw).
  function draw(state) {
    var c = resolveContext();
    if (!c || !state) {
      return;
    }
    try {
      c.fillStyle = '#000000';
      c.fillRect(0, 0, canvasW, canvasH);

      if (state.player) {
        c.fillStyle = '#ffffff';
        c.fillRect(state.player.x, state.player.y, state.player.width, state.player.height);
      }

      drawAliens(c, state.aliens);
      fillRects(c, state.playerBullets, '#ffffff');
      fillRects(c, state.alienBullets, '#ffd34b');
      drawShields(c, state.shields);

      if (state.ufo && state.ufo.active) {
        fillRects(c, [state.ufo], '#ff5bff');
      }

      drawHud(c, state);
    } catch (err) {
      // Impure edge: log and continue so a bad frame never kills the loop.
      if (typeof console !== 'undefined') {
        console.error('SI.Renderer.draw error:', err);
      }
    }
  }

  window.SI.Renderer = {
    draw: draw,
  };
})();
