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

  // slice-05 (P4): shields. Row-major cells, per shield: SHIELD_ROWS *
  // SHIELD_COLS cells, each SHIELD_CELL_WIDTH x SHIELD_CELL_HEIGHT.
  // SHIELD_COUNT shields are spread evenly across gameWidth, deliberately
  // leaving a clear gap centered on the player's default spawn x (classic
  // arrangement, also keeps P1/P2/P3's default straight-up shot lane clear).
  SHIELD_COUNT: 4,
  SHIELD_ROWS: 4,
  SHIELD_COLS: 6,
  SHIELD_CELL_WIDTH: 10,
  SHIELD_CELL_HEIGHT: 10,
  SHIELD_STARTING_INTEGRITY: 4,
  SHIELD_Y_FROM_BOTTOM: 150, // shield row sits this far above the play field's bottom edge

  // slice-05 (P4): UFO. Spawns on an SI.RNG.next()-timed schedule (interval
  // drawn in [UFO_SPAWN_MIN_STEPS, UFO_SPAWN_MAX_STEPS] fixed-steps),
  // traverses left-to-right across the top of the screen.
  UFO_WIDTH: 40,
  UFO_HEIGHT: 20,
  UFO_Y: 30,
  UFO_SPEED: 4, // px per fixed step
  UFO_SPAWN_MIN_STEPS: 300,
  UFO_SPAWN_MAX_STEPS: 600,

  // slice-05 (P4): linear wave speedup. Each wave's full-grid initial march
  // interval is WAVE_MARCH_SPEEDUP_STEP fixed-steps less than the previous
  // wave's (floored at 1), reusing marchInterval's existing ratio math.
  WAVE_MARCH_SPEEDUP_STEP: 6,
};
