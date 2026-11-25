import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { derive } from "../../src/kernel/derive.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import { rec, task } from "./helpers.js";

function registerDoneWithOpenDebt(): void {
  it("lists the open debt on a goal the architect settled done", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "factory-summary-done-debt-"),
    );
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    try {
      await store.ensureLayout();
      const debtText = "cache invalidation needs a follow-up task";
      const records = [
        rec(1, {
          slug: "a",
          step: "review",
          outcome: {
            status: "done",
            summary: "approved with debt",
            concerns: [
              { kind: "debt", calibration: "architect", text: debtText },
            ],
            forward: [],
            verdict: "approve",
          },
        }),
        rec(2, {
          slug: undefined,
          step: "architect",
          outcome: {
            status: "done",
            summary: "goal met with debt listed",
            concerns: [],
            forward: [],
            decision: "done",
          },
        }),
      ];
      const state = derive([task("a")], records);
      expect(state.goal).toBe("done");
      const rel = await writeIterationSummary(store, {
        iteration: 1,
        state,
        records,
        decision: "done",
      });
      const text = fs.readFileSync(path.join(store.goalDir, rel), "utf8");
      expect(text).toContain("status: goal-met");
      const distance = text.slice(
        text.indexOf("## Distance"),
        text.indexOf("## Architect"),
      );
      expect(distance).toContain("- open debt (1):");
      expect(distance).toContain(debtText);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

describe("iteration summary with open debt", () => {
  registerDoneWithOpenDebt();
});
