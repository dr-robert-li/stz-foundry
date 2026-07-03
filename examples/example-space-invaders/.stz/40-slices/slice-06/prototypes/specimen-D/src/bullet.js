// SI.Bullet — player-bullet + alien-bullet factories, straight-line
// fixed-step movement (shared by both, opposite directions). No canvas
// deps. window.SI is bootstrapped once in rng.js (ADR-001). Alien-bullet
// sizing/speed come from SI.Config (slice-04, ADR-003 constants rule).
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

  // spawnAlienBullet — factory for the alien-bullet variant (slice-04, P3).
  // Same plain {x,y,width,height} shape as a player bullet (live by array
  // membership alone, per the TEST-FACING API), spawned at the bottom-
  // center of `shooter` (an alien or alien-shaped {x,y,width,height}),
  // travelling downward.
  function spawnAlienBullet(shooter) {
    var cfg = window.SI.Config;
    var w = cfg.ALIEN_BULLET_WIDTH;
    var h = cfg.ALIEN_BULLET_HEIGHT;
    return {
      x: shooter.x + shooter.width / 2 - w / 2,
      y: shooter.y + shooter.height,
      width: w,
      height: h,
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
    spawnAlienBullet: spawnAlienBullet,
    updateBullets: updateBullets,
  };
})();
