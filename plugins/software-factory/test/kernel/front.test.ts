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
  implementerTurn,
  makeGoal,
  outcome,
  scriptDigest,
  simpleTask,
  stateOf,
  writePlan,
  writeTask,
} from "./e2e-helpers.js";

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
  return createFolderStore(goal.goalDir).listRecords();
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

describe("front ladder", () => {
  it("classifies a trivial goal, merges one just-implement task, and never reaches architect or PM", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(trivialFront(goal, "tiny"));
      harness.script((req, ctx) => {
        const taskPath = /- task: `([^`]+)`/.exec(req.prompt)?.[1];
        expect(taskPath).toBeDefined();
        expect(fs.readFileSync(taskPath!, "utf8")).toContain(
          "flow: just-implement",
        );
        // The front ran in the goal checkout; the task runs in its own
        // worktree, so the turn starts de novo with the pack as a prompt
        // variable.
        expect(req.session).toBeUndefined();
        expect(req.prompt).toContain(
          `- front pack: \`${path.join(goal.goalDir, contextPackRelPath(1))}\``,
        );
        expect(
          fs.readFileSync(
            path.join(goal.goalDir, contextPackRelPath(1)),
            "utf8",
          ),
        ).toContain("one file");
        fs.writeFileSync(path.join(req.cwd!, "tiny.txt"), "tiny\n", "utf8");
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
      const implement = records.find(
        (r) => r.slug === "tiny" && r.step === "implement",
      );
      // The ladder's "same agent": the fallback front alias is the implement target.
      expect(implement?.alias).toBe(front?.alias);
      expect(implement?.model?.id).toBe(front?.model?.id);
      expect(records.filter((r) => r.step === "architect")).toEqual([]);
      expect(records.filter((r) => r.step === "pm")).toEqual([]);
      expect(records.filter((r) => r.step === "review")).toEqual([]);
      expect(
        records.some((r) => r.slug === "tiny" && r.step === "checks"),
      ).toBe(true);
      expect(
        records.some(
          (r) => r.slug === "tiny" && r.step === "merge" && r.ok === true,
        ),
      ).toBe(true);
      expect(harness.calls).toHaveLength(2);
      expect(
        fs.readFileSync(path.join(goal.goalDir, "class.yaml"), "utf8"),
      ).toContain("class: trivial");
      expect(
        fs.readFileSync(
          path.join(goal.goalDir, "iterations/1/summary.md"),
          "utf8",
        ),
      ).toContain("status: goal-met");
    } finally {
      cleanup(goal);
    }
  }, 90_000);

  it("runs a trivial task's implement turn on the front's target, de novo, with the pack variable", async () => {
    const goal = makeGoal({
      classYaml: null,
      runYaml: [
        "aliases:",
        "  front: { harness: fake, model: fake-front }",
        "  architect: { harness: fake, model: fake-architect }",
        "  pm: { harness: fake, model: fake-pm }",
        "  implementer: { harness: fake, model: fake-impl }",
        "  reviewer: { harness: fake, model: fake-review }",
        "  digest: { harness: fake, model: fake-digest }",
        "limits: { iterations: 1, concurrency: 1 }",
        "",
      ].join("\n"),
    });
    try {
      const packPath = path.join(goal.goalDir, contextPackRelPath(1));
      const harness = new FakeHarness({ id: "fake" });
      harness.script(trivialFront(goal, "tiny"));
      harness.script((req, ctx) => {
        // The front ran in the goal checkout; its session is cwd-bound there,
        // so the task worktree starts de novo and reads the pack by variable.
        expect(req.session).toBeUndefined();
        expect(req.prompt).toContain(`- front pack: \`${packPath}\``);
        expect(req.model.id).toBe("fake-front");
        fs.writeFileSync(path.join(req.cwd!, "tiny.txt"), "tiny\n", "utf8");
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
      expect(implement?.session?.id).not.toBe(front?.session?.id);
      expect(
        records.some(
          (r) => r.slug === "tiny" && r.step === "merge" && r.ok === true,
        ),
      ).toBe(true);
    } finally {
      cleanup(goal);
    }
  }, 90_000);

  it("derives a landed front goal as done and prints it in the status line", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(trivialFront(goal, "tiny"));
      harness.script(implementerTurn("tiny.txt"));

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
      const harness = new FakeHarness({ id: "fake" });
      harness.script(trivialFront(goal, "tiny"));
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ status: "blocked", summary: "missing an input" }),
        );
        return fakeTurnResult(req);
      });

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
      // The front's blocked stop stays on record; the architect's later
      // decision is what derives the goal.
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
    } finally {
      cleanup(goal);
    }
  }, 90_000);

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
      expect(harness.calls).toHaveLength(3);
    } finally {
      cleanup(goal);
    }
  }, 90_000);

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
      expect(harness.calls).toHaveLength(2);
    } finally {
      cleanup(goal);
    }
  }, 90_000);

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
      expect(harness.calls).toHaveLength(1);
    } finally {
      cleanup(goal);
    }
  }, 90_000);

  it("skips the front turn when class.yaml already exists and dispatches a trivial class", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      writeClass(goal, "class: trivial\nslug: tiny\n");
      writeTask(
        goal.goalDir,
        simpleTask("tiny", "tiny.txt", { flow: "just-implement" }),
      );
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "tiny.txt"), "tiny\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "tiny.txt created" }));
        return fakeTurnResult(req);
      });

      await expectLaunch(0, goal.repo, harness, 3);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "front")).toEqual([]);
      expect(records.filter((r) => r.step === "architect")).toEqual([]);
      expect(
        records.some(
          (r) => r.slug === "tiny" && r.step === "merge" && r.ok === true,
        ),
      ).toBe(true);
      expect(harness.calls).toHaveLength(1);
    } finally {
      cleanup(goal);
    }
  }, 90_000);

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
      expect(records.filter((r) => r.step === "front")).toEqual([]);
      expect(records.filter((r) => r.step === "architect")).toHaveLength(1);
      expect(records.filter((r) => r.step === "implement")).toEqual([]);
      expect(fs.existsSync(path.join(inbox, "s1.md"))).toBe(false);
      expect(
        fs.readFileSync(
          path.join(goal.goalDir, "mailbox/processed/s1.md"),
          "utf8",
        ),
      ).toContain("Keep the API stable");
      expect(
        fs.readFileSync(
          path.join(goal.goalDir, "mailbox/outbox/steer-s1.md"),
          "utf8",
        ),
      ).toContain("the API stays stable");
      expect(harness.calls).toHaveLength(1);
    } finally {
      cleanup(goal);
    }
  }, 90_000);

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

      await expectLaunch(2, goal.repo, harness, 3);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "architect")).toEqual([]);
      expect(records.filter((r) => r.step === "pm")).toEqual([]);
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
});
