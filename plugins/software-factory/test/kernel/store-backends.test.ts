// biome-ignore-all lint/complexity: end-to-end backend matrix
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { derive } from "../../src/kernel/derive.js";
import {
  privateHits,
  BACKENDS,
  gitIn,
  makeBackendGoal,
  removeGoal,
  runKernelScenario,
  tempGoalPaths,
  tracked,
  bareFiles,
  bareGit,
  historyFiles,
} from "./backend-helpers.js";
import { createArtifactStore } from "../../src/kernel/store-backend.js";
import { statusGoal, steerGoal } from "../../src/cli/commands.js";
import { benchmarkGoal } from "../../src/cli/benchmark.js";

describe("KERNEL0 scenario over every artifact backend", () => {
  for (const backend of BACKENDS) {
    it(`merges alpha and persists its artifacts through ${backend}`, async () => {
      const goal = await makeBackendGoal(backend);
      try {
        await runKernelScenario(goal);
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
        expect(fs.existsSync(path.join(goal.goalDir, "metrics.yaml"))).toBe(
          true,
        );
        const state = derive(await store.listTasks(), records);
        expect(state.goal).toBe("done");
        expect(state.iteration).toBe(2);
        const status = await statusGoal(goal.repo.dir, "demo");
        expect(status.goalDir).toBe(goal.goalDir);
        expect(status.state.goal).toBe("done");
        const report = await benchmarkGoal(goal.repo.dir, "demo");
        expect(report.rows.length).toBeGreaterThan(0);
        // A store's own artifact commit is the kernel's write: containment must
        // not record it as an operator change.
        expect(
          records.filter(
            (record) =>
              record.step === "containment" &&
              record.cause?.kind === "outside-change",
          ),
        ).toEqual([]);
        expect(
          goal.repo.git(["show", "factory/demo:alpha.txt"]).stdout.trim(),
        ).toBe("alpha");

        if (backend === "folder") {
          expect(tracked(goal.repo, ".factory/artifacts")).toEqual([]);
          expect(privateHits(historyFiles(goal.repo))).toEqual([]);
          expect(goal.repo.git(["status", "--porcelain"]).stdout).toBe("");
          expect(
            fs.readFileSync(
              path.join(goal.repo.dir, ".factory/artifacts/.gitignore"),
              "utf8",
            ),
          ).toContain("*");
          const checks = records.find(
            (record) => record.slug === "alpha" && record.step === "checks",
          );
          expect(checks).toBeDefined();
          expect(fs.existsSync(store.records.checksLog(checks!))).toBe(true);
        }

        if (backend === "same-repo") {
          const files = tracked(goal.repo);
          expect(files).toContain(".factory/artifacts/demo/tasks/alpha.md");
          expect(files).toContain(".factory/artifacts/demo/plan.md");
          expect(
            files.some((file) => /records\/[^/]+\/end\.yaml$/.test(file)),
          ).toBe(true);
          expect(files).toContain(
            ".factory/artifacts/demo/iterations/1/summary.md",
          );
          expect(files).toContain(
            ".factory/artifacts/demo/iterations/2/summary.md",
          );
          expect(privateHits(files)).toEqual([]);
          expect(privateHits(historyFiles(goal.repo))).toEqual([]);
          expect(goal.repo.git(["status", "--porcelain"]).stdout).toBe("");
          expect(goal.repo.git(["log", "-1", "--format=%s"]).stdout).toBe(
            "factory: demo artifacts",
          );
        }

        if (backend === "git-repo") {
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
      } finally {
        removeGoal(goal);
      }
    }, 60_000);

    it(`publishes a steer into the ${backend} store`, async () => {
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
            persisted.some((file) =>
              file.endsWith(`mailbox/inbox/${inbox[0]}`),
            ),
          ).toBe(true);
        }
      } finally {
        removeGoal(goal);
      }
    }, 60_000);
  }
});
