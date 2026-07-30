/**
 * `HarnessBlueprint` — the harness-altitude PRODUCT manifest (Phase 2 —
 * Harness blueprint assembly, Plan 02-01, REQ-28..REQ-32). Sibling of
 * `HarnessGenome` (`src/types.ts`), which stays the FACTORY's own search
 * config: a genome describes how the harness searches, a blueprint describes
 * what a harness ships — a manifest of tournament-won components that can be
 * replayed, audited, and refused (02-CONTEXT.md's domain framing).
 *
 * Design finding (OQ1, resolved here, not left open): `ComponentArchiveEntry`
 * (`src/types.ts:534-568`) stores no `batteryId` field anywhere — its
 * `artifact` block is `{slot, specimenId, definitionHash}`. REQ-29's literal
 * `ComponentRef.batteryId` therefore cannot be checked against a per-archive-
 * entry field that does not exist. This module does NOT widen
 * `ComponentArchiveEntry` (already-shipped, mutation-proven code in a
 * different phase's scope) — `batteryId` is a SAME-BATTERY-FAMILY
 * consistency check: every `ComponentRef` must name the blueprint's own
 * `battery: BatteryRef` id, resolved in `resolveComponentRef` below, never
 * against the archive.
 *
 * Design finding (OQ2, resolved here): `ComponentRef` resolution and drift-
 * checking run INSIDE `assemble()`, every call, never cached from
 * `makeHarnessBlueprint` construction time. A hash computed once at
 * construction and compared to itself on replay is the vacuous version of
 * REQ-29 — drift is only real if it is detected at the moment of assembly,
 * against the live file, not against an earlier snapshot.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { componentVariantId, readComponentArchive, promotionGate } from "../harness.js";
import type { ComponentArchiveEntry } from "../types.js";
import { resolveContained } from "../write-guard.js";
import type { FoundryConfig } from "./runner.js";
import type { FileOp } from "../installer.js";
import { sealTable } from "./vertical-admission.js";
import { validateReceipt, type OracleReceipt, type AgentBattery } from "./battery-types.js";

// ── slots ────────────────────────────────────────────────────────────────

/** The five REQ-28 slot names, exactly. */
export type ComponentSlot = "agents" | "commands" | "skills" | "hooks" | "docs";

/**
 * `agents` and `commands` are required; `skills`, `hooks`, `docs` are
 * optional. Grounded in this repo's REAL plugin shape, not the design doc's
 * prose enumeration (02-PATTERNS.md "Real Plugin Directory Contents"):
 * `.claude-plugin/` + `commands/` (17 files) + `agents/` (16 files) always
 * exist and are always non-empty; `hooks/` exists but
 * `RuntimeDescriptor.hooksSubdir` is already optional
 * (`src/installer.ts:37-41`); `skills/` does not exist as a directory in
 * this repo at all.
 *
 * ponytail: `sealTable` (imported, not reimplemented) throws
 * `VerticalRefusedError` — a `vertical-admission.ts` error class — for what
 * is a blueprint-altitude table. Reuse beats a parallel sealing helper with
 * its own error class for one table. Upgrade trigger: a third sealed table
 * this module owns wanting its own error identity.
 */
export const SLOT_REQUIREMENT: ReadonlyMap<ComponentSlot, "required" | "optional"> = sealTable(
  new Map<ComponentSlot, "required" | "optional">([
    ["agents", "required"],
    ["commands", "required"],
    ["skills", "optional"],
    ["hooks", "optional"],
    ["docs", "optional"],
  ]),
  "the blueprint slot-requirement table",
);

/** Frozen, explicitly sorted — never `Object.keys(blueprint)` (N6 determinism,
 *  RESEARCH Pitfall 4). */
export const SLOT_ORDER: readonly ComponentSlot[] = Object.freeze(
  [...SLOT_REQUIREMENT.keys()].sort(),
) as readonly ComponentSlot[];

// ── ComponentRef / BatteryRef ───────────────────────────────────────────────

/** REQ-29's shape verbatim.
 *
 * ponytail: no shipped code path has ever materialized a tournament winner's
 * agent-definition text to disk — winners live only as
 * `winnerCandidate.systemPrompt` in memory (`component-tournament.ts`), so
 * `sourcePath` today points at a file a human or tool placed there, and this
 * phase's tests use fixture files. Upgrade trigger: phase 4's `emit.ts`
 * writes winners, at which point resolution can address emitted artifacts
 * directly. */
export interface ComponentRef {
  slot: ComponentSlot;
  sourcePath: string;
  winnerVariantId: string;
  batteryId: string;
}

/** Deliberately NOT branded: an unbranded `BatteryRef` is precisely what
 *  leaves the receipt gate something real to catch (a hand-built `BatteryRef`
 *  carrying a non-exogenous receipt) — branding it would make the receipt
 *  gate at blueprint construction tautological. */
export interface BatteryRef {
  id: string;
  receipt: OracleReceipt;
}

export function batteryRef(battery: AgentBattery): BatteryRef {
  return Object.freeze({ id: battery.id, receipt: battery.receipt });
}

// ── HarnessBlueprint (branded) ──────────────────────────────────────────────

/** Type-only nominal brand, copied verbatim from `AgentBattery`'s
 *  `VALIDATED_BATTERY` idiom (`src/foundry/battery-types.ts:52-70`). Only
 *  `makeHarnessBlueprint` — which runs the integrity gate first — can mint
 *  the branded value. */
declare const VALIDATED_BLUEPRINT: unique symbol;

export interface HarnessBlueprint {
  schemaVersion: 1;
  id: string;
  vertical: string;
  version: string;
  agents: ComponentRef[];
  commands: ComponentRef[];
  skills: ComponentRef[];
  hooks: ComponentRef[];
  docs: ComponentRef[];
  bridgeConfig: FoundryConfig;
  battery: BatteryRef;
  oracle: OracleReceipt;
  /** Brand — see `VALIDATED_BLUEPRINT`. Never present at runtime. */
  readonly [VALIDATED_BLUEPRINT]: true;
}

export class BlueprintError extends Error {
  constructor(message: string) {
    super(`[foundry:blueprint] ${message}`);
    this.name = "BlueprintError";
  }
}

type BlueprintDraft = Omit<HarnessBlueprint, typeof VALIDATED_BLUEPRINT>;

/**
 * The I/O-free construction gate. Separately named sequential `const`s/`if`s
 * — never one compound boolean (the `component-tournament.ts:150-158`
 * idiom).
 *
 * Non-tautology statement (the three catches this gate provides, stated in
 * the terms the tests in Task 2 prove — `test/foundry-blueprint.test.ts`
 * "the receipt gate" describes):
 *
 * 1. `validateReceipt` (step 1) is reachable and load-bearing — NOT a
 *    redundant re-check of a receipt already proven exogenous — because
 *    `BatteryRef` is deliberately UNBRANDED (see its own doc comment above).
 *    A hand-built `BatteryRef` carries whatever receipt its author supplies;
 *    nothing upstream of this gate has already validated it, unlike a real
 *    `AgentBattery`'s receipt (which `makeBattery` already gates).
 * 2. `Object.is(draft.oracle, draft.battery.receipt)` (step 2) catches what
 *    step 1 structurally cannot: a SUBSTITUTED receipt that is independently
 *    exogenous (e.g. a different battery's own accepted receipt, or a
 *    generator's memoized receipt that is field-identical to but not the
 *    same object as this battery's frozen copy — see `makeBattery`'s
 *    defensive-copy comment, `battery-types.ts:264-267`). `validateReceipt`
 *    alone would pass it; only reference identity tells the two apart.
 * 3. The call site inside `assemble()` (below) is reachable, not dead code,
 *    because a `HarnessBlueprint` is DESIGNED to be serialized and replayed
 *    — `JSON.parse(...) as HarnessBlueprint` is an EXPECTED input shape at
 *    that call site, not a hypothetical one. This is exactly what
 *    distinguishes this posture from `docs/development/harness-factory.md`
 *    § "The seventh gate": that gate's only input was an unforgeable
 *    branded `AgentBattery`, so a redundant re-check there would have been
 *    provably dead code. Do not "fix" this module by deleting the
 *    `assemble()` call under the mistaken belief it repeats that trap —
 *    mutation check M6 (test file) is the proof it does not.
 */
export function requireBlueprintIntegrity(draft: BlueprintDraft): void {
  // Step 0 — shape gate: an absent or non-object `battery`/`oracle`, or a
  // `battery.id` that is not a non-empty string, is refused with a stated
  // reason naming the missing field — never a `TypeError` from reading a
  // property of `undefined`. A forged/replayed blueprint (`JSON.parse(...)
  // as HarnessBlueprint`) can carry any of these shapes.
  if (draft.battery === null || draft.battery === undefined || typeof draft.battery !== "object") {
    throw new BlueprintError(
      `blueprint "${draft.id}" has no "battery" field (or it is not an object) — a missing ` +
        `battery is refused, never a TypeError`,
    );
  }
  if (draft.oracle === null || draft.oracle === undefined || typeof draft.oracle !== "object") {
    throw new BlueprintError(
      `blueprint "${draft.id}" has no "oracle" field (or it is not an object) — a missing ` +
        `oracle is refused, never a TypeError`,
    );
  }
  if (typeof draft.battery.id !== "string" || draft.battery.id.trim() === "") {
    throw new BlueprintError(`blueprint "${draft.id}" battery.id is missing or not a non-empty string`);
  }

  // Step 1 — receipt exogeneity. Imported, never re-derived from
  // `resolveRootKind`/`EXOGENOUS_ROOT_KINDS` (D3).
  validateReceipt(draft.oracle, draft.battery.id);

  // Step 2 — provenance: is `draft.oracle` the SAME object the blueprint's
  // own battery carries, not a field-identical-but-substituted receipt
  // (`component-tournament.ts:154`'s `Object.is` idiom, one altitude up).
  const provenanceOk = Object.is(draft.oracle, draft.battery.receipt);
  if (!provenanceOk) {
    throw new BlueprintError(
      `blueprint "${draft.id}" oracle receipt is not the SAME object as battery ` +
        `"${draft.battery.id}"'s own receipt — a field-identical but substituted receipt is ` +
        `still not this battery's receipt`,
    );
  }

  // Step 3 — every required slot is non-empty.
  for (const slot of SLOT_ORDER) {
    if (SLOT_REQUIREMENT.get(slot) !== "required") continue;
    if (draft[slot].length === 0) {
      throw new BlueprintError(`blueprint "${draft.id}" has an empty required slot "${slot}"`);
    }
  }

  // Step 4 — every ref's own `.slot` agrees with the array it sits in — an
  // inconsistent manifest, cheap to catch, and what makes `ref.slot`
  // meaningful rather than decorative.
  for (const slot of SLOT_ORDER) {
    for (const ref of draft[slot]) {
      if (ref.slot !== slot) {
        throw new BlueprintError(
          `blueprint "${draft.id}" slot "${slot}" contains a ComponentRef whose own .slot is ` +
            `"${ref.slot}" (sourcePath ${JSON.stringify(ref.sourcePath)}) — an inconsistent manifest`,
        );
      }
    }
  }
}

export function makeHarnessBlueprint(draft: BlueprintDraft): HarnessBlueprint {
  requireBlueprintIntegrity(draft);
  return Object.freeze({
    ...draft,
    agents: Object.freeze([...draft.agents]) as ComponentRef[],
    commands: Object.freeze([...draft.commands]) as ComponentRef[],
    skills: Object.freeze([...draft.skills]) as ComponentRef[],
    hooks: Object.freeze([...draft.hooks]) as ComponentRef[],
    docs: Object.freeze([...draft.docs]) as ComponentRef[],
    // bridgeConfig: shallow — stored by reference.
    // ponytail: deep-freezing a whole FoundryConfig costs a recursive walk
    // for a config nobody mutates mid-assembly. Upgrade trigger: a real
    // in-place-mutation bug report against bridgeConfig.
    bridgeConfig: draft.bridgeConfig,
    // The one cast that mints the brand. It is safe precisely here and
    // nowhere else: every gate in requireBlueprintIntegrity has already run
    // on this value.
  }) as HarnessBlueprint;
}

// ── ComponentRef resolution ─────────────────────────────────────────────────

export interface ResolvedComponent {
  ref: ComponentRef;
  entry: ComponentArchiveEntry;
  from: string;
  hash: string;
}

export interface ResolveContext {
  archiveRoot: string;
  assetRoot: string;
  batteryId: string;
}

/**
 * Resolve one `ComponentRef` against the live filesystem + the component
 * archive, or throw `BlueprintError`. Separately named sequential steps,
 * each independently disable-able (mutation-checkable).
 */
export function resolveComponentRef(ref: ComponentRef, ctx: ResolveContext): ResolvedComponent {
  // (a) sourcePath is caller-influenced data that becomes a filesystem path
  // — the repo's ONE containment guard, never a bespoke regex.
  const from = resolveContained(ctx.assetRoot, ref.sourcePath);

  // (b) missing file.
  if (!existsSync(from)) {
    throw new BlueprintError(
      `ComponentRef for slot "${ref.slot}" sourcePath ${JSON.stringify(ref.sourcePath)} does not exist`,
    );
  }

  // (c) hash the live file with the archive's OWN hashing function, reused,
  // so the two schemes cannot desync.
  const hash = componentVariantId(readFileSync(from, "utf8"));

  // (d) drift — the live content no longer matches the ref's claimed winner.
  if (hash !== ref.winnerVariantId) {
    throw new BlueprintError(
      `ComponentRef for slot "${ref.slot}" sourcePath ${JSON.stringify(ref.sourcePath)} drifted — ` +
        `live hash "${hash}" !== claimed winnerVariantId "${ref.winnerVariantId}"`,
    );
  }

  // (e) same-battery-family check (OQ1) — batteryId is checked against the
  // blueprint's own battery, never against the archive (ComponentArchiveEntry
  // has no batteryId field).
  if (ref.batteryId !== ctx.batteryId) {
    throw new BlueprintError(
      `ComponentRef for slot "${ref.slot}" batteryId "${ref.batteryId}" does not match blueprint ` +
        `battery "${ctx.batteryId}" — a ComponentRef must name the same battery family the ` +
        `blueprint was built for`,
    );
  }

  // (f) readComponentArchive -> componentManifestPath -> componentDir already
  // applies assertSafePathSegment to `slot`; this module inherits that one
  // guard rather than adding a redundant second call.
  const matches = readComponentArchive(ctx.archiveRoot, ref.slot).filter(
    (e) => e.artifact.slot === ref.slot && e.artifact.definitionHash === hash,
  );
  if (matches.length === 0) {
    throw new BlueprintError(
      `ComponentRef for slot "${ref.slot}" hash "${hash}" matches no archive entry at ` +
        `${JSON.stringify(ctx.archiveRoot)}`,
    );
  }

  // (g) THE trap this phase exists to close: `componentIncumbent`
  // (`src/harness.ts:406-412`) picks highest fitness with NO verdict filter,
  // and the archive appends on BOTH verdicts (`component-tournament.ts:391-
  // 395`) — copying that shape here would read a refused specimen as a
  // winner, so this resolver does not call `componentIncumbent` at all.
  const promoted = matches.filter((e) => promotionGate(e.gates).promote);
  if (promoted.length === 0) {
    throw new BlueprintError(
      `ComponentRef for slot "${ref.slot}" hash "${hash}" resolves only to REFUSED tournament ` +
        `decisions — a specimen that never passed promotionGate cannot resolve as a winner`,
    );
  }

  return { ref, entry: promoted[0]!, from, hash };
}

// ── assemble ─────────────────────────────────────────────────────────────

export interface AssemblyOptions {
  archiveRoot: string;
  assetRoot: string;
  targetDir: string;
}

export interface AssemblyResult {
  blueprint: HarnessBlueprint;
  resolved: ResolvedComponent[];
  ops: FileOp[];
}

/**
 * Deterministic best-per-slot assembly — no search, no sampling, no scoring
 * (D2). Pure: no `mkdir`, no `writeFile`, nothing materialized (D1 — emit is
 * phase 4).
 */
export function assemble(blueprint: HarnessBlueprint, opts: AssemblyOptions): AssemblyResult {
  // A blueprint is designed to be serialized and replayed, so a
  // `JSON.parse(...) as HarnessBlueprint` reaches `assemble` without passing
  // construction — revalidate as the FIRST statement (mirrors
  // `runAgentBattery`'s own revalidation posture).
  requireBlueprintIntegrity(blueprint);

  // Resolve every ref FIRST — `ops` is only built once every ref across
  // every slot has resolved cleanly, so a refusal anywhere throws before any
  // `FileOp` is returned, never a partial list (D5).
  const resolved: ResolvedComponent[] = [];
  for (const slot of SLOT_ORDER) {
    const refs = [...blueprint[slot]].sort((a, b) =>
      a.sourcePath < b.sourcePath ? -1 : a.sourcePath > b.sourcePath ? 1 : 0,
    );
    for (const ref of refs) {
      resolved.push(
        resolveComponentRef(ref, {
          archiveRoot: opts.archiveRoot,
          assetRoot: opts.assetRoot,
          batteryId: blueprint.battery.id,
        }),
      );
    }
  }
  // R-h — two refs resolving to the same destination path would silently
  // overwrite one another at phase 4's emit. Tracked inside this loop, on
  // every op as it is built, so the collision throws before `ops` is ever
  // returned — never discovered after the fact by a second pass.
  const seenDestinations = new Map<string, string>();
  const ops: FileOp[] = [];
  for (const r of resolved) {
    const to = join(opts.targetDir, r.ref.slot, basename(r.from));
    const priorFrom = seenDestinations.get(to);
    if (priorFrom !== undefined) {
      throw new BlueprintError(
        `blueprint "${blueprint.id}" has two ComponentRefs resolving to the same destination ` +
          `${JSON.stringify(to)} — sourcePaths ${JSON.stringify(priorFrom)} and ` +
          `${JSON.stringify(r.from)} would silently overwrite one another`,
      );
    }
    seenDestinations.set(to, r.from);
    ops.push({ from: r.from, to });
  }
  return { blueprint, resolved, ops };
}
