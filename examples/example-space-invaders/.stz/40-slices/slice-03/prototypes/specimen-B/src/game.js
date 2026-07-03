// SI.Game — state machine + orchestration for slice-03 (P1: move, shoot,
// kill; P2: rigid-block alien march with edge-triggered drop/reverse).
// Strategy: imperative index-loop update over struct-of-arrays-style entity
// arrays (plain objects, indexed for-loops, no functional chains in the hot
// update path).
//
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config, SI.Player, SI.Bullet, SI.Alien, SI.Collision, SI.RNG.
(function () {
  var DEFAULT_WIDTH = 800;
  var DEFAULT_HEIGHT = 600;

  // Internal (not part of the gameState field contract) — remembered so
  // update() can clamp the player without gameState carrying extra fields
  // beyond what ADR-003/conventions.md specify.
  var gameWidth = DEFAULT_WIDTH;
  var gameHeight = DEFAULT_HEIGHT;

  // fire is edge-triggered: exactly one bullet spawns per press-edge
  // (false -> true transition), tracked across update() calls.
  var prevFire = false;

  // March state (P2), internal to SI.Game — observable only via alien
  // positions across update() calls, per the slice-03 contract.
  // marchStepCounter: fixed-step accumulator counted in update() calls,
  //   NEVER wall-clock; a march move fires once it reaches marchInterval().
  // marchDirection: +1 (right) or -1 (left), applied to MARCH_DX.
  // pendingDrop: true once an edge contact has been anticipated; the very
  //   next march step performs the row-step-down and flips marchDirection.
  var marchStepCounter = 0;
  var marchDirection = 1;
  var pendingDrop = false;

  function getOrCreateState() {
    // window.gameState may already exist (e.g. the build's index.html
    // bootstrap stub, or a prior init()) — reuse that exact object so the
    // live reference contract (ADR-003) holds across re-init. Never
    // reassign window.gameState to a brand-new object after the first call.
    var state = window.gameState;
    if (!state || typeof state !== 'object') {
      state = {};
    }
    return state;
  }

  function init(opts) {
    opts = opts || {};
    gameWidth = opts.width || DEFAULT_WIDTH;
    gameHeight = opts.height || DEFAULT_HEIGHT;

    if (typeof opts.seed === 'number') {
      window.SI.RNG.seed(opts.seed);
    }

    var state = getOrCreateState();

    // Full reset, in place — every field the contract requires is
    // (re)assigned here so a re-init after prior mutation is a clean slate.
    state.state = 'playing';
    state.score = 0;
    state.lives = window.SI.Config.STARTING_LIVES;
    state.wave = 1;
    state.fps = 60;
    state.player = window.SI.Player.create(gameWidth, gameHeight);
    state.aliens = window.SI.Alien.createGrid();
    state.playerBullets = [];
    state.alienBullets = [];
    state.shields = [];
    state.ufo = { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 };

    window.gameState = state;

    window.SI.Game.state = state;
    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;
    prevFire = false;

    marchStepCounter = 0;
    marchDirection = 1;
    pendingDrop = false;

    return state;
  }

  // Bridges an {x,y,width,height} entity into the {x,y,w,h} shape
  // SI.Collision.aabbOverlap reads, without mutating the gameState entity.
  function toAabb(entity) {
    return { x: entity.x, y: entity.y, w: entity.width, h: entity.height };
  }

  // Bullet-vs-alien collision: any {x,y,width,height} object present in
  // playerBullets is treated as a live collidable bullet purely by array
  // membership — no private velocity/alive field is required or read.
  function resolveBulletAlienCollisions(state) {
    var aliens = state.aliens;
    var bullets = state.playerBullets;
    var survivingAliens = [];
    var deadBulletIndex = {}; // set of bullet indices consumed this step

    for (var i = 0; i < aliens.length; i++) {
      var alien = aliens[i];
      var hitBulletIdx = -1;

      for (var j = 0; j < bullets.length; j++) {
        if (deadBulletIndex[j]) {
          continue; // already consumed hitting an earlier alien this step
        }
        if (window.SI.Collision.aabbOverlap(toAabb(bullets[j]), toAabb(alien))) {
          hitBulletIdx = j;
          break;
        }
      }

      if (hitBulletIdx === -1) {
        survivingAliens.push(alien);
      } else {
        state.score += alien.points;
        deadBulletIndex[hitBulletIdx] = true;
      }
    }

    var survivingBullets = [];
    for (var k = 0; k < bullets.length; k++) {
      if (!deadBulletIndex[k]) {
        survivingBullets.push(bullets[k]);
      }
    }

    state.aliens = survivingAliens;
    state.playerBullets = survivingBullets;
  }

  // Advances the alien grid march by at most one march move (P2). Driven
  // solely by marchStepCounter (incremented once per update() call) versus
  // SI.Alien.marchInterval(aliveCount) — never wall-clock/dt-magnitude, so
  // repeated update() calls reproduce the march exactly.
  function advanceMarch(state) {
    var aliveCount = state.aliens.length;
    if (aliveCount === 0) {
      return; // nothing left to march
    }

    marchStepCounter++;
    var interval = window.SI.Alien.marchInterval(aliveCount);
    if (marchStepCounter < interval) {
      return;
    }
    marchStepCounter = 0;

    if (pendingDrop) {
      // The step after an anticipated edge contact: drop the whole grid
      // down by rowStep, then reverse direction for subsequent steps.
      window.SI.Alien.marchStep(state.aliens, 0, window.SI.Alien.ROW_STEP);
      marchDirection = -marchDirection;
      pendingDrop = false;
      return;
    }

    // Edge-anticipation: predict whether this step's dx would carry the
    // grid past the play-area bound; if so, clamp so the grid lands
    // exactly on the boundary and queue the drop-and-reverse for next step.
    var bounds = window.SI.Alien.gridBounds(state.aliens);
    var requestedDx = marchDirection * window.SI.Alien.MARCH_DX;
    var planned = window.SI.Alien.anticipateEdge(bounds, requestedDx, gameWidth);

    window.SI.Alien.marchStep(state.aliens, planned.dx, 0);
    if (planned.hitEdge) {
      pendingDrop = true;
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  function update(dt) {
    var state = window.SI.Game.state;
    var input = window.SI.Game.input;

    window.SI.Player.update(state.player, input, gameWidth);

    var fireEdge = input.fire && !prevFire;
    prevFire = input.fire;
    if (fireEdge) {
      state.playerBullets.push(window.SI.Bullet.spawnPlayerBullet(state.player));
    }

    window.SI.Bullet.updateBullets(state.playerBullets, -window.SI.Bullet.SPEED);

    // Wholesale array replacement (per ADR-003): drop bullets that have
    // travelled off the top of the play field.
    var onScreen = [];
    for (var i = 0; i < state.playerBullets.length; i++) {
      var b = state.playerBullets[i];
      if (b.y + b.height > 0) {
        onScreen.push(b);
      }
    }
    state.playerBullets = onScreen;

    resolveBulletAlienCollisions(state);

    advanceMarch(state);
  }

  window.SI.Game = window.SI.Game || {};
  window.SI.Game.state = getOrCreateState();
  window.gameState = window.SI.Game.state;
  window.SI.Game.input = { left: false, right: false, fire: false };
  window.SI.Game.init = init;
  window.SI.Game.update = update;
})();
