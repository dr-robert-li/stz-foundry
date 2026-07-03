// SI.Bullet — player-bullet factory + straight-line motion. game.js keeps
// the authoritative array as plain {x,y,width,height} objects (per
// ADR-003 and the CRITICAL array-membership rule: any bare object present
// in gameState.playerBullets is a live bullet, not just ones spawned via
// this factory), so this module only supplies construction + a pure
// step helper, never a "am I real" flag.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  function Bullet(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  Bullet.prototype.toState = function () {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  };

  // Builds a player bullet centered above the player's current position.
  function spawnPlayerBullet(player, bulletWidth, bulletHeight) {
    var x = player.x + player.width / 2 - bulletWidth / 2;
    var y = player.y - bulletHeight;
    return new Bullet(x, y, bulletWidth, bulletHeight);
  }

  // Pure step: constant per-step delta (never *dt), moving up (-y).
  // Operates on any plain {x,y,width,height} object, not just Bullet
  // instances, so externally-injected bare bullets move identically.
  function stepPlayerBullet(bullet, speed) {
    return {
      x: bullet.x,
      y: bullet.y - speed,
      width: bullet.width,
      height: bullet.height,
    };
  }

  window.SI.Bullet = Bullet;
  window.SI.Bullet.spawnPlayerBullet = spawnPlayerBullet;
  window.SI.Bullet.stepPlayerBullet = stepPlayerBullet;
})();
