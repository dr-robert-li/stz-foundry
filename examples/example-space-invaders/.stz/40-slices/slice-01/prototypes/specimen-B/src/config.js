// SI.Config — named game constants. No magic numbers scattered elsewhere.
(function (SI) {
  'use strict';

  SI.Config = {
    // Fixed-timestep accumulator step (ADR-002). 1000/60 == 16.666...ms.
    FIXED_TIMESTEP_MS: 1000 / 60,

    // Alien grid.
    ALIEN_ROWS: 5,
    ALIEN_COLS: 11,

    // Player.
    STARTING_LIVES: 3,

    // Alien point values by row band (top rows worth the most).
    POINTS_TOP_ROW: 30,
    POINTS_MIDDLE_ROWS: 20,
    POINTS_BOTTOM_ROWS: 10,

    // UFO bonus is a random value in this inclusive range (SI.RNG-driven).
    UFO_BONUS_MIN: 50,
    UFO_BONUS_MAX: 300
  };
})(window.SI = window.SI || {});
