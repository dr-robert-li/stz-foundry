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
 * Isolation note: each specimen's files are materialized by the orchestrator
 * into its own prototypes/specimen-X/ directory, and the foundry eval runner
 * already executes each specimen in a private temp dir. Git-worktree isolation
 * matters when specimens EDIT a shared repo; foundry v1 specimens synthesize
 * files from a contract, so directory isolation is the honest minimum.
 * ponytail: directory isolation only; add git worktrees when repo-editing
 * slices arrive.
 */
import type { SliceManifest } from "../types.js";
import type { Specimen, SpecimenOutput } from "../mock/interfaces.js";

export interface KilledSpecimen {
  strategy: string;
  reason: "timeout" | "error";
  detail: string;
}

export interface SpawnResult {
  /** Successful outputs, in input-strategy order. */
  outputs: SpecimenOutput[];
  killed: KilledSpecimen[];
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
  let next = 0;

  async function worker(): Promise<void> {
    while (next < strategies.length) {
      const i = next++;
      const strategy = strategies[i]!;
      // Run-level deadline: don't start a new specimen past the ceiling.
      if (opts.deadlineMs !== undefined && Date.now() >= opts.deadlineMs) {
        slots[i] = { strategy, reason: "timeout", detail: "run wall-clock deadline reached before spawn" };
        continue;
      }
      // Effective per-specimen bound = min(explicit timeout, time left to deadline).
      const remaining = opts.deadlineMs !== undefined ? opts.deadlineMs - Date.now() : Infinity;
      const bound = Math.min(opts.timeoutMs ?? Infinity, remaining);
      try {
        const run = specimen.implement(manifest, strategy, refinement);
        slots[i] = Number.isFinite(bound)
          ? await withTimeout(run, bound, strategy)
          : await run;
      } catch (e) {
        slots[i] = {
          strategy,
          reason: e instanceof Error && e.message.includes("stuck-killed") ? "timeout" : "error",
          detail: e instanceof Error ? e.message : String(e),
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
  return { outputs, killed };
}
