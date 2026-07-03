// SI.Game — state machine + orchestration. slice-02/03/04 (P1: move, shoot,
// kill; P2: rigid-block alien march with edge-drop-reverse and a
// count-driven speed ramp; P3: alien fire, lives, dual gameover trigger,
// gameover terminality). slice-05 (P4) layers on: destructible shields
// (player OR alien bullets erode per-cell integrity, floored at 0),
// wave escalation (killing the last alien respawns a faster full grid), and
// the bonus UFO (RNG-timed spawn, RNG-drawn bonus, killed by a player
// bullet for score). Strategy: imperative index-loop update over
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
  // accumulated update()-call counter, never wall-clock.
  var marchStepCounter = 0; // fixed-steps elapsed since the last march move
  var marchDirection = 1; // +1 = right, -1 = left
  var marchPendingDrop = false; // true = next march step drops+reverses

  // Alien-fire state (slice-04) — internal only. Fixed interval-timer over
  // fixed steps; SI.RNG.next() is called exactly once per actual fire event.
  var alienFireCounter = 0;

  // UFO spawn schedule (slice-05) — internal only. Counts fixed steps down
  // to the next spawn. The FIRST value is a fixed constant assigned in
  // init(), so init() consumes NO SI.RNG draws — the P3 alien-fire RNG
  // stream stays byte-identical to slice-04 for any test window shorter than
  // UFO_FIRST_SPAWN_STEPS. Subsequent intervals are RNG-drawn at spawn time.
  var ufoSpawnCountdown = 0;

  function getOrCreateState() {
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
    state.shields = window.SI.Shield.createShields(gameWidth);
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
    ufoSpawnCountdown = window.SI.Config.UFO_FIRST_SPAWN_STEPS;

    return state;
  }

  // Bridges an {x,y,width,height} entity into the {x,y,w,h} shape
  // SI.Collision.aabbOverlap reads, without mutating the gameState entity.
  function toAabb(entity) {
    return { x: entity.x, y: entity.y, w: entity.width, h: entity.height };
  }

  // Bullet-vs-alien collision: any {x,y,width,height} object present in
  // playerBullets is treated as a live collidable bullet purely by array
  // membership. Returns the number of aliens killed this step so update()
  // can detect a wave-clearing kill.
  function resolveBulletAlienCollisions(state) {
    var aliens = state.aliens;
    var bullets = state.playerBullets;
    var survivingAliens = [];
    var deadBulletIndex = {}; // set of bullet indices consumed this step
    var killed = 0;

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
        killed++;
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
    return killed;
  }

  // Wave transition (slice-05, P4): killing the last alive alien increments
  // the wave counter and respawns a full fresh grid whose initial march
  // interval is strictly shorter (SI.Alien.marchInterval folds in the wave).
  // The march cadence/direction/drop reset so the new grid starts marching
  // from a clean state.
  function startNextWave(state) {
    state.wave += 1;
    state.aliens = window.SI.Alien.createGrid();
    marchStepCounter = 0;
    marchDirection = 1;
    marchPendingDrop = false;
  }

  // Shield collision (slice-05, P4): any bullet (player OR alien, live by
  // array membership) whose AABB overlaps a shield CELL RECT (via
  // SI.Collision.aabbOverlap on SI.Shield.cellRect geometry) reduces THAT
  // cell's integrity by exactly 1 (floored at 0, never negative) and is
  // consumed. First overlapping cell wins (a consumed bullet can't erode a
  // second cell). A bullet over an already-0 cell is still consumed and the
  // integrity stays 0 — the floor, not a skip, is what keeps it >= 0.
  // Returns the surviving (non-consumed) bullets as a new array (ADR-003).
  function resolveShieldCollisions(state, bullets) {
    var shields = state.shields;
    if (!shields || shields.length === 0) {
      return bullets;
    }
    var survivors = [];
    for (var bi = 0; bi < bullets.length; bi++) {
      var bulletAabb = toAabb(bullets[bi]);
      var consumed = false;
      for (var si = 0; si < shields.length && !consumed; si++) {
        var shield = shields[si];
        var cells = shield.cells;
        for (var ci = 0; ci < cells.length; ci++) {
          var r = window.SI.Shield.cellRect(shield, ci);
          if (window.SI.Collision.aabbOverlap(bulletAabb, {
            x: r.x, y: r.y, w: r.width, h: r.height,
          })) {
            var next = cells[ci] - 1;
            cells[ci] = next < 0 ? 0 : next;
            consumed = true;
            break;
          }
        }
      }
      if (!consumed) {
        survivors.push(bullets[bi]);
      }
    }
    return survivors;
  }

  // UFO-vs-player-bullet collision (slice-05, P4): a player bullet
  // overlapping the ACTIVE ufo removes the ufo (active=false), adds its
  // bonus (> 0) to the score, and consumes the bullet. Only the first
  // overlapping bullet scores — once active flips false the rest pass.
  function resolveUfoCollision(state) {
    var ufo = state.ufo;
    if (!ufo || !ufo.active) {
      return;
    }
    var bullets = state.playerBullets;
    var ufoAabb = toAabb(ufo);
    var survivors = [];
    for (var i = 0; i < bullets.length; i++) {
      if (ufo.active && window.SI.Collision.aabbOverlap(toAabb(bullets[i]), ufoAabb)) {
        state.score += ufo.bonus;
        ufo.active = false;
        // bullet consumed: not pushed to survivors
      } else {
        survivors.push(bullets[i]);
      }
    }
    state.playerBullets = survivors;
  }

  // UFO schedule + traversal (slice-05, P4). While active, slide right one
  // fixed step and deactivate once fully off the right edge. While inactive,
  // count the spawn timer down; at zero, spawn (draws the bonus via
  // SI.RNG.next()) and draw the next interval (a second SI.RNG.next()) so
  // the schedule is RNG-timed. init() seeds the FIRST countdown with a fixed
  // constant, so no RNG is consumed until the first spawn actually fires.
  function updateUfo(state) {
    var ufo = state.ufo;
    if (ufo.active) {
      window.SI.Ufo.step(ufo);
      if (window.SI.Ufo.hasExited(ufo, gameWidth)) {
        ufo.active = false;
      }
      return;
    }
    ufoSpawnCountdown--;
    if (ufoSpawnCountdown <= 0) {
      window.SI.Ufo.activate(ufo, gameWidth);
      ufoSpawnCountdown = window.SI.Ufo.drawInterval();
    }
  }

  // Rigid-block march (slice-03), now wave-aware (slice-05): the cadence is
  // SI.Alien.marchInterval(aliveCount, wave), so a fresh higher-wave grid
  // marches faster. dt's magnitude is never read.
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

  // Alien fire (slice-04, P3): interval-timer cadence; on a fire step,
  // index-scan the frontline and spend exactly one SI.RNG.next() to pick the
  // firing column.
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
  // object present in alienBullets is a live bullet by array membership.
  // Each overlapping bullet decrements lives by 1 and is removed; lives is
  // floor-clamped at 0.
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
  // reached the player's row.
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

  // Advances exactly one fixed step. Terminality guard (P3): gameover short-
  // circuits at the top, so every post-gameover update() is a no-op.
  //
  // Motion/collision ordering (slice-05): shields and the UFO are resolved
  // against each bullet at its CURRENT position, BEFORE that bullet's
  // constant per-step motion. This makes a bare bullet injected directly
  // over a specific cell rect (or over the UFO) hit exactly that target on
  // the same step, with no chance of an 8px step skipping past a small cell
  // or drifting into an adjacent one. A bullet that is not over a shield/UFO
  // still travels and is re-checked at its next position on the following
  // step. The alien collision stays POST-motion, byte-identical to the
  // slice-02/03/04 behavior P1 depends on (aliens are tall enough that an
  // injected bullet still overlaps after one step).
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

    // Player bullets hit the UFO / shields at their current position first.
    resolveUfoCollision(state);
    state.playerBullets = resolveShieldCollisions(state, state.playerBullets);

    // Then travel upward.
    window.SI.Bullet.updateBullets(state.playerBullets, -window.SI.Bullet.SPEED);

    // Drop player bullets that have travelled off the top of the play field.
    var onScreen = [];
    for (var i = 0; i < state.playerBullets.length; i++) {
      var b = state.playerBullets[i];
      if (b.y + b.height > 0) {
        onScreen.push(b);
      }
    }
    state.playerBullets = onScreen;

    // Alien collision stays POST-motion (unchanged from slice-04).
    var hadAliens = state.aliens.length;
    var killed = resolveBulletAlienCollisions(state);

    // Wave transition: a kill that empties the grid starts the next wave.
    if (killed > 0 && hadAliens > 0 && state.aliens.length === 0) {
      startNextWave(state);
    }

    marchGrid(state);

    updateUfo(state);

    maybeFireAlienBullet(state);

    // Alien bullets erode shields at their current position first (same
    // pre-motion rule as player bullets), so an injected-over-cell alien
    // bullet also hits exactly that cell.
    state.alienBullets = resolveShieldCollisions(state, state.alienBullets);

    // Then travel downward.
    window.SI.Bullet.updateBullets(state.alienBullets, window.SI.Config.ALIEN_BULLET_SPEED);

    // Drop alien bullets that have travelled off the bottom of the field.
    var stillFalling = [];
    for (var j = 0; j < state.alienBullets.length; j++) {
      var ab = state.alienBullets[j];
      if (ab.y < gameHeight) {
        stillFalling.push(ab);
      }
    }
    state.alienBullets = stillFalling;

    // Alien-bullet-vs-player stays POST-motion (unchanged from slice-04).
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
