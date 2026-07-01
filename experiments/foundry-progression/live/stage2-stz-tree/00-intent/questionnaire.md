---
summary: "Elicitation for slice-live-clamp: 1 done-predicates, complexity 1."
complexity: 1
---

# Elicitation — slice-live-clamp

## Questionnaire
- **request:** export function clamp(x: number, lo: number, hi: number): number — returns x clamped into [lo, hi]; throws RangeError when lo > hi.
- **scope:** single-repo
- **mode:** foundry

## Done predicates (machine-checkable)
- `clamp(5,0,3) === 3` (test)
