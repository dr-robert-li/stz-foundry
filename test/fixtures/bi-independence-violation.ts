/**
 * NEGATIVE CONTROL ONLY (Phase 8 — Admission + build, Plan 08-01, REQ-52,
 * design §3 F-22). This module is a deliberately-broken sibling of
 * `test/fixtures/bi-reference-interpreter.ts`: it imports a helper from the
 * generator it is supposed to be independent of — exactly the shared-helper
 * violation design §3's independence claim forbids ("a shared import ...
 * would break independence by letting a bug in that shared helper
 * canonicalize as truth on both paths").
 *
 * It exists SOLELY so the import-graph independence guard in
 * `test/foundry-bi-warehouse.test.ts` has something REAL to catch. A
 * structural check that only ever runs against the correct, unbroken
 * interpreter proves nothing about whether it would catch a violation
 * (`test/fixtures/answer-key-violation.ts`'s own doc comment, RESEARCH
 * Pitfall 5, carried forward verbatim into this phase) — this file is that
 * violation, written down once.
 *
 * Never imported by anything under `src/`. Never executed by any test — the
 * import-graph walker reads this file as TEXT (a regex over `from "..."`
 * specifiers), never as an executable module; nothing here ever runs.
 * Deleting this file silently weakens the independence claim: without it,
 * the walker's zero-intersection assertion on the REAL interpreter would
 * stay green even if that interpreter were later changed to import the
 * generator, because there would be nothing proving the walker is capable
 * of catching that shape of violation in the first place.
 */
import { composeReferenceSql } from "../../src/foundry/bi-warehouse.js";

/** The violation: "recomputing" the expected result by borrowing the
 *  generator's OWN SQL-composing helper instead of implementing the logic
 *  independently. Never called by any test — its existence in the source
 *  text is the only thing the walker needs. */
export function fakeRecomputeViaGeneratorHelper(spec: Parameters<typeof composeReferenceSql>[0]): string {
  return composeReferenceSql(spec);
}
