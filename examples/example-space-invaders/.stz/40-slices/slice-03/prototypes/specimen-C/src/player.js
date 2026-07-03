// SI.Player — player ship: create + fixed-step move/clamp. No canvas deps.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var WIDTH = 40;
  var HEIGHT = 20;
  var SPEED = 5; // px per fixed step (NOT scaled by dt — movement is a constant step)
  var MARGIN_BOTTOM = 30;

  function createPlayer(gameWidth, gameHeight) {
    return {
      x: (gameWidth - WIDTH) / 2,
      y: gameHeight - HEIGHT - MARGIN_BOTTOM,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // Moves the player per input flags by a constant per-step delta, then
  // clamps x to [0, gameWidth - player.width]. Mutates player in place.
  function updatePlayer(player, input, gameWidth) {
    if (input.left) {
      player.x -= SPEED;
    }
    if (input.right) {
      player.x += SPEED;
    }

    if (player.x < 0) {
      player.x = 0;
    }
    var maxX = gameWidth - player.width;
    if (player.x > maxX) {
      player.x = maxX;
    }
  }

  window.SI.Player = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    create: createPlayer,
    update: updatePlayer,
  };
})();
