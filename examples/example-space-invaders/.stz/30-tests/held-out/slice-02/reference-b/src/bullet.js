// SI.Bullet — player bullets: a factory plus straight-line vertical motion.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
//
// A player bullet IS just its documented shape {x, y, width, height}: any such
// object present in gameState.playerBullets is a live, collidable bullet (per
// ADR-003 the array IS the state). Motion is applied by mutating y; nothing
// here adds a private field that collidability depends on.
(function () {
  const WIDTH = 3;
  const HEIGHT = 12;
  // Fixed per-tick upward step (constant, not dt-scaled — ADR-002 fixed tick).
  const STEP_PX = 8;

  // spawnFromPlayer — a bare {x,y,width,height} bullet emitted from the muzzle
  // (top-center of the ship). No velocity/marker fields: the array membership
  // alone makes it live.
  function spawnFromPlayer(player) {
    return {
      x: player.x + player.width / 2 - WIDTH / 2,
      y: player.y - HEIGHT,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // advance — one fixed tick of straight-line upward motion. Mutates y in place.
  function advance(bullet) {
    bullet.y -= STEP_PX;
    return bullet;
  }

  // offTop — has the bullet fully left the top of the field?
  function offTop(bullet) {
    return bullet.y + bullet.height < 0;
  }

  window.SI.Bullet = {
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    STEP_PX: STEP_PX,
    spawnFromPlayer: spawnFromPlayer,
    advance: advance,
    offTop: offTop,
  };
})();
