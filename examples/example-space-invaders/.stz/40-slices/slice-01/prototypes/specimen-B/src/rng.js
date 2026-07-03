// SI.RNG — seedable Linear Congruential Generator (Numerical Recipes constants).
// Math.random()-compatible interface: seed(n) / next() -> [0, 1).
(function (SI) {
  'use strict';

  // ponytail: classic LCG (a=1664525, c=1013904223, m=2^32); good enough
  // determinism/spread for game randomness, not cryptographic use.
  var MODULUS = 4294967296; // 2^32
  var MULTIPLIER = 1664525;
  var INCREMENT = 1013904223;

  var state = 1;

  function seed(n) {
    // Coerce to an unsigned 32-bit integer so any numeric seed (including
    // negatives or floats) lands in a well-defined starting state.
    state = Number(n) >>> 0;
  }

  function next() {
    // Math.imul keeps the multiply within 32-bit semantics (matches the
    // classic LCG recurrence exactly, no floating-point drift).
    state = (Math.imul(state, MULTIPLIER) + INCREMENT) >>> 0;
    return state / MODULUS;
  }

  // Default seed so SI.RNG.next() is usable before any explicit seed() call;
  // tests/production code should call seed() for reproducibility.
  seed(Date.now());

  SI.RNG = {
    seed: seed,
    next: next
  };
})(window.SI = window.SI || {});
