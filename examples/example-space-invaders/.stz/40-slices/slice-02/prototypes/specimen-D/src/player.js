// SI.Player — player entity: creation + movement. Movement uses a constant
// per-fixed-step delta from SI.Config (never scaled by dt, per ADR-002) and
// clamps x to [0, canvasWidth - player.width].
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  function create(canvasWidth, canvasHeight) {
    var cfg = window.SI.Config;
    var width = cfg.PLAYER_WIDTH;
    var height = cfg.PLAYER_HEIGHT;
    return {
      x: (canvasWidth - width) / 2,
      y: canvasHeight - cfg.PLAYER_Y_MARGIN - height,
      width: width,
      height: height,
    };
  }

  // Returns a new player object (wholesale replace, per ADR-003) moved by a
  // constant per-step delta according to input.left/input.right, clamped to
  // the canvas bounds.
  function move(player, input, canvasWidth) {
    var step = window.SI.Config.PLAYER_STEP;
    var x = player.x;
    if (input.left) x -= step;
    if (input.right) x += step;

    var minX = 0;
    var maxX = canvasWidth - player.width;
    if (x < minX) x = minX;
    if (x > maxX) x = maxX;

    return { x: x, y: player.y, width: player.width, height: player.height };
  }

  window.SI.Player = {
    create: create,
    move: move,
  };
})();
