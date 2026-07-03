// SI.Collision — pure AABB overlap math. No canvas/audio deps.
// window.SI is bootstrapped once in rng.js (ADR-001), which loads first.
(function () {
  // Real overlap/containment -> true. Separation AND edge-touch (boxes that
  // only share a boundary line, zero-area intersection) -> false. Strict `<`
  // comparisons make edge-touch resolve to false.
  function aabbOverlap(a, b) {
    return (
      a.x < b.x + b.w &&
      b.x < a.x + a.w &&
      a.y < b.y + b.h &&
      b.y < a.y + a.h
    );
  }

  window.SI.Collision = {
    aabbOverlap: aabbOverlap,
  };
})();
