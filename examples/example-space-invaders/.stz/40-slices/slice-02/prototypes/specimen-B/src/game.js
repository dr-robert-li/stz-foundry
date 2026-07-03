// SI.Game — state machine + orchestration for slice-02
// (player-move-shoot-kill). Owns window.gameState (ADR-003) and drives
// SI.Player / SI.Bullet / SI.Alien each fixed step (ADR-002).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var cfg = window.SI.Config;

  // Slice-02-only constants, grouped onto the shared SI.Config object
  // (per conventions.md) rather than left as bare module-level literals.
  // config.js itself (the foundation module) ships only the constants
  // slice-01 needed; extending the same object here keeps "one SI.Config"
  // true without hand-editing a copied foundation file.
  Object.assign(cfg, {
    DEFAULT_WIDTH: 800,
    DEFAULT_HEIGHT: 600,

    PLAYER_WIDTH: 40,
    PLAYER_HEIGHT: 20,
    PLAYER_SPEED: 5, // px per fixed step, constant — never scaled by dt
    PLAYER_MARGIN_BOTTOM: 30,

    BULLET_WIDTH: 4,
    BULLET_HEIGHT: 12,
    BULLET_SPEED: 8, // px per fixed step, constant — never scaled by dt

    ALIEN_WIDTH: 30,
    ALIEN_HEIGHT: 20,
    ALIEN_SPACING_X: 45,
    ALIEN_SPACING_Y: 35,
    ALIEN_ORIGIN_Y: 60,
  });

  var width, height;
  var player; // SI.Player instance (private, mirrored into state.player)
  var aliens; // array of SI.Alien instances (private, mirrored into state.aliens)
  var prevFire = false; // edge-detector for fire input, reset on init()

  // The single live gameState object. Fields are mutated in place;
  // arrays are replaced wholesale each update (ADR-003) — never
  // reassign this variable itself, or window.gameState / SI.Game.state
  // would go stale relative to each other.
  var state = {
    state: 'ready',
    score: 0,
    lives: cfg.STARTING_LIVES,
    wave: 1,
    fps: 60,
    player: null,
    aliens: [],
    playerBullets: [],
    alienBullets: [],
    shields: [],
    ufo: { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 },
  };

  // SI.Collision.aabbOverlap (foundation, copied verbatim) takes {x,y,w,h};
  // gameState entities are {x,y,width,height} per ADR-003. Adapt at the
  // call site rather than editing the copied collision.js.
  function toAabb(o) {
    return { x: o.x, y: o.y, w: o.width, h: o.height };
  }

  function init(opts) {
    opts = opts || {};
    width = opts.width || cfg.DEFAULT_WIDTH;
    height = opts.height || cfg.DEFAULT_HEIGHT;

    if (typeof opts.seed === 'number') {
      window.SI.RNG.seed(opts.seed);
    }

    player = new window.SI.Player(
      (width - cfg.PLAYER_WIDTH) / 2,
      height - cfg.PLAYER_HEIGHT - cfg.PLAYER_MARGIN_BOTTOM,
      cfg.PLAYER_WIDTH,
      cfg.PLAYER_HEIGHT
    );

    aliens = window.SI.Alien.buildGrid({
      rows: cfg.ALIEN_ROWS,
      cols: cfg.ALIEN_COLS,
      alienWidth: cfg.ALIEN_WIDTH,
      alienHeight: cfg.ALIEN_HEIGHT,
      spacingX: cfg.ALIEN_SPACING_X,
      spacingY: cfg.ALIEN_SPACING_Y,
      originY: cfg.ALIEN_ORIGIN_Y,
      boundsWidth: width,
      cfg: cfg,
    });

    prevFire = false;

    state.state = 'playing';
    state.score = 0;
    state.lives = cfg.STARTING_LIVES;
    state.wave = 1;
    state.fps = 60;
    state.player = player.toState();
    state.aliens = aliens.map(function (a) {
      return a.toState();
    });
    state.playerBullets = [];
    state.alienBullets = [];
    state.shields = [];
    state.ufo = { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 };

    window.gameState = state;
  }

  // Exactly one fixed step. dt is accepted (per SI.Loop's calling
  // convention / ADR-002) but every motion below is a constant per-step
  // delta — dt is never multiplied into a position update.
  function update(dt) { // eslint-disable-line no-unused-vars
    var input = window.SI.Game.input;

    // --- player: move + clamp to [0, width - player.width] ---
    var dx = 0;
    if (input.left) {
      dx -= cfg.PLAYER_SPEED;
    }
    if (input.right) {
      dx += cfg.PLAYER_SPEED;
    }
    player.moveAndClamp(dx, width);
    state.player = player.toState();

    // --- fire: edge-triggered, exactly one bullet per press-edge ---
    var fireNow = !!input.fire;
    var bullets = state.playerBullets.slice();
    if (fireNow && !prevFire) {
      bullets.push(
        window.SI.Bullet.spawnPlayerBullet(player, cfg.BULLET_WIDTH, cfg.BULLET_HEIGHT).toState()
      );
    }
    prevFire = fireNow;

    // --- bullet-vs-alien collision, checked at each bullet's current
    // position. Array membership alone makes an object a live bullet —
    // a bare {x,y,width,height} object pushed onto gameState.playerBullets
    // from outside is checked exactly like a spawned one. ---
    var survivors = [];
    for (var i = 0; i < bullets.length; i++) {
      var bullet = bullets[i];
      var hitAlien = null;
      for (var j = 0; j < aliens.length; j++) {
        var alien = aliens[j];
        if (!alien.alive) {
          continue;
        }
        if (window.SI.Collision.aabbOverlap(toAabb(bullet), toAabb(alien))) {
          hitAlien = alien;
          break;
        }
      }
      if (hitAlien) {
        hitAlien.alive = false;
        state.score += hitAlien.points;
      } else {
        survivors.push(bullet);
      }
    }

    // --- straight-line motion for surviving bullets, constant per-step
    // delta; drop bullets once fully off the top of the field ---
    var moved = [];
    for (var k = 0; k < survivors.length; k++) {
      var next = window.SI.Bullet.stepPlayerBullet(survivors[k], cfg.BULLET_SPEED);
      if (next.y + next.height > 0) {
        moved.push(next);
      }
    }

    aliens = aliens.filter(function (a) {
      return a.alive;
    });

    state.playerBullets = moved;
    state.aliens = aliens.map(function (a) {
      return a.toState();
    });
  }

  window.SI.Game = {
    input: { left: false, right: false, fire: false },
    state: state,
    init: init,
    update: update,
  };

  window.gameState = state;
})();
