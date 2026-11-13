import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dispatch } from "../../src/cli/dispatch.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { createFolderStore } from "../../src/kernel/store.js";
import {
  cleanup,
  launch,
  makeGoal,
  outcome,
  scriptDigest,
  stateOf,
} from "./e2e-helpers.js";

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

describe("E3: blocked architect goal vs a waiting steer", () => {
  it("relaunches a blocked architect goal, reads the steer, and answers it", async () => {
    const goal = makeGoal(); // bigger-class goal, no plan: the front hands to the architect
    const log: string[] = [];
    try {
      const harness = new FakeHarness({ id: "fake" });
      // Iteration 1: architect plans, then decides the goal is blocked.
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

      // Post a steer through the CLI, exactly as `factory steer` does.
      const source = path.join(os.tmpdir(), `repro-e3-steer-${process.pid}.md`);
      fs.writeFileSync(source, "The owner decided: close the goal.\n", "utf8");
      let steerCode: number;
      try {
        steerCode = await dispatch([
          "steer",
          "--repo",
          goal.repo.dir,
          "--goal",
          "demo",
          source,
        ]);
      } finally {
        fs.rmSync(source, { force: true });
      }
      const inboxDir = path.join(goal.goalDir, "mailbox/inbox");
      const inboxAfterPost = fs
        .readdirSync(inboxDir)
        .filter((f) => !f.startsWith("."))
        .sort();
      const steerId = inboxAfterPost[0]!.replace(/\.md$/, "");
      const beforeRelaunch = await stateOf(goal.goalDir);
      log.push(
        `steer: exit=${steerCode} inbox=${inboxAfterPost.join(",")} | pre-relaunch goal=${beforeRelaunch.goal} terminal=${beforeRelaunch.terminal}`
      );

      // Iteration 2: the digest scout, then the architect answering the steer.
      scriptDigest(harness, goal.goalDir, 2);
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("You are the architect");
        expect(req.prompt).toContain(
          `- ${steerId} (mailbox/inbox/${inboxAfterPost[0]}): The owner decided: close the goal.`
        );
        ctx.writeOutcome(
          outcome({
            summary: "owner decision accepted",
            decision: "done",
            forward: [`steer ${steerId}: accepted`],
          })
        );
        return fakeTurnResult(req);
      });

      const second = await captured(() => launch(goal.repo, harness, 1));
      const secondState = await stateOf(goal.goalDir);
      const records = await createFolderStore(goal.goalDir).listRecords();
      const architects = records.filter((r) => r.step === "architect");
      const inboxAfter = fs
        .readdirSync(inboxDir)
        .filter((f) => !f.startsWith("."))
        .sort();
      const processedDir = path.join(goal.goalDir, "mailbox/processed");
      const processed = fs.existsSync(processedDir)
        ? fs.readdirSync(processedDir).filter((f) => !f.startsWith(".")).sort()
        : [];
      const outbox = path.join(goal.goalDir, "mailbox/outbox", `steer-${steerId}.md`);
      log.push(
        `launch2: exit=${second.code} goal=${secondState.goal} terminal=${secondState.terminal} | ${second.out.replace(/\n/g, " / ")}`
      );
      log.push(
        `turns: architectRecords=${architects.length} decisions=[${architects
          .map((r) => r.outcome?.decision)
          .join(",")}] iterations=[${architects.map((r) => r.iteration).join(",")}]`
      );
      log.push(
        `iteration2-steps=[${records
          .filter((r) => r.iteration === 2)
          .map((r) => `${r.step}${r.slug ? `:${r.slug}` : ""}`)
          .join(",")}]`
      );
      log.push(
        `steer-after: inbox=[${inboxAfter.join(",")}] processed=[${processed.join(",")}] outbox=${fs.existsSync(outbox)}`
      );
      console.log(`[E3] ${log.join("\n[E3] ")}`);

      // What the claim predicts: no architect turn on relaunch, exit 2, steer still in inbox.
      expect(first.code).toBe(2);
      expect(firstState.goal).toBe("blocked");
      expect(beforeRelaunch.goal).toBe("blocked");
      expect(beforeRelaunch.terminal).toBe(true);
      // What actually happens at b4a2d9f:
      expect(architects.length).toBe(2);
      expect(architects.map((r) => r.outcome?.decision)).toEqual(["blocked", "done"]);
      expect(second.code).toBe(0);
      expect(secondState.goal).toBe("done");
      expect(second.out).toContain("stop=done");
      expect(inboxAfter).toEqual([]);
      expect(processed).toContain(inboxAfterPost[0]!);
      expect(fs.readFileSync(outbox, "utf8")).toContain("accepted");
    } finally {
      cleanup(goal);
    }
  }, 90_000);
});
