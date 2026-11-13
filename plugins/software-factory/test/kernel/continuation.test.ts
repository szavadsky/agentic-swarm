import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

describe("parked continuation", () => {
  it("branches a task with base from the parked task's kept branch, not the integration head", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "alpha is not acceptable", verdict: "reject" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        expect(fs.existsSync(path.join(req.cwd!, "alpha.txt"))).toBe(true);
        fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "beta on top of alpha" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "beta approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { base: "alpha", scope: ["beta.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
      expect(state.tasks.alpha!.status).toBe("parked");
      expect(state.tasks.beta!.status).toBe("merged");

      const alphaTip = repo.git(["rev-parse", "factory-task/demo/alpha"]).stdout.trim();
      const betaFirst = records
        .filter((r) => r.slug === "beta" && r.step === "implement")
        .sort((a, b) => a.seq - b.seq)[0];
      expect(betaFirst?.base).toBe(alphaTip);

      expect(repo.git(["show", "factory/demo:alpha.txt"]).stdout.trim()).toBe("alpha");
      expect(repo.git(["show", "factory/demo:beta.txt"]).stdout.trim()).toBe("beta");
      expect(repo.git(["rev-parse", "--verify", "refs/heads/factory-task/demo/alpha"]).code).toBe(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
