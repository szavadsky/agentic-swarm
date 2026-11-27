import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { recoverLaunch } from "../../src/kernel/recovery.js";
import { runIngestionSteps } from "../../src/kernel/ingestion.js";
import { createFolderStore } from "../../src/kernel/store.js";
import {
  DEFAULT_RUN_YAML,
  cleanup,
  expectDispatch,
  implementerTurn,
  makeGoal,
  outcome,
  simpleTask,
  writePlan,
  writeTask,
} from "./e2e-helpers.js";
import { recordStart } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  setupFlowRepo,
  whenTurn,
} from "./s2-helpers.js";

/** Ingestion with a bigger goal's scout: the sequence the crash interrupts. */
const SCOUT_INGESTION = [
  "ingestion:",
  "  - id: branch",
  "  - id: front",
  "  - { id: scout, prompt: scout, alias: pm, deliverable: code map, when: [bigger] }",
  "",
].join("\n");

/** Ingestion with a custom scout step, whose record the recovery test stages. */
const STAGED_SCOUT_INGESTION = {
  ingestion: [
    { id: "branch" },
    { id: "front" },
    { id: "scout", prompt: "scout", alias: "pm" },
  ],
};

/** The e2e default with room for the resumed iteration and the goal's close. */
const THREE_ITERATIONS = DEFAULT_RUN_YAML.replace(
  "iterations: 1",
  "iterations: 3",
);

type Goal = ReturnType<typeof makeGoal>;
type FlowRuntime = Awaited<ReturnType<typeof makeRuntime>>;

/** The classifier for a goal with no class yet: a bigger goal with a pack. */
const biggerFront: FakeTurnHandler = (req, ctx) => {
  const goalDir = path.resolve(path.dirname(req.outcomePath!), "../..");
  const pack = path.join(goalDir, "iterations/1/context-pack.md");
  fs.mkdirSync(path.dirname(pack), { recursive: true });
  fs.writeFileSync(pack, "# Front pack\n", "utf8");
  fs.writeFileSync(path.join(goalDir, "class.yaml"), "class: bigger\n", "utf8");
  ctx.writeOutcome(outcome({ summary: "classified bigger" }));
  return fakeTurnResult(req);
};

/** The architect plans on its first consult and closes the goal on the next. */
function planThenClose(goalDir: string): FakeTurnHandler {
  return (req, ctx) => {
    if (!fs.existsSync(path.join(goalDir, "plan.md"))) {
      writePlan(goalDir, "# Plan\n\n## alpha\nCreate alpha.txt.\n");
      ctx.writeOutcome(
        outcome({ summary: "planned alpha", decision: "continue" }),
      );
    } else {
      ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
    }
    return fakeTurnResult(req);
  };
}

/** Runs the launch that dies mid-scout and proves the record it left open. */
async function killDuringScout(goal: Goal): Promise<void> {
  const first = new FakeHarness({ id: "fake" });
  first.script(biggerFront, { when: whenTurn({ step: "front" }) });
  first.script(
    (req, ctx) => {
      const goalDir = path.resolve(path.dirname(req.outcomePath!), "../..");
      fs.writeFileSync(
        path.join(goalDir, "code-map.md"),
        "- src — two files\n",
        "utf8",
      );
      ctx.writeOutcome(outcome({ summary: "code map written" }));
      // The launcher dies here: outcome.yaml is on disk, end.yaml is not.
      throw new Error("the launcher died after the scout wrote its outcome");
    },
    { when: whenTurn({ step: "scout" }) },
  );
  await expectDispatch(1, ["run", "--repo", goal.repo.dir, "--goal", "demo"], {
    harnesses: { fake: first },
  });
  const store = createFolderStore(goal.goalDir, undefined, {});
  const orphan = (await store.listRecords()).find(
    (record) => record.step === "scout",
  );
  expect(orphan?.endedAt).toBeUndefined();
  expect(orphan?.outcome?.summary).toBe("code map written");
}

/** Relaunches the killed goal to the end; returns the harness that served it. */
async function relaunchAfterScoutCrash(goal: Goal): Promise<FakeHarness> {
  const second = new FakeHarness({ id: "fake" });
  second.script(planThenClose(goal.goalDir), {
    when: whenTurn({ step: "architect" }),
    fallback: true,
  });
  second.script(
    (req, ctx) => {
      writeTask(goal.goalDir, simpleTask("alpha", "alpha.txt"));
      ctx.writeOutcome(outcome({ summary: "filed alpha" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
  second.script(implementerTurn("alpha.txt"), {
    when: whenTurn({ slug: "alpha", step: "implement" }),
  });
  second.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({ summary: "alpha approved", verdict: "approve" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "alpha", step: "review" }) },
  );
  await expectDispatch(
    0,
    ["run", "--repo", goal.repo.dir, "--goal", "demo", "--iterations", "3"],
    { harnesses: { fake: second } },
  );
  return second;
}

/** The adopted step, the skipped ingestion, and the boundary in iteration 1. */
async function expectIngestionResumed(
  goal: Goal,
  second: FakeHarness,
): Promise<void> {
  const store = createFolderStore(goal.goalDir, undefined, {});
  const records = await store.listRecords();
  const scouts = records.filter((record) => record.step === "scout");
  expect(scouts).toHaveLength(1);
  expect(scouts[0]!.ok).toBe(true);
  expect(scouts[0]!.stop).toEqual({ kind: "done" });
  expect(scouts[0]!.outcome?.summary).toBe("code map written");
  // Usage died with the process: the adopted turn carries none, never a guess.
  expect(scouts[0]!.usage).toBeUndefined();
  // The finished ingestion steps got no second turn.
  const steps = new Set(
    second.calls.map((call) => fakeTurnIdentity(call).step),
  );
  expect(steps.has("front")).toBe(false);
  expect(steps.has("scout")).toBe(false);
  // The interrupted iteration kept its boundary turn, and its work landed there.
  expect(
    records.filter(
      (record) => record.step === "architect" && record.iteration === 1,
    ),
  ).toHaveLength(1);
  const alpha = records.filter((record) => record.slug === "alpha");
  expect(alpha.length).toBeGreaterThan(0);
  expect(alpha.every((record) => record.iteration === 1)).toBe(true);
  // The adopted turn is counted, unpriced: its usage died with the process.
  expect(await store.iterations.read(1, "summary.md")).toContain(
    "scout unknown (1 unpriced turn)",
  );
  expect(await store.iterations.read(1, "summary.md")).toContain(
    "planned alpha",
  );
}

describe("crash inside ingestion", () => {
  it("resumes the same iteration, skips the finished steps and adopts the scout's outcome", async () => {
    const goal = makeGoal({
      classYaml: null,
      processYaml: SCOUT_INGESTION,
      runYaml: THREE_ITERATIONS,
    });
    try {
      // An annotated intent keeps the resumed sequence on ingestion, not triage.
      fs.writeFileSync(
        path.join(goal.goalDir, "intent.md"),
        "# Goal\n\n[[Demo]] Build the demo.\n",
        "utf8",
      );
      await killDuringScout(goal);
      const second = await relaunchAfterScoutCrash(goal);
      await expectIngestionResumed(goal, second);
    } finally {
      cleanup(goal);
    }
  }, 120_000);
});

/** The front path's classifier: writes the class, its one task and its pack, then dies. */
function taskFrontCrash(slug: string): FakeTurnHandler {
  return (req, ctx) => {
    const goalDir = path.resolve(path.dirname(req.outcomePath!), "../..");
    const pack = path.join(goalDir, "iterations/1/context-pack.md");
    fs.mkdirSync(path.dirname(pack), { recursive: true });
    fs.writeFileSync(pack, "# Front pack\n", "utf8");
    fs.writeFileSync(
      path.join(goalDir, "class.yaml"),
      `class: task\nslug: ${slug}\n`,
      "utf8",
    );
    writeTask(goalDir, simpleTask(slug, `${slug}.txt`));
    ctx.writeOutcome(outcome({ summary: "classified task" }));
    // The launcher dies here: class.yaml, the task and outcome.yaml are on disk.
    throw new Error("the launcher died after the front wrote its outcome");
  };
}

describe("crash in a front path", () => {
  it("stops in the resumed iteration with the front's goal-met summary", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      const first = new FakeHarness({ id: "fake" });
      first.script(taskFrontCrash("alpha"), {
        when: whenTurn({ step: "front" }),
      });
      await expectDispatch(
        1,
        ["run", "--repo", goal.repo.dir, "--goal", "demo"],
        {
          harnesses: { fake: first },
        },
      );

      const second = new FakeHarness({ id: "fake" });
      second.script(implementerTurn("alpha.txt"), {
        when: whenTurn({ slug: "alpha", step: "implement" }),
      });
      second.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({ summary: "alpha approved", verdict: "approve" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha", step: "review" }) },
      );
      await expectDispatch(
        0,
        ["run", "--repo", goal.repo.dir, "--goal", "demo"],
        {
          harnesses: { fake: second },
        },
      );

      const store = createFolderStore(goal.goalDir, undefined, {});
      const records = await store.listRecords();
      const frontStops = records.filter(
        (record) => record.step === "front-stop",
      );
      expect(frontStops).toHaveLength(1);
      expect(frontStops[0]!.iteration).toBe(1);
      expect(frontStops[0]!.outcome?.decision).toBe("done");
      // The front turn was adopted, not rerun; the task landed in iteration 1.
      expect(
        second.calls.some((call) => fakeTurnIdentity(call).step === "front"),
      ).toBe(false);
      const alpha = records.filter((record) => record.slug === "alpha");
      expect(alpha.length).toBeGreaterThan(0);
      expect(alpha.every((record) => record.iteration === 1)).toBe(true);
      expect(await store.iterations.read(1, "summary.md")).toContain(
        "status: goal-met",
      );
      expect(await store.iterations.read(2, "summary.md")).toBeNull();
    } finally {
      cleanup(goal);
    }
  }, 120_000);
});

/** Stages one scout record per iteration: a delivered outcome, then a torn one. */
async function stageIngestionCrashes(runtime: FlowRuntime): Promise<void> {
  fs.writeFileSync(
    runtime.store.pathOf({ area: "goal", rel: "code-map.md" }),
    "- src — two files\n",
    "utf8",
  );
  const delivered = await runtime.store.startRecord(
    recordStart({
      iteration: 1,
      step: "scout",
      alias: "pm",
      model: { id: "fake-pm" },
    }),
  );
  fs.writeFileSync(
    delivered.outcomePath,
    "status: done\nsummary: mapped the checkout\nconcerns: []\nforward: []\n",
    "utf8",
  );
  const torn = await runtime.store.startRecord(
    recordStart({
      iteration: 2,
      step: "scout",
      alias: "pm",
      model: { id: "fake-pm" },
    }),
  );
  fs.writeFileSync(torn.outcomePath, "status: [unclosed\n", "utf8");
}

async function expectAdoptedAndTorn(runtime: FlowRuntime): Promise<void> {
  expect(await recoverLaunch(runtime)).toBe(2);
  const records = await runtime.store.listRecords();
  const adopted = records.find(
    (record) => record.iteration === 1 && record.step === "scout",
  );
  expect(adopted?.ok).toBe(true);
  expect(adopted?.stop).toEqual({ kind: "done" });
  expect(adopted?.outcome?.summary).toBe("mapped the checkout");
  expect(adopted?.usage).toBeUndefined();
  const sealed = records.find(
    (record) => record.iteration === 2 && record.step === "scout",
  );
  expect(sealed?.ok).toBe(false);
  expect(sealed?.stop).toEqual({ kind: "infra", cause: "crash" });
  expect(sealed?.outcome).toBeUndefined();
}

describe("recovery adopts a delivered ingestion outcome", () => {
  it("seals a killed ingestion turn with its outcome and a malformed one as a bare crash", async () => {
    const { repo, goal } = setupFlowRepo({
      process: STAGED_SCOUT_INGESTION,
      classYaml: "class: bigger\n",
    });
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      await stageIngestionCrashes(runtime);
      await expectAdoptedAndTorn(runtime);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("leaves a task turn's delivered outcome to its redispatch", async () => {
    const { repo, goal } = setupFlowRepo({
      process: { ingestion: [{ id: "branch" }, { id: "front" }] },
    });
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const turn = await runtime.store.startRecord(
        recordStart({ iteration: 1, slug: "alpha", step: "implement" }),
      );
      fs.writeFileSync(
        turn.outcomePath,
        "status: done\nsummary: half the work\nconcerns: []\nforward: []\n",
        "utf8",
      );

      expect(await recoverLaunch(runtime)).toBe(1);

      const sealed = (await runtime.store.listRecords()).find(
        (record) => record.slug === "alpha" && record.step === "implement",
      );
      expect(sealed?.ok).toBe(false);
      expect(sealed?.stop).toEqual({ kind: "infra", cause: "crash" });
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

/** The completed scout turn: writes the code map its step promises. */
function writingScout(goalDir: string): FakeTurnHandler {
  return (req, ctx) => {
    fs.writeFileSync(
      path.join(goalDir, "code-map.md"),
      "- src — one file\n",
      "utf8",
    );
    ctx.writeOutcome(outcome({ summary: "mapped the checkout" }));
    return fakeTurnResult(req);
  };
}

/** One killed scout turn whose delivered outcome the test stages. */
async function stageKilledScout(
  runtime: FlowRuntime,
  delivered: string,
): Promise<void> {
  const turn = await runtime.store.startRecord(
    recordStart({
      iteration: 1,
      step: "scout",
      alias: "pm",
      model: { id: "fake-pm" },
    }),
  );
  fs.writeFileSync(turn.outcomePath, delivered, "utf8");
}

const DELIVERED_DONE =
  "status: done\nsummary: mapped the checkout\nconcerns: []\nforward: []\n";

describe("a delivered ingestion outcome finishes only a complete step", () => {
  it("reruns a step whose done outcome never wrote its code map", async () => {
    const { repo, goalDir, goal } = setupFlowRepo({
      process: STAGED_SCOUT_INGESTION,
      classYaml: "class: bigger\n",
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(writingScout(goalDir), {
        when: whenTurn({ step: "scout" }),
      });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await stageKilledScout(runtime, DELIVERED_DONE);
      expect(fs.existsSync(path.join(goalDir, "code-map.md"))).toBe(false);

      expect(await recoverLaunch(runtime)).toBe(1);
      const sealed = (await runtime.store.listRecords()).find(
        (record) => record.step === "scout",
      );
      expect(sealed?.ok).toBe(false);
      expect(sealed?.stop).toEqual({ kind: "infra", cause: "crash" });

      // The stale done outcome does not finish the step: the step reruns and
      // its turn now writes the artifact the step promises.
      expect(await runIngestionSteps(runtime, 1, true)).toEqual({});
      expect(
        harness.calls.filter((call) => fakeTurnIdentity(call).step === "scout"),
      ).toHaveLength(1);
      expect(fs.existsSync(path.join(goalDir, "code-map.md"))).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("seals a blocked outcome bare, never as a completed step", async () => {
    const { repo, goal } = setupFlowRepo({
      process: STAGED_SCOUT_INGESTION,
      classYaml: "class: bigger\n",
    });
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      await stageKilledScout(
        runtime,
        "status: blocked\nsummary: needs the owner\nconcerns: []\nforward: []\n",
      );

      expect(await recoverLaunch(runtime)).toBe(1);

      const sealed = (await runtime.store.listRecords()).find(
        (record) => record.step === "scout",
      );
      expect(sealed?.ok).toBe(false);
      expect(sealed?.stop).toEqual({ kind: "infra", cause: "crash" });
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
