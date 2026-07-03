// SI.Game — state machine + orchestration for the P1 slice (move / shoot /
// kill on a static alien grid). Functional array-method pipeline style:
// update() is a small sequence of map/filter/reduce passes over immutable
// snapshots, with window.gameState (== SI.Game.state) as the only place
// results are written back in place, per ADR-003.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  var DEFAULT_WIDTH = 800;
  var DEFAULT_HEIGHT = 600;

  // Edge-trigger bookkeeping for fire. Not part of window.gameState (the
  // sealed contract only requires *observable effects* — one bullet per
  // press — to be visible there, not the trigger machinery itself). Reset
  // on every init() so a fresh game never inherits a stale "was firing".
  var prevFire = false;

  // SI.Collision.aabbOverlap expects {x,y,w,h} boxes; window.gameState
  // entities are {x,y,width,height} per conventions.md. This adapter reads
  // only those public fields, so a bare externally-injected object with no
  // private/internal fields collides exactly like one this module built.
  function toBox(entity) {
    return { x: entity.x, y: entity.y, w: entity.width, h: entity.height };
  }

  // Resolve bullet-vs-alien collisions for one step, functionally: reduce
  // over bullets (in array order), each bullet claiming at most one still-
  // surviving alien, so no alien is destroyed twice and no double-scoring
  // happens even if several bullets overlap the same alien.
  function resolveHits(bullets, aliens) {
    var initial = { survivingAliens: aliens, hitFlags: [], destroyedAliens: [] };
    return bullets.reduce(function (acc, bullet) {
      var bulletBox = toBox(bullet);
      var hitIndex = acc.survivingAliens.findIndex(function (alien) {
        return window.SI.Collision.aabbOverlap(bulletBox, toBox(alien));
      });
      if (hitIndex === -1) {
        return {
          survivingAliens: acc.survivingAliens,
          hitFlags: acc.hitFlags.concat([false]),
          destroyedAliens: acc.destroyedAliens,
        };
      }
      var hitAlien = acc.survivingAliens[hitIndex];
      var remaining = acc.survivingAliens.filter(function (_, i) { return i !== hitIndex; });
      return {
        survivingAliens: remaining,
        hitFlags: acc.hitFlags.concat([true]),
        destroyedAliens: acc.destroyedAliens.concat([hitAlien]),
      };
    }, initial);
  }

  function init(opts) {
    opts = opts || {};
    var width = opts.width || DEFAULT_WIDTH;
    var height = opts.height || DEFAULT_HEIGHT;

    if (typeof opts.seed === 'number') {
      window.SI.RNG.seed(opts.seed);
    }

    prevFire = false;

    window.SI.Game.state = {
      state: 'playing',
      score: 0,
      width: width,
      height: height,
      player: window.SI.Player.create(width, height),
      aliens: window.SI.Alien.createGrid(),
      playerBullets: [],
      alienBullets: [],
    };

    // No main.js bootstrap in this slice — init() is the harness's only
    // entry point, so it owns setting window.gameState to the same live
    // object reference SI.Game.state holds (ADR-003: same ref, never
    // reassigned after this point; update() mutates fields on it in place).
    window.gameState = window.SI.Game.state;

    window.SI.Game.input.left = false;
    window.SI.Game.input.right = false;
    window.SI.Game.input.fire = false;

    return window.SI.Game.state;
  }

  // Advances exactly one fixed step. dt is accepted (matching SI.Loop's
  // call signature) but never used for movement math — every displacement
  // in this slice is a constant per-step delta, per ADR-002.
  function update(dt) { // eslint-disable-line no-unused-vars
    var state = window.SI.Game.state;
    var input = window.SI.Game.input;

    // 1. Move + clamp the player.
    state.player = window.SI.Player.move(state.player, input, state.width);

    // 2. Fire is edge-triggered: spawn exactly one bullet on a press-edge
    //    (false -> true transition), never while held.
    var firePressedEdge = input.fire && !prevFire;
    prevFire = input.fire;
    var bulletsThisStep = firePressedEdge
      ? state.playerBullets.concat([window.SI.Bullet.spawnFromPlayer(state.player)])
      : state.playerBullets;

    // 3. Collide at CURRENT bullet positions, before any motion is applied.
    //    This is what makes a bare {x,y,width,height} bullet spliced
    //    directly into playerBullets by a caller (test harness included)
    //    collide correctly the very next update() — array membership alone
    //    makes it "live", nothing keys off a private field.
    var resolved = resolveHits(bulletsThisStep, state.aliens);
    var scoreGain = resolved.destroyedAliens.reduce(function (sum, alien) {
      return sum + alien.points;
    }, 0);

    state.aliens = resolved.survivingAliens;
    state.score += scoreGain;

    // 4. Drop hit bullets, move survivors in a straight line, cull anything
    //    that left the top of the screen. Arrays replaced wholesale (never
    //    mutated in place), per ADR-003.
    state.playerBullets = bulletsThisStep
      .filter(function (_, idx) { return !resolved.hitFlags[idx]; })
      .map(window.SI.Bullet.move)
      .filter(window.SI.Bullet.isOnScreen);

    return state;
  }

  window.SI.Game = {
    state: null,
    input: { left: false, right: false, fire: false },
    init: init,
    update: update,
  };
})();
