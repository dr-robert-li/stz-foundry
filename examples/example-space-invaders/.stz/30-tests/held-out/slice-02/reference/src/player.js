// SI.Player — position factory + horizontal movement/clamp (P1).
// Depends on nothing but SI.Config (grid/timestep constants), per
// conventions.md's dependency-direction table (entities/* <- collision.js,
// rng.js only; this module needs neither directly).
(function () {
  var WIDTH = 40;
  var HEIGHT = 20;
  var STEP_PX = 6; // fixed per-update-step displacement while held.
  // ponytail: movement is a fixed px-per-call step, not speed*dt — matches
  // the TEST-FACING contract "update(dt) advances exactly one fixed step"
  // (the dt argument must not scale how far anything moves).

  function create(width, height) {
    return {
      x: (width - WIDTH) / 2,
      y: height - HEIGHT - 20,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // Mutates player in place (matches ADR-003: fields mutated, not the
  // top-level state object reassigned) and clamps to [0, width - player.width].
  function move(player, input, width) {
    if (input.left) player.x -= STEP_PX;
    if (input.right) player.x += STEP_PX;

    var maxX = width - player.width;
    if (player.x < 0) player.x = 0;
    if (player.x > maxX) player.x = maxX;
  }

  window.SI.Player = {
    create: create,
    move: move,
  };
})();
