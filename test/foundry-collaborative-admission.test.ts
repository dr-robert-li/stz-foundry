/**
 * The collaborative-admission gate (Phase 20 — Collaborative admission axis
 * battery, Plan 20-01, REQ-79). Every throwing assertion checks the thrown
 * message's CONTENT, never bare `.toThrow()` — same house rule as
 * `test/foundry-vertical-admission.test.ts`, whose `thrown()` helper is
 * copied verbatim below.
 *
 * D-12 ("sibling, never a widening") is pinned as one fact in one
 * `describe` block: both `COLLABORATIVE_ADMISSION.size === 1` and
 * `VERTICAL_ADMISSION.size === 5` are asserted together, so a reader never
 * has to join two separate claims from two separate files.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COLLABORATIVE_ADMISSION,
  CollaborativeRefusedError,
  admitCollaborative,
  requireCollaborativeAdmitted,
  assertAdmittedVerdict,
  type CollaborativeKB,
  type CollaborativeAdmissionRecord,
} from "../src/foundry/collaborative-admission.js";
import { VERTICAL_ADMISSION, type Vertical } from "../src/foundry/vertical-admission.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = join(repoRoot, "test", "fixtures", "stark");

function thrown(fn: () => unknown): Error {
  try {
    fn();
  } catch (e) {
    return e as Error;
  }
  throw new Error("expected fn to throw, it did not");
}

const ALL_VERTICALS: Vertical[] = [
  "data-ops",
  "bi-analytics",
  "performance-marketing",
  "customer-support",
  "revops-gtm-exec-strategy",
];

describe("both unions, one fact: the collaborative table is a sibling, never a widening (D-12)", () => {
  it("COLLABORATIVE_ADMISSION has exactly one row keyed stark-prime, and VERTICAL_ADMISSION still has all five rows", () => {
    expect(COLLABORATIVE_ADMISSION.size).toBe(1);
    expect(new Set(COLLABORATIVE_ADMISSION.keys())).toEqual(new Set(["stark-prime"]));
    expect(VERTICAL_ADMISSION.size).toBe(5);
    expect(new Set(VERTICAL_ADMISSION.keys())).toEqual(new Set(ALL_VERTICALS));
  });
});

describe("the pin and lineage — the single typed home Phases 21-22 read from (D-04)", () => {
  const record = COLLABORATIVE_ADMISSION.get("stark-prime")!;

  it("carries the pinned revisionSha, lineage, acceptedBy, and both fixture paths", () => {
    expect(record.revisionSha).toBe("88269e23e90587f99476c5dd74e235a0877e69be");
    expect(record.lineage).toBe("constructed:stark-prime");
    expect(record.acceptedBy).toBe("dr-robert-li");
    expect(record.selectionFixturePath).toBe("test/fixtures/stark/prime-selection.json");
    expect(record.heldoutFixturePath).toBe("test/fixtures/stark/prime-heldout.json");
  });

  it("cross-checks revisionSha against the real fixture's own meta.hf_revision, not a second hardcoded copy", () => {
    const selection = JSON.parse(readFileSync(join(fixtureDir, "prime-selection.json"), "utf8"));
    expect(selection.meta.hf_revision).toBe(record.revisionSha);
  });

  it("cross-checks acceptedBy and lineage against the committed oracle receipt, not a second hardcoded copy", () => {
    const receipt = JSON.parse(readFileSync(join(fixtureDir, "oracle-receipt.json"), "utf8"));
    expect(receipt.acceptedBy).toBe(record.acceptedBy);
    expect(receipt.lineage).toContain(record.lineage);
  });
});

describe("requireCollaborativeAdmitted — the verdict (D-03)", () => {
  it("returns the record for stark-prime and does not throw", () => {
    const record = requireCollaborativeAdmitted("stark-prime");
    expect(record.verdict).toBe("admitted");
  });
});

describe("assertAdmittedVerdict — the refusal branch, driven directly against synthetic records (WR-03)", () => {
  // The sealed table has exactly one row and D-12 forbids widening it just to
  // reach "pending"/"refused" — a hand-built record bypassing the table is
  // the only way to exercise this branch. A mutation flipping `!==` to `===`,
  // or deleting the guard entirely, must turn one of these two tests red.
  const baseRecord: CollaborativeAdmissionRecord = {
    kb: "stark-prime",
    verdict: "admitted",
    revisionSha: "synthetic",
    selectionFixturePath: "synthetic",
    heldoutFixturePath: "synthetic",
    lineage: "synthetic",
    acceptedBy: "synthetic",
  };

  it("a synthetic record with verdict \"pending\" throws, naming the kb and verdict", () => {
    const err = thrown(() => assertAdmittedVerdict("stark-prime", { ...baseRecord, verdict: "pending" }));
    expect(err).toBeInstanceOf(CollaborativeRefusedError);
    expect(err.message).toContain("stark-prime");
    expect(err.message).toContain("pending");
  });

  it("a synthetic record with verdict \"refused\" throws, naming the kb and verdict", () => {
    const err = thrown(() => assertAdmittedVerdict("stark-prime", { ...baseRecord, verdict: "refused" }));
    expect(err).toBeInstanceOf(CollaborativeRefusedError);
    expect(err.message).toContain("stark-prime");
    expect(err.message).toContain("refused");
  });

  it("a synthetic record with verdict \"admitted\" does not throw", () => {
    expect(() => assertAdmittedVerdict("stark-prime", baseRecord)).not.toThrow();
  });
});

describe("admitCollaborative — unknown kb fails closed (never defaults to admitted or pending)", () => {
  it("a kb absent from the table throws, naming the unknown key and listing the known ones", () => {
    const err = thrown(() => admitCollaborative("stark-other" as CollaborativeKB));
    expect(err).toBeInstanceOf(CollaborativeRefusedError);
    expect(err.message).toContain("stark-other");
    expect(err.message).toContain("stark-prime");
  });
});

describe("the admission table is sealed at RUNTIME, not merely typed readonly (T-20-03)", () => {
  // Asserting on the substring "sealed", not the error class: `sealTable`
  // throws `VerticalRefusedError` by construction (the documented ponytail
  // wart above), and asserting the class here would encode the wart as a
  // requirement of this module.
  const mutable = () => COLLABORATIVE_ADMISSION as unknown as Map<CollaborativeKB, CollaborativeAdmissionRecord>;

  it("set() on the admission table throws, message contains 'sealed'", () => {
    const err = thrown(() =>
      mutable().set("stark-prime", {
        kb: "stark-prime",
        verdict: "admitted",
        revisionSha: "forged",
        selectionFixturePath: "forged",
        heldoutFixturePath: "forged",
        lineage: "forged",
        acceptedBy: "forged",
      }),
    );
    expect(err.message).toContain("sealed");
  });

  it("delete() and clear() on the admission table throw, message contains 'sealed'", () => {
    expect(thrown(() => mutable().delete("stark-prime")).message).toContain("sealed");
    expect(thrown(() => mutable().clear()).message).toContain("sealed");
  });
});

describe("record immutability — a caller cannot flip a verdict through a held reference", () => {
  it("assigning to a field of the returned record does not change it", () => {
    const record = admitCollaborative("stark-prime");
    const originalVerdict = record.verdict;
    try {
      (record as { verdict: string }).verdict = "refused";
    } catch {
      /* frozen records may throw in strict mode — either way, nothing changes */
    }
    expect(admitCollaborative("stark-prime").verdict).toBe(originalVerdict);
    expect(record.verdict).toBe(originalVerdict);
  });
});
