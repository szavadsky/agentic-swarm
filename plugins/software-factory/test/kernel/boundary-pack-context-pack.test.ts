import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { contextPackRelPath } from "../../src/kernel/context-pack.js";
import { postSteer } from "../../src/kernel/mailbox.js";
import { scriptMeta } from "../../src/kernel/record.js";
import { createFolderStore, recordDirName } from "../../src/kernel/store.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { cleanup, makeGoal, outcome, stateOf } from "./e2e-helpers.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  setupFlowRepo,
  whenTurn,
  writeTask as writeRuntimeTask,
} from "./s2-helpers.js";
import { writeHold } from "./steer-helpers.js";

const PLAN = `# Milestone 1

## later
Nothing to dispatch yet; the plan is the architect's.
`;

async function namesReadySpikeHeldByOwnSteerAtPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeRuntimeTask(runtime, task("landed", { scope: ["alpha-area"] }));
  await writeRuntimeTask(
    runtime,
    task("no-outcome-forensics-spike", {
      kind: "spike",
      flow: "spike",
      scope: ["outcome detector"],
    }),
  );
  // Segment 1 landed a sibling task; the spike started no turn in it.
  await runtime.store.appendRecord(scriptMeta(1, "merge", { slug: "landed" }), {
    ok: true,
  });
  await postSteer(
    runtime.store,
    "no-outcome-forensics",
    "Hold the spike until I answer.",
  );
  writeHold(runtime, "no-outcome-forensics", ["no-outcome-forensics-spike"]);

  const planPath = path.join(runtime.store.goalDir, "plan.md");
  fs.writeFileSync(planPath, "# Plan\n\n## landed\n", "utf8");
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({
        summary: "spike steer routed to the architect",
        steerRoutes: [{ steer: "no-outcome-forensics", route: "architect" }],
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    fs.appendFileSync(planPath, "\n## next\n", "utf8");
    ctx.writeOutcome(
      outcome({ summary: "saw the held spike", decision: "continue" }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "no new tasks" }));
    return fakeTurnResult(req);
  });

  const boundary = await runBoundary(runtime, { relaunch: false });
  expect(boundary.iteration).toBe(2);

  return { runtime };
}

async function namesReadySpikeHeldByOwnSteerAtPart2(
  scope: Awaited<ReturnType<typeof namesReadySpikeHeldByOwnSteerAtPart1>>,
) {
  const { runtime } = scope;
  const pack = fs.readFileSync(
    path.join(runtime.store.goalDir, contextPackRelPath(2)),
    "utf8",
  );
  expect(pack).toContain(
    "## Ready, no turn in the last segment\n- no-outcome-forensics-spike: held by steer no-outcome-forensics\n",
  );
  expect(pack).not.toContain("- landed: held");
}

async function dropsOwnedDebtFromPackArchitectPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const meta = {
    iteration: 1,
    slug: "alpha",
    step: "review",
    round: 1,
    actor: "agent",
  } as const;
  const debtText = "env allowlist v2 is dead config and needs a removal task";
  const debtId = `${recordDirName(1, meta)}#1`;
  await runtime.store.appendRecord(meta, {
    ok: true,
    outcome: {
      status: "done",
      summary: "approved with debt",
      concerns: [{ kind: "debt", calibration: "architect", text: debtText }],
      forward: [],
      verdict: "approve",
    },
  });
  const planPath = path.join(runtime.store.goalDir, "plan.md");
  fs.writeFileSync(
    planPath,
    `# Plan\n\n- env-allowlist-v2 — Remove the dead allowlist (${debtId})\n`,
    "utf8",
  );
  harness.script((req, ctx) => {
    fs.appendFileSync(planPath, "\n## next\n", "utf8");
    ctx.writeOutcome(
      outcome({ summary: "filed the remover", decision: "continue" }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "no new tasks" }));
    return fakeTurnResult(req);
  });

  const boundary = await runBoundary(runtime, { relaunch: false });

  return { runtime, debtText, debtId, boundary };
}

async function dropsOwnedDebtFromPackArchitectPart2(
  scope: Awaited<ReturnType<typeof dropsOwnedDebtFromPackArchitectPart1>>,
) {
  const { runtime, boundary, debtId, debtText } = scope;
  const pack = fs.readFileSync(
    path.join(runtime.store.goalDir, contextPackRelPath(boundary.iteration)),
    "utf8",
  );
  const register = pack.slice(pack.indexOf("## Debt register"));
  expect(register).toContain("- none open");
  expect(register).not.toContain(debtId);
  expect(register).not.toContain(debtText);
}

/** Seeds one finished epic whose merged task left a blocking debt open. */
async function seedFinishedEpicDebt(
  runtime: KernelRuntime,
): Promise<{ debtId: string; debtText: string }> {
  await writeRuntimeTask(runtime, task("alpha.build", { epic: "alpha" }));
  fs.writeFileSync(path.join(runtime.store.goalDir, "plan.md"), PLAN, "utf8");
  const debtText =
    "alpha finished with an open debt: the timeout path has no remover";
  const implementMeta = {
    iteration: 1,
    slug: "alpha.build",
    step: "implement",
    round: 1,
    actor: "agent",
  } as const;
  const debtRecord = await runtime.store.appendRecord(implementMeta, {
    ok: true,
    outcome: {
      status: "done",
      summary: "shipped with debt",
      concerns: [{ kind: "debt", calibration: "architect", text: debtText }],
      forward: [],
    },
  });
  await runtime.store.appendRecord(
    {
      iteration: 1,
      slug: "alpha.build",
      step: "merge",
      round: 1,
      actor: "script",
    },
    { ok: true },
  );
  // The subarchitect finishes the epic without closing the debt it left open.
  await runtime.store.appendRecord(
    {
      iteration: 1,
      step: "subarchitect",
      round: 1,
      actor: "agent",
      architect: "alpha",
    },
    {
      ok: true,
      outcome: {
        status: "done",
        summary: "alpha complete",
        concerns: [],
        forward: [],
        decision: "done",
      },
    },
  );
  const debtId = `${recordDirName(debtRecord.seq, implementMeta)}#1`;
  return { debtId, debtText };
}

async function escalatesFinishedEpicDebtToGoalPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const { debtId, debtText } = await seedFinishedEpicDebt(runtime);
  const before = await stateOf(runtime.store.goalDir);
  expect(before.epics.alpha?.done).toBe(true);
  expect(before.goal).toBe("active");
  harness.script(
    (req, ctx) => {
      const match = /- context pack: `([^`]+)`/.exec(req.prompt);
      if (!match?.[1]) throw new Error("turn prompt names no context pack");
      const pack = fs.readFileSync(match[1], "utf8");
      const register = pack.slice(pack.indexOf("## Debt register"));
      expect(register).toContain(debtId);
      expect(register).toContain(debtText);
      ctx.writeOutcome(
        outcome({
          summary: "closed the finished epic's debt",
          decision: "done",
          debtClosed: [{ id: debtId, reason: "the remover landed" }],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "architect" }) },
  );
  const boundary = await runBoundary(runtime, { relaunch: false });

  return { runtime, boundary, debtId, debtText };
}

async function escalatesFinishedEpicDebtToGoalPart2(
  scope: Awaited<ReturnType<typeof escalatesFinishedEpicDebtToGoalPart1>>,
) {
  const { runtime, boundary, debtId, debtText } = scope;
  expect(boundary.decision).toBe("done");
  const pack = fs.readFileSync(
    path.join(runtime.store.goalDir, contextPackRelPath(boundary.iteration)),
    "utf8",
  );
  const register = pack.slice(pack.indexOf("## Debt register"));
  expect(register).toContain(debtId);
  expect(register).toContain(debtText);
  const after = await stateOf(runtime.store.goalDir);
  expect(after.goal).toBe("done");
}

function registerBoundaryContextPackPart3(): void {
  it("drops an owned debt from the pack the architect receives", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const scope1 = await dropsOwnedDebtFromPackArchitectPart1(repo, goal);
      await dropsOwnedDebtFromPackArchitectPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);
}

function registerBoundaryContextPackPart4(): void {
  it("lists legacy records whose end.yaml still carries packTruncated", async () => {
    const goal = makeGoal();
    try {
      const store = createFolderStore(goal.goalDir, undefined, {});
      const turn = await store.startRecord({
        iteration: 1,
        slug: "alpha",
        step: "architect",
        round: 1,
        actor: "agent",
      });
      await turn.finish({ packBytes: 782 });
      // Pre-uncap records committed end.yaml with the retired flag; listRecords
      // must neither throw on nor drop the unknown key. Pre-seal records were
      // written open, so reopen this one to stage history as it exists.
      const endPath = path.join(turn.dir, "end.yaml");
      fs.chmodSync(endPath, 0o644);
      const raw = fs.readFileSync(endPath, "utf8");
      fs.writeFileSync(
        endPath,
        `${raw + (raw.endsWith("\n") ? "" : "\n")}packTruncated: true\n`,
        "utf8",
      );
      const records = await store.listRecords();
      expect(records.length).toBe(1);
      const [record] = records;
      expect(record?.packBytes).toBe(782);
      expect(
        (record as unknown as { packTruncated?: unknown })?.packTruncated,
      ).toBe(true);
    } finally {
      cleanup(goal);
    }
  });
}

function registerBoundaryContextPackPart5(): void {
  it("routes a finished epic's blocking debt to the goal architect's pack", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const scope1 = await escalatesFinishedEpicDebtToGoalPart1(repo, goal);
      await escalatesFinishedEpicDebtToGoalPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);
}

describe("boundary context pack", () => {
  registerBoundaryContextPackPart3();

  registerBoundaryContextPackPart4();

  registerBoundaryContextPackPart5();
});

/** The default implementer pool, preset as latched in the aging fixture. */
const IMPL_POOL = "fake+fake-impl";

describe("boundary ready aging", () => {
  it("names a ready spike held by its own steer at the next boundary", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const scope1 = await namesReadySpikeHeldByOwnSteerAtPart1(repo, goal);
      await namesReadySpikeHeldByOwnSteerAtPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("names a ready task whose next alias has no live tier", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeRuntimeTask(runtime, task("landed"));
      await writeRuntimeTask(runtime, task("starved"));
      await runtime.store.appendRecord(
        scriptMeta(1, "merge", { slug: "landed" }),
        { ok: true },
      );
      // The implementer's only tier sits in a quota cooldown.
      runtime.exhaustedPools.set(IMPL_POOL, { resetAt: Date.now() + 60_000 });
      await postSteer(runtime.store, "note", "Take a look at the plan.");

      const planPath = path.join(runtime.store.goalDir, "plan.md");
      fs.writeFileSync(planPath, "# Plan\n\n## landed\n", "utf8");
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "note routed to the architect",
            steerRoutes: [{ steer: "note", route: "architect" }],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        fs.appendFileSync(planPath, "\n## next\n", "utf8");
        ctx.writeOutcome(
          outcome({ summary: "named the dead tier", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no new tasks" }));
        return fakeTurnResult(req);
      });

      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.iteration).toBe(2);
      const pack = fs.readFileSync(
        path.join(runtime.store.goalDir, contextPackRelPath(2)),
        "utf8",
      );
      expect(pack).toContain(
        '- starved: alias "implementer" has no live tier:',
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);
});

const EPIC_SUMMARY = `# Iteration 1 summary — epic \`alpha\`

status: epic-met
decision: done
architect: alpha

## Epic
- summary: alpha built the parser

## Tasks
- merged (1): alpha.build

## Concerns
- none

## Upward brief
- none
`;

describe("boundary epic summary links", () => {
  it("links each epic's latest summary with its rollup in the top pack", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeRuntimeTask(runtime, task("alpha.build", { epic: "alpha" }));
      await writeRuntimeTask(runtime, task("beta.build", { epic: "beta" }));
      await runtime.store.appendRecord(
        scriptMeta(1, "subarchitect", { architect: "alpha" }),
        {
          ok: true,
          outcome: {
            status: "done",
            summary: "planned alpha",
            concerns: [],
            forward: [],
            decision: "continue",
          },
        },
      );
      await runtime.store.writeFile(
        "iterations/1/epics/alpha/summary.md",
        EPIC_SUMMARY,
      );

      const planPath = path.join(runtime.store.goalDir, "plan.md");
      fs.writeFileSync(planPath, "# Plan\n\n## alpha.build\n", "utf8");
      harness.script((req, ctx) => {
        fs.appendFileSync(planPath, "\n## next\n", "utf8");
        ctx.writeOutcome(
          outcome({ summary: "saw both epics", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no new tasks" }));
        return fakeTurnResult(req);
      });

      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.iteration).toBe(2);
      const pack = fs.readFileSync(
        path.join(runtime.store.goalDir, contextPackRelPath(2)),
        "utf8",
      );
      const alphaSummary = path.join(
        runtime.store.goalDir,
        "iterations/1/epics/alpha/summary.md",
      );
      expect(pack).toContain(
        `- \`alpha\`: open — subarchitect continue; 1 of 1 task open — alpha built the parser — ${alphaSummary}`,
      );
      // Beta has no summary yet: its rollup stays, and no link dangles.
      expect(pack).toContain(
        "- `beta`: open — subarchitect no turn; 1 of 1 task open",
      );
      expect(pack).not.toContain("iterations/1/epics/beta/summary.md");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);
});
