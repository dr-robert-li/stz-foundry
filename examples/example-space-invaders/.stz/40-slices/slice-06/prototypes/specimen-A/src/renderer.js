// SI.Renderer — canvas drawing only (ADR-001/conventions: reads state,
// never mutates it). Strategy: plain fillRect/fillText, no sprites/images,
// kept deliberately light so P5 (median_fps >= 50) has headroom. The whole
// body is wrapped in try/catch so a draw() call can never throw into the
// rAF loop, no matter what shape `state` is in.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var canvas = null;
  var ctx = null;

  // Looked up lazily (not at module-load time) so this file works whether
  // or not a <canvas id="game"> exists yet, and no-ops cleanly in
  // non-browser environments (no `document`).
  function getContext() {
    if (ctx) {
      return ctx;
    }
    if (typeof document === 'undefined') {
      return null;
    }
    canvas = document.getElementById('game');
    if (!canvas || typeof canvas.getContext !== 'function') {
      return null;
    }
    ctx = canvas.getContext('2d');
    return ctx;
  }

  function drawRect(c, entity, color) {
    if (!entity) {
      return;
    }
    c.fillStyle = color;
    c.fillRect(entity.x, entity.y, entity.width, entity.height);
  }

  // draw — read-only w.r.t. `state`; never mutates any field. Clears the
  // canvas, then draws player, aliens, bullets, shields, ufo, and a small
  // score/lives/wave HUD text. Guarded end-to-end: a missing canvas,
  // missing state, or malformed entity just results in a partial/no-op
  // frame, never an exception.
  function draw(state) {
    try {
      var c = getContext();
      if (!c || !state) {
        return;
      }

      var w = c.canvas.width;
      var h = c.canvas.height;

      c.fillStyle = '#000';
      c.fillRect(0, 0, w, h);

      drawRect(c, state.player, '#4caf50');

      var aliens = state.aliens || [];
      c.fillStyle = '#ffffff';
      for (var i = 0; i < aliens.length; i++) {
        var alien = aliens[i];
        if (alien && alien.alive === false) {
          continue;
        }
        drawRect(c, alien, '#ffffff');
      }

      var playerBullets = state.playerBullets || [];
      for (var j = 0; j < playerBullets.length; j++) {
        drawRect(c, playerBullets[j], '#00e5ff');
      }

      var alienBullets = state.alienBullets || [];
      for (var k = 0; k < alienBullets.length; k++) {
        drawRect(c, alienBullets[k], '#ff5252');
      }

      var shields = state.shields || [];
      var Shield = window.SI && window.SI.Shield;
      for (var s = 0; s < shields.length; s++) {
        var shield = shields[s];
        var cells = (shield && shield.cells) || [];
        for (var ci = 0; ci < cells.length; ci++) {
          if (!(cells[ci] > 0)) {
            continue;
          }
          var rect = Shield && Shield.cellRect ? Shield.cellRect(shield, ci) : null;
          if (rect) {
            drawRect(c, rect, '#8bc34a');
          }
        }
      }

      if (state.ufo && state.ufo.active) {
        drawRect(c, state.ufo, '#e040fb');
      }

      c.fillStyle = '#ffffff';
      c.font = '16px monospace';
      c.textBaseline = 'top';
      c.fillText('Score: ' + state.score, 10, 8);
      c.fillText('Lives: ' + state.lives, 10, 28);
      c.fillText('Wave: ' + state.wave, 10, 48);
    } catch (e) {
      // ponytail: swallow — a render glitch must never crash the game
      // loop; console.error keeps it visible without throwing.
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Renderer.draw failed', e);
      }
    }
  }

  window.SI.Renderer = {
    draw: draw,
  };
})();
