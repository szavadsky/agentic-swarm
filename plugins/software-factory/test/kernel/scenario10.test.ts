// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { causeText, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

const FINDINGS =
  "1. src/x.ts:41 needs a null check\n2. test/y.ts:9 asserts nothing";

describe("KERNEL0 scenario 10 — review reply round-trip", () => {
  it("answers a changes review with replies and no diff, then the next review approves", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const replies = [
        {
          finding: 1,
          reply: "The null check is already at src/x.ts:41; no change needed.",
        },
        {
          finding: 2,
          reply: "The test asserts the failure path at test/y.ts:9.",
        },
      ];
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: FINDINGS, verdict: "changes" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "replied without a change", replies }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "both findings answered", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      expect(state.tasks.task!.park).toBeUndefined();
      expect(
        records.filter((r) => r.slug === "task" && r.step === "park"),
      ).toEqual([]);

      const implement = records
        .filter((r) => r.slug === "task" && r.step === "implement")
        .sort((a, b) => a.seq - b.seq);
      expect(implement).toHaveLength(2);
      expect(implement[1]!.commit).toBe(implement[0]!.commit);
      expect(implement[1]!.outcome?.replies).toEqual(replies);

      const reviewPrompt = harness.calls[5]!.prompt;
      expect(reviewPrompt).toContain(FINDINGS);
      for (const { finding, reply } of replies) {
        expect(reviewPrompt).toContain(`finding ${finding}`);
        expect(reviewPrompt).toContain(reply);
      }
      expect(repo.git(["show", "factory/demo:task.txt"]).stdout.trim()).toBe(
        "v1",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("parks empty-diff when a changes fix has neither a diff nor replies", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: FINDINGS, verdict: "changes" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "nothing to report" }));
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["task"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("parked");
      expect(causeText(state.tasks.task!.cause)).toStartWith("empty-diff:");
      expect(
        records.filter((r) => r.slug === "task" && r.step === "review"),
      ).toHaveLength(1);
      expect(
        records.filter((r) => r.slug === "task" && r.step === "implement"),
      ).toHaveLength(2);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("bounds a reply ping-pong by the change-request bound and ships its last call", async () => {
    const { repo, goal } = setupFlowRepo({
      process: {
        flows: {
          "implement-review": {
            steps: [
              { id: "implement", prompt: "implementer", alias: "implementer" },
              {
                id: "review",
                prompt: "reviewer",
                alias: "reviewer",
                review: true,
                changeRequests: 1,
              },
            ],
          },
        },
      },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: FINDINGS, verdict: "changes" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "replied without a change",
            replies: [
              { finding: 1, reply: "already checked" },
              { finding: 2, reply: "already asserted" },
            ],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "1. one finding remains; shipping with it recorded",
            verdict: "approve",
            concerns: [
              {
                kind: "uncertainty",
                calibration: "architect",
                text: "one finding remains",
              },
            ],
          }),
        );
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      expect(harness.calls).toHaveLength(4);
      expect(
        records.filter((r) => r.slug === "task" && r.step === "implement"),
      ).toHaveLength(2);
      const debt = records.find((r) => r.slug === "task" && r.step === "debt");
      expect(debt?.outcome?.concerns[0]?.text).toBe("one finding remains");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
