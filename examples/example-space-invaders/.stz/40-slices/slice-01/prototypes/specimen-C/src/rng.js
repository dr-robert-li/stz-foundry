// SI.RNG — seedable 32-bit xorshift PRNG, Math.random()-compatible interface.
window.SI = window.SI || {};

(function () {
  // ponytail: single module-level state var scoped inside this IIFE, not a
  // bare top-level binding — safe under concatenation (ADR-001).
  let state = 1;

  function seed(n) {
    // xorshift32 requires a non-zero 32-bit state, so fold the seed through
    // a cheap mix and guard the stuck-at-zero case explicitly.
    let s = (n | 0) ^ 0x9e3779b9;
    if (s === 0) s = 0x9e3779b9;
    state = s >>> 0;
  }

  function next() {
    // xorshift32 core (Marsaglia).
    let x = state;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    if (x === 0) x = 0x9e3779b9; // guard: never let state collapse to 0
    state = x;
    return state / 4294967296; // -> [0, 1)
  }

  seed(Date.now());

  SI.RNG = { seed: seed, next: next };
})();
