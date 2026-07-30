/**
 * `emit` (Phase 3 — Emit / packaging, Plan 03-01, REQ-33..REQ-35). Follows
 * `test/foundry-blueprint.test.ts`'s convention exactly: real temp dirs
 * (`mkdtempSync`), no fs mock, no network, no daemon.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emit, type EmitOptions } from "../src/foundry/emit.js";
import {
  makeHarnessBlueprint,
  assemble,
  batteryRef,
  type ComponentRef,
  type ComponentSlot,
} from "../src/foundry/blueprint.js";
import {
  componentVariantId,
  appendComponentArchiveEntry,
  makeComponentArchiveEntry,
  type PromotionInputs,
} from "../src/harness.js";
import { generateFixtureBattery } from "../src/foundry/fixture-warehouse.js";
import { FOUNDRY_CONFIG_TEMPLATE } from "../src/foundry/runner.js";
import { planInstall, runtimeByName } from "../src/installer.js";

function tmpRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Mirrors `test/foundry-blueprint.test.ts`'s `sevenGates` verbatim. */
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

interface ComponentFixture {
  slot: ComponentSlot;
  name: string;
  text: string;
}

/**
 * Build real archive + asset roots for N component fixtures and a fully
 * valid `HarnessBlueprint` referencing all of them — the same tracer
 * convention `test/foundry-blueprint.test.ts` (lines 60-148) uses,
 * generalized to accept an arbitrary fixture list so Task 2's Class B can
 * build a 3-ref blueprint.
 */
function buildFixtureEnv(idSuffix: string, fixtures: ComponentFixture[]) {
  const archiveRoot = tmpRoot(`stz-emit-archive-${idSuffix}-`);
  const assetRoot = tmpRoot(`stz-emit-assets-${idSuffix}-`);
  mkdirSync(join(assetRoot, "agents"), { recursive: true });
  mkdirSync(join(assetRoot, "commands"), { recursive: true });

  const battery = generateFixtureBattery(9001, `data-ops-emit-${idSuffix}`);

  const refs: ComponentRef[] = [];
  for (const fx of fixtures) {
    const relPath = join(fx.slot, `${fx.name}.md`);
    writeFileSync(join(assetRoot, relPath), fx.text, "utf8");
    appendComponentArchiveEntry(
      archiveRoot,
      fx.slot,
      makeComponentArchiveEntry({
        slot: fx.slot,
        specimenId: `${fx.name}-winner`,
        definitionText: fx.text,
        parent: null,
        searchFitness: 0.9,
        promotionFitness: 0.8,
        advantage: 0.1,
        gates: sevenGates(),
      }),
    );
    refs.push({
      slot: fx.slot,
      sourcePath: relPath,
      winnerVariantId: componentVariantId(fx.text),
      batteryId: battery.id,
    });
  }

  const blueprint = makeHarnessBlueprint({
    schemaVersion: 1,
    id: `data-ops-emit-${idSuffix}`,
    vertical: "data-ops",
    version: "0.1.0",
    agents: refs.filter((r) => r.slot === "agents"),
    commands: refs.filter((r) => r.slot === "commands"),
    skills: [],
    hooks: [],
    docs: [],
    bridgeConfig: FOUNDRY_CONFIG_TEMPLATE,
    battery: batteryRef(battery),
    oracle: battery.receipt,
  });

  return { archiveRoot, assetRoot, blueprint };
}

function cleanupEnv(env: { archiveRoot: string; assetRoot: string }): void {
  rmSync(env.archiveRoot, { recursive: true, force: true });
  rmSync(env.assetRoot, { recursive: true, force: true });
}

function opts(env: { archiveRoot: string; assetRoot: string }, copyFn?: EmitOptions["copyFn"]): EmitOptions {
  return { archiveRoot: env.archiveRoot, assetRoot: env.assetRoot, copyFn };
}

describe("emit tracer — a blueprint becomes an installable plugin directory, then a real planInstall round-trips it", () => {
  it("materializes assemble()'s ops plus generated manifests through resolveContained, and planInstall names the emitted files", () => {
    const env = buildFixtureEnv("tracer", [
      { slot: "agents", name: "stz-data-ops-planner", text: AGENTS_DEF },
      { slot: "commands", name: "data-ops-audit", text: COMMANDS_DEF },
    ]);
    const targetParent = tmpRoot("stz-emit-target-tracer-");
    const targetDir = join(targetParent, "target");
    const configDir = tmpRoot("stz-emit-config-tracer-");
    try {
      const directAssemble = assemble(env.blueprint, {
        archiveRoot: env.archiveRoot,
        assetRoot: env.assetRoot,
        targetDir,
      });

      const result = emit(env.blueprint, targetDir, opts(env));

      // emit returns assemble()'s own ops, never a recomputed list.
      expect(result.ops).toEqual(directAssemble.ops);

      expect(readFileSync(join(targetDir, "agents", "stz-data-ops-planner.md"), "utf8")).toBe(AGENTS_DEF);
      expect(readFileSync(join(targetDir, "commands", "data-ops-audit.md"), "utf8")).toBe(COMMANDS_DEF);

      const pluginPath = join(targetDir, ".claude-plugin", "plugin.json");
      expect(existsSync(pluginPath)).toBe(true);
      const plugin = JSON.parse(readFileSync(pluginPath, "utf8")) as { name: string; version: string };
      expect(plugin.name).toBe(env.blueprint.id);
      expect(plugin.version).toBe(env.blueprint.version);

      expect(existsSync(join(targetDir, ".claude-plugin", "marketplace.json"))).toBe(true);

      for (const p of [...result.written, ...result.manifests]) {
        expect(p.includes(".stz-emit-")).toBe(false);
      }
      const siblings = readdirSync(targetParent);
      expect(siblings.some((n) => n.startsWith(".stz-emit-"))).toBe(false);

      // REQ-37 round-trip: the REAL planInstall, not a self-comparison.
      const rt = runtimeByName("claude-code")!;
      const plan = planInstall(rt, configDir, targetDir);
      expect(plan.ops.some((o) => o.to === join(configDir, "commands", "stz-f", "data-ops-audit.md"))).toBe(true);
      expect(plan.ops.some((o) => o.to === join(configDir, "agents", "stz-data-ops-planner.md"))).toBe(true);
      expect(plan.ops.some((o) => o.from === join(targetDir, "agents", "stz-data-ops-planner.md"))).toBe(true);
      expect(plan.ops.some((o) => o.from === join(targetDir, "commands", "data-ops-audit.md"))).toBe(true);
    } finally {
      cleanupEnv(env);
      rmSync(targetParent, { recursive: true, force: true });
      rmSync(configDir, { recursive: true, force: true });
    }
  });
});
