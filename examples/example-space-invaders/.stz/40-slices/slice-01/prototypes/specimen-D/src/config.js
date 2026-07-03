// SI.Config — every named game constant, frozen so it can't drift at
// runtime. No magic numbers scattered through game logic — see conventions.md.
window.SI = window.SI || {};

SI.Config = Object.freeze({
  // Fixed-timestep accumulator step (~16.667ms => 60 logic updates/sec).
  FIXED_TIMESTEP_MS: 1000 / 60,

  // Alien grid.
  GRID_ROWS: 5,
  GRID_COLS: 11,

  STARTING_LIVES: 3,

  // Alien point values by row tier (low row = highest value nearest player
  // is a game-design detail owned by later slices; this just names the
  // three tiers required by the intent).
  POINTS_LOW: 10,
  POINTS_MID: 20,
  POINTS_HIGH: 30,

  // UFO bonus score range (inclusive), actual value drawn via SI.RNG.
  UFO_BONUS_MIN: 50,
  UFO_BONUS_MAX: 300,
});
