---
summary: "Run config: balanced slicing, N=4, coverage≥0.9, mutation standard, conventions standard, dark-factory on."
---

# Run configuration

- **Slicing granularity:** balanced
- **Specimen fan-out (N):** 4
- **Strictness:** coverage ≥ 0.9, mutation standard, conventions standard
- **Dark-factory mode:** **on** — autonomous end-to-end, human gates skipped (except the F2 predicate gate)

## Models per role

| role | model |
|---|---|
| planning | sonnet |
| research | haiku |
| execution | sonnet |
| testing | sonnet |
| validation | sonnet |
| judging | opus |
