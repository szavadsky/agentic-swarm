import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { GATE_LAST_CALL_TEXT } from "../../src/kernel/prompts.js";
import { task } from "./helpers.js";
import { formatCause } from "../../src/kernel/cause.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  scriptDecider,
  scriptStallLeave,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

function scriptFix(harness: FakeHarness): void {
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

/** The packaged implement-review flow with per-step follow-up overrides. */
function followUpFlow(
  implement?: Record<string, unknown>,
  review?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    flows: {
      "implement-review": {
        steps: [
          {
            id: "implement",
            prompt: "implementer",
            alias: "implementer",
            ...(implement ? { followUp: implement } : {}),
          },
          {
            id: "review",
            prompt: "reviewer",
            alias: "reviewer",
            review: true,
            changeRequests: 2,
            deliverable: "verdict",
            ...(review ? { followUp: review } : {}),
          },
        ],
      },
    },
  };
}

const strongAliases = {
  architect: { harness: "fake", model: "fake-architect" },
  pm: { harness: "fake", model: "fake-pm" },
  implementer: { harness: "fake", model: "fake-impl" },
  reviewer: { harness: "fake", model: "fake-review" },
  steward: { harness: "fake", model: "fake-steward" },
  "plan-checker": { harness: "fake", model: "fake-check" },
  intent: { harness: "fake", model: "fake-intent" },
  "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
  "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
  "implementer-strong": { harness: "fake", model: "fake-strong" },
  "reviewer-strong": { harness: "fake", model: "fake-review-strong" },
};

async function honorsChecksStepChangeRequests1ByPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const processYaml = [
    "flows:",
    "  implement-review:",
    "    steps:",
    "      - id: implement",
    "        prompt: implementer",
    "        alias: implementer",
    "      - id: checks",
    "        changeRequests: 1",
    "      - id: review",
    "        prompt: reviewer",
    "        alias: reviewer",
    "        review: true",
    "",
  ].join("\n");
  repo.writeFile(".factory/process.yaml", processYaml);

  const harness = new FakeHarness({ id: "fake" });
  const prompts: string[] = [];

  // Initial turn creates broken.txt
  harness.script((req, ctx) => {
    prompts.push(req.prompt ?? "");
    fs.writeFileSync(path.join(req.cwd!, "broken.txt"), "bad\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "wrote broken" }));
    return fakeTurnResult(req);
  });
  // Fix 1
  harness.script((req, ctx) => {
    prompts.push(req.prompt ?? "");
    fs.writeFileSync(path.join(req.cwd!, "fix-1.txt"), "f1\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "fix 1" }));
    return fakeTurnResult(req);
  });
  // Fix 2 (last call)
  harness.script((req, ctx) => {
    prompts.push(req.prompt ?? "");
    fs.writeFileSync(path.join(req.cwd!, "fix-2.txt"), "f2\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "fix 2" }));
    return fakeTurnResult(req);
  });
  scriptDecider(harness, {
    summary: "the red repeats after the last gate fix; keep the branch parked",
    verdict: "reject",
  });
  scriptStallLeave(harness, ["task"]);

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(
    runtime,
    task("task", { scope: ["broken.txt", "fix-1.txt", "fix-2.txt"] }),
  );

  return { prompts, runtime };
}

async function honorsChecksStepChangeRequests1ByPart2(
  scope: Awaited<ReturnType<typeof honorsChecksStepChangeRequests1ByPart1>>,
) {
  const { runtime, prompts } = scope;
  const result = await runDispatch(runtime, { iteration: 1 });
  expect(result.reason).toBe("boundary");

  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );

  expect(state.tasks.task!.status).toBe("parked");
  expect(state.tasks.task!.cause?.kind).toBe("gates");
  expect(formatCause(state.tasks.task!.cause!)).toContain("unit");

  // Initial + Fix 1 + Fix 2 = 3 turns
  expect(prompts).toHaveLength(3);
  expect(prompts[1]).not.toContain(GATE_LAST_CALL_TEXT);
  expect(prompts[2]).toContain(GATE_LAST_CALL_TEXT);
}

function registerFixRoundFollowUpModesPart4(): void {
  it("different-model keepSession resumes the same-harness compacted transcript", async () => {
    const { repo, goal } = setupFlowRepo({
      process: followUpFlow({
        mode: "different-model",
        alias: "implementer-strong",
        keepSession: true,
      }),
      aliases: strongAliases,
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptFix(harness);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      const records = await runtime.store.listRecords();
      const implement = records
        .filter((r) => r.slug === "task" && r.step === "implement")
        .sort((a, b) => a.seq - b.seq);
      const review = records
        .filter((r) => r.slug === "task" && r.step === "review")
        .sort((a, b) => a.seq - b.seq);
      expect(implement.map((r) => r.alias)).toEqual([
        "implementer",
        "implementer-strong",
      ]);
      expect(harness.calls[2]!.model.id).toBe("fake-strong");
      expect(harness.calls[2]!.session?.id).toBe(implement[0]!.session!.id);
      expect(harness.calls[2]!.session?.compacted).toBe(true);
      // The switch added no compaction: the resumed ref was compacted by the
      // turn that ended it, and each turn still compacts its own session.
      expect(harness.compactions.map((c) => c.id)).toEqual([
        implement[0]!.session!.id,
        review[0]!.session!.id,
        implement[1]!.session!.id,
        review[1]!.session!.id,
      ]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerFixRoundFollowUpModesPart5(): void {
  it("honours followUp per step: the review switch leaves the fix on its alias", async () => {
    const { repo, goal } = setupFlowRepo({
      process: followUpFlow(undefined, {
        mode: "different-model",
        alias: "reviewer-strong",
        keepSession: true,
      }),
      aliases: strongAliases,
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptFix(harness);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      const records = await runtime.store.listRecords();
      const implement = records
        .filter((r) => r.slug === "task" && r.step === "implement")
        .sort((a, b) => a.seq - b.seq);
      const review = records
        .filter((r) => r.slug === "task" && r.step === "review")
        .sort((a, b) => a.seq - b.seq);
      // The implement step keeps the kernel default: the fix resumes the
      // implementer session on its own alias.
      expect(implement.map((r) => r.alias)).toEqual([
        "implementer",
        "implementer",
      ]);
      expect(harness.calls[2]!.session?.id).toBe(implement[0]!.session!.id);
      // The review step switches model and keeps its own r1 session.
      expect(review.map((r) => r.alias)).toEqual([
        "reviewer",
        "reviewer-strong",
      ]);
      expect(harness.calls[3]!.model.id).toBe("fake-review-strong");
      expect(harness.calls[3]!.session?.id).toBe(review[0]!.session!.id);
      expect(harness.calls[3]!.session?.compacted).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerWorktreeSetupPart1(): void {
  it("runs the setup step in a fresh worktree before gates", async () => {
    const { repo, goal } = setupFlowRepo({
      setup: ["printf ready > dependency.txt"],
      gates: [{ id: "dependency", command: "test -f dependency.txt" }],
    });
    try {
      repo.writeFile(".gitignore", "dependency.txt\n");
      repo.commit("ignore setup artifact");
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "task\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      expect(harness.calls.length).toBe(3);
      expect(state.epics).toEqual({});
      expect(state.tasks.task!.epic).toBeUndefined();
      const taskRecords = (await runtime.store.listRecords()).filter(
        (record) => record.slug === "task",
      );
      expect(taskRecords.length).toBeGreaterThan(0);
      expect(taskRecords.map((record) => record.architect)).toEqual(
        taskRecords.map(() => "main"),
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerWorktreeSetupPart2(): void {
  it("parks a failed setup with the task's architect", async () => {
    const { repo, goal } = setupFlowRepo({ setup: ["false"] });
    try {
      const harness = new FakeHarness({ id: "fake" });
      scriptStallLeave(harness, ["auth.alpha"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("auth.alpha", { scope: ["task.txt"], epic: "auth" }),
      );
      await runDispatch(runtime, { iteration: 1 });

      const records = await runtime.store.listRecords();
      const park = records.find(
        (record) => record.slug === "auth.alpha" && record.step === "park",
      );
      expect(park?.cause?.kind).toBe("setup");
      expect(park?.architect).toBe("auth");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("fix-round follow-up modes", () => {
  registerFixRoundFollowUpModesPart4();

  registerFixRoundFollowUpModesPart5();
});

describe("worktree setup", () => {
  registerWorktreeSetupPart1();

  registerWorktreeSetupPart2();
});

describe("checks step bound and last call", () => {
  it("honors checks step changeRequests: 1 by rendering last call on the 2nd fix turn and parking on 2nd failure", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "unit", command: "test ! -f broken.txt" }],
    });
    try {
      const scope1 = await honorsChecksStepChangeRequests1ByPart1(repo, goal);
      await honorsChecksStepChangeRequests1ByPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
