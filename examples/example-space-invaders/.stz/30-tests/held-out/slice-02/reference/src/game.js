// SI.Game — state machine + orchestration for slice-02 (P1: move/shoot/kill).
// Depends on SI.RNG, SI.Collision, SI.Config, SI.Player, SI.Bullet, SI.Alien.
// TEST-FACING API (per slice-02 manifest): SI.Game.init(opts?), SI.Game.input
// = {left,right,fire}, SI.Game.update(dt) advances exactly one fixed step.
// window.gameState is set once here (no main.js in this slice yet) and is
// the same live object as SI.Game.state, mutated in place per ADR-003.
(function () {
  var state = {
    state: 'ready',
    score: 0,
    lives: 3,
    wave: 1,
    fps: 60,
    player: { x: 0, y: 0, width: 0, height: 0 },
    aliens: [],
    playerBullets: [],
    alienBullets: [],
    shields: [],
    ufo: { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 },
  };

  var input = { left: false, right: false, fire: false };
  var prevFire = false;
  var width = 800;
  var height = 600;

  function init(opts) {
    opts = opts || {};
    width = opts.width || 800;
    height = opts.height || 600;
    if (opts.seed !== undefined) window.SI.RNG.seed(opts.seed);

    state.state = 'playing';
    state.score = 0;
    state.lives = window.SI.Config.STARTING_LIVES;
    state.wave = 1;
    state.fps = 60;
    state.player = window.SI.Player.create(width, height);
    state.aliens = window.SI.Alien.createGrid(width);
    state.playerBullets = [];
    state.alienBullets = [];
    state.shields = [];
    state.ufo = { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 };

    input.left = false;
    input.right = false;
    input.fire = false;
    prevFire = false;
  }

  // Adapts an ADR-003-shaped entity ({x,y,width,height,...}) to the box
  // shape SI.Collision.aabbOverlap actually reads ({x,y,w,h}) — collision.js
  // is frozen foundation and is not touched by this slice.
  function toBox(e) {
    return { x: e.x, y: e.y, w: e.width, h: e.height };
  }

  function update(dt) {
    if (state.state !== 'playing') return;

    window.SI.Player.move(state.player, input, width);

    var firePressed = input.fire && !prevFire;
    prevFire = input.fire;
    if (firePressed) {
      state.playerBullets.push(window.SI.Bullet.spawnPlayerBullet(state.player));
    }

    state.playerBullets = state.playerBullets.map(window.SI.Bullet.step);

    var remainingAliens = [];
    var consumedBulletIdx = {};
    for (var i = 0; i < state.aliens.length; i++) {
      var alien = state.aliens[i];
      var hitBy = -1;
      for (var j = 0; j < state.playerBullets.length; j++) {
        if (consumedBulletIdx[j]) continue;
        if (window.SI.Collision.aabbOverlap(toBox(state.playerBullets[j]), toBox(alien))) {
          hitBy = j;
          break;
        }
      }
      if (hitBy !== -1) {
        consumedBulletIdx[hitBy] = true;
        state.score += alien.points;
      } else {
        remainingAliens.push(alien);
      }
    }
    state.aliens = remainingAliens;
    state.playerBullets = state.playerBullets.filter(function (b, idx) {
      return !consumedBulletIdx[idx];
    });
  }

  window.SI.Game = {
    init: init,
    input: input,
    update: update,
    state: state,
  };

  // No main.js in this slice yet: the bundle itself is responsible for
  // wiring window.gameState to the live state object per the TEST-FACING API.
  window.gameState = state;
})();
