// collision.js — pure AABB math, no rendering/audio/DOM deps.
//
// Independent shape: overlap decomposed onto each axis via a 1-D interval test,
// rather than one four-term boolean. Edge-touch is EXCLUDED — a shared boundary
// (e.g. a.x + a.w === b.x) is NOT an overlap — enforced by strict inequalities.
(function (SI) {
  'use strict';

  // Boxes are documented as {x, y, w, h} in the contract, while gameState
  // entities use {x, y, width, height}. Accept either so the pure function is
  // correct against both spellings of the same box.
  function width(box) {
    return box.w != null ? box.w : box.width;
  }
  function height(box) {
    return box.h != null ? box.h : box.height;
  }

  // Half-open interval overlap: [minA, minA+sizeA) vs [minB, minB+sizeB).
  // Strict < on both sides means touching endpoints do not count as overlap.
  function intervalsOverlap(minA, sizeA, minB, sizeB) {
    return minA < minB + sizeB && minB < minA + sizeA;
  }

  SI.Collision = {
    aabbOverlap: function (a, b) {
      return (
        intervalsOverlap(a.x, width(a), b.x, width(b)) &&
        intervalsOverlap(a.y, height(a), b.y, height(b))
      );
    },
  };
})(window.SI = window.SI || {});
