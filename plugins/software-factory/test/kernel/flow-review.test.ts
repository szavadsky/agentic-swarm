import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
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
import type { KernelRuntime } from "../../src/kernel/types.js";

async function landsNoChangeFirstTurnCarryingKeptPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "alpha rejected", verdict: "reject" }));
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
  expect(records.filter((r) => r.slug === "beta" && r.step === "park")).toEqual(
    [],
  );

  return { records };
}

async function landsNoChangeFirstTurnCarryingKeptPart2(
  scope: Awaited<ReturnType<typeof landsNoChangeFirstTurnCarryingKeptPart1>>,
) {
  const { records } = scope;
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
}

async function carriesEmptyGateFixReviewWhenPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "task.txt"), "v1\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "v1" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    // Writes nothing: the failure did not reproduce.
    ctx.writeOutcome(outcome({ summary: "verified done; no change needed" }));
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
  // Implement, the empty gate fix, QA's acceptance, and the review.
  expect(harness.calls).toHaveLength(4);

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
}

async function carriesEmptyGateFixReviewWhenPart2(count: string) {
  const runs = fs.readFileSync(count, "utf8").trim().split("\n").length;
  expect(runs).toBe(3);
}

async function landsNoChangeFirstTurnCarryingKeptPart1_1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "alpha rejected", verdict: "reject" }));
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
    ctx.writeOutcome(outcome({ summary: "beta approved", verdict: "approve" }));
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

  return { runtime, records };
}

async function landsNoChangeFirstTurnCarryingKeptPart2_1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  scope: Awaited<ReturnType<typeof landsNoChangeFirstTurnCarryingKeptPart1_1>>,
) {
  const { runtime, records } = scope;
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.beta!.status).toBe("merged");
  expect(records.filter((r) => r.slug === "beta" && r.step === "park")).toEqual(
    [],
  );
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
      (r) => r.slug === "beta" && r.step === "implement" && r.actor === "agent",
    )
    .sort((a, b) => a.seq - b.seq)[0];
  expect(firstImplement?.tree).toBe(advance?.tree);
  expect(repo.git(["show", "factory/demo:alpha.txt"]).stdout.trim()).toBe(
    "alpha",
  );
}

function registerEmptyDiffPart1(): void {
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
}

function registerEmptyDiffPart2(): void {
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
      await carriesEmptyGateFixReviewWhenPart1(repo, goal);
      await carriesEmptyGateFixReviewWhenPart2(count);
    } finally {
      cleanupFlowRepo(repo);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
}

/** Asserts the spike finished and its missing report earned a gate fix. */
function expectSpikeFinished(
  state: ReturnType<typeof derive>,
  records: Awaited<ReturnType<KernelRuntime["store"]["listRecords"]>>,
  harness: FakeHarness,
): void {
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
}

function registerEmptyDiffPart3(): void {
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
      expectSpikeFinished(state, records, harness);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("empty diff", () => {
  registerEmptyDiffPart1();

  registerEmptyDiffPart2();

  registerEmptyDiffPart3();
});

describe("continuation carry", () => {
  it("lands a no-change first turn carrying kept work past checks to review", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await landsNoChangeFirstTurnCarryingKeptPart1_1(
        repo,
        goal,
      );
      await landsNoChangeFirstTurnCarryingKeptPart2_1(repo, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("lands a no-change first turn carrying kept work past checks to merge on just-implement", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await landsNoChangeFirstTurnCarryingKeptPart1(repo, goal);
      await landsNoChangeFirstTurnCarryingKeptPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
