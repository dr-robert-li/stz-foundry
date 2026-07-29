/**
 * What may be indexed, and who may see it — two independent default-deny tables.
 *
 * `INDEXABLE_TIERS` is the DATA-layer control: an allowlist, never a denylist.
 * The `.stz/` tree holds the sealed held-out suite, the test author's reference
 * implementation, the judging rubric, every culled specimen's source and every
 * competing specimen's source. A denylist is one new subdirectory away from
 * serving the answer key into an implementer's context; an allowlist makes the
 * question moot by construction — `30-tests/` is simply never walked, so no
 * path-normalization bug, symlink, or future tier can leak it.
 *
 * The three allowlisted tiers are exactly the tiers written behind a pipeline
 * approval gate (`/stz-f:new`, `/stz-f:research` + `/stz-f:validate`,
 * `/stz-f:conventions`). That gate is the warrant for `poolFromIndex()` stamping
 * `trust: "accepted"`. Caveat: under `--auto` / `darkFactory: true` those gates
 * auto-approve, so "human-approved" is weaker in that mode — the tier is still
 * the approval-gated tier and dark factory is an explicit operator opt-out.
 *
 * `ROLE_SCOPES` is the QUERY-layer control: a role absent from the table gets
 * nothing. `resolveRoleScope()` returns `null` for an unknown role rather than
 * defaulting or unioning — an unknown `--role` must retrieve zero artifacts.
 */
import { DEFAULT_CAPS, type RetrievableKind } from "./retrieval.js";
import { STZ_ROLES, type StzRole } from "../types.js";

/** ONLY these tiers are ever walked. Everything else is invisible to the indexer. */
export const INDEXABLE_TIERS = ["00-intent", "10-research", "20-standards"] as const;

/**
 * True only for a POSIX-relative `.stz/`-relative path inside an allowlisted
 * tier. Rejects `..` segments and absolute paths here rather than at each call
 * site: every path that reaches the index — from the walk and from an untrusted
 * prior index file alike — routes through this one guard.
 */
export function isIndexable(relPath: string): boolean {
  if (/^[\\/]/.test(relPath)) return false;
  if (relPath.split(/[\\/]/).includes("..")) return false;
  return INDEXABLE_TIERS.some((tier) => relPath.startsWith(`${tier}/`));
}

/** Deterministic kind inference from path — no model involved. */
export function kindForPath(relPath: string): RetrievableKind {
  return relPath.startsWith("20-standards/architecture-decisions/") ? "decision" : "convention";
}

export interface RoleScope {
  /** The ceiling on what this role may retrieve. Never widened by a caller. */
  kinds: RetrievableKind[];
  /** Merged OVER `DEFAULT_CAPS`, so `repo_note: 0` survives for every role. */
  caps: Partial<Record<RetrievableKind, number>>;
}

/**
 * Default-deny: a role absent from this table retrieves nothing.
 *
 * `execution` is the CTIM-Rover-critical role (`agents/stz-specimen.md`) and gets
 * the tightest scope: no `rubric` (a specimen that reads the judging rubric games
 * the judge) and no `decision` (architecture rationale is noise to an implementer).
 */
export const ROLE_SCOPES: Record<StzRole, RoleScope> = {
  planning: { kinds: ["convention", "decision", "contract_delta"], caps: { convention: 2, decision: 2 } },
  research: { kinds: ["convention", "decision"], caps: { convention: 3, decision: 3 } },
  execution: { kinds: ["predicate", "contract_delta", "convention"], caps: { convention: 2 } },
  testing: { kinds: ["predicate", "contract_delta", "convention"], caps: { convention: 1 } },
  validation: { kinds: ["predicate", "decision"], caps: {} },
  judging: { kinds: ["rubric", "convention"], caps: {} },
};

const isStzRole = (role: string): role is StzRole => (STZ_ROLES as readonly string[]).includes(role);

/** `null` for anything not in `STZ_ROLES` — never a union fallback, never a default. */
export function resolveRoleScope(role: string): RoleScope | null {
  return isStzRole(role) ? ROLE_SCOPES[role] : null;
}

/**
 * Per-kind caps for a role, merged OVER `DEFAULT_CAPS`.
 *
 * NOTE: this is a cap table, NOT the scoping control. It deliberately retains a
 * non-zero cap for kinds the role's scope excludes, so it can never substitute
 * for `resolveRoleScope(role).kinds` when building `query.requestedKinds`.
 */
export function capsForRole(role: string): Record<RetrievableKind, number> | null {
  const scope = resolveRoleScope(role);
  return scope ? { ...DEFAULT_CAPS, ...scope.caps } : null;
}
