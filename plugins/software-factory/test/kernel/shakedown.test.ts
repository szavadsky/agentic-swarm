import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { commitAll } from "../../src/core/git/commit.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { scriptMeta } from "../../src/kernel/record.js";
import {
  ensureTaskWorktree,
  taskBranchName,
  treeSha,
} from "../../src/kernel/worktree.js";
import { expectLaunch, stateOf, writePlan } from "./e2e-helpers.js";
import { recordStart, task as taskFile } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

/**
 * Hostile shakedown (KERNEL0 §7, REV §1/§3): a red base, a kill between the
 * merge ref-move and its end record, then a relaunch. The already-merged task
 * must recover as merged, the independent task must merge, and the summary must
 * attribute the red to the base rather than to a task.
 */
describe("hostile shakedown", () => {
  it("recovers a merge killed in the ref-move window on a red base", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [
        {
          id: "base-red",
          command: "test -f never.txt",
          format: { pattern: "pytest" },
        },
      ],
    });
    try {
      const crashes = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const alpha = taskFile("alpha", { scope: ["alpha.txt"] });
      const beta = taskFile("beta", { scope: ["beta.txt"] });
      await writeTask(crashes, alpha);
      await writeTask(crashes, beta);

      const ensured = await ensureTaskWorktree(crashes, alpha);
      if (ensured.error) throw new Error(ensured.error);
      fs.writeFileSync(path.join(ensured.path, "alpha.txt"), "alpha\n", "utf8");
      const commit = await commitAll(crashes.repo, ensured.path, "alpha work");
      if (!commit) throw new Error("no alpha commit");
      const tree = await treeSha(ensured.path);
      await crashes.store.appendRecord(
        recordStart({
          slug: "alpha",
          step: "implement",
          base: ensured.startPoint,
        }),
        { commit, tree, outcome: outcome({ summary: "alpha implemented" }) },
      );
      await crashes.store.appendRecord(
        scriptMeta(1, "checks", { slug: "alpha", round: 1 }),
        {
          ok: true,
          checks: [],
        },
      );
      await crashes.store.appendRecord(
        recordStart({ slug: "alpha", step: "review" }),
        {
          commit,
          tree,
          outcome: outcome({ summary: "alpha approved", verdict: "approve" }),
        },
      );

      // Kill window: the squash commit is on the integration ref, and the merge
      // start record carries its commit but has no end record.
      const checkout = crashes.paths.goalCheckout;
      repo.git(["merge", "--squash", taskBranchName(crashes, "alpha")], {
        cwd: checkout,
      });
      repo.git(["commit", "-m", "factory: merge alpha"], { cwd: checkout });
      const mergeCommit = repo
        .git(["rev-parse", "HEAD"], { cwd: checkout })
        .stdout.trim();
      await crashes.store.startRecord({
        ...scriptMeta(1, "merge", { slug: "alpha", round: 1 }),
        commit: mergeCommit,
      });

      writePlan(
        path.join(crashes.store.goalDir),
        "# Milestone 1\n\n## alpha\nCreate alpha.txt.\n\n## beta\nCreate beta.txt.\n",
      );
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.appendFileSync(
          path.join(crashes.store.goalDir, "plan.md"),
          "\n## architect edit on relaunch\n",
          "utf8",
        );
        ctx.writeOutcome(
          outcome({ summary: "continue with beta", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "task files current" }));
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

      await expectLaunch(3, repo, harness, 1);

      const state = await stateOf(crashes.store.goalDir);
      expect(state.tasks.alpha!.status).toBe("merged");
      expect(state.tasks.beta!.status).toBe("merged");

      const records = await crashes.store.listRecords();
      const recovered = records.filter(
        (r) => r.slug === "alpha" && r.step === "merge" && r.ok === true,
      );
      expect(recovered).toHaveLength(1);
      expect(recovered[0]!.cause).toBe("recovered merge after crash");
      expect(records.filter((r) => r.step === "park")).toHaveLength(0);
      expect(
        repo
          .git([
            "rev-list",
            "--count",
            `main..${crashes.paths.integrationBranch}`,
          ])
          .stdout.trim(),
      ).toBe("2");

      const summary = fs.readFileSync(
        path.join(crashes.store.goalDir, "iterations/2/summary.md"),
        "utf8",
      );
      expect(summary).toContain("merged: alpha, beta");
      expect(summary).toContain("pre-existing; not attributed to tasks");
      expect(summary).toContain("base-red");
      expect(summary).not.toContain("gates:");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
