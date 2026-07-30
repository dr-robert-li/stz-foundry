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
