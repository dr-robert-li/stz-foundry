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

  // --- slice-02 additions (player-move-shoot-kill) ---------------------
  // Default canvas dimensions, used when SI.Game.init() is called without
  // an explicit {width,height}.
  CANVAS_WIDTH: 800,
  CANVAS_HEIGHT: 600,

  // Player ship: dimensions + constant per-fixed-step move distance.
  PLAYER_WIDTH: 40,
  PLAYER_HEIGHT: 20,
  PLAYER_STEP: 4, // px per fixed step (never scaled by dt, per ADR-002)
  PLAYER_Y_MARGIN: 30, // px from bottom edge to player's bottom edge

  // Player bullet: dimensions + constant per-fixed-step move distance.
  BULLET_WIDTH: 3,
  BULLET_HEIGHT: 12,
  BULLET_STEP: 8, // px per fixed step, moves up (decreasing y)

  // Alien grid layout: dimensions + spacing, data-driven (no per-row branching).
  ALIEN_WIDTH: 30,
  ALIEN_HEIGHT: 20,
  ALIEN_H_SPACING: 15,
  ALIEN_V_SPACING: 15,
  ALIEN_GRID_LEFT: 50,
  ALIEN_GRID_TOP: 50,
};

// Points-by-row table (row 0 = top). A plain array lookup, not a branch —
// row index directly selects the exact point value (10/20/30).
window.SI.Config.ALIEN_ROW_POINTS = [
  window.SI.Config.ALIEN_POINTS_ROW_HIGH,
  window.SI.Config.ALIEN_POINTS_ROW_MID,
  window.SI.Config.ALIEN_POINTS_ROW_MID,
  window.SI.Config.ALIEN_POINTS_ROW_LOW,
  window.SI.Config.ALIEN_POINTS_ROW_LOW,
];
