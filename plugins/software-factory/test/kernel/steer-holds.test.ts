import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { FakeHarness, fakeTurnResult, type FakeTurnHandler } from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { holdsDir, postSteer } from "../../src/kernel/mailbox.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";
import type { KernelRuntime } from "../../src/kernel/types.js";

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

function writeHold(runtime: KernelRuntime, steer: string, slugs: string[], goal = false): void {
  const dir = holdsDir(runtime.store);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${steer}.yaml`), yaml.stringify({ slugs, goal }), "utf8");
}

async function tasks(runtime: KernelRuntime) {
  return derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows
  );
}

function implementer(file: string, before?: (cwd: string) => Promise<void> | void): FakeTurnHandler {
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
  it("holds pending tasks, parks the in-flight one unmerged, and still reaches the architect", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      writePlan(runtime);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"], deps: ["alpha"] }));
      await writeTask(runtime, task("delta", { scope: ["delta.txt"] }));
      await writeTask(runtime, task("gamma", { scope: ["gamma.txt"] }));

      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(
            runtime.store,
            "s1",
            "Keep alpha unmerged until I answer.\nSecond line with details."
          );
        })
      );
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("- s1 (mailbox/inbox/s1.md):\n  Keep alpha unmerged");
        expect(req.prompt).toContain("Second line with details.");
        writeHold(runtime, "s1", ["alpha", "beta", "delta"]);
        ctx.writeOutcome(outcome({ summary: "structured s1" }));
        return fakeTurnResult(req);
      });
      harness.script(implementer("gamma.txt"));
      harness.script(approver("gamma is correct"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");

      const held = await tasks(runtime);
      expect(held.tasks.alpha!.status).toBe("parked");
      expect(held.tasks.alpha!.cause).toBe("steer: s1");
      expect(held.tasks.beta!.status).toBe("pending");
      expect(held.tasks.delta!.status).toBe("ready");
      expect(held.tasks.gamma!.status).toBe("merged");

      const records = await runtime.store.listRecords();
      expect(records.filter((r) => r.step === "pm")).toHaveLength(1);
      expect(
        records.find((r) => r.slug === "alpha" && r.actor === "agent" && r.step === "implement")?.outcome
          ?.status
      ).toBe("done");
      expect(records.find((r) => r.slug === "alpha" && r.step === "park")?.cause).toBe("steer: s1");
      expect(records.some((r) => r.slug === "alpha" && r.step === "merge")).toBe(false);
      expect(records.some((r) => r.slug === "beta" && r.actor === "agent")).toBe(false);
      expect(records.some((r) => r.slug === "delta")).toBe(false);
      const steerTurns = (): number =>
        harness.calls.filter((call) => call.prompt.includes("Second line with details.")).length;
      expect(steerTurns()).toBe(1);
      expect(fs.existsSync(path.join(runtime.store.goalDir, "mailbox/inbox/s1.md"))).toBe(true);

      // The steer then takes the boundary path: only the architect answers it.
      harness.script((req, ctx) => {
        expect(req.prompt).toContain("- s1 (mailbox/inbox/s1.md): Keep alpha unmerged until I answer.");
        ctx.writeOutcome(
          outcome({
            summary: "answered the steer",
            decision: "continue",
            forward: ["steer s1: hold alpha; I will review the branch"],
          })
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
        return fakeTurnResult(req);
      });

      const boundary = await runBoundary(runtime, { relaunch: false });
      expect(boundary.decision).toBe("continue");
      expect(fs.readdirSync(path.join(runtime.store.goalDir, "mailbox/inbox"))).not.toContain("s1.md");
      expect(fs.readdirSync(path.join(runtime.store.goalDir, "mailbox/processed"))).toContain("s1.md");
      expect(
        fs.readFileSync(path.join(runtime.store.goalDir, "mailbox/outbox/steer-s1.md"), "utf8")
      ).toContain("hold alpha; I will review the branch");

      const after = await tasks(runtime);
      expect(after.tasks.alpha!.status).toBe("parked");
      expect(after.tasks.beta!.status).toBe("pending");
      expect(after.tasks.delta!.status).toBe("ready");
      expect(after.tasks.gamma!.status).toBe("merged");
      // The boundary PM turn does not restructure the steer a second time.
      expect(steerTurns()).toBe(1);

      // The processed steer's hold expires: the task that waited now runs.
      harness.script(implementer("delta.txt"));
      harness.script(approver("delta is correct"));
      const resumed = await runDispatch(runtime, { iteration: 2 });
      expect(resumed.reason).toBe("boundary");
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
      expect(state.tasks.alpha!.cause).toBe("empty-diff: implement r1 committed no changes");
      const records = await runtime.store.listRecords();
      expect(records.filter((r) => r.slug === "alpha" && r.step === "park")).toHaveLength(1);
      expect(records.find((r) => r.slug === "alpha" && r.step === "park")?.cause).toBe(
        "empty-diff: implement r1 committed no changes"
      );
      expect(records.some((r) => r.slug === "alpha" && r.step === "merge")).toBe(false);
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

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("boundary");
      expect(harness.calls).toHaveLength(2);
      expect((await runtime.store.listRecords()).filter((r) => r.step === "pm")).toEqual([]);
      expect((await tasks(runtime)).tasks.alpha!.status).toBe("merged");
      expect(fs.existsSync(path.join(runtime.store.goalDir, "mailbox/inbox/s1.md"))).toBe(true);
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
        })
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
      expect((await runtime.store.listRecords()).filter((r) => r.step === "pm")).toHaveLength(1);
      const hold = yaml.parse(
        fs.readFileSync(path.join(holdsDir(runtime.store), "s1.yaml"), "utf8")
      );
      expect(hold).toEqual({ slugs: [], goal: false });
      expect(fs.existsSync(path.join(runtime.store.goalDir, "mailbox/inbox/s1.md"))).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("a goal hold drains dispatch and parks the in-flight task", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1 } });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("gamma", { scope: ["gamma.txt"] }));

      harness.script(
        implementer("alpha.txt", async () => {
          await postSteer(runtime.store, "s1", "Stop the goal.");
        })
      );
      harness.script((req, ctx) => {
        writeHold(runtime, "s1", [], true);
        ctx.writeOutcome(outcome({ summary: "goal held" }));
        return fakeTurnResult(req);
      });

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("drained");
      expect(dispatched.cause).toBe("steer: s1 goal hold");
      const state = await tasks(runtime);
      expect(state.tasks.alpha!.status).toBe("parked");
      expect(state.tasks.alpha!.cause).toBe("steer: s1");
      expect(state.tasks.gamma!.status).toBe("ready");
      expect((await runtime.store.listRecords()).some((r) => r.slug === "gamma")).toBe(false);
      expect(harness.calls).toHaveLength(2);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("charges the steer PM turn to the iteration dollar brake", async () => {
    const { repo, goal } = setupFlowRepo({ limits: { concurrency: 1, iterationUsd: 5 } });
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
      // If the PM turn were free, gamma would run and need these.
      harness.script(implementer("gamma.txt"));
      harness.script(approver("gamma is correct"));

      const dispatched = await runDispatch(runtime, { iteration: 1 });
      expect(dispatched.reason).toBe("drained");
      expect(dispatched.cause).toContain("budget: iteration USD limit $5.0000 reached");
      const state = await tasks(runtime);
      expect(state.tasks.alpha!.status).toBe("parked");
      expect(state.tasks.gamma!.status).toBe("ready");
      expect((await runtime.store.listRecords()).some((r) => r.slug === "gamma")).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
