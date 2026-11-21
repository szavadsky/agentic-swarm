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
  makeGoal,
  outcome,
  simpleTask,
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

async function recordsOf(goal: E2EGoal) {
  return createFolderStore(goal.goalDir, undefined, {}).listRecords();
}

/** The boundary's steer turn: route the pending steer to the architect. */
function routesSteerToArchitect(harness: FakeHarness, steer: string): void {
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({
        summary: `${steer} goes to the architect`,
        steerRoutes: [{ steer, route: "architect" }],
      }),
    );
    return fakeTurnResult(req);
  });
}

/** Asserts the pending steer bypassed front and implement for the architect. */
function expectSteeredToArchitect(
  goal: ReturnType<typeof makeGoal>,
  records: Awaited<ReturnType<typeof recordsOf>>,
  harness: FakeHarness,
  inbox: string,
): void {
  expect(records.filter((r) => r.step === "front")).toEqual([]);
  expect(records.filter((r) => r.step === "architect")).toHaveLength(1);
  expect(records.filter((r) => r.step === "implement")).toEqual([]);
  expect(fs.existsSync(path.join(inbox, "s1.md"))).toBe(false);
  expect(
    fs.readFileSync(path.join(goal.goalDir, "mailbox/processed/s1.md"), "utf8"),
  ).toContain("Keep the API stable");
  expect(
    fs.readFileSync(
      path.join(goal.goalDir, "mailbox/outbox/steer-s1.md"),
      "utf8",
    ),
  ).toContain("the API stays stable");
  expect(harness.calls).toHaveLength(2);
}

function registerFrontLadderPart11(): void {
  it("routes a pending steer to the architect boundary instead of dispatching a front class", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      writeClass(goal, "class: trivial\nslug: tiny\n");
      writeTask(
        goal.goalDir,
        simpleTask("tiny", "tiny.txt", { flow: "just-implement" }),
      );
      const inbox = path.join(goal.goalDir, "mailbox/inbox");
      fs.mkdirSync(inbox, { recursive: true });
      fs.writeFileSync(
        path.join(inbox, "s1.md"),
        "Keep the API stable.\n",
        "utf8",
      );

      const harness = new FakeHarness({ id: "fake" });
      routesSteerToArchitect(harness, "s1");
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("You are the architect");
        expect(req.prompt).toContain(
          "- s1 (mailbox/inbox/s1.md): Keep the API stable.",
        );
        ctx.writeOutcome(
          outcome({
            summary: "answered the steer",
            decision: "done",
            forward: ["steer s1: the API stays stable"],
          }),
        );
        return fakeTurnResult(req);
      });

      await expectLaunch(0, goal.repo, harness, 3);

      const records = await recordsOf(goal);
      expectSteeredToArchitect(goal, records, harness, inbox);
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

function registerFrontLadderPart12(): void {
  it("stops a front-classified goal blocked when its task parks, without an architect turn", async () => {
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

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "architect")).toEqual([]);
      // One PM turn ran: the stall turn that left the park for the boundary.
      expect(records.filter((r) => r.step === "pm")).toHaveLength(1);
      expect(records.filter((r) => r.step === "stall-routes")).toHaveLength(1);
      expect(records.some((r) => r.slug === "tiny" && r.step === "park")).toBe(
        true,
      );
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("status: stopped-with-debt");
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

function registerFrontLadderPart13(): void {
  it("stops the launch blocked when the front's outcome is blocked", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({
            status: "blocked",
            summary: "the intent names no deliverable",
          }),
        );
        return fakeTurnResult(req);
      });

      await expectLaunch(2, goal.repo, harness, 3);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "architect")).toEqual([]);
      expect(records.filter((r) => r.step === "pm")).toEqual([]);
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("status: blocked-by-user");
      expect(summary).toContain("the intent names no deliverable");
      expect(harness.calls).toHaveLength(1);
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

function registerFrontLadderPart14(): void {
  it("ends the launch as infra when the front turn produces no outcome", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) =>
        fakeTurnResult(req, { stop: { kind: "infra", cause: "auth" } }),
      );

      await expectLaunch(1, goal.repo, harness, 3);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "front")).toHaveLength(1);
      expect(records.filter((r) => r.step === "architect")).toEqual([]);
      expect(records.filter((r) => r.step === "pm")).toEqual([]);
      expect(fs.existsSync(path.join(goal.goalDir, "class.yaml"))).toBe(false);
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("status: stopped-with-debt");
      expect(summary).toContain("front turn ended the launch as infra");
      expect(harness.calls).toHaveLength(1);
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

function registerFrontLadderPart15(): void {
  it("ends the launch as infra when the front's task file fails tasks.ts validation", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        writeClass(goal, "class: task\nslug: bad\n");
        writePack(goal);
        writeTask(
          goal.goalDir,
          simpleTask("bad", "bad.txt", { deps: ["ghost"] }),
        );
        ctx.writeOutcome(outcome({ summary: "classified task" }));
        return fakeTurnResult(req);
      });

      await expectLaunch(1, goal.repo, harness, 3);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "front")).toHaveLength(1);
      expect(records.filter((r) => r.step === "implement")).toEqual([]);
      expect(records.filter((r) => r.step === "architect")).toEqual([]);
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain('depends on missing task "ghost"');
      expect(harness.calls).toHaveLength(1);
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

function registerFrontLadderPart16(): void {
  it("ends the launch as infra when a trivial/task front writes more than one task", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        writeClass(goal, "class: task\nslug: one\n");
        writePack(goal);
        writeTask(goal.goalDir, simpleTask("one", "one.txt"));
        writeTask(goal.goalDir, simpleTask("two", "two.txt"));
        ctx.writeOutcome(outcome({ summary: "classified task" }));
        return fakeTurnResult(req);
      });

      await expectLaunch(1, goal.repo, harness, 3);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "implement")).toEqual([]);
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("needs exactly one task file, found 2");
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

function registerFrontLadderPart17(): void {
  it("does not default a missing class.yaml to bigger", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("You are the front");
        ctx.writeOutcome(
          outcome({ summary: "classified without a class file" }),
        );
        return fakeTurnResult(req);
      });

      await expectLaunch(1, goal.repo, harness, 3);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "architect")).toEqual([]);
      expect(records.filter((r) => r.step === "pm")).toEqual([]);
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain("front turn ended the launch as infra");
      expect(summary).toContain("wrote no class.yaml");
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

function registerFrontLadderPart18(): void {
  it("ends the launch as infra when a front-classified task has no pack", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        writeClass(goal, "class: task\nslug: nopack\n");
        writeTask(goal.goalDir, simpleTask("nopack", "nopack.txt"));
        ctx.writeOutcome(outcome({ summary: "classified task" }));
        return fakeTurnResult(req);
      });

      await expectLaunch(1, goal.repo, harness, 3);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "implement")).toEqual([]);
      const summary = fs.readFileSync(
        path.join(goal.goalDir, "iterations/1/summary.md"),
        "utf8",
      );
      expect(summary).toContain(
        "wrote no context pack at iterations/1/context-pack.md",
      );
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

describe("front ladder", () => {
  registerFrontLadderPart11();

  registerFrontLadderPart12();

  registerFrontLadderPart13();

  registerFrontLadderPart14();

  registerFrontLadderPart15();

  registerFrontLadderPart16();

  registerFrontLadderPart17();

  registerFrontLadderPart18();
});
