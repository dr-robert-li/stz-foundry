// rng.js — first file in load order, so it owns the namespace bootstrap (ADR-001).
// Seedable PRNG. Independent choice: a 32-bit xorshift (not the mulberry32/sfc32
// the ADR sketches) so this reference does not reconstruct the primary's stream.
// SI.RNG.next() returns a float in [0, 1), deterministic for a given seed.
//
// The IIFE receives the namespace as an argument (bootstrapping it once here),
// so no bare top-level name leaks and the module works whether `window` is the
// browser global or a plain {} injected by a Node test harness.
(function (SI) {
  'use strict';

  // Default to a fixed non-zero state so next() is usable before an explicit
  // seed() call. xorshift is stuck at 0, so a seed of 0 is remapped.
  var state = 0x2545f491;

  function normalizeSeed(n) {
    var x = (n | 0) >>> 0; // coerce to uint32
    return x === 0 ? 0x9e3779b9 : x; // avoid the all-zero fixed point
  }

  SI.RNG = {
    seed: function (n) {
      state = normalizeSeed(n);
    },
    next: function () {
      var x = state;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      state = x >>> 0; // keep 32-bit unsigned
      // state is always in [1, 2^32 - 1], so the quotient is in (0, 1) ⊂ [0, 1).
      return state / 4294967296; // divide by 2^32
    },
  };
})(window.SI = window.SI || {});
