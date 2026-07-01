export function clamp(x, lo, hi) {
  if (lo > hi) {
    throw new RangeError("Lower bound cannot be greater than upper bound");
  }
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}
