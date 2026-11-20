// biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: split-rest-functions
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { resolveTurn, stepTarget } from "../../src/kernel/flow-context.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

const aliases = {
  architect: { harness: "fake", model: "fake-architect" },
  pm: { harness: "fake", model: "fake-pm" },
  implementer: { harness: "fake", model: "fake-impl" },
  reviewer: { harness: "fake", model: "fake-review" },
  steward: { harness: "fake", model: "fake-steward" },
  "plan-checker": { harness: "fake", model: "fake-check" },
  intent: { harness: "fake", model: "fake-intent" },
  "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
  "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
  escalation: {
    harness: "expensive",
    model: "fake-escalated",
    effort: "high",
    fallbacks: [{ model: "fake-fallback" }],
    timeouts: { idleMs: 123, wallMs: 456 },
  },
};

describe("task tier resolution", () => {
  it("runs the producer on the tier alias and leaves review on the reviewer alias", async () => {
    const { repo, goal } = setupFlowRepo({ aliases });
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
        expensive: new FakeHarness({ id: "expensive" }),
      });
      const escalated = task("escalated", { tier: "escalation" });
      const plain = task("plain");
      const escalatedState = derive(
        [escalated],
        [],
        runtime.configs.process.flows,
      ).tasks.escalated!;
      const plainState = derive([plain], [], runtime.configs.process.flows)
        .tasks.plain!;

      const escalatedTarget = stepTarget(
        runtime,
        escalated,
        escalatedState,
        "implement",
        1,
      );
      expect(escalatedTarget.alias).toBe("escalation");
      // A tier moves the same prompt to another alias; it declares no role.
      expect(escalatedTarget.prompt).toBe("implementer");
      expect(
        stepTarget(runtime, escalated, escalatedState, "review", 1).alias,
      ).toBe("reviewer");
      expect(stepTarget(runtime, plain, plainState, "implement", 1).alias).toBe(
        "implementer",
      );

      // A tier value is an alias name; `default` is no override.
      expect(
        resolveTurn(runtime, "implementer", "implementer", "default").alias,
      ).toBe("implementer");
      expect(
        resolveTurn(runtime, "implementer", "implementer", "escalation"),
      ).toMatchObject({
        alias: "escalation",
        model: { id: "fake-escalated", effort: "high" },
        effort: "high",
        tierOffset: 0,
        timeouts: { idleMs: 123, wallMs: 456 },
      });
      const tiers = resolveTurn(
        runtime,
        "implementer",
        "implementer",
        "escalation",
      ).tiers;
      expect(tiers.map((tier) => tier.harness.id)).toEqual([
        "expensive",
        "expensive",
      ]);
      expect(tiers.map((tier) => tier.model)).toEqual([
        { id: "fake-escalated", effort: "high" },
        { id: "fake-fallback", effort: "high" },
      ]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("admits and runs the escalated implement turn on the escalation alias", async () => {
    const { repo, goal } = setupFlowRepo({ aliases });
    try {
      const fake = new FakeHarness({ id: "fake" });
      const expensive = new FakeHarness({ id: "expensive" });
      expensive.script((req, ctx) => {
        fs.writeFileSync(
          path.join(req.cwd!, "task.txt"),
          "escalated\n",
          "utf8",
        );
        ctx.writeOutcome(
          outcome({ summary: "implemented on the escalation tier" }),
        );
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake, expensive });
      await writeTask(
        runtime,
        task("task", { tier: "escalation", scope: ["task.txt"] }),
      );

      const taskFile = (await runtime.store.listTasks()).find(
        (t) => t.slug === "task",
      )!;
      const initialState = derive([taskFile], [], runtime.configs.process.flows)
        .tasks.task!;
      const admitted = stepTarget(
        runtime,
        taskFile,
        initialState,
        "implement",
        1,
      );
      expect(admitted.harness.id).toBe("expensive");

      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );

      // Admission and the turn agree: the escalation harness is the one that ran it.
      expect(expensive.calls).toHaveLength(1);
      expect(expensive.calls[0]!.model.id).toBe(admitted.model.id);
      expect(expensive.calls[0]!.effort).toBe("high");
      // The kernel walks the tiers; the adapter sees one model, no chain.
      expect(expensive.calls[0]!.fallbacks).toBeUndefined();
      // QA then runs on its own alias, and the review on the reviewer's.
      expect(fake.calls).toHaveLength(2);

      const records = await runtime.store.listRecords();
      const implement = records.find(
        (r) => r.slug === "task" && r.step === "implement",
      )!;
      const review = records.find(
        (r) => r.slug === "task" && r.step === "review",
      )!;
      expect(implement.alias).toBe("escalation");
      expect(implement.model?.id).toBe("fake-escalated");
      expect(implement.session?.harness).toBe(admitted.harness.id);
      expect(review.alias).toBe("reviewer");
      expect(review.model?.id).toBe("fake-review");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("resumes a fix turn after an escalated implement on the escalation alias", async () => {
    const { repo, goal } = setupFlowRepo({ aliases });
    try {
      const fake = new FakeHarness({ id: "fake" });
      const expensive = new FakeHarness({ id: "expensive" });
      expensive.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v1" }));
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "needs a fix", verdict: "changes" }),
        );
        return fakeTurnResult(req);
      });
      expensive.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v2\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v2" }));
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake, expensive });
      await writeTask(
        runtime,
        task("task", { tier: "escalation", scope: ["task.txt"] }),
      );
      await runDispatch(runtime, { iteration: 1 });

      expect(expensive.calls).toHaveLength(2);
      expect(expensive.calls[1]!.session).toBeDefined();
      expect(expensive.calls[1]!.session?.compacted).toBe(true);

      const records = await runtime.store.listRecords();
      const implement = records.filter(
        (r) => r.slug === "task" && r.step === "implement",
      );
      const review = records.filter(
        (r) => r.slug === "task" && r.step === "review",
      );
      expect(expensive.calls[1]!.session?.id).toBe(implement[0]!.session?.id);
      expect(implement.map((r) => r.alias)).toEqual([
        "escalation",
        "escalation",
      ]);
      expect(review.map((r) => r.alias)).toEqual(["reviewer", "reviewer"]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
