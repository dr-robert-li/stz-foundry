---
summary: "Intent spec for slice-live-clamp: 4 claims."
---

# Intent spec — slice-live-clamp

- `clamp(x, lo, hi)` returns `x` if `lo <= x <= hi`.
- `clamp(x, lo, hi)` returns `lo` if `x < lo`.
- `clamp(x, lo, hi)` returns `hi` if `x > hi`.
- `clamp(x, lo, hi)` throws a `RangeError` if `lo > hi`.
