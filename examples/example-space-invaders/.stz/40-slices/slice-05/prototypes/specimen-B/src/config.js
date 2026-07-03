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

  // slice-04: alien fire + alien-bullet tuning (P3). Cadence is a fixed
  // count of SI.Game.update() steps (interval-timer), never wall-clock.
  ALIEN_FIRE_INTERVAL_STEPS: 90, // ~1.5s at the 16.667ms fixed step
  ALIEN_BULLET_WIDTH: 4,
  ALIEN_BULLET_HEIGHT: 10,
  ALIEN_BULLET_SPEED: 6, // px per fixed step, travels downward (+y)

  // slice-05: wave escalation (P4). Each new wave's march ramp is
  // multiplicatively faster than the last: marchInterval's ratio-scaled
  // base is multiplied by MULTIPLIER^(wave-1), ceil'd, floor-clamped to 1.
  ALIEN_MARCH_WAVE_MULTIPLIER: 0.8,

  // slice-05: destructible shields (P4). 2D rows x cols cell grid per
  // shield; SI.Shield.cellRect maps a flat cell index to geometry via
  // row = floor(index/cols), col = index % cols.
  SHIELD_COUNT: 4,
  SHIELD_ROWS: 4,
  SHIELD_COLS: 8,
  SHIELD_CELL_WIDTH: 8,
  SHIELD_CELL_HEIGHT: 6,
  SHIELD_CELL_INTEGRITY: 4, // starting integrity per cell
  SHIELD_Y_FROM_BOTTOM: 150, // shields sit between the alien grid and the player

  // slice-05: UFO tuning (P4). Spawn cadence is an RNG-drawn countdown of
  // fixed update() steps (never wall-clock); bonus is RNG-drawn in
  // [UFO_BONUS_MIN, UFO_BONUS_MAX].
  UFO_WIDTH: 40,
  UFO_HEIGHT: 20,
  UFO_Y: 20, // px from top, traverses above the alien grid
  UFO_SPEED: 3, // px per fixed step, travels rightward (+x)
  UFO_SPAWN_MIN_STEPS: 300, // ~5s at the fixed step
  UFO_SPAWN_MAX_STEPS: 600, // ~10s at the fixed step
};
