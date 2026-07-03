// SI.Game — state machine + orchestration. Slice-03 (P2) adds rigid-block
// alien march on top of slice-02's move/shoot/kill. Strategy: imperative
// index-loop update over plain-object entity arrays.
//
// March strategy (independent shape): a single accumulated-step counter is
// bumped once per update() call and compared (>=) against
// SI.Alien.marchInterval(aliveCount). When it reaches the interval it fires
// exactly one march move and resets to zero — cadence is a pure function of
// update() call count, never of dt or wall-clock. Horizontal direction is a
// signed integer (+1/-1); an edge touch after a horizontal move latches a
// boolean `pendingDrop`, and the NEXT march move consumes that latch by
// dropping the whole block by ROW_STEP and flipping the direction. This
// two-phase latch is what makes "drop + reverse on the very next step" fall
// out without inspecting velocities.
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

  // March state (internal; observable only via alien positions across steps).
  var marchDir = 1; // +1 = right, -1 = left
  var marchCounter = 0; // update() calls accumulated since the last march move
  var pendingDrop = false; // an edge was touched -> next move drops + reverses

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

    // Fresh march: start heading right, counter cleared, no pending drop, so
    // repeated init()+update(N) sequences reproduce the march bit-for-bit.
    marchDir = 1;
    marchCounter = 0;
    pendingDrop = false;

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

  // Collects the live aliens. Base collision removes dead aliens from the
  // array outright, but treat a truthy `alive` marker as authoritative too so
  // the count and the block move agree regardless of representation.
  function aliveAliens(state) {
    var live = [];
    for (var i = 0; i < state.aliens.length; i++) {
      var a = state.aliens[i];
      if (a.alive !== false) {
        live.push(a);
      }
    }
    return live;
  }

  // Advances the rigid-block march by AT MOST one march move per call. Bumps
  // the accumulated-step counter every call; only when it reaches the
  // count-derived interval does the whole grid translate — either one shared
  // horizontal dx for every alive alien, or (if an edge was latched) a shared
  // downward ROW_STEP plus a direction flip. dt is irrelevant here by design.
  function marchStep() {
    var state = window.SI.Game.state;
    var live = aliveAliens(state);

    marchCounter += 1;
    var interval = window.SI.Alien.marchInterval(live.length);
    if (marchCounter < interval) {
      return; // not yet time to march; grid holds position this step
    }
    marchCounter = 0;

    if (live.length === 0) {
      return; // nothing to move; keep the latch/direction as-is
    }

    if (pendingDrop) {
      // Edge was touched last horizontal move: drop the block and reverse.
      var drop = window.SI.Alien.ROW_STEP;
      for (var i = 0; i < live.length; i++) {
        live[i].y += drop;
      }
      marchDir = -marchDir;
      pendingDrop = false;
      return;
    }

    // Rigid horizontal translation: identical dx for every alive alien.
    var dx = marchDir * window.SI.Alien.STEP_DX;
    for (var j = 0; j < live.length; j++) {
      live[j].x += dx;
    }

    // Edge check AFTER the move: if any alien now touches/exceeds a screen
    // edge, latch a drop so the very next march move drops + reverses.
    for (var k = 0; k < live.length; k++) {
      var a = live[k];
      if (a.x <= 0 || a.x + a.width >= gameWidth) {
        pendingDrop = true;
        break;
      }
    }
  }

  // Advances exactly one fixed step. `dt` is accepted for interface
  // compatibility with SI.Loop but movement/spawn/march logic here is a
  // constant per-step delta, never scaled by dt's magnitude.
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

    resolveBulletAlienCollisions(state);

    // March last: it reads the alive count AFTER kills this step, so cadence
    // tracks the live population the tests observe in gameState.
    marchStep();
  }

  window.SI.Game = window.SI.Game || {};
  window.SI.Game.state = getOrCreateState();
  window.gameState = window.SI.Game.state;
  window.SI.Game.input = { left: false, right: false, fire: false };
  window.SI.Game.init = init;
  window.SI.Game.update = update;
})();
