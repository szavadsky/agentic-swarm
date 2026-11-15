import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { portable, type SessionRef } from "../../src/harness/types.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { resumeSessionFor } from "../../src/kernel/flow-context.js";
import { ensureTaskWorktree } from "../../src/kernel/worktree.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

/** Implement, get `changes`, fix, get `approve`: the resume path of a fix round. */
function scriptFixRound(harness: FakeHarness): void {
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "v1" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "needs a fix", verdict: "changes" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v2\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "v2" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
}

/** A harness whose compaction backend is down; every other behaviour is the fake's. */
class FailingCompactHarness extends FakeHarness {
  attempts = 0;

  override async compact(_ref: SessionRef): Promise<SessionRef> {
    this.attempts += 1;
    throw new Error("compact backend down");
  }
}

describe("session portability", () => {
  it("admits only same-harness resume edges", () => {
    expect(portable("omp", "omp")).toBe(true);
    expect(portable("omp", "opencode")).toBe(false);
  });

  it("resumes the recording harness and refuses a session the alias no longer routes to", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const fake = new FakeHarness({ id: "fake" });
      fake.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "done\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });
      const runtime = await makeRuntime(repo, goal, {
        fake,
        other: new FakeHarness({ id: "other" }),
      });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      const records = await runtime.store.listRecords();
      const taskFile = (await runtime.store.listTasks()).find(
        (t) => t.slug === "task",
      )!;
      const worktree = (await ensureTaskWorktree(runtime, taskFile)).path;
      const recorded = records.find(
        (r) => r.slug === "task" && r.step === "implement",
      )!.session!;
      expect(recorded.compacted).toBe(true);

      const resumed = await resumeSessionFor(
        runtime,
        taskFile,
        "implementer",
        records,
        worktree,
      );
      expect(resumed?.id).toBe(recorded.id);

      // Rotation: the same alias now routes to a different harness.
      runtime.configs.run.aliases.implementer!.harness = "other";
      expect(
        await resumeSessionFor(
          runtime,
          taskFile,
          "implementer",
          records,
          worktree,
        ),
      ).toBeUndefined();
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("end-of-turn compaction", () => {
  it("does not compact a turn that ends in an infra stop", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) =>
        fakeTurnResult(req, { stop: { kind: "infra", cause: "timeout" } }),
      );

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "infra",
      );

      expect(harness.compactions).toHaveLength(0);
      const record = (await runtime.store.listRecords()).find(
        (r) => r.step === "implement",
      )!;
      expect(record.session?.compacted).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("does not compact a turn that ends in a refusal", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) =>
        fakeTurnResult(req, {
          stop: { kind: "refusal", details: "content policy" },
        }),
      );

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      expect(harness.compactions).toHaveLength(0);
      const record = (await runtime.store.listRecords()).find(
        (r) => r.step === "implement",
      )!;
      expect(record.session?.compacted).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("keeps the uncompacted ref when compaction fails and still resumes it", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FailingCompactHarness({ id: "fake" });
      scriptFixRound(harness);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      expect(harness.attempts).toBe(4);
      const implement = (await runtime.store.listRecords())
        .filter((r) => r.slug === "task" && r.step === "implement")
        .sort((a, b) => a.seq - b.seq);
      expect(implement.map((r) => r.session?.compacted)).toEqual([
        false,
        false,
      ]);
      // The failed compaction cost no session: the fix turn still resumed it.
      expect(harness.calls[2]!.session?.id).toBe(implement[0]!.session?.id);
      expect(harness.calls[2]!.session?.compacted).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("does not compact or precondition a resume on a harness that cannot compact", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({
        id: "fake",
        caps: { compact: "none" },
      });
      scriptFixRound(harness);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      expect(harness.compactions).toHaveLength(0);
      const implement = (await runtime.store.listRecords())
        .filter((r) => r.slug === "task" && r.step === "implement")
        .sort((a, b) => a.seq - b.seq);
      expect(implement.map((r) => r.session?.compacted)).toEqual([
        false,
        false,
      ]);
      expect(harness.calls[2]!.session?.id).toBe(implement[0]!.session?.id);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
