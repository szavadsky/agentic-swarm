import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { integrationHead } from "../../src/kernel/worktree.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

// One coarse gate, like the self repo's former single `package` gate: it is red
// for whichever file is present and names the reason on stdout.
const GATE =
  'if [ -e task-broken.txt ]; then echo "reason Y: task-broken.txt"; exit 1; fi; ' +
  'if [ -e base-broken.txt ]; then echo "reason X: base-broken.txt"; exit 1; fi';

function runGate(cwd: string, gate = GATE): { code: number; out: string } {
  const p = Bun.spawnSync(["bash", "-c", gate], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: p.exitCode ?? -1,
    out: `${p.stdout.toString()}${p.stderr.toString()}`.trim(),
  };
}

// The merged-result gate the branch cannot see: it is red for Y only when the
// HEAD carries the merge queue's commit, standing in for a test that the
// integration result breaks while the task worktree stays green.
const MERGED_ONLY_GATE =
  'if git log -1 --format=%s | grep -q "^factory: merge task$"; then echo "reason Y: merged result"; exit 1; fi; ' +
  'if [ -e base-broken.txt ]; then echo "reason X: base-broken.txt"; exit 1; fi';

describe("E5 inverted — inherited red is matched per failing signature", () => {
  it("fails a merge whose new failure hides behind an inherited red gate", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "package", command: MERGED_ONLY_GATE }],
    });
    try {
      repo.writeFile("base-broken.txt", "X\n");
      repo.commit("base broken for reason X");

      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(
          path.join(req.cwd!, "feature.txt"),
          "feature\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "feature implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "fix.txt"), "fix\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "gate fix attempt" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const head = await integrationHead(runtime);
      const baseRun = runGate(runtime.paths.goalCheckout, MERGED_ONLY_GATE);
      expect(baseRun.code).not.toBe(0);
      expect(baseRun.out).toContain("reason X");

      await runtime.store.appendRecord(
        {
          iteration: 0,
          step: "baseline",
          round: 1,
          actor: "script",
          base: head,
        },
        {
          ok: false,
          checks: [
            {
              name: "package",
              ok: false,
              summary: "exit 1",
              output: baseRun.out,
              fingerprint: "red-X",
            },
          ],
        },
      );
      await writeTask(
        runtime,
        task("task", { scope: ["feature.txt", "fix.txt"] }),
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      const merges = records.filter(
        (r) => r.slug === "task" && r.step === "merge",
      );
      const mergeChecks = records.filter(
        (r) => r.slug === "task" && r.step === "merge-checks",
      );

      expect(state.tasks.task!.status).toBe("parked");
      expect(state.tasks.task!.cause).toBe("gates: package");
      expect(merges.map((r) => r.ok)).toEqual([false, false]);
      expect(mergeChecks.map((r) => r.ok)).toEqual([false, false]);
      expect(mergeChecks[0]!.checks![0]!.output).toContain("reason Y");
      expect(harness.calls.length).toBe(3);
      expect(
        repo.git(["show", "factory/demo:feature.txt"], { allowFail: true })
          .code,
      ).not.toBe(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("fails a task whose new failure hides behind an inherited red gate", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "package", command: GATE }],
      process: { itemTurns: 2 },
    });
    try {
      // Base is red for reason X: base-broken.txt is on main.
      repo.writeFile("base-broken.txt", "X\n");
      repo.commit("base broken for reason X");

      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task-broken.txt"), "Y\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "feature implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        fs.writeFileSync(
          path.join(req.cwd!, "fix-attempt.txt"),
          "still red\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "fix attempt" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const head = await integrationHead(runtime);
      const baseRun = runGate(runtime.paths.goalCheckout);
      expect(baseRun.code).not.toBe(0);
      expect(baseRun.out).toContain("reason X");

      // Pre-flight records the red base once, keyed by commit; replicate that record.
      await runtime.store.appendRecord(
        {
          iteration: 0,
          step: "baseline",
          round: 1,
          actor: "script",
          base: head,
        },
        {
          ok: false,
          checks: [
            {
              name: "package",
              ok: false,
              summary: `exit ${baseRun.code}`,
              output: baseRun.out,
              fingerprint: "red-X",
            },
          ],
        },
      );
      await writeTask(
        runtime,
        task("task", { scope: ["task-broken.txt", "fix-attempt.txt"] }),
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      const checks = records.filter(
        (r) => r.slug === "task" && r.step === "checks",
      );

      expect(state.tasks.task!.status).toBe("parked");
      expect(state.tasks.task!.cause!.startsWith("budget:")).toBe(true);
      // Reason Y is absent from base, so the first branch check is the task's own.
      expect(checks).toHaveLength(2);
      expect(checks.every((r) => r.ok === false)).toBe(true);
      expect(checks[0]!.checks![0]!.name).toBe("package");
      expect(checks[0]!.checks![0]!.output).toContain("reason Y");
      expect(
        records.filter((r) => r.slug === "task" && r.step === "merge"),
      ).toHaveLength(0);
      expect(
        repo.git(["show", "factory/demo:task-broken.txt"], { allowFail: true })
          .code,
      ).not.toBe(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("merges a task that fixes the inherited red", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "package", command: GATE }],
    });
    try {
      repo.writeFile("base-broken.txt", "X\n");
      repo.commit("base broken for reason X");

      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.rmSync(path.join(req.cwd!, "base-broken.txt"));
        ctx.writeOutcome(outcome({ summary: "removed the broken file" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const head = await integrationHead(runtime);
      const baseRun = runGate(runtime.paths.goalCheckout);
      await runtime.store.appendRecord(
        {
          iteration: 0,
          step: "baseline",
          round: 1,
          actor: "script",
          base: head,
        },
        {
          ok: false,
          checks: [
            {
              name: "package",
              ok: false,
              summary: `exit ${baseRun.code}`,
              output: baseRun.out,
              fingerprint: "red-X",
            },
          ],
        },
      );
      await writeTask(runtime, task("task", { scope: ["base-broken.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      const mergeChecks = records.filter(
        (r) => r.slug === "task" && r.step === "merge-checks",
      );
      expect(state.tasks.task!.status).toBe("merged");
      expect(
        records.filter((r) => r.slug === "task" && r.step === "park"),
      ).toHaveLength(0);
      expect(mergeChecks).toHaveLength(1);
      expect(mergeChecks[0]!.ok).toBe(true);
      expect(
        repo.git(["show", "factory/demo:base-broken.txt"], { allowFail: true })
          .code,
      ).not.toBe(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
