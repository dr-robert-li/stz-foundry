// SI.Game — state machine + orchestration for slice-02/03/04/05 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality; P4: wave escalation, destructible shields, bonus
// UFO). Strategy: imperative index-loop update over struct-of-arrays-style
// entity arrays (plain objects, indexed for-loops, no functional chains in
// the hot update path). Alien fire uses a fixed interval-timer step
// counter (like the march cadence) and an index-scan over aliens
// (SI.Alien.frontlineByColumn) to pick the firing column. UFO spawn uses
// the same fixed interval-timer pattern, but the interval itself is
// RNG-drawn per spawn cycle rather than a config constant.
//
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on
// SI.Config, SI.Player, SI.Bullet, SI.Alien, SI.Shield, SI.Ufo,
// SI.Collision, SI.RNG.
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

  // Alien-fire state (slice-04) — internal only. Fixed interval-timer:
  // counts fixed steps since the last fire event and compares against
  // SI.Config.ALIEN_FIRE_INTERVAL_STEPS, never wall-clock. SI.RNG.next() is
  // called exactly once per actual fire event (never just to "peek"), so
  // seeding SI.RNG before driving update() makes the whole fire sequence
  // reproducible.
  var alienFireCounter = 0;

  // UFO spawn state (slice-05) — internal only. Countdown of update()
  // steps until the next spawn, drawn once from SI.RNG.next() (via
  // SI.Ufo.randomSpawnCountdown) at init() and again every time the UFO
  // despawns off the right edge, so the whole spawn cadence is
  // reproducible under a seed.
  var ufoSpawnCountdown = 0;

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
    state.shields = window.SI.Shield.createShields(gameWidth, gameHeight);
    state.ufo = window.SI.Ufo.create();

    window.gameState = state;

    window.SI.Game.state = state;
    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;
    prevFire = false;

    marchStepCounter = 0;
    marchDirection = 1;
    marchPendingDrop = false;
    alienFireCounter = 0;
    ufoSpawnCountdown = window.SI.Ufo.randomSpawnCountdown();

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
  //
  // Wave transition (slice-05, P4): if this step's kills empty out a
  // non-empty grid, that's "killing the last alive alien" — advance
  // state.wave and respawn a full 55-alien grid, resetting march state
  // (mirrors init()'s reset) so the new wave starts from a clean march
  // cadence/direction.
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
    state.playerBullets = survivingBullets;

    if (aliens.length > 0 && survivingAliens.length === 0) {
      state.wave++;
      state.aliens = window.SI.Alien.createGrid();
      marchStepCounter = 0;
      marchDirection = 1;
      marchPendingDrop = false;
    } else {
      state.aliens = survivingAliens;
    }
  }

  // Bullet-vs-shield collision (slice-05, P4): index-scans every shield's
  // cells against `bullets` (either state.playerBullets or
  // state.alienBullets — either bullet source can damage a shield, per the
  // contract). Any {x,y,width,height} bullet overlapping a cell's rect
  // (SI.Shield.cellRect) is consumed and that cell's integrity drops by 1,
  // floored at 0 (never negative) — a cell rect keeps colliding even once
  // its integrity has already hit 0, which is exactly the case the
  // contract's explicit floor language is for (repeated hits never go
  // negative). Pure array-membership liveness, same as every other bullet
  // collision in this module — a bare injected bullet still hits. Returns
  // the surviving bullets array (caller replaces wholesale, per ADR-003);
  // shield cell integers are mutated in place (not entity arrays, so
  // in-place mutation is fine here).
  function resolveBulletShieldCollisions(shields, bullets) {
    var consumed = {};

    for (var s = 0; s < shields.length; s++) {
      var shield = shields[s];
      for (var c = 0; c < shield.cells.length; c++) {
        var rect = window.SI.Shield.cellRect(shield, c);
        var rectAabb = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };

        for (var b = 0; b < bullets.length; b++) {
          if (consumed[b]) {
            continue;
          }
          if (window.SI.Collision.aabbOverlap(toAabb(bullets[b]), rectAabb)) {
            shield.cells[c] = Math.max(0, shield.cells[c] - 1);
            consumed[b] = true;
            break;
          }
        }
      }
    }

    var survivors = [];
    for (var i = 0; i < bullets.length; i++) {
      if (!consumed[i]) {
        survivors.push(bullets[i]);
      }
    }
    return survivors;
  }

  // Bullet-vs-UFO collision (slice-05, P4): a player bullet overlapping the
  // ACTIVE ufo removes it (active=false) and adds its bonus (>0) to score.
  // Array-membership liveness, same as every other bullet collision here —
  // the sealed-test pattern of forcing gameState.ufo={active:true,...} then
  // injecting a bullet works because this reads state.ufo directly, no
  // private fields required.
  function resolveBulletUfoCollisions(state) {
    var ufo = state.ufo;
    if (!ufo.active) {
      return;
    }

    var bullets = state.playerBullets;
    var hitIdx = -1;
    for (var i = 0; i < bullets.length; i++) {
      if (window.SI.Collision.aabbOverlap(toAabb(bullets[i]), toAabb(ufo))) {
        hitIdx = i;
        break;
      }
    }

    if (hitIdx === -1) {
      return;
    }

    ufo.active = false;
    state.score += ufo.bonus;

    var survivors = [];
    for (var j = 0; j < bullets.length; j++) {
      if (j !== hitIdx) {
        survivors.push(bullets[j]);
      }
    }
    state.playerBullets = survivors;
  }

  // UFO spawn/traverse/despawn (slice-05, P4): while inactive, counts down
  // an RNG-drawn number of update() steps (never wall-clock) before
  // spawning at the left edge and drawing a fresh RNG-backed bonus. While
  // active, moves at a constant per-step speed (never scaled by dt) until
  // it clears the right edge, then despawns and draws a fresh countdown for
  // the next spawn. Runs AFTER this step's collision checks (mirrors
  // marchGrid running after resolveBulletAlienCollisions) so a
  // test-forced ufo position is exactly what this step's bullet collision
  // saw, undisturbed by movement until the next step.
  function updateUfo(state) {
    var ufo = state.ufo;
    var cfg = window.SI.Config;

    if (!ufo.active) {
      ufoSpawnCountdown--;
      if (ufoSpawnCountdown <= 0) {
        ufo.active = true;
        ufo.width = cfg.UFO_WIDTH;
        ufo.height = cfg.UFO_HEIGHT;
        ufo.x = -cfg.UFO_WIDTH;
        ufo.y = cfg.UFO_Y;
        ufo.bonus = window.SI.Ufo.randomBonus();
      }
      return;
    }

    ufo.x += cfg.UFO_SPEED;
    if (ufo.x > gameWidth) {
      ufo.active = false;
      ufoSpawnCountdown = window.SI.Ufo.randomSpawnCountdown();
    }
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
    var interval = window.SI.Alien.marchInterval(aliens.length, state.wave);
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

  // Alien fire (slice-04, P3): interval-timer cadence — every update() call
  // that isn't a fire step just increments the counter and returns. On a
  // fire step, index-scan the alien grid (SI.Alien.frontlineByColumn) for
  // one candidate per column, then spend exactly one SI.RNG.next() call to
  // pick which column fires. No candidates (grid empty) -> no bullet, no
  // RNG call, cadence still resets.
  function maybeFireAlienBullet(state) {
    alienFireCounter++;
    var interval = window.SI.Config.ALIEN_FIRE_INTERVAL_STEPS;
    if (alienFireCounter < interval) {
      return;
    }
    alienFireCounter = 0;

    var candidates = window.SI.Alien.frontlineByColumn(state.aliens);
    if (candidates.length === 0) {
      return;
    }

    var idx = Math.floor(window.SI.RNG.next() * candidates.length);
    if (idx >= candidates.length) {
      idx = candidates.length - 1; // guard the (extremely unlikely) next()===1 edge
    }
    state.alienBullets.push(window.SI.Bullet.spawnAlienBullet(candidates[idx]));
  }

  // alienBullet-vs-player collision (slice-04, P3): any {x,y,width,height}
  // object present in alienBullets is treated as a live collidable bullet
  // purely by array membership (same TEST-FACING rule as playerBullets), so
  // a bullet injected directly into gameState.alienBullets is hit by this
  // same scan. Each overlapping bullet decrements lives by exactly 1 and is
  // removed; lives is floor-clamped at 0.
  function resolveAlienBulletPlayerCollisions(state) {
    var bullets = state.alienBullets;
    var playerAabb = toAabb(state.player);
    var survivors = [];

    for (var i = 0; i < bullets.length; i++) {
      if (window.SI.Collision.aabbOverlap(toAabb(bullets[i]), playerAabb)) {
        state.lives -= 1;
      } else {
        survivors.push(bullets[i]);
      }
    }

    if (state.lives < 0) {
      state.lives = 0;
    }
    state.alienBullets = survivors;
  }

  // Gameover check (slice-04, P3): lives exhausted OR any ALIVE alien has
  // reached the player's row (alien.y + alien.height >= player.y).
  // Index-scans state.aliens directly (dead/injected alive:false entries
  // are skipped) rather than trusting array membership, since the contract
  // explicitly scopes this trigger to alive aliens only.
  function checkGameover(state) {
    if (state.lives === 0) {
      state.state = 'gameover';
      return;
    }

    var aliens = state.aliens;
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      if (a.alive === false) {
        continue;
      }
      if (a.y + a.height >= state.player.y) {
        state.state = 'gameover';
        return;
      }
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn logic here is a constant
  // per-step delta, never scaled by dt's magnitude.
  //
  // Terminality guard (slice-04, P3): gameover is checked at the very top,
  // before anything else runs, so once state.state === 'gameover' every
  // subsequent update() call is a no-op — lives, score, state, and every
  // entity array are left byte-for-byte unchanged.
  function update(dt) {
    var state = window.SI.Game.state;
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

    state.playerBullets = resolveBulletShieldCollisions(state.shields, state.playerBullets);

    resolveBulletAlienCollisions(state);

    resolveBulletUfoCollisions(state);

    marchGrid(state);

    maybeFireAlienBullet(state);

    window.SI.Bullet.updateBullets(state.alienBullets, window.SI.Config.ALIEN_BULLET_SPEED);

    // Wholesale array replacement (per ADR-003): drop alien bullets that
    // have travelled off the bottom of the play field.
    var stillFalling = [];
    for (var j = 0; j < state.alienBullets.length; j++) {
      var ab = state.alienBullets[j];
      if (ab.y < gameHeight) {
        stillFalling.push(ab);
      }
    }
    state.alienBullets = stillFalling;

    state.alienBullets = resolveBulletShieldCollisions(state.shields, state.alienBullets);

    resolveAlienBulletPlayerCollisions(state);

    updateUfo(state);

    checkGameover(state);
  }

  window.SI.Game = window.SI.Game || {};
  window.SI.Game.state = getOrCreateState();
  window.gameState = window.SI.Game.state;
  window.SI.Game.input = { left: false, right: false, fire: false };
  window.SI.Game.init = init;
  window.SI.Game.update = update;
})();
