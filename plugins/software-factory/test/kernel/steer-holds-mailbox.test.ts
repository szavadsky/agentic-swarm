// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { type DispatchResult, runDispatch } from "../../src/kernel/dispatch.js";
import {
  holdsDir,
  postSteer,
  quarantineDir,
  readHolds,
} from "../../src/kernel/mailbox.js";
import { task, cause, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";
import {
  writePlan,
  editPlan,
  writeHold,
  tasks,
  implementer,
  approver,
} from "./steer-holds-helpers.js";
import { formatCause } from "../../src/kernel/cause.js";

describe("mid-run steer holds", () => {
  it("does not claim a fresh steer that is still growing across the settle interval", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
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

  it("ignores a malformed hold left in the mailbox, leaves it for the launch sweep, and dispatches normally", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
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
      // Dispatch never sweeps: the file stays and no record is written.
      expect(fs.existsSync(path.join(dir, "s1.yaml"))).toBe(true);
      expect(fs.existsSync(quarantineDir(runtime.store))).toBe(false);
      expect(
        (await runtime.store.listRecords()).some(
          (r) => r.step === "hold-quarantine",
        ),
      ).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("re-presents an unanswered steer, then expires its hold with a concern", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
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
      expect(causeText(presented?.cause)).toContain('"s1"');
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
      expect((await readHolds(runtime.store)).holds).toEqual([]);
      const expired = (await runtime.store.listRecords()).find(
        (r) => r.step === "steer-unanswered",
      );
      expect(expired?.ok).toBe(false);
      expect(expired?.slug).toBe("s1");
      expect(causeText(expired?.cause)).toContain('"s1"');
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
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
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
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
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
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
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
          cause: cause(
            'unanswered steer "s2" in mailbox/inbox/s1.md; the next boundary presents it again before its hold expires',
          ),
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
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
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
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
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
