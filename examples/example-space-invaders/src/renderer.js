// SI.Renderer — canvas drawing only. Reads gameState, NEVER mutates it
// (conventions.md: "Renderer and Audio read from game state but never
// mutate it"). Depends on nothing but the DOM/Canvas API + SI.Config for
// colors/dims (no magic numbers scattered here, per conventions.md).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
//
// draw(state) is the TEST-FACING entrypoint (slice-06 contract) and must
// NEVER throw — a headless/no-DOM environment, a missing <canvas id="game">,
// or a malformed state should all fail silently rather than crash the rAF
// loop. Everything below the outer try/catch is best-effort.
(function () {
  var canvas = null;
  var ctx = null;
  var lookedForCanvas = false;

  // Lazily resolve the <canvas id="game"> element (built by build.js's HTML
  // shell). Cached after first success; re-attempted (cheaply) if not found
  // yet, since main.js/DOM setup order isn't guaranteed relative to module
  // load order in every embedding.
  function getContext() {
    if (ctx) {
      return ctx;
    }
    if (typeof document === 'undefined') {
      return null; // no DOM (Node smoke tests) — nothing to draw to
    }
    if (!canvas) {
      canvas = document.getElementById('game');
    }
    if (!canvas || typeof canvas.getContext !== 'function') {
      return null;
    }
    ctx = canvas.getContext('2d');
    return ctx;
  }

  function drawRect(c, entity, color) {
    c.fillStyle = color;
    c.fillRect(entity.x, entity.y, entity.width, entity.height);
  }

  function alienColor(cfg, alien) {
    if (alien.row === 0) {
      return cfg.RENDER_ALIEN_COLOR_HIGH;
    }
    if (alien.row <= 2) {
      return cfg.RENDER_ALIEN_COLOR_MID;
    }
    return cfg.RENDER_ALIEN_COLOR_LOW;
  }

  function drawAliens(c, cfg, aliens) {
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      drawRect(c, a, alienColor(cfg, a));
    }
  }

  function drawBullets(c, bullets, color) {
    for (var i = 0; i < bullets.length; i++) {
      drawRect(c, bullets[i], color);
    }
  }

  // Each shield cell is drawn at an alpha proportional to its remaining
  // integrity (fully-damaged cells at 0 integrity are skipped entirely, so
  // a destroyed cell reads as an empty gap in the shield).
  function drawShields(c, cfg, shields) {
    for (var si = 0; si < shields.length; si++) {
      var shield = shields[si];
      for (var ci = 0; ci < shield.cells.length; ci++) {
        var integrity = shield.cells[ci];
        if (integrity <= 0) {
          continue;
        }
        var rect = window.SI.Shield.cellRect(shield, ci);
        var alpha = Math.min(1, integrity * cfg.RENDER_SHIELD_DAMAGED_ALPHA_STEP);
        c.globalAlpha = alpha;
        drawRect(c, rect, cfg.RENDER_SHIELD_COLOR);
        c.globalAlpha = 1;
      }
    }
  }

  function drawUfo(c, cfg, ufo) {
    if (!ufo || !ufo.active) {
      return;
    }
    drawRect(c, ufo, cfg.RENDER_UFO_COLOR);
  }

  function drawHud(c, cfg, state) {
    c.fillStyle = cfg.RENDER_HUD_COLOR;
    c.font = cfg.RENDER_HUD_FONT;
    c.textBaseline = 'top';
    var margin = cfg.RENDER_HUD_MARGIN;
    var text =
      'Score: ' + state.score + '   Lives: ' + state.lives + '   Wave: ' + state.wave;
    c.fillText(text, margin, margin);

    if (state.state === 'gameover' || state.state === 'won') {
      var msg = state.state === 'won' ? 'YOU WIN' : 'GAME OVER';
      c.fillStyle = cfg.RENDER_GAMEOVER_COLOR;
      c.font = cfg.RENDER_GAMEOVER_FONT;
      c.textAlign = 'center';
      c.fillText(msg, cfg.RENDER_WIDTH / 2, cfg.RENDER_HEIGHT / 2);
      c.textAlign = 'left';
    }
  }

  function draw(state) {
    try {
      var c = getContext();
      if (!c || !state) {
        return;
      }
      var cfg = window.SI.Config;

      c.fillStyle = cfg.RENDER_BG_COLOR;
      c.fillRect(0, 0, cfg.RENDER_WIDTH, cfg.RENDER_HEIGHT);

      if (state.shields) {
        drawShields(c, cfg, state.shields);
      }
      if (state.player) {
        drawRect(c, state.player, cfg.RENDER_PLAYER_COLOR);
      }
      if (state.aliens) {
        drawAliens(c, cfg, state.aliens);
      }
      if (state.playerBullets) {
        drawBullets(c, state.playerBullets, cfg.RENDER_PLAYER_BULLET_COLOR);
      }
      if (state.alienBullets) {
        drawBullets(c, state.alienBullets, cfg.RENDER_ALIEN_BULLET_COLOR);
      }
      drawUfo(c, cfg, state.ufo);
      drawHud(c, cfg, state);
    } catch (e) {
      // Rendering must never crash the rAF loop (slice-06 contract).
      if (typeof console !== 'undefined' && console.error) {
        console.error('SI.Renderer.draw failed:', e);
      }
    }
  }

  window.SI.Renderer = {
    draw: draw,
  };
})();
