/**
 * Component tournaments (Phase 2, Plan 02-01 tracer): two agent-definition
 * specimens run the UNCHANGED `select()` path (REQ-18, N>=2), and the winner
 * reaches a promotion decision whose seventh gate is computed from the real
 * `BatteryRun` receipt — never a caller-supplied boolean (D-02/CONTEXT D2).
 * Offline, deterministic: a hand-rolled `providerImpl` stub, no network, no
 * daemon (D-05/CONTEXT D5).
 */
import { describe, it, expect } from "vitest";
import {
  agentFrontmatter,
  runSearchGeneration,
  promoteComponentWinner,
  runComponentTournament,
  type PromoteComponentWinnerArgs,
} from "../src/foundry/component-tournament.js";
import { runAgentBattery, type CandidateAgent, type BatteryRun } from "../src/foundry/agent-runner.js";
import {
  makeBattery,
  makeSplitBattery,
  validateReceipt,
  BatteryShapeError,
  type AgentBattery,
  type OracleReceipt,
} from "../src/foundry/battery-types.js";
import { evalReward } from "../src/selection.js";
import type { JudgeReliabilityProfile } from "../src/judge-reliability.js";
import type { ChatRequest, ChatResponse, Provider } from "../src/foundry/provider.js";
import type { PredicateCheck } from "../src/contract/contract-types.js";

// ── the one shared offline double (D-05/CONTEXT D5): a hand-rolled
// providerImpl that keys its canned response off the candidate's own system
// prompt (the "WINNING"/"LOSING" marker), rather than the task prompt — so
// every task, for a given candidate, resolves the same way. ────────────────
const provider: Provider = {
  kind: "openai",
  baseUrl: "http://test-provider.invalid",
  async chat(req: ChatRequest): Promise<ChatResponse> {
    const winning = (req.system ?? "").includes("WINNING");
    return {
      text: winning ? "```path=out.txt\nok\n```" : "```path=out.txt\nnope\n```",
      model: req.model,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 },
    };
  },
};

const CHECK: PredicateCheck = {
  checkId: "c1",
  kind: "output-assertion",
  input: "out.txt",
  expect: "ok",
  description: "out.txt says ok",
};

const WINNING_DEF = "---\nname: stz-winner\ntools: Read, Write\n---\nWINNING agent body.";
const LOSING_DEF = "---\nname: stz-loser\ntools: Read\n---\nLOSING agent body.";

const candidates: CandidateAgent[] = [
  { id: "cand-win", systemPrompt: WINNING_DEF },
  { id: "cand-lose", systemPrompt: LOSING_DEF },
];

const judgeProfile: JudgeReliabilityProfile = {
  schemaVersion: 1,
  perSliceType: [{ sliceType: "component", consistency: 1, blindAccuracyBucket: "high", n: 4 }],
};

function makeSplit() {
  return makeSplitBattery(
    {
      id: "search-battery",
      tasks: [{ id: "search-t1", prompt: "write out.txt containing ok", checks: [CHECK] }],
      receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] },
    },
    {
      id: "promotion-battery",
      tasks: [{ id: "promo-t1", prompt: "write out.txt containing ok", checks: [CHECK] }],
      receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] },
    },
  );
}

interface Baseline {
  split: ReturnType<typeof makeSplit>;
  winnerId: string;
  winnerCandidate: CandidateAgent;
  searchRun: BatteryRun;
  promotionRun: BatteryRun;
  generationRewards: number[];
}

async function baseline(): Promise<Baseline> {
  const split = makeSplit();
  const search = await runSearchGeneration(candidates, split.search, { providerImpl: provider });
  const winnerId = search.judgment.winner;
  if (winnerId === null) throw new Error("test setup: no winner selected");
  const winnerCandidate = candidates.find((c) => c.id === winnerId)!;
  const promotionRun = await runAgentBattery(winnerCandidate, split.promotion, { providerImpl: provider });
  const generationRewards = [...search.runs.values()].map((r) => evalReward(r.result));
  return { split, winnerId, winnerCandidate, searchRun: search.runs.get(winnerId)!, promotionRun, generationRewards };
}

function argsFor(b: Baseline, overrides: Partial<PromoteComponentWinnerArgs> = {}): PromoteComponentWinnerArgs {
  return {
    searchRun: b.searchRun,
    promotionRun: b.promotionRun,
    searchBattery: b.split.search,
    promotionBattery: b.split.promotion,
    winnerFrontmatter: b.winnerCandidate.systemPrompt,
    incumbentFrontmatter: b.winnerCandidate.systemPrompt,
    incumbentFitness: 0,
    generationRewards: b.generationRewards,
    diversityFloor: 0.01,
    judgeProfile,
    sliceType: "component",
    ...overrides,
  };
}

describe("agentFrontmatter", () => {
  it("extracts the YAML block between the two delimiter lines", () => {
    expect(agentFrontmatter(WINNING_DEF)).toBe("name: stz-winner\ntools: Read, Write");
  });
  it("returns empty string when there is no frontmatter", () => {
    expect(agentFrontmatter("just body text, no frontmatter")).toBe("");
  });
});

describe("makeSplitBattery — a split whose halves overlap cannot exist as a value", () => {
  it("throws BatteryShapeError naming the colliding task id when both halves share one", () => {
    expect(() =>
      makeSplitBattery(
        { id: "search-battery", tasks: [{ id: "shared-t1", prompt: "p1", checks: [CHECK] }], receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] } },
        { id: "promotion-battery", tasks: [{ id: "shared-t1", prompt: "p2", checks: [CHECK] }], receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] } },
      ),
    ).toThrowError(BatteryShapeError);
    try {
      makeSplitBattery(
        { id: "search-battery", tasks: [{ id: "shared-t1", prompt: "p1", checks: [CHECK] }], receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] } },
        { id: "promotion-battery", tasks: [{ id: "shared-t1", prompt: "p2", checks: [CHECK] }], receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] } },
      );
      throw new Error("test setup: expected makeSplitBattery to throw");
    } catch (e) {
      expect((e as Error).message).toContain("shared-t1");
      expect((e as Error).message).toContain("search-battery");
      expect((e as Error).message).toContain("promotion-battery");
    }
  });

  it("throws when both halves share a battery id (landed in 02-01 — still holds)", () => {
    expect(() =>
      makeSplitBattery(
        { id: "same-id", tasks: [{ id: "t1", prompt: "p1", checks: [CHECK] }], receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] } },
        { id: "same-id", tasks: [{ id: "t2", prompt: "p2", checks: [CHECK] }], receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] } },
      ),
    ).toThrowError(BatteryShapeError);
  });

  it("a disjoint split returns a value whose two halves are each frozen and independently carry a validated receipt", () => {
    const split = makeSplit();
    expect(Object.isFrozen(split.search)).toBe(true);
    expect(Object.isFrozen(split.promotion)).toBe(true);
    expect(() => validateReceipt(split.search.receipt, split.search.id)).not.toThrow();
    expect(() => validateReceipt(split.promotion.receipt, split.promotion.id)).not.toThrow();
  });

  it("a half that would fail makeBattery on its own (zero tasks) still throws — the pair-level guard does not weaken the per-half gates", () => {
    expect(() =>
      makeSplitBattery(
        { id: "search-battery", tasks: [], receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] } },
        { id: "promotion-battery", tasks: [{ id: "t1", prompt: "p1", checks: [CHECK] }], receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] } },
      ),
    ).toThrowError(BatteryShapeError);
  });
});

describe("component tournament — the tracer's central proof", () => {
  it("selects the passing specimen through the unchanged select() path (REQ-18, N>=2)", async () => {
    const split = makeSplit();
    const search = await runSearchGeneration(candidates, split.search, { providerImpl: provider });
    expect(search.judgment.winner).toBe("cand-win");
    expect(search.eliminated.map((e) => e.specimen)).toContain("cand-lose");
  });

  it("runComponentTournament promotes a genuine winner end to end when every gate's evidence is satisfied", async () => {
    const split = makeSplit();
    const result = await runComponentTournament({
      candidates,
      split,
      incumbentFrontmatter: WINNING_DEF,
      incumbentFitness: 0,
      diversityFloor: 0.01,
      judgeProfile,
      sliceType: "component",
      runOpts: { providerImpl: provider },
    });
    expect(result.winner).toBe("cand-win");
    expect(result.promotion).not.toBeNull();
    expect(result.promotion!.verdict.promote).toBe(true);
    expect(result.promotion!.verdict.failed).toEqual([]);
    expect(result.promotion!.inputs.exogenousLineage).toBe(true);
  });

  it("CONTROL: a substituted receipt from a different, independently-validated battery is refused (data-flow forgery)", async () => {
    const b = await baseline();
    const foreignBattery = makeBattery({
      id: "unrelated-battery",
      tasks: [{ id: "u1", prompt: "unrelated", checks: [CHECK] }],
      // Exogenous root, human acceptor — the exogeneity step ALONE would pass
      // this receipt; only the provenance (reference-identity) step catches it.
      receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] },
    });
    const forgedRun: BatteryRun = { ...b.promotionRun, receipt: foreignBattery.receipt };

    const result = promoteComponentWinner(argsFor(b, { promotionRun: forgedRun }));

    expect(result.verdict.promote).toBe(false);
    expect(result.verdict.failed).toContain("fitness-lineage-not-exogenous");
  });

  it("CONTROL: a receipt rooted in anchored-judge is refused with the same reason", async () => {
    const b = await baseline();
    // anchored-judge is never a valid exogenous root (CONTEXT hard invariant).
    // Both the run's receipt AND the battery's own receipt point at the SAME
    // object, so provenance genuinely passes here — isolating the refusal to
    // the exogeneity step alone.
    const anchoredReceipt: OracleReceipt = { kind: "anchored-judge", acceptedBy: "Dr. Robert Li", lineage: [] };
    const fakeBattery = { ...b.split.promotion, receipt: anchoredReceipt } as unknown as AgentBattery;
    const fakeRun: BatteryRun = { ...b.promotionRun, receipt: anchoredReceipt };

    const result = promoteComponentWinner(argsFor(b, { promotionRun: fakeRun, promotionBattery: fakeBattery }));

    expect(result.verdict.promote).toBe(false);
    expect(result.verdict.failed).toContain("fitness-lineage-not-exogenous");
  });

  it("CONTROL: no receipt on the run is refused, not thrown past", async () => {
    const b = await baseline();
    const noReceiptRun = { ...b.promotionRun, receipt: undefined } as unknown as BatteryRun;

    let result;
    expect(() => {
      result = promoteComponentWinner(argsFor(b, { promotionRun: noReceiptRun }));
    }).not.toThrow();

    expect(result!.verdict.promote).toBe(false);
    expect(result!.verdict.failed).toContain("fitness-lineage-not-exogenous");
  });

  it("refuses with interface-parity-broken when the winner's frontmatter diverges from the incumbent's", async () => {
    const b = await baseline();
    const result = promoteComponentWinner(argsFor(b, { incumbentFrontmatter: LOSING_DEF }));

    expect(result.verdict.promote).toBe(false);
    expect(result.verdict.failed).toContain("interface-parity-broken");
  });
});
