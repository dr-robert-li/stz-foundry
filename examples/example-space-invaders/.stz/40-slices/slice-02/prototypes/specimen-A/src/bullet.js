// SI.Bullet — player-bullet factory + straight-line fixed-step movement.
// No canvas deps. window.SI is bootstrapped once in rng.js (ADR-001).
(function () {
  var WIDTH = 4;
  var HEIGHT = 10;
  var SPEED = 8; // px per fixed step (NOT scaled by dt), travels upward (-y)

  function spawnPlayerBullet(player) {
    return {
      x: player.x + player.width / 2 - WIDTH / 2,
      y: player.y - HEIGHT,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // Moves every {x,y,width,height}-shaped bullet in `bullets` by a constant
  // per-step delta (dy, negative = up). Membership in the array is the only
  // requirement for a bullet to be live — no private velocity/alive field is
  // read or required. Mutates entries in place; returns the same array
  // (caller is responsible for wholesale array replacement via filter, per
  // ADR-003).
  function updateBullets(bullets, dy) {
    for (var i = 0; i < bullets.length; i++) {
      bullets[i].y += dy;
    }
    return bullets;
  }

  window.SI.Bullet = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    SPEED: SPEED,
    spawnPlayerBullet: spawnPlayerBullet,
    updateBullets: updateBullets,
  };
})();
