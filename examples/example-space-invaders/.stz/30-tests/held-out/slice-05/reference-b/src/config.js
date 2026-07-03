// SI.Config — named game constants. No magic numbers scattered elsewhere.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
window.SI.Config = {
  FIXED_TIMESTEP_MS: 1000 / 60, // ~16.667ms, per ADR-002

  ALIEN_ROWS: 5,
  ALIEN_COLS: 11,

  STARTING_LIVES: 3,

  ALIEN_POINTS_ROW_LOW: 10,
  ALIEN_POINTS_ROW_MID: 20,
  ALIEN_POINTS_ROW_HIGH: 30,

  UFO_BONUS_MIN: 50,
  UFO_BONUS_MAX: 300,

  // slice-03: rigid-block march tuning (ADR-002: per-step constants, never
  // scaled by dt).
  ALIEN_STEP_X: 10, // px per horizontal march step
  ALIEN_ROW_STEP: 20, // px the grid drops on edge contact
  // marchInterval(aliveCount) ratio-scales between 1 (fastest, 1 alien
  // left) and this ceiling (slowest, full 55-alien grid). Deliberately not
  // equal to ALIEN_ROWS*ALIEN_COLS so the ratio math is a real ceil(), not
  // an identity function in disguise.
  ALIEN_MARCH_MAX_INTERVAL: 48,
  // slice-05: per-wave speedup multiplier applied to marchInterval. Each
  // wave beyond 1 multiplies the (pre-floor) interval by this factor, so a
  // fresh full grid on wave N+1 marches strictly faster than on wave N.
  // In (0,1); 0.8 gives a clearly-strict drop at the full-grid size.
  WAVE_SPEEDUP: 0.8,

  // slice-04: alien fire + alien-bullet tuning (P3). Cadence is a fixed
  // count of SI.Game.update() steps (interval-timer), never wall-clock.
  ALIEN_FIRE_INTERVAL_STEPS: 90, // ~1.5s at the 16.667ms fixed step
  ALIEN_BULLET_WIDTH: 4,
  ALIEN_BULLET_HEIGHT: 10,
  ALIEN_BULLET_SPEED: 6, // px per fixed step, travels downward (+y)

  // slice-05: destructible shields. Each shield is a rectangular block of
  // SHIELD_CELL_COLS x SHIELD_CELL_ROWS cells (flat row-major integrity
  // array); SI.Shield.cellRect maps a flat cell index to its geometry using
  // these dimensions and the shield's own x/y. Placed low on the field
  // (between the player and the alien grid) so upward player bullets and the
  // top-of-screen UFO never interact with them.
  SHIELD_COUNT: 4,
  SHIELD_CELL_COLS: 6,
  SHIELD_CELL_ROWS: 4,
  SHIELD_CELL_WIDTH: 8,
  SHIELD_CELL_HEIGHT: 10, // > the 8px bullet step, so a travelling bullet cannot leap over a cell between checks
  SHIELD_MAX_INTEGRITY: 4, // starting integrity of every cell
  SHIELD_Y: 430, // top edge of the shield row

  // slice-05: bonus UFO. Traverses the very top of the screen. Timing of
  // spawns is RNG-driven (interval drawn from SI.RNG after each pass); the
  // FIRST spawn uses a fixed countdown so init() consumes no RNG and the
  // P3 alien-fire RNG stream stays untouched for short test windows.
  UFO_WIDTH: 36,
  UFO_HEIGHT: 14,
  UFO_Y: 18,
  UFO_SPEED: 3, // px per fixed step, travels left -> right (+x)
  UFO_FIRST_SPAWN_STEPS: 120, // fixed steps before the first-ever spawn
  UFO_SPAWN_MIN_STEPS: 150, // RNG-drawn re-spawn interval lower bound
  UFO_SPAWN_MAX_STEPS: 420, // RNG-drawn re-spawn interval upper bound
};
