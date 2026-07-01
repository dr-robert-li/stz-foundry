---
summary: "Pressure log slice-live-clamp: 1 culled specimen(s)."
---

# Pressure log — slice-live-clamp

## specimen-b
- **culled because:** gate testPassRate=1.00

```diff
+++ impl.mjs
export function clamp(x, lo, hi) {
  if (lo > hi) {
    throw new RangeError("Lower bound cannot be greater than upper bound");
  }
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}
```
