---
summary: Sealed held-out test held-out/sealed.mjs (read-only; judge-loaded only).
sealed: true
---

import { strict as assert } from "assert";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import { readFile } from "fs/promises";
import path from "path";

const implPath = process.argv[2];
if (!implPath) {
  console.error("Usage: node sealed.mjs <absolute-path-to-impl.mjs>");
  process.exit(1);
}

// Dynamically import the implementation
const impl = await import(path.resolve(implPath));

let passed = 0;
let total = 0;

// Test cases
try {
  // Valid clamping scenarios
  assert.strictEqual(impl.clamp(5, 0, 3), 3); // Upper bound clamp
  assert.strictEqual(impl.clamp(-1, 0, 10), 0); // Lower bound clamp
  assert.strictEqual(impl.clamp(7, 2, 9), 7); // Within range
  assert.strictEqual(impl.clamp(Number.POSITIVE_INFINITY, -5, 5), 5); // Infinity case
  assert.strictEqual(impl.clamp(Number.NEGATIVE_INFINITY, -5, 5), -5); // Negative Infinity case
  assert.strictEqual(impl.clamp(NaN, 0, 1), NaN); // NaN input
  assert.strictEqual(impl.clamp(0, -Infinity, Infinity), 0); // Full range with infinities

  // Edge cases and error conditions
  try {
    impl.clamp(10, 20, 15); // lo > hi should throw RangeError
    assert.fail("Expected RangeError for lo > hi");
  } catch (e) {
    if (!(e instanceof RangeError)) {
      console.error("Expected RangeError but got:", e);
      process.exit(1);
    }
  }

  passed = 8; // All tests passed
} finally {
  total = 8;
}

// Output result
const passRate = passed / total;
console.log(JSON.stringify({ passed, total, passRate }));

if (passRate === 1) {
  process.exit(0);
} else {
  process.exit(1);
}
