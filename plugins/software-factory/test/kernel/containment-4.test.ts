import { describe, expect, it } from "bun:test";
import yaml from "yaml";
import { FakeHarness } from "../../src/harness/fake/index.js";
import { git } from "../../src/core/git/exec.js";
import { landStoreCommits } from "../../src/kernel/store-backend.js";
import {
  containmentSnapshot,
  containmentViolation,
  ensureTaskWorktree,
} from "../../src/kernel/worktree.js";
import { task, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

/** A flow repo whose artifact store commits into the main checkout. */
function sameRepoFlow(): ReturnType<typeof setupFlowRepo> {
  const flow = setupFlowRepo();
  const config = yaml.parse(flow.repo.readFile(".factory/repo.yaml"));
  config.artifacts = { backend: "same-repo", root: ".factory/artifacts" };
  flow.repo.writeFile(".factory/repo.yaml", yaml.stringify(config));
  flow.repo.commit("same-repo artifacts");
  return flow;
}

async function sameRepoSnapshot(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const runtime = await makeRuntime(repo, goal, {
    fake: new FakeHarness({ id: "fake" }),
  });
  const file = task("task", { scope: ["task.txt"] });
  await writeTask(runtime, file);
  const ensured = await ensureTaskWorktree(runtime, file);
  const snapshot = await containmentSnapshot(runtime, ensured.path);
  return { runtime, ensured, snapshot };
}

function registerAgentContainmentPart22(): void {
  it("records a main-checkout rewrite under a same-repo store commit", async () => {
    const { repo, goal } = sameRepoFlow();
    try {
      const { runtime, ensured, snapshot } = await sameRepoSnapshot(repo, goal);
      repo.git(["reset", "--soft", "HEAD~1"]);
      await runtime.store.writeFile("plan.md", "# Plan\n");

      expect(
        await containmentViolation(
          runtime,
          ensured.path,
          ensured.branch,
          snapshot,
        ),
      ).toBeUndefined();
      const incidents = (await runtime.store.listRecords()).filter(
        (r) => r.step === "containment",
      );
      expect(incidents).toHaveLength(1);
      expect(causeText(incidents[0]!.cause)).toContain(
        `HEAD moved in ${repo.dir}`,
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerGoalBranchLanding(): void {
  it("exempts a goal branch move made only of store landings", async () => {
    const { repo, goal } = sameRepoFlow();
    try {
      const { runtime, ensured, snapshot } = await sameRepoSnapshot(repo, goal);
      const replay = await landStoreCommits(runtime.paths);
      expect(replay.length).toBeGreaterThan(0);
      const landed = (
        await git(runtime.paths.goalCheckout, [
          "ls-tree",
          "-r",
          "--name-only",
          "HEAD",
        ])
      ).stdout;
      expect(
        landed.split("\n").some((file) => file.endsWith("tasks/task.md")),
      ).toBe(true);
      expect(
        await containmentViolation(
          runtime,
          ensured.path,
          ensured.branch,
          snapshot,
        ),
      ).toBeUndefined();
      const incidents = (await runtime.store.listRecords()).filter(
        (r) => r.step === "containment",
      );
      expect(incidents).toHaveLength(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("agent containment", () => {
  registerAgentContainmentPart22();
  registerGoalBranchLanding();
});
