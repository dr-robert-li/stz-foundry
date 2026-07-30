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
import {
  emit,
  EmitError,
  stagedDestination,
  pluginManifest,
  marketplaceManifest,
  PLUGIN_MANIFEST_DEFAULTS,
  type EmitOptions,
} from "../src/foundry/emit.js";
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
const SKILLS_DEF = "---\nname: data-ops-skill\n---\nData-ops skill body — flat-file shape (REQ-36's named ceiling).";
const HOOK_DEF = "#!/bin/bash\necho data-ops-hook\n";
const DOCS_DEF = "# Data-ops notes\n\nDocs body — emitted, but never an install target.";

interface ComponentFixture {
  slot: ComponentSlot;
  name: string;
  text: string;
  /** File extension, no dot. Defaults to "md" — every 03-01 caller's shape. */
  ext?: string;
}

/**
 * Build real archive + asset roots for N component fixtures and a fully
 * valid `HarnessBlueprint` referencing all of them — the same tracer
 * convention `test/foundry-blueprint.test.ts` (lines 60-148) uses,
 * generalized to accept an arbitrary fixture list so Task 2's Class B can
 * build a 3-ref blueprint, and (Task 2, REQ-37) an arbitrary SLOT + EXTENSION
 * per fixture so a five-slot round-trip blueprint (including a `hooks`
 * script and a `docs` file) can reuse this same helper.
 */
function buildFixtureEnv(idSuffix: string, fixtures: ComponentFixture[]) {
  const archiveRoot = tmpRoot(`stz-emit-archive-${idSuffix}-`);
  const assetRoot = tmpRoot(`stz-emit-assets-${idSuffix}-`);
  mkdirSync(join(assetRoot, "agents"), { recursive: true });
  mkdirSync(join(assetRoot, "commands"), { recursive: true });
  for (const fx of fixtures) mkdirSync(join(assetRoot, fx.slot), { recursive: true });

  const battery = generateFixtureBattery(9001, `data-ops-emit-${idSuffix}`);

  const refs: ComponentRef[] = [];
  for (const fx of fixtures) {
    const relPath = join(fx.slot, `${fx.name}.${fx.ext ?? "md"}`);
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
    skills: refs.filter((r) => r.slot === "skills"),
    hooks: refs.filter((r) => r.slot === "hooks"),
    docs: refs.filter((r) => r.slot === "docs"),
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

describe("emit -> planInstall round-trip (REQ-37) — content-hash symmetry, not a self-comparison", () => {
  it("a five-slot blueprint emits, and the REAL planInstall names exactly the four distributable slots, matching the blueprint's declared hashes byte-for-byte", () => {
    // Five refs — one per ComponentSlot, including a real `skills` ref
    // (RESEARCH Pitfall 2: a blueprint that leaves `skills: []` never
    // exercises the copy loop) and a `.sh` `hooks` fixture so
    // `listHookScripts` accepts it.
    const env = buildFixtureEnv("roundtrip", [
      { slot: "agents", name: "stz-data-ops-planner", text: AGENTS_DEF },
      { slot: "commands", name: "data-ops-audit", text: COMMANDS_DEF },
      { slot: "skills", name: "data-ops-skill", text: SKILLS_DEF },
      { slot: "hooks", name: "data-ops-hook", text: HOOK_DEF, ext: "sh" },
      { slot: "docs", name: "data-ops-notes", text: DOCS_DEF },
    ]);
    expect(env.blueprint.skills.length).toBe(1); // the skills loop is load-bearing here, not dead code

    const targetParent = tmpRoot("stz-emit-roundtrip-target-");
    const targetDir = join(targetParent, "target");
    const configDir = tmpRoot("stz-emit-roundtrip-config-");
    try {
      emit(env.blueprint, targetDir, opts(env));

      // All five fixtures land on disk, including docs (emitted, but — see
      // below — never an install target).
      const docsPath = join(targetDir, "docs", "data-ops-notes.md");
      expect(existsSync(docsPath)).toBe(true);

      // THE round-trip: the REAL planInstall, pointed at the emitted
      // targetDir as the literal assetRoot. A hand-rolled directory walk, or
      // any comparison of emit's output against emit's own input, would not
      // satisfy REQ-37 — this must cross into src/installer.ts's own code.
      const rt = runtimeByName("claude-code")!;
      const plan = planInstall(rt, configDir, targetDir);

      // Exactly the four distributable slots — agents, commands, skills,
      // hooks. docs has no installer target.
      expect(plan.ops.length).toBe(4);

      // "matches" means CONTENT-HASH equality, not filename-set equality
      // (RESEARCH Open Question 2, resolved as a decision here): a
      // corrupted or truncated copy would still pass a filename-set
      // comparison but must fail this one. Re-hash every op.from with the
      // SAME componentVariantId function resolveComponentRef itself uses,
      // and compare against the ComponentRef.winnerVariantId values the
      // blueprint declared for the four in-scope slots.
      const declaredHashes = new Set([
        ...env.blueprint.agents.map((r) => r.winnerVariantId),
        ...env.blueprint.commands.map((r) => r.winnerVariantId),
        ...env.blueprint.skills.map((r) => r.winnerVariantId),
        ...env.blueprint.hooks.map((r) => r.winnerVariantId),
      ]);
      const arrivingHashes = new Set(plan.ops.map((o) => componentVariantId(readFileSync(o.from, "utf8"))));
      expect(arrivingHashes).toEqual(declaredHashes);

      // The two negative controls, asserted explicitly rather than glossed
      // over: docs/ and the generated manifests are emitted but name no
      // install op. True today by construction; asserting it turns "the
      // installer happens not to pick these up" into a stated,
      // regression-guarded property.
      const pluginPath = join(targetDir, ".claude-plugin", "plugin.json");
      const marketplacePath = join(targetDir, ".claude-plugin", "marketplace.json");
      expect(plan.ops.some((o) => o.from === docsPath)).toBe(false);
      expect(plan.ops.some((o) => o.from === pluginPath)).toBe(false);
      expect(plan.ops.some((o) => o.from === marketplacePath)).toBe(false);
    } finally {
      cleanupEnv(env);
      rmSync(targetParent, { recursive: true, force: true });
      rmSync(configDir, { recursive: true, force: true });
    }
  });
});

describe("emit determinism (D5) — pluginManifest/marketplaceManifest", () => {
  it("returns strings ending in a newline that parse as JSON with stable top-level key order", () => {
    const env = buildFixtureEnv("det-shape", [
      { slot: "agents", name: "stz-data-ops-planner", text: AGENTS_DEF },
      { slot: "commands", name: "data-ops-audit", text: COMMANDS_DEF },
    ]);
    try {
      const plugin = pluginManifest(env.blueprint);
      const marketplace = marketplaceManifest(env.blueprint);
      expect(plugin.endsWith("\n")).toBe(true);
      expect(marketplace.endsWith("\n")).toBe(true);
      expect(Object.keys(JSON.parse(plugin))).toEqual([
        "name",
        "version",
        "description",
        "author",
        "homepage",
        "license",
        "keywords",
      ]);
      expect(Object.keys(JSON.parse(marketplace))).toEqual(["name", "owner", "metadata", "plugins"]);
    } finally {
      cleanupEnv(env);
    }
  });

  it("emits the SAME blueprint into two DIFFERENT target directories with byte-identical manifests — the discriminating proof, NOT the in-process rerun below", () => {
    const env = buildFixtureEnv("det-target", [
      { slot: "agents", name: "stz-data-ops-planner", text: AGENTS_DEF },
      { slot: "commands", name: "data-ops-audit", text: COMMANDS_DEF },
    ]);
    const parentA = tmpRoot("stz-emit-detA-");
    const parentB = tmpRoot("stz-emit-detB-");
    const targetA = join(parentA, "target");
    const targetB = join(parentB, "target");
    try {
      emit(env.blueprint, targetA, opts(env));
      emit(env.blueprint, targetB, opts(env));

      const pluginA = readFileSync(join(targetA, ".claude-plugin", "plugin.json"), "utf8");
      const pluginB = readFileSync(join(targetB, ".claude-plugin", "plugin.json"), "utf8");
      expect(pluginA).toBe(pluginB);

      const marketA = readFileSync(join(targetA, ".claude-plugin", "marketplace.json"), "utf8");
      const marketB = readFileSync(join(targetB, ".claude-plugin", "marketplace.json"), "utf8");
      expect(marketA).toBe(marketB);

      // A cheap in-process double call is fine as an EXTRA assertion, but it
      // is explicitly NOT the determinism proof (Pitfall 5) — it proves the
      // function is pure within one V8 instance and nothing more. The two
      // different-target-directories comparison above is the real evidence;
      // do not delete it as "redundant" with this line.
      expect(pluginManifest(env.blueprint)).toBe(pluginManifest(env.blueprint));
    } finally {
      cleanupEnv(env);
      rmSync(parentA, { recursive: true, force: true });
      rmSync(parentB, { recursive: true, force: true });
    }
  });

  it("is byte-identical for a blueprint drafted with its object-literal keys in the opposite order", () => {
    const env = buildFixtureEnv("det-keyorder", [
      { slot: "agents", name: "stz-data-ops-planner", text: AGENTS_DEF },
      { slot: "commands", name: "data-ops-audit", text: COMMANDS_DEF },
    ]);
    try {
      // Same field VALUES, opposite object-literal key ORDER — the same
      // input-order dimension phase 2 proved for assemble() itself
      // (harness-factory.md's "Determinism" section).
      const reordered = makeHarnessBlueprint({
        oracle: env.blueprint.oracle,
        battery: env.blueprint.battery,
        bridgeConfig: env.blueprint.bridgeConfig,
        docs: env.blueprint.docs,
        hooks: env.blueprint.hooks,
        skills: env.blueprint.skills,
        commands: env.blueprint.commands,
        agents: env.blueprint.agents,
        version: env.blueprint.version,
        vertical: env.blueprint.vertical,
        id: env.blueprint.id,
        schemaVersion: env.blueprint.schemaVersion,
      });
      expect(pluginManifest(reordered)).toBe(pluginManifest(env.blueprint));
      expect(marketplaceManifest(reordered)).toBe(marketplaceManifest(env.blueprint));
    } finally {
      cleanupEnv(env);
    }
  });

  it("neither generated manifest carries a dependencies key", () => {
    const env = buildFixtureEnv("det-nodeps", [
      { slot: "agents", name: "stz-data-ops-planner", text: AGENTS_DEF },
      { slot: "commands", name: "data-ops-audit", text: COMMANDS_DEF },
    ]);
    try {
      expect(JSON.parse(pluginManifest(env.blueprint))).not.toHaveProperty("dependencies");
      expect(JSON.parse(marketplaceManifest(env.blueprint))).not.toHaveProperty("dependencies");
    } finally {
      cleanupEnv(env);
    }
  });
});

describe("PLUGIN_MANIFEST_DEFAULTS drift guard — the live .claude-plugin/*.json is the template (D2, T-03-10)", () => {
  it("author/homepage/license/keywords match the live plugin.json, and owner/category/strict match the live marketplace.json — version/name/description excluded by design", () => {
    const plugin = JSON.parse(readFileSync(join(repoRoot, ".claude-plugin", "plugin.json"), "utf8")) as {
      author: { name: string; email: string };
      homepage: string;
      license: string;
      keywords: string[];
    };
    const marketplace = JSON.parse(readFileSync(join(repoRoot, ".claude-plugin", "marketplace.json"), "utf8")) as {
      owner: { name: string; email: string };
      plugins: Array<{ name: string; category: string; strict: boolean }>;
    };
    const stzEntry = marketplace.plugins.find((p) => p.name === "stz-f")!;

    expect(PLUGIN_MANIFEST_DEFAULTS.author).toEqual(plugin.author);
    expect(PLUGIN_MANIFEST_DEFAULTS.homepage).toBe(plugin.homepage);
    expect(PLUGIN_MANIFEST_DEFAULTS.license).toBe(plugin.license);
    expect(PLUGIN_MANIFEST_DEFAULTS.keywords).toEqual(plugin.keywords);
    expect(PLUGIN_MANIFEST_DEFAULTS.author).toEqual(marketplace.owner);
    expect(PLUGIN_MANIFEST_DEFAULTS.category).toBe(stzEntry.category);
    expect(PLUGIN_MANIFEST_DEFAULTS.strict).toBe(stzEntry.strict);
  });
});
