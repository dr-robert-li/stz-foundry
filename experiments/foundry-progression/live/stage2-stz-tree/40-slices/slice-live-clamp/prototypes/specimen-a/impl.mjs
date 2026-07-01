export function clamp(x, lo, hi) {
    if (lo > hi) {
        throw new RangeError("Lower bound cannot be greater than upper bound");
    }
    return Math.min(Math.max(x, lo), hi);
}
