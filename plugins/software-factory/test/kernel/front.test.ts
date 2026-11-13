import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult, type FakeTurnHandler } from "../../src/harness/fake/index.js";
import type { SessionRef } from "../../src/harness/types.js";
import { contextPackRelPath } from "../../src/kernel/context-pack.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { cleanup, launch, makeGoal, outcome, simpleTask, writePlan, writeTask, type E2EGoal } from "./e2e-helpers.js";

function writeClass(goal: E2EGoal, text: string): void {
  fs.writeFileSync(path.join(goal.goalDir, "class.yaml"), text, "utf8");
}

/** A front-authored pack at the path the launch hands a front-run class. */
function writePack(goal: E2EGoal, text = "# Front pack\n\n- the change touches one file\n"): string {
  const file = path.join(goal.goalDir, contextPackRelPath(1));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
  return file;
}

function trivialFront(goal: E2EGoal, slug: string): FakeTurnHandler {
  return (req, ctx) => {
    expect(req.prompt).toContain("You are the front");
    const pack = writePack(goal);
    writeClass(goal, `class: trivial\nslug: ${slug}\n`);
    writeTask(
      goal.goalDir,
      simpleTask(slug, `${slug}.txt`, {
        flow: "just-implement",
        body: `Create ${slug}.txt.\n\nFront pack: ${pack}`,
      })
    );
    ctx.writeOutcome(outcome({ summary: "classified trivial" }));
    return fakeTurnResult(req);
  };
}

function taskFront(goal: E2EGoal, slug: string): FakeTurnHandler {
  return (req, ctx) => {
    expect(req.prompt).toContain("You are the front");
    const pack = writePack(goal);
    writeClass(goal, `class: task\nslug: ${slug}\n`);
    writeTask(
      goal.goalDir,
      simpleTask(slug, `${slug}.txt`, { body: `Create ${slug}.txt.\n\nFront pack: ${pack}` })
    );
    ctx.writeOutcome(outcome({ summary: "classified task" }));
    return fakeTurnResult(req);
  };
}

async function recordsOf(goal: E2EGoal) {
  return createFolderStore(goal.goalDir).listRecords();
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
        expect(fs.readFileSync(taskPath!, "utf8")).toContain("flow: just-implement");
        // The front ran in the goal checkout; the task runs in its own
        // worktree, so the session is not resumable and the turn starts fresh
        // with the pack the front wrote.
        expect(req.session).toBeUndefined();
        const task = fs.readFileSync(taskPath!, "utf8");
        expect(task).toContain(`Front pack: ${path.join(goal.goalDir, contextPackRelPath(1))}`);
        expect(fs.readFileSync(path.join(goal.goalDir, contextPackRelPath(1)), "utf8")).toContain(
          "one file"
        );
        fs.writeFileSync(path.join(req.cwd!, "tiny.txt"), "tiny\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "tiny.txt created" }));
        return fakeTurnResult(req);
      });

      expect(await launch(goal.repo, harness, 3)).toBe(0);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "front")).toHaveLength(1);
      const front = records.find((r) => r.step === "front");
      expect(front?.alias).toBe("pm");
      expect(front?.model?.id).toBe("fake-pm");
      expect(front?.session).toBeDefined();
      expect(records.filter((r) => r.step === "architect")).toEqual([]);
      expect(records.filter((r) => r.step === "pm")).toEqual([]);
      expect(records.filter((r) => r.step === "review")).toEqual([]);
      expect(records.some((r) => r.slug === "tiny" && r.step === "checks")).toBe(true);
      expect(records.some((r) => r.slug === "tiny" && r.step === "merge" && r.ok === true)).toBe(true);
      expect(harness.calls).toHaveLength(2);
      expect(fs.readFileSync(path.join(goal.goalDir, "class.yaml"), "utf8")).toContain("class: trivial");
      expect(fs.readFileSync(path.join(goal.goalDir, "iterations/1/summary.md"), "utf8")).toContain(
        "status: goal-met"
      );
    } finally {
      cleanup(goal);
    }
  }, 90_000);

  it("resumes the front's session for a trivial task's first implement turn when it is bound to that worktree", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      const worktree = path.resolve(
        goal.repo.dir,
        "..",
        ".factory-worktrees",
        path.basename(goal.repo.dir),
        `${path.basename(goal.goalDir)}-tasks`,
        "tiny"
      );
      const frontSession: SessionRef = {
        harness: "fake",
        id: "front-session",
        cwd: worktree,
        model: { id: "fake-pm" },
        lastRequestStartedAt: new Date().toISOString(),
        retentionTier: "short",
        compacted: false,
      };
      await createFolderStore(goal.goalDir).appendRecord(
        { iteration: 0, step: "front", round: 1, actor: "agent", alias: "pm", model: { id: "fake-pm" } },
        { session: frontSession }
      );
      writeClass(goal, "class: trivial\nslug: tiny\n");
      writeTask(goal.goalDir, simpleTask("tiny", "tiny.txt", { flow: "just-implement" }));

      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        expect(req.session?.id).toBe("front-session");
        fs.writeFileSync(path.join(req.cwd!, "tiny.txt"), "tiny\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "tiny.txt created" }));
        return fakeTurnResult(req);
      });

      expect(await launch(goal.repo, harness, 3)).toBe(0);

      const records = await recordsOf(goal);
      const implement = records.find((r) => r.slug === "tiny" && r.step === "implement");
      expect(implement?.session?.id).toBe("front-session");
      expect(records.some((r) => r.slug === "tiny" && r.step === "merge" && r.ok === true)).toBe(true);
    } finally {
      cleanup(goal);
    }
  }, 90_000);

  it("starts the trivial implement turn de novo when the front's harness cannot resume", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      const worktree = path.resolve(
        goal.repo.dir,
        "..",
        ".factory-worktrees",
        path.basename(goal.repo.dir),
        `${path.basename(goal.goalDir)}-tasks`,
        "tiny"
      );
      // Same worktree, but the recorded session belongs to another harness: a
      // session is only portable to the harness that recorded it.
      await createFolderStore(goal.goalDir).appendRecord(
        { iteration: 0, step: "front", round: 1, actor: "agent", alias: "pm", model: { id: "fake-pm" } },
        {
          session: {
            harness: "omp",
            id: "front-omp",
            cwd: worktree,
            model: { id: "fake-pm" },
            lastRequestStartedAt: new Date().toISOString(),
            retentionTier: "short",
            compacted: false,
          },
        }
      );
      writeClass(goal, "class: trivial\nslug: tiny\n");
      writeTask(goal.goalDir, simpleTask("tiny", "tiny.txt", { flow: "just-implement" }));

      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        expect(req.session).toBeUndefined();
        fs.writeFileSync(path.join(req.cwd!, "tiny.txt"), "tiny\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "tiny.txt created" }));
        return fakeTurnResult(req);
      });

      expect(await launch(goal.repo, harness, 3)).toBe(0);

      const implement = (await recordsOf(goal)).find(
        (r) => r.slug === "tiny" && r.step === "implement"
      );
      expect(implement?.session?.id).not.toBe("front-omp");
      expect(implement?.session?.harness).toBe("fake");
    } finally {
      cleanup(goal);
    }
  }, 90_000);

  it("uses the front run alias when the run config names one", async () => {
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
      const harness = new FakeHarness({ id: "fake" });
      harness.script(trivialFront(goal, "tiny"));
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "tiny.txt"), "tiny\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "tiny.txt created" }));
        return fakeTurnResult(req);
      });

      expect(await launch(goal.repo, harness, 3)).toBe(0);

      const front = (await recordsOf(goal)).find((r) => r.step === "front");
      expect(front?.alias).toBe("front");
      expect(front?.model?.id).toBe("fake-front");
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
        expect(task).toContain(`Front pack: ${path.join(goal.goalDir, contextPackRelPath(1))}`);
        expect(req.session).toBeUndefined();
        fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "alpha.txt created" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      expect(await launch(goal.repo, harness, 3)).toBe(0);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "front")).toHaveLength(1);
      expect(records.filter((r) => r.step === "architect")).toEqual([]);
      expect(records.filter((r) => r.step === "pm")).toEqual([]);
      expect(records.some((r) => r.slug === "alpha" && r.step === "review")).toBe(true);
      expect(records.some((r) => r.slug === "alpha" && r.step === "merge" && r.ok === true)).toBe(true);
      expect(harness.calls).toHaveLength(3);
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
        ctx.writeOutcome(outcome({ summary: "planned alpha", decision: "done" }));
        return fakeTurnResult(req);
      });

      expect(await launch(goal.repo, harness, 3)).toBe(0);

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
        ctx.writeOutcome(outcome({ summary: "plan already present", decision: "done" }));
        return fakeTurnResult(req);
      });

      expect(await launch(goal.repo, harness)).toBe(0);

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
      writeTask(goal.goalDir, simpleTask("tiny", "tiny.txt", { flow: "just-implement" }));
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "tiny.txt"), "tiny\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "tiny.txt created" }));
        return fakeTurnResult(req);
      });

      expect(await launch(goal.repo, harness, 3)).toBe(0);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "front")).toEqual([]);
      expect(records.filter((r) => r.step === "architect")).toEqual([]);
      expect(records.some((r) => r.slug === "tiny" && r.step === "merge" && r.ok === true)).toBe(true);
      expect(harness.calls).toHaveLength(1);
    } finally {
      cleanup(goal);
    }
  }, 90_000);

  it("routes a pending steer to the architect boundary instead of dispatching a front class", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      writeClass(goal, "class: trivial\nslug: tiny\n");
      writeTask(goal.goalDir, simpleTask("tiny", "tiny.txt", { flow: "just-implement" }));
      const inbox = path.join(goal.goalDir, "mailbox/inbox");
      fs.mkdirSync(inbox, { recursive: true });
      fs.writeFileSync(path.join(inbox, "s1.md"), "Keep the API stable.\n", "utf8");

      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("You are the architect");
        expect(req.prompt).toContain("- s1 (mailbox/inbox/s1.md): Keep the API stable.");
        ctx.writeOutcome(
          outcome({
            summary: "answered the steer",
            decision: "done",
            forward: ["steer s1: the API stays stable"],
          })
        );
        return fakeTurnResult(req);
      });

      expect(await launch(goal.repo, harness, 3)).toBe(0);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "front")).toEqual([]);
      expect(records.filter((r) => r.step === "architect")).toHaveLength(1);
      expect(records.filter((r) => r.step === "implement")).toEqual([]);
      expect(fs.existsSync(path.join(inbox, "s1.md"))).toBe(false);
      expect(
        fs.readFileSync(path.join(goal.goalDir, "mailbox/processed/s1.md"), "utf8")
      ).toContain("Keep the API stable");
      expect(
        fs.readFileSync(path.join(goal.goalDir, "mailbox/outbox/steer-s1.md"), "utf8")
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
        ctx.writeOutcome(outcome({ status: "blocked", summary: "missing an input" }));
        return fakeTurnResult(req);
      });

      expect(await launch(goal.repo, harness, 3)).toBe(2);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "architect")).toEqual([]);
      expect(records.filter((r) => r.step === "pm")).toEqual([]);
      expect(records.some((r) => r.slug === "tiny" && r.step === "park")).toBe(true);
      const summary = fs.readFileSync(path.join(goal.goalDir, "iterations/1/summary.md"), "utf8");
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
          outcome({ status: "blocked", summary: "the intent names no deliverable" })
        );
        return fakeTurnResult(req);
      });

      expect(await launch(goal.repo, harness, 3)).toBe(2);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "architect")).toEqual([]);
      expect(records.filter((r) => r.step === "pm")).toEqual([]);
      const summary = fs.readFileSync(path.join(goal.goalDir, "iterations/1/summary.md"), "utf8");
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
      harness.script((req) => fakeTurnResult(req, { stop: { kind: "infra", cause: "auth" } }));

      expect(await launch(goal.repo, harness, 3)).toBe(1);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "front")).toHaveLength(1);
      expect(records.filter((r) => r.step === "architect")).toEqual([]);
      expect(records.filter((r) => r.step === "pm")).toEqual([]);
      expect(fs.existsSync(path.join(goal.goalDir, "class.yaml"))).toBe(false);
      const summary = fs.readFileSync(path.join(goal.goalDir, "iterations/1/summary.md"), "utf8");
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
        writeTask(goal.goalDir, simpleTask("bad", "bad.txt", { deps: ["ghost"] }));
        ctx.writeOutcome(outcome({ summary: "classified task" }));
        return fakeTurnResult(req);
      });

      expect(await launch(goal.repo, harness, 3)).toBe(1);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "front")).toHaveLength(1);
      expect(records.filter((r) => r.step === "implement")).toEqual([]);
      expect(records.filter((r) => r.step === "architect")).toEqual([]);
      const summary = fs.readFileSync(path.join(goal.goalDir, "iterations/1/summary.md"), "utf8");
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

      expect(await launch(goal.repo, harness, 3)).toBe(1);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "implement")).toEqual([]);
      const summary = fs.readFileSync(path.join(goal.goalDir, "iterations/1/summary.md"), "utf8");
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
        ctx.writeOutcome(outcome({ summary: "classified without a class file" }));
        return fakeTurnResult(req);
      });

      expect(await launch(goal.repo, harness, 3)).toBe(1);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "architect")).toEqual([]);
      expect(records.filter((r) => r.step === "pm")).toEqual([]);
      const summary = fs.readFileSync(path.join(goal.goalDir, "iterations/1/summary.md"), "utf8");
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

      expect(await launch(goal.repo, harness, 3)).toBe(1);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "implement")).toEqual([]);
      const summary = fs.readFileSync(path.join(goal.goalDir, "iterations/1/summary.md"), "utf8");
      expect(summary).toContain("wrote no context pack at iterations/1/context-pack.md");
    } finally {
      cleanup(goal);
    }
  }, 90_000);

  it("ends the launch as infra when a front task's brief does not name its pack", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        writeClass(goal, "class: trivial\nslug: nopack\n");
        writePack(goal);
        writeTask(goal.goalDir, simpleTask("nopack", "nopack.txt", { flow: "just-implement" }));
        ctx.writeOutcome(outcome({ summary: "classified trivial" }));
        return fakeTurnResult(req);
      });

      expect(await launch(goal.repo, harness, 3)).toBe(1);

      const records = await recordsOf(goal);
      expect(records.filter((r) => r.step === "implement")).toEqual([]);
      const summary = fs.readFileSync(path.join(goal.goalDir, "iterations/1/summary.md"), "utf8");
      expect(summary).toContain('has no "Front pack:');
      expect(summary).toContain("iterations/1/context-pack.md");
    } finally {
      cleanup(goal);
    }
  }, 90_000);
});
