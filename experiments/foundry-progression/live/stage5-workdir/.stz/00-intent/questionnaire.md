---
summary: "Elicitation for slice-live-slugify: 1 done-predicates, complexity 1."
complexity: 1
---

# Elicitation — slice-live-slugify

## Questionnaire
- **request:** export function slugify(s: string): string — lowercases, trims, collapses whitespace runs into single hyphens, and strips every character that is not a-z, 0-9, or hyphen. Throws TypeError when s is not a string.
- **scope:** single-repo
- **mode:** foundry

## Done predicates (machine-checkable)
- `slugify('Hello  World!') === 'hello-world'` (test)
