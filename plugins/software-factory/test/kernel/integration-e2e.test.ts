import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { dispatch } from "../../src/cli/dispatch.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import type { GoalMetrics } from "../../src/kernel/metrics.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import {
  cleanup,
  expectDispatch,
  outcome,
  scriptDigest,
  scriptSteerRoutes,
  stateOf,
} from "./e2e-helpers.js";
import { scriptStallLeave, whenTurn } from "./s2-helpers.js";
import { formatCause } from "../../src/kernel/cause.js";
import { causeText } from "./helpers.js";

const PLAN_1 = `# Milestone 1

## alpha
Create alpha.txt.
Done when: alpha.txt exists.

## beta
Create beta.txt with the first direction.
Done when: beta.txt exists.

## gamma
Depends on beta landing; create gamma.txt.
Done when: gamma.txt exists.
`;

const PLAN_2 = `# Milestone 1

## alpha
Merged; alpha.txt stays.

## beta2
Continue the parked beta work on its kept branch; beta2.txt completes it.
Done when: beta2.txt exists beside beta.txt.

## gamma
Depends on beta2 landing; create gamma.txt.
Done when: gamma.txt exists.
`;

function task(
  slug: string,
  file: string,
  opts: { deps?: string[]; base?: string; body?: string } = {},
): string {
  return [
    "---",
    `slug: ${slug}`,
    `title: Create ${file}`,
    "kind: task",
    "flow: implement-review",
    `deps: [${(opts.deps ?? []).join(", ")}]`,
    `scope: [${file}]`,
    ...(opts.base ? [`base: ${opts.base}`] : []),
    "source: plan",
    "---",
    "",
    opts.body ?? `Create ${file}.`,
    "",
    `Done when: ${file} exists.`,
    "",
  ].join("\n");
}

const ALPHA = task("alpha", "alpha.txt");
const BETA = task("beta", "beta.txt");
const GAMMA_1 = task("gamma", "gamma.txt", { deps: ["beta"] });
const BETA_2 = task("beta2", "beta2.txt", { base: "beta" });
const GAMMA_2 = task("gamma", "gamma.txt", { deps: ["beta2"] });

function write(goalDir: string, rel: string, text: string): void {
  fs.mkdirSync(path.dirname(path.join(goalDir, rel)), { recursive: true });
  fs.writeFileSync(path.join(goalDir, rel), text, "utf8");
}

function writeTask(goalDir: string, slug: string, text: string): void {
  write(goalDir, `tasks/${slug}.md`, text);
}

/** One implement turn bound to its slug, so task order cannot borrow it. */
function scriptWriteTurn(harness: FakeHarness, slug: string, text: string) {
  harness.script(
    (req, ctx) => {
      write(req.cwd!, `${slug}.txt`, text);
      ctx.writeOutcome(outcome({ summary: `${slug} implemented` }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug, step: "implement" }) },
  );
}

/** One review turn bound to its slug, in call order for repeated rounds. */
function scriptVerdictTurn(
  harness: FakeHarness,
  slug: string,
  summary: string,
  verdict: string,
): void {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary, verdict }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug, step: "review" }) },
  );
}

function summaryOf(goalDir: string, iteration: number): string {
  return fs.readFileSync(
    path.join(goalDir, `iterations/${iteration}/summary.md`),
    "utf8",
  );
}

async function metricsOf(goalDir: string): Promise<GoalMetrics> {
  return yaml.parse(
    fs.readFileSync(path.join(goalDir, "metrics.yaml"), "utf8"),
  ) as GoalMetrics;
}

function runYaml(repoDir: string): string {
  const base = path.basename(repoDir);
  return [
    "aliases:",
    "  architect: { harness: fake, model: fake-architect }",
    "  pm: { harness: fake, model: fake-pm }",
    "  implementer: { harness: fake, model: fake-impl }",
    "  implementer-b: { harness: fake, model: fake-impl-b }",
    "  researcher: { harness: fake, model: fake-research }",
    "  reviewer: { harness: fake, model: fake-review }",
    "  qa: { harness: fake, model: fake-qa }",
    "  steward: { harness: fake, model: fake-steward }",
    "  plan-checker: { harness: fake, model: fake-check }",
    "  intent: { harness: fake, model: fake-intent }",
    "  plan-reviewer: { harness: fake, model: fake-plan-review }",
    "  pack-preparer: { harness: fake, model: fake-pack-prep }",
    "  digest: { harness: fake, model: fake-digest }",
    "limits: { iterations: 1, concurrency: { overall: 1 } }",
    `worktreeRoot: ../${base}-wt`,
    `sessions: { dir: ../${base}-sessions, keepRuns: 2, retention: short }`,
    "",
  ].join("\n");
}

describe("cross-slice E2E — init, steer and three launches through S2/S3/S4", () => {
  registerCrossSliceE2EInitSteerAndThreeLaunchesThroughS2S3S4Part1();
});

/** The repo, goal paths and values carried between the three launches. */
interface E2ECtx {
  repo: TmpRepo;
  goalDir: string;
  goal: {
    repo: TmpRepo;
    goalDir: string;
    planPath: string;
    tasksDir: string;
  };
  steerId: string;
  betaTip: string;
  integrationBefore: string;
}

/** Writes the run config and intent, then inits the goal through the CLI. */
async function e2eInit(ctx: E2ECtx): Promise<void> {
  ctx.repo.writeFile(".factory/run.yaml", runYaml(ctx.repo.dir));
  const intentPath = path.join(ctx.repo.dir, "INTENT.md");
  fs.writeFileSync(
    intentPath,
    "# Goal\n\nBuild alpha, beta and gamma.\n",
    "utf8",
  );
  ctx.repo.commit("factory config and intent");
  const initCode = await dispatch(
    ["init", "--repo", ctx.repo.dir, "--goal", "demo", "--intent", intentPath],
    {},
  );
  expect(initCode).toBe(0);
  expect(fs.existsSync(path.join(ctx.repo.dir, ".factory/repo.yaml"))).toBe(
    true,
  );
  expect(
    fs.readFileSync(path.join(ctx.goalDir, "intent.md"), "utf8"),
  ).toContain("Build alpha");
  fs.writeFileSync(
    path.join(ctx.goalDir, "class.yaml"),
    "class: bigger\n",
    "utf8",
  );
}

/** Launch 1's planning turns: architect, PM, and beta's parked review. */
function scriptLaunch1Planning(first: FakeHarness, ctx: E2ECtx): void {
  first.script((req, turnedCtx) => {
    expect(req.prompt).toContain("- turn: `first`");
    write(ctx.goalDir, "plan.md", PLAN_1);
    turnedCtx.writeOutcome(
      outcome({
        summary: "planned alpha, beta, gamma",
        decision: "continue",
      }),
    );
    return fakeTurnResult(req);
  });
  first.script((req, turnedCtx) => {
    for (const [slug, text] of [
      ["alpha", ALPHA],
      ["beta", BETA],
      ["gamma", GAMMA_1],
    ] as const) {
      writeTask(ctx.goalDir, slug, text);
    }
    turnedCtx.writeOutcome(outcome({ summary: "filed three tasks" }));
    return fakeTurnResult(req);
  });
  // beta parks on its last-call rejection while alpha merges: the
  // wave-end stall owns the park.
  scriptStallLeave(first, ["beta"]);
}

/** Launch 1's task turns: alpha merges, beta is rejected, gamma waits. */
function scriptLaunch1Tasks(first: FakeHarness): void {
  scriptWriteTurn(first, "alpha", "alpha\n");
  scriptVerdictTurn(first, "alpha", "alpha approved", "approve");
  scriptWriteTurn(first, "beta", "beta v1\n");
  scriptVerdictTurn(
    first,
    "beta",
    "beta needs the second direction",
    "changes",
  );
  scriptWriteTurn(first, "beta", "beta v2\n");
  scriptVerdictTurn(first, "beta", "not salvageable", "reject");
}

/** Launch 1 ended merged/merged/parked with the recorded rejection. */
async function expectLaunch1(ctx: E2ECtx): Promise<void> {
  const state = await stateOf(ctx.goalDir);
  expect(state.tasks.alpha!.status).toBe("merged");
  expect(state.tasks.beta!.status).toBe("parked");
  expect(causeText(state.tasks.beta!.cause)).toContain("review-rejected");
  expect(state.tasks.gamma!.status).toBe("pending");
  const summary = summaryOf(ctx.goalDir, 1);
  expect(summary).toContain("- review-rejected\n  - beta: not salvageable");
  expect(summaryOf(ctx.goalDir, 1)).toContain("- merged: alpha");
  expect(
    fs.existsSync(
      path.join(ctx.goalDir, "mailbox/outbox/iteration-1-summary.md"),
    ),
  ).toBe(true);
  const one = await metricsOf(ctx.goalDir);
  expect(one.iterations.map((i) => i.n)).toEqual([1]);
  // The shipped ingestion adds the infra turn to the first iteration.
  expect(one.iterations[0]!.turns).toBe(16);
  expect(one.iterations[0]!.merged).toEqual(["alpha"]);
  expect(one.iterations[0]!.parked).toEqual(["beta"]);
  ctx.betaTip = ctx.repo
    .git(["rev-parse", "factory-task/demo/beta"])
    .stdout.trim();
}

/** Files a steer through the CLI and records its id. */
async function steerBeta2(ctx: E2ECtx): Promise<void> {
  const steerPath = path.join(ctx.repo.dir, "steer-source.md");
  fs.writeFileSync(
    steerPath,
    "Keep the parked beta branch; finish it as beta2.\n",
    "utf8",
  );
  expect(
    await dispatch(
      ["steer", "--repo", ctx.repo.dir, "--goal", "demo", steerPath],
      {},
    ),
  ).toBe(0);
  const inbox = fs.readdirSync(path.join(ctx.goalDir, "mailbox/inbox"));
  expect(inbox.length).toBe(1);
  ctx.steerId = path.basename(inbox[0]!, ".md");
}

/** Launch 2's architect and PM turns answer the steer. */
function scriptLaunch2Planning(second: FakeHarness, ctx: E2ECtx): void {
  scriptDigest(second, ctx.goalDir, 2);
  scriptSteerRoutes(second, [ctx.steerId]);
  second.script((req, turnedCtx) => {
    expect(req.prompt).toContain("- turn: `relaunch`");
    expect(req.prompt).toContain(ctx.steerId);
    expect(req.prompt).toContain("Keep the parked beta branch");
    write(ctx.goalDir, "plan.md", PLAN_2);
    turnedCtx.writeOutcome(
      outcome({
        summary: "answered the steer, beta2 continues beta",
        decision: "continue",
        forward: [`steer ${ctx.steerId}: keep the branch, finish it as beta2`],
      }),
    );
    return fakeTurnResult(req);
  });
  second.script((req, turnedCtx) => {
    expect(req.prompt).toContain("beta | parked");
    writeTask(ctx.goalDir, "beta2", BETA_2);
    writeTask(ctx.goalDir, "gamma", GAMMA_2);
    turnedCtx.writeOutcome(
      outcome({ summary: "filed beta2 and re-pointed gamma" }),
    );
    return fakeTurnResult(req);
  });
}

/** Launch 2's task turns continue beta's kept branch, then gamma. */
function scriptLaunch2Tasks(second: FakeHarness): void {
  second.script(
    (req, turnedCtx) => {
      expect(fs.readFileSync(path.join(req.cwd!, "beta.txt"), "utf8")).toBe(
        "beta v2\n",
      );
      write(req.cwd!, "beta2.txt", "beta2\n");
      turnedCtx.writeOutcome(
        outcome({ summary: "beta2 completed on beta's branch" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "beta2", step: "implement" }) },
  );
  scriptVerdictTurn(second, "beta2", "beta2 approved", "approve");
  second.script(
    (req, turnedCtx) => {
      expect(fs.existsSync(path.join(req.cwd!, "beta2.txt"))).toBe(true);
      write(req.cwd!, "gamma.txt", "gamma\n");
      turnedCtx.writeOutcome(
        outcome({ summary: "gamma implemented on beta2" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "gamma", step: "implement" }) },
  );
  scriptVerdictTurn(second, "gamma", "gamma approved", "approve");
}

/** Launch 2 landed beta2 and gamma on beta's kept branch. */
async function expectLaunch2Merged(ctx: E2ECtx): Promise<void> {
  const state = await stateOf(ctx.goalDir);
  expect(state.tasks.alpha!.status).toBe("merged");
  expect(state.tasks.beta!.status).toBe("parked");
  expect(state.tasks.beta2!.status).toBe("merged");
  expect(state.tasks.gamma!.status).toBe("merged");
  expect(ctx.repo.git(["show", "factory/demo:beta.txt"]).stdout.trim()).toBe(
    "beta v2",
  );
  expect(ctx.repo.git(["show", "factory/demo:beta2.txt"]).stdout.trim()).toBe(
    "beta2",
  );
  expect(ctx.repo.git(["show", "factory/demo:gamma.txt"]).stdout.trim()).toBe(
    "gamma",
  );
}

/** The continuation reviewed from the integration head, not beta's tip. */
async function expectLaunch2Continuation(ctx: E2ECtx): Promise<void> {
  const records = await createFolderStore(
    ctx.goalDir,
    undefined,
    {},
  ).listRecords();
  expect(records.find((r) => r.slug === "beta" && r.step === "merge")).toBe(
    undefined,
  );
  const continuation = records.find(
    (r) => r.slug === "beta2" && r.step === "implement",
  );
  expect(continuation?.base).toBe(ctx.integrationBefore);
  expect(continuation?.base).not.toBe(ctx.betaTip);
}

/** The steer was consumed into processed, answered in outbox and summarized. */
async function expectLaunch2Steer(ctx: E2ECtx): Promise<void> {
  const pack = fs.readFileSync(
    path.join(ctx.goalDir, "iterations/2/context-pack.md"),
    "utf8",
  );
  expect(pack).toContain(
    `previous iteration summary: ${path.join(ctx.goalDir, "iterations/1/summary.md")}`,
  );
  expect(pack).toContain(`- ${ctx.steerId}: mailbox/inbox/`);
  expect(fs.readdirSync(path.join(ctx.goalDir, "mailbox/inbox"))).toEqual([]);
  expect(fs.readdirSync(path.join(ctx.goalDir, "mailbox/processed"))).toContain(
    `${ctx.steerId}.md`,
  );
  expect(
    fs.readFileSync(
      path.join(ctx.goalDir, `mailbox/outbox/steer-${ctx.steerId}.md`),
      "utf8",
    ),
  ).toContain("finish it as beta2");
  expect(summaryOf(ctx.goalDir, 2)).toContain("merged: beta2, gamma");
  const two = await metricsOf(ctx.goalDir);
  expect(two.iterations.map((i) => i.n)).toEqual([1, 2]);
  expect(two.iterations[1]!.turns).toBe(13);
  expect(two.iterations[1]!.humanInterventions).toBe(1);
  expect(two.iterations[1]!.merged).toEqual(["beta2", "gamma"]);
  expect(two.totals.merged).toEqual(["alpha", "beta2", "gamma"]);
}

/** Launch 3: the architect says done. */
async function launch3(ctx: E2ECtx): Promise<void> {
  const third = new FakeHarness({ id: "fake" });
  scriptDigest(third, ctx.goalDir, 3);
  third.script((req, turnedCtx) => {
    expect(req.prompt).toContain("- turn: `relaunch`");
    turnedCtx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
    return fakeTurnResult(req);
  });
  await expectDispatch(0, ["run", "--repo", ctx.repo.dir, "--goal", "demo"], {
    harnesses: { fake: third },
  });
}

/** Launch 3 closed the goal and its summary and metrics. */
async function expectLaunch3(ctx: E2ECtx): Promise<void> {
  const state = await stateOf(ctx.goalDir);
  expect(state.goal).toBe("done");
  expect(state.tasks.beta2!.status).toBe("merged");
  expect(summaryOf(ctx.goalDir, 3)).toContain("status: goal-met");
  expect(
    fs.existsSync(
      path.join(ctx.goalDir, "mailbox/outbox/iteration-3-summary.md"),
    ),
  ).toBe(true);
  const three = await metricsOf(ctx.goalDir);
  expect(three.iterations.map((i) => i.n)).toEqual([1, 2, 3]);
  expect(three.iterations[2]!.turns).toBe(3);
  expect(three.totals.parked).toEqual(["beta"]);
  expect(three.totals.loopIncidents).toBe(0);
}

function registerCrossSliceE2EInitSteerAndThreeLaunchesThroughS2S3S4Part1(): void {
  it("merges, parks, continues with base, answers the steer and ends done", async () => {
    const repo = createTmpRepo();
    const goalDir = path.join(repo.dir, ".factory/artifacts/demo");
    const ctx: E2ECtx = {
      repo,
      goalDir,
      goal: {
        repo,
        goalDir,
        planPath: path.join(goalDir, "plan.md"),
        tasksDir: path.join(goalDir, "tasks"),
      },
      steerId: "",
      betaTip: "",
      integrationBefore: "",
    };
    try {
      await e2eInit(ctx);

      // Launch 1: alpha merges, beta is rejected on review, gamma waits.
      const first = new FakeHarness({ id: "fake" });
      scriptLaunch1Planning(first, ctx);
      scriptLaunch1Tasks(first);
      await expectDispatch(3, ["run", "--repo", repo.dir, "--goal", "demo"], {
        harnesses: { fake: first },
      });
      await expectLaunch1(ctx);
      await steerBeta2(ctx);

      // Launch 2: architect answers the steer, PM reconciles, beta2 continues
      // beta's kept branch, gamma follows beta2.
      const second = new FakeHarness({ id: "fake" });
      scriptLaunch2Planning(second, ctx);
      scriptLaunch2Tasks(second);
      ctx.integrationBefore = repo
        .git(["rev-parse", "factory/demo"])
        .stdout.trim();
      await expectDispatch(3, ["run", "--repo", repo.dir, "--goal", "demo"], {
        harnesses: { fake: second },
      });
      await expectLaunch2Merged(ctx);
      await expectLaunch2Continuation(ctx);
      await expectLaunch2Steer(ctx);

      await launch3(ctx);
      await expectLaunch3(ctx);
    } finally {
      cleanup(ctx.goal);
    }
  }, 90_000);
}
