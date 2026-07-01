---
summary: "Spec diff slice-live-clamp: 4 missing, 4 added, 0 kept."
---

# Spec diff — slice-live-clamp

Canonical audit record: intent spec vs. as-built spec.

## ✅ Delivered as planned (0)
_none_

## ⚠️ Planned but missing (4)
- `clamp(x, lo, hi)` returns `x` if `lo <= x <= hi`.
- `clamp(x, lo, hi)` returns `lo` if `x < lo`.
- `clamp(x, lo, hi)` returns `hi` if `x > hi`.
- `clamp(x, lo, hi)` throws a `RangeError` if `lo > hi`.

## ➕ Built beyond plan (4)
- Returns the input value `x` clamped within the inclusive range `[lo, hi]`.
- If `lo` is greater than `hi`, throws a `RangeError` with the message "Lower bound cannot be greater than upper bound".
- Uses `Math.max(x, lo)` to ensure the result is not less than `lo`.
- Uses `Math.min(..., hi)` to ensure the result does not exceed `hi`.
