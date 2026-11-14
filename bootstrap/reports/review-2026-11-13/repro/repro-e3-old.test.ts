import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dispatch } from "../../src/cli/dispatch.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { cleanup, launch, makeGoal, outcome, stateOf } from "./e2e-helpers.js";

/** Runs `fn` while capturing what the CLI prints. */
async function captured(fn: () => Promise<number>): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  try {
    const code = await fn();
    return { code, out: lines.join("\n") };
  } finally {
    console.log = original;
  }
}

describe("E3 at a6de636: blocked architect goal vs a waiting steer", () => {
  it("reproduces: relaunch stops before the front/boundary and leaves the steer unread", async () => {
    const goal = makeGoal();
    const log: string[] = [];
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("You are the architect");
        fs.writeFileSync(path.join(goal.goalDir, "plan.md"), "# Plan\n\n- waiting on the owner\n", "utf8");
        ctx.writeOutcome(
          outcome({
            status: "blocked",
            summary: "need an owner decision",
            decision: "blocked",
            forward: ["ask the owner"],
          })
        );
        return fakeTurnResult(req);
      });

      const first = await captured(() => launch(goal.repo, harness, 1));
      const firstState = await stateOf(goal.goalDir);
      log.push(
        `launch1: exit=${first.code} goal=${firstState.goal} terminal=${firstState.terminal} | ${first.out.replace(/\n/g, " / ")}`
      );

      const source = path.join(os.tmpdir(), `repro-e3-old-steer-${process.pid}.md`);
      fs.writeFileSync(source, "The owner decided: close the goal.\n", "utf8");
      let steerCode: number;
      try {
        steerCode = await dispatch(["steer", "--repo", goal.repo.dir, "--goal", "demo", source]);
      } finally {
        fs.rmSync(source, { force: true });
      }
      const inboxDir = path.join(goal.goalDir, "mailbox/inbox");
      const inboxAfterPost = fs.readdirSync(inboxDir).filter((f) => !f.startsWith(".")).sort();
      log.push(`steer: exit=${steerCode} inbox=${inboxAfterPost.join(",")}`);

      // No harness script for a second launch: the claim is that no turn runs.
      const second = await captured(() => launch(goal.repo, harness, 1));
      const secondState = await stateOf(goal.goalDir);
      const records = await createFolderStore(goal.goalDir).listRecords();
      const architects = records.filter((r) => r.step === "architect");
      const inboxAfter = fs.readdirSync(inboxDir).filter((f) => !f.startsWith(".")).sort();
      const processedDir = path.join(goal.goalDir, "mailbox/processed");
      const processed = fs.existsSync(processedDir)
        ? fs.readdirSync(processedDir).filter((f) => !f.startsWith(".")).sort()
        : [];
      const iteration2 = records.filter((r) => r.iteration === 2);
      log.push(
        `launch2: exit=${second.code} goal=${secondState.goal} terminal=${secondState.terminal} | ${second.out.replace(/\n/g, " / ")}`
      );
      log.push(
        `turns: architectRecords=${architects.length} iterations=[${architects.map((r) => r.iteration).join(",")}] recordsInIteration2=${iteration2.length}`
      );
      log.push(`steer-after: inbox=[${inboxAfter.join(",")}] processed=[${processed.join(",")}]`);
      console.log(`[E3-old] ${log.join("\n[E3-old] ")}`);

      expect(first.code).toBe(2);
      expect(firstState.goal).toBe("blocked");
      expect(architects.length).toBe(1);
      expect(second.code).toBe(2);
      expect(second.out).toContain("stop=blocked");
      expect(secondState.goal).toBe("blocked");
      expect(iteration2).toEqual([]);
      expect(inboxAfter).toEqual(inboxAfterPost);
      expect(processed).toEqual([]);
    } finally {
      cleanup(goal);
    }
  }, 90_000);
});
