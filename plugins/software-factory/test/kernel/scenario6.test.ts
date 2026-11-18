import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { postSteer } from "../../src/kernel/mailbox.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { cleanup, expectLaunch, makeGoal, outcome } from "./e2e-helpers.js";

describe("KERNEL0 scenario 6 — steer reaches the architect and is answered", () => {
  it("puts the steer in the pack and prompt, then processed + outbox", async () => {
    const goal = makeGoal();
    try {
      const store = createFolderStore(goal.goalDir, undefined, {});
      await store.ensureLayout();
      await postSteer(
        store,
        "s1",
        "Keep the public API names stable; rename only internals.",
      );

      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("s1 (mailbox/inbox/s1.md)");
        expect(req.prompt).toContain("Keep the public API names stable");
        const pack = fs.readFileSync(
          path.join(goal.goalDir, "iterations/1/context-pack.md"),
          "utf8",
        );
        expect(pack).toContain("## Pending steers");
        expect(pack).toContain("- s1: mailbox/inbox/s1.md");
        ctx.writeOutcome(
          outcome({
            summary: "read the steer",
            decision: "done",
            forward: ["steer s1: names stay, internals only"],
          }),
        );
        return fakeTurnResult(req);
      });

      await expectLaunch(0, goal.repo, harness);

      expect(fs.readdirSync(path.join(goal.goalDir, "mailbox/inbox"))).toEqual(
        [],
      );
      expect(
        fs.existsSync(path.join(goal.goalDir, "mailbox/processed/s1.md")),
      ).toBe(true);
      const response = fs.readFileSync(
        path.join(goal.goalDir, "mailbox/outbox/steer-s1.md"),
        "utf8",
      );
      expect(response).toContain("names stay, internals only");
      expect(response).toContain("Source: mailbox/inbox/s1.md");
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("goal-met");
    } finally {
      cleanup(goal);
    }
  }, 60_000);

  it("leaves an unanswered steer in the inbox and reports it to the owner", async () => {
    const goal = makeGoal();
    try {
      const store = createFolderStore(goal.goalDir, undefined, {});
      await store.ensureLayout();
      await postSteer(store, "s2", "Do not touch the billing module.");

      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("s2");
        ctx.writeOutcome(
          outcome({ summary: "ignored the steer", decision: "done" }),
        );
        return fakeTurnResult(req);
      });

      await expectLaunch(0, goal.repo, harness);
      expect(
        fs.existsSync(path.join(goal.goalDir, "mailbox/inbox/s2.md")),
      ).toBe(true);
      expect(
        fs.existsSync(path.join(goal.goalDir, "mailbox/outbox/steer-s2.md")),
      ).toBe(false);
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("steer s2 is still in mailbox/inbox/s2.md");
    } finally {
      cleanup(goal);
    }
  }, 60_000);
});
