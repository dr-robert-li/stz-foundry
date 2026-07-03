// SI.Renderer — canvas pixel-art drawing (slice-06). Read-only: never
// mutates `state`. Composed from small pure per-entity helpers, each
// `(ctx, state) -> void`, so any one entity type is easy to reason about /
// swap independently. No canvas deps outside this module (ADR-001 dependency
// direction: renderer reads game state, never the other way around).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var BG = '#000';
  var PLAYER_COLOR = '#0f0';
  var ALIEN_COLOR = '#0ff';
  var PLAYER_BULLET_COLOR = '#fff';
  var ALIEN_BULLET_COLOR = '#f0f';
  var SHIELD_COLOR = '#0a0';
  var UFO_COLOR = '#ff0';
  var HUD_COLOR = '#fff';

  function drawBackground(ctx, state, canvas) {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawPlayer(ctx, state) {
    var p = state.player;
    if (!p) {
      return;
    }
    ctx.fillStyle = PLAYER_COLOR;
    ctx.fillRect(p.x, p.y, p.width, p.height);
  }

  function drawAliens(ctx, state) {
    var aliens = state.aliens || [];
    ctx.fillStyle = ALIEN_COLOR;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      ctx.fillRect(a.x, a.y, a.width, a.height);
    }
  }

  function drawBullets(ctx, state) {
    var playerBullets = state.playerBullets || [];
    ctx.fillStyle = PLAYER_BULLET_COLOR;
    for (var i = 0; i < playerBullets.length; i++) {
      var pb = playerBullets[i];
      ctx.fillRect(pb.x, pb.y, pb.width, pb.height);
    }

    var alienBullets = state.alienBullets || [];
    ctx.fillStyle = ALIEN_BULLET_COLOR;
    for (var j = 0; j < alienBullets.length; j++) {
      var ab = alienBullets[j];
      ctx.fillRect(ab.x, ab.y, ab.width, ab.height);
    }
  }

  function drawShields(ctx, state) {
    var shields = state.shields || [];
    ctx.fillStyle = SHIELD_COLOR;
    for (var si = 0; si < shields.length; si++) {
      var shield = shields[si];
      var cells = shield.cells || [];
      for (var ci = 0; ci < cells.length; ci++) {
        if (cells[ci] <= 0) {
          continue; // destroyed cell, nothing to draw
        }
        var rect = window.SI.Shield.cellRect(shield, ci);
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      }
    }
  }

  function drawUfo(ctx, state) {
    var ufo = state.ufo;
    if (!ufo || !ufo.active) {
      return;
    }
    ctx.fillStyle = UFO_COLOR;
    ctx.fillRect(ufo.x, ufo.y, ufo.width, ufo.height);
  }

  function drawHud(ctx, state, canvas) {
    ctx.fillStyle = HUD_COLOR;
    ctx.font = '14px monospace';
    ctx.textBaseline = 'top';
    var score = state.score !== undefined ? state.score : 0;
    var lives = state.lives !== undefined ? state.lives : 0;
    var wave = state.wave !== undefined ? state.wave : 1;
    ctx.fillText('Score: ' + score + '  Lives: ' + lives + '  Wave: ' + wave, 8, 8);

    if (state.state && state.state !== 'playing') {
      ctx.textAlign = 'center';
      ctx.font = '28px monospace';
      ctx.fillText(String(state.state).toUpperCase(), canvas.width / 2, canvas.height / 2);
      ctx.textAlign = 'left';
    }
  }

  // draw — orchestrates the per-entity helpers above against SI.Renderer's
  // own canvas/context (acquired lazily on first draw, since main.js is the
  // only module that knows about DOM readiness). Never throws: any failure
  // (no canvas in the document, a malformed state field, etc.) is caught and
  // swallowed so a rendering bug can never take down the update loop or the
  // sealed-test harness. Read-only with respect to `state`.
  var canvas = null;
  var ctx = null;

  function getContext() {
    if (ctx) {
      return ctx;
    }
    if (typeof document === 'undefined') {
      return null; // headless/Node — no DOM to draw to
    }
    canvas = document.getElementById('game');
    if (!canvas || typeof canvas.getContext !== 'function') {
      return null;
    }
    ctx = canvas.getContext('2d');
    return ctx;
  }

  function draw(state) {
    try {
      var c2d = getContext();
      if (!c2d || !state) {
        return;
      }
      drawBackground(c2d, state, canvas);
      drawPlayer(c2d, state);
      drawAliens(c2d, state);
      drawBullets(c2d, state);
      drawShields(c2d, state);
      drawUfo(c2d, state);
      drawHud(c2d, state, canvas);
    } catch (e) {
      // ponytail: swallow-and-continue is the deliberate contract here
      // (renderer must never throw / never take down the loop); log so a
      // real bug is still visible in devtools.
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Renderer.draw failed', e);
      }
    }
  }

  window.SI.Renderer = {
    draw: draw,
  };
})();
