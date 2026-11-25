import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

/** The implement and review turns of two advisory tasks, one file each. */
function scriptTwoTasks(harness: FakeHarness): void {
  for (const slug of ["a", "b"]) {
    harness.script(
      (req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, `${slug}.txt`), "ok\n");
        ctx.writeOutcome(outcome({ summary: `added ${slug}` }));
        return fakeTurnResult(req);
      },
      { when: whenTurn({ step: "implement", slug }) },
    );
    harness.script(
      (req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      },
      { when: whenTurn({ step: "review", slug }) },
    );
  }
}

describe("advisory merge gates", () => {
  it("lands an advisory task whose merge gates run on a moved head", async () => {
    // The red gate is gating: only the task's advisory flag can let it land.
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "unit", command: "test -f fixed.txt" }],
      limits: { concurrency: { overall: 2 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptTwoTasks(harness);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("a", { advisory: true }));
      await writeTask(runtime, task("b", { advisory: true }));

      await runDispatch(runtime, { iteration: 1 });

      const records = await runtime.store.listRecords();
      const mergeChecks = records.filter(
        (candidate) => candidate.step === "merge-checks",
      );
      // One branch merges first and moves the head; the other's merge gates
      // then run on a tree its checks run never gated.
      expect(mergeChecks.length).toBeGreaterThan(0);
      for (const record of mergeChecks) {
        expect(record.ok).toBe(true);
        expect(
          record.checks?.find((check) => check.name === "unit"),
        ).toMatchObject({ ok: false, advisory: true });
      }
      for (const slug of ["a", "b"]) {
        expect(
          records
            .filter(
              (candidate) =>
                candidate.slug === slug && candidate.step === "merge",
            )
            .at(-1)?.ok,
        ).toBe(true);
      }
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
