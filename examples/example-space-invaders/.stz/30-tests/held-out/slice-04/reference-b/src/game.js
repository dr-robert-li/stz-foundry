// SI.Game — state machine + orchestration.
//   P1 (slice-02): player move, shoot, kill, score.
//   P2 (slice-03): rigid-block alien march, edge-drop-reverse, speed ramp.
//   P3 (slice-04): alien fire (RNG-chosen column), alienBullet-vs-player
//   collision (lives -= 1), dual gameover trigger (lives===0 OR any alive
//   alien reaches the player row), and gameover terminality.
//
// Strategy: imperative index-loop update over struct-of-arrays entity
// arrays for the P1/P2 hot path (unchanged from slice-03); P3's per-step
// alien-bullet handling is added as small self-contained passes.
//
// window.SI is bootstrapped once in rng.js (ADR-001). Depends on SI.Config,
// SI.Player, SI.Bullet, SI.Alien, SI.Collision, SI.RNG.
(function () {
  var DEFAULT_WIDTH = 800;
  var DEFAULT_HEIGHT = 600;

  var gameWidth = DEFAULT_WIDTH;
  var gameHeight = DEFAULT_HEIGHT;

  // fire is edge-triggered: exactly one bullet spawns per press-edge.
  var prevFire = false;

  // March state (slice-03) — internal only, driven by an accumulated
  // update()-call counter, never wall-clock.
  var marchStepCounter = 0;
  var marchDirection = 1;
  var marchPendingDrop = false;

  // Alien-fire cadence (slice-04) — internal accumulated-step counter, never
  // wall-clock and never scaled by dt's magnitude, so N identical update()
  // calls reproduce the same fire pattern for a given RNG seed.
  var fireStepCounter = 0;

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

  // Bullet-vs-alien collision (P1): membership in playerBullets == live.
  function resolveBulletAlienCollisions(state) {
    var aliens = state.aliens;
    var bullets = state.playerBullets;
    var survivingAliens = [];
    var deadBulletIndex = {};

    for (var i = 0; i < aliens.length; i++) {
      var alien = aliens[i];
      var hitBulletIdx = -1;

      for (var j = 0; j < bullets.length; j++) {
        if (deadBulletIndex[j]) {
          continue;
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

  // Rigid-block march (P2): every alive alien moves by the SAME x-delta per
  // march step; cadence is an internal step counter vs marchInterval().
  function marchGrid(state) {
    var aliens = state.aliens;
    if (aliens.length === 0) {
      return;
    }

    marchStepCounter++;
    var interval = window.SI.Alien.marchInterval(aliens.length);
    if (marchStepCounter < interval) {
      return;
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

  // Alien fire (P3): on cadence, pick a firing column via SI.RNG.next() (so a
  // seed makes it deterministic) and spawn one alien bullet from that column's
  // front alien. RNG is consulted only on an actual fire event.
  function maybeFireAlienBullet(state) {
    fireStepCounter++;
    if (fireStepCounter < window.SI.Config.ALIEN_FIRE_INTERVAL) {
      return;
    }
    fireStepCounter = 0;
    if (state.aliens.length === 0) {
      return;
    }
    var shooter = window.SI.Alien.pickFiringAlien(state.aliens, window.SI.RNG.next());
    if (shooter) {
      state.alienBullets.push(window.SI.Bullet.spawnAlienBullet(shooter));
    }
  }

  // alienBullet-vs-player collision (P3): any {x,y,width,height} object in
  // alienBullets is live by array membership alone — no private field. Each
  // bullet overlapping the player (via SI.Collision.aabbOverlap) removes EXACTLY
  // one life and is consumed. Run against current positions (before this step's
  // downward move) so a bullet injected directly onto the player hits this step.
  function resolveAlienBulletPlayerCollisions(state) {
    var bullets = state.alienBullets;
    if (bullets.length === 0) {
      return;
    }
    var playerBox = toAabb(state.player);
    var survivingBullets = [];
    for (var i = 0; i < bullets.length; i++) {
      if (window.SI.Collision.aabbOverlap(toAabb(bullets[i]), playerBox)) {
        state.lives -= 1; // exactly one life per bullet; bullet consumed
      } else {
        survivingBullets.push(bullets[i]);
      }
    }
    state.alienBullets = survivingBullets;
  }

  // Dual gameover trigger (P3): lives exhausted, OR any ALIVE alien has
  // descended to (or past) the player's row. Geometric and observable.
  function checkGameover(state) {
    if (state.lives <= 0) {
      state.state = 'gameover';
      return;
    }
    var playerY = state.player.y;
    var aliens = state.aliens;
    for (var i = 0; i < aliens.length; i++) {
      if (aliens[i].y + aliens[i].height >= playerY) {
        state.state = 'gameover';
        return;
      }
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for SI.Loop interface
  // compatibility but movement/spawn logic is a constant per-step delta.
  function update(dt) {
    var state = window.SI.Game.state;

    // Gameover is TERMINAL (P3): once here, nothing advances — lives, score
    // and state are all frozen. Guarding at the very top is the whole
    // mechanism; no per-field save/restore is needed.
    if (state.state === 'gameover') {
      return;
    }

    var input = window.SI.Game.input;

    // --- P1: player move + shoot -------------------------------------------
    window.SI.Player.update(state.player, input, gameWidth);

    var fireEdge = input.fire && !prevFire;
    prevFire = input.fire;
    if (fireEdge) {
      state.playerBullets.push(window.SI.Bullet.spawnPlayerBullet(state.player));
    }

    window.SI.Bullet.updateBullets(state.playerBullets, -window.SI.Bullet.SPEED);

    var onScreen = [];
    for (var i = 0; i < state.playerBullets.length; i++) {
      var b = state.playerBullets[i];
      if (b.y + b.height > 0) {
        onScreen.push(b);
      }
    }
    state.playerBullets = onScreen;

    resolveBulletAlienCollisions(state);

    // --- P2: alien march ---------------------------------------------------
    marchGrid(state);

    // --- P3: alien fire, player hits, gameover -----------------------------
    maybeFireAlienBullet(state);

    // Collide BEFORE moving alien bullets so a bullet injected directly onto
    // the player is consumed this very step.
    resolveAlienBulletPlayerCollisions(state);

    window.SI.Bullet.updateBullets(state.alienBullets, window.SI.Config.ALIEN_BULLET_SPEED);

    var alienOnScreen = [];
    for (var m = 0; m < state.alienBullets.length; m++) {
      if (state.alienBullets[m].y < gameHeight) {
        alienOnScreen.push(state.alienBullets[m]);
      }
    }
    state.alienBullets = alienOnScreen;

    checkGameover(state);
  }

  window.SI.Game = window.SI.Game || {};
  window.SI.Game.state = getOrCreateState();
  window.gameState = window.SI.Game.state;
  window.SI.Game.input = { left: false, right: false, fire: false };
  window.SI.Game.init = init;
  window.SI.Game.update = update;
})();
