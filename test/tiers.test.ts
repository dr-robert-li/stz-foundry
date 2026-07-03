/**
 * Model capability/cost tiers (cycle item 2) — unit + bridge integration.
 *
 * Fable-5-class (Mythos) sits above Opus in capability and price. The field
 * finding: test-author + judge strength is the binding constraint, so the
 * premium tier pays off there and is wasteful on the high-volume specimen role.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  tierOf,
  isPremium,
  withTierPricing,
  auditRoleTiers,
  DEFAULT_TIER_PRICING,
} from "../src/tiers.js";
import { runBridge } from "../src/bridge.js";
import { scaffold } from "../src/taxonomy.js";
import { normalizeRunConfig, saveRunConfig } from "../src/project.js";

describe("tiers unit", () => {
  it("classifies Claude families by alias and full id", () => {
    expect(tierOf("fable")).toBe("mythos");
    expect(tierOf("claude-fable-5")).toBe("mythos");
    expect(tierOf("mythos")).toBe("mythos");
    expect(tierOf("opus")).toBe("opus");
    expect(tierOf("claude-opus-4-8")).toBe("opus");
    expect(tierOf("sonnet")).toBe("sonnet");
    expect(tierOf("claude-haiku-4-5")).toBe("haiku");
  });

  it("classifies local/OSS models and leaves the rest unknown", () => {
    expect(tierOf("granite4.1:30b")).toBe("local");
    expect(tierOf("llama3.3")).toBe("local");
    expect(tierOf("qwen2.5-coder:7b")).toBe("local");
    expect(tierOf("gpt-5")).toBe("unknown");
    expect(tierOf("some-random-model")).toBe("unknown");
  });

  it("marks mythos + opus premium", () => {
    expect(isPremium("mythos")).toBe(true);
    expect(isPremium("opus")).toBe(true);
    expect(isPremium("sonnet")).toBe(false);
    expect(isPremium("local")).toBe(false);
  });

  it("withTierPricing fills defaults for unpriced hosted models, keeps user + local $0", () => {
    const user = { opus: { inputPerMTok: 99, outputPerMTok: 99 } }; // explicit wins
    const out = withTierPricing(user, ["opus", "fable", "granite4.1:30b", "gpt-5"]);
    expect(out.opus).toEqual({ inputPerMTok: 99, outputPerMTok: 99 }); // untouched
    expect(out.fable).toEqual(DEFAULT_TIER_PRICING.mythos); // default filled
    expect(out["granite4.1:30b"]).toBeUndefined(); // local stays $0
    expect(out["gpt-5"]).toBeUndefined(); // unknown stays $0 + reported
  });

  it("audits: premium on a high-volume role WARNS, cheap high-value role INFO", () => {
    const bad = auditRoleTiers({ testAuthor: "haiku", specimen: "opus", judge: "haiku" });
    // one warn (premium specimen) + two info (cheap testAuthor + judge)
    expect(bad.filter((w) => w.severity === "warn")).toHaveLength(1);
    expect(bad[0]!.severity).toBe("warn"); // warn sorts first
    expect(bad[0]!.role).toBe("specimen");
    expect(bad.filter((w) => w.severity === "info").map((w) => w.role).sort()).toEqual(["judge", "testAuthor"]);
  });

  it("the field-earned config (premium test-author/judge, cheap specimen) is clean", () => {
    const good = auditRoleTiers({ testAuthor: "claude-fable-5", judge: "opus", specimen: "haiku", strategist: "granite:30b" });
    expect(good).toHaveLength(0);
  });

  it("accepts custom role classifications (the in-session role names)", () => {
    const w = auditRoleTiers(
      { execution: "opus", testing: "haiku" },
      { highValue: ["testing", "judging"], highVolume: ["planning", "execution"] },
    );
    expect(w.find((x) => x.role === "execution")?.severity).toBe("warn"); // premium on volume
    expect(w.find((x) => x.role === "testing")?.severity).toBe("info"); // cheap high-value
  });
});

describe("tiers bridge integration (model-tiers)", () => {
  let dir: string;
  let captured: string;
  const origWrite = process.stdout.write.bind(process.stdout);
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "stz-tiers-"));
    await scaffold(dir);
    captured = "";
    (process.stdout.write as unknown as (s: string) => boolean) = (s: string) => {
      captured += s;
      return true;
    };
  });
  afterEach(() => {
    process.stdout.write = origWrite;
    rmSync(dir, { recursive: true, force: true });
  });

  it("flags a premium execution model and a cheap testing model", async () => {
    // Backwards allocation: premium on the volume role, cheap on the binding one.
    const cfg = normalizeRunConfig({ models: { execution: "opus", testing: "haiku", judging: "haiku" } as never });
    await saveRunConfig(dir, cfg);
    await runBridge(["model-tiers", "--root", dir]);
    const res = JSON.parse(captured) as {
      roles: Record<string, { model: string; tier: string }>;
      warnings: { role: string; severity: string }[];
    };
    expect(res.roles.execution!.tier).toBe("opus");
    expect(res.roles.testing!.tier).toBe("haiku");
    expect(res.warnings.some((w) => w.role === "execution" && w.severity === "warn")).toBe(true);
    expect(res.warnings.some((w) => w.role === "testing" && w.severity === "info")).toBe(true);
  });
});
