// SI.Collision — pure AABB overlap math. No canvas/audio/game-state deps.
(function (SI) {
  'use strict';

  // Axis-aligned bounding box overlap test on {x, y, w, h} rectangles.
  // Strict inequalities: edges merely touching (separation == 0) do NOT
  // count as overlap; full containment and partial overlap both do.
  function aabbOverlap(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  SI.Collision = {
    aabbOverlap: aabbOverlap
  };
})(window.SI = window.SI || {});
