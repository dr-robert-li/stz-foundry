// SI.RNG - seedable PRNG, Math.random()-compatible interface (ADR-003).
// Declares the SI root namespace once (ADR-001) - this file must load first.
window.SI = window.SI || {};

(function () {
  // mulberry32 - small, fast, well-distributed 32-bit PRNG.
  let state = 0;

  function seed(n) {
    state = n >>> 0;
  }

  function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  SI.RNG = { seed, next };
})();
