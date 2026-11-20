// biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: split-rest-functions
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { dispatch } from "../../src/cli/dispatch.js";
import { expectDispatch } from "./e2e-helpers.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { postSteer } from "../../src/kernel/mailbox.js";
import { createDrainController } from "../../src/kernel/signals.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { testPriceSource } from "../helpers/price-source.js";
import {
  PLAN,
  ALPHA,
  BETA,
  outcome,
  setupRepo,
  silenceWarn,
  queueDigestSteer,
  drainedAfterAlpha,
  setLimits,
} from "./resume-helpers.js";

describe("resume guards — holds and budgets", () => {
  it("a goal hold sends the relaunch to the boundary instead of resuming", async () => {
    const { repo, goalDir } = await drainedAfterAlpha();
    try {
      const store = createFolderStore(goalDir, undefined, {});
      await postSteer(store, "s1", "Hold the goal.");
      fs.mkdirSync(path.join(goalDir, "mailbox/holds"), { recursive: true });
      fs.writeFileSync(
        path.join(goalDir, "mailbox/holds/s1.yaml"),
        "slugs: []\ngoal: true\n",
        "utf8",
      );

      const second = new FakeHarness({ id: "fake" });
      queueDigestSteer(second);
      second.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "still going", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      for (let i = 0; i < 3; i++) {
        second.script((req, ctx) => {
          ctx.writeOutcome(
            outcome({ summary: "still going", decision: "continue" }),
          );
          return fakeTurnResult(req);
        });
      }
      await expectDispatch(
        3,
        ["run", "--repo", repo.dir, "--goal", "demo", "--iterations", "1"],
        { harnesses: { fake: second } },
      );

      const records = await createFolderStore(
        goalDir,
        undefined,
        {},
      ).listRecords();
      const state = derive(
        await createFolderStore(goalDir, undefined, {}).listTasks(),
        records,
      );
      // Boundary ran for iteration 2; the hold drained dispatch, so beta
      // stayed ready instead of resuming in iteration 1.
      expect(
        records.filter(
          (r) =>
            r.actor === "agent" && r.step === "architect" && r.iteration === 2,
        ).length,
      ).toBe(1);
      expect(state.tasks.beta!.status).toBe("ready");
      expect(records.filter((r) => r.slug === "beta")).toHaveLength(0);
    } finally {
      repo.cleanup();
    }
  }, 120_000);

  it("an exhausted turn budget sends the relaunch to the boundary", async () => {
    const { repo, goalDir, taskDir } = await drainedAfterAlpha();
    try {
      void taskDir;
      // Iteration 1 spent two settled turns (alpha implement + review).
      setLimits(repo, "turns: 2");

      const second = new FakeHarness({ id: "fake" });
      queueDigestSteer(second);
      second.script((req, ctx) => {
        fs.appendFileSync(
          path.join(goalDir, "plan.md"),
          "\n## architect edit on relaunch\n",
          "utf8",
        );
        ctx.writeOutcome(
          outcome({ summary: "still going", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      second.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no changes" }));
        return fakeTurnResult(req);
      });
      second.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "beta added" }));
        return fakeTurnResult(req);
      });
      second.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "beta approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      await expectDispatch(
        3,
        ["run", "--repo", repo.dir, "--goal", "demo", "--iterations", "1"],
        { harnesses: { fake: second } },
      );

      const store = createFolderStore(goalDir, undefined, {});
      const records = await store.listRecords();
      expect(
        records.filter(
          (r) =>
            r.actor === "agent" && r.step === "architect" && r.iteration === 2,
        ).length,
      ).toBe(1);
      const beta = records.filter((r) => r.slug === "beta");
      expect(beta.length).toBeGreaterThan(0);
      expect(beta.every((r) => r.iteration === 2)).toBe(true);
    } finally {
      repo.cleanup();
    }
  }, 120_000);

  it("an exhausted USD budget sends the relaunch to the boundary", async () => {
    const s = setupRepo();
    const controller = createDrainController();
    const restoreWarn = silenceWarn();
    try {
      const first = new FakeHarness({ id: "fake" });
      first.script((req, ctx) => {
        fs.writeFileSync(path.join(s.goalDir, "plan.md"), PLAN, "utf8");
        ctx.writeOutcome(outcome({ summary: "planned", decision: "continue" }));
        return fakeTurnResult(req, { usage: { costUsd: 1 } });
      });
      first.script((req, ctx) => {
        fs.writeFileSync(path.join(s.taskDir, "alpha.md"), ALPHA, "utf8");
        fs.writeFileSync(path.join(s.taskDir, "beta.md"), BETA, "utf8");
        ctx.writeOutcome(outcome({ summary: "filed" }));
        return fakeTurnResult(req, { usage: { costUsd: 1 } });
      });
      first.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "alpha added" }));
        return fakeTurnResult(req, { usage: { costUsd: 1 } });
      });
      first.script((req, ctx) => {
        controller.handleSignal("SIGINT");
        ctx.writeOutcome(
          outcome({ summary: "alpha approved", verdict: "approve" }),
        );
        return fakeTurnResult(req, { usage: { costUsd: 1 } });
      });
      await expectDispatch(
        130,
        ["run", "--repo", s.repo.dir, "--goal", "demo"],
        {
          harnesses: { fake: first },
          signals: controller,
        },
      );

      // Iteration 1 spent $4 across architect, PM, implement and review.
      setLimits(s.repo, "iterationUsd: 1");

      const second = new FakeHarness({ id: "fake" });
      queueDigestSteer(second);
      second.script((req, ctx) => {
        fs.appendFileSync(
          path.join(s.goalDir, "plan.md"),
          "\n## architect edit on relaunch\n",
          "utf8",
        );
        ctx.writeOutcome(
          outcome({ summary: "still going", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      second.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no changes" }));
        return fakeTurnResult(req);
      });
      second.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "beta added" }));
        return fakeTurnResult(req);
      });
      second.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "beta approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      await expectDispatch(
        3,
        ["run", "--repo", s.repo.dir, "--goal", "demo", "--iterations", "1"],
        { harnesses: { fake: second } },
      );

      const store = createFolderStore(s.goalDir, undefined, {});
      const records = await store.listRecords();
      expect(
        records.filter(
          (r) =>
            r.actor === "agent" && r.step === "architect" && r.iteration === 2,
        ).length,
      ).toBe(1);
      const beta = records.filter((r) => r.slug === "beta");
      expect(beta.length).toBeGreaterThan(0);
      expect(beta.every((r) => r.iteration === 2)).toBe(true);
    } finally {
      restoreWarn();
      s.repo.cleanup();
    }
  }, 120_000);

  it("an exhausted wall budget sends the relaunch to the boundary", async () => {
    const { repo, goalDir } = await drainedAfterAlpha();
    try {
      // Iteration 1 started seconds ago; a sub-millisecond budget is long spent.
      setLimits(repo, "iterationMinutes: 0.00001");

      const second = new FakeHarness({ id: "fake" });
      queueDigestSteer(second);
      second.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "still going", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      second.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no changes" }));
        return fakeTurnResult(req);
      });
      // Extra scripts in case the fresh iteration still admits beta before
      // its own wall clock trips; the assertion only needs no resume.
      second.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "beta added" }));
        return fakeTurnResult(req);
      });
      second.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "beta approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      await dispatch(
        ["run", "--repo", repo.dir, "--goal", "demo", "--iterations", "1"],
        {
          harnesses: { fake: second },
          priceSource: testPriceSource(repo.dir),
        },
      );

      const store = createFolderStore(goalDir, undefined, {});
      const records = await store.listRecords();
      expect(
        records.filter(
          (r) =>
            r.actor === "agent" && r.step === "architect" && r.iteration === 2,
        ).length,
      ).toBe(1);
      // Nothing resumed in iteration 1: beta either landed in iteration 2 or
      // stayed undispatched behind the wall drain.
      expect(
        records.filter((r) => r.slug === "beta" && r.iteration === 1),
      ).toHaveLength(0);
    } finally {
      repo.cleanup();
    }
  }, 120_000);
});
