// SI.Player — player-ship entity. Small class with a movement method;
// game.js reads/writes plain state via toState(), per ADR-003 (gameState
// entities must stay plain, serializable {x,y,width,height} objects).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  function Player(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  // Moves by a constant per-step delta (never scaled by dt, per contract)
  // and clamps in place to [0, boundsWidth - width].
  Player.prototype.moveAndClamp = function (dx, boundsWidth) {
    this.x += dx;
    if (this.x < 0) {
      this.x = 0;
    }
    var maxX = boundsWidth - this.width;
    if (this.x > maxX) {
      this.x = maxX;
    }
  };

  Player.prototype.toState = function () {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  };

  window.SI.Player = Player;
})();
