import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { workCalls } from "./fake-defaults.js";
import { task, cause, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";
import {
  freshCounter,
  rmCounter,
  mergeOnlyGate,
  flakeRedTimes,
  flakeRedTwice,
  writePlan,
  scriptContinueBoundary,
  stateOf,
  scriptImplementApprove,
  implementThenLand,
} from "./continuation-helpers.js";
import { formatCause } from "../../src/kernel/cause.js";

describe("kept-land", () => {
  registerKeptLandPart1();
  registerKeptLandPart2();
  registerKeptLandPart3();
  registerKeptLandPart4();
});

async function skipsBaseAnotherTaskContinuesPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  scriptImplementApprove(harness, "alpha.txt", "alpha\n");
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "nothing to fix" }));
    return fakeTurnResult(req);
  });
  scriptStallLeave(harness, ["kept-base"]);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const file = task("kept-base", { scope: ["alpha.txt"] });
  await writeTask(runtime, file);
  await writeTask(
    runtime,
    task("kept-next", {
      base: "kept-base",
      deps: ["kept-base"],
      scope: ["beta.txt"],
    }),
  );
  writePlan(runtime, ["kept-base", "kept-next"]);
  await implementThenLand(runtime, file, ["implement", "review"], repo);

  expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
    "boundary",
  );
  expect((await stateOf(runtime)).tasks["kept-base"]!.status).toBe("parked");
  expect((await stateOf(runtime)).tasks["kept-next"]!.status).toBe("pending");

  scriptContinueBoundary(harness, runtime);
  const boundary = await runBoundary(runtime, { relaunch: false });
  expect(boundary.decision).toBe("continue");
  expect((await stateOf(runtime)).tasks["kept-base"]!.status).toBe("parked");

  const records = await runtime.store.listRecords();
  expect(
    records.filter(
      (r) => r.slug === "kept-base" && r.step === "merge" && r.iteration === 2,
    ),
  ).toHaveLength(0);

  return { harness };
}

async function skipsBaseAnotherTaskContinuesPart2(
  scope: Awaited<ReturnType<typeof skipsBaseAnotherTaskContinuesPart1>>,
) {
  const { harness } = scope;
  expect(workCalls(harness)).toHaveLength(6);
}

async function landsWhenBoundaryReRunFlipsRedGatePart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  scriptImplementApprove(harness, "feature.txt", "feature\n");
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "nothing to fix" }));
    return fakeTurnResult(req);
  });
  scriptStallLeave(harness, ["kept-flip"]);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const file = task("kept-flip", { scope: ["feature.txt"] });
  await writeTask(runtime, file);
  writePlan(runtime, ["kept-flip"]);
  await implementThenLand(runtime, file, ["implement", "review"], repo);

  expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
    "boundary",
  );
  expect((await stateOf(runtime)).tasks["kept-flip"]!.status).toBe("parked");
  expect(workCalls(harness)).toHaveLength(4);

  scriptContinueBoundary(harness, runtime);
  const boundary = await runBoundary(runtime, { relaunch: false });
  expect(boundary.decision).toBe("continue");
  expect((await stateOf(runtime)).tasks["kept-flip"]!.status).toBe("merged");

  const records = await runtime.store.listRecords();
  const kept = records.filter(
    (r) => r.slug === "kept-flip" && r.step === "kept-land",
  );
  expect(kept).toHaveLength(1);
  expect(kept[0]!.ok).toBe(true);
  const flakes = records.filter(
    (r) => r.slug === "kept-flip" && r.step === "gate-flake",
  );
  expect(flakes).toHaveLength(1);
  expect(flakes[0]!.ok).toBe(true);
  expect(causeText(flakes[0]!.cause)).toContain("unit");
  expect(
    records.filter((r) => r.slug === "kept-flip" && r.actor === "agent"),
  ).toHaveLength(3);
  expect(workCalls(harness)).toHaveLength(6);
}

async function landsWhenBoundaryReRunFlipsRedGatePart2(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
) {
  expect(repo.git(["show", "factory/demo:feature.txt"]).stdout.trim()).toBe(
    "feature",
  );
}

async function landsJustImplementBranchGreenPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "feature.txt"), "feature\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "implemented" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "nothing to fix" }));
    return fakeTurnResult(req);
  });
  scriptStallLeave(harness, ["kept-simple"]);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const file = task("kept-simple", {
    flow: "just-implement",
    scope: ["feature.txt"],
  });
  await writeTask(runtime, file);
  writePlan(runtime, ["kept-simple"]);
  await implementThenLand(runtime, file, ["implement"], repo);

  expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
    "boundary",
  );
  expect((await stateOf(runtime)).tasks["kept-simple"]!.status).toBe("parked");

  scriptContinueBoundary(harness, runtime);
  const boundary = await runBoundary(runtime, { relaunch: false });
  expect(boundary.decision).toBe("continue");
  expect((await stateOf(runtime)).tasks["kept-simple"]!.status).toBe("merged");

  const records = await runtime.store.listRecords();
  const kept = records.filter(
    (r) => r.slug === "kept-simple" && r.step === "kept-land",
  );
  expect(kept).toHaveLength(1);
  expect(kept[0]!.ok).toBe(true);
  expect(workCalls(harness)).toHaveLength(5);
}

async function landsJustImplementBranchGreenPart2(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
) {
  expect(repo.git(["show", "factory/demo:feature.txt"]).stdout.trim()).toBe(
    "feature",
  );
}

function registerKeptLandPart1(): void {
  it("never lands when a later commit voids the approve", async () => {
    const counter = freshCounter();
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
      gates: [
        {
          id: "unit",
          command: mergeOnlyGate("kept-void", flakeRedTwice(counter)),
        },
      ],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptImplementApprove(harness, "feature.txt", "feature\n");
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "fix.txt"), "fix\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "gate fix attempt" }));
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["kept-void"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("kept-void", { scope: ["feature.txt"] });
      await writeTask(runtime, file);
      writePlan(runtime, ["kept-void"]);
      await implementThenLand(runtime, file, ["implement", "review"], repo);

      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );
      const parked = (await stateOf(runtime)).tasks["kept-void"]!;
      expect(parked.status).toBe("parked");
      expect(parked.cause).toEqual(cause("gates: unit"));

      scriptContinueBoundary(harness, runtime);
      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("continue");
      // The gate is green now, but the fix commit voided the approve.
      expect((await stateOf(runtime)).tasks["kept-void"]!.status).toBe(
        "parked",
      );

      const records = await runtime.store.listRecords();
      expect(
        records.filter(
          (r) =>
            r.slug === "kept-void" && r.step === "merge" && r.iteration === 2,
        ),
      ).toHaveLength(0);
      expect(workCalls(harness)).toHaveLength(6);
    } finally {
      rmCounter(counter);
      cleanupFlowRepo(repo);
    }
  }, 90_000);
}

function registerKeptLandPart2(): void {
  it("lands a just-implement branch on green checks", async () => {
    const counter = freshCounter();
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
      gates: [
        {
          id: "unit",
          command: mergeOnlyGate("kept-simple", flakeRedTwice(counter)),
        },
      ],
    });
    try {
      await landsJustImplementBranchGreenPart1(repo, goal);
      await landsJustImplementBranchGreenPart2(repo);
    } finally {
      rmCounter(counter);
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("skips a base another task continues", async () => {
    const counter = freshCounter();
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
      gates: [
        {
          id: "unit",
          command: mergeOnlyGate("kept-base", flakeRedTwice(counter)),
        },
      ],
    });
    try {
      const scope1 = await skipsBaseAnotherTaskContinuesPart1(repo, goal);
      await skipsBaseAnotherTaskContinuesPart2(scope1);
    } finally {
      rmCounter(counter);
      cleanupFlowRepo(repo);
    }
  }, 90_000);
}

function registerKeptLandPart3(): void {
  it("lands when the boundary re-run flips a red gate to green", async () => {
    const counter = freshCounter();
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
      gates: [
        {
          id: "unit",
          command: mergeOnlyGate("kept-flip", flakeRedTimes(counter, 3)),
        },
      ],
    });
    try {
      await landsWhenBoundaryReRunFlipsRedGatePart1(repo, goal);
      await landsWhenBoundaryReRunFlipsRedGatePart2(repo);
    } finally {
      rmCounter(counter);
      cleanupFlowRepo(repo);
    }
  }, 90_000);
}

function registerKeptLandPart4(): void {
  it("skips merge gates on a branch tree the task checks already judged", async () => {
    const counter = freshCounter();
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
      gates: [
        {
          id: "unit",
          command: mergeOnlyGate("kept-skip", flakeRedTwice(counter)),
        },
      ],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptImplementApprove(harness, "feature.txt", "feature\n");
      // Consumed only if a merge gate ran and reddened: that path must fail.
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "nothing to fix" }));
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["kept-skip"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("kept-skip", { scope: ["feature.txt"] }));
      writePlan(runtime, ["kept-skip"]);

      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );
      // The head never moved: the squash lands the tree the checks judged.
      expect((await stateOf(runtime)).tasks["kept-skip"]!.status).toBe(
        "merged",
      );

      const records = await runtime.store.listRecords();
      expect(
        records.filter(
          (r) => r.slug === "kept-skip" && r.step === "merge-checks",
        ),
      ).toHaveLength(0);
      expect(fs.existsSync(counter)).toBe(false);
      const merge = records.find(
        (r) => r.slug === "kept-skip" && r.step === "merge" && r.ok === true,
      );
      expect(merge).toBeDefined();
      expect(causeText(merge!.cause)).toContain("skipped merge-checks");
      expect(merge!.checks).toHaveLength(1);
      expect(merge!.checks![0]!.ok).toBe(true);
      expect(workCalls(harness)).toHaveLength(3);
    } finally {
      rmCounter(counter);
      cleanupFlowRepo(repo);
    }
  }, 90_000);
}
