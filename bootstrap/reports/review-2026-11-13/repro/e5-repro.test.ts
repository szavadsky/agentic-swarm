import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { integrationHead } from "../../src/kernel/worktree.js";
import { task } from "./helpers.js";
import { cleanupFlowRepo, goalCheckout, makeRuntime, outcome, setupFlowRepo, writeTask } from "./s2-helpers.js";

// One coarse gate, like the self repo's single `package` gate (install +
// typecheck + all tests). It reports which file made it red.
const GATE =
  'if [ -e task-broken.txt ]; then echo "reason Y: task-broken.txt"; exit 1; fi; ' +
  'if [ -e base-broken.txt ]; then echo "reason X: base-broken.txt"; exit 1; fi';

function runGate(cwd: string): { code: number; out: string } {
  const p = Bun.spawnSync(["bash", "-c", GATE], { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode ?? -1, out: `${p.stdout.toString()}${p.stderr.toString()}`.trim() };
}

describe("E5 repro — one gate name masks a distinct task failure", () => {
  it("merges a task whose new failure Y is hidden behind base failure X of the same gate", async () => {
    const { repo, goal } = setupFlowRepo({ gates: [{ id: "package", command: GATE }] });
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
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const head = await integrationHead(runtime);
      const baseRun = runGate(runtime.paths.goalCheckout);
      console.log(`BASE gate: exit=${baseRun.code} out=${JSON.stringify(baseRun.out)}`);
      expect(baseRun.code).not.toBe(0);
      expect(baseRun.out).toContain("reason X");

      // Pre-flight records the red base once, keyed by commit; replicate that record.
      await runtime.store.appendRecord(
        { iteration: 0, step: "baseline", round: 1, actor: "script", base: head },
        {
          ok: false,
          checks: [
            { name: "package", ok: false, summary: `exit ${baseRun.code}`, output: baseRun.out, fingerprint: "red-X" },
          ],
        }
      );
      await writeTask(runtime, task("task", { scope: ["task-broken.txt"] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      console.log(`DISPATCH reason=${result.reason}`);
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(await runtime.store.listTasks(), records, runtime.configs.process.flows);
      const mergeChecks = records.filter((r) => r.slug === "task" && r.step === "merge-checks");
      const merges = records.filter((r) => r.slug === "task" && r.step === "merge");
      console.log(
        `TASK status=${state.tasks.task!.status} mergeChecks=${JSON.stringify(mergeChecks.map((r) => ({ ok: r.ok, checks: r.checks })))}`
      );
      console.log(`MERGE ${JSON.stringify(merges.map((r) => ({ ok: r.ok, cause: r.cause, checks: r.checks })) )}`);

      expect(state.tasks.task!.status).toBe("merged");
      expect(records.filter((r) => r.slug === "task" && r.step === "implement")).toHaveLength(1);
      expect(records.filter((r) => r.slug === "task" && r.step === "park")).toHaveLength(0);
      expect(harness.calls.length).toBe(2);
      expect(mergeChecks).toHaveLength(1);
      expect(mergeChecks[0]!.ok).toBe(true);
      expect(mergeChecks[0]!.checks![0]!.name).toBe("package");
      expect(mergeChecks[0]!.checks![0]!.ok).toBe(false);
      expect(mergeChecks[0]!.checks![0]!.output).toContain("reason Y");
      expect(merges).toHaveLength(1);
      expect(merges[0]!.ok).toBe(true);
      expect(merges[0]!.checks![0]!.ok).toBe(false);

      // The merged result itself is red for Y alone: X's file was inherited,
      // Y was added by the merged task.
      const checkout = goalCheckout(repo, goal);
      expect(fs.existsSync(path.join(checkout, "task-broken.txt"))).toBe(true);
      const mergedRun = runGate(checkout);
      console.log(`MERGED gate: exit=${mergedRun.code} out=${JSON.stringify(mergedRun.out)}`);
      expect(mergedRun.code).not.toBe(0);
      expect(mergedRun.out).toContain("reason Y");
      expect(repo.git(["show", "factory/demo:task-broken.txt"]).stdout).toBe("Y");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
