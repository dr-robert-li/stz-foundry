// SI.Game — state machine + orchestration for slice-02/03/04/05 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality; P4: wave escalation, destructible shields, bonus
// UFO). Strategy: imperative index-loop update over struct-of-arrays-style
// entity arrays (plain objects, indexed for-loops, no functional chains in
// the hot update path). Alien fire uses a fixed interval-timer step
// counter (like the march cadence) and an index-scan over aliens
// (SI.Alien.frontlineByColumn) to pick the firing column. The UFO is an
// explicit inactive/active state machine driven by the same
// interval-timer pattern, timed via SI.RNG.next().
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

  // UFO state machine (slice-05, P4) — internal only. While ufo.active is
  // false, ufoStepCounter counts fixed steps toward ufoNextSpawnAt (an
  // RNG-timed delay drawn once via SI.Ufo.pickSpawnDelay() whenever the
  // UFO is inactive and no delay is currently pending). Never wall-clock,
  // so N identical update() calls reproduce the same spawn schedule.
  var ufoStepCounter = 0;
  var ufoNextSpawnAt = null;

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

    ufoStepCounter = 0;
    ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();

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

  // Bullet-vs-shield collision (slice-05, P4): any {x,y,width,height}
  // object present in `bullets` is treated as a live collidable bullet
  // purely by array membership (same TEST-FACING rule as
  // resolveBulletAlienCollisions) — a bare injected bullet over a cell
  // rect still hits. Works for either bullet array (player or alien): the
  // contract requires both directions to be blockable. Each bullet can hit
  // at most one cell, first match wins (shields scanned in array order,
  // cells scanned in row-major order); that cell's integrity drops by 1,
  // floored at 0 (repeated hits on an already-0 cell stay at 0, never
  // negative), and the bullet is consumed (removed, doesn't reach
  // whatever is behind the shield this step). Returns the surviving
  // bullets array; does not mutate `bullets` in place.
  function resolveBulletShieldCollisions(bullets, shields) {
    var survivors = [];
    for (var bi = 0; bi < bullets.length; bi++) {
      var bullet = bullets[bi];
      var consumed = false;

      for (var si = 0; si < shields.length && !consumed; si++) {
        var shield = shields[si];
        for (var ci = 0; ci < shield.cells.length; ci++) {
          var rect = window.SI.Shield.cellRect(shield, ci);
          if (window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(rect))) {
            shield.cells[ci] = Math.max(0, shield.cells[ci] - 1);
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

  // UFO lifecycle (slice-05, P4) — explicit inactive/active state machine.
  //
  // While active: first resolve collision against playerBullets (a bare
  // injected bullet over the active UFO still hits, same array-membership
  // rule as every other collision in this file — checked BEFORE movement
  // so a test that sets gameState.ufo={active:true,...} and injects a
  // bullet in the same update() call gets a hit against the position it
  // set, not a position shifted by this step's movement). On hit:
  // active=false, score += bonus (> 0, since UFO_BONUS_MIN > 0), bullet
  // consumed. If it survived the collision check, it moves UFO_SPEED
  // px/step to the right (traverses the top of the screen); reaching the
  // right edge deactivates it. Whenever the UFO transitions to inactive
  // this step (hit or off-screen), the next RNG-timed spawn delay is drawn
  // immediately so the schedule keeps advancing.
  //
  // While inactive: counts fixed steps toward ufoNextSpawnAt (drawn via
  // SI.Ufo.pickSpawnDelay(), which spends one SI.RNG.next() call) and
  // spawns (SI.Ufo.spawn(), which spends one more SI.RNG.next() call to
  // draw the bonus) once the delay elapses.
  function updateUfo(state) {
    var ufo = state.ufo;

    if (ufo.active) {
      var survivors = [];
      var hit = false;
      for (var i = 0; i < state.playerBullets.length; i++) {
        var bullet = state.playerBullets[i];
        if (!hit && window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(ufo))) {
          hit = true;
          state.score += ufo.bonus;
          ufo.active = false;
        } else {
          survivors.push(bullet);
        }
      }
      state.playerBullets = survivors;

      if (ufo.active) {
        ufo.x += window.SI.Config.UFO_SPEED;
        if (ufo.x > gameWidth) {
          ufo.active = false; // fully past the right edge, off-screen
        }
      }

      if (!ufo.active) {
        ufoStepCounter = 0;
        ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();
      }
      return;
    }

    if (ufoNextSpawnAt === null) {
      ufoNextSpawnAt = window.SI.Ufo.pickSpawnDelay();
    }
    ufoStepCounter++;
    if (ufoStepCounter >= ufoNextSpawnAt) {
      window.SI.Ufo.spawn(ufo);
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

    // Shields sit between the player and the aliens: a player bullet that
    // overlaps a cell is consumed there and never reaches an alien. Checked
    // against each bullet's CURRENT position, before this step's movement,
    // so a bullet placed (by a test, or by spawnPlayerBullet this same
    // step) exactly over a cell rect is guaranteed to register a hit on
    // its very first update() call — a cell (SHIELD_CELL_HEIGHT px tall)
    // can be no taller than a single movement step, so checking
    // post-movement could let a bullet tunnel past a thin cell without
    // ever overlapping it.
    state.playerBullets = resolveBulletShieldCollisions(state.playerBullets, state.shields);

    updateUfo(state);

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

    var aliveBeforeCollision = state.aliens.length;
    resolveBulletAlienCollisions(state);

    // Wave transition (slice-05, P4): killing the last alive alien
    // advances the wave and respawns a full 55-alien grid. March/edge-drop
    // state resets for the new grid (same clean-slate rules as init()'s
    // first grid); the new grid's initial marchInterval is strictly
    // smaller than the previous wave's thanks to SI.Alien.marchInterval's
    // wave parameter.
    if (aliveBeforeCollision > 0 && state.aliens.length === 0) {
      state.wave += 1;
      state.aliens = window.SI.Alien.createGrid();
      marchStepCounter = 0;
      marchDirection = 1;
      marchPendingDrop = false;
    }

    marchGrid(state);

    maybeFireAlienBullet(state);

    // Shields also block alien bullets travelling down toward the player —
    // same pre-movement check (and same tunnelling rationale) as the
    // player-bullet side above.
    state.alienBullets = resolveBulletShieldCollisions(state.alienBullets, state.shields);

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

    checkGameover(state);
  }

  window.SI.Game = window.SI.Game || {};
  window.SI.Game.state = getOrCreateState();
  window.gameState = window.SI.Game.state;
  window.SI.Game.input = { left: false, right: false, fire: false };
  window.SI.Game.init = init;
  window.SI.Game.update = update;
})();
