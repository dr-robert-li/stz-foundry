// SI.Collision — pure AABB overlap math, no canvas/audio deps.
window.SI = window.SI || {};

(function () {
  // Reusable 1-D interval-overlap helper: true when [aStart, aStart+aLen)
  // and [bStart, bStart+bLen) overlap with a positive-length intersection.
  // Edge-touch (intervals meeting exactly at a boundary) is excluded via
  // strict '<' on both sides.
  function intervalsOverlap(aStart, aLen, bStart, bLen) {
    return aStart < bStart + bLen && bStart < aStart + aLen;
  }

  // AABB overlap composed from the 1-D helper on the x axis and y axis.
  // Rects use { x, y, w, h }. Containment counts as overlap; separation and
  // exact edge-touch do not.
  function aabbOverlap(a, b) {
    return (
      intervalsOverlap(a.x, a.w, b.x, b.w) &&
      intervalsOverlap(a.y, a.h, b.y, b.h)
    );
  }

  SI.Collision = { intervalsOverlap: intervalsOverlap, aabbOverlap: aabbOverlap };
})();
