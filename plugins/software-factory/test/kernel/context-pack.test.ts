import { describe, expect, it } from "bun:test";
import { capPack, renderContextPack } from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { rec, script, task } from "./helpers.js";

const tasks = [task("a"), task("b", { deps: ["a"] })];

describe("context pack", () => {
  it("renders identical bytes for identical derived state", () => {
    const records = [
      rec(1, { step: "review", outcome: { status: "done", summary: "r", concerns: [], forward: ["watch it"], verdict: "approve" } }),
      script(2, { step: "park", ok: true, cause: "round limit", slug: "b" }),
    ];
    const input = {
      goal: "demo",
      iteration: 2,
      intentPath: "/goal/intent.md",
      planPath: "/goal/plan.md",
      checkout: "/wt/demo",
      integrationBranch: "factory/demo",
      headHash: "abcdef1234567890",
      recordsDir: "/goal/records",
      tasksDir: "/goal/tasks",
      previousSummary: "/goal/iterations/1/summary.md",
      tasks,
      state: derive(tasks, records),
      steers: [],
      setup: [],
      gates: [{ id: "test", command: "bun test" }],
      forwarded: [{ source: "a review r1", calibration: "architect", kind: "risk", text: "watch it" }],
    };
    const first = renderContextPack(input);
    const second = renderContextPack(input);
    expect(first).toBe(second);
    expect(first).toContain("| b | parked |");
    expect(first).toContain("round limit");
    expect(first).toContain("abcdef1234");
    expect(first).toContain("bun test");
  });

  it("caps the pack by bytes and says it truncated", () => {
    const big = renderContextPack({
      goal: "demo",
      iteration: 1,
      intentPath: "i",
      planPath: "p",
      checkout: "c",
      integrationBranch: "factory/demo",
      headHash: "abcdef",
      recordsDir: "r",
      tasksDir: "t",
      tasks,
      state: derive(tasks, []),
      steers: [],
      setup: [],
      gates: [],
      forwarded: [],
      maxBytes: 300,
    });
    expect(Buffer.byteLength(big, "utf8")).toBeLessThanOrEqual(300);
    expect(big).toContain("truncated");
    expect(capPack("x".repeat(1000), 100)).toContain("truncated");
  });
});
