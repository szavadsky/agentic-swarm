import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { ensureTaskWorktree } from "../../src/kernel/worktree.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";
import { head, commitIn, parkAlpha } from "./base-sync-helpers.js";

describe("parked continuation syncs to the integration head", () => {
  it("sees a commit merged after the park and reviews from that head", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      parkAlpha(harness, "alpha.txt", "alpha\n");
      scriptStallLeave(harness, ["alpha"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const checkout = goalCheckout(repo, goal);
      const alphaStart = head(repo, checkout);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await runDispatch(runtime, { iteration: 1 });
      const alphaTip = repo
        .git(["rev-parse", "factory-task/demo/alpha"])
        .stdout.trim();

      const integrationSha = commitIn(
        repo,
        checkout,
        "merged-since.txt",
        "later\n",
        "factory: merge later task",
      );

      let laterVisible = false;
      let alphaVisible = false;
      let carriedDiff: string[] = [];
      let reviewerSawHead = false;
      harness.script((req, ctx) => {
        laterVisible = fs.existsSync(path.join(req.cwd!, "merged-since.txt"));
        alphaVisible = fs.existsSync(path.join(req.cwd!, "alpha.txt"));
        carriedDiff = repo
          .git(["diff", "--name-only", `${integrationSha}..HEAD`], {
            cwd: req.cwd!,
          })
          .stdout.split("\n")
          .map((p) => p.trim())
          .filter(Boolean);
        fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "beta on the synced head" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        reviewerSawHead = req.prompt.includes(`${integrationSha}..`);
        ctx.writeOutcome(
          outcome({ summary: "beta approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });

      await writeTask(
        runtime,
        task("beta", { base: "alpha", scope: ["beta.txt"] }),
      );
      const result = await runDispatch(runtime, { iteration: 2 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      const firstAgent = (slug: string) =>
        records
          .filter(
            (r) =>
              r.slug === slug && r.step === "implement" && r.actor === "agent",
          )
          .sort((a, b) => a.seq - b.seq)[0];

      expect(state.tasks.beta!.status).toBe("merged");
      expect(laterVisible).toBe(true);
      expect(alphaVisible).toBe(true);
      expect(carriedDiff).toEqual(["alpha.txt"]);
      expect(reviewerSawHead).toBe(true);
      expect(firstAgent("beta")?.base).toBe(integrationSha);
      // A task without `base` still starts at the integration head of its dispatch.
      expect(firstAgent("alpha")?.base).toBe(alphaStart);
      // The parked branch is never rewritten, only the continuation branch moves.
      expect(
        repo.git(["rev-parse", "factory-task/demo/alpha"]).stdout.trim(),
      ).toBe(alphaTip);
      expect(
        repo.git(["show", "factory/demo:merged-since.txt"]).stdout.trim(),
      ).toBe("later");
      expect(repo.git(["show", "factory/demo:beta.txt"]).stdout.trim()).toBe(
        "beta",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("does not resync a continuation worktree that already exists", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const checkout = goalCheckout(repo, goal);
      repo.git(["branch", "factory-task/demo/alpha", head(repo, checkout)]);

      const first = await ensureTaskWorktree(
        runtime,
        task("beta", { base: "alpha", scope: ["beta.txt"] }),
      );
      expect(first.created).toBe(true);
      expect(first.error).toBeUndefined();
      const synced = head(repo, first.path);

      const laterSha = commitIn(
        repo,
        checkout,
        "after.txt",
        "after\n",
        "factory: merge after the worktree",
      );
      const second = await ensureTaskWorktree(
        runtime,
        task("beta", { base: "alpha", scope: ["beta.txt"] }),
      );
      expect(second.created).toBe(false);
      // ensureTaskWorktree never rewrites an existing worktree; the advance to
      // the current integration head happens at the turn seam (runStep), only
      // for a clean tree, and is covered by the turn-failures tests.
      expect(head(repo, second.path)).toBe(synced);
      expect(fs.existsSync(path.join(second.path, "after.txt"))).toBe(false);
      expect(second.startPoint).toBe(laterSha);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("resolves a first-turn creation conflict in the turn and proceeds to review", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      parkAlpha(harness, "clash.txt", "alpha\n");
      scriptStallLeave(harness, ["alpha"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const checkout = goalCheckout(repo, goal);
      await writeTask(runtime, task("alpha", { scope: ["clash.txt"] }));
      await runDispatch(runtime, { iteration: 1 });
      const integrationSha = commitIn(
        repo,
        checkout,
        "clash.txt",
        "integration\n",
        "factory: merge clashing task",
      );
      let sawAsk = false;
      let sawMergeHead = false;
      harness.script((req, ctx) => {
        sawAsk =
          req.prompt.includes("Conflicted files: clash.txt") &&
          req.prompt.includes("Resolve the conflict");
        sawMergeHead =
          repo.git(["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], {
            cwd: req.cwd!,
            allowFail: true,
          }).code === 0;
        fs.writeFileSync(
          path.join(req.cwd!, "clash.txt"),
          "alpha\nintegration\n",
          "utf8",
        );
        fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "beta resolved and implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "beta approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      await writeTask(
        runtime,
        task("beta", { base: "alpha", scope: ["beta.txt"] }),
      );
      await runDispatch(runtime, { iteration: 2 });
      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.beta!.status).toBe("merged");
      expect(sawAsk).toBe(true);
      expect(sawMergeHead).toBe(true);
      const betaAgents = records.filter(
        (r) => r.slug === "beta" && r.actor === "agent" && r.endedAt,
      );
      expect(betaAgents).toHaveLength(2);
      // A continuation counts its own turns only; alpha's spend does not carry.
      expect(state.tasks.beta!.turns).toBe(2);
      const betaTip = repo
        .git(["rev-parse", "factory-task/demo/beta"])
        .stdout.trim();
      const parents = repo
        .git(["log", "--format=%P", "-1", betaTip])
        .stdout.trim()
        .split(" ");
      expect(parents).toHaveLength(2);
      expect(
        repo.git(["merge-base", "--is-ancestor", integrationSha, betaTip], {
          allowFail: true,
        }).code,
      ).toBe(0);
      const betaWt = path.join(
        runtime.paths.worktreeRoot,
        `${goal}-tasks`,
        "beta",
      );
      expect(fs.readFileSync(path.join(betaWt, "clash.txt"), "utf8")).toBe(
        "alpha\nintegration\n",
      );
      const impl = records
        .filter(
          (r) =>
            r.slug === "beta" && r.step === "implement" && r.actor === "agent",
        )
        .sort((a, b) => a.seq - b.seq)[0]!;
      const advance = records
        .filter((r) => r.slug === "beta" && r.step === "base-advance")
        .sort((a, b) => a.seq - b.seq)[0]!;
      expect(advance.tree).toBe(impl.tree);
      const headTree = repo
        .git(["rev-parse", `${integrationSha}^{tree}`])
        .stdout.trim();
      expect(advance.headTree).toBe(headTree);
      expect(impl.base).toBe(integrationSha);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("parks base-conflict when markers remain after the first resolve turn", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      parkAlpha(harness, "clash.txt", "alpha\n");
      scriptStallLeave(harness, ["alpha"]);
      scriptStallLeave(harness, ["beta"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const checkout = goalCheckout(repo, goal);
      await writeTask(runtime, task("alpha", { scope: ["clash.txt"] }));
      await runDispatch(runtime, { iteration: 1 });
      const alphaTip = repo
        .git(["rev-parse", "factory-task/demo/alpha"])
        .stdout.trim();
      const integrationSha = commitIn(
        repo,
        checkout,
        "clash.txt",
        "integration\n",
        "factory: merge clashing task",
      );
      let sawAsk = false;
      harness.script((req, ctx) => {
        sawAsk = req.prompt.includes("Conflicted files: clash.txt");
        fs.writeFileSync(
          path.join(req.cwd!, "clash.txt"),
          "<<<<<<< HEAD\nalpha\n=======\nintegration\n>>>>>>> head\n",
          "utf8",
        );
        fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "beta tried" }));
        return fakeTurnResult(req);
      });
      await writeTask(
        runtime,
        task("beta", { base: "alpha", scope: ["beta.txt"] }),
      );
      await runDispatch(runtime, { iteration: 2 });
      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(sawAsk).toBe(true);
      expect(state.tasks.beta!.status).toBe("parked");
      expect(state.tasks.beta!.cause).toContain("base-conflict: clash.txt");
      expect(
        records.filter((r) => r.slug === "beta" && r.actor === "agent"),
      ).toHaveLength(1);
      expect(
        records.filter((r) => r.slug === "beta" && r.step === "review"),
      ).toHaveLength(0);
      const betaWt = path.join(
        runtime.paths.worktreeRoot,
        `${goal}-tasks`,
        "beta",
      );
      expect(repo.git(["status", "--porcelain"], { cwd: betaWt }).stdout).toBe(
        "",
      );
      expect(
        repo.git(["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], {
          cwd: betaWt,
          allowFail: true,
        }).code,
      ).not.toBe(0);
      expect(fs.readFileSync(path.join(betaWt, "clash.txt"), "utf8")).toBe(
        "alpha\n",
      );
      expect(
        repo.git(["rev-parse", "factory-task/demo/beta"]).stdout.trim(),
      ).toBe(alphaTip);
      expect(head(repo, checkout)).toBe(integrationSha);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("parks base-conflict when the first resolve turn leaves the conflict unmerged", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      parkAlpha(harness, "clash.txt", "alpha\n");
      scriptStallLeave(harness, ["alpha"]);
      scriptStallLeave(harness, ["beta"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const checkout = goalCheckout(repo, goal);
      await writeTask(runtime, task("alpha", { scope: ["clash.txt"] }));
      await runDispatch(runtime, { iteration: 1 });
      commitIn(
        repo,
        checkout,
        "clash.txt",
        "integration\n",
        "factory: merge clashing task",
      );
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "beta ignored the conflict" }));
        return fakeTurnResult(req);
      });
      await writeTask(
        runtime,
        task("beta", { base: "alpha", scope: ["beta.txt"] }),
      );
      await runDispatch(runtime, { iteration: 2 });
      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.beta!.status).toBe("parked");
      expect(state.tasks.beta!.cause).toContain("base-conflict: clash.txt");
      const betaWt = path.join(
        runtime.paths.worktreeRoot,
        `${goal}-tasks`,
        "beta",
      );
      expect(
        repo.git(["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], {
          cwd: betaWt,
          allowFail: true,
        }).code,
      ).not.toBe(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
