import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { derive } from "../../src/kernel/derive.js";
import { postSteer } from "../../src/kernel/mailbox.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import { rec, script, task } from "./helpers.js";

describe("iteration summary", () => {
  it("is derived from records: decision, debt, parked root causes, owner attention, metrics", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-summary-"));
    const store = createFolderStore(path.join(root, "goal"));
    try {
      await store.ensureLayout();
      await postSteer(store, "s9", "Do we still support node 18?");

      const tasks = [
        task("merged1"),
        task("parked1"),
        task("pending1", { deps: ["parked1"] }),
      ];
      const records = [
        rec(1, {
          step: "architect",
          outcome: {
            status: "done",
            summary: "the goal is met",
            concerns: [
              { kind: "choice", calibration: "architect", text: "kept the old storage format" },
              { kind: "uncertainty", calibration: "owner", text: "confirm the public API is now frozen" },
            ],
            forward: ["debt closed: removed the compatibility shim", "steer s9: yes, drop it"],
            decision: "done",
          },
        }),
        script(2, { slug: "merged1", step: "merge", ok: true }),
        script(3, { slug: "parked1", step: "park", ok: true, cause: "review rejected: missing test" }),
        rec(4, {
          slug: "merged1",
          step: "review",
          outcome: {
            status: "done",
            summary: "approved with a debt note",
            concerns: [{ kind: "debt", calibration: "architect", text: "cache invalidation needs a follow-up" }],
            forward: [],
            verdict: "approve",
          },
        }),
      ];
      const state = derive(tasks, records);
      const rel = await writeIterationSummary(store, {
        iteration: 1,
        state,
        records,
        decision: "done",
      });
      expect(rel).toBe("iterations/1/summary.md");
      const text = fs.readFileSync(path.join(store.goalDir, rel), "utf8");
      const outbox = fs.readFileSync(
        path.join(store.goalDir, "mailbox/outbox/iteration-1-summary.md"),
        "utf8"
      );
      expect(outbox).toBe(text);

      expect(text).toContain("status: goal-met");
      expect(text).toContain("decision: done");
      expect(text).toContain("architect: the goal is met");
      expect(text).toContain("kept the old storage format");
      expect(text).toContain("## Parked by root cause");
      expect(text).toContain("review rejected: missing test");
      expect(text).toContain("parked1");
      expect(text).toContain("- pending: pending1");
      expect(text).toContain("cache invalidation needs a follow-up");
      expect(text).toContain("## Debt closed");
      expect(text).toContain("removed the compatibility shim");
      expect(text).toContain("confirm the public API is now frozen");
      expect(text).toContain("steer s9 is still in mailbox/inbox/s9.md");
      expect(text).toContain("## Metrics");
      expect(text).toContain("turns:");
      expect(text).toContain("merged: 1; parked: 1; pending: 1");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});