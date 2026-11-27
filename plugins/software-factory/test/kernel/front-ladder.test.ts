import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
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
  simpleTask,
  stateOf,
  writePlan,
  writeTask,
} from "./e2e-helpers.js";
import { scriptStallLeave } from "./s2-helpers.js";
import { workCalls } from "./fake-defaults.js";
import { causeText } from "./helpers.js";

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

function taskFront(goal: E2EGoal, slug: string): FakeTurnHandler {
  return (req, ctx) => {
    expect(req.prompt).toContain("You are the front");
    writePack(goal);
    writeClass(goal, `class: task\nslug: ${slug}\n`);
    writeTask(
      goal.goalDir,
      simpleTask(slug, `${slug}.txt`, { body: `Create ${slug}.txt.` }),
    );
    ctx.writeOutcome(outcome({ summary: "classified task" }));
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

function registerFrontLadderPart3(): void {
  it("does not derive the goal status from class.yaml alone", async () => {
    const goal = makeGoal({ classYaml: "class: trivial\nslug: tiny\n" });
    try {
      writeTask(
        goal.goalDir,
        simpleTask("tiny", "tiny.txt", { flow: "just-implement" }),
      );

      expect((await stateOf(goal.goalDir)).goal).toBe("active");
      expect(await statusLine(goal)).toContain("goal demo: active");
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

function registerFrontLadderPart4(): void {
  it("classifies a task goal, merges one implement-review task, and never reaches architect or PM", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(taskFront(goal, "alpha"));
      harness.script((req, ctx) => {
        const taskPath = /- task: `([^`]+)`/.exec(req.prompt)?.[1];
        expect(taskPath).toBeDefined();
        const task = fs.readFileSync(taskPath!, "utf8");
        expect(task).toContain("flow: implement-review");
        expect(req.prompt).toContain(
          `- front pack: \`${path.join(goal.goalDir, contextPackRelPath(1))}\``,
        );
        expect(req.session).toBeUndefined();
        fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "alpha.txt created" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      await expectLaunch(0, goal.repo, harness, 3);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "front")).toHaveLength(1);
      expect(records.filter((r) => r.step === "architect")).toEqual([]);
      expect(records.filter((r) => r.step === "pm")).toEqual([]);
      const implement = records.find(
        (r) => r.slug === "alpha" && r.step === "implement",
      );
      const review = records.find(
        (r) => r.slug === "alpha" && r.step === "review",
      );
      // A task-class goal keeps the implementer alias; its review stays the reviewer's.
      expect(implement?.alias).toBe("implementer");
      expect(implement?.model?.id).toBe("fake-impl");
      expect(review?.alias).toBe("reviewer");
      expect(
        records.some(
          (r) => r.slug === "alpha" && r.step === "merge" && r.ok === true,
        ),
      ).toBe(true);
      expect(workCalls(harness)).toHaveLength(4);
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

function registerFrontLadderPart5(): void {
  it("resumes a task-class fix turn on the implementer alias with the pack variable", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      const packPath = path.join(goal.goalDir, contextPackRelPath(1));
      let resumedSession: string | undefined;
      const harness = new FakeHarness({ id: "fake" });
      harness.script(taskFront(goal, "alpha"));
      harness.script((req, ctx) => {
        expect(req.session).toBeUndefined();
        expect(req.prompt).toContain(`- front pack: \`${packPath}\``);
        fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "alpha v1" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "needs a change", verdict: "changes" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        resumedSession = req.session?.id;
        expect(req.prompt).toContain(`- front pack: \`${packPath}\``);
        fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "v2\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "alpha v2" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      await expectLaunch(0, goal.repo, harness, 3);

      const implement = (await recordsOf(goal)).filter(
        (r) => r.slug === "alpha" && r.step === "implement",
      );
      expect(implement).toHaveLength(2);
      expect(resumedSession).toBeDefined();
      expect(implement[1]?.session?.id).toBe(implement[0]?.session?.id);
      expect(implement.map((r) => r.alias)).toEqual([
        "implementer",
        "implementer",
      ]);
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

function registerFrontLadderPart6(): void {
  it("runs the architect boundary with the pack the front prepared for a bigger goal", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      const packRel = contextPackRelPath(1);
      const packPath = path.join(goal.goalDir, packRel);
      const frontPack = "# FRONT PACK\n\n- the goal touches only src/\n";
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("You are the front");
        writeClass(goal, "class: bigger\n");
        fs.mkdirSync(path.dirname(packPath), { recursive: true });
        fs.writeFileSync(packPath, frontPack, "utf8");
        ctx.writeOutcome(outcome({ summary: "classified bigger" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        // The bigger goal's unannotated intent gets one triage turn before
        // the architect; the pack itself is the front's.
        expect(req.prompt).toContain("## Annotate");
        fs.writeFileSync(
          path.join(goal.goalDir, "intent.md"),
          "# Goal\n\n[[Demo]] Build the demo.\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "annotated the intent" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        expect(req.prompt).toContain(`context pack: \`${packPath}\``);
        expect(fs.readFileSync(packPath, "utf8")).toBe(frontPack);
        writePlan(goal.goalDir, "# Plan\n\n## alpha\nCreate alpha.\n");
        ctx.writeOutcome(
          outcome({ summary: "planned alpha", decision: "done" }),
        );
        return fakeTurnResult(req);
      });

      await expectLaunch(0, goal.repo, harness, 3);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "front")).toHaveLength(1);
      const architect = records.find((r) => r.step === "architect");
      expect(architect).toBeDefined();
      expect(fs.readFileSync(packPath, "utf8")).toBe(frontPack);
      expect(architect?.packBytes).toBe(Buffer.byteLength(frontPack, "utf8"));
      expect(records.filter((r) => r.step === "pm")).toEqual([]);
      expect(workCalls(harness)).toHaveLength(3);
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

function registerFrontLadderPart7(): void {
  it("skips the front turn when the goal already has a plan", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      writePlan(goal.goalDir, "# Plan\n\n## alpha\nCreate alpha.\n");
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("You are the architect");
        ctx.writeOutcome(
          outcome({ summary: "plan already present", decision: "done" }),
        );
        return fakeTurnResult(req);
      });

      await expectLaunch(0, goal.repo, harness);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "front")).toEqual([]);
      expect(records.filter((r) => r.step === "architect")).toHaveLength(1);
      expect(harness.calls).toHaveLength(2);
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

function registerFrontLadderPart8(): void {
  it("parks a trivial class without a front session instead of implementing de novo", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      writeClass(goal, "class: trivial\nslug: tiny\n");
      writeTask(
        goal.goalDir,
        simpleTask("tiny", "tiny.txt", { flow: "just-implement" }),
      );
      // No scripted turns: the front is skipped for an existing class, and the
      // implement turn must never run without a front session to resume.
      const harness = new FakeHarness({ id: "fake" });
      scriptStallLeave(harness, ["tiny"]);

      await expectLaunch(2, goal.repo, harness, 3);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "front")).toEqual([]);
      expect(records.filter((r) => r.step === "architect")).toEqual([]);
      expect(
        records.filter((r) => r.slug === "tiny" && r.step === "implement"),
      ).toEqual([]);
      const parks = records.filter(
        (r) => r.slug === "tiny" && r.step === "park",
      );
      expect(parks).toHaveLength(1);
      expect(causeText(parks[0]?.cause)).toContain(
        "no front session to resume",
      );
      expect(
        records.some(
          (r) => r.slug === "tiny" && r.step === "merge" && r.ok === true,
        ),
      ).toBe(false);
      expect(workCalls(harness)).toHaveLength(1);
      expect((await stateOf(goal.goalDir)).goal).toBe("blocked");
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

function registerFrontLadderPart9(): void {
  it("stops a trivial goal with a recorded cause when the harness cannot resume", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      const harness = new FakeHarness({ id: "fake", caps: { resume: false } });
      harness.script(trivialFront(goal, "tiny"));
      scriptStallLeave(harness, ["tiny"]);
      // No implement script: the follow-up turn must never run de novo when
      // the probe reports no resume capability.

      await expectLaunch(2, goal.repo, harness, 3);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "front")).toHaveLength(1);
      expect(
        records.filter((r) => r.slug === "tiny" && r.step === "implement"),
      ).toEqual([]);
      const parks = records.filter(
        (r) => r.slug === "tiny" && r.step === "park",
      );
      expect(parks).toHaveLength(1);
      expect(causeText(parks[0]?.cause)).toContain("cannot resume sessions");
      expect(
        records.some(
          (r) => r.slug === "tiny" && r.step === "merge" && r.ok === true,
        ),
      ).toBe(false);
      expect(workCalls(harness)).toHaveLength(2);
      expect((await stateOf(goal.goalDir)).goal).toBe("blocked");
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

function registerFrontLadderPart10(): void {
  it("parks a trivial turn that writes the goal checkout as a containment incident", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(trivialFront(goal, "tiny"));
      harness.script((req, ctx) => {
        expect(req.session).toBeDefined();
        // A relative write lands in the session cwd — the goal checkout —
        // not in the absolute worktree the prompt names.
        fs.writeFileSync(path.join(req.cwd!, "oops.txt"), "oops\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "wrote to the wrong tree" }));
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["tiny"]);

      await expectLaunch(2, goal.repo, harness, 3);

      const records = await recordsOf(goal);
      const parks = records.filter(
        (r) => r.slug === "tiny" && r.step === "park",
      );
      expect(parks).toHaveLength(1);
      expect(causeText(parks[0]?.cause)).toContain("containment:");
      expect(
        records.some(
          (r) => r.slug === "tiny" && r.step === "merge" && r.ok === true,
        ),
      ).toBe(false);
      expect((await stateOf(goal.goalDir)).goal).toBe("blocked");
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

describe("front ladder", () => {
  registerFrontLadderPart3();

  registerFrontLadderPart4();

  registerFrontLadderPart5();

  registerFrontLadderPart6();

  registerFrontLadderPart7();

  registerFrontLadderPart8();

  registerFrontLadderPart9();

  registerFrontLadderPart10();
});
