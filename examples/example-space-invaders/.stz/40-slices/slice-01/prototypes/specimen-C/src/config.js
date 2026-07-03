// SI.Config — named game constants. No magic numbers scattered elsewhere.
window.SI = window.SI || {};

SI.Config = {
  FIXED_TIMESTEP_MS: 1000 / 60, // ~16.667ms

  ALIEN_ROWS: 5,
  ALIEN_COLS: 11,

  STARTING_LIVES: 3,

  // Point values by alien row-tier (10 = back row, 30 = front row).
  POINTS_LOW: 10,
  POINTS_MID: 20,
  POINTS_HIGH: 30,

  UFO_BONUS_MIN: 50,
  UFO_BONUS_MAX: 300,

  // Grid march direction: aliens start moving this way (matches the classic
  // "upper-left to right" snake march used by the loop/game logic later).
  UPPER_SNAKE: { startDirection: 1, dropOnEdge: true },
};
