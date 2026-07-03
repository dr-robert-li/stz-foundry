// SI.Player — the player ship: a plain state record plus pure movement helpers.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  const SHIP_WIDTH = 30;
  const SHIP_HEIGHT = 16;
  // Fixed per-tick horizontal step. Per ADR-002 (fixed timestep) one update() is
  // one tick, so movement is a constant delta, NOT scaled by the dt argument.
  const STEP_PX = 5;
  const BOTTOM_MARGIN = 24;

  // create — a horizontally-centered ship resting near the bottom of the field.
  function create(fieldWidth, fieldHeight) {
    return {
      x: (fieldWidth - SHIP_WIDTH) / 2,
      y: fieldHeight - SHIP_HEIGHT - BOTTOM_MARGIN,
      width: SHIP_WIDTH,
      height: SHIP_HEIGHT,
      vx: 0,
    };
  }

  // clampX — keep the ship fully inside [0, fieldWidth - width]. Explicit
  // branches (not Math.max/Math.min) so the boundary is impossible to misread:
  // touching a wall parks the ship exactly on it.
  function clampX(x, width, fieldWidth) {
    const maxX = fieldWidth - width;
    if (x < 0) {
      return 0;
    }
    if (x > maxX) {
      return maxX;
    }
    return x;
  }

  // move — advance one fixed tick in `direction` (-1 left, 0 still, 1 right),
  // then clamp. Magnitude is a constant STEP_PX, independent of dt. Mutates.
  function move(player, direction, fieldWidth) {
    player.vx = direction * STEP_PX;
    player.x = clampX(player.x + player.vx, player.width, fieldWidth);
    return player;
  }

  window.SI.Player = {
    SHIP_WIDTH: SHIP_WIDTH,
    SHIP_HEIGHT: SHIP_HEIGHT,
    STEP_PX: STEP_PX,
    create: create,
    clampX: clampX,
    move: move,
  };
})();
