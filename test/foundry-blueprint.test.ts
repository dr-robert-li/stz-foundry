/**
 * `HarnessBlueprint` + `assemble()` (Phase 2 — Harness blueprint assembly,
 * Plan 02-01, REQ-28..REQ-32). Follows `test/foundry-component-archive.test.ts`'s
 * convention exactly: real temp dirs (`mkdtempSync`), no fs mock, no network,
 * no daemon.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import {
  makeHarnessBlueprint,
  resolveComponentRef,
  assemble,
  batteryRef,
  SLOT_REQUIREMENT,
  SLOT_ORDER,
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
import { validateReceipt, type OracleReceipt } from "../src/foundry/battery-types.js";
import { FOUNDRY_CONFIG_TEMPLATE } from "../src/foundry/runner.js";
import type { BatteryRef, HarnessBlueprint } from "../src/foundry/blueprint.js";

function tmpRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

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

// ── Plan 02-02, Task 2: the receipt gate is not tautological ───────────────
//
// Three distinct catches, three negative controls (each with its own "and
// this receipt passes validateReceipt/is independently exogenous on its own"
// assertion, so the test can't be satisfied by accident), plus catch 0 (an
// absent battery/oracle refused with a stated reason, not a TypeError).

describe("the receipt gate — catch 1: validateReceipt catches what nothing else does (BatteryRef is deliberately unbranded)", () => {
  it("a hand-built BatteryRef carrying a non-exogenous (anchored-judge) receipt is refused via validateReceipt's own message, even though provenance (Object.is) passes", () => {
    const nonExogenousReceipt: OracleReceipt = Object.freeze({
      kind: "anchored-judge",
      acceptedBy: "Dr. Robert Li",
      lineage: Object.freeze(["anchored-judge:j1"]) as string[],
    });
    const handBuiltBattery: BatteryRef = Object.freeze({ id: "data-ops-hand-built", receipt: nonExogenousReceipt });

    expect(() =>
      makeHarnessBlueprint({
        schemaVersion: 1,
        id: "matrix-catch1-nonexo",
        vertical: "data-ops",
        version: "0.1.0",
        agents: [],
        commands: [],
        skills: [],
        hooks: [],
        docs: [],
        bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
        battery: handBuiltBattery,
        // Deliberately the SAME object as battery.receipt — provenance
        // (step 2) passes; only validateReceipt's own exogeneity check can
        // catch this receipt.
        oracle: nonExogenousReceipt,
      }),
    ).toThrow(/is an amortizer and can never be the sole exogenous root/);
  });

  it("companion: an acceptedBy naming an agent role throws with validateReceipt's own agent-role message", () => {
    const agentRoleReceipt: OracleReceipt = Object.freeze({
      kind: "execution",
      acceptedBy: "specimen",
      lineage: Object.freeze([] as string[]) as string[],
    });
    const handBuiltBattery: BatteryRef = Object.freeze({ id: "data-ops-hand-built-2", receipt: agentRoleReceipt });

    expect(() =>
      makeHarnessBlueprint({
        schemaVersion: 1,
        id: "matrix-catch1-agentrole",
        vertical: "data-ops",
        version: "0.1.0",
        agents: [],
        commands: [],
        skills: [],
        hooks: [],
        docs: [],
        bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
        battery: handBuiltBattery,
        oracle: agentRoleReceipt,
      }),
    ).toThrow(/is an agent role — only a human may accept/);
  });
});

describe("the receipt gate — catch 2: Object.is catches what validateReceipt cannot (a substituted-but-exogenous receipt)", () => {
  it("refuses when oracle is the generator's OWN accepted receipt while battery is a real, distinct battery — field-identical, independently exogenous, still wrong provenance", () => {
    const battery = generateFixtureBattery(5101, "data-ops-blueprint-catch2-generator");
    const generatorReceipt = acceptedGeneratorReceipt(DATA_OPS_GENERATOR_ID);

    // The generator's own receipt independently passes validateReceipt on
    // its own — this is what makes the provenance check non-redundant, not
    // a second check of exogeneity. And it is field-identical but reference-
    // distinct from battery.receipt (makeBattery freezes a defensive copy).
    expect(() => validateReceipt(generatorReceipt, battery.id)).not.toThrow();
    expect(Object.is(generatorReceipt, battery.receipt)).toBe(false);

    expect(() =>
      makeHarnessBlueprint({
        schemaVersion: 1,
        id: "matrix-catch2-generator",
        vertical: "data-ops",
        version: "0.1.0",
        agents: [],
        commands: [],
        skills: [],
        hooks: [],
        docs: [],
        bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
        battery: batteryRef(battery),
        oracle: generatorReceipt,
      }),
    ).toThrow(/is not the SAME object as battery/);
  });

  it("refuses when oracle is a DIFFERENT real battery's own receipt — field-identical, independently exogenous, still wrong provenance", () => {
    const batteryA = generateFixtureBattery(5102, "data-ops-blueprint-catch2-a");
    const batteryB = generateFixtureBattery(5103, "data-ops-blueprint-catch2-b");

    // batteryB's receipt independently passes validateReceipt against
    // batteryA's id — it is a real, exogenous receipt, just the WRONG one.
    expect(() => validateReceipt(batteryB.receipt, batteryA.id)).not.toThrow();
    expect(Object.is(batteryB.receipt, batteryA.receipt)).toBe(false);

    expect(() =>
      makeHarnessBlueprint({
        schemaVersion: 1,
        id: "matrix-catch2-crossbattery",
        vertical: "data-ops",
        version: "0.1.0",
        agents: [],
        commands: [],
        skills: [],
        hooks: [],
        docs: [],
        bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
        battery: batteryRef(batteryA),
        oracle: batteryB.receipt,
      }),
    ).toThrow(/is not the SAME object as battery/);
  });
});

describe("the receipt gate — catch 3: assemble()'s call site catches what construction cannot (forged/replayed blueprint)", () => {
  it("refuses a JSON.parse(JSON.stringify(bp))-round-tripped blueprint — the replay path never passed through makeHarnessBlueprint", () => {
    const f = setupValidBlueprintFixture(5104, "catch3-replay");
    const targetParent = tmpRoot("stz-blueprint-catch3-replay-target-");
    try {
      const bp = makeHarnessBlueprint({
        schemaVersion: 1,
        id: "matrix-catch3-replay",
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

      const replayed = JSON.parse(JSON.stringify(bp)) as HarnessBlueprint;
      // The round trip broke object identity — proven directly, not assumed.
      expect(Object.is(replayed.oracle, replayed.battery.receipt)).toBe(false);

      const targetDir = join(targetParent, "target");
      expect(() =>
        assemble(replayed, { archiveRoot: f.archiveRoot, assetRoot: f.assetRoot, targetDir }),
      ).toThrow(/is not the SAME object as battery/);
    } finally {
      cleanupFixture(f);
      rmSync(targetParent, { recursive: true, force: true });
    }
  });

  it("refuses a forged object literal cast through 'as unknown as HarnessBlueprint' carrying a non-exogenous receipt — validateReceipt's own message, never having passed through makeHarnessBlueprint", () => {
    const nonExogenousReceipt: OracleReceipt = Object.freeze({
      kind: "anchored-judge",
      acceptedBy: "Dr. Robert Li",
      lineage: Object.freeze(["anchored-judge:j1"]) as string[],
    });
    const forged = {
      schemaVersion: 1,
      id: "matrix-catch3-forged",
      vertical: "data-ops",
      version: "0.1.0",
      agents: [],
      commands: [],
      skills: [],
      hooks: [],
      docs: [],
      bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
      battery: { id: "forged-battery", receipt: nonExogenousReceipt },
      oracle: nonExogenousReceipt,
    } as unknown as HarnessBlueprint;

    const targetParent = tmpRoot("stz-blueprint-catch3-forged-target-");
    try {
      expect(() =>
        assemble(forged, {
          archiveRoot: targetParent,
          assetRoot: targetParent,
          targetDir: join(targetParent, "target"),
        }),
      ).toThrow(/is an amortizer and can never be the sole exogenous root/);
    } finally {
      rmSync(targetParent, { recursive: true, force: true });
    }
  });
});

describe("the receipt gate — catch 0: an absent battery/oracle is refused with a stated reason, not a TypeError", () => {
  it("refuses a forged blueprint with oracle undefined, naming the missing field", () => {
    const battery = generateFixtureBattery(5105, "data-ops-blueprint-catch0-oracle");
    const forged = {
      schemaVersion: 1,
      id: "matrix-catch0-oracle",
      vertical: "data-ops",
      version: "0.1.0",
      agents: [],
      commands: [],
      skills: [],
      hooks: [],
      docs: [],
      bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
      battery: batteryRef(battery),
      oracle: undefined,
    } as unknown as HarnessBlueprint;

    const targetParent = tmpRoot("stz-blueprint-catch0-oracle-target-");
    try {
      expect(() =>
        assemble(forged, {
          archiveRoot: targetParent,
          assetRoot: targetParent,
          targetDir: join(targetParent, "target"),
        }),
      ).toThrow(/no "oracle" field/);
      expect(() =>
        assemble(forged, {
          archiveRoot: targetParent,
          assetRoot: targetParent,
          targetDir: join(targetParent, "target"),
        }),
      ).not.toThrow(TypeError);
    } finally {
      rmSync(targetParent, { recursive: true, force: true });
    }
  });

  it("refuses a forged blueprint with battery undefined, naming the missing field", () => {
    const battery = generateFixtureBattery(5106, "data-ops-blueprint-catch0-battery");
    const forged = {
      schemaVersion: 1,
      id: "matrix-catch0-battery",
      vertical: "data-ops",
      version: "0.1.0",
      agents: [],
      commands: [],
      skills: [],
      hooks: [],
      docs: [],
      bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
      battery: undefined,
      oracle: battery.receipt,
    } as unknown as HarnessBlueprint;

    const targetParent = tmpRoot("stz-blueprint-catch0-battery-target-");
    try {
      expect(() =>
        assemble(forged, {
          archiveRoot: targetParent,
          assetRoot: targetParent,
          targetDir: join(targetParent, "target"),
        }),
      ).toThrow(/no "battery" field/);
    } finally {
      rmSync(targetParent, { recursive: true, force: true });
    }
  });
});

// ── Plan 02-03, Task 1: determinism — explicit ordering proven against
// input-order variation, and no search reachable from the harness altitude
// ────────────────────────────────────────────────────────────────────────
//
// SC4/REQ-31's claim is "the same inputs produce byte-identical output" —
// not "byte-identical on this machine because Object.keys happened to be
// insertion-ordered." Every test below varies an input DIMENSION that would
// expose an incidental (rather than explicit) sort if one existed.

/** Two real, distinct promoted `agents` archive entries plus a `commands`
 *  entry, and the two `ComponentRef`s naming the agents entries by their OWN
 *  distinct sourcePath — so a test can reorder the two agents refs in the
 *  array without changing what either resolves to. Caller owns cleanup. */
function setupTwoAgentFixture(seed: number, idSuffix: string) {
  const archiveRoot = tmpRoot("stz-blueprint-determinism-archive-");
  const assetRoot = tmpRoot("stz-blueprint-determinism-assets-");
  mkdirSync(join(assetRoot, "agents"), { recursive: true });
  mkdirSync(join(assetRoot, "commands"), { recursive: true });
  const agentText1 = "---\nname: stz-agent-one\n---\nAgent one body.";
  const agentText2 = "---\nname: stz-agent-two\n---\nAgent two body.";
  writeFileSync(join(assetRoot, "agents", "agent-one.md"), agentText1, "utf8");
  writeFileSync(join(assetRoot, "agents", "agent-two.md"), agentText2, "utf8");
  writeFileSync(join(assetRoot, "commands", "audit.md"), COMMANDS_DEF, "utf8");
  appendComponentArchiveEntry(
    archiveRoot,
    "agents",
    makeComponentArchiveEntry({
      slot: "agents",
      specimenId: "agent-one",
      definitionText: agentText1,
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
      specimenId: "agent-two",
      definitionText: agentText2,
      parent: null,
      searchFitness: 0.85,
      promotionFitness: 0.7,
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
  const battery = generateFixtureBattery(seed, `data-ops-blueprint-determinism-${idSuffix}`);
  const agentRef1: ComponentRef = {
    slot: "agents",
    sourcePath: "agents/agent-one.md",
    winnerVariantId: componentVariantId(agentText1),
    batteryId: battery.id,
  };
  const agentRef2: ComponentRef = {
    slot: "agents",
    sourcePath: "agents/agent-two.md",
    winnerVariantId: componentVariantId(agentText2),
    batteryId: battery.id,
  };
  const commandsRef: ComponentRef = {
    slot: "commands",
    sourcePath: "commands/audit.md",
    winnerVariantId: componentVariantId(COMMANDS_DEF),
    batteryId: battery.id,
  };
  return { archiveRoot, assetRoot, battery, agentRef1, agentRef2, commandsRef };
}

describe("assemble is byte-identical when the same refs are supplied in reverse order", () => {
  it("agents: [ref1, ref2] and agents: [ref2, ref1] produce JSON.stringify-identical ops", () => {
    const f = setupTwoAgentFixture(6001, "reverse-refs");
    const targetParent = tmpRoot("stz-blueprint-reverse-refs-target-");
    try {
      const forward = makeHarnessBlueprint({
        schemaVersion: 1,
        id: "matrix-determinism-reverse-forward",
        vertical: "data-ops",
        version: "0.1.0",
        agents: [f.agentRef1, f.agentRef2],
        commands: [f.commandsRef],
        skills: [],
        hooks: [],
        docs: [],
        bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
        battery: batteryRef(f.battery),
        oracle: f.battery.receipt,
      });
      const reversed = makeHarnessBlueprint({
        schemaVersion: 1,
        id: "matrix-determinism-reverse-reversed",
        vertical: "data-ops",
        version: "0.1.0",
        agents: [f.agentRef2, f.agentRef1],
        commands: [f.commandsRef],
        skills: [],
        hooks: [],
        docs: [],
        bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
        battery: batteryRef(f.battery),
        oracle: f.battery.receipt,
      });
      const targetDir = join(targetParent, "target");
      const a = assemble(forward, { archiveRoot: f.archiveRoot, assetRoot: f.assetRoot, targetDir });
      const b = assemble(reversed, { archiveRoot: f.archiveRoot, assetRoot: f.assetRoot, targetDir });
      expect(a.ops).toHaveLength(3);
      expect(JSON.stringify(a.ops)).toBe(JSON.stringify(b.ops));
    } finally {
      cleanupFixture(f);
      rmSync(targetParent, { recursive: true, force: true });
    }
  });
});

describe("assemble is byte-identical when the blueprint's slot fields are written in a different literal key order", () => {
  it("a draft with keys agents..docs and a draft with keys docs..agents produce JSON.stringify-identical ops", () => {
    const f = setupTwoAgentFixture(6002, "reverse-keys");
    const targetParent = tmpRoot("stz-blueprint-reverse-keys-target-");
    try {
      // Object-literal keys in the "natural" order.
      const draftForward = {
        schemaVersion: 1 as const,
        id: "matrix-determinism-keys-forward",
        vertical: "data-ops",
        version: "0.1.0",
        agents: [f.agentRef1, f.agentRef2],
        commands: [f.commandsRef],
        skills: [],
        hooks: [],
        docs: [],
        bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
        battery: batteryRef(f.battery),
        oracle: f.battery.receipt,
      };
      // The SAME field values, object-literal keys written in the OPPOSITE
      // order — a test that would fail if any code path ever iterated
      // `Object.keys(blueprint)` instead of the explicit `SLOT_ORDER`.
      const draftReversed = {
        oracle: f.battery.receipt,
        battery: batteryRef(f.battery),
        bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
        docs: [],
        hooks: [],
        skills: [],
        commands: [f.commandsRef],
        agents: [f.agentRef1, f.agentRef2],
        version: "0.1.0",
        vertical: "data-ops",
        id: "matrix-determinism-keys-reversed",
        schemaVersion: 1 as const,
      };
      const bpForward = makeHarnessBlueprint(draftForward);
      const bpReversed = makeHarnessBlueprint(draftReversed);
      const targetDir = join(targetParent, "target");
      const a = assemble(bpForward, { archiveRoot: f.archiveRoot, assetRoot: f.assetRoot, targetDir });
      const b = assemble(bpReversed, { archiveRoot: f.archiveRoot, assetRoot: f.assetRoot, targetDir });
      expect(JSON.stringify(a.ops)).toBe(JSON.stringify(b.ops));
    } finally {
      cleanupFixture(f);
      rmSync(targetParent, { recursive: true, force: true });
    }
  });
});

describe("assemble is byte-identical across repeated calls on the same blueprint", () => {
  it("calling assemble twice with no file changes produces deep- and stringify-equal results", () => {
    const f = setupTwoAgentFixture(6003, "repeated-calls");
    const targetParent = tmpRoot("stz-blueprint-repeated-calls-target-");
    try {
      const bp = makeHarnessBlueprint({
        schemaVersion: 1,
        id: "matrix-determinism-repeated",
        vertical: "data-ops",
        version: "0.1.0",
        agents: [f.agentRef1, f.agentRef2],
        commands: [f.commandsRef],
        skills: [],
        hooks: [],
        docs: [],
        bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
        battery: batteryRef(f.battery),
        oracle: f.battery.receipt,
      });
      const targetDir = join(targetParent, "target");
      const first = assemble(bp, { archiveRoot: f.archiveRoot, assetRoot: f.assetRoot, targetDir });
      const second = assemble(bp, { archiveRoot: f.archiveRoot, assetRoot: f.assetRoot, targetDir });
      expect(first.ops).toEqual(second.ops);
      expect(JSON.stringify(first.ops)).toBe(JSON.stringify(second.ops));
    } finally {
      cleanupFixture(f);
      rmSync(targetParent, { recursive: true, force: true });
    }
  });
});

describe("SLOT_ORDER is sorted and covers exactly the ComponentSlot union", () => {
  it("SLOT_ORDER deep-equals its own sorted copy, and its member set equals SLOT_REQUIREMENT's key set", () => {
    expect(SLOT_ORDER).toEqual([...SLOT_ORDER].sort());
    expect([...SLOT_ORDER].sort()).toEqual([...SLOT_REQUIREMENT.keys()].sort());
    expect(new Set(SLOT_ORDER)).toEqual(new Set(SLOT_REQUIREMENT.keys()));
    // A sixth slot cannot be added to SLOT_REQUIREMENT without this test
    // noticing the member-set mismatch.
    expect(SLOT_ORDER).toHaveLength(5);
  });
});

describe("assembly performs no search: a higher-fitness promoted entry at the same slot does not change the output", () => {
  it("assemble still emits the FileOp the ComponentRef names, while componentIncumbent would have picked the OTHER, higher-fitness entry", () => {
    const archiveRoot = tmpRoot("stz-blueprint-nosearch-archive-");
    const assetRoot = tmpRoot("stz-blueprint-nosearch-assets-");
    const targetParent = tmpRoot("stz-blueprint-nosearch-target-");
    try {
      mkdirSync(join(assetRoot, "agents"), { recursive: true });
      mkdirSync(join(assetRoot, "commands"), { recursive: true });
      writeFileSync(join(assetRoot, "agents", "planner.md"), AGENTS_DEF, "utf8");
      writeFileSync(join(assetRoot, "commands", "audit.md"), COMMANDS_DEF, "utf8");

      // The ref's own entry — lower fitness, PROMOTED.
      appendComponentArchiveEntry(
        archiveRoot,
        "agents",
        makeComponentArchiveEntry({
          slot: "agents",
          specimenId: "named-entry",
          definitionText: AGENTS_DEF,
          parent: null,
          searchFitness: 0.5,
          promotionFitness: 0.4,
          advantage: 0.1,
          gates: sevenGates(),
        }),
      );
      // A SECOND promoted entry at the SAME slot, different text, HIGHER
      // fitness than the ref's own entry — assembly must not choose it.
      const higherFitnessText = "---\nname: stz-agent-higher-fitness\n---\nA better agent nobody asked for.";
      appendComponentArchiveEntry(
        archiveRoot,
        "agents",
        makeComponentArchiveEntry({
          slot: "agents",
          specimenId: "higher-fitness-entry",
          definitionText: higherFitnessText,
          parent: null,
          searchFitness: 0.99,
          promotionFitness: 0.99,
          advantage: 0.3,
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

      const battery = generateFixtureBattery(6004, "data-ops-blueprint-nosearch");
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
      const bp = makeHarnessBlueprint({
        schemaVersion: 1,
        id: "matrix-nosearch",
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
      const targetDir = join(targetParent, "target");

      // The pre-existing "best" helper WOULD pick the higher-fitness entry —
      // and it disagrees with what assemble() resolves. That disagreement is
      // the point (D2): assembly resolves what the blueprint names; it does
      // not choose among candidates.
      const incumbent = componentIncumbent(archiveRoot, "agents");
      expect(incumbent).not.toBeNull();
      expect(incumbent!.variantId).toBe(componentVariantId(higherFitnessText));
      expect(incumbent!.variantId).not.toBe(agentsRef.winnerVariantId);

      const result = assemble(bp, { archiveRoot, assetRoot, targetDir });
      expect(result.ops).toHaveLength(2);
      const agentsOp = result.ops.find((op) => op.to === join(targetDir, "agents", "planner.md"));
      expect(agentsOp).toBeDefined();
      expect(agentsOp!.from).toBe(join(assetRoot, "agents", "planner.md"));
    } finally {
      rmSync(archiveRoot, { recursive: true, force: true });
      rmSync(assetRoot, { recursive: true, force: true });
      rmSync(targetParent, { recursive: true, force: true });
    }
  });
});

describe("blueprint.ts imports only from an allowlist — no search machinery reachable from the harness altitude", () => {
  it("every 'from \"...\"' specifier in src/foundry/blueprint.ts is a subset of the allowlist, excluding node:crypto and every selection/GRPO/provider module", () => {
    const source = readFileSync(join(repoRoot, "src/foundry/blueprint.ts"), "utf8");
    const specifiers = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
    const allowlist = new Set([
      "node:fs",
      "node:path",
      "./battery-types.js",
      "./runner.js",
      "./vertical-admission.js",
      "../harness.js",
      "../installer.js",
      "../types.js",
      "../write-guard.js",
    ]);
    // A structural assertion over the SET of specifiers — a comment
    // mentioning a module name cannot satisfy or break it.
    expect(specifiers.length).toBeGreaterThan(0);
    for (const s of specifiers) {
      expect(allowlist.has(s)).toBe(true);
    }
    expect(specifiers).not.toContain("node:crypto");
  });
});
