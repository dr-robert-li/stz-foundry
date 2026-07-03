// config.js — named game constants (ADR-001 namespace, UPPER_SNAKE per conventions).
(function (SI) {
  'use strict';

  SI.Config = {
    // Fixed-timestep loop (ADR-002). ~16.667ms ≈ 60 updates/sec.
    FIXED_TIMESTEP_MS: 16.667,

    // Alien grid.
    ALIEN_ROWS: 5,
    ALIEN_COLS: 11,

    // Player.
    STARTING_LIVES: 3,

    // Alien score values: 10 / 20 / 30 (the three distinct point tiers).
    ALIEN_POINTS: [10, 20, 30],

    // UFO bonus range (inclusive), awarded via SI.RNG in later slices.
    UFO_BONUS_MIN: 50,
    UFO_BONUS_MAX: 300,
  };
})(window.SI = window.SI || {});
