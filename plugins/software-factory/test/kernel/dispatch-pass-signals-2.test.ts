import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { postSteer } from "../../src/kernel/mailbox.js";
import { spikeReportPath } from "../../src/kernel/spike-report.js";
import { task, cause } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";
import { writeHold } from "./steer-helpers.js";

/** Fallback work turns: implement writes `<slug>.txt` (and the spike report for `probe`), review approves. */
function scriptWork(harness: FakeHarness): void {
  const handler: FakeTurnHandler = (req, ctx) => {
    const slug = path.basename(req.cwd!);
    if (req.prompt.startsWith("You review")) {
      ctx.writeOutcome(
        outcome({ summary: `${slug} approved`, verdict: "approve" }),
      );
    } else {
      fs.writeFileSync(path.join(req.cwd!, `${slug}.txt`), `${slug}\n`, "utf8");
      if (slug === "probe") {
        const report = path.join(req.cwd!, spikeReportPath("probe"));
        fs.mkdirSync(path.dirname(report), { recursive: true });
        fs.writeFileSync(report, "# Finding\n\nIt works.\n", "utf8");
      }
      ctx.writeOutcome(outcome({ summary: `${slug} implemented` }));
    }
    return fakeTurnResult(req);
  };
  for (const step of ["implement", "review"]) {
    harness.script(handler, { when: whenTurn({ step }), fallback: true });
  }
}

function registerDispatchPassSignalsPart7(): void {
  it("reports allReadyHeld after the unheld work ran and only held tasks remain", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptWork(harness);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { scope: ["a-area"] }));
      await writeTask(runtime, task("b", { scope: ["b-area"] }));
      await postSteer(runtime.store, "s1", "Hold a.");
      writeHold(runtime, "s1", ["a"]);

      const result = await runDispatch(runtime, {
        iteration: 1,
        seenSteers: ["s1"],
      });

      // Boundary after work: b's implement, QA and review ran, a stays held.
      expect(result.reason).toBe("boundary");
      expect(result.cause).toEqual(cause("steer: s1 holds a"));
      expect(result.allReadyHeld).toBe(true);
      expect(result.taskTurnsStarted).toBe(3);
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.b!.status).toBe("merged");
      expect(state.tasks.a!.turns).toBe(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("dispatch pass signals", () => {
  registerDispatchPassSignalsPart7();
});
