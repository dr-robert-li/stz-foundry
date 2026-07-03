// SI.Bullet — player-bullet factory + straight-line update. This slice has
// no alien fire (static, non-marching grid), so no enemy-bullet factory
// here.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  function createPlayerBullet(player) {
    var cfg = window.SI.Config;
    var width = cfg.BULLET_WIDTH;
    var height = cfg.BULLET_HEIGHT;
    return {
      x: player.x + player.width / 2 - width / 2,
      y: player.y - height,
      width: width,
      height: height,
    };
  }

  // Straight-line motion: a constant per-fixed-step delta (never scaled by
  // dt). Only reads x/y/width/height — any plain {x,y,width,height} object,
  // however it entered the array, moves and collides the same way. No
  // private/internal field gates movement or collidability.
  function step(bullet) {
    return {
      x: bullet.x,
      y: bullet.y - window.SI.Config.BULLET_STEP,
      width: bullet.width,
      height: bullet.height,
    };
  }

  window.SI.Bullet = {
    createPlayerBullet: createPlayerBullet,
    step: step,
  };
})();
