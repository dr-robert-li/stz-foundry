// SI.Game — state machine + orchestration for slice-02
// (player-move-shoot-kill). No main.js in this slice, so game.js itself
// bootstraps window.gameState (ADR-003: same object reference throughout,
// mutated in place; arrays replaced wholesale).
// update(dt) always advances exactly one fixed step; every movement is a
// constant per-step delta pulled from SI.Config, never scaled by dt
// (ADR-002).
(function () {
  var cfg = window.SI.Config;

  var canvasWidth = cfg.CANVAS_WIDTH;
  var canvasHeight = cfg.CANVAS_HEIGHT;
  var prevFire = false; // closure-only edge-detect flag, not test-facing state

  var state = {
    state: 'ready',
    score: 0,
    player: null,
    aliens: [],
    playerBullets: [],
    alienBullets: [],
  };

  window.SI.Game = window.SI.Game || {};
  window.SI.Game.state = state;
  window.gameState = state;

  var input = { left: false, right: false, fire: false };
  window.SI.Game.input = input;

  function init(opts) {
    opts = opts || {};
    canvasWidth = opts.width || cfg.CANVAS_WIDTH;
    canvasHeight = opts.height || cfg.CANVAS_HEIGHT;
    if (opts.seed !== undefined) {
      window.SI.RNG.seed(opts.seed);
    }

    prevFire = false;
    input.left = false;
    input.right = false;
    input.fire = false;

    state.state = 'playing';
    state.score = 0;
    state.player = window.SI.Player.create(canvasWidth, canvasHeight);
    state.aliens = window.SI.Alien.createGrid();
    state.playerBullets = [];
    state.alienBullets = [];
  }

  // SI.Collision.aabbOverlap reads {x,y,w,h}; gameState entities carry
  // {x,y,width,height} per the ADR-003 field contract. Bridge the two
  // shapes here instead of changing either module's contract.
  function toBox(entity) {
    return { x: entity.x, y: entity.y, w: entity.width, h: entity.height };
  }

  function update(dt) {
    state.player = window.SI.Player.move(state.player, input, canvasWidth);

    var bullets = state.playerBullets;

    if (input.fire && !prevFire) {
      bullets = bullets.concat([
        window.SI.Bullet.createPlayerBullet(state.player),
      ]);
    }
    prevFire = input.fire;

    // Straight-line motion, then drop bullets that have left the top edge.
    bullets = bullets.map(window.SI.Bullet.step).filter(function (b) {
      return b.y + b.height > 0;
    });

    // Bullet-vs-alien collision: every bullet in the array is live and
    // collidable regardless of how it got there (factory or externally
    // injected bare {x,y,width,height} object) — no private field gates
    // this check.
    var aliens = state.aliens;
    var survivingBullets = [];

    for (var i = 0; i < bullets.length; i++) {
      var bullet = bullets[i];
      var hitIndex = -1;
      for (var j = 0; j < aliens.length; j++) {
        if (window.SI.Collision.aabbOverlap(toBox(bullet), toBox(aliens[j]))) {
          hitIndex = j;
          break;
        }
      }
      if (hitIndex === -1) {
        survivingBullets.push(bullet);
      } else {
        state.score += aliens[hitIndex].points;
        aliens = aliens.slice(0, hitIndex).concat(aliens.slice(hitIndex + 1));
      }
    }

    state.playerBullets = survivingBullets;
    state.aliens = aliens;
  }

  window.SI.Game.init = init;
  window.SI.Game.update = update;
})();
