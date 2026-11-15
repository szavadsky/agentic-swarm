import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { dispatch } from "../../src/cli/dispatch.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { createDrainController } from "../../src/kernel/signals.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

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
      "limits: { iterations: 3, concurrency: 1 }",
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

describe("resume iteration — SIGINT mid-dispatch", () => {
  it("finishes the interrupted iteration on relaunch without an extra architect record", async () => {
    const { repo, goalDir, taskDir } = setupRepo();
    const controller = createDrainController();
    const warning = { restore() {} };
    const origWarn = console.warn;
    console.warn = () => {};
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

      const code1 = await dispatch(
        ["run", "--repo", repo.dir, "--goal", "demo"],
        {
          harnesses: { fake: first },
          signals: controller,
        },
      );
      expect(code1).toBe(130);

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

      const code2 = await dispatch(
        ["run", "--repo", repo.dir, "--goal", "demo", "--iterations", "3"],
        {
          harnesses: { fake: second },
        },
      );
      expect(code2).toBe(0);

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
      console.warn = origWarn;
      repo.cleanup();
    }
  }, 120_000);
});
