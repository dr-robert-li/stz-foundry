// SI.Bullet — player-bullet + alien-bullet factories and straight-line
// fixed-step movement. No canvas deps. window.SI is bootstrapped once in
// rng.js (ADR-001).
//
// slice-04 (P3) note: an alien bullet is the SAME plain {x,y,width,height}
// shape as a player bullet — there is no private velocity/alive/kind field.
// A bullet is LIVE purely by membership in its array (playerBullets or
// alienBullets); direction is imposed by the caller when it calls
// updateBullets(arr, dy).
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

  // Alien bullet: spawns just below the firing alien's bottom edge, centered
  // on it. Same bare {x,y,width,height} shape as a player bullet — the caller
  // moves it downward via updateBullets(arr, +ALIEN_BULLET_SPEED).
  function spawnAlienBullet(alien) {
    return {
      x: alien.x + alien.width / 2 - WIDTH / 2,
      y: alien.y + alien.height,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // Moves every {x,y,width,height}-shaped bullet in `bullets` by a constant
  // per-step delta (dy; negative = up for player, positive = down for alien).
  // Membership in the array is the only requirement for a bullet to be live —
  // no private field is read or required. Mutates entries in place; returns
  // the same array (caller does wholesale replacement via filter, per ADR-003).
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
