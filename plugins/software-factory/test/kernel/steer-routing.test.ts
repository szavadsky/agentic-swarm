import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { holdsDir, postSteer } from "../../src/kernel/mailbox.js";
import { appendPark } from "../../src/kernel/record.js";
import { spikeReportPath } from "../../src/kernel/spike-report.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";
import {
  writePlan,
  editPlan,
  writeHold,
  stateOf,
  implementer,
  approver,
  outboxOf,
  inboxHas,
} from "./steer-helpers.js";

describe("steer PM routing", () => {
  it("task: amends the pending task file and answers in the outbox", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));

      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(runtime.store, "s1", "Beta needs edge X.");
        }),
      );
      harness.script((req, ctx) => {
        const betaFile = path.join(runtime.store.tasksDir, "beta.md");
        fs.appendFileSync(betaFile, "\nPM amended: edge X.\n", "utf8");
        writeHold(runtime, "s1", []);
        ctx.writeOutcome(
          outcome({
            summary: "amended beta for s1",
            steerRoutes: [
              {
                steer: "s1",
                route: "task",
                answer: "amended beta with edge X",
              },
            ],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script(approver("alpha is correct"));
      harness.script(implementer("beta.txt"));
      harness.script(approver("beta is correct"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      expect(
        fs.readFileSync(path.join(runtime.store.tasksDir, "beta.md"), "utf8"),
      ).toContain("PM amended: edge X.");
      expect(outboxOf(runtime, "s1")).toContain("amended beta with edge X");
      expect(inboxHas(runtime, "s1")).toBe(false);
      expect(fs.existsSync(path.join(holdsDir(runtime.store), "s1.yaml"))).toBe(
        false,
      );
      const beta = (await stateOf(runtime)).tasks.beta!;
      expect(beta.status).toBe("merged");

      // The next boundary never sees the answered steer, but its pack names the answer.
      harness.script((req, ctx) => {
        expect(req.prompt).not.toContain("s1 (mailbox/inbox/s1.md)");
        editPlan(runtime);
        ctx.writeOutcome(
          outcome({ summary: "no steers", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
        return fakeTurnResult(req);
      });
      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("continue");
      const pack = fs.readFileSync(
        path.join(runtime.store.goalDir, boundary.packPath!),
        "utf8",
      );
      expect(pack).not.toContain("- s1: mailbox/inbox/s1.md");
      expect(pack).toContain("- s1 [task]: amended beta with edge X");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("task redo: writes a rework task with base and the next reconcile keeps it", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      await appendPark(
        runtime.store,
        { iteration: 1, slug: "alpha", round: 1, revision: 0 },
        "flaky foundation",
      );
      expect((await stateOf(runtime)).tasks.alpha!.status).toBe("parked");

      harness.script(
        implementer("beta.txt", async () => {
          await postSteer(runtime.store, "s1", "Redo alpha on its branch.");
        }),
      );
      harness.script((req, ctx) => {
        fs.writeFileSync(
          path.join(runtime.store.tasksDir, "alpha-retry.md"),
          [
            "---",
            "slug: alpha-retry",
            "title: alpha retry",
            "flow: implement-review",
            "deps: []",
            "scope: [alpha.txt]",
            "source: 'steer: s1'",
            "base: alpha",
            "---",
            "",
            "Redo alpha.",
            "Done when: alpha works.",
            "",
          ].join("\n"),
          "utf8",
        );
        writeHold(runtime, "s1", []);
        ctx.writeOutcome(
          outcome({
            summary: "wrote alpha-retry for s1",
            steerRoutes: [
              {
                steer: "s1",
                route: "task",
                answer: "wrote alpha-retry on alpha",
              },
            ],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script(approver("beta is correct"));
      // beta merged and both alpha and its branch-less retry parked: the
      // wave-end stall leaves them for the boundary.
      scriptStallLeave(harness, ["alpha", "alpha-retry"]);

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      const retryFile = fs.readFileSync(
        path.join(runtime.store.tasksDir, "alpha-retry.md"),
        "utf8",
      );
      expect(retryFile).toContain("base: alpha");
      expect(retryFile).toContain("steer: s1");
      expect(outboxOf(runtime, "s1")).toContain("wrote alpha-retry");
      expect(inboxHas(runtime, "s1")).toBe(false);

      // The boundary PM derives from the plan, which never names the rework slug;
      // provenance exempts it from the cancel-removed rule.
      harness.script((req, ctx) => {
        editPlan(runtime);
        ctx.writeOutcome(
          outcome({ summary: "continue", decision: "continue" }),
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
      expect(
        records.some((r) => r.slug === "alpha-retry" && r.step === "cancel"),
      ).toBe(false);
      expect(
        fs.existsSync(path.join(runtime.store.tasksDir, "alpha-retry.md")),
      ).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("spike: writes a standalone task whose landed outcome is answered to the owner", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));

      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(runtime.store, "s1", "How should pagination work?");
        }),
      );
      harness.script((req, ctx) => {
        fs.writeFileSync(
          path.join(runtime.store.tasksDir, "probe-page.md"),
          [
            "---",
            "slug: probe-page",
            "title: probe pagination",
            "kind: spike",
            "flow: spike",
            "deps: []",
            "scope: [probe.txt]",
            "source: 'steer: s1'",
            "---",
            "",
            "Probe pagination.",
            "Done when: finding reported.",
            "",
          ].join("\n"),
          "utf8",
        );
        writeHold(runtime, "s1", []);
        ctx.writeOutcome(
          outcome({
            summary: "wrote probe-page for s1",
            steerRoutes: [{ steer: "s1", route: "spike" }],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script(approver("alpha is correct"));
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "probe.txt"), "finding\n", "utf8");
        const report = path.join(req.cwd!, spikeReportPath("probe-page"));
        fs.mkdirSync(path.dirname(report), { recursive: true });
        fs.writeFileSync(
          report,
          "# Finding\n\nCursor pagination wins.\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "cursor pagination wins" }));
        return fakeTurnResult(req);
      });
      harness.script(approver("finding is solid"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      expect((await stateOf(runtime)).tasks["probe-page"]!.status).toBe(
        "finished",
      );
      // The spike steer stays pending with no answer until its task lands.
      expect(inboxHas(runtime, "s1")).toBe(true);
      expect(
        fs.existsSync(
          path.join(runtime.store.goalDir, "mailbox/outbox", "steer-s1.md"),
        ),
      ).toBe(false);

      harness.script((req, ctx) => {
        expect(req.prompt).not.toContain("s1 (mailbox/inbox/s1.md)");
        editPlan(runtime);
        ctx.writeOutcome(
          outcome({ summary: "no steers", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
        return fakeTurnResult(req);
      });
      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("continue");
      // The sealed report, not the outcome summary, answers the owner.
      expect(outboxOf(runtime, "s1")).toContain("Cursor pagination wins.");
      expect(outboxOf(runtime, "s1")).not.toContain("cursor pagination wins");
      expect(inboxHas(runtime, "s1")).toBe(false);
      const pack = fs.readFileSync(
        path.join(runtime.store.goalDir, boundary.packPath!),
        "utf8",
      );
      expect(pack).not.toContain("- s1: mailbox/inbox/s1.md");
      expect(pack).toContain("- s1 [spike]");
      expect(pack).toContain("## Spike findings");
      expect(pack).toContain("  Cursor pagination wins.");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("pack lists only architect-routed steers plus every PM answer", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));

      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(runtime.store, "s-task", "Beta needs edge Y.");
          await postSteer(runtime.store, "s-arch", "Should we split beta?");
        }),
      );
      harness.script((req, ctx) => {
        const betaFile = path.join(runtime.store.tasksDir, "beta.md");
        fs.appendFileSync(betaFile, "\nPM amended: edge Y.\n", "utf8");
        writeHold(runtime, "s-task", []);
        writeHold(runtime, "s-arch", []);
        ctx.writeOutcome(
          outcome({
            summary: "routed one task and one architect",
            steerRoutes: [
              { steer: "s-task", route: "task", answer: "amended beta" },
              { steer: "s-arch", route: "architect" },
            ],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script(approver("alpha is correct"));
      harness.script(implementer("beta.txt"));
      harness.script(approver("beta is correct"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      expect(inboxHas(runtime, "s-task")).toBe(false);
      expect(inboxHas(runtime, "s-arch")).toBe(true);

      harness.script((req, ctx) => {
        expect(req.prompt).toContain("s-arch (mailbox/inbox/s-arch.md)");
        expect(req.prompt).not.toContain("s-task");
        editPlan(runtime);
        ctx.writeOutcome(
          outcome({
            summary: "answered architect steer",
            decision: "continue",
            forward: ["steer s-arch: keep beta whole"],
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
      const pack = fs.readFileSync(
        path.join(runtime.store.goalDir, boundary.packPath!),
        "utf8",
      );
      expect(pack).toContain("- s-arch: mailbox/inbox/s-arch.md");
      expect(pack).not.toContain("s-task: mailbox/inbox/s-task.md");
      expect(pack).toContain("- s-task [task]: amended beta");
      expect(pack).toContain("- s-arch [architect]");
      expect(outboxOf(runtime, "s-arch")).toContain("keep beta whole");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("frozen: a steer turn cannot edit a merged task and retries the ladder", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      await writeTask(runtime, task("gamma", { scope: ["gamma.txt"] }));
      await runtime.store.appendRecord(
        {
          iteration: 1,
          slug: "alpha",
          step: "merge",
          round: 1,
          actor: "script",
        },
        { ok: true },
      );
      const frozenBefore = fs.readFileSync(
        path.join(runtime.store.tasksDir, "alpha.md"),
        "utf8",
      );

      harness.script(
        implementer("beta.txt", async () => {
          await postSteer(runtime.store, "s1", "Gamma needs edge Z.");
        }),
      );
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("- alpha | merged");
        expect(req.prompt).toContain("frozen (read-only)");
        fs.appendFileSync(
          path.join(runtime.store.tasksDir, "alpha.md"),
          "\nPM broke frozen.\n",
          "utf8",
        );
        writeHold(runtime, "s1", []);
        ctx.writeOutcome(
          outcome({
            summary: "tried frozen",
            steerRoutes: [
              { steer: "s1", route: "task", answer: "edited alpha" },
            ],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("frozen");
        const gammaFile = path.join(runtime.store.tasksDir, "gamma.md");
        fs.appendFileSync(gammaFile, "\nPM amended: edge Z.\n", "utf8");
        writeHold(runtime, "s1", []);
        ctx.writeOutcome(
          outcome({
            summary: "amended gamma for s1",
            steerRoutes: [
              { steer: "s1", route: "task", answer: "amended gamma" },
            ],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script(approver("beta is correct"));
      harness.script(implementer("gamma.txt"));
      harness.script(approver("gamma is correct"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      expect(
        fs.readFileSync(path.join(runtime.store.tasksDir, "alpha.md"), "utf8"),
      ).toBe(frozenBefore);
      expect(
        fs.readFileSync(path.join(runtime.store.tasksDir, "gamma.md"), "utf8"),
      ).toContain("PM amended: edge Z.");
      expect(outboxOf(runtime, "s1")).toContain("amended gamma");
      const records = await runtime.store.listRecords();
      expect(records.filter((r) => r.step === "pm")).toHaveLength(2);
      expect(records.some((r) => r.step === "pm-reconcile")).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("exhausted: a failed task route reaches the architect with no outbox answer", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      const betaBefore = fs.readFileSync(
        path.join(runtime.store.tasksDir, "beta.md"),
        "utf8",
      );

      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(runtime.store, "s1", "Beta needs edge X.");
        }),
      );
      // Both rungs amend beta and answer, but route an unclaimed extra steer:
      // validation fails, the ladder exhausts, and the writes roll back.
      const badPm: FakeTurnHandler = (req, ctx) => {
        fs.appendFileSync(
          path.join(runtime.store.tasksDir, "beta.md"),
          "\nPM amended: edge X.\n",
          "utf8",
        );
        writeHold(runtime, "s1", []);
        ctx.writeOutcome(
          outcome({
            summary: "amended beta for s1",
            steerRoutes: [
              { steer: "s1", route: "task", answer: "amended beta" },
              { steer: "sX", route: "architect" },
            ],
          }),
        );
        return fakeTurnResult(req);
      };
      harness.script(badPm);
      harness.script(badPm);
      harness.script(approver("alpha is correct"));
      harness.script(implementer("beta.txt"));
      harness.script(approver("beta is correct"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      expect(
        fs.readFileSync(path.join(runtime.store.tasksDir, "beta.md"), "utf8"),
      ).toBe(betaBefore);
      const records = await runtime.store.listRecords();
      expect(
        records.filter((r) => r.step === "pm-validate" && r.ok === false),
      ).toHaveLength(2);
      expect(records.some((r) => r.step === "steer-routes")).toBe(false);
      expect(
        fs.existsSync(
          path.join(runtime.store.goalDir, "mailbox/outbox", "steer-s1.md"),
        ),
      ).toBe(false);
      expect(inboxHas(runtime, "s1")).toBe(true);

      // The architect sees the steer verbatim and answers it; the failed
      // rung's answer claims an amendment that never happened, so the
      // boundary must never read it.
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("s1 (mailbox/inbox/s1.md)");
        editPlan(runtime);
        ctx.writeOutcome(
          outcome({
            summary: "answered s1",
            decision: "continue",
            forward: ["steer s1: beta gets edge X next iteration"],
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
      const pack = fs.readFileSync(
        path.join(runtime.store.goalDir, boundary.packPath!),
        "utf8",
      );
      expect(pack).toContain("- s1: mailbox/inbox/s1.md");
      expect(pack).not.toContain("- s1 [task]");
      expect(outboxOf(runtime, "s1")).toContain("beta gets edge X");
      expect(outboxOf(runtime, "s1")).not.toContain("amended beta");
      expect(inboxHas(runtime, "s1")).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
