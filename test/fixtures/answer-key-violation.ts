/**
 * NEGATIVE CONTROL ONLY (Phase 1 — Data-ops pilot battery, Plan 01-03,
 * REQ-24/D5, RESEARCH Pitfall 5). This module is a deliberately-broken
 * variant of the fixture-warehouse generator: it derives a "ground-truth
 * fact" from a `provider.chat()` response — exactly the α→0 negative D5
 * forbids ("no part of a constructed battery's ground truth may be
 * produced, refined, or selected by the same model or agent being
 * evaluated").
 *
 * It exists SOLELY so the import-graph independence guard in
 * `test/foundry-fixture-warehouse.test.ts` has something REAL to catch. A
 * structural check that only ever runs against the correct, unbroken
 * generator proves nothing about whether it would catch a violation
 * (RESEARCH Pitfall 5) — this file is that violation, written down once.
 *
 * Never imported by anything under `src/`. Never executed by any test — the
 * import-graph walker reads this file as TEXT (a regex over `from "..."`
 * specifiers), never as an executable module; nothing here ever runs.
 * Deleting this file silently weakens the independence claim: without it,
 * the walker's zero-intersection assertion on the REAL generator would stay
 * green even if that generator were later changed to import the provider
 * layer, because there would be nothing proving the walker is capable of
 * catching that shape of violation in the first place.
 */
import { Provider } from "../../src/foundry/provider.js";

/** The violation: a "ground-truth fact" derived from the harness under
 *  test's own provider response. This is never called by any test — its
 *  existence in the source text is the only thing the walker needs. */
export async function deriveFactViaProvider(provider: Provider): Promise<number> {
  const res = await provider.chat({
    model: "answer-key-violation-double",
    messages: [{ role: "user", content: "What is the true revenue, in cents?" }],
  });
  return Number(res.text);
}
