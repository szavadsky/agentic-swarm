import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
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
  implementerTurn,
  makeGoal,
  outcome,
  stateOf,
  writeTask,
} from "./e2e-helpers.js";

/** A process layer whose own development type runs a one-step flow. */
const CUSTOM_TYPE_PROCESS = [
  "flows:",
  "  feature:",
  "    steps:",
  "      - id: implement",
  "        prompt: implementer",
  "        alias: implementer",
  "taskTypes:",
  "  feature:",
  "    flow: feature",
  "    kind: development",
  "    schema: outcome",
  "    useWhen: a feature-sized change that ships after one implement turn",
  "",
].join("\n");

function customTypeGoal(): E2EGoal {
  return makeGoal({ classYaml: null, processYaml: CUSTOM_TYPE_PROCESS });
}

function writeClass(goal: E2EGoal, text: string): void {
  fs.writeFileSync(path.join(goal.goalDir, "class.yaml"), text, "utf8");
}

function writePack(goal: E2EGoal): void {
  const file = path.join(goal.goalDir, contextPackRelPath(1));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "# Front pack\n\n- the change touches one file\n");
}

/** A front task file that names a configured task type instead of a flow. */
function typedTask(slug: string, file: string, type: string): string {
  return [
    "---",
    `slug: ${slug}`,
    `title: Create ${file}`,
    `type: ${type}`,
    "deps: []",
    "source: front",
    "---",
    "",
    `Create ${file}.`,
    "",
    `Done when: ${file} exists.`,
    "",
  ].join("\n");
}

/** The front classifies a task and writes it with the given type. */
function customTypeFront(goal: E2EGoal, type: string): FakeTurnHandler {
  return (req, ctx) => {
    expect(req.prompt).toContain("You are the front");
    writePack(goal);
    writeClass(goal, "class: task\nslug: feat\n");
    writeTask(goal.goalDir, typedTask("feat", "feat.txt", type));
    ctx.writeOutcome(outcome({ summary: "classified task" }));
    return fakeTurnResult(req);
  };
}

async function recordsOf(goal: E2EGoal) {
  return createFolderStore(goal.goalDir, undefined, {}).listRecords();
}

describe("front task type", () => {
  registerCustomTypeDispatch();

  registerWrongKindRepair();

  registerUnknownTypeRepair();

  registerUnknownTypeNotRepaired();
});

function registerCustomTypeDispatch(): void {
  it("dispatches a standalone goal's custom development type", async () => {
    const goal = customTypeGoal();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        // The ask yields the repo's own development type for a task class.
        expect(req.prompt).toContain("`feature` for task");
        return customTypeFront(goal, "feature")(req, ctx);
      });
      harness.script(implementerTurn("feat.txt"));

      await expectLaunch(0, goal.repo, harness, 3);

      const state = await stateOf(goal.goalDir);
      expect(state.goal).toBe("done");
      expect(state.tasks.feat!.status).toBe("merged");
      expect(
        fs.readFileSync(path.join(goal.goalDir, "tasks/feat.md"), "utf8"),
      ).toContain("type: feature");
      const records = await recordsOf(goal);
      expect(
        records.find((r) => r.slug === "feat" && r.step === "implement")
          ?.outcome?.status,
      ).toBe("done");
      // The custom flow has no review step: the type's own flow ran.
      expect(records.filter((r) => r.step === "review")).toEqual([]);
      expect(
        records.some(
          (r) => r.slug === "feat" && r.step === "merge" && r.ok === true,
        ),
      ).toBe(true);
      expect(harness.calls).toHaveLength(2);
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

function registerWrongKindRepair(): void {
  it("asks the front to repair a task type whose flow does not fit the class", async () => {
    const goal = customTypeGoal();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(customTypeFront(goal, "spike"));
      harness.script((req, ctx) => {
        expect(req.prompt).toContain(
          'class "task" needs a configured development type\'s flow',
        );
        writeTask(goal.goalDir, typedTask("feat", "feat.txt", "feature"));
        ctx.writeOutcome(outcome({ summary: "typed the task" }));
        return fakeTurnResult(req);
      });
      harness.script(implementerTurn("feat.txt"));

      await expectLaunch(0, goal.repo, harness, 3);

      expect((await stateOf(goal.goalDir)).tasks.feat!.status).toBe("merged");
      expect(harness.calls).toHaveLength(3);
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

function registerUnknownTypeRepair(): void {
  it("asks the front to repair a task naming an unconfigured type", async () => {
    const goal = customTypeGoal();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(customTypeFront(goal, "ghost"));
      harness.script((req, ctx) => {
        // The repair resumes the front's session and names the bad type.
        expect(req.session).toBeDefined();
        expect(req.prompt).toContain(
          "did not deliver its class, task, and pack",
        );
        expect(req.prompt).toContain('type "ghost" is not configured');
        writeTask(goal.goalDir, typedTask("feat", "feat.txt", "feature"));
        ctx.writeOutcome(outcome({ summary: "typed the task" }));
        return fakeTurnResult(req);
      });
      harness.script(implementerTurn("feat.txt"));

      await expectLaunch(0, goal.repo, harness, 3);

      const records = await recordsOf(goal);
      const front = records.find((r) => r.step === "front");
      expect(front?.asks).toEqual(["outcome"]);
      expect(front?.repairFindings).toEqual([
        'task "feat" has type "ghost": type "ghost" is not configured',
      ]);
      expect(front?.outcome?.status).toBe("done");
      expect((await stateOf(goal.goalDir)).tasks.feat!.status).toBe("merged");
      expect(harness.calls).toHaveLength(3);
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

function registerUnknownTypeNotRepaired(): void {
  it("ends the launch as infra when the front never corrects the unknown type", async () => {
    const goal = customTypeGoal();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(customTypeFront(goal, "ghost"));
      harness.script((req, ctx) => {
        expect(req.prompt).toContain('type "ghost" is not configured');
        ctx.writeOutcome(outcome({ summary: "classified task" }));
        return fakeTurnResult(req);
      });

      await expectLaunch(1, goal.repo, harness, 3);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "implement")).toEqual([]);
      expect(records.find((r) => r.step === "front")?.outcome?.status).toBe(
        "failed",
      );
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain('type "ghost" is not configured');
      expect(harness.calls).toHaveLength(2);
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}
