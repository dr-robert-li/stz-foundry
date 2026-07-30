/**
 * `emit` (Phase 3 — Emit / packaging, Plan 03-01, REQ-33..REQ-35). Follows
 * `test/foundry-blueprint.test.ts`'s convention exactly: real temp dirs
 * (`mkdtempSync`), no fs mock, no network, no daemon.
 */
import { describe, it, expect } from "vitest";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { emit, EmitError, stagedDestination, type EmitOptions } from "../src/foundry/emit.js";
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

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

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
const AGENTS_DEF_2 = "---\nname: stz-data-ops-planner-two\ntools: Read, Write\n---\nData-ops planner agent body two.";
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

describe("emit Class A — pass-through only when assembly itself refuses (this is NOT the atomicity proof)", () => {
  it("propagates assemble()'s own refusal for a drifted winnerVariantId, and creates no targetDir", () => {
    const env = buildFixtureEnv("classA", [
      { slot: "agents", name: "stz-data-ops-planner", text: AGENTS_DEF },
      { slot: "commands", name: "data-ops-audit", text: COMMANDS_DEF },
    ]);
    // Drift the on-disk agent file after blueprint construction so
    // resolveComponentRef's own hash check refuses inside assemble() —
    // emit's write loop never runs a single line.
    writeFileSync(join(env.assetRoot, "agents", "stz-data-ops-planner.md"), AGENTS_DEF + "\nDRIFTED", "utf8");

    const targetParent = tmpRoot("stz-emit-classA-target-");
    const targetDir = join(targetParent, "target");
    try {
      expect(() => emit(env.blueprint, targetDir, opts(env))).toThrow(/drifted/);
      expect(existsSync(targetDir)).toBe(false);
    } finally {
      cleanupEnv(env);
      rmSync(targetParent, { recursive: true, force: true });
    }
  });
});

describe("emit Class B — emit's OWN rollback: a valid blueprint, an injected mid-write copyFn failure", () => {
  it("cleans up the staging directory and leaves no targetDir when the second of three ops fails", () => {
    const env = buildFixtureEnv("classB", [
      { slot: "agents", name: "agent-one", text: AGENTS_DEF },
      { slot: "agents", name: "agent-two", text: AGENTS_DEF_2 },
      { slot: "commands", name: "data-ops-audit", text: COMMANDS_DEF },
    ]);
    const targetParent = tmpRoot("stz-emit-classB-target-");
    const targetDir = join(targetParent, "target");
    try {
      let calls = 0;
      const injectedError = new Error("injected copy failure on invocation 2");
      const copyFn = (from: string, to: string): void => {
        calls += 1;
        if (calls === 2) throw injectedError;
        copyFileSync(from, to);
      };

      let thrown: unknown;
      try {
        emit(env.blueprint, targetDir, opts(env, copyFn));
      } catch (e) {
        thrown = e;
      }

      // The injected error surfaces unwrapped (Task 1 step 8) — not caught
      // and rethrown as a different error.
      expect(thrown).toBe(injectedError);
      // op 3 (the third component) and both manifests were never reached.
      expect(calls).toBe(2);

      expect(existsSync(targetDir)).toBe(false);
      const siblings = readdirSync(dirname(targetDir));
      expect(siblings.some((n) => n.startsWith(".stz-emit-"))).toBe(false);
    } finally {
      cleanupEnv(env);
      rmSync(targetParent, { recursive: true, force: true });
    }
  });
});

describe("emit Class C — refuses a pre-existing targetDir before writing anything", () => {
  it("throws EmitError naming the path and leaves the pre-existing directory's contents byte-unchanged", () => {
    const env = buildFixtureEnv("classC", [
      { slot: "agents", name: "stz-data-ops-planner", text: AGENTS_DEF },
      { slot: "commands", name: "data-ops-audit", text: COMMANDS_DEF },
    ]);
    const targetParent = tmpRoot("stz-emit-classC-target-");
    const targetDir = join(targetParent, "target");
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, "sentinel.txt"), "pre-existing", "utf8");
    try {
      expect(() => emit(env.blueprint, targetDir, opts(env))).toThrow(EmitError);
      expect(readFileSync(join(targetDir, "sentinel.txt"), "utf8")).toBe("pre-existing");
      expect(readdirSync(targetDir)).toEqual(["sentinel.txt"]);
    } finally {
      cleanupEnv(env);
      rmSync(targetParent, { recursive: true, force: true });
    }
  });

  it("refuses the live repository root as targetDir, leaving the repo's own plugin.json byte-unchanged", () => {
    const env = buildFixtureEnv("classC-repo", [
      { slot: "agents", name: "stz-data-ops-planner", text: AGENTS_DEF },
      { slot: "commands", name: "data-ops-audit", text: COMMANDS_DEF },
    ]);
    const before = readFileSync(join(repoRoot, ".claude-plugin", "plugin.json"), "utf8");
    try {
      expect(() => emit(env.blueprint, repoRoot, opts(env))).toThrow(EmitError);
      expect(readFileSync(join(repoRoot, ".claude-plugin", "plugin.json"), "utf8")).toBe(before);
    } finally {
      cleanupEnv(env);
    }
  });
});

describe("emit Class D — stagedDestination is mechanism, not convention", () => {
  it("throws resolveContained's own path-traversal message for a relative escape", () => {
    const stageParent = tmpRoot("stz-emit-classD-stage-");
    const targetParent = tmpRoot("stz-emit-classD-target-");
    const stagingDir = mkdtempSync(join(stageParent, "stage-"));
    const targetDir = join(targetParent, "target");
    try {
      expect(() => stagedDestination(stagingDir, targetDir, join(targetDir, "..", "escape.md"))).toThrow(
        /path-traversal guard/,
      );
    } finally {
      rmSync(stageParent, { recursive: true, force: true });
      rmSync(targetParent, { recursive: true, force: true });
    }
  });

  it("throws for an absolute opTo outside targetDir", () => {
    const stageParent = tmpRoot("stz-emit-classD-stage2-");
    const targetParent = tmpRoot("stz-emit-classD-target2-");
    const outsideDir = tmpRoot("stz-emit-classD-outside-");
    const stagingDir = mkdtempSync(join(stageParent, "stage-"));
    const targetDir = join(targetParent, "target");
    try {
      expect(() => stagedDestination(stagingDir, targetDir, join(outsideDir, "escape.md"))).toThrow(
        /path-traversal guard/,
      );
    } finally {
      rmSync(stageParent, { recursive: true, force: true });
      rmSync(targetParent, { recursive: true, force: true });
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});
