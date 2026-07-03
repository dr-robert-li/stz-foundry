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

  // slice-05 (P4): destructible shields — a fixed grid of cells per shield,
  // each cell tracked as an integer integrity value. Geometry (SI.Shield.cellRect)
  // is pure and derived from these constants + a shield's {x,y} origin only.
  SHIELD_COUNT: 4,
  SHIELD_COLS: 6,
  SHIELD_ROWS: 4,
  SHIELD_CELL_WIDTH: 8,
  SHIELD_CELL_HEIGHT: 8,
  SHIELD_START_INTEGRITY: 4,
  SHIELD_MARGIN_ABOVE_PLAYER: 60, // px gap between shield bottom row and the player's y

  // slice-05 (P4): UFO — RNG-timed spawn schedule (SI.RNG.next() picks both
  // the next spawn delay and, on spawn, the bonus). Travels left-to-right
  // across the top of the screen at a constant per-step speed.
  UFO_WIDTH: 30,
  UFO_HEIGHT: 16,
  UFO_Y: 30,
  UFO_SPEED: 3, // px per fixed step
  UFO_SPAWN_MIN_STEPS: 300, // ~5s at the fixed step, inclusive
  UFO_SPAWN_MAX_STEPS: 600, // ~10s at the fixed step, inclusive

  // slice-05 (P4): table-based per-wave march speedup. Wave 1 reuses
  // ALIEN_MARCH_MAX_INTERVAL unchanged (P2/P3 compatibility); each
  // subsequent wave's full-grid initial interval is strictly smaller,
  // via a precomputed decay table (see SI.Alien.marchInterval).
  WAVE_MARCH_DECAY: 0.85, // per-wave multiplier applied to the max interval
  WAVE_MARCH_MIN_INTERVAL: 3, // table floor — keeps decay from collapsing to 1 too fast
};
