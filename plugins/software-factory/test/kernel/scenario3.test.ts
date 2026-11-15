import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { dispatch } from "../../src/cli/dispatch.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type { State, StepRecord } from "../../src/kernel/types.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

const PLAN = `# Milestone 1 — alpha

## alpha
Create alpha.txt.
Done when: alpha.txt exists.
`;

const ALPHA = `---
slug: alpha
title: Create alpha
kind: task
flow: implement-review
deps: []
scope: [alpha.txt]
source: Milestone 1 / alpha
---

Create alpha.txt.

Done when: alpha.txt exists.
`;

function outcome(value: Record<string, unknown>) {
  return { status: "done", summary: "ok", concerns: [], forward: [], ...value };
}

interface Scenario {
  repo: TmpRepo;
  goalDir: string;
  taskDir: string;
  harness: () => FakeHarness;
}

function setupRepo(): Scenario {
  const repo = createTmpRepo();
  repo.writeFile(
    ".factory/repo.yaml",
    "baseBranch: main\nartifactRoot: .factory/artifacts\nsetup: []\ngates: []\n",
  );
  const base = path.basename(repo.dir);
  repo.writeFile(
    ".factory/run.yaml",
    [
      "aliases:",
      "  architect: { harness: fake, model: fake-architect }",
      "  pm: { harness: fake, model: fake-pm }",
      "  implementer: { harness: fake, model: fake-impl }",
      "  reviewer: { harness: fake, model: fake-review }",
      "limits: { iterations: 1, concurrency: 1 }",
      `worktreeRoot: ../${base}-wt`,
      `sessions: { dir: ../${base}-sessions, keepRuns: 2 }`,
      "",
    ].join("\n"),
  );
  repo.commit("factory config");
  const goalDir = path.join(repo.dir, ".factory/artifacts/demo");
  fs.mkdirSync(goalDir, { recursive: true });
  fs.writeFileSync(
    path.join(goalDir, "intent.md"),
    "# Goal\n\nCreate alpha.\n",
    "utf8",
  );
  fs.writeFileSync(path.join(goalDir, "class.yaml"), "class: bigger\n", "utf8");
  return {
    repo,
    goalDir,
    taskDir: path.join(goalDir, "tasks"),
    harness: () => new FakeHarness({ id: "fake" }),
  };
}

function plan(harness: FakeHarness, goalDir: string): FakeHarness {
  return harness.script((req, ctx) => {
    const planPath = path.join(goalDir, "plan.md");
    if (fs.existsSync(planPath)) {
      fs.appendFileSync(planPath, "\n## architect edit on relaunch\n", "utf8");
    } else {
      fs.writeFileSync(planPath, PLAN, "utf8");
    }
    ctx.writeOutcome(
      outcome({ summary: "planned alpha", decision: "continue" }),
    );
    return fakeTurnResult(req);
  });
}

function pm(harness: FakeHarness, taskDir: string): FakeHarness {
  return harness.script((req, ctx) => {
    fs.writeFileSync(path.join(taskDir, "alpha.md"), ALPHA, "utf8");
    ctx.writeOutcome(outcome({ summary: "filed alpha" }));
    return fakeTurnResult(req);
  });
}

function implement(harness: FakeHarness, crash = false): FakeHarness {
  return harness.script((req, ctx) => {
    if (crash) throw new Error("simulated kill during implement");
    fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "alpha added" }));
    return fakeTurnResult(req);
  });
}

function review(harness: FakeHarness, crash = false): FakeHarness {
  return harness.script((req, ctx) => {
    if (crash) throw new Error("simulated kill during review");
    expect(fs.existsSync(path.join(req.cwd!, "alpha.txt"))).toBe(true);
    ctx.writeOutcome(
      outcome({ summary: "alpha is correct", verdict: "approve" }),
    );
    return fakeTurnResult(req);
  });
}

function done(harness: FakeHarness): FakeHarness {
  return harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
    return fakeTurnResult(req);
  });
}

async function launch(repo: TmpRepo, harness: FakeHarness): Promise<number> {
  return dispatch(
    ["run", "--repo", repo.dir, "--goal", "demo", "--iterations", "1"],
    {
      harnesses: { fake: harness },
    },
  );
}

async function stateOf(
  goalDir: string,
): Promise<{ state: State; records: StepRecord[] }> {
  const store = createFolderStore(goalDir);
  const records = await store.listRecords();
  return { state: derive(await store.listTasks(), records), records };
}

/** Derived task facts compared across a crashed and an uninterrupted run; SHAs differ. */
function taskShape(state: State) {
  return {
    goal: state.goal,
    terminal: state.terminal,
    tasks: Object.fromEntries(
      Object.entries(state.tasks).map(([slug, task]) => [
        slug,
        {
          status: task.status,
          cause: task.cause,
          round: task.round,
          kind: task.kind,
          flow: task.flow,
          phase: task.phase,
          verdict: task.verdict,
          hasCommit: Boolean(task.commit),
        },
      ]),
    ),
  };
}

function firstLaunch(s: Scenario, crashAt?: CrashPoint): FakeHarness {
  const harness = s.harness();
  plan(harness, s.goalDir);
  pm(harness, s.taskDir);
  implement(harness, crashAt === "implement");
  if (crashAt !== "implement") review(harness, crashAt === "review");
  return harness;
}

async function cleanRun(): Promise<State> {
  const s = setupRepo();
  try {
    expect(await launch(s.repo, firstLaunch(s))).toBe(3);
    expect(await launch(s.repo, done(s.harness()))).toBe(0);
    return (await stateOf(s.goalDir)).state;
  } finally {
    s.repo.cleanup();
  }
}

type CrashPoint = "implement" | "review";

async function crashedRun(crashAt: CrashPoint): Promise<{
  state: State;
  records: StepRecord[];
  recovered: StepRecord;
  content: string;
}> {
  const s = setupRepo();
  try {
    expect(await launch(s.repo, firstLaunch(s, crashAt))).toBe(1);

    const before = await stateOf(s.goalDir);
    const orphan = before.records.find((r) => r.startedAt && !r.endedAt);
    expect(orphan).toBeDefined();
    expect(orphan!.iteration).toBe(1);

    const second = s.harness();
    plan(second, s.goalDir);
    pm(second, s.taskDir);
    if (crashAt === "implement") implement(second);
    review(second);
    expect(await launch(s.repo, second)).toBe(3);

    const recovered = (await stateOf(s.goalDir)).records.find(
      (r) => r.seq === orphan!.seq,
    );
    expect(recovered?.endedAt).toBeTruthy();
    expect(recovered?.stop).toEqual({ kind: "infra", cause: "crash" });
    expect(recovered?.ok).toBe(false);

    expect(await launch(s.repo, done(s.harness()))).toBe(0);
    const final = await stateOf(s.goalDir);
    return {
      state: final.state,
      records: final.records,
      recovered: recovered!,
      content: s.repo.git(["show", "factory/demo:alpha.txt"]).stdout.trim(),
    };
  } finally {
    s.repo.cleanup();
  }
}

describe("KERNEL0 scenario 3 — kill mid-task, relaunch", () => {
  const points: CrashPoint[] = ["implement", "review"];

  for (const crashAt of points) {
    it(`reconciles a kill during ${crashAt} without duplicating work`, async () => {
      const clean = await cleanRun();
      const crashed = await crashedRun(crashAt);

      expect(crashed.state).toMatchObject({ goal: "done", terminal: true });
      expect(crashed.state.tasks.alpha!.status).toBe("merged");
      expect(crashed.state.tasks.alpha!.phase).toBe("done");
      expect(crashed.state.tasks.alpha!.verdict).toBe("approve");
      expect(crashed.content).toBe("alpha");
      // The crash-sealed attempt consumes the turn budget; the clean run does not pay it.
      expect(crashed.state.tasks.alpha!.turns).toBe(
        clean.tasks.alpha!.turns + 1,
      );
      expect(taskShape(crashed.state)).toEqual(taskShape(clean));

      const merges = crashed.records.filter(
        (r) => r.slug === "alpha" && r.step === "merge" && r.ok === true,
      );
      expect(merges).toHaveLength(1);
      const implementsDone = crashed.records.filter(
        (r) =>
          r.slug === "alpha" &&
          r.step === "implement" &&
          r.endedAt &&
          r.stop?.kind !== "infra",
      );
      expect(implementsDone).toHaveLength(1);
      if (crashAt === "review") {
        const reviews = crashed.records.filter(
          (r) =>
            r.slug === "alpha" &&
            r.step === "review" &&
            r.endedAt &&
            r.stop?.kind !== "infra",
        );
        expect(reviews).toHaveLength(1);
      }
    }, 60_000);
  }
});
