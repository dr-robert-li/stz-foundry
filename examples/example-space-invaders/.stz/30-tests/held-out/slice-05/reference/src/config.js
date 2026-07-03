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
  // marchInterval(aliveCount, wave) ratio-scales between 1 (fastest, 1 alien
  // left) and this ceiling (slowest, full 55-alien grid, wave 1). Deliberately
  // not equal to ALIEN_ROWS*ALIEN_COLS so the ratio math is a real ceil(), not
  // an identity function in disguise.
  ALIEN_MARCH_MAX_INTERVAL: 48,

  // slice-04: alien fire + alien-bullet tuning (P3). Cadence is a fixed
  // count of SI.Game.update() steps (interval-timer), never wall-clock.
  ALIEN_FIRE_INTERVAL_STEPS: 90, // ~1.5s at the 16.667ms fixed step
  ALIEN_BULLET_WIDTH: 4,
  ALIEN_BULLET_HEIGHT: 10,
  ALIEN_BULLET_SPEED: 6, // px per fixed step, travels downward (+y)

  // slice-05: wave-scaled march speed-up (P4). marchInterval(aliveCount,
  // wave) subtracts this many steps per wave beyond 1 from the aliveCount-
  // derived base interval, floor-clamped to 1 — so a fresh full grid at
  // wave N+1 always marches strictly faster (initially) than wave N did.
  ALIEN_WAVE_STEP: 6,

  // slice-05: destructible shields (P4). SHIELD_COUNT evenly-spaced shields,
  // each a SHIELD_COLS x SHIELD_ROWS grid of cells, each cell starting at
  // SHIELD_START_INTEGRITY hit points.
  SHIELD_COUNT: 4,
  SHIELD_COLS: 6,
  SHIELD_ROWS: 4,
  SHIELD_CELL_WIDTH: 8,
  SHIELD_CELL_HEIGHT: 16,
  SHIELD_START_INTEGRITY: 4,
  SHIELD_Y_FROM_BOTTOM: 140, // px above the bottom of the play field

  // slice-05: UFO (P4). Spawn cadence is drawn (in fixed-steps) uniformly
  // from [UFO_SPAWN_MIN_STEPS, UFO_SPAWN_MAX_STEPS] via SI.RNG.next() each
  // time a new wait is needed (interval-timer, same pattern as alien fire —
  // never wall-clock).
  UFO_WIDTH: 30,
  UFO_HEIGHT: 16,
  UFO_Y: 10,
  UFO_SPEED: 4, // px per fixed step, travels rightward (+x) across the top
  UFO_SPAWN_MIN_STEPS: 300,
  UFO_SPAWN_MAX_STEPS: 600,
};
