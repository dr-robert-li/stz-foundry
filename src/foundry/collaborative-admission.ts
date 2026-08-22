/**
 * Collaborative-mode admission (Phase 20 — Collaborative admission axis
 * battery, Plan 20-01, REQ-79). A sibling of `vertical-admission.ts`, never a
 * widening of it: this module owns its own union, its own record shape and
 * its own error class, sharing only the mechanical `sealTable` helper (D-09).
 *
 * The one structural difference from the sibling record is the pin: this
 * table is the single typed home of the STaRK KB revision sha, the fixture
 * paths, and the acceptance lineage (D-04) — Phases 21 and 22 read the pin
 * from here, never from a second hardcoded literal.
 */
import { sealTable } from "./vertical-admission.js";

/** The single collaborative KB admitted as of Phase 20 (D-01). A second KB is
 *  a new member added only under the frozen design's amendment protocol —
 *  mirrors `Vertical`'s own doc comment. */
export type CollaborativeKB = "stark-prime";

export type CollaborativeAdmissionVerdict = "admitted" | "pending" | "refused";

export interface CollaborativeAdmissionRecord {
  kb: CollaborativeKB;
  verdict: CollaborativeAdmissionVerdict;
  /** The pinned HF revision sha the selection/heldout fixtures were harvested
   *  at (D-04) — the single typed home of this value. */
  revisionSha: string;
  selectionFixturePath: string;
  /** Records where Phase 23's heldout file lives and nothing more — naming a
   *  location is not the same as building a loader for it. No code in this
   *  phase may read this path. */
  heldoutFixturePath: string;
  lineage: string;
  acceptedBy: string;
}

/**
 * The one-row collaborative admission table, sealed at runtime by the
 * already-exported `sealTable` (same runtime-mutation guard as
 * `VERTICAL_ADMISSION`, one altitude down).
 *
 * ponytail: a mutation attempt on this table surfaces `VerticalRefusedError`
 * (the sibling module's error class), because `sealTable` hardcodes its own
 * throw. That is cosmetic — refusal still happens — and the upgrade path is
 * to give `sealTable` an error factory if it ever reaches a user-facing
 * message.
 */
export const COLLABORATIVE_ADMISSION: ReadonlyMap<CollaborativeKB, CollaborativeAdmissionRecord> = sealTable(
  new Map([
    [
      "stark-prime",
      {
        kb: "stark-prime",
        verdict: "admitted",
        revisionSha: "88269e23e90587f99476c5dd74e235a0877e69be",
        selectionFixturePath: "test/fixtures/stark/prime-selection.json",
        heldoutFixturePath: "test/fixtures/stark/prime-heldout.json",
        lineage: "constructed:stark-prime",
        acceptedBy: "dr-robert-li",
      },
    ],
  ]),
  "the collaborative-admission table",
);

export class CollaborativeRefusedError extends Error {
  constructor(message: string) {
    super(`[foundry:collaborative-admission] ${message}`);
    this.name = "CollaborativeRefusedError";
  }
}

/**
 * The LOOKUP step only — carries no admit/refuse opinion (mirrors
 * `admitVertical`'s own split). A kb absent from `COLLABORATIVE_ADMISSION`
 * throws; it is never defaulted to `"admitted"` or `"pending"`.
 */
export function admitCollaborative(kb: CollaborativeKB): CollaborativeAdmissionRecord {
  const record = COLLABORATIVE_ADMISSION.get(kb);
  if (!record) {
    throw new CollaborativeRefusedError(
      `kb ${JSON.stringify(kb)} is not in the admission table — an id absent from the table is ` +
        `never treated as admitted or pending (known: ` +
        `${[...COLLABORATIVE_ADMISSION.keys()].map((id) => JSON.stringify(id)).join(", ")})`,
    );
  }
  return record;
}

/**
 * The verdict guard, pulled out of `requireCollaborativeAdmitted` so it can
 * be driven directly against a synthetic record in a unit test. The sealed
 * table has exactly one row (verdict `"admitted"`), and D-12 forbids adding
 * a second row just to reach the "pending"/"refused" branch — this is the
 * only way to exercise that branch without widening the table (WR-03).
 */
export function assertAdmittedVerdict(kb: CollaborativeKB, record: CollaborativeAdmissionRecord): void {
  if (record.verdict !== "admitted") {
    throw new CollaborativeRefusedError(
      `kb ${JSON.stringify(kb)} has verdict ${JSON.stringify(record.verdict)} — no judge substitutes ` +
        `for a missing oracle; refusal is stated in the product, not papered over`,
    );
  }
}

/**
 * The separately-named THROW step (two named sequential steps, never one
 * compound boolean, so a mutation can disable exactly one — mirrors
 * `requireAdmitted`).
 */
export function requireCollaborativeAdmitted(kb: CollaborativeKB): CollaborativeAdmissionRecord {
  const record = admitCollaborative(kb);
  assertAdmittedVerdict(kb, record);
  return record;
}
