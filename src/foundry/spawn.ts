/**
 * Specimen spawn layer (stage 3 of the Foundry rebuild). Un-stubs the
 * orchestrator's sequential specimen loop: N specimens run **concurrently**
 * under a bounded pool, each with a wall-clock kill (R10 stuck-detection).
 *
 * A killed or crashed specimen never aborts the round — it is reported in
 * `killed` and the tournament proceeds with the survivors, consistent with
 * the "long-tail tolerated, minimal blocking" posture (N4). Output order is
 * the input strategy order regardless of completion order (N6 determinism:
 * specimen ids and downstream artifacts must not depend on scheduling).
 *
 * Isolation note: worktree handles are SUPPLIED by the caller through
 * `SpawnOptions.worktrees` (the orchestrator owns create/destroy, the bridge
 * owns the in-session lifecycle). This module records which isolation actually
 * ran on each `SpecimenRunRecord` but never creates or destroys one — keeping
 * the version-control seam out of the pool loop is what lets a single
 * try/finally upstream cover every exit.
 */
import type { SliceManifest, SpecimenId } from "../types.js";
import type { WorktreeHandle, WorktreeMode } from "../worktree.js";
import type { Specimen, SpecimenOutput } from "../mock/interfaces.js";

export interface KilledSpecimen {
  strategy: string;
  reason: "timeout" | "error";
  detail: string;
}

/**
 * The per-specimen run record (REQ-04). One per input strategy — successful,
 * stuck-killed, crashed or deadline-skipped — so no specimen's outcome is
 * unattributable. Ephemeral by design (CONTEXT D5): the durable half lives in
 * the existing 90-audit/ ledger and cost report, not in a second store.
 */
export interface SpecimenRunRecord {
  strategy: string;
  /** `null` when the specimen died before implement() assigned an id. */
  specimen: SpecimenId | null;
  status: "ok" | "timeout" | "error";
  /** `null` on the success path; otherwise the kill/crash detail. */
  killReason: string | null;
  /** Wall-clock spent inside implement(). 0 for a deadline-skipped specimen. */
  durationMs: number;
  /** Which isolation actually ran — a fallback is reported, never silent (D3). */
  isolation: WorktreeMode;
  worktreePath: string | null;
  /** Filled by the orchestrator after the round; it alone knows the worktree contents. */
  diffFiles: string[] | null;
}

export interface SpawnResult {
  /** Successful outputs, in input-strategy order. */
  outputs: SpecimenOutput[];
  killed: KilledSpecimen[];
  /**
   * One record per input strategy, in input-strategy order (N6) — required, so
   * no caller can silently skip attribution. `records.length === strategies.length`.
   */
  records: SpecimenRunRecord[];
}

export interface SpawnOptions {
  /** Max specimens in flight at once. Default: all (N is already small). */
  concurrency?: number;
  /** Per-specimen wall-clock kill (R10). Default: no timeout. */
  timeoutMs?: number;
  /**
   * Absolute run-level deadline (epoch ms, #4). A specimen not yet started once
   * the deadline passes is skipped (reported killed:timeout); an in-flight one
   * is bounded by whichever of `timeoutMs` / remaining-to-deadline is sooner.
   */
  deadlineMs?: number;
  /**
   * Per-specimen isolation handles, indexed by strategy position. Supplied by
   * the caller; a missing/`null` entry reports as plain directory isolation.
   */
  worktrees?: (WorktreeHandle | null)[];
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`specimen ${label}: no result within ${ms}ms (stuck-killed)`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export async function spawnSpecimens(
  specimen: Specimen,
  manifest: SliceManifest,
  strategies: string[],
  refinement: string | null,
  opts: SpawnOptions = {},
): Promise<SpawnResult> {
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? strategies.length, strategies.length));
  const slots: (SpecimenOutput | KilledSpecimen)[] = new Array(strategies.length);
  // Index-aligned with `slots`: the ordering is structural, never sorted (N6).
  const recordSlots: SpecimenRunRecord[] = new Array(strategies.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < strategies.length) {
      const i = next++;
      const strategy = strategies[i]!;
      const wt = opts.worktrees?.[i] ?? null;
      const isolation: WorktreeMode = wt?.mode ?? "directory";
      const worktreePath = wt?.path ?? null;
      // Run-level deadline: don't start a new specimen past the ceiling.
      if (opts.deadlineMs !== undefined && Date.now() >= opts.deadlineMs) {
        const detail = "run wall-clock deadline reached before spawn";
        slots[i] = { strategy, reason: "timeout", detail };
        recordSlots[i] = {
          strategy,
          specimen: null,
          status: "timeout",
          killReason: detail,
          durationMs: 0,
          isolation,
          worktreePath,
          diffFiles: null,
        };
        continue;
      }
      // Effective per-specimen bound = min(explicit timeout, time left to deadline).
      const remaining = opts.deadlineMs !== undefined ? opts.deadlineMs - Date.now() : Infinity;
      const bound = Math.min(opts.timeoutMs ?? Infinity, remaining);
      const t0 = Date.now();
      try {
        const run = specimen.implement(manifest, strategy, refinement);
        const out = Number.isFinite(bound) ? await withTimeout(run, bound, strategy) : await run;
        slots[i] = out;
        recordSlots[i] = {
          strategy,
          specimen: out.specimen,
          status: "ok",
          killReason: null,
          durationMs: Date.now() - t0,
          isolation,
          worktreePath,
          diffFiles: null,
        };
      } catch (e) {
        const reason = e instanceof Error && e.message.includes("stuck-killed") ? "timeout" : "error";
        const detail = e instanceof Error ? e.message : String(e);
        slots[i] = { strategy, reason, detail };
        recordSlots[i] = {
          strategy,
          specimen: null,
          status: reason,
          killReason: detail,
          durationMs: Date.now() - t0,
          isolation,
          worktreePath,
          diffFiles: null,
        };
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const outputs: SpecimenOutput[] = [];
  const killed: KilledSpecimen[] = [];
  for (const s of slots) {
    if (s && "specimen" in s) outputs.push(s);
    else if (s) killed.push(s);
  }
  return { outputs, killed, records: recordSlots };
}
