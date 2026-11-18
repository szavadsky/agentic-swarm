import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { expectDispatch } from "./e2e-helpers.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive, FRONT_STOP_STEP } from "../../src/kernel/derive.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { whenTurn } from "./s2-helpers.js";
import {
  PLAN,
  ALPHA,
  BETA,
  outcome,
  setupRepo,
  queueDigestSteer,
  drainedAfterAlpha,
} from "./resume-helpers.js";

describe("resume guards — front-stop, holds and terminal", () => {
  it("a resume never writes a front-stop record", async () => {
    const { repo, goalDir } = await drainedAfterAlpha();
    try {
      const second = new FakeHarness({ id: "fake" });
      queueDigestSteer(second);
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
      // The resumed pass is not budgeted: the boundary closes the goal.
      second.script(
        (req, ctx) => {
          ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "architect" }) },
      );
      await expectDispatch(
        0,
        ["run", "--repo", repo.dir, "--goal", "demo", "--iterations", "1"],
        { harnesses: { fake: second } },
      );

      const store = createFolderStore(goalDir, undefined, {});
      const records = await store.listRecords();
      const state = derive(await store.listTasks(), records);
      expect(state.tasks.beta!.status).toBe("merged");
      expect(records.filter((r) => r.step === FRONT_STOP_STEP)).toHaveLength(0);
    } finally {
      repo.cleanup();
    }
  }, 120_000);

  it("an unreadable hold file blocks resume instead of reading as no holds", async () => {
    const { repo, goalDir } = await drainedAfterAlpha();
    try {
      // A file where the holds directory belongs: readdir fails with ENOTDIR,
      // so readHolds throws instead of returning an empty list.
      fs.writeFileSync(
        path.join(goalDir, "mailbox/holds"),
        "not a directory\n",
        "utf8",
      );

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
      await expectDispatch(
        1,
        ["run", "--repo", repo.dir, "--goal", "demo", "--iterations", "1"],
        { harnesses: { fake: second } },
      );

      const records = await createFolderStore(
        goalDir,
        undefined,
        {},
      ).listRecords();
      expect(
        records.filter(
          (r) =>
            r.actor === "agent" && r.step === "architect" && r.iteration === 2,
        ).length,
      ).toBe(1);
      expect(records.filter((r) => r.slug === "beta")).toHaveLength(0);
      const refused = records.filter((r) => r.step === "resume-refused");
      expect(refused).toHaveLength(1);
      expect(refused[0]!.cause).toContain("holds could not be read");
    } finally {
      repo.cleanup();
    }
  }, 120_000);

  it("an iteration with all tasks terminal goes to the boundary", async () => {
    const s = setupRepo();
    try {
      const first = new FakeHarness({ id: "fake" });
      first.script((req, ctx) => {
        fs.writeFileSync(path.join(s.goalDir, "plan.md"), PLAN, "utf8");
        ctx.writeOutcome(outcome({ summary: "planned", decision: "continue" }));
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        fs.writeFileSync(path.join(s.taskDir, "alpha.md"), ALPHA, "utf8");
        fs.writeFileSync(path.join(s.taskDir, "beta.md"), BETA, "utf8");
        ctx.writeOutcome(outcome({ summary: "filed" }));
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "alpha added" }));
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "alpha approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "beta added" }));
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "beta approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      await expectDispatch(
        3,
        ["run", "--repo", s.repo.dir, "--goal", "demo", "--iterations", "1"],
        { harnesses: { fake: first } },
      );

      const mid = createFolderStore(s.goalDir, undefined, {});
      const midState = derive(await mid.listTasks(), await mid.listRecords());
      expect(midState.goal).toBe("active");
      expect(midState.tasks.alpha!.status).toBe("merged");
      expect(midState.tasks.beta!.status).toBe("merged");

      const second = new FakeHarness({ id: "fake" });
      queueDigestSteer(second);
      second.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
        return fakeTurnResult(req);
      });
      await expectDispatch(
        0,
        ["run", "--repo", s.repo.dir, "--goal", "demo", "--iterations", "1"],
        { harnesses: { fake: second } },
      );

      const store = createFolderStore(s.goalDir, undefined, {});
      const records = await store.listRecords();
      const state = derive(await store.listTasks(), records);
      expect(state.goal).toBe("done");
      expect(
        records.filter(
          (r) =>
            r.actor === "agent" && r.step === "architect" && r.iteration === 2,
        ).length,
      ).toBe(1);
    } finally {
      s.repo.cleanup();
    }
  }, 120_000);
});
