import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { spikeReportPath } from "../../src/kernel/spike-report.js";
import { task, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  scriptDecider,
  scriptStallLeave,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

function reviewCalls(harness: FakeHarness) {
  return harness.calls.filter((req) => fakeTurnIdentity(req).step === "review");
}

async function parksRejectSpikeSOnlyReviewKeepsPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
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

  return { state };
}

async function parksRejectSpikeSOnlyReviewKeepsPart2(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  scope: Awaited<ReturnType<typeof parksRejectSpikeSOnlyReviewKeepsPart1>>,
) {
  const { state } = scope;
  expect(state.tasks.probe!.status).toBe("parked");
  expect(causeText(state.tasks.probe!.cause)).toContain("review-rejected");
  expect(
    repo.git(["show", "factory-task/demo/probe:finding.md"]).stdout.trim(),
  ).toBe("# Finding\n\nUse the cache.");
  expect(
    repo.git(["show", "factory/demo:finding.md"], { allowFail: true }).code,
  ).not.toBe(0);
}

async function returnsReplyOnlyFixReviewConsumesPart1(
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

  return { harness, runtime, result };
}

async function returnsReplyOnlyFixReviewConsumesPart2(
  scope: Awaited<ReturnType<typeof returnsReplyOnlyFixReviewConsumesPart1>>,
) {
  const { result, harness, runtime } = scope;
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
}

async function parksEmptyDiffWhenKeptWorkAlreadyPart1(
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
  scriptDecider(harness, {
    summary: "the kept work is already on the head",
    verdict: "reject",
  });
  await writeTask(
    runtime,
    task("beta", { base: "alpha", scope: ["alpha.txt"] }),
  );
  const result = await runDispatch(runtime, { iteration: 2 });
  expect(result.reason).toBe("boundary");

  const records = await runtime.store.listRecords();

  return { runtime, records };
}

async function parksEmptyDiffWhenKeptWorkAlreadyPart2(
  scope: Awaited<ReturnType<typeof parksEmptyDiffWhenKeptWorkAlreadyPart1>>,
) {
  const { runtime, records } = scope;
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.beta!.status).toBe("parked");
  expect(causeText(state.tasks.beta!.cause)).toContain(
    "the kept work is already on the head",
  );
  expect(
    records.filter((r) => r.slug === "beta" && r.step === "decide"),
  ).toHaveLength(1);
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
}

async function rendersLastCallPromptThirdReviewPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const implement = (content: string) => (req: any, ctx: any) => {
    fs.writeFileSync(path.join(req.cwd!, "task.txt"), `${content}\n`, "utf8");
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

  return { runtime, reviews };
}

async function rendersLastCallPromptThirdReviewPart2(
  scope: Awaited<ReturnType<typeof rendersLastCallPromptThirdReviewPart1>>,
) {
  const { reviews, runtime } = scope;
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
}

describe("continuation carry", () => {
  it("parks empty-diff when the kept work is already on the head", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const scope1 = await parksEmptyDiffWhenKeptWorkAlreadyPart1(repo, goal);
      await parksEmptyDiffWhenKeptWorkAlreadyPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});

describe("review last call", () => {
  it("renders the last-call prompt on the third review and refuses changes", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const scope1 = await rendersLastCallPromptThirdReviewPart1(repo, goal);
      await rendersLastCallPromptThirdReviewPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("parks a reject on the spike's only review and keeps its branch", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const scope1 = await parksRejectSpikeSOnlyReviewKeepsPart1(repo, goal);
      await parksRejectSpikeSOnlyReviewKeepsPart2(repo, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("returns a reply-only fix to review and consumes a change request", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const scope1 = await returnsReplyOnlyFixReviewConsumesPart1(repo, goal);
      await returnsReplyOnlyFixReviewConsumesPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
