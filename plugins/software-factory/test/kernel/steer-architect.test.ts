// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import {
  collectSteerRoutes,
  holdsDir,
  postSteer,
} from "../../src/kernel/mailbox.js";
import { task, cause, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";
import { workCalls } from "./fake-defaults.js";
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

describe("steer architect routing", () => {
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
            steerAnswers: [{ steer: "s1", answer: "intent amended verbatim" }],
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

  it("architect {id}: keeps the steer for one named architect's boundary", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(
        runtime,
        task("auth.alpha", { scope: ["alpha.txt"], epic: "auth" }),
      );
      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(
            runtime.store,
            "s1",
            "The auth interface needs a ruling.",
          );
        }),
      );
      harness.script((req, ctx) => {
        writeHold(runtime, "s1", []);
        ctx.writeOutcome(
          outcome({
            summary: "s1 goes to the auth architect",
            steerRoutes: [{ steer: "s1", route: { architect: "auth" } }],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script(approver("alpha is correct"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      expect(inboxHas(runtime, "s1")).toBe(true);
      const records = await runtime.store.listRecords();
      expect(collectSteerRoutes(records).get("s1")).toEqual({
        route: { architect: "auth" },
      });
      expect(
        records.find((r) => r.slug === "auth.alpha" && r.step === "implement")
          ?.architect,
      ).toBe("auth");
      const hold = yaml.parse(
        fs.readFileSync(path.join(holdsDir(runtime.store), "s1.yaml"), "utf8"),
      );
      expect(hold).toEqual({ slugs: [], goal: false });
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("architect {id}: names a rejected targeted route in the PM finding", async () => {
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
          await postSteer(
            runtime.store,
            "s1",
            "The auth interface needs a ruling.",
          );
        }),
      );
      harness.script(async (req, ctx) => {
        await writeTask(
          runtime,
          task("s1-note", {
            scope: ["note.txt"],
            source: "steer: s1",
          }),
        );
        writeHold(runtime, "s1", []);
        ctx.writeOutcome(
          outcome({
            summary: "s1 goes to auth and writes a task",
            steerRoutes: [{ steer: "s1", route: { architect: "auth" } }],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        writeHold(runtime, "s1", []);
        ctx.writeOutcome(
          outcome({
            summary: "s1 goes to the auth architect",
            steerRoutes: [{ steer: "s1", route: { architect: "auth" } }],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script(approver("alpha is correct"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      const records = await runtime.store.listRecords();
      const validates = records.filter(
        (record) => record.step === "pm-validate",
      );
      expect(validates).toHaveLength(1);
      const finding = causeText(validates[0]!.cause);
      expect(finding).toContain("routed architect auth");
      expect(finding).not.toContain("[object Object]");
      expect(collectSteerRoutes(records).get("s1")).toEqual({
        route: { architect: "auth" },
      });
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
      expect(dispatched.cause).toEqual(cause("steer: s1 goal hold"));
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
      expect(causeText(dispatched.cause)).toContain("s1");
      expect(causeText(dispatched.cause)).toContain("beta");
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
      expect(causeText(dispatched.cause)).toContain("s1");
      expect(causeText(dispatched.cause)).toContain("alpha");
      expect(causeText(dispatched.cause)).toContain("beta");
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
          "# Milestone 1 — files\n\n## beta\nReworked beta.txt for new intent.\n\ncancelled: alpha — the steer voids it\n",
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
      expect(after.tasks.alpha!.cause).toEqual({
        kind: "note",
        detail: "the steer voids it",
      });
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
      expect(causeText(validates[0]!.cause)).toContain(
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
