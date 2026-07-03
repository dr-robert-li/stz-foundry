// SI.Bullet — player-bullet factory + straight-line motion. Pure functions
// returning plain {x,y,width,height} objects (the shape window.gameState's
// playerBullets/alienBullets arrays require, per conventions.md) so a bare
// object built anywhere (tests included) behaves identically to one this
// module produced — no hidden/private fields gate collidability.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  window.SI.Config.BULLET_WIDTH = 4;
  window.SI.Config.BULLET_HEIGHT = 12;
  // Constant per-fixed-step displacement — never multiplied by dt.
  window.SI.Config.BULLET_SPEED = 8;

  function spawnFromPlayer(player) {
    var cfg = window.SI.Config;
    return {
      x: player.x + player.width / 2 - cfg.BULLET_WIDTH / 2,
      y: player.y - cfg.BULLET_HEIGHT,
      width: cfg.BULLET_WIDTH,
      height: cfg.BULLET_HEIGHT,
    };
  }

  // Straight-line motion: bullets travel upward toward the aliens.
  function move(bullet) {
    var cfg = window.SI.Config;
    return Object.assign({}, bullet, { y: bullet.y - cfg.BULLET_SPEED });
  }

  function isOnScreen(bullet) {
    return bullet.y + bullet.height > 0;
  }

  window.SI.Bullet = {
    spawnFromPlayer: spawnFromPlayer,
    move: move,
    isOnScreen: isOnScreen,
  };
})();
