/**
 * Collaborative-mode battery loader (Phase 20 — Collaborative admission axis
 * battery, Plan 20-01, REQ-79). Admission-gated, fail-closed, gold-stripped:
 * `buildCollaborativeBattery` calls `requireCollaborativeAdmitted` FIRST,
 * before any file is touched, then reads the fixture path off the returned
 * record — never from a second literal (D-04) — and delegates to the pure
 * transform `tasksFromFixture`.
 *
 * Neither this module nor `collaborative-admission.ts` mints a branded
 * `AgentBattery` this phase (FA-2 / RESEARCH assumption A1, confirmed at the
 * Task 1 checkpoint): the only correctness signal available at fixture-load
 * time is the gold set D-08 forbids putting in the task, and the one
 * non-leaking check family is deferred to Phase 22. Phase 22 owns the
 * checks question and the branded-battery constructor.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { requireCollaborativeAdmitted } from "./collaborative-admission.js";

// src/foundry/collaborative-battery.ts -> src/foundry -> src -> repo root.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Structurally compatible with `BatteryTask`'s `id` and `prompt` so it rides
 *  on `runAgentBattery`'s existing shape as data, not as a change to that
 *  function. No builder/answerer prompt slot and no handoff-hash slot: those
 *  are properties of a candidate under evaluation, and there is no candidate
 *  at fixture-load time — Phase 22 adds them when it introduces the runner. */
export interface CollaborativeBatteryTask {
  id: string;
  queryId: number;
  prompt: string;
}

export class CollaborativeBatteryRefusedError extends Error {
  constructor(message: string) {
    super(`[foundry:collaborative-battery] ${message}`);
    this.name = "CollaborativeBatteryRefusedError";
  }
}

interface StarkFixturePair {
  query_id: number;
  query: string;
  answer_ids: number[];
}

interface StarkFixture {
  meta: { pool: string; kb: string; hf_revision: string; sample_size: number; [key: string]: unknown };
  pairs: StarkFixturePair[];
}

/**
 * One pool's validation identity: the marker `tasksForPool` checks
 * `fixture.meta.pool` against, and the refusal message to raise when it
 * disagrees. Kept as data (not a branch inside the shared helper) so the
 * selection and heldout callers can carry their own refusal wording without
 * the shared guard sequence needing to know which caller it is running for.
 */
interface PoolIdentity {
  marker: string;
  buildRefusalMessage: (observedPool: unknown) => string;
}

const SELECTION_POOL: PoolIdentity = {
  marker: "selection",
  buildRefusalMessage: (observedPool) =>
    `fixture pool ${JSON.stringify(observedPool)} is not "selection" — only the sealed ` +
    `selection pool may be materialised into tasks; the heldout pool stays out of every ` +
    `search-side code path until Phase 23 (D-05, D-06)`,
};

// D-07's opt-in door. "heldout" is `HELDOUT_POOL.marker` itself and appears
// in this message purely as the expected value being named alongside the
// observed one (the behaviour Task 1 of 23-03-PLAN.md requires) — it is not
// a second place the marker is hardcoded for comparison purposes.
const HELDOUT_POOL: PoolIdentity = {
  marker: "heldout",
  buildRefusalMessage: (observedPool) =>
    `fixture pool ${JSON.stringify(observedPool)} is not "heldout" — only the sealed heldout ` +
    `pool may be materialised by this loader (D-07)`,
};

/**
 * The shared validation body both public loaders delegate to (Task 1 of
 * 23-03-PLAN.md). Everything `tasksFromFixture` performed before Phase 23 —
 * the meta-object check, the pool check, the kb check, the revision check,
 * the sample-size-versus-actual-pair-count check, and the per-pair field
 * checks with the duplicate-query-id set — lives here unchanged in sequence
 * and in every message except the pool check, which now reads its expected
 * marker and refusal wording from `pool` rather than a hardcoded literal.
 * Builds each task by naming its three fields explicitly, never by spreading
 * the parsed pair, so gold ids and any future fixture field cannot ride
 * along into the task record (D-08). Derives the task `id` from the pair's
 * own `query_id`, never the loop index (the Phase-18 spike measured
 * `query_id` and subscript diverging on real split data). Sorts the
 * returned tasks by ascending `query_id` before returning — both committed
 * fixtures already carry their pairs in that order, so this is a documented
 * guarantee rather than a behaviour change, and it is what lets a caller
 * (the detached round driver) interleave per-query without re-deriving
 * order itself.
 *
 * `expectedRevisionSha` is required, not optional (G-20-1/T-20-15): an
 * optional pin is a pin a future direct caller silently skips, the same
 * "routed around" species this guard closes. The value must come from the
 * calling public loader's own `record.revisionSha` read — the admission
 * record stays its single typed home (D-04) — so the check cannot be routed
 * around by a second literal either.
 */
function tasksForPool(
  fixture: StarkFixture,
  expectedRevisionSha: string,
  pool: PoolIdentity,
): CollaborativeBatteryTask[] {
  if (typeof fixture?.meta !== "object" || fixture.meta === null) {
    throw new CollaborativeBatteryRefusedError(
      `fixture.meta is ${JSON.stringify(fixture?.meta)} — a fixture with no meta object cannot be admitted`,
    );
  }
  if (!Array.isArray(fixture.pairs)) {
    throw new CollaborativeBatteryRefusedError(
      `fixture.pairs is ${JSON.stringify(fixture.pairs)}, expected an array`,
    );
  }
  if (fixture.meta.pool !== pool.marker) {
    throw new CollaborativeBatteryRefusedError(pool.buildRefusalMessage(fixture.meta.pool));
  }
  // Allowlist on STaRK's own kb name for the single admitted row, same shape
  // as the pool guard above — an unrecognised value is refused as firmly as
  // a known-wrong one (T-20-18). "prime" is STaRK's own name for the kb;
  // "stark-prime" (`CollaborativeKB`, the admission-table row id) is a
  // different string for the same kb (FA-3), pinned independently by
  // `test/stark-fixtures.test.ts`.
  if (fixture.meta.kb !== "prime") {
    throw new CollaborativeBatteryRefusedError(
      `fixture kb ${JSON.stringify(fixture.meta.kb)} is not "prime" — only the admitted STaRK kb's ` +
        `own fixtures may be materialised into tasks`,
    );
  }
  if (typeof fixture.meta.hf_revision !== "string" || fixture.meta.hf_revision !== expectedRevisionSha) {
    throw new CollaborativeBatteryRefusedError(
      `fixture hf_revision ${JSON.stringify(fixture.meta.hf_revision)} does not match the admission ` +
        `record's pinned revisionSha ${JSON.stringify(expectedRevisionSha)} — a fixture harvested at ` +
        `a different KB snapshot than the pin claims must not be scored as though it were the ` +
        `pinned one (mirrors tools/stark-eval/score_one.py's assert_pinned_revision)`,
    );
  }
  // A battery with no tasks trivially passes every candidate agent — restates,
  // at this altitude, the refusal `battery-types.ts` already performs one
  // altitude up, which this phase's plain task list does not currently route
  // through (T-20-16). Sits after the pool and kb guards so a fixture that is
  // already invalid on pool or kb keeps refusing there, not here.
  if (fixture.pairs.length === 0) {
    throw new CollaborativeBatteryRefusedError(
      `fixture pairs is an empty array (0 pairs) — a battery with no tasks trivially passes ` +
        `every candidate agent, so a zero-row fixture is never a valid battery input`,
    );
  }
  // Internal consistency only: the expected count comes from the fixture's
  // own declared metadata, never from a count written into this file — a
  // literal standing in for either side would make the loader lie the moment
  // the fixture is legitimately resampled (T-20-17).
  if (typeof fixture.meta.sample_size !== "number" || fixture.meta.sample_size !== fixture.pairs.length) {
    throw new CollaborativeBatteryRefusedError(
      `fixture declares meta.sample_size ${JSON.stringify(fixture.meta.sample_size)} but pairs.length ` +
        `is ${fixture.pairs.length} — a truncated or over-long fixture must not load cleanly`,
    );
  }
  const seen = new Set<number>();
  const tasks: CollaborativeBatteryTask[] = [];
  fixture.pairs.forEach((pair, index) => {
    if (typeof pair.query_id !== "number") {
      throw new CollaborativeBatteryRefusedError(
        `pair at position ${index} has query_id ${JSON.stringify(pair.query_id)}, not a number — a ` +
          `pair with no usable id must not become a task whose identity is undefined (D-13)`,
      );
    }
    if (typeof pair.query !== "string" || pair.query.length === 0) {
      throw new CollaborativeBatteryRefusedError(
        `pair at position ${index} has query ${JSON.stringify(pair.query)}, expected a non-empty ` +
          `string (D-13)`,
      );
    }
    if (seen.has(pair.query_id)) {
      throw new CollaborativeBatteryRefusedError(
        `duplicate query_id ${JSON.stringify(pair.query_id)} in fixture — never taking whichever ` +
          `row matched first`,
      );
    }
    seen.add(pair.query_id);
    // D-08: every field is named explicitly. A `...pair` spread here would
    // let `answer_ids` — the gold set this fixture also carries — ride along
    // into a task an agent can see. Add a field to the task by naming it,
    // never by widening this construction to a spread.
    tasks.push({
      id: `stark-prime:${pair.query_id}`,
      queryId: pair.query_id,
      prompt: pair.query,
    });
  });
  tasks.sort((a, b) => a.queryId - b.queryId);
  return tasks;
}

/**
 * The pure transform, separately testable and free of I/O. Refuses unless
 * `fixture.meta.pool` is exactly `"selection"` — an allowlist, so an
 * unrecognised or absent pool value (including the sealed heldout pool) is
 * refused just as firmly as any other (D-06). Delegates the full guard
 * sequence to `tasksForPool` with the selection pool identity (Task 1 of
 * 23-03-PLAN.md) — same name, same signature, same behaviour as before
 * Phase 23 from every caller's perspective.
 */
export function tasksFromFixture(
  fixture: StarkFixture,
  expectedRevisionSha: string,
): CollaborativeBatteryTask[] {
  return tasksForPool(fixture, expectedRevisionSha, SELECTION_POOL);
}

/**
 * Resolves a task by its own `queryId` — never by position, never by
 * `Array.prototype.find` (a `find` returns the first match and cannot tell
 * one match from several, the exact "never first-match" behaviour D-13
 * forbids). Both failure modes are named, thrown refusals:
 *
 * - zero matches: an id absent from the battery is never resolved to
 *   `undefined` — the caller is Phase 21's bridge rejoining gold, and an
 *   `undefined` task there becomes a silently unscored or mis-scored query
 *   rather than a stopped run.
 * - more than one match: unreachable through `tasksFromFixture` (construction
 *   already refuses duplicates), and stated anyway so the two guards stay
 *   independent — a later change that weakens construction cannot quietly
 *   make this lookup ambiguous.
 */
export function taskForQueryId(
  tasks: CollaborativeBatteryTask[],
  queryId: number,
): CollaborativeBatteryTask {
  const matches = tasks.filter((task) => task.queryId === queryId);
  if (matches.length === 0) {
    throw new CollaborativeBatteryRefusedError(
      `no task carries query_id ${JSON.stringify(queryId)} — an id absent from the battery is never ` +
        `resolved to a default`,
    );
  }
  if (matches.length > 1) {
    throw new CollaborativeBatteryRefusedError(
      `query_id ${JSON.stringify(queryId)} matches ${matches.length} tasks — never resolved by ` +
        `taking whichever matched first`,
    );
  }
  return matches[0]!;
}

/**
 * The public entry point. Calls `requireCollaborativeAdmitted("stark-prime")`
 * FIRST, before any file is touched, then reads the fixture from the
 * returned record's `selectionFixturePath` — the path comes from the
 * admission record and from nowhere else, a second literal here would be
 * the drift D-04 exists to prevent. Deleting the require call turns a named
 * test red, which is why it sits on this path and not in a wrapper.
 */
export function buildCollaborativeBattery(): CollaborativeBatteryTask[] {
  const record = requireCollaborativeAdmitted("stark-prime");
  const fixture = readFixtureOrRefuse(record.selectionFixturePath);
  return tasksFromFixture(fixture, record.revisionSha);
}

/**
 * D-07's explicitly separate opt-in entry point to the sealed heldout pool.
 * Only the detached round driver (`experiments/collab-round/_collab-round.ts`,
 * Plan 23-07) may import this function. It exists as its own named export
 * rather than as a pool parameter on `tasksFromFixture` precisely so a
 * structural scan — `test/collaborative-heldout-import-boundary.test.ts` —
 * can distinguish the two doors by name rather than by inspecting call
 * arguments. Phase 20's D-05 and D-06 sealed this pool until Phase 23;
 * calling `requireCollaborativeAdmitted` first and reading the fixture from
 * the admission record's own `heldoutFixturePath` (never a second literal,
 * D-04) mirrors `buildCollaborativeBattery` exactly, so the two loaders
 * differ only in which pool identity and which fixture path they carry.
 */
export function buildCollaborativeHeldoutBattery(): CollaborativeBatteryTask[] {
  const record = requireCollaborativeAdmitted("stark-prime");
  const fixture = readFixtureOrRefuse(record.heldoutFixturePath);
  return tasksForPool(fixture, record.revisionSha, HELDOUT_POOL);
}

/**
 * The one place this module touches the filesystem — reads and parses the
 * fixture named by an admission record's `selectionFixturePath`, re-throwing
 * both a missing file and malformed JSON as a named `CollaborativeBatteryRefusedError`
 * rather than a raw `ENOENT`/`SyntaxError`. Exported (not inlined into
 * `buildCollaborativeBattery`) so a future refactor that lets the fixture
 * path vary (D-01's stated amendment path) can drive this exact guard with a
 * fixture path of its own, without needing to delete the real committed
 * fixture to exercise the failure branch.
 */
export function readFixtureOrRefuse(fixturePath: string): StarkFixture {
  let raw: string;
  try {
    raw = readFileSync(join(repoRoot, fixturePath), "utf8");
  } catch (err) {
    throw new CollaborativeBatteryRefusedError(
      `could not read fixture at ${fixturePath}: ${(err as Error).message}`,
    );
  }
  try {
    return JSON.parse(raw) as StarkFixture;
  } catch (err) {
    throw new CollaborativeBatteryRefusedError(
      `could not parse fixture at ${fixturePath} as JSON: ${(err as Error).message}`,
    );
  }
}
