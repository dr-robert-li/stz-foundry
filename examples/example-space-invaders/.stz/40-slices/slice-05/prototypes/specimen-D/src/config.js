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

  // slice-05: wave escalation (P4). marchInterval(aliveCount, wave) reuses
  // the slice-03 aliveCount ratio as a base, then subtracts a fixed amount
  // per wave above 1 (floored at 1) — strictly decreasing per wave for a
  // fixed aliveCount without the ceil(base/wave) plateau a pure divisor
  // would hit once base/wave stops crossing an integer boundary.
  ALIEN_MARCH_WAVE_SPEEDUP: 4,

  // slice-05: destructible shields (P4). Each shield is a SHIELD_ROWS x
  // SHIELD_COLS grid of cells, each cell SHIELD_CELL_WIDTH x
  // SHIELD_CELL_HEIGHT px, starting at SHIELD_CELL_INTEGRITY hit points.
  // SHIELD_COUNT shields are spread evenly across the play field, inset by
  // SHIELD_MARGIN_X from each edge, sitting SHIELD_Y_OFFSET_FROM_BOTTOM px
  // above the bottom of the field (above the player, below the aliens).
  SHIELD_COUNT: 4,
  SHIELD_ROWS: 3,
  SHIELD_COLS: 6,
  SHIELD_CELL_WIDTH: 10,
  SHIELD_CELL_HEIGHT: 8,
  SHIELD_CELL_INTEGRITY: 4,
  SHIELD_MARGIN_X: 60,
  SHIELD_Y_OFFSET_FROM_BOTTOM: 150,

  // slice-05: bonus UFO (P4). Spawns after an RNG-timed delay (in fixed
  // steps, drawn from [UFO_SPAWN_MIN_STEPS, UFO_SPAWN_MAX_STEPS]), traverses
  // the top of the screen at UFO_SPEED px/step, y fixed at UFO_Y.
  UFO_WIDTH: 30,
  UFO_HEIGHT: 16,
  UFO_Y: 20,
  UFO_SPEED: 3,
  UFO_SPAWN_MIN_STEPS: 300,
  UFO_SPAWN_MAX_STEPS: 600,
};
