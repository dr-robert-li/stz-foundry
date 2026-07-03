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

  // slice-04 (P3): alien fire tuning (ADR-002: per-step constants, never
  // scaled by dt). Fire once every ALIEN_FIRE_INTERVAL fixed steps; the
  // firing column is chosen via SI.RNG.next() so seeding is deterministic.
  // Interval kept comfortably longer than a bullet's traversal-to-player is
  // short, so a P1/P2 regression window can't accidentally drain lives to 0.
  ALIEN_FIRE_INTERVAL: 45, // fixed-steps between alien shots
  ALIEN_BULLET_SPEED: 5, // px per fixed step, travels downward (+y)
};
