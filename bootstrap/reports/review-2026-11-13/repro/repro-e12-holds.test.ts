import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { holdsDir, readHolds } from "../../src/kernel/mailbox.js";
import { runSteerPm } from "../../src/kernel/pm.js";
import type { Steer } from "../../src/kernel/mailbox.js";
import { cleanupFlowRepo, makeRuntime, outcome, setupFlowRepo } from "./s2-helpers.js";

describe("repro E12: one malformed hold wedges every dispatch", () => {
  it("steer PM leaves an invalid hold unvalidated and every dispatch stops", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });

      // The steer turn writes one hold file; nothing validates or rolls it back.
      harness.script((req, ctx) => {
        fs.mkdirSync(holdsDir(runtime.store), { recursive: true });
        fs.writeFileSync(
          path.join(holdsDir(runtime.store), "s1.yaml"),
          "slugs: alpha\ngoal: maybe\n",
          "utf8"
        );
        ctx.writeOutcome(outcome({ summary: "wrote an invalid hold" }));
        return fakeTurnResult(req);
      });
      const tasks = await runtime.store.listTasks();
      const state = derive(
        tasks,
        await runtime.store.listRecords(),
        runtime.configs.process.flows
      );
      const steer: Steer = {
        id: "s1",
        file: "s1.md",
        relPath: "mailbox/inbox/s1.md",
        text: "Structure me.\n",
        hash: "deadbeef",
      };
      await runSteerPm(runtime, {
        iteration: 1,
        state,
        tasks,
        steers: [steer],
        cwd: runtime.paths.goalCheckout,
      });
      expect(fs.existsSync(path.join(holdsDir(runtime.store), "s1.yaml"))).toBe(true);
      expect(
        (await runtime.store.listRecords()).filter((r) => r.step === "steer-reconcile")
      ).toEqual([]);
      const holdErr = await readHolds(runtime.store).catch((err: unknown) => err);
      await expect(readHolds(runtime.store)).rejects.toThrow(/hold file "s1.yaml"/);

      // Every later dispatch reads the same file; the file is never deleted.
      const first = await runDispatch(runtime, { iteration: 1, seenSteers: [] });
      const second = await runDispatch(runtime, { iteration: 1, seenSteers: [] });
      for (const dispatched of [first, second]) {
        expect(dispatched.reason).toBe("infra");
        expect(dispatched.cause).toContain("steer holds");
        expect(dispatched.cause).toContain("s1.yaml");
      }
      console.log("E12 readHolds:", (holdErr as Error).message);
      console.log("E12 dispatch1:", first.reason, "|", first.cause);
      console.log("E12 dispatch2:", second.reason, "|", second.cause);
      expect(harness.calls).toHaveLength(1);
      expect(fs.existsSync(path.join(holdsDir(runtime.store), "s1.yaml"))).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
