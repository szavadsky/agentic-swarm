import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import {
  collectSteerRoutes,
  holdsDir,
  postSteer,
} from "../../src/kernel/mailbox.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";
import {
  writePlan,
  editPlan,
  writeHold,
  implementer,
  approver,
  outboxOf,
  inboxHas,
} from "./steer-helpers.js";

async function architectRoutesIntentAmendmentNextPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  writePlan(runtime);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  const steerText = "Amend intent: the goal now covers export.";
  const intentBefore = fs.readFileSync(
    path.join(runtime.store.goalDir, "intent.md"),
    "utf8",
  );

  harness.script(
    implementer("alpha.txt", async () => {
      await postSteer(runtime.store, "s1", steerText);
    }),
  );
  harness.script((req, ctx) => {
    writeHold(runtime, "s1", []);
    ctx.writeOutcome(
      outcome({
        summary: "s1 needs the architect",
        steerRoutes: [{ steer: "s1", route: "architect" }],
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script(approver("alpha is correct"));

  const dispatched = await runDispatch(runtime, { iteration: 1 });
  expect(dispatched.reason).toBe("boundary");
  expect(inboxHas(runtime, "s1")).toBe(true);
  expect(
    fs.existsSync(
      path.join(runtime.store.goalDir, "mailbox/outbox", "steer-s1.md"),
    ),
  ).toBe(false);
  const hold = yaml.parse(
    fs.readFileSync(path.join(holdsDir(runtime.store), "s1.yaml"), "utf8"),
  );
  expect(hold).toEqual({ slugs: [], goal: false });
  expect(
    fs.readFileSync(path.join(runtime.store.goalDir, "intent.md"), "utf8"),
  ).toBe(intentBefore);

  return { harness, runtime, steerText };
}

async function architectRoutesIntentAmendmentNextPart2(
  scope: Awaited<ReturnType<typeof architectRoutesIntentAmendmentNextPart1>>,
) {
  const { runtime, steerText, harness } = scope;
  expect(
    fs.readFileSync(
      path.join(runtime.store.goalDir, "mailbox/inbox/s1.md"),
      "utf8",
    ),
  ).toContain(steerText);

  harness.script((req, ctx) => {
    expect(req.prompt).toContain(
      "- s1 (mailbox/inbox/s1.md): Amend intent: the goal now covers export.",
    );
    editPlan(runtime);
    ctx.writeOutcome(
      outcome({
        summary: "amended intent",
        decision: "continue",
        steerAnswers: [{ steer: "s1", answer: "intent amended verbatim" }],
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
    return fakeTurnResult(req);
  });
  const boundary = await runBoundary(runtime, { relaunch: false });
  expect(boundary.decision).toBe("continue");
  const pack = fs.readFileSync(
    path.join(runtime.store.goalDir, boundary.packPath!),
    "utf8",
  );
  expect(pack).toContain("- s1: mailbox/inbox/s1.md");
  expect(pack).toContain("- s1 [architect]");
  expect(outboxOf(runtime, "s1")).toContain("intent amended verbatim");
  expect(inboxHas(runtime, "s1")).toBe(false);
}

function registerSteerArchitectRoutingPart1(): void {
  it("architect: routes an intent amendment to the next boundary with nothing held", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await architectRoutesIntentAmendmentNextPart1(repo, goal);
      await architectRoutesIntentAmendmentNextPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerSteerArchitectRoutingPart2(): void {
  it("architect {id}: keeps the steer for one named architect's boundary", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(
        runtime,
        task("auth.alpha", { scope: ["alpha.txt"], epic: "auth" }),
      );
      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(
            runtime.store,
            "s1",
            "The auth interface needs a ruling.",
          );
        }),
      );
      harness.script((req, ctx) => {
        writeHold(runtime, "s1", []);
        ctx.writeOutcome(
          outcome({
            summary: "s1 goes to the auth architect",
            steerRoutes: [{ steer: "s1", route: { architect: "auth" } }],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script(approver("alpha is correct"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      expect(inboxHas(runtime, "s1")).toBe(true);
      const records = await runtime.store.listRecords();
      expect(collectSteerRoutes(records).get("s1")).toEqual({
        route: { architect: "auth" },
      });
      expect(
        records.find((r) => r.slug === "auth.alpha" && r.step === "implement")
          ?.architect,
      ).toBe("auth");
      const hold = yaml.parse(
        fs.readFileSync(path.join(holdsDir(runtime.store), "s1.yaml"), "utf8"),
      );
      expect(hold).toEqual({ slugs: [], goal: false });
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("steer architect routing", () => {
  registerSteerArchitectRoutingPart1();

  registerSteerArchitectRoutingPart2();
});
