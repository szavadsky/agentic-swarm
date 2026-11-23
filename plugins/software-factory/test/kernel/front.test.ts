import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { validateFile } from "../../src/cli/commands.js";
import { dispatch } from "../../src/cli/dispatch.js";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { contextPackRelPath } from "../../src/kernel/context-pack.js";
import { createFolderStore } from "../../src/kernel/store.js";
import {
  cleanup,
  type E2EGoal,
  expectLaunch,
  makeGoal,
  outcome,
  scriptDigest,
  simpleTask,
  stateOf,
  writeTask,
} from "./e2e-helpers.js";
import { scriptStallLeave } from "./s2-helpers.js";

function writeClass(goal: E2EGoal, text: string): void {
  fs.writeFileSync(path.join(goal.goalDir, "class.yaml"), text, "utf8");
}

/** A front-authored pack at the path the launch hands a front-run class. */
function writePack(
  goal: E2EGoal,
  text = "# Front pack\n\n- the change touches one file\n",
): string {
  const file = path.join(goal.goalDir, contextPackRelPath(1));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
  return file;
}

function trivialFront(goal: E2EGoal, slug: string): FakeTurnHandler {
  return (req, ctx) => {
    expect(req.prompt).toContain("You are the front");
    writePack(goal);
    writeClass(goal, `class: trivial\nslug: ${slug}\n`);
    writeTask(
      goal.goalDir,
      simpleTask(slug, `${slug}.txt`, {
        flow: "just-implement",
        body: `Create ${slug}.txt.`,
      }),
    );
    ctx.writeOutcome(outcome({ summary: "classified trivial" }));
    return fakeTurnResult(req);
  };
}

/** The absolute worktree the implement prompt names in its `- worktree:` line. */
function promptWorktree(prompt: string): string {
  const match = /- worktree: `([^`]+)`/.exec(prompt);
  if (!match?.[1]) throw new Error("implement prompt names no worktree");
  return match[1];
}

/**
 * A trivial implement turn: the session stays in the front's cwd, so the work
 * goes to the absolute worktree from the prompt, never to the turn cwd.
 */
function trivialImplementerTurn(file: string): FakeTurnHandler {
  return (req, ctx) => {
    expect(req.session).toBeDefined();
    expect(req.cwd).toBe(req.session!.cwd);
    const worktree = promptWorktree(req.prompt);
    expect(path.isAbsolute(worktree)).toBe(true);
    expect(worktree).not.toBe(req.cwd);
    fs.writeFileSync(path.join(worktree, file), `${file}\n`, "utf8");
    ctx.writeOutcome(outcome({ summary: `${file} created` }));
    return fakeTurnResult(req);
  };
}

async function recordsOf(goal: E2EGoal) {
  return createFolderStore(goal.goalDir, undefined, {}).listRecords();
}

/** The `factory status` output, with console.log captured. */
async function statusLine(goal: E2EGoal): Promise<string> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  try {
    expect(
      await dispatch(["status", "--repo", goal.repo.dir, "--goal", "demo"]),
    ).toBe(0);
  } finally {
    console.log = original;
  }
  return lines.join("\n");
}

async function runsTrivialTaskSImplementTurnFrontPart1() {
  const goal = makeGoal({
    classYaml: null,
    processYaml: "boundary:\n  front: { prompt: front, alias: front }\n",
    runYaml: [
      "aliases:",
      "  front: { harness: fake, model: fake-front }",
      "  architect: { harness: fake, model: fake-architect }",
      "  pm: { harness: fake, model: fake-pm }",
      "  implementer: { harness: fake, model: fake-impl }",
      "  implementer-b: { harness: fake, model: fake-impl-b }",
      "  researcher: { harness: fake, model: fake-research }",
      "  reviewer: { harness: fake, model: fake-review }",
      "  qa: { harness: fake, model: fake-qa }",
      "  steward: { harness: fake, model: fake-steward }",
      "  plan-checker: { harness: fake, model: fake-check }",
      "  intent: { harness: fake, model: fake-intent }",
      "  plan-reviewer: { harness: fake, model: fake-plan-review }",
      "  pack-preparer: { harness: fake, model: fake-pack-prep }",
      "  digest: { harness: fake, model: fake-digest }",
      "limits: { iterations: 1, concurrency: { overall: 1 } }",
      "",
    ].join("\n"),
  });

  return { goal };
}

async function runsTrivialTaskSImplementTurnFrontPart2(
  scope: Awaited<ReturnType<typeof runsTrivialTaskSImplementTurnFrontPart1>>,
) {
  const { goal } = scope;
  try {
    const packPath = path.join(goal.goalDir, contextPackRelPath(1));
    const harness = new FakeHarness({ id: "fake" });
    harness.script(trivialFront(goal, "tiny"));
    harness.script((req, ctx) => {
      // The follow-up prompt resumes the front's session with its recorded
      // cwd; the work goes to the absolute worktree from the prompt.
      expect(req.session).toBeDefined();
      expect(req.cwd).toBe(req.session!.cwd);
      expect(req.prompt).toContain(`- front pack: \`${packPath}\``);
      expect(req.prompt).toContain("- branch: `factory-task/demo/tiny`");
      expect(req.model.id).toBe("fake-front");
      const worktree = promptWorktree(req.prompt);
      fs.writeFileSync(path.join(worktree, "tiny.txt"), "tiny\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "tiny.txt created" }));
      return fakeTurnResult(req);
    });

    await expectLaunch(0, goal.repo, harness, 3);

    const records = await recordsOf(goal);
    const front = records.find((r) => r.step === "front");
    const implement = records.find(
      (r) => r.slug === "tiny" && r.step === "implement",
    );
    expect(front?.alias).toBe("front");
    expect(implement?.alias).toBe("front");
    expect(implement?.model?.id).toBe("fake-front");
    expect(implement?.session?.harness).toBe("fake");
    expect(implement?.session?.id).toBe(front?.session?.id);
    expect(
      records.some(
        (r) => r.slug === "tiny" && r.step === "merge" && r.ok === true,
      ),
    ).toBe(true);
  } finally {
    cleanup(goal);
  }
}

async function resumesBlockedFrontGoalWaitingPart1(goal: E2EGoal) {
  const harness = new FakeHarness({ id: "fake" });
  harness.script(trivialFront(goal, "tiny"));
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({ status: "blocked", summary: "missing an input" }),
    );
    return fakeTurnResult(req);
  });
  scriptStallLeave(harness, ["tiny"]);

  await expectLaunch(2, goal.repo, harness, 3);
  expect((await stateOf(goal.goalDir)).goal).toBe("blocked");

  const inbox = path.join(goal.goalDir, "mailbox/inbox");
  fs.mkdirSync(inbox, { recursive: true });
  fs.writeFileSync(
    path.join(inbox, "s1.md"),
    "The input arrived; close the goal.\n",
    "utf8",
  );

  scriptDigest(harness, goal.goalDir, 2);
  // No plan before the first architect flow: no PM steer turn; the architect
  // takes the steer directly.
  harness.script((req, ctx) => {
    expect(req.prompt).toContain("You are the architect");
    expect(req.prompt).toContain(
      "- s1 (mailbox/inbox/s1.md): The input arrived; close the goal.",
    );
    ctx.writeOutcome(
      outcome({
        summary: "the input arrived",
        decision: "done",
        forward: ["steer s1: input accepted"],
      }),
    );
    return fakeTurnResult(req);
  });

  await expectLaunch(0, goal.repo, harness, 3);

  const state = await stateOf(goal.goalDir);
  expect(state.goal).toBe("done");
  expect(state.terminal).toBe(true);
  const records = await recordsOf(goal);
  const architect = records.filter((r) => r.step === "architect");
  expect(architect.map((r) => r.outcome?.decision)).toEqual(["done"]);

  return { inbox, records };
}

async function resumesBlockedFrontGoalWaitingPart2(
  goal: E2EGoal,
  scope: Awaited<ReturnType<typeof resumesBlockedFrontGoalWaitingPart1>>,
) {
  const { records, inbox } = scope;
  expect(
    records
      .filter((r) => r.step === "front-stop")
      .map((r) => r.outcome?.decision),
  ).toEqual(["blocked"]);
  expect(fs.existsSync(path.join(inbox, "s1.md"))).toBe(false);
  expect(
    fs.readFileSync(
      path.join(goal.goalDir, "mailbox/outbox/steer-s1.md"),
      "utf8",
    ),
  ).toContain("input accepted");
  expect(await statusLine(goal)).toContain("goal demo: done");
}

async function implementsTrivialGoalFrontSOwnPart1(goal: E2EGoal) {
  const harness = new FakeHarness({ id: "fake" });
  harness.script(trivialFront(goal, "tiny"));
  harness.script((req, ctx) => {
    const taskPath = /- task: `([^`]+)`/.exec(req.prompt)?.[1];
    expect(taskPath).toBeDefined();
    expect(fs.readFileSync(taskPath!, "utf8")).toContain(
      "flow: just-implement",
    );
    // The follow-up prompt resumes the front's session with its recorded
    // cwd and names the absolute worktree and branch; the pack stays a
    // prompt variable for the briefing.
    expect(req.session).toBeDefined();
    expect(req.cwd).toBe(req.session!.cwd);
    const worktree = promptWorktree(req.prompt);
    expect(path.isAbsolute(worktree)).toBe(true);
    expect(worktree).not.toBe(req.cwd);
    expect(req.prompt).toContain("- branch: `factory-task/demo/tiny`");
    expect(req.prompt).toContain(
      `Do all work under the absolute worktree path \`${worktree}\``,
    );
    expect(req.prompt).toContain(
      `- front pack: \`${path.join(goal.goalDir, contextPackRelPath(1))}\``,
    );
    expect(
      fs.readFileSync(path.join(goal.goalDir, contextPackRelPath(1)), "utf8"),
    ).toContain("one file");
    fs.writeFileSync(path.join(worktree, "tiny.txt"), "tiny\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "tiny.txt created" }));
    return fakeTurnResult(req);
  });

  await expectLaunch(0, goal.repo, harness, 3);

  const records = await recordsOf(goal);
  expect(records.filter((r) => r.step === "front")).toHaveLength(1);
  const front = records.find((r) => r.step === "front");
  expect(front?.alias).toBe("pm");
  expect(front?.model?.id).toBe("fake-pm");
  expect(front?.session).toBeDefined();

  return { harness, records, front };
}

async function implementsTrivialGoalFrontSOwnPart2(
  goal: E2EGoal,
  scope: Awaited<ReturnType<typeof implementsTrivialGoalFrontSOwnPart1>>,
) {
  const { records, front, harness } = scope;
  const implement = records.find(
    (r) => r.slug === "tiny" && r.step === "implement",
  );
  // The ladder's "same agent, same session": the fallback front alias is
  // the implement target, and the implement record carries the front's
  // session id — a de-novo retry would mint a new one.
  expect(implement?.alias).toBe(front?.alias);
  expect(implement?.model?.id).toBe(front?.model?.id);
  expect(implement?.session?.id).toBe(front?.session?.id);
  expect(implement?.session?.cwd).toBe(front?.session?.cwd);
  // The follow-up turn inherits the front's tool grant: same model and
  // same harness passthrough on both calls.
  expect(harness.calls[1]?.model).toEqual(harness.calls[0]?.model);
  expect(harness.calls[1]?.opaque).toEqual(harness.calls[0]?.opaque);
  expect(records.filter((r) => r.step === "architect")).toEqual([]);
  expect(records.filter((r) => r.step === "pm")).toEqual([]);
  expect(records.filter((r) => r.step === "review")).toEqual([]);
  expect(records.some((r) => r.slug === "tiny" && r.step === "checks")).toBe(
    true,
  );
  expect(
    records.some(
      (r) => r.slug === "tiny" && r.step === "merge" && r.ok === true,
    ),
  ).toBe(true);
  expect(harness.calls).toHaveLength(2);
  const classPath = path.join(goal.goalDir, "class.yaml");
  expect(fs.readFileSync(classPath, "utf8")).toContain("class: trivial");
  expect((await validateFile(classPath)).findings).toEqual([]);
  expect(
    fs.readFileSync(path.join(goal.goalDir, "iterations/1/summary.md"), "utf8"),
  ).toContain("status: goal-met");
}

function registerFrontLadderPart1(): void {
  it("implements a trivial goal in the front's own session and merges without architect or reviewer", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      const scope1 = await implementsTrivialGoalFrontSOwnPart1(goal);
      await implementsTrivialGoalFrontSOwnPart2(goal, scope1);
    } finally {
      cleanup(goal);
    }
  }, 90_000);

  it("runs a trivial task's implement turn in the front's session, on the front alias, with the pack variable", async () => {
    const scope1 = await runsTrivialTaskSImplementTurnFrontPart1();
    await runsTrivialTaskSImplementTurnFrontPart2(scope1);
  }, 90_000);

  it("derives a landed front goal as done and prints it in the status line", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(trivialFront(goal, "tiny"));
      harness.script(trivialImplementerTurn("tiny.txt"));

      await expectLaunch(0, goal.repo, harness, 3);

      const state = await stateOf(goal.goalDir);
      expect(state.goal).toBe("done");
      expect(state.terminal).toBe(true);
      expect(state.tasks.tiny!.status).toBe("merged");
      const stops = (await recordsOf(goal)).filter(
        (r) => r.step === "front-stop",
      );
      expect(stops.map((r) => r.outcome?.decision)).toEqual(["done"]);
      expect(await statusLine(goal)).toContain("goal demo: done");
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

function registerFrontLadderPart2(): void {
  it("derives a parked front goal as blocked and prints it in the status line", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(trivialFront(goal, "tiny"));
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ status: "blocked", summary: "missing an input" }),
        );
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["tiny"]);

      await expectLaunch(2, goal.repo, harness, 3);

      const state = await stateOf(goal.goalDir);
      expect(state.goal).toBe("blocked");
      expect(state.tasks.tiny!.status).toBe("parked");
      const stops = (await recordsOf(goal)).filter(
        (r) => r.step === "front-stop",
      );
      expect(stops.map((r) => r.outcome?.decision)).toEqual(["blocked"]);
      expect(stops[0]?.outcome?.summary).toBe(
        "front path stopped with tiny parked in iteration 1",
      );
      expect(await statusLine(goal)).toContain("goal demo: blocked");
    } finally {
      cleanup(goal);
    }
  }, 90_000);

  it("resumes a blocked front goal on a waiting steer and lets the architect decide", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      const scope1 = await resumesBlockedFrontGoalWaitingPart1(goal);
      await resumesBlockedFrontGoalWaitingPart2(goal, scope1);
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

describe("front ladder", () => {
  registerFrontLadderPart1();

  registerFrontLadderPart2();
});
