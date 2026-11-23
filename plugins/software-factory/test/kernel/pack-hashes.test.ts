import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { recordedGoalStart } from "../../src/kernel/baseline.js";
import {
  recordedIterationHead,
  recordedPackHashes,
} from "../../src/kernel/boundary-context.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import {
  type ContextPackInput,
  contextPackRelPath,
  renderContextData,
  renderContextPack,
} from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { scriptMeta } from "../../src/kernel/record.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { integrationHead } from "../../src/kernel/worktree.js";
import { script, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
} from "./s2-helpers.js";

const GOAL_START = "1".repeat(40);
const LAST_ITERATION = "2".repeat(40);
const HEAD = "3".repeat(40);

const PLAN = "# Milestone 1\n\n## later\nNothing to dispatch yet.\n";

function packInput(patch: Partial<ContextPackInput> = {}): ContextPackInput {
  const tasks = [task("alpha")];
  return {
    goal: "demo",
    iteration: 2,
    intentPath: "/goal/intent.md",
    planPath: "/goal/plan.md",
    checkout: "/wt/demo",
    integrationBranch: "factory/demo",
    headHash: HEAD,
    goalStartHash: GOAL_START,
    lastIterationHash: LAST_ITERATION,
    recordsDir: "/goal/records",
    tasksDir: "/goal/tasks",
    tasks,
    state: derive(tasks, []),
    steers: [],
    setup: [],
    gates: [],
    forwarded: [],
    debts: [],
    ...patch,
  };
}

describe("pack hash header", () => {
  it("names the goal-start, last-iteration and head hashes", () => {
    const pack = renderContextPack(packInput());
    expect(pack).toContain(
      "- hashes: goal-start 1111111111, last iteration 2222222222, head 3333333333",
    );
  });

  it("names an absent hash instead of leaving it blank", () => {
    const pack = renderContextPack(
      packInput({
        iteration: 1,
        goalStartHash: undefined,
        lastIterationHash: undefined,
      }),
    );
    expect(pack).toContain(
      "- hashes: goal-start not recorded, last iteration not recorded, head 3333333333",
    );
  });
});

describe("pack hash data", () => {
  it("carries both hashes for the pack preparer", () => {
    const data = JSON.parse(renderContextData(packInput()));
    expect(data.paths).toMatchObject({
      goalStartHash: GOAL_START,
      lastIterationHash: LAST_ITERATION,
      headHash: HEAD,
    });
    const absent = JSON.parse(
      renderContextData(
        packInput({ goalStartHash: undefined, lastIterationHash: undefined }),
      ),
    );
    expect(absent.paths.goalStartHash).toBeNull();
    expect(absent.paths.lastIterationHash).toBeNull();
  });
});

describe("recorded goal start", () => {
  it("takes the earliest recorded base run, not the latest launch", () => {
    const records = [
      script(3, { iteration: 0, step: "baseline", base: "3".repeat(40) }),
      script(1, { iteration: 0, step: "baseline-infra", base: GOAL_START }),
      script(2, { iteration: 0, step: "baseline", base: "2".repeat(40) }),
      script(4, { iteration: 0, step: "baseline", base: "4".repeat(40) }),
    ];
    expect(recordedGoalStart(records)).toBe(GOAL_START);
    expect(recordedGoalStart([])).toBeUndefined();
    expect(
      recordedGoalStart([
        script(1, {
          iteration: 0,
          step: "baseline",
          base: GOAL_START,
          endedAt: undefined,
        }),
      ]),
    ).toBeUndefined();
  });
});

async function iterationHeadFixture() {
  const goalDir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-hashes-"));
  const store = createFolderStore(goalDir, undefined, {});
  await store.ensureLayout();
  await store.iterations.write(
    1,
    "context-data.json",
    JSON.stringify({ paths: { headHash: GOAL_START } }),
  );
  return { goalDir, store };
}

describe("recorded iteration head", () => {
  it("reads an iteration's head and treats missing or corrupt data as absent", async () => {
    const { goalDir, store } = await iterationHeadFixture();
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (msg: string) => warnings.push(msg);
    try {
      expect(await recordedIterationHead(store, 1)).toBe(GOAL_START);
      expect(await recordedIterationHead(store, 0)).toBeUndefined();
      expect(await recordedIterationHead(store, 2)).toBeUndefined();
      await store.iterations.write(3, "context-data.json", "{not json");
      expect(await recordedIterationHead(store, 3)).toBeUndefined();
      await store.iterations.write(4, "context-data.json", "null");
      expect(await recordedIterationHead(store, 4)).toBeUndefined();
      await store.iterations.write(5, "context-data.json", "{}");
      expect(await recordedIterationHead(store, 5)).toBeUndefined();
      expect(warnings.join("\n")).toContain(
        "iteration 3: context-data.json is not valid JSON",
      );
    } finally {
      console.warn = original;
      fs.rmSync(goalDir, { recursive: true, force: true });
    }
  });
});

describe("recorded pack hashes", () => {
  it("takes the earliest base as the goal start and the previous head as the last iteration", async () => {
    const { goalDir, store } = await iterationHeadFixture();
    try {
      await store.iterations.write(
        2,
        "context-data.json",
        JSON.stringify({ paths: { headHash: LAST_ITERATION } }),
      );
      expect(
        await recordedPackHashes(
          store,
          [script(1, { step: "baseline", base: HEAD })],
          3,
        ),
      ).toEqual({
        goalStartHash: HEAD,
        lastIterationHash: LAST_ITERATION,
      });
    } finally {
      fs.rmSync(goalDir, { recursive: true, force: true });
    }
  });

  it("reads no history for iteration 1, even from its own recorded data", async () => {
    const { goalDir, store } = await iterationHeadFixture();
    try {
      expect(await recordedPackHashes(store, [], 1)).toEqual({
        goalStartHash: undefined,
        lastIterationHash: undefined,
      });
    } finally {
      fs.rmSync(goalDir, { recursive: true, force: true });
    }
  });

  it("falls back to iteration 1's recorded head for both hashes", async () => {
    const { goalDir, store } = await iterationHeadFixture();
    try {
      expect(await recordedPackHashes(store, [], 2)).toEqual({
        goalStartHash: GOAL_START,
        lastIterationHash: GOAL_START,
      });
    } finally {
      fs.rmSync(goalDir, { recursive: true, force: true });
    }
  });
});

function scriptArchitectAndPm(
  harness: FakeHarness,
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
): void {
  harness.script(
    (req, ctx) => {
      fs.appendFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "\n## architect edit\n",
        "utf8",
      );
      ctx.writeOutcome(outcome({ summary: "planned", decision: "continue" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "architect" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
}

/** Iteration 2 with a recorded pre-flight base and a recorded iteration-1 head. */
async function boundaryPackFromRecords() {
  const { repo, goal } = setupFlowRepo();
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  fs.writeFileSync(path.join(runtime.store.goalDir, "plan.md"), PLAN, "utf8");
  await runtime.store.appendRecord(
    { ...scriptMeta(0, "baseline"), base: GOAL_START },
    { ok: true, checks: [] },
  );
  await runtime.store.iterations.write(
    1,
    "context-data.json",
    JSON.stringify({ paths: { headHash: LAST_ITERATION } }),
  );
  scriptArchitectAndPm(harness, runtime);
  const head = await integrationHead(runtime);
  const boundary = await runBoundary(runtime, {
    relaunch: false,
    iteration: 2,
  });
  return { repo, runtime, head, boundary };
}

function expectBoundaryPackHashes(
  scope: Awaited<ReturnType<typeof boundaryPackFromRecords>>,
): void {
  const { runtime, head, boundary } = scope;
  expect(head).not.toBe(GOAL_START);
  expect(head).not.toBe(LAST_ITERATION);
  expect(boundary.decision).toBe("continue");
  const pack = fs.readFileSync(
    path.join(runtime.store.goalDir, contextPackRelPath(2)),
    "utf8",
  );
  expect(pack).toContain(
    `- hashes: goal-start ${GOAL_START.slice(0, 10)}, last iteration ${LAST_ITERATION.slice(0, 10)}, head ${head.slice(0, 10)}`,
  );
  const data = JSON.parse(
    fs.readFileSync(
      path.join(runtime.store.goalDir, "iterations/2/context-data.json"),
      "utf8",
    ),
  );
  expect(data.paths).toMatchObject({
    goalStartHash: GOAL_START,
    lastIterationHash: LAST_ITERATION,
    headHash: head,
  });
}

describe("boundary pack hashes", () => {
  it("renders the recorded goal-start and last-iteration hashes, not the head", async () => {
    const scope = await boundaryPackFromRecords();
    try {
      expectBoundaryPackHashes(scope);
    } finally {
      cleanupFlowRepo(scope.repo);
    }
  }, 60_000);
});
