// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { next } from "../../src/kernel/next.js";
import { writeIterationSummary } from "../../src/kernel/summary.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

describe("KERNEL0 scenario 2 — last-call review decisions", () => {
  it("parks a last-call reject, leaves its dependent pending and merges an independent task", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
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
      // alpha parks on its last-call rejection while beta merges: the
      // wave-end stall gets the park.
      scriptStallLeave(harness, ["alpha"]);
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "alpha v1" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "alpha needs work",
            verdict: "changes",
            concerns: [
              {
                kind: "risk",
                calibration: "architect",
                text: "alpha is shaky",
              },
            ],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "v2\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "alpha v2" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "not salvageable", verdict: "reject" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "beta implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "beta approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      await writeTask(
        runtime,
        task("gamma", { deps: ["alpha"], scope: ["gamma.txt"] }),
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.alpha!.status).toBe("parked");
      expect(state.tasks.alpha!.cause).toContain("review rejected");
      expect(state.tasks.beta!.status).toBe("merged");
      expect(state.tasks.gamma!.status).toBe("pending");
      expect(state.tasks.gamma!.phase).toBe("implement");
      expect(next(state, runtime.limits, new Set())).toEqual([
        { kind: "boundary" },
      ]);

      const park = (await runtime.store.listRecords()).find(
        (r) => r.slug === "alpha" && r.step === "park",
      );
      expect(park?.cause).toContain("review rejected");
      const commits = (await runtime.store.listRecords()).filter(
        (r) => r.slug === "alpha" && r.step === "commit",
      );
      expect(commits.length).toBe(4);
      expect(commits.every((r) => r.commit && r.tree)).toBe(true);
      expect(repo.git(["show", "factory/demo:beta.txt"]).stdout.trim()).toBe(
        "beta",
      );
      expect(
        repo.git(["show", "factory/demo:alpha.txt"], { allowFail: true }).code,
      ).not.toBe(0);

      await writeIterationSummary(runtime.store, {
        iteration: 1,
        state,
        records: await runtime.store.listRecords(),
        status: "in-progress",
      });
      const summary = fs.readFileSync(
        path.join(runtime.store.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("## Parked by root cause");
      expect(summary).toMatch(/review rejected: not salvageable\n {2}- alpha/);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("merges a last-call approve with concerns and records them as debt", async () => {
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
        ctx.writeOutcome(outcome({ summary: "v1" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "first pass needs work",
            verdict: "changes",
            concerns: [
              { kind: "risk", calibration: "architect", text: "first concern" },
            ],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v2\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v2" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "ships with its remaining risk recorded",
            verdict: "approve",
            concerns: [
              {
                kind: "uncertainty",
                calibration: "architect",
                text: "last concern",
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
      const debt = records.find((r) => r.slug === "task" && r.step === "debt");
      expect(debt?.outcome?.concerns[0]?.kind).toBe("debt");
      expect(debt?.outcome?.concerns[0]?.text).toBe("last concern");

      await writeIterationSummary(runtime.store, {
        iteration: 1,
        state,
        records,
        status: "in-progress",
      });
      const summary = fs.readFileSync(
        path.join(runtime.store.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("last concern");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
