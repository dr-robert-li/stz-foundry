// SI.Player — player ship creation & movement. Pure functions: given a
// player/input/bounds, return a *new* player object; caller decides where to
// store it (SI.Game keeps the live window.gameState.player field updated).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  // Extend the shared SI.Config (defined in config.js, loaded earlier) with
  // player-specific constants rather than scattering magic numbers here.
  window.SI.Config.PLAYER_WIDTH = 40;
  window.SI.Config.PLAYER_HEIGHT = 20;
  window.SI.Config.PLAYER_MARGIN_BOTTOM = 30;
  // Constant per-fixed-step displacement — never multiplied by dt, per
  // ADR-002 (fixed timestep means "per step" already implies "per time").
  window.SI.Config.PLAYER_SPEED = 4;

  function create(width, height) {
    var cfg = window.SI.Config;
    return {
      x: (width - cfg.PLAYER_WIDTH) / 2,
      y: height - cfg.PLAYER_MARGIN_BOTTOM - cfg.PLAYER_HEIGHT,
      width: cfg.PLAYER_WIDTH,
      height: cfg.PLAYER_HEIGHT,
    };
  }

  function move(player, input, width) {
    var cfg = window.SI.Config;
    var dx = (input.right ? cfg.PLAYER_SPEED : 0) - (input.left ? cfg.PLAYER_SPEED : 0);
    var nextX = player.x + dx;
    var maxX = width - player.width;
    var clampedX = Math.min(Math.max(nextX, 0), maxX);
    return Object.assign({}, player, { x: clampedX });
  }

  window.SI.Player = {
    create: create,
    move: move,
  };
})();
