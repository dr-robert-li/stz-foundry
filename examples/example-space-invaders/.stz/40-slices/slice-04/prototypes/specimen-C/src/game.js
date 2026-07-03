// SI.Game — state machine + orchestration for slice-02/03/04 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality). Strategy: P1/P2 kept as the original imperative
// index-loop update over struct-of-arrays-style entity arrays; the P3
// additions below (alien fire, alien-bullet-vs-player collision, alien
// bullet motion, gameover check) are written as small pure/functional
// helpers (map/filter/reduce) over `state`, per this slice's assigned
// specimen strategy.
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

  // March state (slice-03) — internal only, per the contract ("grid
  // horizontal direction and the pending drop are internal SI.Game/SI.Alien
  // state observable only via alien positions across steps"). Driven
  // entirely by an accumulated update()-call counter, never wall-clock, so
  // repeated update() calls reproduce the march exactly (dt's magnitude is
  // never read).
  var marchStepCounter = 0; // fixed-steps elapsed since the last march move
  var marchDirection = 1; // +1 = right, -1 = left
  var marchPendingDrop = false; // true = next march step drops+reverses instead of moving horizontally

  // Alien-fire state (slice-04, P3) — internal only, same "accumulated
  // update()-call counter, never wall-clock" pattern as marchStepCounter,
  // so N identical update() calls always fire at the same steps for a
  // given seed.
  var fireStepCounter = 0; // fixed-steps elapsed since the last fire event

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
    marchPendingDrop = false;
    fireStepCounter = 0;

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

  // Rigid-block march: every alive alien moves by the SAME x-delta each
  // march step (never per-alien speed). Cadence is an internal
  // accumulated-step counter compared against SI.Alien.marchInterval(
  // aliveCount) — never wall-clock, never scaled by dt's magnitude, so N
  // identical update() calls always reproduce the same march exactly.
  //
  // On the march step where any alien would touch a screen edge, that
  // horizontal move still happens (using the direction in effect), but a
  // drop is queued. The very next march step, instead of moving
  // horizontally, the whole grid steps down by ALIEN_ROW_STEP and the
  // horizontal direction reverses — both together, per the contract's "the
  // whole grid steps down ... and ... reverses on the very next step."
  function marchGrid(state) {
    var aliens = state.aliens;
    if (aliens.length === 0) {
      return; // nothing to march
    }

    marchStepCounter++;
    var interval = window.SI.Alien.marchInterval(aliens.length);
    if (marchStepCounter < interval) {
      return; // not due yet
    }
    marchStepCounter = 0;

    if (marchPendingDrop) {
      var rowStep = window.SI.Config.ALIEN_ROW_STEP;
      for (var i = 0; i < aliens.length; i++) {
        aliens[i].y += rowStep;
      }
      marchPendingDrop = false;
      marchDirection = -marchDirection;
      return;
    }

    var dx = marchDirection * window.SI.Config.ALIEN_STEP_X;
    for (var j = 0; j < aliens.length; j++) {
      aliens[j].x += dx;
    }

    var touchesEdge = false;
    for (var k = 0; k < aliens.length; k++) {
      var a = aliens[k];
      if (a.x <= 0 || a.x + a.width >= gameWidth) {
        touchesEdge = true;
        break;
      }
    }
    if (touchesEdge) {
      marchPendingDrop = true;
    }
  }

  // Alien fire (slice-04, P3) — PURE-ish orchestration: every
  // ALIEN_FIRE_INTERVAL_STEPS fixed steps, one column is chosen via
  // exactly one SI.RNG.next() call (so seeding makes firing deterministic)
  // and the front-most alive alien in that column spawns an alien bullet.
  // Wholesale array replacement (concat, not push) per this specimen's
  // functional-style convention.
  function resolveAlienFire(state) {
    if (state.aliens.length === 0) {
      return; // nothing left to fire
    }

    fireStepCounter++;
    var interval = window.SI.Config.ALIEN_FIRE_INTERVAL_STEPS;
    if (fireStepCounter < interval) {
      return; // not due yet
    }
    fireStepCounter = 0;

    var randomValue = window.SI.RNG.next();
    var firingAlien = window.SI.Alien.pickFiringAlien(state.aliens, randomValue);
    if (firingAlien) {
      state.alienBullets = state.alienBullets.concat([
        window.SI.Bullet.spawnAlienBullet(firingAlien),
      ]);
    }
  }

  // alienBullet-vs-player collision (slice-04, P3) — checked on PRE-MOTION
  // positions (before moveAlienBullets runs this same step), so a bullet
  // injected directly into gameState.alienBullets already overlapping the
  // player collides on the very update() call that observes it, even
  // before any movement is applied. Every alien bullet overlapping the
  // player this step is consumed (filter) and lives decrements by exactly
  // 1 per bullet consumed (reduce), clamped so lives never goes negative
  // (gameover is keyed off lives === 0, not lives < 0).
  function resolveAlienBulletPlayerCollisions(state) {
    var player = state.player;
    var bullets = state.alienBullets;

    var hitCount = bullets.reduce(function (count, bullet) {
      return window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(player))
        ? count + 1
        : count;
    }, 0);

    state.alienBullets = bullets.filter(function (bullet) {
      return !window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(player));
    });

    if (hitCount > 0) {
      state.lives = Math.max(0, state.lives - hitCount);
    }
  }

  // Moves surviving alien bullets downward by a constant per-step delta
  // (never scaled by dt) and drops any that have travelled off the bottom
  // of the play field. Runs AFTER collision resolution so this step's
  // motion never masks a same-step player hit.
  function moveAlienBullets(state) {
    window.SI.Bullet.updateBullets(state.alienBullets, window.SI.Config.ALIEN_BULLET_SPEED);
    state.alienBullets = state.alienBullets.filter(function (bullet) {
      return bullet.y < gameHeight;
    });
  }

  // Gameover check (slice-04, P3) — dual trigger: lives exhausted, OR any
  // alive alien (state.aliens is LIVE-by-array-membership, same rule as
  // bullets — dead aliens are already removed) has reached the player's
  // row. `.some` short-circuits on the first match.
  function checkGameOver(state) {
    if (state.lives === 0) {
      state.state = 'gameover';
      return;
    }

    var player = state.player;
    var alienReachedRow = state.aliens.some(function (alien) {
      return alien.y + alien.height >= player.y;
    });
    if (alienReachedRow) {
      state.state = 'gameover';
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  function update(dt) {
    var state = window.SI.Game.state;

    // Terminality guard (slice-04, P3): once gameover, every further
    // update() call is a no-op — lives/score/state stay frozen. Must be
    // the very first thing update() does, before any mutation below.
    if (state.state === 'gameover') {
      return;
    }

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

    marchGrid(state);

    resolveAlienFire(state);
    resolveAlienBulletPlayerCollisions(state);
    moveAlienBullets(state);
    checkGameOver(state);
  }

  window.SI.Game = window.SI.Game || {};
  window.SI.Game.state = getOrCreateState();
  window.gameState = window.SI.Game.state;
  window.SI.Game.input = { left: false, right: false, fire: false };
  window.SI.Game.init = init;
  window.SI.Game.update = update;
})();
