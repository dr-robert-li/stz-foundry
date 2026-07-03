// SI.Game — state machine + orchestration for slice-02/03/04/05 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality; P4: destructible shields, RNG-timed bonus UFO,
// wave escalation). Strategy: imperative index-loop update over
// struct-of-arrays-style entity arrays (plain objects, indexed for-loops,
// no functional chains in the hot update path). Alien fire and UFO spawn
// both use a fixed interval-timer step counter (like the march cadence);
// the UFO's threshold is itself RNG-drawn per spawn cycle. Alien fire uses
// an index-scan over aliens (SI.Alien.frontlineByColumn) to pick the firing
// column.
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

  // UFO spawn schedule (slice-05, P4) — internal only, per the same
  // interval-timer pattern as alienFireCounter above, except the threshold
  // itself is redrawn from SI.RNG.next() (via SI.Ufo.nextSpawnInterval())
  // every time the UFO despawns (whether by leaving the field or by being
  // shot), so the schedule is genuinely "RNG-timed" rather than a fixed
  // cadence.
  var ufoSpawnCounter = 0;
  var ufoSpawnThreshold = 0;

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

    ufoSpawnCounter = 0;
    ufoSpawnThreshold = window.SI.Ufo.nextSpawnInterval();

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

  // Bullet-vs-shield collision (slice-05, P4): any {x,y,width,height} object
  // present in state[bulletsField] (playerBullets OR alienBullets — both
  // call this) is treated as a live collidable bullet purely by array
  // membership, same TEST-FACING rule as elsewhere, so a bare injected
  // bullet over a cell rect still hits. Checked at the bullet's CURRENT
  // (already-moved) position. Only cells with integrity > 0 participate —
  // a destroyed cell (integrity already 0) no longer blocks anything, so
  // bullets pass through the hole. On a hit: that cell's integrity drops by
  // 1 (floor-clamped at 0, never negative) and the bullet is consumed
  // (removed), checking at most one cell per bullet per step.
  function resolveBulletShieldCollisions(state, bulletsField) {
    var bullets = state[bulletsField];
    if (bullets.length === 0) {
      return;
    }
    var shields = state.shields;
    var survivors = [];

    for (var i = 0; i < bullets.length; i++) {
      var bullet = bullets[i];
      var bulletAabb = toAabb(bullet);
      var consumed = false;

      for (var s = 0; s < shields.length && !consumed; s++) {
        var shield = shields[s];
        var cells = shield.cells;
        for (var c = 0; c < cells.length; c++) {
          if (cells[c] <= 0) {
            continue; // already-destroyed cell: no collision, bullet passes through
          }
          var rect = window.SI.Shield.cellRect(shield, c);
          if (window.SI.Collision.aabbOverlap(bulletAabb, toAabb(rect))) {
            cells[c] -= 1;
            if (cells[c] < 0) {
              cells[c] = 0;
            }
            consumed = true;
            break;
          }
        }
      }

      if (!consumed) {
        survivors.push(bullet);
      }
    }

    state[bulletsField] = survivors;
  }

  // Bullet-vs-UFO collision (slice-04/05, P4): a player bullet overlapping
  // an ACTIVE ufo (current position, after this step's movement) deactivates
  // it, adds its bonus (> 0) to score, and is consumed. No-op if the ufo
  // isn't active. On a hit, immediately reschedules the next RNG-timed
  // spawn (same as a natural off-screen despawn) so the schedule stays
  // continuous.
  function resolveBulletUfoCollisions(state) {
    var ufo = state.ufo;
    if (!ufo.active) {
      return;
    }

    var bullets = state.playerBullets;
    var ufoAabb = toAabb(ufo);
    var survivors = [];
    var hit = false;

    for (var i = 0; i < bullets.length; i++) {
      if (!hit && window.SI.Collision.aabbOverlap(toAabb(bullets[i]), ufoAabb)) {
        hit = true;
        continue; // consumed
      }
      survivors.push(bullets[i]);
    }

    if (hit) {
      ufo.active = false;
      state.score += ufo.bonus;
      ufoSpawnCounter = 0;
      ufoSpawnThreshold = window.SI.Ufo.nextSpawnInterval();
    }
    state.playerBullets = survivors;
  }

  // UFO spawn-timer + traversal (slice-05, P4): interval-timer cadence,
  // same shape as maybeFireAlienBullet, except the threshold is itself
  // drawn from SI.RNG.next() (SI.Ufo.nextSpawnInterval()) rather than a
  // fixed SI.Config constant — "spawns on an SI.RNG.next()-timed schedule".
  // While active, moves the ufo each step; once it fully exits the field,
  // deactivates it and redraws the next spawn threshold.
  function updateUfo(state) {
    var ufo = state.ufo;

    if (ufo.active) {
      var justDespawned = window.SI.Ufo.traverse(ufo, gameWidth);
      if (justDespawned) {
        ufoSpawnCounter = 0;
        ufoSpawnThreshold = window.SI.Ufo.nextSpawnInterval();
      }
      return;
    }

    ufoSpawnCounter++;
    if (ufoSpawnCounter < ufoSpawnThreshold) {
      return;
    }
    ufoSpawnCounter = 0;
    window.SI.Ufo.spawn(ufo);
  }

  // Rigid-block march: every alive alien moves by the SAME x-delta each
  // march step (never per-alien speed). Cadence is an internal
  // accumulated-step counter compared against SI.Alien.marchInterval(
  // aliveCount, wave) (slice-05: wave-aware, linear speedup per wave) —
  // never wall-clock, never scaled by dt's magnitude, so N identical
  // update() calls always reproduce the same march exactly.
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

    // Shields intercept player bullets before they can reach aliens/ufo
    // (resolved at the bullet's current, already-moved position).
    resolveBulletShieldCollisions(state, 'playerBullets');

    var aliensBefore = state.aliens.length;
    resolveBulletAlienCollisions(state);

    // Wave transition (slice-05, P4): killing the last alive alien this
    // step increments the wave and respawns a full 55-alien grid. March
    // state resets so the new grid starts a fresh cadence, reusing
    // marchInterval(aliveCount, wave) below for the new wave's (faster)
    // initial interval.
    if (aliensBefore > 0 && state.aliens.length === 0) {
      state.wave += 1;
      state.aliens = window.SI.Alien.createGrid();
      marchStepCounter = 0;
      marchDirection = 1;
      marchPendingDrop = false;
    }

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

    // Shields intercept alien bullets before they can reach the player.
    resolveBulletShieldCollisions(state, 'alienBullets');

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
