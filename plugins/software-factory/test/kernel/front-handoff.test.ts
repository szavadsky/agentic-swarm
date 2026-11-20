import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness } from "../../src/harness/fake/index.js";
import type { SessionRef } from "../../src/harness/types.js";
import { derive } from "../../src/kernel/derive.js";
import {
  promptVars,
  stepTarget,
  trivialResumeSession,
} from "../../src/kernel/flow-context.js";
import { task, causeText } from "./helpers.js";
import { cleanupFlowRepo, makeRuntime, setupFlowRepo } from "./s2-helpers.js";

describe("front prompt handoff", () => {
  it("leaves front_pack empty and the implementer target unchanged without class.yaml", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const taskFile = task("task", { scope: ["task.txt"] });
      const flow = runtime.configs.process.flows["implement-review"]!;
      const state = derive([taskFile], [], runtime.configs.process.flows).tasks
        .task!;
      const records = await runtime.store.listRecords();

      const vars = promptVars(
        runtime,
        taskFile,
        "/worktrees/demo-tasks/task",
        records,
        1,
        flow,
      );

      expect(vars.front_pack).toBe("");
      expect(stepTarget(runtime, taskFile, state, "implement", 1).alias).toBe(
        "implementer",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("points front_pack at the front record's iteration and keeps the front target on a fix turn", async () => {
    const aliases = {
      architect: { harness: "fake", model: "fake-architect" },
      front: { harness: "fake", model: "fake-front" },
      pm: { harness: "fake", model: "fake-pm" },
      implementer: { harness: "fake", model: "fake-impl" },
      reviewer: { harness: "fake", model: "fake-review" },
      steward: { harness: "fake", model: "fake-steward" },
      "plan-checker": { harness: "fake", model: "fake-check" },
      intent: { harness: "fake", model: "fake-intent" },
      "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
      "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
    };
    const { repo, goalDir } = setupFlowRepo({
      aliases,
      process: {
        boundary: { front: { prompt: "front", alias: "front" } },
      },
    });
    try {
      const scope1 = await pointsFrontPackAtFrontRecordSPart1(repo, goalDir);
      await pointsFrontPackAtFrontRecordSPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

const aliases = {
  architect: { harness: "fake", model: "fake-architect" },
  front: { harness: "fake", model: "fake-front" },
  pm: { harness: "fake", model: "fake-pm" },
  implementer: { harness: "fake", model: "fake-impl" },
  reviewer: { harness: "fake", model: "fake-review" },
  steward: { harness: "fake", model: "fake-steward" },
  "plan-checker": { harness: "fake", model: "fake-check" },
  intent: { harness: "fake", model: "fake-intent" },
  "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
  "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
};

function session(id: string, cwd: string, harness = "fake"): SessionRef {
  return {
    harness,
    id,
    cwd,
    model: { id: "fake-front" },
    lastRequestStartedAt: new Date().toISOString(),
    retentionTier: "short",
    compacted: false,
  };
}

describe("trivial session resume", () => {
  registerTrivialSessionResumePart1();
  registerTrivialSessionResumePart2();
});

async function pointsFrontPackAtFrontRecordSPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goalDir: string,
) {
  const runtime = await makeRuntime(repo, "demo", {
    fake: new FakeHarness({ id: "fake" }),
  });
  fs.writeFileSync(
    path.join(goalDir, "class.yaml"),
    "class: trivial\nslug: tiny\n",
    "utf8",
  );
  await runtime.store.appendRecord(
    {
      iteration: 3,
      step: "front",
      round: 1,
      actor: "agent",
      alias: "front",
      model: { id: "fake-front" },
    },
    {},
  );
  const taskFile = task("tiny", { flow: "just-implement" });
  const flow = runtime.configs.process.flows["just-implement"]!;
  const state = derive([taskFile], [], runtime.configs.process.flows).tasks
    .tiny!;
  const records = await runtime.store.listRecords();

  const vars = promptVars(
    runtime,
    taskFile,
    "/worktrees/demo-tasks/tiny",
    records,
    2,
    flow,
  );
  const fixTarget = stepTarget(
    runtime,
    taskFile,
    { ...state, round: 2 },
    "implement",
    1,
  );

  expect(vars.front_pack).toBe(
    path.join(goalDir, "iterations/3/context-pack.md"),
  );

  return { fixTarget };
}

async function pointsFrontPackAtFrontRecordSPart2(
  scope: Awaited<ReturnType<typeof pointsFrontPackAtFrontRecordSPart1>>,
) {
  const { fixTarget } = scope;
  expect(fixTarget.alias).toBe("front");
  expect(fixTarget.model.id).toBe("fake-front");
  // The turn is the implementer's, so the front's repair ask must not leak.
  expect(fixTarget.repairPrompt).toBeUndefined();
  expect(fixTarget.deliverable).toBeUndefined();
}

function registerTrivialSessionResumePart1(): void {
  it("resumes a first turn on the front session and a fix turn on the last front-alias session", async () => {
    const { repo, goalDir } = setupFlowRepo({
      aliases,
      process: {
        boundary: { front: { prompt: "front", alias: "front" } },
      },
    });
    try {
      const runtime = await makeRuntime(repo, "demo", {
        fake: new FakeHarness({ id: "fake" }),
      });
      fs.writeFileSync(
        path.join(goalDir, "class.yaml"),
        "class: trivial\nslug: tiny\n",
        "utf8",
      );
      const frontSession = session("front-1", runtime.paths.goalCheckout);
      await runtime.store.appendRecord(
        {
          iteration: 1,
          step: "front",
          round: 1,
          actor: "agent",
          alias: "front",
          model: { id: "fake-front" },
        },
        { session: frontSession },
      );
      // A later session on the same alias and cwd: the fix turn resumes the
      // task's own session, not the front record's.
      const implementSession = session("impl-2", runtime.paths.goalCheckout);
      await runtime.store.appendRecord(
        {
          iteration: 1,
          slug: "tiny",
          step: "implement",
          round: 1,
          actor: "agent",
          alias: "front",
          model: { id: "fake-front" },
        },
        { session: implementSession },
      );
      const taskFile = task("tiny", { flow: "just-implement" });
      const records = await runtime.store.listRecords();

      expect(
        await trivialResumeSession(runtime, taskFile, records, false, 1),
      ).toEqual({ session: frontSession });
      expect(
        await trivialResumeSession(runtime, taskFile, records, true, 1),
      ).toEqual({ session: implementSession });
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerTrivialSessionResumePart2(): void {
  it("parks with a cause when the front session's harness no longer serves the front alias", async () => {
    const { repo, goalDir } = setupFlowRepo({
      aliases,
      process: {
        boundary: { front: { prompt: "front", alias: "front" } },
      },
    });
    try {
      const runtime = await makeRuntime(repo, "demo", {
        fake: new FakeHarness({ id: "fake" }),
      });
      fs.writeFileSync(
        path.join(goalDir, "class.yaml"),
        "class: trivial\nslug: tiny\n",
        "utf8",
      );
      await runtime.store.appendRecord(
        {
          iteration: 1,
          step: "front",
          round: 1,
          actor: "agent",
          alias: "front",
          model: { id: "fake-front" },
        },
        { session: session("front-1", runtime.paths.goalCheckout, "other") },
      );
      const taskFile = task("tiny", { flow: "just-implement" });
      const records = await runtime.store.listRecords();

      const resumed = await trivialResumeSession(
        runtime,
        taskFile,
        records,
        false,
        1,
      );
      if (!("cause" in resumed)) throw new Error("expected a park cause");
      expect(causeText(resumed.cause)).toContain(
        "is not the front alias harness",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}
