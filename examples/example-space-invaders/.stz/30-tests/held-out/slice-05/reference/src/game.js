// SI.Game — state machine + orchestration for slice-02..05 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality; P4: destructible shields, bonus UFO, wave
// escalation). Strategy: imperative index-loop update over
// struct-of-arrays-style entity arrays (plain objects, indexed for-loops,
// no functional chains in the hot update path).
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

  // March state (slice-03) — internal only. Driven entirely by an
  // accumulated update()-call counter, never wall-clock, so repeated
  // update() calls reproduce the march exactly (dt's magnitude is never
  // read).
  var marchStepCounter = 0; // fixed-steps elapsed since the last march move
  var marchDirection = 1; // +1 = right, -1 = left
  var marchPendingDrop = false; // true = next march step drops+reverses instead of moving horizontally

  // Alien-fire state (slice-04) — internal only. Fixed interval-timer.
  var alienFireCounter = 0;

  // UFO spawn-schedule state (slice-05) — internal only. Fixed
  // interval-timer, cadence re-rolled (via SI.RNG.next()) each time a new
  // wait is needed, never wall-clock.
  var ufoSpawnCounter = 0;
  var ufoSpawnTarget = 0;

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

  function resetMarchState() {
    marchStepCounter = 0;
    marchDirection = 1;
    marchPendingDrop = false;
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
    state.ufo = { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 };

    window.gameState = state;

    window.SI.Game.state = state;
    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;
    prevFire = false;

    resetMarchState();
    alienFireCounter = 0;

    ufoSpawnCounter = 0;
    ufoSpawnTarget = window.SI.Ufo.rollSpawnDelay();

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

  // resolveUfoHit (slice-05, P4): a player bullet overlapping an ACTIVE ufo
  // removes it (active=false) and adds its bonus (>0) to score. An inactive
  // ufo never scores regardless of geometric overlap — the `active` flag
  // gates the check, not just the rect. At most one bullet is consumed per
  // step (the ufo can only be hit once before it deactivates).
  function resolveUfoHit(state) {
    var ufo = state.ufo;
    if (!ufo.active) {
      return;
    }

    var bullets = state.playerBullets;
    var survivors = [];
    var hit = false;
    for (var i = 0; i < bullets.length; i++) {
      if (!hit && window.SI.Collision.aabbOverlap(toAabb(bullets[i]), toAabb(ufo))) {
        hit = true;
        state.score += ufo.bonus;
        ufo.active = false;
      } else {
        survivors.push(bullets[i]);
      }
    }
    state.playerBullets = survivors;
  }

  // updateUfoMovementAndSpawn (slice-05, P4): when inactive, counts fixed
  // steps toward an SI.RNG.next()-drawn wait, then spawns (assigning a
  // fresh SI.RNG.next()-drawn bonus in [50,300]) once due. When active,
  // moves it across the top of the screen and deactivates it (no bonus) once
  // it exits the right edge.
  function updateUfoMovementAndSpawn(state) {
    var ufo = state.ufo;

    if (!ufo.active) {
      ufoSpawnCounter++;
      if (ufoSpawnCounter < ufoSpawnTarget) {
        return;
      }
      ufoSpawnCounter = 0;
      ufoSpawnTarget = window.SI.Ufo.rollSpawnDelay();

      var spawned = window.SI.Ufo.spawn();
      ufo.active = true;
      ufo.x = spawned.x;
      ufo.y = spawned.y;
      ufo.width = spawned.width;
      ufo.height = spawned.height;
      ufo.bonus = spawned.bonus;
      return;
    }

    ufo.x += window.SI.Config.UFO_SPEED;
    if (ufo.x > gameWidth) {
      ufo.active = false; // exits off-screen without awarding a bonus
    }
  }

  // filterAgainstShields (slice-05, P4): index-scans every shield cell for
  // each bullet; the first overlapping cell found reduces that cell's
  // integrity by 1 (floored at 0, never negative) and consumes the bullet.
  // A cell at 0 integrity still blocks/consumes bullets — the contract only
  // says integrity floors at 0, never that a spent cell stops colliding.
  // Returns the surviving (non-consumed) bullets; does not mutate `bullets`.
  function filterAgainstShields(bullets, shields) {
    var survivors = [];
    for (var i = 0; i < bullets.length; i++) {
      var bullet = bullets[i];
      var bulletAabb = toAabb(bullet);
      var consumed = false;

      for (var s = 0; s < shields.length && !consumed; s++) {
        var shield = shields[s];
        for (var c = 0; c < shield.cells.length; c++) {
          var rect = window.SI.Shield.cellRect(shield, c);
          if (window.SI.Collision.aabbOverlap(bulletAabb, toAabb(rect))) {
            var next = shield.cells[c] - 1;
            shield.cells[c] = next < 0 ? 0 : next;
            consumed = true;
            break;
          }
        }
      }

      if (!consumed) {
        survivors.push(bullet);
      }
    }
    return survivors;
  }

  function resolveShieldCollisions(state) {
    state.playerBullets = filterAgainstShields(state.playerBullets, state.shields);
    state.alienBullets = filterAgainstShields(state.alienBullets, state.shields);
  }

  // checkWaveTransition (slice-05, P4): destroying the last alive alien
  // increments wave and respawns a full new grid. Runs immediately after
  // bullet-vs-alien resolution, before the march step, so the fresh grid's
  // very first march (this same update() call) already uses the new wave's
  // faster interval. March state resets to a clean slate for the new grid.
  function checkWaveTransition(state) {
    if (state.aliens.length === 0) {
      state.wave += 1;
      state.aliens = window.SI.Alien.createGrid();
      resetMarchState();
    }
  }

  // Rigid-block march: every alive alien moves by the SAME x-delta each
  // march step (never per-alien speed). Cadence is an internal
  // accumulated-step counter compared against
  // SI.Alien.marchInterval(aliveCount, wave) — never wall-clock, never
  // scaled by dt's magnitude, so N identical update() calls always
  // reproduce the same march exactly.
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

  // Alien fire (slice-04, P3): interval-timer cadence.
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
  // purely by array membership. Each overlapping bullet decrements lives by
  // exactly 1 and is removed; lives is floor-clamped at 0.
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
  // Terminality guard: gameover is checked at the very top, before anything
  // else runs, so once state.state === 'gameover' every subsequent update()
  // call is a no-op — lives, score, state are left byte-for-byte unchanged.
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

    resolveBulletAlienCollisions(state);

    resolveUfoHit(state);

    resolveShieldCollisions(state);

    checkWaveTransition(state);

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

    resolveAlienBulletPlayerCollisions(state);

    updateUfoMovementAndSpawn(state);

    checkGameover(state);
  }

  window.SI.Game = window.SI.Game || {};
  window.SI.Game.state = getOrCreateState();
  window.gameState = window.SI.Game.state;
  window.SI.Game.input = { left: false, right: false, fire: false };
  window.SI.Game.init = init;
  window.SI.Game.update = update;
})();
