import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runGoal } from "../../src/kernel/launch.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { testPriceSource } from "../helpers/price-source.js";
import {
  cleanup,
  expectLaunch,
  makeGoal,
  outcome,
  scriptDigest,
  writePlan,
  writeTask,
} from "./e2e-helpers.js";
import { simpleTask } from "./e2e-helpers.js";

const OUTBOX = "mailbox/outbox/steer-s1.md";
const INBOX = "mailbox/inbox/s1.md";

const PLAN = [
  "# Milestone 1",
  "",
  "## alpha",
  "Create alpha.txt.",
  "Done when: alpha.txt exists.",
  "",
  "## beta",
  "Create beta.txt.",
  "Done when: beta.txt exists.",
  "",
].join("\n");

function outboxText(goal: ReturnType<typeof makeGoal>): string | null {
  const file = path.join(goal.goalDir, OUTBOX);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

function inboxExists(goal: ReturnType<typeof makeGoal>): boolean {
  return fs.existsSync(path.join(goal.goalDir, INBOX));
}

function post(goal: ReturnType<typeof makeGoal>, text: string): Promise<void> {
  return createFolderStore(goal.goalDir, undefined, {}).mailbox.publish(
    "s1.md",
    text,
  );
}

/** First launch: the architect writes the plan and files two tasks. */
async function seedPlan(goal: ReturnType<typeof makeGoal>): Promise<void> {
  const harness = new FakeHarness({ id: "fake" });
  harness.script((req, ctx) => {
    writePlan(goal.goalDir, PLAN);
    writeTask(goal.goalDir, simpleTask("alpha", "alpha.txt"));
    writeTask(goal.goalDir, simpleTask("beta", "beta.txt"));
    ctx.writeOutcome(outcome({ summary: "planned", decision: "continue" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
    return fakeTurnResult(req);
  });
  await expectLaunch(3, goal.repo, harness);
}

/** Bind a turn's handler to the record name it serves. */
function whenStep(step: string): (req: never) => boolean {
  return (req) => fakeTurnIdentity(req).step === step;
}

/** PM steer turn: route each claimed steer to the architect, like the real ladder does. */
function scriptSteerToArchitect(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      const claimed = [
        ...new Set(
          [...req.prompt.matchAll(/-\s+(\S+)\s+\(mailbox\/inbox\//g)].map(
            (m) => m[1]!,
          ),
        ),
      ];
      ctx.writeOutcome(
        outcome({
          summary: "steer goes to the architect",
          steerRoutes: claimed.map((steer) => ({ steer, route: "architect" })),
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenStep("pm") },
  );
  // The boundary's own PM turn for a steer the resume evidence did not claim.
  harness.script(
    (req, ctx) => {
      const claimed = [
        ...new Set(
          [...req.prompt.matchAll(/-\s+(\S+)\s+\(mailbox\/inbox\//g)].map(
            (m) => m[1]!,
          ),
        ),
      ];
      ctx.writeOutcome(
        outcome({
          summary: "steer goes to the architect",
          steerRoutes: claimed.map((steer) => ({ steer, route: "architect" })),
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenStep("pm"), fallback: true },
  );
}

/** Architect turn that dies on infrastructure, initial and de-novo retry. */
function scriptArchitectInfra(harness: FakeHarness): void {
  const dies = (req: Parameters<typeof fakeTurnResult>[0]) =>
    fakeTurnResult(req, {
      stop: { kind: "infra", cause: "crash", details: "session not found" },
    });
  harness.script(dies, {
    when: (req) => fakeTurnIdentity(req).step === "architect",
  });
  harness.script(dies, {
    when: (req) => fakeTurnIdentity(req).step === "architect",
  });
}

/** Architect turn that answers the steer and finishes the goal. */
function scriptArchitectAnswer(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "names stay",
          decision: "done",
          forward: ["steer s1: names stay, internals only"],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => fakeTurnIdentity(req).step === "architect" },
  );
}

describe("a stop answers every routed steer with a held note", () => {
  it("writes a held note when the run stops on infra after routing", async () => {
    const goal = makeGoal();
    try {
      await seedPlan(goal);
      await post(goal, "Keep the public API names stable.\n");

      const harness = new FakeHarness({ id: "fake" });
      scriptDigest(harness, goal.goalDir, 2);
      scriptSteerToArchitect(harness);
      scriptArchitectInfra(harness);
      await expectLaunch(1, goal.repo, harness);

      const note = outboxText(goal);
      expect(note).toContain("Held, not yet processed");
      expect(note).toContain("Source: mailbox/inbox/s1.md");
      expect(inboxExists(goal)).toBe(true);
    } finally {
      cleanup(goal);
    }
  }, 60_000);

  it("completes a held note with the real answer on the next launch", async () => {
    const goal = makeGoal();
    try {
      await seedPlan(goal);
      await post(goal, "Keep the public API names stable.\n");

      const stopped = new FakeHarness({ id: "fake" });
      scriptDigest(stopped, goal.goalDir, 2);
      scriptSteerToArchitect(stopped);
      scriptArchitectInfra(stopped);
      await expectLaunch(1, goal.repo, stopped);
      expect(outboxText(goal) ?? "").toContain("Held, not yet processed");

      const resumed = new FakeHarness({ id: "fake" });
      scriptDigest(resumed, goal.goalDir, 2);
      scriptArchitectAnswer(resumed);
      await expectLaunch(0, goal.repo, resumed);

      const answer = outboxText(goal);
      expect(answer).toContain("names stay, internals only");
      expect(answer).not.toContain("Held, not yet processed");
      const files = fs.readdirSync(path.join(goal.goalDir, "mailbox/outbox"));
      expect(files.filter((f) => f === "steer-s1.md")).toHaveLength(1);
    } finally {
      cleanup(goal);
    }
  }, 60_000);

  it("leaves a steer pending when the run stops before routing", async () => {
    const goal = makeGoal();
    try {
      // No plan: the boundary never runs the PM steer turn, so nothing is
      // committed and the infra death leaves the steer untouched.
      await post(goal, "Keep the public API names stable.\n");
      const harness = new FakeHarness({ id: "fake" });
      scriptArchitectInfra(harness);
      await expectLaunch(1, goal.repo, harness);
      expect(inboxExists(goal)).toBe(true);
      expect(outboxText(goal)).toBeNull();
    } finally {
      cleanup(goal);
    }
  }, 60_000);

  it("writes no held note when the run completes normally", async () => {
    const goal = makeGoal();
    try {
      await seedPlan(goal);
      await post(goal, "Keep the public API names stable.\n");
      const harness = new FakeHarness({ id: "fake" });
      scriptDigest(harness, goal.goalDir, 2);
      scriptSteerToArchitect(harness);
      scriptArchitectAnswer(harness);
      await expectLaunch(0, goal.repo, harness);
      const answer = outboxText(goal);
      expect(answer).toContain("names stay, internals only");
      expect(answer).not.toContain("Held, not yet processed");
    } finally {
      cleanup(goal);
    }
  }, 60_000);

  it("writes a held note when the architect stops on infra mid-launch", async () => {
    const goal = makeGoal();
    try {
      await seedPlan(goal);
      await post(goal, "Keep the public API names stable.\n");
      const harness = new FakeHarness({ id: "fake" });
      scriptDigest(harness, goal.goalDir, 2);
      scriptSteerToArchitect(harness);
      scriptArchitectInfra(harness);
      const result = await runGoal({
        repo: goal.repo.dir,
        goal: "demo",
        iterations: 1,
        harnesses: { fake: harness },
        priceSource: testPriceSource(goal.repo.dir),
      });
      expect(result.stop).toBe("infra");
      expect(outboxText(goal) ?? "").toContain("Held, not yet processed");
    } finally {
      cleanup(goal);
    }
  }, 60_000);
});
