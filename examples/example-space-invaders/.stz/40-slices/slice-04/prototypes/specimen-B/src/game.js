// SI.Game — state machine + orchestration for slice-02/03/04 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality). Strategy: imperative index-loop update over
// struct-of-arrays-style entity arrays (plain objects, indexed for-loops,
// no functional chains in the hot update path).
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

  // Alien-fire state (slice-04) — internal only, same accumulated-step-
  // counter pattern as march (never wall-clock), so a given seed + a given
  // number of update() calls always fires from the same columns in the same
  // order.
  var fireStepCounter = 0; // fixed-steps elapsed since the last fire event

  // Terminality (slice-04) — explicit flag, checked first thing in update()
  // so that once gameover is reached, lives/score/state (and everything
  // else) are frozen: no further mutation happens on any subsequent
  // update() call. Cheaper and harder to accidentally bypass than scattering
  // `if (state.state !== 'gameover')` guards through every sub-step.
  var terminal = false;

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
    terminal = false;

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

  // Alien-fire event (slice-04): on the step this interval elapses, one
  // column is chosen from the FRONT (SI.RNG.next() picks a column index in
  // [0, ALIEN_COLS)) and the front (bottom-most) alive alien in that column
  // fires — one SI.RNG.next() call per fire event regardless of whether
  // that column currently has a surviving alien, so a given seed always
  // consumes the RNG sequence identically (deterministic under seed).
  function fireAlienColumn(state) {
    var cfg = window.SI.Config;
    fireStepCounter++;
    if (fireStepCounter < cfg.ALIEN_FIRE_INTERVAL_STEPS) {
      return;
    }
    fireStepCounter = 0;

    var col = Math.floor(window.SI.RNG.next() * cfg.ALIEN_COLS);
    if (col >= cfg.ALIEN_COLS) {
      col = cfg.ALIEN_COLS - 1; // guard: next() is documented [0,1) but clamp defensively
    }

    var shooter = window.SI.Alien.frontInColumn(state.aliens, col);
    if (shooter) {
      state.alienBullets.push(window.SI.Bullet.spawnAlienBullet(shooter));
    }
  }

  // alienBullet-vs-player collision: resolved BEFORE bullet motion is
  // applied this step (contrast with playerBullets, which move-then-
  // resolve) so that a plain {x,y,width,height} object placed directly into
  // gameState.alienBullets by a test — live by array-membership alone, per
  // the TEST-FACING API, exactly like playerBullets — overlapping the
  // player is consumed on this very update() call even though it hasn't
  // travelled yet. Each overlapping bullet decrements lives by exactly 1
  // and is removed; lives is clamped at 0 (never negative) so `lives ===
  // 0` is the literal, checkable gameover trigger.
  function resolveAlienBulletPlayerCollisions(state) {
    var bullets = state.alienBullets;
    var playerAabb = toAabb(state.player);
    var surviving = [];

    for (var i = 0; i < bullets.length; i++) {
      if (window.SI.Collision.aabbOverlap(toAabb(bullets[i]), playerAabb)) {
        state.lives -= 1;
        if (state.lives < 0) {
          state.lives = 0;
        }
      } else {
        surviving.push(bullets[i]);
      }
    }

    state.alienBullets = surviving;
  }

  // Gameover check (slice-04): state becomes 'gameover' when lives === 0 OR
  // any alive alien's row has reached the player's row (alien.y +
  // alien.height >= player.y). Sets the internal `terminal` flag so the
  // very next update() call (and every one after) is a no-op.
  function checkGameOver(state) {
    if (state.lives === 0) {
      state.state = 'gameover';
      terminal = true;
      return;
    }

    var aliens = state.aliens;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive !== false && a.y + a.height >= state.player.y) {
        state.state = 'gameover';
        terminal = true;
        return;
      }
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  function update(dt) {
    if (terminal) {
      // Gameover is terminal: lives/score/state (and everything else) are
      // frozen — no further mutation on any subsequent update() call.
      return;
    }

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

    marchGrid(state);

    fireAlienColumn(state);

    // Collision-before-move (see resolveAlienBulletPlayerCollisions), then
    // motion, then drop bullets that travelled off the bottom of the field.
    resolveAlienBulletPlayerCollisions(state);

    window.SI.Bullet.updateBullets(state.alienBullets, window.SI.Config.ALIEN_BULLET_SPEED);

    var alienOnScreen = [];
    for (var j = 0; j < state.alienBullets.length; j++) {
      var ab = state.alienBullets[j];
      if (ab.y < gameHeight) {
        alienOnScreen.push(ab);
      }
    }
    state.alienBullets = alienOnScreen;

    checkGameOver(state);
  }

  window.SI.Game = window.SI.Game || {};
  window.SI.Game.state = getOrCreateState();
  window.gameState = window.SI.Game.state;
  window.SI.Game.input = { left: false, right: false, fire: false };
  window.SI.Game.init = init;
  window.SI.Game.update = update;
})();
