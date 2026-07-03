// SI.RNG — seedable PRNG (mulberry32), Math.random()-compatible interface.
// ADR-001: this is the first concatenated module, so it owns the one-time
// window.SI bootstrap.
window.SI = window.SI || {};

(function () {
  var state = 0;

  function seed(n) {
    // mulberry32 wants a 32-bit unsigned integer seed.
    state = n >>> 0;
  }

  function next() {
    // mulberry32: https://gist.github.com/tommyettinger/46a874533244883189143505d203312
    state = (state + 0x6d2b79f5) | 0;
    var t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Default-seed so calling next() before an explicit seed() is still
  // deterministic (per ADR-003: a fixed default, always overridable).
  seed(1);

  window.SI.RNG = {
    seed: seed,
    next: next,
  };
})();
