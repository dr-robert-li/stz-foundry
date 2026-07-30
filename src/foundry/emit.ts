/**
 * `emit` — the harness-altitude WRITER (Phase 3 — Emit / packaging, Plan
 * 03-01, REQ-33..REQ-35). Sibling of `src/foundry/blueprint.ts`'s
 * `assemble()`: assembly DECIDES the file operations (D1), emit PERFORMS
 * them. `assemble()`'s `op.to` is already `join(targetDir, slot,
 * basename(from))` (`blueprint.ts:389`) — every destination is already
 * plugin-directory-shaped. There is therefore NO mapping step in this
 * module and a future reader must not add one; that would be a second
 * decision site and a D1 violation.
 *
 * Atomicity (D3): every write lands in a scratch directory created as a
 * SIBLING of `targetDir` (`mkdtempSync(join(dirname(targetDir),
 * ".stz-emit-"))` — same parent, hence same filesystem), and the harness
 * appears via a single `renameSync(stagingDir, targetDir)`. No in-repo
 * precedent for stage-then-publish existed before this module (every other
 * `mkdtempSync`/`rmSync` pair in this repo is scratch space that is always
 * deleted, never published) — this is new machinery, not a copy of an
 * existing pattern.
 *
 * Containment (D4): every destination — component copies AND both
 * generated manifests alike — is routed through `stagedDestination`, which
 * calls `resolveContained` (`src/write-guard.ts`), the repo's ONE
 * containment guard, at write time. `op.to` cannot actually escape
 * `targetDir` today (`slot` is one of 5 frozen literals, `basename()`
 * strips separators) — the guard is not there because today's construction
 * is unsafe, but because D4 is an invariant on the WRITE itself, not a
 * statement of trust in `assemble()`'s current destination construction.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  copyFileSync,
  chmodSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, dirname, relative } from "node:path";
import { assemble, type HarnessBlueprint } from "./blueprint.js";
import { resolveContained } from "../write-guard.js";
import type { FileOp } from "../installer.js";

export class EmitError extends Error {
  constructor(message: string) {
    super(`[foundry:emit] ${message}`);
    this.name = "EmitError";
  }
}

/**
 * `archiveRoot`/`assetRoot` are NOT derivable from `blueprint` or
 * `targetDir` — `assemble()` requires them as caller-supplied context in
 * every existing call site, and REQ-33's two-argument `emit(blueprint,
 * targetDir)` shorthand is a simplification of intent, not the literal API
 * contract (RESEARCH Pitfall 6). Do not "simplify" this signature back down
 * to two arguments.
 *
 * `copyFn` defaults to `copyFileSync` and exists as an injectable test seam
 * for the atomicity control (Task 2) — the same injection idiom
 * `runExecutionOracle`'s `execFn`/`probeFn` already use
 * (`execution-oracle.ts:64-65`). It is a test seam, not a feature; no
 * production caller needs it.
 */
export interface EmitOptions {
  archiveRoot: string;
  assetRoot: string;
  copyFn?: (from: string, to: string) => void;
}

export interface EmitResult {
  targetDir: string;
  ops: FileOp[];
  manifests: string[];
  written: string[];
}

/**
 * `PLUGIN_MANIFEST_DEFAULTS` — the fields `plugin.json`/`marketplace.json`
 * carry that have NO blueprint source, copied verbatim from this repo's own
 * `.claude-plugin/plugin.json` / `.claude-plugin/marketplace.json` (D2's
 * "literal template", RESEARCH Open Question 1 resolved as a decision).
 * Never invented, never read from disk at runtime — a filesystem read here
 * would make manifest generation impure and location-dependent, which D5
 * forbids. 03-03 adds the drift-guard test that keeps this constant equal
 * to the live template.
 */
export const PLUGIN_MANIFEST_DEFAULTS = Object.freeze({
  author: Object.freeze({ name: "Robert Li", email: "dr.robert.li.au@gmail.com" }),
  homepage: "https://github.com/dr-robert-li/stz-foundry",
  license: "Apache-2.0",
  keywords: Object.freeze([
    "agentic",
    "tournament",
    "grpo",
    "reward-hacking",
    "audit",
    "subagents",
    "byo-llm",
    "foundry",
  ]) as readonly string[],
  category: "development",
  strict: false,
});

/** A deterministic (D5), blueprint-composed description — no wall-clock, no
 *  random value, no `targetDir`/staging-path leakage. */
function harnessDescription(blueprint: HarnessBlueprint): string {
  return (
    `A ${blueprint.vertical} specialized harness assembled by STZ Foundry from ` +
    `${blueprint.id} v${blueprint.version} (battery ${blueprint.battery.id}).`
  );
}

/**
 * `plugin.json`, generated deterministically from `blueprint`. Explicit key
 * order — never `Object.keys` over the blueprint, never `Map`/filesystem
 * iteration order (D5) — serialized with the exact idiom `applyInstall`
 * already uses (`installer.ts:254-263`).
 */
export function pluginManifest(blueprint: HarnessBlueprint): string {
  const manifest = {
    name: blueprint.id,
    version: blueprint.version,
    description: harnessDescription(blueprint),
    author: PLUGIN_MANIFEST_DEFAULTS.author,
    homepage: PLUGIN_MANIFEST_DEFAULTS.homepage,
    license: PLUGIN_MANIFEST_DEFAULTS.license,
    keywords: PLUGIN_MANIFEST_DEFAULTS.keywords,
  };
  return JSON.stringify(manifest, null, 2) + "\n";
}

/** `marketplace.json`, generated deterministically from `blueprint`. Same
 *  posture as `pluginManifest`. */
export function marketplaceManifest(blueprint: HarnessBlueprint): string {
  const description = harnessDescription(blueprint);
  const manifest = {
    name: `${blueprint.id}-marketplace`,
    owner: PLUGIN_MANIFEST_DEFAULTS.author,
    metadata: {
      description,
      version: blueprint.version,
    },
    plugins: [
      {
        name: blueprint.id,
        source: "./",
        description,
        version: blueprint.version,
        category: PLUGIN_MANIFEST_DEFAULTS.category,
        strict: PLUGIN_MANIFEST_DEFAULTS.strict,
      },
    ],
  };
  return JSON.stringify(manifest, null, 2) + "\n";
}

/**
 * Reconstruct the relative portion of an already-absolute `op.to` (or a
 * manifest path under `targetDir`) and route it through `resolveContained`
 * against the STAGING root, never `targetDir` directly. Exported so D4's
 * guard is independently reachable by a unit test (Task 2) — a control that
 * holds by mechanism, not by convention, even though `op.to`'s shape is
 * safe by construction today (D4 is an invariant on the write, not a
 * statement of trust in `assemble()`'s current construction).
 */
export function stagedDestination(stagingDir: string, targetDir: string, opTo: string): string {
  const rel = relative(targetDir, opTo);
  return resolveContained(stagingDir, rel);
}

/**
 * Materialize `blueprint` into a real Claude Code plugin directory at
 * `targetDir`. Refuses whatever `assemble()` refuses (D1/D3/REQ-35);
 * refuses a pre-existing `targetDir` before anything is created; never
 * leaves a half-populated `targetDir` or an orphaned staging directory.
 */
export function emit(blueprint: HarnessBlueprint, targetDir: string, opts: EmitOptions): EmitResult {
  // (1) assemble() FIRST — its own requireBlueprintIntegrity refuses before
  // any op exists, so a refusal here means nothing below runs and nothing
  // is written. Do NOT add a second validity check here (D1).
  const result = assemble(blueprint, { archiveRoot: opts.archiveRoot, assetRoot: opts.assetRoot, targetDir });

  // (2) the pre-existing-target precondition, made explicit rather than a
  // silent ENOTEMPTY/EEXIST surfacing later out of renameSync.
  if (existsSync(targetDir)) {
    throw new EmitError(
      `targetDir ${JSON.stringify(targetDir)} already exists — emit never merges into or ` +
        `overwrites an existing directory`,
    );
  }

  // (3) ponytail: on a later failure an EMPTY parent directory may remain —
  // targetDir itself is still never half-populated, which is the property
  // D3 states. Upgrade trigger: a caller that cares about parent-directory
  // creation as a side effect.
  mkdirSync(dirname(targetDir), { recursive: true });

  // (4) a SIBLING of targetDir, deliberately not os.tmpdir(), so source and
  // destination share a filesystem and the publish rename is atomic.
  const stagingDir = mkdtempSync(join(dirname(targetDir), ".stz-emit-"));
  const copyFn = opts.copyFn ?? copyFileSync;

  try {
    // (5) component copies — same guard as the manifests, because D4 says
    // every write.
    for (const op of result.ops) {
      const dest = stagedDestination(stagingDir, targetDir, op.to);
      mkdirSync(dirname(dest), { recursive: true });
      copyFn(op.from, dest);
    }

    const pluginDest = stagedDestination(stagingDir, targetDir, join(targetDir, ".claude-plugin", "plugin.json"));
    mkdirSync(dirname(pluginDest), { recursive: true });
    writeFileSync(pluginDest, pluginManifest(blueprint), "utf8");

    const marketplaceDest = stagedDestination(
      stagingDir,
      targetDir,
      join(targetDir, ".claude-plugin", "marketplace.json"),
    );
    writeFileSync(marketplaceDest, marketplaceManifest(blueprint), "utf8");

    // (6) mkdtempSync creates 0700; a published plugin directory should not
    // silently carry a stricter mode than a mkdirSync one would.
    chmodSync(stagingDir, 0o755);

    // (7) the single operation that makes the harness appear. EXDEV surfaces
    // if dirname(targetDir) is itself a mount boundary — NEVER caught and
    // downgraded to a copy loop; a copy fallback would silently reintroduce
    // the partial-write hazard D3 forbids.
    renameSync(stagingDir, targetDir);
  } catch (err) {
    // (8) rethrow the original error unchanged — no wrapping that hides the
    // cause.
    rmSync(stagingDir, { recursive: true, force: true });
    throw err;
  }

  const manifests = [join(targetDir, ".claude-plugin", "plugin.json"), join(targetDir, ".claude-plugin", "marketplace.json")];
  return {
    targetDir,
    ops: result.ops,
    manifests,
    written: [...result.ops.map((o) => o.to), ...manifests],
  };
}
