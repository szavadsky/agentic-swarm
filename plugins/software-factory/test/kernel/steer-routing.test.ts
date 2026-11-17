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
import { runDispatch } from "../../src/kernel/dispatch.js";
import { holdsDir, postSteer } from "../../src/kernel/mailbox.js";
import { appendPark } from "../../src/kernel/record.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";
import { workCalls } from "./fake-defaults.js";

const PLAN = `# Milestone 1 — files

## alpha
Create alpha.txt.

## beta
Create beta.txt.
`;

function writePlan(runtime: KernelRuntime): void {
  fs.writeFileSync(path.join(runtime.store.goalDir, "plan.md"), PLAN, "utf8");
}

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

async function stateOf(runtime: KernelRuntime) {
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

function outboxOf(runtime: KernelRuntime, steer: string): string {
  return fs.readFileSync(
    path.join(runtime.store.goalDir, "mailbox/outbox", `steer-${steer}.md`),
    "utf8",
  );
}

function inboxHas(runtime: KernelRuntime, steer: string): boolean {
  return fs.existsSync(
    path.join(runtime.store.goalDir, "mailbox/inbox", `${steer}.md`),
  );
}

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
        { iteration: 1, slug: "alpha", round: 1 },
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
      expect(outboxOf(runtime, "s1")).toContain("cursor pagination wins");
      expect(inboxHas(runtime, "s1")).toBe(false);
      const pack = fs.readFileSync(
        path.join(runtime.store.goalDir, boundary.packPath!),
        "utf8",
      );
      expect(pack).not.toContain("- s1: mailbox/inbox/s1.md");
      expect(pack).toContain("- s1 [spike]");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("architect: routes an intent amendment to the next boundary with nothing held", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      const steerText = "Amend intent: the goal now covers export.";
      const intentBefore = fs.readFileSync(
        path.join(runtime.store.goalDir, "intent.md"),
        "utf8",
      );

      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(runtime.store, "s1", steerText);
        }),
      );
      harness.script((req, ctx) => {
        writeHold(runtime, "s1", []);
        ctx.writeOutcome(
          outcome({
            summary: "s1 needs the architect",
            steerRoutes: [{ steer: "s1", route: "architect" }],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script(approver("alpha is correct"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      expect(inboxHas(runtime, "s1")).toBe(true);
      expect(
        fs.existsSync(
          path.join(runtime.store.goalDir, "mailbox/outbox", "steer-s1.md"),
        ),
      ).toBe(false);
      const hold = yaml.parse(
        fs.readFileSync(path.join(holdsDir(runtime.store), "s1.yaml"), "utf8"),
      );
      expect(hold).toEqual({ slugs: [], goal: false });
      expect(
        fs.readFileSync(path.join(runtime.store.goalDir, "intent.md"), "utf8"),
      ).toBe(intentBefore);
      expect(
        fs.readFileSync(
          path.join(runtime.store.goalDir, "mailbox/inbox/s1.md"),
          "utf8",
        ),
      ).toContain(steerText);

      harness.script((req, ctx) => {
        expect(req.prompt).toContain(
          "- s1 (mailbox/inbox/s1.md): Amend intent: the goal now covers export.",
        );
        editPlan(runtime);
        ctx.writeOutcome(
          outcome({
            summary: "amended intent",
            decision: "continue",
            forward: ["steer s1: intent amended verbatim"],
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
      expect(pack).toContain("- s1 [architect]");
      expect(outboxOf(runtime, "s1")).toContain("intent amended verbatim");
      expect(inboxHas(runtime, "s1")).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("stall: drains the goal, then the architect answers", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("gamma", { scope: ["gamma.txt"] }));

      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(runtime.store, "s1", "Stop: new priority first.");
        }),
      );
      harness.script((req, ctx) => {
        writeHold(runtime, "s1", [], true);
        ctx.writeOutcome(
          outcome({
            summary: "s1 stalls the goal",
            steerRoutes: [{ steer: "s1", route: "stall" }],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script(approver("alpha is correct"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("drained");
      expect(dispatched.cause).toBe("steer: s1 goal hold");
      const after = await stateOf(runtime);
      expect(after.tasks.alpha!.status).toBe("merged");
      expect(after.tasks.gamma!.status).toBe("ready");
      expect(inboxHas(runtime, "s1")).toBe(true);

      harness.script((req, ctx) => {
        expect(req.prompt).toContain("s1 (mailbox/inbox/s1.md)");
        editPlan(runtime);
        ctx.writeOutcome(
          outcome({
            summary: "replanned after stall",
            decision: "continue",
            forward: ["steer s1: replanned around the new priority"],
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
      expect(pack).toContain("- s1 [stall]");
      expect(outboxOf(runtime, "s1")).toContain("replanned around");
      expect(inboxHas(runtime, "s1")).toBe(false);
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

  it("architect: an intent amendment holds the voided task while the other runs, and the pack shows it", async () => {
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
          await postSteer(
            runtime.store,
            "s1",
            "Amend intent: drop beta, keep alpha.",
          );
        }),
      );
      harness.script((req, ctx) => {
        writeHold(runtime, "s1", ["beta"]);
        ctx.writeOutcome(
          outcome({
            summary: "s1 voids beta",
            steerRoutes: [{ steer: "s1", route: "architect" }],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script(approver("alpha is correct"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      expect(dispatched.cause ?? "").toContain("s1");
      expect(dispatched.cause ?? "").toContain("beta");
      const held = await stateOf(runtime);
      expect(held.tasks.alpha!.status).toBe("merged");
      expect(held.tasks.beta!.status).toBe("ready");
      const records = await runtime.store.listRecords();
      expect(
        records.some((r) => r.slug === "beta" && r.actor === "agent"),
      ).toBe(false);
      expect(records.some((r) => r.step === "steer-routes")).toBe(true);
      expect(records.filter((r) => r.step === "pm-validate")).toHaveLength(0);
      const hold = yaml.parse(
        fs.readFileSync(path.join(holdsDir(runtime.store), "s1.yaml"), "utf8"),
      ) as { slugs: string[]; goal: boolean };
      expect(hold.slugs).toEqual(["beta"]);
      expect(hold.goal).toBe(false);
      expect(inboxHas(runtime, "s1")).toBe(true);

      harness.script((req, ctx) => {
        expect(req.prompt).toContain("s1 (mailbox/inbox/s1.md)");
        editPlan(runtime);
        ctx.writeOutcome(
          outcome({
            summary: "answered s1",
            decision: "continue",
            forward: ["steer s1: beta dropped from intent"],
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
      const steerLine = pack.indexOf("- s1: mailbox/inbox/s1.md");
      const holdsLine = pack.indexOf("holds: beta");
      expect(holdsLine).toBeGreaterThan(steerLine);
      expect(pack).toContain("- s1 [architect]");
      expect(outboxOf(runtime, "s1")).toContain("beta dropped");
      expect(inboxHas(runtime, "s1")).toBe(false);
      expect(fs.existsSync(path.join(holdsDir(runtime.store), "s1.yaml"))).toBe(
        false,
      );

      harness.script(implementer("beta.txt"));
      harness.script(approver("beta is correct"));
      const resumed = await runDispatch(runtime, { iteration: 2 });
      expect(resumed.reason).toBe("boundary");
      expect((await stateOf(runtime)).tasks.beta!.status).toBe("merged");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("architect: voiding every pending task exhausts dispatch with cause naming the steer", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      await postSteer(
        runtime.store,
        "s1",
        "Amend intent: drop both, new direction.",
      );

      harness.script((req, ctx) => {
        writeHold(runtime, "s1", ["alpha", "beta"]);
        ctx.writeOutcome(
          outcome({
            summary: "s1 voids all",
            steerRoutes: [{ steer: "s1", route: "architect" }],
          }),
        );
        return fakeTurnResult(req);
      });

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      expect(dispatched.cause ?? "").toContain("s1");
      expect(dispatched.cause ?? "").toContain("alpha");
      expect(dispatched.cause ?? "").toContain("beta");
      const state = await stateOf(runtime);
      expect(state.tasks.alpha!.status).toBe("ready");
      expect(state.tasks.beta!.status).toBe("ready");
      const records = await runtime.store.listRecords();
      expect(
        records.some((r) => r.actor === "agent" && r.slug === "alpha"),
      ).toBe(false);
      expect(
        records.some((r) => r.actor === "agent" && r.slug === "beta"),
      ).toBe(false);
      expect(workCalls(harness)).toHaveLength(1);

      harness.script((req, ctx) => {
        expect(req.prompt).toContain("s1 (mailbox/inbox/s1.md)");
        editPlan(runtime);
        ctx.writeOutcome(
          outcome({
            summary: "answered s1",
            decision: "continue",
            forward: ["steer s1: new direction set"],
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
      expect(pack).toContain("holds: alpha, beta");
      expect(outboxOf(runtime, "s1")).toContain("new direction");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("architect: after the next plan the PM derive reworks and retires held slugs", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      await postSteer(
        runtime.store,
        "s1",
        "Amend intent: drop alpha, rework beta.",
      );

      harness.script((req, ctx) => {
        writeHold(runtime, "s1", ["alpha", "beta"]);
        ctx.writeOutcome(
          outcome({
            summary: "s1 voids both pending",
            steerRoutes: [{ steer: "s1", route: "architect" }],
          }),
        );
        return fakeTurnResult(req);
      });

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      expect((await stateOf(runtime)).tasks.alpha!.status).toBe("ready");
      expect((await stateOf(runtime)).tasks.beta!.status).toBe("ready");

      harness.script((req, ctx) => {
        expect(req.prompt).toContain("s1 (mailbox/inbox/s1.md)");
        fs.writeFileSync(
          path.join(runtime.store.goalDir, "plan.md"),
          "# Milestone 1 — files\n\n## beta\nReworked beta.txt for new intent.\n",
          "utf8",
        );
        ctx.writeOutcome(
          outcome({
            summary: "replanned after s1",
            decision: "continue",
            forward: ["steer s1: alpha dropped, beta reworked"],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        const betaFile = path.join(runtime.store.tasksDir, "beta.md");
        fs.appendFileSync(betaFile, "\nPM reworked: new intent.\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "reworked beta, alpha dropped" }));
        return fakeTurnResult(req);
      });

      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("continue");
      expect(outboxOf(runtime, "s1")).toContain("alpha dropped");
      expect(fs.existsSync(path.join(holdsDir(runtime.store), "s1.yaml"))).toBe(
        false,
      );
      const after = await stateOf(runtime);
      expect(after.tasks.alpha!.status).toBe("cancelled");
      expect(after.tasks.beta!.status).toBe("ready");
      expect(
        fs.readFileSync(path.join(runtime.store.tasksDir, "beta.md"), "utf8"),
      ).toContain("PM reworked: new intent.");

      harness.script(implementer("beta.txt"));
      harness.script(approver("beta is correct"));
      const resumed = await runDispatch(runtime, { iteration: 2 });
      expect(resumed.reason).toBe("boundary");
      expect((await stateOf(runtime)).tasks.beta!.status).toBe("merged");
      expect((await stateOf(runtime)).tasks.alpha!.status).toBe("cancelled");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("architect: goal:true still fails validation and the retry holds slugs with goal:false", async () => {
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
          await postSteer(runtime.store, "s1", "Amend intent: drop beta.");
        }),
      );
      harness.script((req, ctx) => {
        writeHold(runtime, "s1", ["beta"], true);
        ctx.writeOutcome(
          outcome({
            summary: "routed s1",
            steerRoutes: [{ steer: "s1", route: "architect" }],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("goal: true stays reserved for stall");
        writeHold(runtime, "s1", ["beta"], false);
        ctx.writeOutcome(
          outcome({
            summary: "routed s1",
            steerRoutes: [{ steer: "s1", route: "architect" }],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script(approver("alpha is correct"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      const records = await runtime.store.listRecords();
      const validates = records.filter((r) => r.step === "pm-validate");
      expect(validates).toHaveLength(1);
      expect(validates[0]!.cause ?? "").toContain(
        "goal: true stays reserved for stall",
      );
      expect(records.some((r) => r.step === "steer-routes")).toBe(true);
      const hold = yaml.parse(
        fs.readFileSync(path.join(holdsDir(runtime.store), "s1.yaml"), "utf8"),
      ) as { slugs: string[]; goal: boolean };
      expect(hold.slugs).toEqual(["beta"]);
      expect(hold.goal).toBe(false);
      expect((await stateOf(runtime)).tasks.alpha!.status).toBe("merged");
      expect((await stateOf(runtime)).tasks.beta!.status).toBe("ready");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("architect: a hold listing the in-flight task never parks it", async () => {
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
          await postSteer(
            runtime.store,
            "s1",
            "Amend intent: reconsider both.",
          );
        }),
      );
      harness.script((req, ctx) => {
        writeHold(runtime, "s1", ["alpha", "beta"]);
        ctx.writeOutcome(
          outcome({
            summary: "s1 holds both",
            steerRoutes: [{ steer: "s1", route: "architect" }],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script(approver("alpha is correct"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      const state = await stateOf(runtime);
      expect(state.tasks.alpha!.status).toBe("merged");
      expect(state.tasks.beta!.status).toBe("ready");
      const records = await runtime.store.listRecords();
      expect(records.some((r) => r.slug === "alpha" && r.step === "park")).toBe(
        false,
      );
      expect(
        records.some((r) => r.slug === "beta" && r.actor === "agent"),
      ).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
