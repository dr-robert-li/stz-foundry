---
description: Post-aggregation defect repair. A shipped slice winner is wrong on behaviour the sealed suite never exercised; reproduce it, mine it into a SEALED regression test (twice-verified), amend the seal, and re-run only the affected slice + its DAG dependents.
argument-hint: "<slice-id> (the slice whose winner is defective)"
---

## Setup: locate the bridge

```bash
if command -v stz >/dev/null 2>&1; then STZ='stz';
elif command -v stz-f >/dev/null 2>&1; then STZ='stz-f';
elif [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/bin/stz.mjs" ]; then STZ="node ${CLAUDE_PLUGIN_ROOT}/bin/stz.mjs";
else STZ="node $(ls -d ~/.claude/plugins/cache/*/stz-f/*/bin/stz.mjs 2>/dev/null | sort -V | tail -1)"; fi
```

# /stz-f:debug — repair a shipped defect

Dark-factory (and any autonomous run) can ship a winner that **passed its sealed
suite but is wrong** on an input the suite never covered — a blind-spot defect.
Per-slice iteration is over; the fix is not to hand-edit code, it is to make the
suite catch the defect and let selection re-run pick a correct specimen. The
sealed suite is still the source of truth, so this never edits it by hand — it
mines the defect into a new sealed case and re-runs.

## Inputs

A reproduction of the defect against the shipped winner:
- the **slice id**,
- the **exported function** that is wrong,
- the **input** (a JSON array of arguments) that triggers it,
- the **correct expected** return value (JSON).

If the user reports a bug in prose, help them reduce it to that concrete case
first. If they cannot state a machine-checkable expected value, STOP — a defect
you cannot express as `fn(input) === expected` is not one this loop can seal.

## Steps

1. **Locate the winner and the reference.** The shipped winner is the winning
   specimen's impl under `.stz/40-slices/<slice>/` (or the merged artifact); the
   reference is the test-author's `held-out/<slice>/reference/`. You need both
   paths.

2. **Mine + verify (the twice-verified oracle).** Do NOT hand-write the sealed
   test. Call the bridge, which verifies the case before it touches the seal —
   the winner must FAIL it (a real uncaught defect) and the reference must PASS
   it (satisfiable, correctly stated):

   ```bash
   $STZ bridge debug-case --root . --slice <slice> \
     --impl <winner-impl> --reference <reference-impl> \
     --fn <name> --input '<json-args-array>' --expected '<json>' \
     --note "<what the defect is>"
   ```

   - **Rejected — winner already passes:** the winner is not wrong on this case;
     you have mis-reproduced. Re-derive the input/expected.
   - **Rejected — reference fails:** your expected value is not what a
     contract-faithful implementation produces. Fix the expected, or the defect
     is a spec disagreement (escalate to a human, do not seal it).
   - **Accepted:** the case is appended to `held-out/<slice>/debug-cases.json`
     and the seal is amended. The response reports the **re-run set** (the slice
     plus every slice that transitively depends on it).

3. **Reset the re-run set.** Add `--apply` to step 2 to reset inline, or:

   ```bash
   $STZ bridge slice-reset --root . --slice <slice> --with-dependents true
   ```

   This removes the per-slice state + winner artifacts for the affected slice and
   its dependents so they are `pending` again. The sealed suite (now sharpened
   with the mined case) and the audit trail are untouched.

4. **Re-run.** Run `/stz-f:run <slice>` for the reset slice, then its dependents
   in dependency order (or `/stz-f:pipeline` to drive the frontier). The gate now
   includes the mined regression case, so the previously-shipping winner is
   culled and a specimen that handles the case wins. If NO specimen can pass the
   sharpened suite, the slice halts with a failure report — the defect is harder
   than the pool can solve, and that is a human's call.

## Why this is safe

The mined case is sealed by content hash like the rest of the held-out suite, so
it cannot be silently removed to make a defect "pass" again. The oracle refuses
to seal a case the reference cannot satisfy, so a mis-stated expectation cannot
poison the suite. And the re-run grades against the sharpened suite, so the fix
is a genuine selection outcome, not a hand-patch — fully replayable from the
audit tree (`40-slices/<slice>/debug.md` records the mined case and re-run set).
