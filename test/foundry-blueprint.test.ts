/**
 * `HarnessBlueprint` + `assemble()` (Phase 2 — Harness blueprint assembly,
 * Plan 02-01, REQ-28..REQ-32). Follows `test/foundry-component-archive.test.ts`'s
 * convention exactly: real temp dirs (`mkdtempSync`), no fs mock, no network,
 * no daemon.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  makeHarnessBlueprint,
  resolveComponentRef,
  assemble,
  batteryRef,
  SLOT_REQUIREMENT,
  BlueprintError,
  type ComponentRef,
} from "../src/foundry/blueprint.js";
import {
  componentVariantId,
  componentIncumbent,
  promotionGate,
  appendComponentArchiveEntry,
  makeComponentArchiveEntry,
  type PromotionInputs,
} from "../src/harness.js";
import { generateFixtureBattery, acceptedGeneratorReceipt, DATA_OPS_GENERATOR_ID } from "../src/foundry/fixture-warehouse.js";
import { FOUNDRY_CONFIG_TEMPLATE } from "../src/foundry/runner.js";

function tmpRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** All seven `PromotionInputs` booleans true by default; pass overrides to
 *  flip exactly one (mirrors `test/foundry-component-archive.test.ts`'s
 *  `sevenGates`, generalized to accept per-field overrides). */
function sevenGates(overrides?: Partial<PromotionInputs>): PromotionInputs {
  return {
    beatsIncumbent: true,
    hackClean: true,
    sealOk: true,
    interfaceParity: true,
    diversityOk: true,
    rubricCalibrated: true,
    exogenousLineage: true,
    ...overrides,
  };
}

const AGENTS_DEF = "---\nname: stz-data-ops-planner\ntools: Read, Write\n---\nData-ops planner agent body.";
const COMMANDS_DEF = "---\nname: data-ops-audit\n---\nData-ops audit command body.";

describe("blueprint tracer — the real data-ops battery, real promoted archive entries, two ComponentRefs, two FileOps", () => {
  it("assembles the real data-ops battery + two real promoted archive entries into two ordered FileOps, writing nothing", () => {
    const archiveRoot = tmpRoot("stz-blueprint-archive-");
    const assetRoot = tmpRoot("stz-blueprint-assets-");
    const targetParent = tmpRoot("stz-blueprint-target-");
    const targetDir = join(targetParent, "target");
    try {
      mkdirSync(join(assetRoot, "agents"), { recursive: true });
      mkdirSync(join(assetRoot, "commands"), { recursive: true });
      writeFileSync(join(assetRoot, "agents", "stz-data-ops-planner.md"), AGENTS_DEF, "utf8");
      writeFileSync(join(assetRoot, "commands", "data-ops-audit.md"), COMMANDS_DEF, "utf8");

      const battery = generateFixtureBattery(4242, "data-ops-blueprint-tracer");

      appendComponentArchiveEntry(
        archiveRoot,
        "agents",
        makeComponentArchiveEntry({
          slot: "agents",
          specimenId: "agents-winner",
          definitionText: AGENTS_DEF,
          parent: null,
          searchFitness: 0.9,
          promotionFitness: 0.8,
          advantage: 0.1,
          gates: sevenGates(),
        }),
      );
      appendComponentArchiveEntry(
        archiveRoot,
        "commands",
        makeComponentArchiveEntry({
          slot: "commands",
          specimenId: "commands-winner",
          definitionText: COMMANDS_DEF,
          parent: null,
          searchFitness: 0.85,
          promotionFitness: 0.75,
          advantage: 0.1,
          gates: sevenGates(),
        }),
      );

      const agentsRef: ComponentRef = {
        slot: "agents",
        sourcePath: "agents/stz-data-ops-planner.md",
        winnerVariantId: componentVariantId(AGENTS_DEF),
        batteryId: battery.id,
      };
      const commandsRef: ComponentRef = {
        slot: "commands",
        sourcePath: "commands/data-ops-audit.md",
        winnerVariantId: componentVariantId(COMMANDS_DEF),
        batteryId: battery.id,
      };

      const bp = makeHarnessBlueprint({
        schemaVersion: 1,
        id: "data-ops-blueprint-tracer",
        vertical: "data-ops",
        version: "0.1.0",
        agents: [agentsRef],
        commands: [commandsRef],
        skills: [],
        hooks: [],
        docs: [],
        bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
        battery: batteryRef(battery),
        oracle: battery.receipt,
      });

      expect(Object.is(bp.oracle, battery.receipt)).toBe(true);
      expect(Object.is(bp.oracle, acceptedGeneratorReceipt(DATA_OPS_GENERATOR_ID))).toBe(false);

      const result = assemble(bp, { archiveRoot, assetRoot, targetDir });

      expect(result.blueprint).toBe(bp);
      expect(result.ops).toHaveLength(2);
      expect(result.ops[0]!.to).toBe(join(targetDir, "agents", "stz-data-ops-planner.md"));
      expect(result.ops[0]!.from).toBe(join(assetRoot, "agents", "stz-data-ops-planner.md"));
      expect(result.ops[1]!.to).toBe(join(targetDir, "commands", "data-ops-audit.md"));
      expect(existsSync(targetDir)).toBe(false);
    } finally {
      rmSync(archiveRoot, { recursive: true, force: true });
      rmSync(assetRoot, { recursive: true, force: true });
      rmSync(targetParent, { recursive: true, force: true });
    }
  });
});

describe("SLOT_REQUIREMENT — sealed, exactly agents+commands required (RESEARCH Pitfall 3)", () => {
  it("is non-vacuous: exactly two required slots", () => {
    expect([...SLOT_REQUIREMENT.entries()].filter(([, v]) => v === "required")).toHaveLength(2);
    expect(() => (SLOT_REQUIREMENT as unknown as Map<string, string>).set("docs", "required")).toThrow();
  });

  it("the required subset deep-equals exactly ['agents','commands'], and every mutator throws at runtime", () => {
    const requiredSlots = [...SLOT_REQUIREMENT]
      .filter(([, v]) => v === "required")
      .map(([k]) => k)
      .sort();
    expect(requiredSlots).toEqual(["agents", "commands"]);

    const mutable = SLOT_REQUIREMENT as unknown as Map<string, string>;
    expect(() => mutable.set("docs", "required")).toThrow();
    expect(() => mutable.delete("agents")).toThrow();
    expect(() => mutable.clear()).toThrow();
  });
});

// ── Task 2: THE trap — a REFUSED archive entry must never resolve as a
// winner, mutation-proven (M1). ────────────────────────────────────────────

const REFUSED_DEF = "---\nname: stz-refused-planner\n---\nRefused specimen body.";
const PROMOTED_DEF = "---\nname: stz-promoted-planner\n---\nPromoted specimen body.";
const REFUSED_BATTERY_ID = "data-ops-refused-entry-battery";

describe("ComponentRef resolution refuses a REFUSED archive entry even when it is the slot's highest-fitness incumbent", () => {
  it("the divergence from componentIncumbent is real, not hypothetical, and the resolver refuses the refused entry while resolving the promoted one", () => {
    const archiveRoot = tmpRoot("stz-blueprint-trap-archive-");
    const assetRoot = tmpRoot("stz-blueprint-trap-assets-");
    try {
      mkdirSync(join(assetRoot, "agents"), { recursive: true });
      writeFileSync(join(assetRoot, "agents", "refused.md"), REFUSED_DEF, "utf8");
      writeFileSync(join(assetRoot, "agents", "promoted.md"), PROMOTED_DEF, "utf8");

      // Refused: higher fitness, but hackClean=false — promotionGate refuses.
      const refusedEntry = makeComponentArchiveEntry({
        slot: "agents",
        specimenId: "refused-specimen",
        definitionText: REFUSED_DEF,
        parent: null,
        searchFitness: 0.97,
        promotionFitness: 0.95,
        advantage: 0.05,
        gates: sevenGates({ hackClean: false }),
      });
      // Promoted: lower fitness, all seven gates true.
      const promotedEntry = makeComponentArchiveEntry({
        slot: "agents",
        specimenId: "promoted-specimen",
        definitionText: PROMOTED_DEF,
        parent: null,
        searchFitness: 0.42,
        promotionFitness: 0.4,
        advantage: 0.02,
        gates: sevenGates(),
      });
      appendComponentArchiveEntry(archiveRoot, "agents", refusedEntry);
      appendComponentArchiveEntry(archiveRoot, "agents", promotedEntry);

      expect(promotionGate(refusedEntry.gates).promote).toBe(false);
      expect(promotionGate(promotedEntry.gates).promote).toBe(true);

      // The pre-existing helper WOULD have picked the refused one — the
      // divergence this resolver must not copy.
      const incumbent = componentIncumbent(archiveRoot, "agents");
      expect(incumbent).not.toBeNull();
      expect(incumbent!.variantId).toBe(componentVariantId(REFUSED_DEF));

      const refusedRef: ComponentRef = {
        slot: "agents",
        sourcePath: "agents/refused.md",
        winnerVariantId: componentVariantId(REFUSED_DEF),
        batteryId: REFUSED_BATTERY_ID,
      };
      expect(() =>
        resolveComponentRef(refusedRef, { archiveRoot, assetRoot, batteryId: REFUSED_BATTERY_ID }),
      ).toThrow(BlueprintError);
      try {
        resolveComponentRef(refusedRef, { archiveRoot, assetRoot, batteryId: REFUSED_BATTERY_ID });
      } catch (e) {
        expect(e).toBeInstanceOf(BlueprintError);
        expect((e as Error).message).toContain("agents");
        expect((e as Error).message).toMatch(/REFUSED/);
      }

      const promotedRef: ComponentRef = {
        slot: "agents",
        sourcePath: "agents/promoted.md",
        winnerVariantId: componentVariantId(PROMOTED_DEF),
        batteryId: REFUSED_BATTERY_ID,
      };
      const resolved = resolveComponentRef(promotedRef, { archiveRoot, assetRoot, batteryId: REFUSED_BATTERY_ID });
      expect(resolved.entry.variantId).toBe(componentVariantId(PROMOTED_DEF));
    } finally {
      rmSync(archiveRoot, { recursive: true, force: true });
      rmSync(assetRoot, { recursive: true, force: true });
    }
  });
});

describe("assemble refuses whole, never partially, when one ref among several is refused", () => {
  it("throws rather than returning a partial ops array", () => {
    const archiveRoot = tmpRoot("stz-blueprint-partial-archive-");
    const assetRoot = tmpRoot("stz-blueprint-partial-assets-");
    const targetParent = tmpRoot("stz-blueprint-partial-target-");
    const targetDir = join(targetParent, "target");
    try {
      mkdirSync(join(assetRoot, "agents"), { recursive: true });
      mkdirSync(join(assetRoot, "commands"), { recursive: true });
      writeFileSync(join(assetRoot, "agents", "refused.md"), REFUSED_DEF, "utf8");
      writeFileSync(join(assetRoot, "commands", "data-ops-audit.md"), COMMANDS_DEF, "utf8");

      appendComponentArchiveEntry(
        archiveRoot,
        "agents",
        makeComponentArchiveEntry({
          slot: "agents",
          specimenId: "refused-specimen",
          definitionText: REFUSED_DEF,
          parent: null,
          searchFitness: 0.97,
          promotionFitness: 0.95,
          advantage: 0.05,
          gates: sevenGates({ hackClean: false }),
        }),
      );
      appendComponentArchiveEntry(
        archiveRoot,
        "commands",
        makeComponentArchiveEntry({
          slot: "commands",
          specimenId: "commands-winner",
          definitionText: COMMANDS_DEF,
          parent: null,
          searchFitness: 0.85,
          promotionFitness: 0.75,
          advantage: 0.1,
          gates: sevenGates(),
        }),
      );

      const battery = generateFixtureBattery(4243, "data-ops-blueprint-partial");
      const bp = makeHarnessBlueprint({
        schemaVersion: 1,
        id: "data-ops-blueprint-partial",
        vertical: "data-ops",
        version: "0.1.0",
        agents: [
          {
            slot: "agents",
            sourcePath: "agents/refused.md",
            winnerVariantId: componentVariantId(REFUSED_DEF),
            batteryId: battery.id,
          },
        ],
        commands: [
          {
            slot: "commands",
            sourcePath: "commands/data-ops-audit.md",
            winnerVariantId: componentVariantId(COMMANDS_DEF),
            batteryId: battery.id,
          },
        ],
        skills: [],
        hooks: [],
        docs: [],
        bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
        battery: batteryRef(battery),
        oracle: battery.receipt,
      });

      expect(() => assemble(bp, { archiveRoot, assetRoot, targetDir })).toThrow(BlueprintError);
      expect(existsSync(targetDir)).toBe(false);
    } finally {
      rmSync(archiveRoot, { recursive: true, force: true });
      rmSync(assetRoot, { recursive: true, force: true });
      rmSync(targetParent, { recursive: true, force: true });
    }
  });
});

// ── Plan 02-02, Task 1: the refusal matrix, R-a..R-h ───────────────────────
//
// Every row asserts on the thrown MESSAGE naming the offending slot/path/
// hash/id — not merely that something threw (acceptance criteria). The
// drift/re-hash test below is the load-bearing one: it calls `assemble`
// TWICE on the SAME blueprint object with a `writeFileSync` between the
// calls, proving re-hash at assembly rather than a cached/memoized result.

/** One real, valid two-slot blueprint's worth of archive + asset fixtures —
 *  a real promoted `agents` and `commands` entry, plus the two matching
 *  `ComponentRef`s — so each refusal-matrix test only has to construct the
 *  ONE thing it means to break. Caller owns cleanup of the returned roots. */
function setupValidBlueprintFixture(seed: number, idSuffix: string) {
  const archiveRoot = tmpRoot("stz-blueprint-matrix-archive-");
  const assetRoot = tmpRoot("stz-blueprint-matrix-assets-");
  mkdirSync(join(assetRoot, "agents"), { recursive: true });
  mkdirSync(join(assetRoot, "commands"), { recursive: true });
  writeFileSync(join(assetRoot, "agents", "planner.md"), AGENTS_DEF, "utf8");
  writeFileSync(join(assetRoot, "commands", "audit.md"), COMMANDS_DEF, "utf8");
  appendComponentArchiveEntry(
    archiveRoot,
    "agents",
    makeComponentArchiveEntry({
      slot: "agents",
      specimenId: "agents-winner",
      definitionText: AGENTS_DEF,
      parent: null,
      searchFitness: 0.9,
      promotionFitness: 0.8,
      advantage: 0.1,
      gates: sevenGates(),
    }),
  );
  appendComponentArchiveEntry(
    archiveRoot,
    "commands",
    makeComponentArchiveEntry({
      slot: "commands",
      specimenId: "commands-winner",
      definitionText: COMMANDS_DEF,
      parent: null,
      searchFitness: 0.85,
      promotionFitness: 0.75,
      advantage: 0.1,
      gates: sevenGates(),
    }),
  );
  const battery = generateFixtureBattery(seed, `data-ops-blueprint-matrix-${idSuffix}`);
  const agentsRef: ComponentRef = {
    slot: "agents",
    sourcePath: "agents/planner.md",
    winnerVariantId: componentVariantId(AGENTS_DEF),
    batteryId: battery.id,
  };
  const commandsRef: ComponentRef = {
    slot: "commands",
    sourcePath: "commands/audit.md",
    winnerVariantId: componentVariantId(COMMANDS_DEF),
    batteryId: battery.id,
  };
  return { archiveRoot, assetRoot, battery, agentsRef, commandsRef };
}

function cleanupFixture(f: { archiveRoot: string; assetRoot: string }): void {
  rmSync(f.archiveRoot, { recursive: true, force: true });
  rmSync(f.assetRoot, { recursive: true, force: true });
}

describe("R-a — required slot unfilled", () => {
  it("refuses agents: [], naming 'agents'", () => {
    const f = setupValidBlueprintFixture(5001, "ra-agents");
    try {
      expect(() =>
        makeHarnessBlueprint({
          schemaVersion: 1,
          id: "matrix-ra-agents",
          vertical: "data-ops",
          version: "0.1.0",
          agents: [],
          commands: [f.commandsRef],
          skills: [],
          hooks: [],
          docs: [],
          bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
          battery: batteryRef(f.battery),
          oracle: f.battery.receipt,
        }),
      ).toThrow(/empty required slot "agents"/);
    } finally {
      cleanupFixture(f);
    }
  });

  it("refuses commands: [], naming 'commands'", () => {
    const f = setupValidBlueprintFixture(5002, "ra-commands");
    try {
      expect(() =>
        makeHarnessBlueprint({
          schemaVersion: 1,
          id: "matrix-ra-commands",
          vertical: "data-ops",
          version: "0.1.0",
          agents: [f.agentsRef],
          commands: [],
          skills: [],
          hooks: [],
          docs: [],
          bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
          battery: batteryRef(f.battery),
          oracle: f.battery.receipt,
        }),
      ).toThrow(/empty required slot "commands"/);
    } finally {
      cleanupFixture(f);
    }
  });

  it("constructs fine with skills/hooks/docs empty — the optional set is genuinely optional", () => {
    const f = setupValidBlueprintFixture(5003, "ra-optional");
    try {
      expect(() =>
        makeHarnessBlueprint({
          schemaVersion: 1,
          id: "matrix-ra-optional",
          vertical: "data-ops",
          version: "0.1.0",
          agents: [f.agentsRef],
          commands: [f.commandsRef],
          skills: [],
          hooks: [],
          docs: [],
          bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
          battery: batteryRef(f.battery),
          oracle: f.battery.receipt,
        }),
      ).not.toThrow();
    } finally {
      cleanupFixture(f);
    }
  });
});

describe("R-b — ref.slot disagrees with the array it sits in", () => {
  it("refuses a ComponentRef whose own .slot is 'commands' placed in the agents array, naming both slots", () => {
    const f = setupValidBlueprintFixture(5004, "rb");
    try {
      const misplacedRef: ComponentRef = { ...f.commandsRef, sourcePath: "commands/audit.md" };
      expect(() =>
        makeHarnessBlueprint({
          schemaVersion: 1,
          id: "matrix-rb",
          vertical: "data-ops",
          version: "0.1.0",
          agents: [misplacedRef],
          commands: [f.commandsRef],
          skills: [],
          hooks: [],
          docs: [],
          bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
          battery: batteryRef(f.battery),
          oracle: f.battery.receipt,
        }),
      ).toThrow(/slot "agents".*own \.slot is "commands"/s);
    } finally {
      cleanupFixture(f);
    }
  });
});

describe("R-c — sourcePath escapes assetRoot, or the file is missing", () => {
  it("refuses a relative traversal sourcePath through resolveContained's own message", () => {
    const f = setupValidBlueprintFixture(5005, "rc-relative");
    const targetParent = tmpRoot("stz-blueprint-rc-relative-target-");
    try {
      const escapingRef: ComponentRef = {
        slot: "agents",
        sourcePath: "../outside.md",
        winnerVariantId: "deadbeefdeadbeef",
        batteryId: f.battery.id,
      };
      const bp = makeHarnessBlueprint({
        schemaVersion: 1,
        id: "matrix-rc-relative",
        vertical: "data-ops",
        version: "0.1.0",
        agents: [escapingRef],
        commands: [f.commandsRef],
        skills: [],
        hooks: [],
        docs: [],
        bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
        battery: batteryRef(f.battery),
        oracle: f.battery.receipt,
      });
      const targetDir = join(targetParent, "target");
      expect(() => assemble(bp, { archiveRoot: f.archiveRoot, assetRoot: f.assetRoot, targetDir })).toThrow(
        /path-traversal guard/,
      );
    } finally {
      cleanupFixture(f);
      rmSync(targetParent, { recursive: true, force: true });
    }
  });

  it("refuses an absolute sourcePath the same way, through resolveContained's own message", () => {
    const f = setupValidBlueprintFixture(5006, "rc-absolute");
    const targetParent = tmpRoot("stz-blueprint-rc-absolute-target-");
    try {
      const escapingRef: ComponentRef = {
        slot: "agents",
        sourcePath: "/etc/passwd",
        winnerVariantId: "deadbeefdeadbeef",
        batteryId: f.battery.id,
      };
      const bp = makeHarnessBlueprint({
        schemaVersion: 1,
        id: "matrix-rc-absolute",
        vertical: "data-ops",
        version: "0.1.0",
        agents: [escapingRef],
        commands: [f.commandsRef],
        skills: [],
        hooks: [],
        docs: [],
        bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
        battery: batteryRef(f.battery),
        oracle: f.battery.receipt,
      });
      const targetDir = join(targetParent, "target");
      expect(() => assemble(bp, { archiveRoot: f.archiveRoot, assetRoot: f.assetRoot, targetDir })).toThrow(
        /path-traversal guard/,
      );
    } finally {
      cleanupFixture(f);
      rmSync(targetParent, { recursive: true, force: true });
    }
  });

  it("refuses a missing component file, naming it", () => {
    const f = setupValidBlueprintFixture(5007, "rc-missing");
    const targetParent = tmpRoot("stz-blueprint-rc-missing-target-");
    try {
      const missingRef: ComponentRef = {
        slot: "agents",
        sourcePath: "agents/does-not-exist.md",
        winnerVariantId: "deadbeefdeadbeef",
        batteryId: f.battery.id,
      };
      const bp = makeHarnessBlueprint({
        schemaVersion: 1,
        id: "matrix-rc-missing",
        vertical: "data-ops",
        version: "0.1.0",
        agents: [missingRef],
        commands: [f.commandsRef],
        skills: [],
        hooks: [],
        docs: [],
        bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
        battery: batteryRef(f.battery),
        oracle: f.battery.receipt,
      });
      const targetDir = join(targetParent, "target");
      expect(() => assemble(bp, { archiveRoot: f.archiveRoot, assetRoot: f.assetRoot, targetDir })).toThrow(
        /sourcePath "agents\/does-not-exist\.md" does not exist/,
      );
    } finally {
      cleanupFixture(f);
      rmSync(targetParent, { recursive: true, force: true });
    }
  });
});

describe("R-d — drifted content hash, naming both hashes", () => {
  it("refuses when winnerVariantId no longer matches the live file's hash", () => {
    const f = setupValidBlueprintFixture(5008, "rd");
    const targetParent = tmpRoot("stz-blueprint-rd-target-");
    try {
      const staleHash = componentVariantId("some entirely different text");
      const driftedRef: ComponentRef = {
        slot: "agents",
        sourcePath: "agents/planner.md",
        winnerVariantId: staleHash,
        batteryId: f.battery.id,
      };
      const bp = makeHarnessBlueprint({
        schemaVersion: 1,
        id: "matrix-rd",
        vertical: "data-ops",
        version: "0.1.0",
        agents: [driftedRef],
        commands: [f.commandsRef],
        skills: [],
        hooks: [],
        docs: [],
        bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
        battery: batteryRef(f.battery),
        oracle: f.battery.receipt,
      });
      const targetDir = join(targetParent, "target");
      const liveHash = componentVariantId(AGENTS_DEF);
      expect(() => assemble(bp, { archiveRoot: f.archiveRoot, assetRoot: f.assetRoot, targetDir })).toThrow(
        new RegExp(`live hash "${liveHash}" !== claimed winnerVariantId "${staleHash}"`),
      );
    } finally {
      cleanupFixture(f);
      rmSync(targetParent, { recursive: true, force: true });
    }
  });
});

describe("drift is detected by RE-HASHING at assembly — the SAME blueprint object, twice", () => {
  it("assembles clean, then refuses after the live component file is edited between two assemble() calls on the SAME object", () => {
    const f = setupValidBlueprintFixture(5009, "rehash");
    const targetParent = tmpRoot("stz-blueprint-rehash-target-");
    try {
      const bp = makeHarnessBlueprint({
        schemaVersion: 1,
        id: "matrix-rehash",
        vertical: "data-ops",
        version: "0.1.0",
        agents: [f.agentsRef],
        commands: [f.commandsRef],
        skills: [],
        hooks: [],
        docs: [],
        bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
        battery: batteryRef(f.battery),
        oracle: f.battery.receipt,
      });
      const targetDir = join(targetParent, "target");

      // First call, on `bp`: clean.
      const first = assemble(bp, { archiveRoot: f.archiveRoot, assetRoot: f.assetRoot, targetDir });
      expect(first.ops).toHaveLength(2);

      // Edit the live file BETWEEN the two calls — not a fresh blueprint,
      // the SAME `bp` object.
      writeFileSync(join(f.assetRoot, "agents", "planner.md"), AGENTS_DEF + "\nEDITED AFTER FIRST ASSEMBLE", "utf8");

      // Second call, on the SAME `bp` object: must re-hash the live file and
      // refuse — proving resolution is not cached at construction and not
      // memoized across calls.
      expect(() => assemble(bp, { archiveRoot: f.archiveRoot, assetRoot: f.assetRoot, targetDir })).toThrow(
        /drifted — live hash/,
      );
    } finally {
      cleanupFixture(f);
      rmSync(targetParent, { recursive: true, force: true });
    }
  });
});

describe("R-e — ComponentRef.batteryId does not match the blueprint's own battery", () => {
  it("refuses, naming both ids", () => {
    const f = setupValidBlueprintFixture(5010, "re");
    const targetParent = tmpRoot("stz-blueprint-re-target-");
    try {
      const mismatchedRef: ComponentRef = { ...f.agentsRef, batteryId: "some-other-battery" };
      const bp = makeHarnessBlueprint({
        schemaVersion: 1,
        id: "matrix-re",
        vertical: "data-ops",
        version: "0.1.0",
        agents: [mismatchedRef],
        commands: [f.commandsRef],
        skills: [],
        hooks: [],
        docs: [],
        bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
        battery: batteryRef(f.battery),
        oracle: f.battery.receipt,
      });
      const targetDir = join(targetParent, "target");
      expect(() => assemble(bp, { archiveRoot: f.archiveRoot, assetRoot: f.assetRoot, targetDir })).toThrow(
        new RegExp(`batteryId "some-other-battery" does not match blueprint battery "${f.battery.id}"`),
      );
    } finally {
      cleanupFixture(f);
      rmSync(targetParent, { recursive: true, force: true });
    }
  });
});

describe("R-f — no archive entry matches the live content hash", () => {
  it("refuses, naming slot and hash", () => {
    const archiveRoot = tmpRoot("stz-blueprint-rf-archive-");
    const assetRoot = tmpRoot("stz-blueprint-rf-assets-");
    const targetParent = tmpRoot("stz-blueprint-rf-target-");
    try {
      mkdirSync(join(assetRoot, "agents"), { recursive: true });
      mkdirSync(join(assetRoot, "commands"), { recursive: true });
      const orphanText = "---\nname: stz-orphan-planner\n---\nNever archived.";
      writeFileSync(join(assetRoot, "agents", "orphan.md"), orphanText, "utf8");
      writeFileSync(join(assetRoot, "commands", "audit.md"), COMMANDS_DEF, "utf8");
      appendComponentArchiveEntry(
        archiveRoot,
        "commands",
        makeComponentArchiveEntry({
          slot: "commands",
          specimenId: "commands-winner",
          definitionText: COMMANDS_DEF,
          parent: null,
          searchFitness: 0.85,
          promotionFitness: 0.75,
          advantage: 0.1,
          gates: sevenGates(),
        }),
      );
      const battery = generateFixtureBattery(5011, "data-ops-blueprint-matrix-rf");
      const orphanHash = componentVariantId(orphanText);
      const orphanRef: ComponentRef = {
        slot: "agents",
        sourcePath: "agents/orphan.md",
        winnerVariantId: orphanHash,
        batteryId: battery.id,
      };
      const commandsRef: ComponentRef = {
        slot: "commands",
        sourcePath: "commands/audit.md",
        winnerVariantId: componentVariantId(COMMANDS_DEF),
        batteryId: battery.id,
      };
      const bp = makeHarnessBlueprint({
        schemaVersion: 1,
        id: "matrix-rf",
        vertical: "data-ops",
        version: "0.1.0",
        agents: [orphanRef],
        commands: [commandsRef],
        skills: [],
        hooks: [],
        docs: [],
        bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
        battery: batteryRef(battery),
        oracle: battery.receipt,
      });
      const targetDir = join(targetParent, "target");
      expect(() => assemble(bp, { archiveRoot, assetRoot, targetDir })).toThrow(
        new RegExp(`slot "agents" hash "${orphanHash}" matches no archive entry`),
      );
    } finally {
      rmSync(archiveRoot, { recursive: true, force: true });
      rmSync(assetRoot, { recursive: true, force: true });
      rmSync(targetParent, { recursive: true, force: true });
    }
  });
});

describe("R-h — two ComponentRefs resolve to the same destination path", () => {
  it("refuses, naming both source paths and the shared destination", () => {
    const archiveRoot = tmpRoot("stz-blueprint-rh-archive-");
    const assetRoot = tmpRoot("stz-blueprint-rh-assets-");
    const targetParent = tmpRoot("stz-blueprint-rh-target-");
    try {
      mkdirSync(join(assetRoot, "agents", "sub-a"), { recursive: true });
      mkdirSync(join(assetRoot, "agents", "sub-b"), { recursive: true });
      mkdirSync(join(assetRoot, "commands"), { recursive: true });
      const textA = "---\nname: stz-collision-a\n---\nBody A.";
      const textB = "---\nname: stz-collision-b\n---\nBody B.";
      // Same basename ("planner.md"), different subdirectories — the
      // resolved destination (targetDir/agents/planner.md) collides.
      writeFileSync(join(assetRoot, "agents", "sub-a", "planner.md"), textA, "utf8");
      writeFileSync(join(assetRoot, "agents", "sub-b", "planner.md"), textB, "utf8");
      writeFileSync(join(assetRoot, "commands", "audit.md"), COMMANDS_DEF, "utf8");
      appendComponentArchiveEntry(
        archiveRoot,
        "agents",
        makeComponentArchiveEntry({
          slot: "agents",
          specimenId: "collision-a",
          definitionText: textA,
          parent: null,
          searchFitness: 0.9,
          promotionFitness: 0.8,
          advantage: 0.1,
          gates: sevenGates(),
        }),
      );
      appendComponentArchiveEntry(
        archiveRoot,
        "agents",
        makeComponentArchiveEntry({
          slot: "agents",
          specimenId: "collision-b",
          definitionText: textB,
          parent: null,
          searchFitness: 0.7,
          promotionFitness: 0.6,
          advantage: 0.1,
          gates: sevenGates(),
        }),
      );
      appendComponentArchiveEntry(
        archiveRoot,
        "commands",
        makeComponentArchiveEntry({
          slot: "commands",
          specimenId: "commands-winner",
          definitionText: COMMANDS_DEF,
          parent: null,
          searchFitness: 0.85,
          promotionFitness: 0.75,
          advantage: 0.1,
          gates: sevenGates(),
        }),
      );
      const battery = generateFixtureBattery(5012, "data-ops-blueprint-matrix-rh");
      const refA: ComponentRef = {
        slot: "agents",
        sourcePath: "agents/sub-a/planner.md",
        winnerVariantId: componentVariantId(textA),
        batteryId: battery.id,
      };
      const refB: ComponentRef = {
        slot: "agents",
        sourcePath: "agents/sub-b/planner.md",
        winnerVariantId: componentVariantId(textB),
        batteryId: battery.id,
      };
      const commandsRef: ComponentRef = {
        slot: "commands",
        sourcePath: "commands/audit.md",
        winnerVariantId: componentVariantId(COMMANDS_DEF),
        batteryId: battery.id,
      };
      const bp = makeHarnessBlueprint({
        schemaVersion: 1,
        id: "matrix-rh",
        vertical: "data-ops",
        version: "0.1.0",
        agents: [refA, refB],
        commands: [commandsRef],
        skills: [],
        hooks: [],
        docs: [],
        bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
        battery: batteryRef(battery),
        oracle: battery.receipt,
      });
      const targetDir = join(targetParent, "target");
      expect(() => assemble(bp, { archiveRoot, assetRoot, targetDir })).toThrow(
        /two ComponentRefs resolving to the same destination.*planner\.md.*would silently overwrite/s,
      );
    } finally {
      rmSync(archiveRoot, { recursive: true, force: true });
      rmSync(assetRoot, { recursive: true, force: true });
      rmSync(targetParent, { recursive: true, force: true });
    }
  });
});
