import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { benchmarkGoal } from "../../src/cli/benchmark.js";
import { statusGoal, steerGoal } from "../../src/cli/commands.js";
import { derive } from "../../src/kernel/derive.js";
import { createArtifactStore } from "../../src/kernel/store-backend.js";
import type { ArtifactBackend } from "../../src/kernel/types.js";
import {
  BACKENDS,
  type BackendGoal,
  bareFiles,
  branchFiles,
  bareGit,
  gitIn,
  historyFiles,
  makeBackendGoal,
  privateHits,
  removeGoal,
  runClosingLaunch,
  runFirstLaunch,
  runKernelScenario,
  tempGoalPaths,
  tracked,
} from "./backend-helpers.js";

/** The store state and history every backend must reach after the scenario. */
async function expectMergedStore(goal: BackendGoal): Promise<void> {
  const store = createArtifactStore(tempGoalPaths(goal.repo), {});
  const task = await store.readTask("alpha");
  expect(task?.slug).toBe("alpha");
  const records = await store.listRecords();
  expect(records.some((record) => record.step === "merge")).toBe(true);
  for (const iteration of [1, 2]) {
    expect(
      fs.existsSync(
        path.join(goal.goalDir, `iterations/${iteration}/summary.md`),
      ),
    ).toBe(true);
  }
  expect(fs.existsSync(path.join(goal.goalDir, "metrics.yaml"))).toBe(true);
  const state = derive(await store.listTasks(), records);
  expect(state.goal).toBe("done");
  expect(state.iteration).toBe(2);
  // A store's own artifact commit is the kernel's write: containment must
  // not record it as an operator change.
  expect(
    records.filter(
      (record) =>
        record.step === "containment" &&
        record.cause?.kind === "outside-change",
    ),
  ).toEqual([]);
}

/** The status and benchmark commands read the same merged goal. */
async function expectGoalReadable(goal: BackendGoal): Promise<void> {
  const status = await statusGoal(goal.repo.dir, "demo");
  expect(status.goalDir).toBe(goal.goalDir);
  expect(status.state.goal).toBe("done");
  const report = await benchmarkGoal(goal.repo.dir, "demo");
  expect(report.rows.length).toBeGreaterThan(0);
}

/** The folder backend keeps everything untracked under its ignored root. */
async function expectFolderLayout(goal: BackendGoal): Promise<void> {
  expect(tracked(goal.repo, ".factory/artifacts")).toEqual([]);
  expect(privateHits(historyFiles(goal.repo))).toEqual([]);
  expect(goal.repo.git(["status", "--porcelain"]).stdout).toBe("");
  expect(
    fs.readFileSync(
      path.join(goal.repo.dir, ".factory/artifacts/.gitignore"),
      "utf8",
    ),
  ).toContain("*");
  const store = createArtifactStore(tempGoalPaths(goal.repo), {});
  const records = await store.listRecords();
  const checks = records.find(
    (record) => record.slug === "alpha" && record.step === "checks",
  );
  expect(checks).toBeDefined();
  expect(fs.existsSync(store.records.checksLog(checks!))).toBe(true);
}

/** The same-repo backend commits its artifacts in the hosting checkout and lands them on the goal branch. */
function expectSameRepoLayout(goal: BackendGoal): void {
  const files = tracked(goal.repo);
  expect(files).toContain(".factory/artifacts/demo/tasks/alpha.md");
  expect(files).toContain(".factory/artifacts/demo/plan.md");
  expect(files.some((file) => /records\/[^/]+\/end\.yaml$/.test(file))).toBe(
    true,
  );
  expect(files).toContain(".factory/artifacts/demo/iterations/1/summary.md");
  expect(files).toContain(".factory/artifacts/demo/iterations/2/summary.md");
  expect(privateHits(files)).toEqual([]);
  // The goal branch carries the same writes, so a merge of the goal has them.
  const branch = branchFiles(goal.repo, "factory/demo");
  for (const file of [
    ".factory/artifacts/demo/tasks/alpha.md",
    ".factory/artifacts/demo/plan.md",
    ".factory/artifacts/demo/iterations/1/summary.md",
    ".factory/artifacts/demo/iterations/2/summary.md",
  ]) {
    expect(branch).toContain(file);
  }
  expect(branch.some((file) => /records\/[^/]+\/end\.yaml$/.test(file))).toBe(
    true,
  );
  expect(privateHits(branch)).toEqual([]);
  expect(
    goal.repo.git([
      "show",
      "factory/demo:.factory/artifacts/demo/tasks/alpha.md",
    ]).stdout,
  ).toContain("slug: alpha");
  expect(privateHits(historyFiles(goal.repo))).toEqual([]);
  expect(goal.repo.git(["status", "--porcelain"]).stdout).toBe("");
  expect(goal.repo.git(["log", "-1", "--format=%s"]).stdout).toBe(
    "factory: demo artifacts",
  );
}

/** The git-repo backend keeps the goal in its own repository and remote. */
function expectGitRepoLayout(goal: BackendGoal): void {
  expect(goal.bare).toBeDefined();
  const files = bareFiles(goal.bare!);
  expect(files).toContain("demo/tasks/alpha.md");
  expect(files).toContain("demo/plan.md");
  expect(
    files.some((file) => /demo\/records\/[^/]+\/end\.yaml$/.test(file)),
  ).toBe(true);
  expect(files).toContain("demo/iterations/1/summary.md");
  expect(files).toContain("demo/iterations/2/summary.md");
  expect(privateHits(files)).toEqual([]);
  expect(
    privateHits(
      bareGit(goal.bare!, ["log", "--all", "--name-only", "--format="])
        .split("\n")
        .filter((line) => line.length > 0),
    ),
  ).toEqual([]);
  expect(tracked(goal.repo, ".factory/artifacts")).toEqual([]);
  expect(goal.repo.git(["status", "--porcelain"]).stdout).toBe("");
  expect(goal.goalDir.startsWith(goal.repo.dir)).toBe(false);
  // The remote is a local bare repository: the run needs no network.
  const remote = tempGoalPaths(goal.repo).artifacts.remote;
  expect(remote).toBe(goal.bare);
  expect(fs.existsSync(remote!)).toBe(true);
  expect(gitIn(goal.repo.dir, ["remote"])).toBe("");
  expect(gitIn(goal.storeRoot!, ["status", "--porcelain"])).toBe("");
}

/** The assertions specific to the backend the goal was launched with. */
async function expectBackendLayout(
  goal: BackendGoal,
  backend: ArtifactBackend,
): Promise<void> {
  if (backend === "folder") await expectFolderLayout(goal);
  if (backend === "same-repo") expectSameRepoLayout(goal);
  if (backend === "git-repo") expectGitRepoLayout(goal);
}

async function mergeThroughBackend(backend: ArtifactBackend): Promise<void> {
  const goal = await makeBackendGoal(backend);
  try {
    await runKernelScenario(goal);
    await expectMergedStore(goal);
    await expectGoalReadable(goal);
    expect(
      goal.repo.git(["show", "factory/demo:alpha.txt"]).stdout.trim(),
    ).toBe("alpha");
    await expectBackendLayout(goal, backend);
  } finally {
    removeGoal(goal);
  }
}

async function publishSteer(backend: ArtifactBackend): Promise<void> {
  const goal = await makeBackendGoal(backend);
  try {
    const created = await steerGoal(goal.repo.dir, "demo", {
      text: "prefer small diffs\n",
      source: "test",
    });
    expect(fs.existsSync(created)).toBe(true);
    const store = createArtifactStore(tempGoalPaths(goal.repo), {});
    const inbox = await store.mailbox.files("inbox");
    expect(inbox).toHaveLength(1);
    expect(await store.mailbox.read("inbox", inbox[0]!)).toBe(
      "prefer small diffs\n",
    );
    const persisted =
      backend === "git-repo"
        ? bareFiles(goal.bare!)
        : backend === "same-repo"
          ? tracked(goal.repo)
          : [];
    if (backend !== "folder") {
      expect(
        persisted.some((file) => file.endsWith(`mailbox/inbox/${inbox[0]}`)),
      ).toBe(true);
    }
  } finally {
    removeGoal(goal);
  }
}

/** An operator artifact write lands before the next launch follows base. */
async function relaunchesOverOperatorEdit(): Promise<void> {
  const goal = await makeBackendGoal("same-repo");
  try {
    await runFirstLaunch(goal);
    const store = createArtifactStore(tempGoalPaths(goal.repo), {});
    await store.writeFile("plan.md", "Edited by an operator.\n");
    await runClosingLaunch(goal);
    expect(
      goal.repo
        .git(["show", "factory/demo:.factory/artifacts/demo/plan.md"])
        .stdout.trim(),
    ).toBe("Edited by an operator.");
    expect(branchFiles(goal.repo, "factory/demo")).toContain(
      ".factory/artifacts/demo/tasks/alpha.md",
    );
  } finally {
    removeGoal(goal);
  }
}

describe("KERNEL0 scenario over every artifact backend", () => {
  describe("merge", () => {
    for (const backend of BACKENDS) {
      it(
        `merges alpha and persists its artifacts through ${backend}`,
        () => mergeThroughBackend(backend),
        60_000,
      );
    }
  });

  describe("same-repo landing", () => {
    it("lands the first launch's writes on the goal branch before the relaunch", async () => {
      const goal = await makeBackendGoal("same-repo");
      try {
        await runFirstLaunch(goal);
        const landed = branchFiles(goal.repo, "factory/demo");
        for (const file of [
          ".factory/artifacts/demo/plan.md",
          ".factory/artifacts/demo/tasks/alpha.md",
          ".factory/artifacts/demo/iterations/1/summary.md",
        ]) {
          expect(landed).toContain(file);
        }
        expect(
          landed.some((file) => /records\/[^/]+\/end\.yaml$/.test(file)),
        ).toBe(true);
        // The relaunch reads what the first launch wrote and lands its own
        // last writes on the same branch.
        await runClosingLaunch(goal);
        expect(branchFiles(goal.repo, "factory/demo")).toContain(
          ".factory/artifacts/demo/iterations/2/summary.md",
        );
      } finally {
        removeGoal(goal);
      }
    }, 60_000);
    it(
      "relaunches over an artifact changed after the first launch",
      () => relaunchesOverOperatorEdit(),
      60_000,
    );
  });

  describe("steer", () => {
    for (const backend of BACKENDS) {
      it(
        `publishes a steer into the ${backend} store`,
        () => publishSteer(backend),
        60_000,
      );
    }
  });
});
