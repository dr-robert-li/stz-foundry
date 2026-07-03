// SI.Game — state machine + per-step orchestration (SI.Game.update).
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
//
// Depends on: SI.Config, SI.Collision, SI.Player, SI.Bullet, SI.Alien.
(function () {
  const DEFAULT_WIDTH = 800;
  const DEFAULT_HEIGHT = 600;

  // The one live state object. It is created ONCE and only ever mutated in
  // place (ADR-003): init() resets its fields and update() advances them, but
  // this reference never changes, so window.gameState (bound to it below) stays
  // valid for the whole session.
  const state = {
    state: 'ready',
    score: 0,
    lives: 0,
    wave: 1,
    fps: 60,
    player: null,
    aliens: [],
    playerBullets: [],
    alienBullets: [],
    shields: [],
    ufo: { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 },
  };

  // Intent flags set by input handlers; update() consumes them.
  const input = { left: false, right: false, fire: false };

  // Field bounds live in the closure (not on gameState) so the serializable
  // state shape stays exactly the documented contract. Reset on every init().
  let fieldWidth = DEFAULT_WIDTH;
  let fieldHeight = DEFAULT_HEIGHT;

  // Edge-trigger memory for `fire`: a bullet spawns only on the frame where
  // fire transitions false -> true, never on subsequent held frames.
  let firePrev = false;

  // box — adapt an entity's {width,height} (the gameState contract shape) to the
  // {w,h} shape SI.Collision.aabbOverlap reads. Bridges the two vocabularies so
  // gameState stays documented-shape while using the canonical collision helper.
  function box(e) {
    return { x: e.x, y: e.y, w: e.width, h: e.height };
  }

  // init — reset the live state object IN PLACE to a fresh "playing" game, on
  // every call, regardless of prior mutation.
  function init(opts) {
    const o = opts || {};
    fieldWidth = o.width || DEFAULT_WIDTH;
    fieldHeight = o.height || DEFAULT_HEIGHT;
    if (typeof o.seed === 'number') {
      window.SI.RNG.seed(o.seed);
    }

    state.state = 'playing';
    state.score = 0;
    state.lives = window.SI.Config.STARTING_LIVES;
    state.wave = 1;
    state.fps = 60;
    state.player = window.SI.Player.create(fieldWidth, fieldHeight);
    state.aliens = window.SI.Alien.createGrid(fieldWidth);
    state.playerBullets = [];
    state.alienBullets = [];
    state.shields = [];
    state.ufo = { active: false, x: 0, y: 0, width: 0, height: 0, bonus: 0 };

    // A fresh game must not treat an already-held fire flag as a new press.
    firePrev = false;
    input.left = false;
    input.right = false;
    input.fire = false;

    return state;
  }

  // direction — combine the left/right intent flags into -1 / 0 / +1.
  function direction() {
    let dir = 0;
    if (input.left) {
      dir -= 1;
    }
    if (input.right) {
      dir += 1;
    }
    return dir;
  }

  // update — advance EXACTLY ONE fixed step. The dt argument is accepted (the
  // loop always passes FIXED_TIMESTEP_MS) but movement magnitude does NOT depend
  // on it: every call is one tick (ADR-002 fixed timestep).
  function update(dt) { // eslint-disable-line no-unused-vars
    // 1. Player: move one fixed step + clamp.
    window.SI.Player.move(state.player, direction(), fieldWidth);

    // 2. Fire: spawn exactly one bullet on the rising edge of `fire`.
    if (input.fire && !firePrev) {
      state.playerBullets.push(window.SI.Bullet.spawnFromPlayer(state.player));
    }
    firePrev = input.fire;

    // 3. Collision FIRST, at each bullet's CURRENT position, before any motion.
    //    Every entry in playerBullets participates purely by array membership +
    //    geometry — collidability is NOT gated on any private field, so a bare
    //    {x,y,width,height} bullet injected externally is collided this step.
    //    Each bullet destroys at most one not-yet-hit alien; a hit consumes the
    //    bullet. Aliens are tracked by reference so none is double-scored.
    // ponytail: O(bullets * aliens) linear scan; fine at 55 aliens / few shots.
    const deadAliens = [];
    const survivingBullets = [];
    state.playerBullets.forEach(function (bullet) {
      const target = state.aliens.find(function (alien) {
        return deadAliens.indexOf(alien) === -1 &&
          window.SI.Collision.aabbOverlap(box(bullet), box(alien));
      });
      if (target) {
        deadAliens.push(target);
        state.score += target.points;
        // bullet consumed: intentionally not carried into survivors
      } else {
        survivingBullets.push(bullet);
      }
    });

    // 4. Remove destroyed aliens (arrays replaced wholesale, per ADR-003).
    state.aliens = state.aliens.filter(function (alien) {
      return deadAliens.indexOf(alien) === -1;
    });

    // 5. Advance surviving bullets one fixed step, then drop any off the top.
    survivingBullets.forEach(function (bullet) {
      window.SI.Bullet.advance(bullet);
    });
    state.playerBullets = survivingBullets.filter(function (bullet) {
      return !window.SI.Bullet.offTop(bullet);
    });

    return state;
  }

  window.SI.Game = {
    state: state,
    input: input,
    init: init,
    update: update,
  };

  // ADR-003: bind window.gameState to the single live state object ONCE, so a
  // Node/Playwright harness reading window.gameState always sees the current
  // frame. (In the full app this line lives in main.js; the eval bundle has no
  // main.js, so game.js owns the binding to stay self-sufficient.)
  window.gameState = window.SI.Game.state;
})();
