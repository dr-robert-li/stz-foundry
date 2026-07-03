// SI.Collision — pure AABB overlap math. No canvas/audio deps, no mutation.
window.SI = window.SI || {};

SI.Collision = {
  // aabbOverlap(a, b) — true when axis-aligned boxes {x, y, w, h} overlap or
  // one contains the other. Edges merely touching (zero-width intersection)
  // are NOT an overlap — every comparison is strict `<`.
  aabbOverlap: function (a, b) {
    return (
      a.x < b.x + b.w &&
      b.x < a.x + a.w &&
      a.y < b.y + b.h &&
      b.y < a.y + a.h
    );
  },
};
