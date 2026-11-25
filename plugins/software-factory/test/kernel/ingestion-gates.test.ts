import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { contextPackRelPath } from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { runFront } from "../../src/kernel/front.js";
import { INFRA_FILE } from "../../src/kernel/infra.js";
import type { KernelRuntime, State } from "../../src/kernel/types.js";
import {
  cleanup,
  expectLaunch,
  implementerTurn,
  makeGoal,
  simpleTask,
  stateOf,
  writePlan,
  writeTask as writeGoalTask,
} from "./e2e-helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome as outcomeOf,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";
import { task } from "./helpers.js";

function trivialFront(
  goalDir: string,
  slug: string,
): (
  req: Parameters<FakeHarness["turn"]>[0],
  ctx: { writeOutcome(v: unknown): void },
) => Promise<ReturnType<typeof fakeTurnResult>> {
  return (req, ctx) => {
    const pack = path.join(goalDir, contextPackRelPath(1));
    fs.mkdirSync(path.dirname(pack), { recursive: true });
    fs.writeFileSync(pack, "# Front pack\n", "utf8");
    fs.writeFileSync(
      path.join(goalDir, "class.yaml"),
      `class: trivial\nslug: ${slug}\n`,
      "utf8",
    );
    ctx.writeOutcome(outcomeOf({ summary: "classified trivial" }));
    return Promise.resolve(fakeTurnResult(req));
  };
}

async function emptyState(runtime: KernelRuntime): Promise<State> {
  return derive([], [], runtime.configs.process.flows);
}

function noGateRepoYaml(): string {
  return [
    "baseBranch: main",
    "artifactRoot: .factory/artifacts",
    "setup: []",
    "gates: []",
    "",
  ].join("\n");
}

function registersNoGateOptOut(): void {
  it("launches past an explicit repo-config no-gate opt-out", async () => {
    const { repo, goalDir, goal } = setupFlowRepo({
      gates: [],
      classYaml: null,
    });
    try {
      const repoFile = path.join(repo.dir, ".factory/repo.yaml");
      const repoConfig = yaml.parse(fs.readFileSync(repoFile, "utf8"));
      repoConfig.requireGates = false;
      fs.writeFileSync(repoFile, yaml.stringify(repoConfig));
      const harness = new FakeHarness({ id: "fake" });
      harness.script(trivialFront(goalDir, "demo-task"), {
        when: whenTurn({ step: "front" }),
      });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("demo-task", { flow: "just-implement", scope: ["demo-task.txt"] }),
      );
      const result = await runFront(runtime, {
        iteration: 1,
        state: await emptyState(runtime),
      });
      expect(result.action, result.cause ?? "").toBe("dispatch");
    } finally {
      cleanupFlowRepo(repo);
    }
  });
}

function registersDiscoveredGate(): void {
  it("counts a gate the infra step discovered", async () => {
    const { repo, goalDir, goal } = setupFlowRepo({
      gates: [],
      classYaml: null,
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(trivialFront(goalDir, "demo-task"), {
        when: whenTurn({ step: "front" }),
      });
      harness.script(
        (req, ctx) => {
          const dir = path.resolve(path.dirname(req.outcomePath!), "../..");
          fs.writeFileSync(
            path.join(dir, INFRA_FILE),
            'gates:\n  - name: unit\n    command: "true"\n    speed: fast\n    status: green\n',
            "utf8",
          );
          ctx.writeOutcome(outcomeOf({ summary: "discovered a gate" }));
          return Promise.resolve(fakeTurnResult(req));
        },
        { when: whenTurn({ step: "infra" }) },
      );
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("demo-task", { flow: "just-implement", scope: ["demo-task.txt"] }),
      );
      const result = await runFront(runtime, {
        iteration: 1,
        state: await emptyState(runtime),
      });
      expect(result.action, result.cause ?? "").toBe("dispatch");
    } finally {
      cleanupFlowRepo(repo);
    }
  });
}

function registersLaunchRefusal(): void {
  it("stops the launch with the no-gate cause", async () => {
    const goal = makeGoal({ repoYaml: noGateRepoYaml(), classYaml: null });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(
        (req, ctx) => {
          const goalDir = path.resolve(path.dirname(req.outcomePath!), "../..");
          const pack = path.join(goalDir, contextPackRelPath(1));
          fs.mkdirSync(path.dirname(pack), { recursive: true });
          fs.writeFileSync(pack, "# Front pack\n", "utf8");
          fs.writeFileSync(
            path.join(goalDir, "class.yaml"),
            "class: trivial\nslug: tiny\n",
            "utf8",
          );
          writeGoalTask(
            goalDir,
            simpleTask("tiny", "tiny.txt", { flow: "just-implement" }),
          );
          ctx.writeOutcome(outcomeOf({ summary: "classified trivial" }));
          return Promise.resolve(fakeTurnResult(req));
        },
        { when: whenTurn({ step: "front" }) },
      );
      await expectLaunch(1, goal.repo, harness);
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("no gate");
      expect(summary).toContain("requireGates: false");
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

function registersPendingSteerRefusal(): void {
  it("stops a pending-steer launch before dispatch with no gate", async () => {
    const goal = makeGoal({ repoYaml: noGateRepoYaml() });
    try {
      const inbox = path.join(goal.goalDir, "mailbox/inbox");
      fs.mkdirSync(inbox, { recursive: true });
      fs.writeFileSync(
        path.join(inbox, "s1.md"),
        "Keep alpha first.\n",
        "utf8",
      );
      const harness = new FakeHarness({ id: "fake" });
      harness.script(
        (req, ctx) => {
          writePlan(goal.goalDir, "# Plan\n\n## alpha\nCreate alpha.txt.\n");
          ctx.writeOutcome(
            outcomeOf({ summary: "planned alpha", decision: "continue" }),
          );
          return Promise.resolve(fakeTurnResult(req));
        },
        { when: whenTurn({ step: "architect" }) },
      );
      harness.script(
        (req, ctx) => {
          writeGoalTask(
            goal.goalDir,
            simpleTask("alpha", "alpha.txt", { flow: "just-implement" }),
          );
          ctx.writeOutcome(outcomeOf({ summary: "filed alpha" }));
          return Promise.resolve(fakeTurnResult(req));
        },
        { when: whenTurn({ step: "pm" }) },
      );
      harness.script(implementerTurn("alpha.txt"));
      await expectLaunch(1, goal.repo, harness);
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("no gate");
      expect((await stateOf(goal.goalDir)).tasks.alpha?.status).not.toBe(
        "merged",
      );
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

function registersPlanPresentRefusal(): void {
  it("stops a plan-present launch before dispatch with no gate", async () => {
    const goal = makeGoal({ repoYaml: noGateRepoYaml() });
    try {
      writePlan(goal.goalDir, "# Plan\n\n## alpha\nCreate alpha.txt.\n");
      writeGoalTask(
        goal.goalDir,
        simpleTask("alpha", "alpha.txt", { flow: "just-implement" }),
      );
      const harness = new FakeHarness({ id: "fake" });
      harness.script(
        (req, ctx) => {
          writePlan(
            goal.goalDir,
            "# Plan\n\n## alpha\nCreate alpha.txt.\n\nReviewed by the architect.\n",
          );
          ctx.writeOutcome(
            outcomeOf({ summary: "kept the plan", decision: "continue" }),
          );
          return Promise.resolve(fakeTurnResult(req));
        },
        { when: whenTurn({ step: "architect" }) },
      );
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(outcomeOf({ summary: "kept the task" }));
          return Promise.resolve(fakeTurnResult(req));
        },
        { when: whenTurn({ step: "pm" }) },
      );
      harness.script(implementerTurn("alpha.txt"));
      await expectLaunch(1, goal.repo, harness);
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("no gate");
      expect(summary).toContain("requireGates: false");
      expect((await stateOf(goal.goalDir)).tasks.alpha?.status).not.toBe(
        "merged",
      );
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

describe("the gate a launch needs after ingestion", () => {
  registersNoGateOptOut();
  registersDiscoveredGate();
  registersLaunchRefusal();
  registersPendingSteerRefusal();
  registersPlanPresentRefusal();
});
