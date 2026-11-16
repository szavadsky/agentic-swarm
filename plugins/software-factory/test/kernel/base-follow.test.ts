import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { GitError } from "../../src/core/git/exec.js";
import { FakeHarness } from "../../src/harness/fake/index.js";
import { runGoal } from "../../src/kernel/launch.js";
import {
  BaseFollowConflictError,
  prepareIntegrationCheckout,
} from "../../src/kernel/worktree.js";
import type { TmpRepo } from "../helpers/tmp-repo.js";
import { testPriceSource } from "../helpers/price-source.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  setupFlowRepo,
} from "./s2-helpers.js";
import { withPlanRoleFallbacks } from "./fake-defaults.js";

function head(repo: TmpRepo, dir: string): string {
  return repo.git(["rev-parse", "HEAD"], { cwd: dir }).stdout;
}

function commitFile(
  repo: TmpRepo,
  dir: string,
  file: string,
  content: string,
  message: string,
): string {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), content, "utf8");
  repo.git(["add", "-A"], { cwd: dir });
  repo.git(["commit", "-m", message], { cwd: dir });
  return head(repo, dir);
}

function parentCount(repo: TmpRepo, dir: string): number {
  return (
    repo
      .git(["rev-list", "--parents", "-n1", "HEAD"], { cwd: dir })
      .stdout.split(" ").length - 1
  );
}

describe("launch follows base advances into the integration branch", () => {
  it("fast-forwards an existing integration branch and then no-ops while base is an ancestor", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const runtime = await makeRuntime(repo, goal, {});
      const checkout = goalCheckout(repo, goal);

      repo.writeFile("base-fix.txt", "fixed on base\n");
      const baseSha = repo.commit("base fix");

      await prepareIntegrationCheckout(runtime);
      expect(fs.readFileSync(path.join(checkout, "base-fix.txt"), "utf8")).toBe(
        "fixed on base\n",
      );
      expect(head(repo, checkout)).toBe(baseSha);
      expect(parentCount(repo, checkout)).toBe(1);

      const commits = repo
        .git(["rev-list", "--count", "HEAD"], { cwd: checkout })
        .stdout.trim();
      await prepareIntegrationCheckout(runtime);
      expect(head(repo, checkout)).toBe(baseSha);
      expect(
        repo
          .git(["rev-list", "--count", "HEAD"], { cwd: checkout })
          .stdout.trim(),
      ).toBe(commits);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("makes a merge commit when the integration branch has moved on", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const runtime = await makeRuntime(repo, goal, {});
      const checkout = goalCheckout(repo, goal);
      commitFile(repo, checkout, "task.txt", "task\n", "factory: merge task");

      repo.writeFile("base-fix.txt", "fixed on base\n");
      const baseSha = repo.commit("base fix");

      await prepareIntegrationCheckout(runtime);
      expect(fs.readFileSync(path.join(checkout, "base-fix.txt"), "utf8")).toBe(
        "fixed on base\n",
      );
      expect(fs.readFileSync(path.join(checkout, "task.txt"), "utf8")).toBe(
        "task\n",
      );
      expect(parentCount(repo, checkout)).toBe(2);
      expect(
        repo.git(["merge-base", "--is-ancestor", baseSha, "HEAD"], {
          cwd: checkout,
        }).code,
      ).toBe(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("merges cleanly when the integration branch squashed the same base delta", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const runtime = await makeRuntime(repo, goal, {});
      const checkout = goalCheckout(repo, goal);
      // The integration branch already carries the base delta's content under a
      // different commit, as a sync-base squash leaves it.
      commitFile(
        repo,
        checkout,
        "delta.txt",
        "same content\n",
        "factory: merge base delta",
      );
      repo.writeFile("delta.txt", "same content\n");
      const baseSha = repo.commit("base delta");

      await prepareIntegrationCheckout(runtime);
      expect(fs.readFileSync(path.join(checkout, "delta.txt"), "utf8")).toBe(
        "same content\n",
      );
      expect(parentCount(repo, checkout)).toBe(2);
      expect(
        repo.git(["merge-base", "--is-ancestor", baseSha, "HEAD"], {
          cwd: checkout,
        }).code,
      ).toBe(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("authors the follow merge commit with the configured factory identity", async () => {
    const { repo, goal } = setupFlowRepo({
      identity: { name: "Factory Bot", email: "factory-bot@test.local" },
    });
    try {
      const runtime = await makeRuntime(repo, goal, {});
      const checkout = goalCheckout(repo, goal);
      commitFile(repo, checkout, "task.txt", "task\n", "factory: merge task");

      repo.writeFile("base-fix.txt", "fixed on base\n");
      repo.commit("base fix");

      await prepareIntegrationCheckout(runtime);
      expect(parentCount(repo, checkout)).toBe(2);
      // The target repo has its own user configured; only a real follow env
      // makes the merge commit carry the factory identity.
      const authors = repo
        .git(["log", "-1", "--format=%an <%ae>|%cn <%ce>"], { cwd: checkout })
        .stdout.trim();
      expect(authors).toBe(
        "Factory Bot <factory-bot@test.local>|Factory Bot <factory-bot@test.local>",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("reports git's stderr when the target repo refuses a non-fast-forward merge", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const runtime = await makeRuntime(repo, goal, {});
      const checkout = goalCheckout(repo, goal);
      commitFile(repo, checkout, "task.txt", "task\n", "factory: merge task");
      const integrationSha = head(repo, checkout);

      repo.writeFile("base-fix.txt", "fixed on base\n");
      repo.commit("base fix");
      repo.git(["config", "merge.ff", "only"]);

      const refusal = await prepareIntegrationCheckout(runtime).catch(
        (err: unknown) => err,
      );
      expect(refusal).toBeInstanceOf(GitError);
      expect(refusal).not.toBeInstanceOf(BaseFollowConflictError);
      expect((refusal as Error).message).toContain(
        "Not possible to fast-forward",
      );
      expect((refusal as Error).message).not.toContain("conflicts");
      expect(head(repo, checkout)).toBe(integrationSha);
      expect(
        repo.git(["status", "--porcelain"], { cwd: checkout }).stdout,
      ).toBe("");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("recovers a crash-sealed merge before following the base", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const runtime = await makeRuntime(repo, goal, {});
      const checkout = goalCheckout(repo, goal);
      const start = head(repo, checkout);
      repo.git(["checkout", "-b", "wip", start], { cwd: checkout });
      commitFile(repo, checkout, "shared.txt", "wip\n", "wip edit");
      repo.git(["checkout", runtime.paths.integrationBranch], {
        cwd: checkout,
      });
      commitFile(
        repo,
        checkout,
        "shared.txt",
        "integration\n",
        "factory: merge task",
      );
      const merge = repo.git(["merge", "wip"], {
        cwd: checkout,
        allowFail: true,
      });
      expect(merge.code).not.toBe(0);
      expect(
        repo.git(["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], {
          cwd: checkout,
          allowFail: true,
        }).code,
      ).toBe(0);

      repo.writeFile("base-fix.txt", "fixed on base\n");
      repo.commit("base fix");

      await prepareIntegrationCheckout(runtime);
      expect(
        repo.git(["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], {
          cwd: checkout,
          allowFail: true,
        }).code,
      ).not.toBe(0);
      expect(
        repo.git(["status", "--porcelain"], { cwd: checkout }).stdout,
      ).toBe("");
      expect(fs.readFileSync(path.join(checkout, "base-fix.txt"), "utf8")).toBe(
        "fixed on base\n",
      );
      expect(fs.readFileSync(path.join(checkout, "shared.txt"), "utf8")).toBe(
        "integration\n",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("aborts a conflicting base, leaves the integration branch untouched and ends the launch naming the paths", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const runtime = await makeRuntime(repo, goal, {});
      const checkout = goalCheckout(repo, goal);
      commitFile(
        repo,
        checkout,
        "shared.txt",
        "integration\n",
        "factory: merge task",
      );
      const integrationSha = head(repo, checkout);

      repo.writeFile("shared.txt", "base\n");
      repo.commit("base edit");

      const conflict = await prepareIntegrationCheckout(runtime).catch(
        (err: unknown) => err,
      );
      expect(conflict).toBeInstanceOf(BaseFollowConflictError);
      expect((conflict as BaseFollowConflictError).paths).toEqual([
        "shared.txt",
      ]);
      expect(head(repo, checkout)).toBe(integrationSha);
      expect(fs.readFileSync(path.join(checkout, "shared.txt"), "utf8")).toBe(
        "integration\n",
      );
      expect(
        repo.git(["status", "--porcelain"], { cwd: checkout }).stdout,
      ).toBe("");
      expect(
        repo.git(["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], {
          cwd: checkout,
          allowFail: true,
        }).code,
      ).not.toBe(0);

      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) =>
        warnings.push(args.map(String).join(" "));
      try {
        const result = await runGoal({
          repo: repo.dir,
          goal,
          harnesses: {
            fake: withPlanRoleFallbacks(new FakeHarness({ id: "fake" })),
          },
          baseGates: false,
          priceSource: testPriceSource(repo.dir),
        });
        expect(result.iterations).toBe(0);
        expect(result.stop).toBe("infra");
        expect(result.cause).toContain("shared.txt");
      } finally {
        console.warn = originalWarn;
      }
      expect(warnings.join("\n")).toContain("shared.txt");
      expect(head(repo, checkout)).toBe(integrationSha);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
