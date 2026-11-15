import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { derive } from "../../src/kernel/derive.js";
import { type DispatchResult, runDispatch } from "../../src/kernel/dispatch.js";
import {
  holdsDir,
  postSteer,
  quarantineDir,
  readHolds,
} from "../../src/kernel/mailbox.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

const PLAN = `# Milestone 1 — files

## alpha
Create alpha.txt.

## beta
Create beta.txt after alpha.

## delta
Create delta.txt.

## gamma
Create gamma.txt.
`;

function writePlan(runtime: KernelRuntime): void {
  fs.writeFileSync(path.join(runtime.store.goalDir, "plan.md"), PLAN, "utf8");
}

/** The delivery guard needs a plan edit behind every architect continue. */
function editPlan(runtime: KernelRuntime): void {
  fs.appendFileSync(
    path.join(runtime.store.goalDir, "plan.md"),
    "\n## architect edit\n",
    "utf8",
  );
}

function writeHold(
  runtime: KernelRuntime,
  steer: string,
  slugs: string[],
  goal = false,
): void {
  const dir = holdsDir(runtime.store);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${steer}.yaml`),
    yaml.stringify({ slugs, goal }),
    "utf8",
  );
}

async function tasks(runtime: KernelRuntime) {
  return derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );
}

function implementer(
  file: string,
  before?: (cwd: string) => Promise<void> | void,
): FakeTurnHandler {
  return async (req, ctx) => {
    await before?.(req.cwd!);
    fs.writeFileSync(path.join(req.cwd!, file), `${file}\n`, "utf8");
    ctx.writeOutcome(outcome({ summary: `${file} implemented` }));
    return fakeTurnResult(req);
  };
}

function approver(summary: string): FakeTurnHandler {
  return (req, ctx) => {
    ctx.writeOutcome(outcome({ summary, verdict: "approve" }));
    return fakeTurnResult(req);
  };
}

describe("mid-run steer holds", () => {
  it("holds unstarted tasks without parking the in-flight one, and still reaches the architect", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(
        runtime,
        task("beta", { scope: ["beta.txt"], deps: ["alpha"] }),
      );
      await writeTask(runtime, task("delta", { scope: ["delta.txt"] }));
      await writeTask(runtime, task("gamma", { scope: ["gamma.txt"] }));

      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(
            runtime.store,
            "s1",
            "Keep alpha unmerged until I answer.\nSecond line with details.",
          );
        }),
      );
      harness.script((req, ctx) => {
        expect(req.prompt).toContain(
          "- s1 (mailbox/inbox/s1.md):\n  Keep alpha unmerged",
        );
        expect(req.prompt).toContain("Second line with details.");
        writeHold(runtime, "s1", ["alpha", "beta", "delta"]);
        ctx.writeOutcome(outcome({ summary: "structured s1" }));
        return fakeTurnResult(req);
      });
      // Alpha already started, so its hold never blocks it mid-flow.
      harness.script(approver("alpha is correct"));
      harness.script(implementer("gamma.txt"));
      harness.script(approver("gamma is correct"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");

      const held = await tasks(runtime);
      expect(held.tasks.alpha!.status).toBe("merged");
      expect(held.tasks.beta!.status).toBe("ready");
      expect(held.tasks.delta!.status).toBe("ready");
      expect(held.tasks.gamma!.status).toBe("merged");

      const records = await runtime.store.listRecords();
      expect(records.filter((r) => r.step === "pm")).toHaveLength(1);
      expect(
        records.find(
          (r) =>
            r.slug === "alpha" && r.actor === "agent" && r.step === "implement",
        )?.outcome?.status,
      ).toBe("done");
      expect(records.some((r) => r.slug === "alpha" && r.step === "park")).toBe(
        false,
      );
      expect(
        records.some((r) => r.slug === "alpha" && r.step === "merge"),
      ).toBe(true);
      expect(
        records.some((r) => r.slug === "beta" && r.actor === "agent"),
      ).toBe(false);
      expect(records.some((r) => r.slug === "delta")).toBe(false);
      const steerTurns = (): number =>
        harness.calls.filter((call) =>
          call.prompt.includes("Second line with details."),
        ).length;
      expect(steerTurns()).toBe(1);
      expect(
        fs.existsSync(path.join(runtime.store.goalDir, "mailbox/inbox/s1.md")),
      ).toBe(true);

      // The steer then takes the boundary path: only the architect answers it.
      harness.script((req, ctx) => {
        expect(req.prompt).toContain(
          "- s1 (mailbox/inbox/s1.md): Keep alpha unmerged until I answer.",
        );
        editPlan(runtime);
        ctx.writeOutcome(
          outcome({
            summary: "answered the steer",
            decision: "continue",
            forward: ["steer s1: hold alpha; I will review the branch"],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
        return fakeTurnResult(req);
      });

      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("continue");
      expect(
        fs.readdirSync(path.join(runtime.store.goalDir, "mailbox/inbox")),
      ).not.toContain("s1.md");
      expect(
        fs.readdirSync(path.join(runtime.store.goalDir, "mailbox/processed")),
      ).toContain("s1.md");
      expect(
        fs.readFileSync(
          path.join(runtime.store.goalDir, "mailbox/outbox/steer-s1.md"),
          "utf8",
        ),
      ).toContain("hold alpha; I will review the branch");

      const after = await tasks(runtime);
      expect(after.tasks.alpha!.status).toBe("merged");
      expect(after.tasks.beta!.status).toBe("ready");
      expect(after.tasks.delta!.status).toBe("ready");
      expect(after.tasks.gamma!.status).toBe("merged");
      // An answered steer's hold file is gone after the boundary.
      expect(fs.existsSync(path.join(holdsDir(runtime.store), "s1.yaml"))).toBe(
        false,
      );
      // The boundary PM turn does not restructure the steer a second time.
      expect(steerTurns()).toBe(1);

      // The hold is gone: the tasks that waited now run.
      harness.script(implementer("beta.txt"));
      harness.script(approver("beta is correct"));
      harness.script(implementer("delta.txt"));
      harness.script(approver("delta is correct"));
      const resumed = await runDispatch(runtime, { iteration: 2 });
      expect(resumed.reason).toBe("boundary");
      expect((await tasks(runtime)).tasks.beta!.status).toBe("merged");
      expect((await tasks(runtime)).tasks.delta!.status).toBe("merged");
      expect(steerTurns()).toBe(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("parks a held in-flight task with the cause it earned, not the steer", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));

      // The step commits nothing, so derive has already decided alpha must
      // park; the steer arrives in that same turn and must not hide the cause.
      harness.script(async (req, ctx) => {
        await postSteer(runtime.store, "s1", "Hold alpha.");
        ctx.writeOutcome(outcome({ summary: "alpha unchanged" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        writeHold(runtime, "s1", ["alpha"]);
        ctx.writeOutcome(outcome({ summary: "held alpha" }));
        return fakeTurnResult(req);
      });

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      const state = await tasks(runtime);
      expect(state.tasks.alpha!.status).toBe("parked");
      expect(state.tasks.alpha!.cause).toBe(
        "empty-diff: implement r1 committed no changes",
      );
      const records = await runtime.store.listRecords();
      expect(
        records.filter((r) => r.slug === "alpha" && r.step === "park"),
      ).toHaveLength(1);
      expect(
        records.find((r) => r.slug === "alpha" && r.step === "park")?.cause,
      ).toBe("empty-diff: implement r1 committed no changes");
      expect(
        records.some((r) => r.slug === "alpha" && r.step === "merge"),
      ).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("does not run a steer PM turn for a steer already present at the boundary", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await postSteer(runtime.store, "s1", "Already seen by the architect.");

      harness.script(implementer("alpha.txt"));
      harness.script(approver("alpha is correct"));

      const dispatched = await runDispatch(runtime, {
        iteration: 1,
        seenSteers: ["s1"],
      });
      expect(dispatched.reason).toBe("boundary");
      expect(harness.calls).toHaveLength(2);
      expect(
        (await runtime.store.listRecords()).filter((r) => r.step === "pm"),
      ).toEqual([]);
      expect((await tasks(runtime)).tasks.alpha!.status).toBe("merged");
      expect(
        fs.existsSync(path.join(runtime.store.goalDir, "mailbox/inbox/s1.md")),
      ).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("a steer holding nothing changes nothing", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("gamma", { scope: ["gamma.txt"] }));

      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(runtime.store, "s1", "No tasks wait.");
        }),
      );
      harness.script((req, ctx) => {
        writeHold(runtime, "s1", []);
        ctx.writeOutcome(outcome({ summary: "structures nothing" }));
        return fakeTurnResult(req);
      });
      harness.script(approver("alpha is correct"));
      harness.script(implementer("gamma.txt"));
      harness.script(approver("gamma is correct"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      const state = await tasks(runtime);
      expect(state.tasks.alpha!.status).toBe("merged");
      expect(state.tasks.gamma!.status).toBe("merged");
      expect(
        (await runtime.store.listRecords()).filter((r) => r.step === "pm"),
      ).toHaveLength(1);
      const hold = yaml.parse(
        fs.readFileSync(path.join(holdsDir(runtime.store), "s1.yaml"), "utf8"),
      );
      expect(hold).toEqual({ slugs: [], goal: false });
      expect(
        fs.existsSync(path.join(runtime.store.goalDir, "mailbox/inbox/s1.md")),
      ).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("a goal hold drains dispatch while started tasks run to the end, never parked", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("gamma", { scope: ["gamma.txt"] }));

      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(runtime.store, "s1", "Stop the goal.");
        }),
      );
      harness.script((req, ctx) => {
        writeHold(runtime, "s1", [], true);
        ctx.writeOutcome(outcome({ summary: "goal held" }));
        return fakeTurnResult(req);
      });
      harness.script(approver("alpha is correct"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("drained");
      expect(dispatched.cause).toBe("steer: s1 goal hold");
      const state = await tasks(runtime);
      expect(state.tasks.alpha!.status).toBe("merged");
      expect(state.tasks.alpha!.park).toBeUndefined();
      expect(state.tasks.gamma!.status).toBe("ready");
      expect(
        (await runtime.store.listRecords()).some((r) => r.slug === "gamma"),
      ).toBe(false);
      expect(
        (await runtime.store.listRecords()).some(
          (r) => r.slug === "alpha" && r.step === "park",
        ),
      ).toBe(false);
      expect(harness.calls).toHaveLength(3);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("charges the steer PM turn to the iteration dollar brake", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: 1, iterationUsd: 5 },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("gamma", { scope: ["gamma.txt"] }));

      harness.script(async (req, ctx) => {
        await postSteer(runtime.store, "s1", "Hold alpha for now.");
        fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
        return fakeTurnResult(req, { usage: { costUsd: 1 } });
      });
      harness.script((req, ctx) => {
        writeHold(runtime, "s1", ["alpha"]);
        ctx.writeOutcome(outcome({ summary: "held alpha" }));
        return fakeTurnResult(req, { usage: { costUsd: 10 } });
      });
      // Alpha started before the brake, so it runs to the end despite its hold.
      harness.script(approver("alpha is correct"));
      // If the PM turn were free, gamma would run and need these.
      harness.script(implementer("gamma.txt"));
      harness.script(approver("gamma is correct"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("drained");
      expect(dispatched.cause).toContain(
        "budget: iteration USD limit $5.0000 reached",
      );
      const state = await tasks(runtime);
      expect(state.tasks.alpha!.status).toBe("merged");
      expect(state.tasks.gamma!.status).toBe("ready");
      expect(
        (await runtime.store.listRecords()).some((r) => r.slug === "gamma"),
      ).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("restores a task file the steer turn edits and records the failed guard", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      const taskFile = path.join(runtime.store.tasksDir, "alpha.md");
      const original = fs.readFileSync(taskFile, "utf8");

      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(
            runtime.store,
            "s1",
            "Structure me; write no task file.",
          );
        }),
      );
      harness.script((req, ctx) => {
        // A malformed file would throw out of the next derive without the guard.
        fs.writeFileSync(taskFile, "# not a task file\n\nbroken: [\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "tried to rewrite alpha" }));
        return fakeTurnResult(req);
      });
      harness.script(approver("alpha is correct"));

      const dispatched = await runDispatch(runtime, {
        iteration: 1,
        seenSteers: [],
      });
      expect(dispatched.reason).toBe("boundary");
      expect(fs.readFileSync(taskFile, "utf8")).toBe(original);
      expect((await tasks(runtime)).tasks.alpha!.status).toBe("merged");

      const records = await runtime.store.listRecords();
      const guard = records.find((record) => record.step === "steer-reconcile");
      expect(guard?.ok).toBe(false);
      expect(guard?.cause).toContain("tasks/alpha.md");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("removes a plan the steer turn creates when none existed", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      const planPath = path.join(runtime.store.goalDir, "plan.md");
      expect(fs.existsSync(planPath)).toBe(false);

      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(runtime.store, "s1", "Structure me; do not plan.");
        }),
      );
      harness.script((req, ctx) => {
        // An empty plan.md would send the next front to the boundary instead of
        // dispatching the tasks that already exist.
        fs.writeFileSync(
          planPath,
          "# Plan\n\n## smuggled\nPM-authored direction.\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "tried to write a plan" }));
        return fakeTurnResult(req);
      });
      harness.script(approver("alpha is correct"));

      const dispatched = await runDispatch(runtime, {
        iteration: 1,
        seenSteers: [],
      });
      expect(dispatched.reason).toBe("boundary");
      expect(fs.existsSync(planPath)).toBe(false);
      expect((await tasks(runtime)).tasks.alpha!.status).toBe("merged");

      const guard = (await runtime.store.listRecords()).find(
        (record) => record.step === "steer-reconcile",
      );
      expect(guard?.ok).toBe(false);
      expect(guard?.cause).toContain("plan.md");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("quarantines a malformed hold the steer turn writes and keeps dispatching", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 2 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));

      // Every turn is bound to its slug and step, so no sleep orders the
      // scripts: whichever turn calls first takes its own handler, and the
      // steer PM turn can never consume a review (or vice versa) under load.
      const implementOnce: FakeTurnHandler = async (req, ctx) => {
        const slug = path.basename(req.cwd!);
        fs.writeFileSync(
          path.join(req.cwd!, `${slug}.txt`),
          `${slug}\n`,
          "utf8",
        );
        if (slug === "alpha")
          await postSteer(runtime.store, "s1", "Structure me.");
        ctx.writeOutcome(outcome({ summary: `${slug} implemented` }));
        return fakeTurnResult(req);
      };
      harness.script(implementOnce, {
        when: whenTurn({ slug: "alpha", step: "implement" }),
      });
      harness.script(implementOnce, {
        when: whenTurn({ slug: "beta", step: "implement" }),
      });
      harness.script(
        (req, ctx) => {
          fs.mkdirSync(holdsDir(runtime.store), { recursive: true });
          fs.writeFileSync(
            path.join(holdsDir(runtime.store), "s1.yaml"),
            "slugs: alpha\ngoal: maybe\n",
            "utf8",
          );
          ctx.writeOutcome(outcome({ summary: "wrote an invalid hold" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );
      harness.script(approver("alpha is correct"), {
        when: whenTurn({ slug: "alpha", step: "review" }),
      });
      harness.script(approver("beta is correct"), {
        when: whenTurn({ slug: "beta", step: "review" }),
      });

      const dispatched = await runDispatch(runtime, {
        iteration: 1,
        seenSteers: [],
      });
      expect(dispatched.reason).toBe("boundary");

      // The malformed hold is parked where it cannot decide anything, with a record.
      expect(
        fs.existsSync(path.join(quarantineDir(runtime.store), "s1.yaml")),
      ).toBe(true);
      expect(fs.existsSync(path.join(holdsDir(runtime.store), "s1.yaml"))).toBe(
        false,
      );
      const records = await runtime.store.listRecords();
      const quarantined = records.find(
        (record) => record.step === "hold-quarantine",
      );
      expect(quarantined?.ok).toBe(false);
      expect(quarantined?.cause).toContain("s1.yaml");

      // The turn already in flight settled, and the launch kept dispatching.
      expect(
        records.find(
          (record) => record.slug === "beta" && record.step === "implement",
        )?.outcome?.status,
      ).toBe("done");
      const state = await tasks(runtime);
      expect(state.tasks.alpha!.status).toBe("merged");
      expect(state.tasks.beta!.status).toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("does not claim a fresh steer that is still growing across the settle interval", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    let writer: ReturnType<typeof setInterval> | undefined;
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));

      const inbox = path.join(runtime.store.goalDir, "mailbox/inbox");
      const file = path.join(inbox, "s1.md");
      let appends = 0;
      // The file must keep growing until the whole first dispatch resolves:
      // any pair of passes that sees the same content may claim the steer.
      writer = setInterval(() => {
        if (!fs.existsSync(file)) return;
        fs.appendFileSync(file, " unmerged until I answer.", "utf8");
        appends += 1;
      }, 5);

      harness.script(
        implementer("alpha.txt", () => {
          fs.mkdirSync(inbox, { recursive: true });
          fs.writeFileSync(file, "Keep alpha", "utf8");
        }),
      );
      harness.script(approver("alpha is correct"));

      let first: DispatchResult;
      try {
        first = await runDispatch(runtime, { iteration: 1, seenSteers: [] });
      } finally {
        clearInterval(writer);
      }
      expect(first.reason).toBe("boundary");
      // The half-written steer is not claimed on that pass: no PM turn yet and
      // the drop stays in the inbox for a later reader.
      expect(
        (await runtime.store.listRecords()).filter(
          (record) => record.step === "pm",
        ),
      ).toHaveLength(0);
      expect(fs.existsSync(file)).toBe(true);
      expect(appends).toBeGreaterThan(0);

      const full = fs.readFileSync(file, "utf8").trim();
      expect(full).toContain("Keep alpha unmerged until I answer.");
      harness.script((req, ctx) => {
        expect(req.prompt).toContain(full);
        ctx.writeOutcome(outcome({ summary: "structured the settled steer" }));
        return fakeTurnResult(req);
      });

      const second = await runDispatch(runtime, {
        iteration: 2,
        seenSteers: [],
      });
      expect(second.reason).toBe("boundary");
      expect(
        (await runtime.store.listRecords()).filter(
          (record) => record.step === "pm",
        ),
      ).toHaveLength(1);
      expect(
        harness.calls.filter((call) => call.prompt.includes("Keep alpha")),
      ).toHaveLength(1);
    } finally {
      if (writer) clearInterval(writer);
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("quarantines a malformed hold left in the mailbox and dispatches normally", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("gamma", { scope: ["gamma.txt"] }));
      const dir = holdsDir(runtime.store);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "s1.yaml"),
        "slugs: alpha\ngoal: maybe\n",
        "utf8",
      );

      harness.script(implementer("alpha.txt"));
      harness.script(approver("alpha is correct"));
      harness.script(implementer("gamma.txt"));
      harness.script(approver("gamma is correct"));

      const dispatched = await runDispatch(runtime, {
        iteration: 1,
        seenSteers: [],
      });
      expect(dispatched.reason).toBe("boundary");
      const state = await tasks(runtime);
      expect(state.tasks.alpha!.status).toBe("merged");
      expect(state.tasks.gamma!.status).toBe("merged");
      expect(
        fs.existsSync(path.join(quarantineDir(runtime.store), "s1.yaml")),
      ).toBe(true);
      const record = (await runtime.store.listRecords()).find(
        (r) => r.step === "hold-quarantine",
      );
      expect(record?.cause).toContain("s1.yaml");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("re-presents an unanswered steer, then expires its hold with a concern", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await postSteer(runtime.store, "s1", "Hold alpha until I answer.");
      writeHold(runtime, "s1", ["alpha"], true);

      const ignoreSteer: FakeTurnHandler = (req, ctx) => {
        expect(req.prompt).toContain(
          "- s1 (mailbox/inbox/s1.md): Hold alpha until I answer.",
        );
        editPlan(runtime);
        ctx.writeOutcome(
          outcome({ summary: "ignored the steer", decision: "continue" }),
        );
        return fakeTurnResult(req);
      };
      const unchanged: FakeTurnHandler = (req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
        return fakeTurnResult(req);
      };

      // First unanswered boundary: the steer is recorded, its hold still gates.
      harness.script(ignoreSteer);
      harness.script(unchanged);
      const first = await runBoundary(runtime, { relaunch: false });
      expect(first.decision).toBe("continue");
      expect(fs.existsSync(path.join(holdsDir(runtime.store), "s1.yaml"))).toBe(
        true,
      );
      const presented = (await runtime.store.listRecords()).find(
        (r) => r.step === "steer-presented",
      );
      expect(presented?.ok).toBe(false);
      expect(presented?.slug).toBe("s1");
      expect(presented?.cause).toContain('"s1"');
      expect(
        (await runtime.store.listRecords()).some(
          (r) => r.step === "steer-unanswered",
        ),
      ).toBe(false);

      // Second unanswered boundary: re-presented again, then the hold expires.
      harness.script(ignoreSteer);
      harness.script(unchanged);
      const second = await runBoundary(runtime, { relaunch: false });
      expect(second.decision).toBe("continue");
      expect(
        fs.existsSync(path.join(runtime.store.goalDir, "mailbox/inbox/s1.md")),
      ).toBe(true);
      expect(fs.existsSync(path.join(holdsDir(runtime.store), "s1.yaml"))).toBe(
        false,
      );
      expect(await readHolds(runtime.store)).toEqual([]);
      const expired = (await runtime.store.listRecords()).find(
        (r) => r.step === "steer-unanswered",
      );
      expect(expired?.ok).toBe(false);
      expect(expired?.slug).toBe("s1");
      expect(expired?.cause).toContain('"s1"');
      expect(expired?.outcome?.concerns[0]?.calibration).toBe("architect");
      expect(expired?.outcome?.concerns[0]?.text).toContain("s1");
      expect(expired?.outcome?.concerns[0]?.evidence).toBe(
        "mailbox/inbox/s1.md",
      );

      // Third boundary: the architect finally answers the still-pending steer.
      harness.script((req, ctx) => {
        expect(req.prompt).toContain(
          "- s1 (mailbox/inbox/s1.md): Hold alpha until I answer.",
        );
        editPlan(runtime);
        ctx.writeOutcome(
          outcome({
            summary: "answered it",
            decision: "continue",
            forward: ["steer s1: hold is released"],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script(unchanged);
      const third = await runBoundary(runtime, { relaunch: false });
      expect(third.decision).toBe("continue");
      expect(
        fs.existsSync(
          path.join(runtime.store.goalDir, "mailbox/processed/s1.md"),
        ),
      ).toBe(true);
      expect(
        fs.readFileSync(
          path.join(runtime.store.goalDir, "mailbox/outbox/steer-s1.md"),
          "utf8",
        ),
      ).toContain("hold is released");
      const records = await runtime.store.listRecords();
      expect(records.filter((r) => r.step === "steer-presented")).toHaveLength(
        1,
      );
      expect(records.filter((r) => r.step === "steer-unanswered")).toHaveLength(
        1,
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("expires an unanswered steer whose id contains a quote", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      // A naive writer may drop any file name; the id is the file name, quotes included.
      const inbox = path.join(runtime.store.goalDir, "mailbox/inbox");
      fs.mkdirSync(inbox, { recursive: true });
      fs.writeFileSync(
        path.join(inbox, 'we"ird.md'),
        "Hold alpha until I answer.\n",
        "utf8",
      );
      writeHold(runtime, 'we"ird', ["alpha"], true);

      const ignoreSteer: FakeTurnHandler = (req, ctx) => {
        expect(req.prompt).toContain(
          '- we"ird (mailbox/inbox/we"ird.md): Hold alpha until I answer.',
        );
        editPlan(runtime);
        ctx.writeOutcome(
          outcome({ summary: "ignored the steer", decision: "continue" }),
        );
        return fakeTurnResult(req);
      };
      const unchanged: FakeTurnHandler = (req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
        return fakeTurnResult(req);
      };

      harness.script(ignoreSteer);
      harness.script(unchanged);
      const first = await runBoundary(runtime, { relaunch: false });
      expect(first.decision).toBe("continue");
      expect(
        fs.existsSync(path.join(holdsDir(runtime.store), 'we"ird.yaml')),
      ).toBe(true);

      harness.script(ignoreSteer);
      harness.script(unchanged);
      const second = await runBoundary(runtime, { relaunch: false });
      expect(second.decision).toBe("continue");

      // The quoted id round-trips, so the second boundary recognizes the first
      // presentation and expires the hold instead of presenting forever.
      expect(
        fs.existsSync(
          path.join(runtime.store.goalDir, 'mailbox/inbox/we"ird.md'),
        ),
      ).toBe(true);
      expect(
        fs.existsSync(path.join(holdsDir(runtime.store), 'we"ird.yaml')),
      ).toBe(false);
      const records = await runtime.store.listRecords();
      expect(records.filter((r) => r.step === "steer-presented")).toHaveLength(
        1,
      );
      const expired = records.filter((r) => r.step === "steer-unanswered");
      expect(expired).toHaveLength(1);
      expect(expired[0]?.outcome?.concerns[0]?.evidence).toBe(
        'mailbox/inbox/we"ird.md',
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
  it("answers a steer file named with spaces or a colon and deletes its hold", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      const inbox = path.join(runtime.store.goalDir, "mailbox/inbox");
      fs.mkdirSync(inbox, { recursive: true });
      fs.writeFileSync(
        path.join(inbox, "my steer:1.md"),
        "Hold alpha until I answer.\n",
        "utf8",
      );
      writeHold(runtime, "my steer:1", ["alpha"]);

      harness.script((req, ctx) => {
        expect(req.prompt).toContain(
          "- my steer:1 (mailbox/inbox/my steer:1.md): Hold alpha until I answer.",
        );
        editPlan(runtime);
        ctx.writeOutcome(
          outcome({
            summary: "answered the oddly named steer",
            decision: "continue",
            forward: ["steer my steer:1: hold is released"],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
        return fakeTurnResult(req);
      });

      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("continue");
      expect(
        fs.existsSync(
          path.join(runtime.store.goalDir, "mailbox/inbox/my steer:1.md"),
        ),
      ).toBe(false);
      expect(
        fs.existsSync(
          path.join(runtime.store.goalDir, "mailbox/processed/my steer:1.md"),
        ),
      ).toBe(true);
      expect(
        fs.readFileSync(
          path.join(
            runtime.store.goalDir,
            "mailbox/outbox/steer-my steer:1.md",
          ),
          "utf8",
        ),
      ).toContain("hold is released");
      expect(
        fs.existsSync(path.join(holdsDir(runtime.store), "my steer:1.yaml")),
      ).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("tracks unanswered steers by record data, not cause text", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await postSteer(runtime.store, "s1", "Hold alpha until I answer.");
      writeHold(runtime, "s1", ["alpha"]);
      // The slug says s1 was presented; the cause names a different steer and
      // must be ignored, proving the id travels as data.
      await runtime.store.appendRecord(
        {
          iteration: 1,
          step: "steer-presented",
          round: 1,
          actor: "script",
          slug: "s1",
        },
        {
          ok: false,
          cause:
            'unanswered steer "s2" in mailbox/inbox/s1.md; the next boundary presents it again before its hold expires',
        },
      );

      harness.script((req, ctx) => {
        expect(req.prompt).toContain(
          "- s1 (mailbox/inbox/s1.md): Hold alpha until I answer.",
        );
        editPlan(runtime);
        ctx.writeOutcome(
          outcome({ summary: "ignored the steer", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
        return fakeTurnResult(req);
      });

      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("continue");
      const records = await runtime.store.listRecords();
      expect(records.filter((r) => r.step === "steer-presented")).toHaveLength(
        1,
      );
      const expired = records.filter((r) => r.step === "steer-unanswered");
      expect(expired).toHaveLength(1);
      expect(expired[0]?.slug).toBe("s1");
      expect(fs.existsSync(path.join(holdsDir(runtime.store), "s1.yaml"))).toBe(
        false,
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("answers two different steers that carry identical text", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await postSteer(runtime.store, "s1", "Keep the API stable.");
      await postSteer(runtime.store, "s2", "Keep the API stable.");

      harness.script((req, ctx) => {
        expect(req.prompt).toContain(
          "- s1 (mailbox/inbox/s1.md): Keep the API stable.",
        );
        expect(req.prompt).toContain(
          "- s2 (mailbox/inbox/s2.md): Keep the API stable.",
        );
        editPlan(runtime);
        ctx.writeOutcome(
          outcome({
            summary: "answered both steers",
            decision: "continue",
            forward: ["steer s1: names stay", "steer s2: internals only"],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
        return fakeTurnResult(req);
      });

      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("continue");
      for (const id of ["s1", "s2"]) {
        expect(
          fs.existsSync(
            path.join(runtime.store.goalDir, `mailbox/processed/${id}.md`),
          ),
        ).toBe(true);
        expect(
          fs.existsSync(
            path.join(runtime.store.goalDir, `mailbox/outbox/steer-${id}.md`),
          ),
        ).toBe(true);
      }
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("leaves a task alone when a steer id equals its slug", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      // The steer id collides with the task slug. Its hold blocks nothing, so
      // any effect on alpha comes from the steer records keyed by that slug.
      await postSteer(runtime.store, "alpha", "A steer sharing the task slug.");
      writeHold(runtime, "alpha", []);

      const ignoreSteer: FakeTurnHandler = (req, ctx) => {
        expect(req.prompt).toContain(
          "- alpha (mailbox/inbox/alpha.md): A steer sharing the task slug.",
        );
        editPlan(runtime);
        ctx.writeOutcome(
          outcome({ summary: "ignored the steer", decision: "continue" }),
        );
        return fakeTurnResult(req);
      };
      const unchanged: FakeTurnHandler = (req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
        return fakeTurnResult(req);
      };

      harness.script(ignoreSteer);
      harness.script(unchanged);
      expect((await runBoundary(runtime, { relaunch: false })).decision).toBe(
        "continue",
      );
      harness.script(ignoreSteer);
      harness.script(unchanged);
      expect((await runBoundary(runtime, { relaunch: false })).decision).toBe(
        "continue",
      );

      const records = await runtime.store.listRecords();
      expect(
        records.filter(
          (r) => r.step === "steer-presented" && r.slug === "alpha",
        ),
      ).toHaveLength(1);
      expect(
        records.filter(
          (r) => r.step === "steer-unanswered" && r.slug === "alpha",
        ),
      ).toHaveLength(1);

      // The steer records share the task's slug but carry no task state.
      const state = await tasks(runtime);
      expect(state.tasks.alpha!.status).toBe("ready");
      expect(state.tasks.alpha!.turns).toBe(0);
      expect(state.tasks.alpha!.round).toBe(1);
      expect(state.tasks.alpha!.phase).toBe("implement");
      expect(state.tasks.alpha!.park).toBeUndefined();
      expect(state.tasks.alpha!.cause).toBeUndefined();

      // The task still runs its flow to the end through the same records.
      harness.script(implementer("alpha.txt"));
      harness.script(approver("alpha is correct"));
      const dispatched = await runDispatch(runtime, {
        iteration: 3,
        seenSteers: ["alpha"],
      });
      expect(dispatched.reason).toBe("boundary");
      expect((await tasks(runtime)).tasks.alpha!.status).toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
