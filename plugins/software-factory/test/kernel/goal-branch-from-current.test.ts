import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { recordedBaseGates } from "../../src/kernel/baseline.js";
import { loadConfigs, resolveGoalPaths } from "../../src/kernel/config.js";
import { runGoal } from "../../src/kernel/launch.js";
import { preflight } from "../../src/kernel/preflight.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { prepareIntegrationCheckout } from "../../src/kernel/worktree.js";
import { testPriceSource } from "../helpers/price-source.js";
import { withKernelRoleFallbacks } from "./fake-defaults.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
} from "./s2-helpers.js";

function scriptDoneGoal(harness: FakeHarness, seenCwds: string[]): void {
  harness.script(
    (req, ctx) => {
      seenCwds.push(req.cwd ?? "");
      ctx.writeOutcome(outcome({ summary: "done", decision: "done" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "architect" }) },
  );
}

describe("goal branch cuts from current checkout without touching it", () => {
  it("cuts factory/<goal> from a diverged feature branch at launch and leaves the user checkout untouched", async () => {
    const { repo, goal } = setupFlowRepo({
      classYaml: "class: bigger\n",
      gates: [{ id: "feature-gate", command: "test -f feature.txt" }],
    });
    try {
      // Branch feature off main with its own file, then diverge main with a
      // conflicting README edit so baseBranch (main) cannot be merged silently.
      repo.git(["checkout", "-b", "feature/wip"]);
      repo.writeFile("feature.txt", "from feature\n");
      repo.writeFile("README.md", "# Feature branch\n");
      const featureSha = repo.commit("feature work");

      repo.git(["checkout", "main"]);
      repo.writeFile("main-only.txt", "only on main\n");
      repo.writeFile("README.md", "# Main diverged\n");
      const mainSha = repo.commit("main diverged");
      expect(mainSha).not.toBe(featureSha);

      // Leave the user checked out on the feature branch with uncommitted work.
      repo.git(["checkout", "feature/wip"]);
      repo.writeFile("README.md", "# Uncommitted edit\n");
      repo.writeFile("scratch.txt", "untracked user file\n");

      const seenCwds: string[] = [];
      const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
      scriptDoneGoal(harness, seenCwds);

      const result = await runGoal({
        repo: repo.dir,
        goal,
        harnesses: { fake: harness },
        priceSource: testPriceSource(repo.dir),
      });

      expect(result.stop, result.cause ?? "").toBe("done");
      // The goal branch was cut from feature/wip, not repo.baseBranch (main).
      const goalSha = repo.git(["rev-parse", `factory/${goal}`]).stdout.trim();
      expect(goalSha).toBe(featureSha);
      expect(
        repo.git(["show", `factory/${goal}:feature.txt`]).stdout.trim(),
      ).toBe("from feature");
      expect(
        repo.git(["show", `factory/${goal}:main-only.txt`], {
          allowFail: true,
        }).code,
      ).not.toBe(0);

      // Baseline ran against feature/wip, not main (where feature.txt is absent).
      const paths = resolveGoalPaths(loadConfigs(repo.dir), repo.dir, goal);
      const records = await createFolderStore(
        paths.goalDir,
        undefined,
        {},
      ).listRecords();
      const base = recordedBaseGates(records);
      expect(base?.commit).toBe(featureSha);
      expect(base?.ok).toBe(true);

      // Agents ran inside the goal worktree, and the user's checkout was never touched.
      const checkout = goalCheckout(repo, goal);
      expect(seenCwds.length).toBeGreaterThan(0);
      for (const cwd of seenCwds) expect(cwd).toBe(checkout);
      expect(repo.git(["rev-parse", "--abbrev-ref", "HEAD"]).stdout).toBe(
        "feature/wip",
      );
      expect(repo.git(["rev-parse", "HEAD"]).stdout).toBe(featureSha);
      expect(repo.readFile("README.md")).toBe("# Uncommitted edit\n");
      expect(repo.readFile("scratch.txt")).toBe("untracked user file\n");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("cuts factory/<goal> from a detached HEAD without touching it", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      repo.git(["checkout", "--detach", "HEAD"]);
      repo.writeFile("detached.txt", "detached commit\n");
      const detachedSha = repo.commit("detached work");

      repo.git(["branch", "other-main", "main"]);
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });

      expect(repo.git(["rev-parse", `factory/${goal}`]).stdout.trim()).toBe(
        detachedSha,
      );
      expect(
        repo.git(["show", `factory/${goal}:detached.txt`]).stdout.trim(),
      ).toBe("detached commit");
      expect(repo.git(["rev-parse", "--abbrev-ref", "HEAD"]).stdout).toBe(
        "HEAD",
      );
      expect(repo.git(["rev-parse", "HEAD"]).stdout).toBe(detachedSha);
      expect(
        fs.existsSync(path.join(runtime.paths.goalCheckout, "detached.txt")),
      ).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("follows advances on the feature branch it was cut from even after the user switches branches", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      repo.git(["checkout", "-b", "feature/origin"]);
      repo.writeFile("origin.txt", "v1\n");
      const v1 = repo.commit("feature v1");

      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const checkout = goalCheckout(repo, goal);
      expect(repo.git(["rev-parse", `factory/${goal}`]).stdout.trim()).toBe(v1);

      // Advance feature/origin and switch the user's checkout elsewhere.
      repo.writeFile("origin.txt", "v2\n");
      const v2 = repo.commit("feature v2");
      repo.git(["checkout", "main"]);
      repo.writeFile("main-unrelated.txt", "main\n");
      repo.commit("main move");

      await prepareIntegrationCheckout(runtime);
      expect(repo.git(["rev-parse", `factory/${goal}`]).stdout.trim()).toBe(v2);
      expect(fs.readFileSync(path.join(checkout, "origin.txt"), "utf8")).toBe(
        "v2\n",
      );
      expect(fs.existsSync(path.join(checkout, "main-unrelated.txt"))).toBe(
        false,
      );
      expect(repo.git(["rev-parse", "--abbrev-ref", "HEAD"]).stdout).toBe(
        "main",
      );

      // Preflight also baselines the followed origin branch tip, not main.
      const pre = await preflight({
        configs: runtime.configs,
        paths: runtime.paths,
        store: runtime.store,
        harnesses: runtime.harnesses,
      });
      expect(pre.base?.commit).toBe(v2);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
