// SI.Collision - pure AABB overlap math. Edge-touch is explicitly excluded:
// boxes that only share a boundary do not count as overlapping.
(function () {
  function aabbOverlap(a, b) {
    return (
      a.x < b.x + b.w &&
      b.x < a.x + a.w &&
      a.y < b.y + b.h &&
      b.y < a.y + a.h
    );
  }

  SI.Collision = { aabbOverlap };
})();
