import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { createDrainController } from "../../src/kernel/signals.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { expectDispatch } from "./e2e-helpers.js";
import { whenTurn } from "./s2-helpers.js";
import {
  ALPHA,
  BETA,
  PLAN,
  outcome,
  setupRepo,
  silenceWarn,
  turnsBeforeFirstTask,
} from "./resume-helpers.js";

const GAMMA = `---
slug: gamma
title: Create gamma
kind: task
flow: implement-review
deps: []
scope: [gamma.txt]
source: Milestone 1 / gamma
---

Create gamma.txt.
`;

type Tree = Map<string, string>;

function snapshotTree(root: string): Tree {
  const files: Tree = new Map();
  const walk = (dir: string, rel: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const child = rel === "" ? entry.name : `${rel}/${entry.name}`;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, child);
      else files.set(child, fs.readFileSync(abs, "utf8"));
    }
  };
  walk(root, "");
  return files;
}

/**
 * Paths a relaunch may write: the append-only step records, the script
 * artifacts derived from them (iteration digests, summaries and metrics, the
 * status snapshot and its dashboard, the dashboard's vendored assets, the
 * mailbox), and each launch's own run log. Everything else is authored by a
 * turn or the operator.
 */
function isRecordTree(rel: string): boolean {
  return (
    rel.startsWith("records/") ||
    rel.startsWith("iterations/") ||
    rel.startsWith("mailbox/") ||
    rel.startsWith("vendor/") ||
    rel.startsWith("logs/") ||
    rel === "metrics.yaml" ||
    rel === "status.json" ||
    rel === "dashboard.html"
  );
}

function diffTrees(
  before: Tree,
  after: Tree,
): { added: string[]; removed: string[]; changed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const [rel, text] of after) {
    const old = before.get(rel);
    if (old === undefined) added.push(rel);
    else if (old !== text) changed.push(rel);
  }
  for (const rel of before.keys()) if (!after.has(rel)) removed.push(rel);
  return {
    added: added.sort(),
    removed: removed.sort(),
    changed: changed.sort(),
  };
}

/**
 * Every change is a record or a script artifact derived from one, except the
 * paths an agent turn is allowed to author (the architect edits the plan).
 */
function expectOnlyRecordTreeChanges(
  before: Tree,
  after: Tree,
  allowedAuthored: readonly string[] = [],
): void {
  const allowed = new Set(allowedAuthored);
  const diff = diffTrees(before, after);
  expect(diff.removed.filter((rel) => !isRecordTree(rel))).toEqual([]);
  expect(
    diff.changed.filter((rel) => !isRecordTree(rel) && !allowed.has(rel)),
  ).toEqual([]);
  expect(
    diff.added.filter((rel) => !isRecordTree(rel) && !allowed.has(rel)),
  ).toEqual([]);
  expect(diff.changed.filter((rel) => rel.startsWith("records/"))).toEqual([]);
}

describe("relaunch is idempotent by script", () => {
  it("two relaunches resume the same iteration without rewriting task files or config", async () => {
    const { repo, goalDir, taskDir } = setupRepo();
    const firstDrain = createDrainController();
    const secondDrain = createDrainController();
    const restoreWarn = silenceWarn();
    try {
      const scope1 = await twoRelaunchesResumeSameIterationPart1(
        goalDir,
        taskDir,
        firstDrain,
        repo,
      );
      await twoRelaunchesResumeSameIterationPart2(goalDir, secondDrain, scope1);
      const scope3 = await twoRelaunchesResumeSameIterationPart3(
        goalDir,
        repo,
        secondDrain,
        scope1,
      );
      await twoRelaunchesResumeSameIterationPart4(goalDir, scope3);
      const scope5 = await twoRelaunchesResumeSameIterationPart5(repo, scope3);
      await twoRelaunchesResumeSameIterationPart6(goalDir, scope5);
    } finally {
      restoreWarn();
      repo.cleanup();
    }
  }, 120_000);
});

async function twoRelaunchesResumeSameIterationPart1(
  goalDir: string,
  taskDir: string,
  firstDrain: ReturnType<typeof createDrainController>,
  repo: ReturnType<typeof setupRepo>["repo"],
) {
  const first = new FakeHarness({ id: "fake" });
  first.script((req, ctx) => {
    fs.writeFileSync(path.join(goalDir, "plan.md"), PLAN, "utf8");
    ctx.writeOutcome(outcome({ summary: "planned", decision: "continue" }));
    return fakeTurnResult(req);
  });
  first.script((req, ctx) => {
    fs.writeFileSync(path.join(taskDir, "alpha.md"), ALPHA, "utf8");
    fs.writeFileSync(path.join(taskDir, "beta.md"), BETA, "utf8");
    fs.writeFileSync(path.join(taskDir, "gamma.md"), GAMMA, "utf8");
    ctx.writeOutcome(outcome({ summary: "filed" }));
    return fakeTurnResult(req);
  });
  first.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "alpha added" }));
    return fakeTurnResult(req);
  });
  first.script((req, ctx) => {
    firstDrain.handleSignal("SIGINT");
    ctx.writeOutcome(
      outcome({ summary: "alpha approved", verdict: "approve" }),
    );
    return fakeTurnResult(req);
  });
  await expectDispatch(130, ["run", "--repo", repo.dir, "--goal", "demo"], {
    harnesses: { fake: first },
    signals: firstDrain,
  });

  const interruptedTree = snapshotTree(goalDir);
  const store = createFolderStore(goalDir, undefined, {});
  const interrupted = derive(
    await store.listTasks(),
    await store.listRecords(),
  );
  expect(interrupted.interrupted).toBe(true);
  expect(interrupted.iteration).toBe(1);
  expect(interrupted.tasks.alpha!.status).toBe("merged");
  expect(interrupted.tasks.beta!.status).toBe("ready");
  expect(interrupted.tasks.gamma!.status).toBe("ready");

  // Relaunch 1: resume iteration 1 script-only. Beta lands; the SIGINT while
  // beta's implement turn is in flight drains the pass before gamma starts, so
  // the iteration stays interrupted.
  const second = new FakeHarness({ id: "fake" });

  return { interruptedTree, store, second };
}

async function twoRelaunchesResumeSameIterationPart2(
  goalDir: string,
  secondDrain: ReturnType<typeof createDrainController>,
  scope: Awaited<ReturnType<typeof twoRelaunchesResumeSameIterationPart1>>,
) {
  const { second } = scope;
  second.script(
    (req, ctx) => {
      secondDrain.handleSignal("SIGINT");
      fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "beta added" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "beta", step: "implement" }) },
  );
}

async function twoRelaunchesResumeSameIterationPart3(
  goalDir: string,
  repo: ReturnType<typeof setupRepo>["repo"],
  secondDrain: ReturnType<typeof createDrainController>,
  scope: Awaited<ReturnType<typeof twoRelaunchesResumeSameIterationPart1>>,
) {
  const { second, store, interruptedTree } = scope;
  second.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({ summary: "beta approved", verdict: "approve" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "beta", step: "review" }) },
  );
  await expectDispatch(130, ["run", "--repo", repo.dir, "--goal", "demo"], {
    harnesses: { fake: second },
    signals: secondDrain,
  });

  const afterFirstRelaunch = derive(
    await store.listTasks(),
    await store.listRecords(),
  );
  expect(afterFirstRelaunch.interrupted).toBe(true);
  expect(afterFirstRelaunch.iteration).toBe(1);
  expect(afterFirstRelaunch.tasks.beta!.status).toBe("merged");
  expect(afterFirstRelaunch.tasks.gamma!.status).toBe("ready");
  expectOnlyRecordTreeChanges(interruptedTree, snapshotTree(goalDir), [
    "plan.md",
  ]);

  // A clean resume is script-only: no agent turn precedes beta's task turn.
  expect(turnsBeforeFirstTask(second)).toEqual([]);

  // Relaunch 2: resume the same iteration again; gamma lands and the
  // iteration closes.
  const third = new FakeHarness({ id: "fake" });

  return { ...scope, third };
}

async function twoRelaunchesResumeSameIterationPart4(
  goalDir: string,
  scope: Awaited<ReturnType<typeof twoRelaunchesResumeSameIterationPart3>>,
) {
  const { third } = scope;
  third.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "gamma.txt"), "gamma\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "gamma added" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "gamma", step: "implement" }) },
  );
  third.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({ summary: "gamma approved", verdict: "approve" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "gamma", step: "review" }) },
  );
  third.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "needs the architect",
          planCheck: { verdict: "architect", evidence: [], followUps: [] },
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "plancheck" }) },
  );
  third.script(
    (req, ctx) => {
      fs.appendFileSync(
        path.join(goalDir, "plan.md"),
        "\n## architect ruling after the resume\n\n## second architect ruling after the resume\n",
        "utf8",
      );
      ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "architect" }) },
  );
  third.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "no plan changes" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "planreview" }) },
  );
  third.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "nothing to file" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
}

async function twoRelaunchesResumeSameIterationPart5(
  repo: ReturnType<typeof setupRepo>["repo"],
  scope: Awaited<ReturnType<typeof twoRelaunchesResumeSameIterationPart3>>,
) {
  const { third, store } = scope;
  await expectDispatch(
    0,
    ["run", "--repo", repo.dir, "--goal", "demo", "--iterations", "3"],
    { harnesses: { fake: third } },
  );

  // Script-only again: gamma's task turn is the first agent turn.
  expect(turnsBeforeFirstTask(third)).toEqual([]);

  const records = await store.listRecords();
  const state = derive(await store.listTasks(), records);
  expect(state.goal).toBe("done");
  expect(state.tasks.alpha!.status).toBe("merged");
  expect(state.tasks.beta!.status).toBe("merged");
  expect(state.tasks.gamma!.status).toBe("merged");

  const resumes = records.filter(
    (r) => r.iteration === 1 && r.step === "resume",
  );
  expect(resumes.map((r) => r.outcome?.summary)).toEqual([
    "resume attempt 1 of iteration 1",
    "resume attempt 2 of iteration 1",
  ]);
  expect(records.some((r) => r.step === "resume-refused")).toBe(false);
  // One architect from the first launch, then the resuming pass's plan-check
  // gave its budget back: the closing boundary rules once in iteration 2.
  expect(
    records.filter(
      (r) => r.iteration === 1 && r.actor === "agent" && r.step === "architect",
    ),
  ).toHaveLength(1);
  expect(
    records.filter(
      (r) => r.iteration === 2 && r.actor === "agent" && r.step === "architect",
    ),
  ).toHaveLength(1);

  return { ...scope, records };
}

async function twoRelaunchesResumeSameIterationPart6(
  goalDir: string,
  scope: Awaited<ReturnType<typeof twoRelaunchesResumeSameIterationPart5>>,
) {
  const { records, interruptedTree } = scope;
  expect(
    records.filter((r) => r.slug === "gamma").every((r) => r.iteration === 1),
  ).toBe(true);

  // Only the record tree grew and the architect's rulings edited the plan;
  // no record was rewritten and no task file changed.
  const finalTree = snapshotTree(goalDir);
  expectOnlyRecordTreeChanges(interruptedTree, finalTree, ["plan.md"]);
  for (const rel of [
    "intent.md",
    "class.yaml",
    "tasks/alpha.md",
    "tasks/beta.md",
    "tasks/gamma.md",
  ]) {
    expect(finalTree.get(rel)).toBe(interruptedTree.get(rel));
  }
  expect(finalTree.get("plan.md")).toContain(
    "## architect ruling after the resume",
  );
  expect(finalTree.get("plan.md")).toContain(
    "## second architect ruling after the resume",
  );
}
