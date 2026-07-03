// SI.Renderer — canvas pixel-art drawing (slice-06). Read-only: reads
// gameState fields, never mutates them. Must never throw, even against a
// missing canvas/context or an unusual/partial state shape — draw() is
// called once per rAF frame by SI.Loop and a thrown exception there would
// stall the whole loop. No dependency on SI.Config (geometry comes from the
// entities themselves); the only cross-module call is SI.Shield.cellRect for
// shield-cell rects. window.SI is bootstrapped once in rng.js (ADR-001).
(function () {
  function getContext() {
    try {
      var canvas = document.getElementById('game');
      if (!canvas || typeof canvas.getContext !== 'function') {
        return null;
      }
      return canvas.getContext('2d');
    } catch (e) {
      return null;
    }
  }

  function rect(ctx, x, y, w, h, color) {
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof w !== 'number' ||
      typeof h !== 'number'
    ) {
      return; // skip malformed entries rather than throw
    }
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function drawList(ctx, list, color) {
    if (!Array.isArray(list)) return;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e) continue;
      rect(ctx, e.x, e.y, e.width, e.height, color);
    }
  }

  // draw — the sole TEST-FACING entry point. Never throws: every read is
  // defensively guarded, and any unexpected shape is simply skipped rather
  // than propagated as an exception.
  function draw(state) {
    try {
      var ctx = getContext();
      if (!ctx || !state) {
        return;
      }
      var canvas = ctx.canvas;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (state.player) {
        rect(ctx, state.player.x, state.player.y, state.player.width, state.player.height, '#4cff4c');
      }

      drawList(ctx, state.aliens, '#ff4cd8');
      drawList(ctx, state.playerBullets, '#ffe14c');
      drawList(ctx, state.alienBullets, '#ff4c4c');

      if (Array.isArray(state.shields)) {
        for (var s = 0; s < state.shields.length; s++) {
          var shield = state.shields[s];
          if (!shield || !Array.isArray(shield.cells)) continue;
          for (var c = 0; c < shield.cells.length; c++) {
            if (!(shield.cells[c] > 0)) continue; // 0/negative/non-numeric -> destroyed, skip
            var cellRect =
              window.SI.Shield && typeof window.SI.Shield.cellRect === 'function'
                ? window.SI.Shield.cellRect(shield, c)
                : null;
            if (cellRect) {
              rect(ctx, cellRect.x, cellRect.y, cellRect.width, cellRect.height, '#4cd8ff');
            }
          }
        }
      }

      if (state.ufo && state.ufo.active) {
        rect(ctx, state.ufo.x, state.ufo.y, state.ufo.width, state.ufo.height, '#ffa64c');
      }
    } catch (e) {
      // Contract: draw() must never throw. Rendering is best-effort and
      // read-only; a drawing failure is not a game-logic failure.
    }
  }

  window.SI.Renderer = {
    draw: draw,
  };
})();
