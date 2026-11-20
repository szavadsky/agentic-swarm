// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { spikeReportPath } from "../../src/kernel/spike-report.js";
import { task, cause, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  scriptStallLeave,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";
import { formatCause } from "../../src/kernel/cause.js";

describe("empty diff", () => {
  it("parks a task whose implement turn commits nothing instead of running the reviewer", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "reported done without a change" }),
        );
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["task"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("parked");
      expect(state.tasks.task!.cause?.kind === "empty-diff").toBe(true);
      expect(harness.calls.length).toBe(2);
      expect(
        records.filter((r) => r.slug === "task" && r.step === "review"),
      ).toEqual([]);
      expect(
        records.filter(
          (r) =>
            r.slug === "task" &&
            r.step === "park" &&
            r.cause?.kind === "empty-diff",
        ),
      ).toHaveLength(1);
      expect(
        repo.git(["show", "factory/demo:task.txt"], { allowFail: true }).code,
      ).not.toBe(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
  it("carries an empty gate fix to review when the following checks go green", async () => {
    // m5-kept-land (i30): the fix turn verified the work and committed nothing
    // while the red was a twice-red flake; the checks on the same tree came
    // back green. The task must reach review instead of parking empty-diff.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-gatefix-"));
    const count = path.join(dir, "count");
    const quote = (value: string): string => `'${value}'`;
    // Red on the first two runs (initial + the flake re-run), then green: no
    // gate-flake record, one red checks record, and the fix turn runs.
    const twiceRed =
      `echo run >> ${quote(count)}; ` +
      `if [ "$(grep -c . ${quote(count)})" -ge 3 ]; then exit 0; ` +
      `else printf 'src/t.test.ts:\\n(fail) suite > broken test\\n'; exit 1; fi`;
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "unit", command: twiceRed }],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v1" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        // Writes nothing: the failure did not reproduce.
        ctx.writeOutcome(
          outcome({ summary: "verified done; no change needed" }),
        );
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

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      expect(harness.calls).toHaveLength(3);

      const checks = records.filter(
        (r) => r.slug === "task" && r.step === "checks",
      );
      expect(checks).toHaveLength(2);
      expect(checks[0]!.ok).toBe(false);
      expect(checks[1]!.ok).toBe(true);
      expect(checks[0]!.tree).toBe(checks[1]!.tree);
      expect(
        records.filter((r) => r.slug === "task" && r.step === "gate-flake"),
      ).toHaveLength(0);
      expect(
        records.filter((r) => r.slug === "task" && r.step === "park"),
      ).toHaveLength(0);
      // Initial + re-run (both red) and the post-fix checks; the merge skips
      // its gates on the already-judged tree.
      const runs = fs.readFileSync(count, "utf8").trim().split("\n").length;
      expect(runs).toBe(3);
    } finally {
      cleanupFlowRepo(repo);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("does not empty-diff park a spike turn; the missing report earns a gate fix", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "the cache approach holds; no artifact needed" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        fs.mkdirSync(path.join(req.cwd!, ".factory/spikes"), {
          recursive: true,
        });
        fs.writeFileSync(
          path.join(req.cwd!, spikeReportPath("probe")),
          "# Finding\n\nThe cache approach holds.\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "report committed" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "finding is sound", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("probe", { kind: "spike", flow: "spike", scope: ["finding.md"] }),
      );
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.probe!.status).toBe("finished");
      expect(state.tasks.probe!.cause).toBeUndefined();
      expect(harness.calls.length).toBe(3);
      expect(
        records.filter((r) => r.slug === "probe" && r.step === "park"),
      ).toEqual([]);
      expect(
        records.filter(
          (r) => r.slug === "probe" && r.step === "finish" && r.ok === true,
        ),
      ).toHaveLength(1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("continuation carry", () => {
  it("lands a no-change first turn carrying kept work past checks to review", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "alpha rejected", verdict: "reject" }),
        );
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["alpha"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      let sawAlpha = false;
      harness.script((req, ctx) => {
        sawAlpha = fs.existsSync(path.join(req.cwd!, "alpha.txt"));
        ctx.writeOutcome(
          outcome({ summary: "kept branch already meets done-when" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "beta approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      await writeTask(
        runtime,
        task("beta", { base: "alpha", scope: ["alpha.txt"] }),
      );
      const result = await runDispatch(runtime, { iteration: 2 });
      expect(result.reason).toBe("boundary");
      expect(sawAlpha).toBe(true);

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.beta!.status).toBe("merged");
      expect(
        records.filter((r) => r.slug === "beta" && r.step === "park"),
      ).toEqual([]);
      expect(
        records.filter((r) => r.slug === "beta" && r.step === "checks"),
      ).toHaveLength(1);
      expect(
        records.filter((r) => r.slug === "beta" && r.step === "review"),
      ).toHaveLength(1);
      const advance = records.find(
        (r) => r.slug === "beta" && r.step === "base-advance",
      );
      expect(advance?.headTree).toBeDefined();
      expect(advance?.tree).not.toBe(advance?.headTree);
      const firstImplement = records
        .filter(
          (r) =>
            r.slug === "beta" && r.step === "implement" && r.actor === "agent",
        )
        .sort((a, b) => a.seq - b.seq)[0];
      expect(firstImplement?.tree).toBe(advance?.tree);
      expect(repo.git(["show", "factory/demo:alpha.txt"]).stdout.trim()).toBe(
        "alpha",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("lands a no-change first turn carrying kept work past checks to merge on just-implement", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "alpha rejected", verdict: "reject" }),
        );
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["alpha"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "kept branch already meets done-when" }),
        );
        return fakeTurnResult(req);
      });
      await writeTask(
        runtime,
        task("beta", {
          base: "alpha",
          flow: "just-implement",
          scope: ["alpha.txt"],
        }),
      );
      const result = await runDispatch(runtime, { iteration: 2 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.beta!.status).toBe("merged");
      expect(
        records.filter((r) => r.slug === "beta" && r.step === "park"),
      ).toEqual([]);
      expect(
        records.filter((r) => r.slug === "beta" && r.step === "checks"),
      ).toHaveLength(1);
      expect(
        records.filter((r) => r.slug === "beta" && r.step === "review"),
      ).toEqual([]);
      const advance = records.find(
        (r) => r.slug === "beta" && r.step === "base-advance",
      );
      expect(advance?.headTree).toBeDefined();
      expect(advance?.tree).not.toBe(advance?.headTree);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("parks empty-diff when the kept work is already on the head", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "alpha rejected", verdict: "reject" }),
        );
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["alpha"]);
      scriptStallLeave(harness, ["beta"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const checkout = goalCheckout(repo, goal);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      // Another landing puts the same tree on the head: the kept branch
      // carries nothing beyond it.
      fs.writeFileSync(path.join(checkout, "alpha.txt"), "alpha\n", "utf8");
      repo.git(["add", "-A"], { cwd: checkout });
      repo.git(["commit", "-m", "factory: land same alpha"], { cwd: checkout });

      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "nothing to do" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "should never review", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      await writeTask(
        runtime,
        task("beta", { base: "alpha", scope: ["alpha.txt"] }),
      );
      const result = await runDispatch(runtime, { iteration: 2 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.beta!.status).toBe("parked");
      expect(causeText(state.tasks.beta!.cause)).toStartWith("empty-diff:");
      expect(causeText(state.tasks.beta!.cause)).toContain(
        "already on the head",
      );
      expect(
        records.filter((r) => r.slug === "beta" && r.step === "review"),
      ).toEqual([]);
      expect(
        records.filter(
          (r) => r.slug === "beta" && r.step === "merge" && r.ok === true,
        ),
      ).toEqual([]);
      const advance = records.find(
        (r) => r.slug === "beta" && r.step === "base-advance",
      );
      expect(advance?.headTree).toBeDefined();
      expect(advance?.tree).toBe(advance?.headTree);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("review last call", () => {
  function reviewCalls(harness: FakeHarness) {
    return harness.calls.filter(
      (req) => fakeTurnIdentity(req).step === "review",
    );
  }

  it("renders the last-call prompt on the third review and refuses changes", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const implement = (content: string) => (req: any, ctx: any) => {
        fs.writeFileSync(
          path.join(req.cwd!, "task.txt"),
          `${content}\n`,
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: `wrote ${content}` }));
        return fakeTurnResult(req);
      };
      const changes = (summary: string) => (req: any, ctx: any) => {
        ctx.writeOutcome(outcome({ summary, verdict: "changes" }));
        return fakeTurnResult(req);
      };
      harness.script(implement("v1"));
      harness.script(changes("1. task.txt: needs v2"));
      harness.script(implement("v2"));
      harness.script(changes("1. task.txt: needs v3"));
      harness.script(implement("v3"));
      harness.script(changes("1. task.txt: still rough"));
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "ships with recorded debt",
            verdict: "approve",
            concerns: [
              {
                kind: "risk",
                calibration: "architect",
                text: "last call concern",
              },
            ],
          }),
        );
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const reviews = reviewCalls(harness);
      expect(reviews).toHaveLength(4);
      expect(reviews[0]!.prompt).toContain(
        "- `changes`: actionable findings for the next round.",
      );
      expect(reviews[0]!.prompt).toContain("round: `1` of `3`");
      expect(reviews[1]!.prompt).toContain("round: `2` of `3`");
      expect(reviews[1]!.prompt).toContain(
        "- `changes`: actionable findings for the next round.",
      );
      expect(reviews[2]!.prompt).toContain("round: `3` of `3`");
      expect(reviews[2]!.prompt).toContain("This is the last call");
      expect(reviews[2]!.prompt).not.toContain(
        "- `changes`: actionable findings for the next round.",
      );
      expect(reviews[3]!.prompt).toContain(
        '- verdict "changes" is not available on the last review call: approve with concerns, or reject',
      );

      const records = await runtime.store.listRecords();
      const lastReview = records.find(
        (r) =>
          r.slug === "task" &&
          r.step === "review" &&
          r.round === 3 &&
          r.actor === "agent",
      );
      expect(lastReview?.outcome?.verdict).toBe("approve");
      expect(lastReview?.repairFindings).toContain(
        'verdict "changes" is not available on the last review call: approve with concerns, or reject',
      );
      const debt = records.find((r) => r.slug === "task" && r.step === "debt");
      expect(debt?.outcome?.concerns[0]?.kind).toBe("debt");
      expect(debt?.outcome?.concerns[0]?.text).toBe("last call concern");

      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      expect(state.tasks.task!.round).toBe(3);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("parks a reject on the spike's only review and keeps its branch", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(
          path.join(req.cwd!, "finding.md"),
          "# Finding\n\nUse the cache.\n",
          "utf8",
        );
        fs.mkdirSync(path.join(req.cwd!, ".factory/spikes"), {
          recursive: true,
        });
        fs.writeFileSync(
          path.join(req.cwd!, spikeReportPath("probe")),
          "# Finding\n\nUse the cache.\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "finding written" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "not worth shipping", verdict: "reject" }),
        );
        return fakeTurnResult(req);
      });
      scriptStallLeave(harness, ["probe"]);

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("probe", { kind: "spike", flow: "spike", scope: ["finding.md"] }),
      );
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const reviews = reviewCalls(harness);
      expect(reviews).toHaveLength(1);
      expect(reviews[0]!.prompt).toContain("round: `1` of `1`");
      expect(reviews[0]!.prompt).toContain("This is the last call");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.probe!.status).toBe("parked");
      expect(causeText(state.tasks.probe!.cause)).toContain("review-rejected");
      expect(
        repo.git(["show", "factory-task/demo/probe:finding.md"]).stdout.trim(),
      ).toBe("# Finding\n\nUse the cache.");
      expect(
        repo.git(["show", "factory/demo:finding.md"], { allowFail: true }).code,
      ).not.toBe(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("returns a reply-only fix to review and consumes a change request", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "v1" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "1. task.txt: needs v2", verdict: "changes" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "replied without a change",
            replies: [{ finding: 1, reply: "already covered in v1" }],
          }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({
            summary: "1. task.txt: still needs v2",
            verdict: "changes",
          }),
        );
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

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const reviews = reviewCalls(harness);
      expect(reviews).toHaveLength(3);
      expect(reviews[1]!.prompt).toContain("round: `2` of `3`");
      expect(reviews[1]!.prompt).toContain(
        "- `changes`: actionable findings for the next round.",
      );
      expect(reviews[2]!.prompt).toContain("round: `3` of `3`");
      expect(reviews[2]!.prompt).toContain("This is the last call");

      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("merged");
      expect(state.tasks.task!.round).toBe(3);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("spikes", () => {
  it("finishes a spike without merging and keeps its branch", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(
          path.join(req.cwd!, "finding.md"),
          "# Finding\n\nUse the cache.\n",
          "utf8",
        );
        fs.mkdirSync(path.join(req.cwd!, ".factory/spikes"), {
          recursive: true,
        });
        fs.writeFileSync(
          path.join(req.cwd!, spikeReportPath("probe")),
          "# Finding\n\nUse the cache.\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "finding written" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "finding is sound", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("probe", { kind: "spike", flow: "spike", scope: ["finding.md"] }),
      );
      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.probe!.status).toBe("finished");
      expect(
        records.filter((r) => r.slug === "probe" && r.step === "merge").length,
      ).toBe(0);
      expect(
        records.filter(
          (r) => r.slug === "probe" && r.step === "finish" && r.ok === true,
        ).length,
      ).toBe(1);
      expect(
        repo.git([
          "rev-parse",
          "--verify",
          "refs/heads/factory-task/demo/probe",
        ]).code,
      ).toBe(0);
      expect(
        repo.git(["show", "factory/demo:finding.md"], { allowFail: true }).code,
      ).not.toBe(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
