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

  // Slice-03 march tuning. Named constants, not scattered magic numbers.
  MARCH_STEP_X: 5, // px each alive alien moves horizontally per march step
  MARCH_ROW_STEP: 12, // px the whole grid drops on edge contact

  // Step table driving SI.Alien.marchInterval(aliveCount): how many
  // SI.Game.update() calls elapse between march steps, keyed by remaining
  // alive-alien count. Checked top-down (highest minAlive first) — first
  // tier where aliveCount >= minAlive wins. Must stay sorted descending by
  // minAlive with non-increasing interval values (55 aliens -> slowest,
  // 1 alien -> fastest) so SI.Alien.marchInterval stays monotonic
  // non-increasing across the whole 55->1 range.
  MARCH_STEP_TABLE: [
    { minAlive: 41, interval: 55 },
    { minAlive: 31, interval: 40 },
    { minAlive: 21, interval: 28 },
    { minAlive: 11, interval: 18 },
    { minAlive: 6, interval: 10 },
    { minAlive: 3, interval: 5 },
    { minAlive: 1, interval: 2 },
  ],
};
