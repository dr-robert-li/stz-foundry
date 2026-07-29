/**
 * The tracer (Phase 1 — Agentic eval seam, Plan 01-01): one battery, one
 * task, one `output-assertion` check, an `execution`-rooted receipt, run end
 * to end through `runAgentBattery` against a stubbed in-process agent, whose
 * `EvalResult` the existing UNMODIFIED selection path (`evalGate`/
 * `evalReward`/`select`) consumes. No network, no daemon.
 */
import { describe, it, expect, afterEach } from "vitest";
import { fakeServer, closeAllFakeServers } from "./helpers/fake-server.js";
import { runAgentBattery } from "../src/foundry/agent-runner.js";
import { makeBattery } from "../src/foundry/battery-types.js";
import { evalGate, evalReward, select } from "../src/selection.js";

afterEach(() => {
  closeAllFakeServers();
});

describe("runAgentBattery (tracer)", () => {
  it("runs a one-task battery end to end and the unmodified selection path consumes it", async () => {
    const srv = await fakeServer(() => ({
      status: 200,
      json: {
        model: "test-model",
        choices: [{ message: { content: "```path=out.txt\nok\n```" } }],
      },
    }));

    const battery = makeBattery({
      id: "battery-01",
      tasks: [
        {
          id: "t1",
          prompt: "write out.txt containing the text ok",
          checks: [
            {
              checkId: "t1-out",
              kind: "output-assertion",
              input: "out.txt",
              expect: "ok",
              description: "out.txt contains ok",
            },
          ],
        },
      ],
      receipt: { kind: "execution", acceptedBy: "Dr. Robert Li", lineage: [] },
    });

    const run = await runAgentBattery(
      { id: "cand-a", systemPrompt: "you write files as fenced blocks marked path=<file>" },
      battery,
      { provider: { kind: "openai", baseUrl: srv.url, model: "test-model" } },
    );

    expect(run.tasks[0]?.pass).toBe(true);
    expect(run.result.testPassRate).toBe(1);
    expect(run.result.passedGate).toBe(true);
    expect(run.result.specimen).toBe("cand-a");
    expect(run.receipt.kind).toBe("execution");
    expect(run.provider.baseUrl).toBe(srv.url);

    // The structural-compatibility proof is executable, not prose (REQ-14):
    // the unmodified selection path consumes `run.result` directly.
    const gate = evalGate([run.result]);
    expect(gate.passers).toEqual(["cand-a"]);
    expect(gate.eliminated).toEqual([]);

    const reward = evalReward(run.result);
    expect(Number.isFinite(reward)).toBe(true);
    expect(reward).toBeGreaterThanOrEqual(0);
    expect(reward).toBeLessThanOrEqual(1);

    const { judgment } = select([run.result], []);
    expect(judgment.winner).toBe("cand-a");
  });

  it("a battery whose receipt roots in anchored-judge cannot be constructed", () => {
    let thrown: unknown;
    try {
      makeBattery({
        id: "battery-02",
        tasks: [
          {
            id: "t1",
            prompt: "irrelevant — construction fails before any task runs",
            checks: [
              { checkId: "c1", kind: "output-assertion", expect: "x", description: "d" },
            ],
          },
        ],
        receipt: { kind: "anchored-judge", acceptedBy: "Dr. Robert Li", lineage: [] },
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain("anchored-judge");
    expect(message).toContain("exogenous");
  });
});
