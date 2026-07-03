// SI.Game — state machine + orchestration, extended for slice-03 (P2: rigid-
// block march, edge-triggered drop+reverse, count-driven interval shrink) on
// top of slice-02's move/shoot/kill. Strategy: imperative index-loop update
// over struct-of-arrays-style entity arrays (plain objects, indexed
// for-loops, no functional chains in the hot update path).
//
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config, SI.Player, SI.Bullet, SI.Alien, SI.Collision, SI.RNG.
(function () {
  var DEFAULT_WIDTH = 800;
  var DEFAULT_HEIGHT = 600;

  // March tuning — internal, not part of the gameState field contract or the
  // TEST-FACING API. Only SI.Alien.marchInterval(aliveCount) is test-facing;
  // direction/pending-drop/step-size are observable only via alien positions
  // across steps (per the slice-03 contract).
  var STEP_DX = 10; // px per horizontal march event
  var ROW_STEP = 20; // px the whole grid drops on an edge-triggered reversal

  // Internal (not part of the gameState field contract) — remembered so
  // update() can clamp the player without gameState carrying extra fields
  // beyond what ADR-003/conventions.md specify.
  var gameWidth = DEFAULT_WIDTH;
  var gameHeight = DEFAULT_HEIGHT;

  // fire is edge-triggered: exactly one bullet spawns per press-edge
  // (false -> true transition), tracked across update() calls.
  var prevFire = false;

  // March state — driven purely by update() call COUNT (never wall-clock),
  // per the slice-03 contract's "internal accumulated-step counter" - a
  // monotonically increasing counter of update() calls since init(), never
  // reset mid-run. marchDirection is +1 (right) or -1 (left). Using
  // (counter % marchInterval(currentAliveCount) === 0) rather than a
  // separately-tracked countdown means the cadence re-derives itself from
  // the CURRENT alive count on every single step, so it responds instantly
  // if the alive count changes for any reason (a kill this frame, or a
  // test/tool directly mutating gameState.aliens) rather than only at the
  // next already-scheduled event.
  var marchDirection = 1;
  var marchStepCounter = 0;

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

    marchDirection = 1;
    marchStepCounter = 0;

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

  // Rigid-block march: every alive alien moves by the SAME per-step delta.
  // marchStepCounter (never wall-clock, never reset mid-run) advances by 1
  // every update() call; a march event fires when it's an exact multiple of
  // SI.Alien.marchInterval(current alive count) - recomputed fresh every
  // step from the CURRENT alive count, so the interval genuinely shrinks as
  // aliens die over the course of a wave. On an event: if moving one more
  // STEP_DX in the current direction would push any alive alien past a
  // screen edge, the grid drops by ROW_STEP (no horizontal shift that event)
  // and direction flips for good, so the very next march event moves
  // horizontally in the new direction. Otherwise the whole block simply
  // shifts by direction*STEP_DX.
  function marchStep(state) {
    var aliens = state.aliens;
    if (aliens.length === 0) {
      return;
    }

    marchStepCounter += 1;
    var interval = window.SI.Alien.marchInterval(aliens.length);
    if (marchStepCounter % interval !== 0) {
      return;
    }

    var dx = marchDirection * STEP_DX;
    var wouldExceedEdge = false;
    for (var i = 0; i < aliens.length; i++) {
      var nx = aliens[i].x + dx;
      if (nx < 0 || nx + aliens[i].width > gameWidth) {
        wouldExceedEdge = true;
        break;
      }
    }

    if (wouldExceedEdge) {
      for (var j = 0; j < aliens.length; j++) {
        aliens[j].y += ROW_STEP;
      }
      marchDirection = -marchDirection;
    } else {
      for (var k = 0; k < aliens.length; k++) {
        aliens[k].x += dx;
      }
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn/march logic here is a
  // constant per-step delta driven by CALL COUNT, never scaled by dt's
  // magnitude.
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

    marchStep(state);

    resolveBulletAlienCollisions(state);
  }

  window.SI.Game = window.SI.Game || {};
  window.SI.Game.state = getOrCreateState();
  window.gameState = window.SI.Game.state;
  window.SI.Game.input = { left: false, right: false, fire: false };
  window.SI.Game.init = init;
  window.SI.Game.update = update;
})();
