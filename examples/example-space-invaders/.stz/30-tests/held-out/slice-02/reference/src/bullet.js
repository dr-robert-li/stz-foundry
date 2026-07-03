// SI.Bullet — player-bullet factory + straight-line (vertical) update (P1).
(function () {
  var WIDTH = 4;
  var HEIGHT = 10;
  var SPEED_PX = 10; // fixed per-update-step upward displacement.

  function spawnPlayerBullet(player) {
    return {
      x: player.x + player.width / 2 - WIDTH / 2,
      y: player.y - HEIGHT,
      width: WIDTH,
      height: HEIGHT,
    };
  }

  // Pure: returns a new bullet one step further along a straight line
  // (upward, toward the aliens). Does not mutate its argument.
  function step(bullet) {
    return {
      x: bullet.x,
      y: bullet.y - SPEED_PX,
      width: bullet.width,
      height: bullet.height,
    };
  }

  window.SI.Bullet = {
    spawnPlayerBullet: spawnPlayerBullet,
    step: step,
  };
})();
