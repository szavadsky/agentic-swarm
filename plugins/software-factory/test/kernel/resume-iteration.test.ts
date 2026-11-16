import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { dispatch } from "../../src/cli/dispatch.js";
import { expectDispatch } from "./e2e-helpers.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive, FRONT_STOP_STEP } from "../../src/kernel/derive.js";
import { postSteer } from "../../src/kernel/mailbox.js";
import { createDrainController } from "../../src/kernel/signals.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { testPriceSource } from "../helpers/price-source.js";

const PLAN = `# Milestone 1 — files

## alpha
Create alpha.txt.

## beta
Create beta.txt.
`;

const ALPHA = `---
slug: alpha
title: Create alpha
kind: task
flow: implement-review
deps: []
scope: [alpha.txt]
source: Milestone 1 / alpha
---

Create alpha.txt.
`;

const BETA = `---
slug: beta
title: Create beta
kind: task
flow: implement-review
deps: []
scope: [beta.txt]
source: Milestone 1 / beta
---

Create beta.txt.
`;

function outcome(value: Record<string, unknown>) {
  return { status: "done", summary: "ok", concerns: [], forward: [], ...value };
}

function setupRepo(): { repo: TmpRepo; goalDir: string; taskDir: string } {
  const repo = createTmpRepo();
  repo.writeFile(
    ".factory/repo.yaml",
    "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup: []\ngates: []\n",
  );
  const base = path.basename(repo.dir);
  repo.writeFile(
    ".factory/run.yaml",
    [
      "aliases:",
      "  architect: { harness: fake, model: fake-architect }",
      "  pm: { harness: fake, model: fake-pm }",
      "  implementer: { harness: fake, model: fake-impl }",
      "  reviewer: { harness: fake, model: fake-review }",
      "  steward: { harness: fake, model: fake-steward }",
      "limits: { iterations: 3, concurrency: { overall: 1 } }",
      `worktreeRoot: ../${base}-wt`,
      `sessions: { dir: ../${base}-sessions, keepRuns: 2 }`,
      "",
    ].join("\n"),
  );
  repo.commit("factory config");
  const goalDir = path.join(repo.dir, ".factory/artifacts/demo");
  fs.mkdirSync(path.join(goalDir, "tasks"), { recursive: true });
  fs.writeFileSync(
    path.join(goalDir, "intent.md"),
    "# Goal\n\nCreate alpha then beta.\n",
    "utf8",
  );
  fs.writeFileSync(path.join(goalDir, "class.yaml"), "class: bigger\n", "utf8");
  return { repo, goalDir, taskDir: path.join(goalDir, "tasks") };
}

function silenceWarn(): () => void {
  const orig = console.warn;
  console.warn = () => {};
  return () => {
    console.warn = orig;
  };
}

describe("resume iteration — SIGINT mid-dispatch", () => {
  it("finishes the interrupted iteration on relaunch without an extra architect record", async () => {
    const { repo, goalDir, taskDir } = setupRepo();
    const controller = createDrainController();
    const restoreWarn = silenceWarn();
    try {
      const first = new FakeHarness({ id: "fake" });
      first.script((req, ctx) => {
        fs.writeFileSync(path.join(goalDir, "plan.md"), PLAN, "utf8");
        ctx.writeOutcome(outcome({ summary: "planned", decision: "continue" }));
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        fs.writeFileSync(path.join(taskDir, "alpha.md"), ALPHA, "utf8");
        fs.writeFileSync(path.join(taskDir, "beta.md"), BETA, "utf8");
        ctx.writeOutcome(outcome({ summary: "filed" }));
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "alpha added" }));
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        controller.handleSignal("SIGINT");
        ctx.writeOutcome(
          outcome({ summary: "alpha approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });

      await expectDispatch(130, ["run", "--repo", repo.dir, "--goal", "demo"], {
        harnesses: { fake: first },
        signals: controller,
      });

      const store1 = createFolderStore(goalDir);
      const state1 = derive(
        await store1.listTasks(),
        await store1.listRecords(),
      );
      expect(state1.tasks.alpha!.status).toBe("merged");
      expect(state1.tasks.beta!.status).toBe("ready");
      const architectIter1Before = (await store1.listRecords()).filter(
        (r) =>
          r.actor === "agent" && r.step === "architect" && r.iteration === 1,
      ).length;
      expect(architectIter1Before).toBe(1);

      // Relaunch finishes iteration 1: dispatches beta, no new architect record
      // in iteration 1.
      const second = new FakeHarness({ id: "fake" });
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
      second.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
        return fakeTurnResult(req);
      });

      await expectDispatch(
        0,
        ["run", "--repo", repo.dir, "--goal", "demo", "--iterations", "3"],
        {
          harnesses: { fake: second },
        },
      );

      const store2 = createFolderStore(goalDir);
      const records2 = await store2.listRecords();
      const state2 = derive(await store2.listTasks(), records2);
      expect(state2.goal).toBe("done");
      expect(state2.tasks.beta!.status).toBe("merged");

      const architectIter1After = records2.filter(
        (r) =>
          r.actor === "agent" && r.step === "architect" && r.iteration === 1,
      ).length;
      expect(architectIter1After).toBe(1);
      // beta's records land in iteration 1 (same iteration resumed).
      const betaRecords = records2.filter((r) => r.slug === "beta");
      expect(betaRecords.every((r) => r.iteration === 1)).toBe(true);
    } finally {
      restoreWarn();
      repo.cleanup();
    }
  }, 120_000);
});

describe("resume iteration — hard death", () => {
  it("resumes the same iteration after recovery seals an orphan, with no architect or digest", async () => {
    const { repo, goalDir, taskDir } = setupRepo();
    const controller = createDrainController();
    const restoreWarn = silenceWarn();
    try {
      const first = new FakeHarness({ id: "fake" });
      first.script((req, ctx) => {
        fs.writeFileSync(path.join(goalDir, "plan.md"), PLAN, "utf8");
        ctx.writeOutcome(outcome({ summary: "planned", decision: "continue" }));
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        fs.writeFileSync(path.join(taskDir, "alpha.md"), ALPHA, "utf8");
        fs.writeFileSync(path.join(taskDir, "beta.md"), BETA, "utf8");
        ctx.writeOutcome(outcome({ summary: "filed" }));
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "alpha added" }));
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        controller.handleSignal("SIGINT");
        ctx.writeOutcome(
          outcome({ summary: "alpha approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      await expectDispatch(130, ["run", "--repo", repo.dir, "--goal", "demo"], {
        harnesses: { fake: first },
        signals: controller,
      });

      // A hard death mid-iteration: beta's turn started but the process died
      // before it finished, leaving an orphan with no end record.
      const store1 = createFolderStore(goalDir);
      await store1.startRecord({
        iteration: 1,
        slug: "beta",
        step: "implement",
        round: 1,
        actor: "agent",
        alias: "implementer",
        model: { id: "fake-impl" },
      });
      const orphans = (await store1.listRecords()).filter((r) => !r.endedAt);
      expect(orphans).toHaveLength(1);

      const second = new FakeHarness({ id: "fake" });
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
      second.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
        return fakeTurnResult(req);
      });
      await expectDispatch(
        0,
        ["run", "--repo", repo.dir, "--goal", "demo", "--iterations", "3"],
        { harnesses: { fake: second } },
      );

      const store2 = createFolderStore(goalDir);
      const records2 = await store2.listRecords();
      const state2 = derive(await store2.listTasks(), records2);
      expect(state2.goal).toBe("done");
      expect(state2.tasks.beta!.status).toBe("merged");

      // Recovery sealed the orphan as a bare crash: no details, usage, or
      // prompt bytes from any turn the harness reported.
      const sealed = records2.find(
        (r) =>
          r.slug === "beta" &&
          r.step === "implement" &&
          r.stop?.kind === "infra",
      );
      expect(sealed?.stop).toEqual({ kind: "infra", cause: "crash" });
      expect(sealed?.ok).toBe(false);
      expect(sealed?.usage).toBeUndefined();
      expect(sealed?.promptBytes).toBeUndefined();

      // Same iteration resumed: one architect record in iteration 1, every
      // beta record in iteration 1, and no relaunch digest written.
      expect(
        records2.filter(
          (r) =>
            r.actor === "agent" && r.step === "architect" && r.iteration === 1,
        ).length,
      ).toBe(1);
      expect(
        records2
          .filter((r) => r.slug === "beta")
          .every((r) => r.iteration === 1),
      ).toBe(true);
      expect(records2.some((r) => r.step === "digest")).toBe(false);
      expect(await store2.readFile("iterations/2/digest.md")).toBeNull();
    } finally {
      restoreWarn();
      repo.cleanup();
    }
  }, 120_000);

  it("gives an unclaimed steer its PM steer turn after resume", async () => {
    const { repo, goalDir, taskDir } = setupRepo();
    const controller = createDrainController();
    const restoreWarn = silenceWarn();
    try {
      const first = new FakeHarness({ id: "fake" });
      first.script((req, ctx) => {
        fs.writeFileSync(path.join(goalDir, "plan.md"), PLAN, "utf8");
        ctx.writeOutcome(outcome({ summary: "planned", decision: "continue" }));
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        fs.writeFileSync(path.join(taskDir, "alpha.md"), ALPHA, "utf8");
        fs.writeFileSync(path.join(taskDir, "beta.md"), BETA, "utf8");
        ctx.writeOutcome(outcome({ summary: "filed" }));
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "alpha added" }));
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        controller.handleSignal("SIGINT");
        ctx.writeOutcome(
          outcome({ summary: "alpha approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      await expectDispatch(130, ["run", "--repo", repo.dir, "--goal", "demo"], {
        harnesses: { fake: first },
        signals: controller,
      });

      // Dropped after the dying pass boundary read it: never claimed by the
      // architect, never given a PM steer turn.
      const inbox = createFolderStore(goalDir);
      await postSteer(inbox, "s1", "Please note beta for later.");
      const pmBefore = (await inbox.listRecords()).filter(
        (r) => r.actor === "agent" && r.step === "pm" && r.iteration === 1,
      ).length;
      expect(pmBefore).toBe(1);

      const second = new FakeHarness({ id: "fake" });
      second.script((_req, ctx) => {
        fs.mkdirSync(path.join(goalDir, "mailbox/holds"), { recursive: true });
        fs.writeFileSync(
          path.join(goalDir, "mailbox/holds/s1.yaml"),
          "slugs: []\ngoal: false\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "steer structured" }));
        return fakeTurnResult(_req);
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

      const store2 = createFolderStore(goalDir);
      const records2 = await store2.listRecords();
      const state2 = derive(await store2.listTasks(), records2);
      expect(state2.tasks.beta!.status).toBe("merged");
      // The resume claimed the steer: a second PM record in iteration 1 and
      // the hold file it wrote.
      expect(
        records2.filter(
          (r) => r.actor === "agent" && r.step === "pm" && r.iteration === 1,
        ).length,
      ).toBe(2);
      expect(fs.existsSync(path.join(goalDir, "mailbox/holds/s1.yaml"))).toBe(
        true,
      );
    } finally {
      restoreWarn();
      repo.cleanup();
    }
  }, 120_000);
});

describe("resume guards", () => {
  async function drainedAfterAlpha(): Promise<{
    repo: TmpRepo;
    goalDir: string;
    taskDir: string;
  }> {
    const s = setupRepo();
    const controller = createDrainController();
    const restoreWarn = silenceWarn();
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
        controller.handleSignal("SIGINT");
        ctx.writeOutcome(
          outcome({ summary: "alpha approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      await expectDispatch(
        130,
        ["run", "--repo", s.repo.dir, "--goal", "demo"],
        {
          harnesses: { fake: first },
          signals: controller,
        },
      );
    } finally {
      restoreWarn();
    }
    return s;
  }

  function setLimits(repo: TmpRepo, extra: string): void {
    const file = path.join(repo.dir, ".factory/run.yaml");
    const text = fs.readFileSync(file, "utf8");
    const next = text.replace(
      "limits: { iterations: 3, concurrency: { overall: 1 } }",
      `limits: { iterations: 3, concurrency: { overall: 1 }, ${extra} }`,
    );
    expect(next).not.toBe(text);
    fs.writeFileSync(file, next, "utf8");
  }

  it("a goal hold sends the relaunch to the boundary instead of resuming", async () => {
    const { repo, goalDir } = await drainedAfterAlpha();
    try {
      const store = createFolderStore(goalDir);
      await postSteer(store, "s1", "Hold the goal.");
      fs.mkdirSync(path.join(goalDir, "mailbox/holds"), { recursive: true });
      fs.writeFileSync(
        path.join(goalDir, "mailbox/holds/s1.yaml"),
        "slugs: []\ngoal: true\n",
        "utf8",
      );

      const second = new FakeHarness({ id: "fake" });
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

      const records = await createFolderStore(goalDir).listRecords();
      const state = derive(
        await createFolderStore(goalDir).listTasks(),
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

      const store = createFolderStore(goalDir);
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

      const store = createFolderStore(s.goalDir);
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

      const store = createFolderStore(goalDir);
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

  it("a resume never writes a front-stop record", async () => {
    const { repo, goalDir } = await drainedAfterAlpha();
    try {
      const second = new FakeHarness({ id: "fake" });
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

      const store = createFolderStore(goalDir);
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

      const records = await createFolderStore(goalDir).listRecords();
      expect(
        records.filter(
          (r) =>
            r.actor === "agent" && r.step === "architect" && r.iteration === 2,
        ).length,
      ).toBe(1);
      expect(records.filter((r) => r.slug === "beta")).toHaveLength(0);
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

      const mid = createFolderStore(s.goalDir);
      const midState = derive(await mid.listTasks(), await mid.listRecords());
      expect(midState.goal).toBe("active");
      expect(midState.tasks.alpha!.status).toBe("merged");
      expect(midState.tasks.beta!.status).toBe("merged");

      const second = new FakeHarness({ id: "fake" });
      second.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
        return fakeTurnResult(req);
      });
      await expectDispatch(
        0,
        ["run", "--repo", s.repo.dir, "--goal", "demo", "--iterations", "1"],
        { harnesses: { fake: second } },
      );

      const store = createFolderStore(s.goalDir);
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
