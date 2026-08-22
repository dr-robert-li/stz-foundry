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
  meta: { pool: string; [key: string]: unknown };
  pairs: StarkFixturePair[];
}

/**
 * The pure transform, separately testable and free of I/O. Refuses unless
 * `fixture.meta.pool` is exactly `"selection"` — an allowlist, so an
 * unrecognised or absent pool value (including the sealed heldout pool) is
 * refused just as firmly as any other (D-06). Builds each task by naming its
 * three fields explicitly, never by spreading the parsed pair, so gold ids
 * and any future fixture field cannot ride along into the task record (D-08).
 * Derives the task `id` from the pair's own `query_id`, never the loop index
 * (the Phase-18 spike measured `query_id` and subscript diverging on real
 * split data).
 */
export function tasksFromFixture(fixture: StarkFixture): CollaborativeBatteryTask[] {
  if (fixture.meta.pool !== "selection") {
    throw new CollaborativeBatteryRefusedError(
      `fixture pool ${JSON.stringify(fixture.meta.pool)} is not "selection" — only the sealed ` +
        `selection pool may be materialised into tasks; the heldout pool stays out of every ` +
        `search-side code path until Phase 23 (D-05, D-06)`,
    );
  }
  const seen = new Set<number>();
  const tasks: CollaborativeBatteryTask[] = [];
  for (const pair of fixture.pairs) {
    if (seen.has(pair.query_id)) {
      throw new CollaborativeBatteryRefusedError(
        `duplicate query_id ${JSON.stringify(pair.query_id)} in fixture — never taking whichever ` +
          `row matched first`,
      );
    }
    seen.add(pair.query_id);
    tasks.push({
      id: `stark-prime:${pair.query_id}`,
      queryId: pair.query_id,
      prompt: pair.query,
    });
  }
  return tasks;
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
  const raw = readFileSync(join(repoRoot, record.selectionFixturePath), "utf8");
  const fixture = JSON.parse(raw) as StarkFixture;
  return tasksFromFixture(fixture);
}
