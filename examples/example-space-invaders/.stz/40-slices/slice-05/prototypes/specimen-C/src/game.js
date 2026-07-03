// SI.Game — state machine + orchestration for slice-02/03/04/05 (P1: move,
// shoot, kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality; P4: waves, destructible shields, bonus UFO).
// Strategy: imperative index-loop update over struct-of-arrays-style entity
// arrays for the pre-existing P1/P3 logic (unchanged), thin orchestration
// wrappers around the FUNCTIONAL SI.Shield/SI.Ufo pure pipelines for the
// new P4 logic — those modules do the map/filter/reduce work, game.js just
// wires their {before} -> {after} results back onto gameState fields.
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

  // UFO spawn state (slice-05, P4) — internal only, same interval-timer
  // shape as alienFireCounter, except the interval itself is re-rolled via
  // SI.RNG.next() (SI.Ufo.randomSpawnDelay()) every time a new target is
  // picked, rather than a fixed constant — an "RNG-timed schedule" rather
  // than a fixed cadence.
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
    state.shields = window.SI.Shield.createShields(gameWidth, state.player.y);
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
    alienFireCounter = 0;

    ufoSpawnCounter = 0;
    ufoSpawnTarget = window.SI.Ufo.randomSpawnDelay();

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

  // Wave transition (slice-05, P4): killing the last alive alien empties
  // state.aliens this step; when that happens, bump the wave counter and
  // respawn a full 55-alien grid. March state resets to a fresh grid's
  // starting condition so the new wave's march begins cleanly (not
  // mid-drop or offset by the counter left over from the previous wave).
  function checkWaveTransition(state) {
    if (state.aliens.length > 0) {
      return; // grid not empty (or already respawned this step) -> no-op
    }
    state.wave += 1;
    state.aliens = window.SI.Alien.createGrid();
    marchStepCounter = 0;
    marchDirection = 1;
    marchPendingDrop = false;
  }

  // Shield resolution (slice-05, P4): thin orchestration wrapper around the
  // pure functional SI.Shield.resolveBulletHits pipeline — takes the
  // current shields + one bullet array (player or alien, called once per
  // array so a single bullet can't be double-consumed across both), writes
  // back the (possibly damaged) shields and the surviving bullets via
  // wholesale array replacement (per ADR-003).
  function resolveShieldHits(state, bulletsField) {
    var result = window.SI.Shield.resolveBulletHits(state.shields, state[bulletsField]);
    state.shields = result.shields;
    state[bulletsField] = result.bullets;
  }

  // UFO spawn (slice-05, P4): RNG-timed interval-timer — counts fixed
  // steps while no UFO is active and compares against a target re-rolled
  // via SI.Ufo.randomSpawnDelay() (one SI.RNG.next() call) each time a new
  // target is needed. While a UFO is active the counter is left alone (no
  // second UFO stacks on top of one already flying).
  function maybeSpawnUfo(state) {
    if (state.ufo.active) {
      return;
    }
    ufoSpawnCounter++;
    if (ufoSpawnCounter < ufoSpawnTarget) {
      return;
    }
    ufoSpawnCounter = 0;
    ufoSpawnTarget = window.SI.Ufo.randomSpawnDelay();
    state.ufo = window.SI.Ufo.spawn();
  }

  // UFO traversal (slice-05, P4): constant per-step displacement (never
  // scaled by dt's magnitude), delegated to the pure SI.Ufo.move().
  function moveUfo(state) {
    if (!state.ufo.active) {
      return;
    }
    state.ufo = window.SI.Ufo.move(state.ufo, gameWidth);
  }

  // Player-bullet-vs-UFO resolution (slice-05, P4): delegates to the pure
  // SI.Ufo.resolvePlayerBulletHit pipeline, then writes back the
  // (possibly deactivated) ufo, the surviving playerBullets, and adds the
  // bonus (> 0) to score on a hit.
  function resolveUfoHit(state) {
    var result = window.SI.Ufo.resolvePlayerBulletHit(state.ufo, state.playerBullets);
    state.ufo = result.ufo;
    state.playerBullets = result.bullets;
    state.score += result.scoreDelta;
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

    // slice-05 (P4): UFO + shield hit-checks run on playerBullets' CURRENT
    // position, before this step's movement — so a bullet injected (or
    // freshly spawned) exactly over a target rect is guaranteed to overlap
    // it that same update() call regardless of the bullet's own size versus
    // the per-step travel distance (unlike the post-move alien-collision
    // check below, which relies on aliens being taller than one bullet
    // step). Equivalent, across ticks, to checking every position a bullet
    // ever occupies exactly once.
    resolveUfoHit(state);
    resolveShieldHits(state, 'playerBullets');

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

    checkWaveTransition(state);

    marchGrid(state);

    maybeSpawnUfo(state);
    moveUfo(state);

    maybeFireAlienBullet(state);

    // slice-05 (P4): shield hit-check for alienBullets, same pre-move
    // rationale as the playerBullets check above.
    resolveShieldHits(state, 'alienBullets');

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
