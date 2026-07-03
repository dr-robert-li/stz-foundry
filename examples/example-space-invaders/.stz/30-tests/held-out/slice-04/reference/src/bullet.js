// SI.Bullet — player-bullet + alien-bullet factories, straight-line
// fixed-step movement. No canvas deps. window.SI is bootstrapped once in
// rng.js (ADR-001).
(function () {
  var WIDTH = 4;
  var HEIGHT = 10;
  var SPEED = 8; // px per fixed step (NOT scaled by dt), player bullet travels upward (-y)
  var ALIEN_SPEED = 6; // px per fixed step (NOT scaled by dt), alien bullet travels downward (+y)

  function spawnPlayerBullet(player) {
    return {
      x: player.x + player.width / 2 - WIDTH / 2,
      y: player.y - HEIGHT,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // slice-04: alien-bullet variant. Spawns directly below the given alien
  // (the caller picks which alien fires, per fire-column selection). Same
  // plain {x,y,width,height} shape as a player bullet — LIVE by array
  // membership alone, same rule as playerBullets.
  function spawnAlienBullet(alien) {
    return {
      x: alien.x + alien.width / 2 - WIDTH / 2,
      y: alien.y + alien.height,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // Moves every {x,y,width,height}-shaped bullet in `bullets` by a constant
  // per-step delta (dy, negative = up, positive = down). Membership in the
  // array is the only requirement for a bullet to be live — no private
  // velocity/alive field is read or required. Mutates entries in place;
  // returns the same array (caller is responsible for wholesale array
  // replacement via filter, per ADR-003).
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
    ALIEN_SPEED: ALIEN_SPEED,
    spawnPlayerBullet: spawnPlayerBullet,
    spawnAlienBullet: spawnAlienBullet,
    updateBullets: updateBullets,
  };
})();
