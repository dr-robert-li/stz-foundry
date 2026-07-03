// SI.RNG — seedable PRNG (sfc32), Math.random()-compatible interface.
// No Math.random() anywhere in this project — see ADR-003.
window.SI = window.SI || {};

SI.RNG = (function () {
  // sfc32 internal state (four 32-bit words).
  let a = 0;
  let b = 0;
  let c = 0;
  let d = 0;

  // sfc32 core generator — returns a float in [0, 1).
  function sfc32() {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  // splitmix32 — expands a single integer seed into four well-mixed state
  // words for sfc32 (a single seed word alone gives sfc32 a weak start).
  function splitmix32(seedRef) {
    return function next() {
      seedRef.value = (seedRef.value + 0x9e3779b9) | 0;
      let t = seedRef.value;
      t ^= t >>> 15;
      t = Math.imul(t, 0x85ebca6b);
      t ^= t >>> 13;
      t = Math.imul(t, 0xc2b2ae35);
      t ^= t >>> 16;
      return t >>> 0;
    };
  }

  function seed(n) {
    const seedRef = { value: n >>> 0 };
    const gen = splitmix32(seedRef);
    a = gen();
    b = gen();
    c = gen();
    d = gen();
    // Discard a handful of outputs so early calls don't reflect the seed
    // expansion too directly.
    for (let i = 0; i < 15; i++) sfc32();
  }

  // Deterministic default so the game is never accidentally reliant on
  // Math.random()/Date.now() before something explicitly seeds it.
  seed(0);

  return {
    seed: seed,
    next: sfc32,
  };
})();
