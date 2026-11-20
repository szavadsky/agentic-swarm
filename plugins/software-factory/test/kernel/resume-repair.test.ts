import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { expectDispatch } from "./e2e-helpers.js";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { createDrainController } from "../../src/kernel/signals.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { type TmpRepo } from "../helpers/tmp-repo.js";
import { scriptStallLeave, whenTurn } from "./s2-helpers.js";
import {
  outcome,
  setupRepo,
  silenceWarn,
  digestSteerId,
  queueDigestSteer,
  digestScoutTurn,
  addAlias,
} from "./resume-helpers.js";
import { formatCause } from "../../src/kernel/cause.js";
import { cause, causeText } from "./helpers.js";
import type { KernelRuntime } from "../../src/kernel/types.js";

describe("resume repair — nothing dispatchable", () => {
  registerResumeRepairDamagedTask();
  registerResumeRepairStillStuck();
});

async function endsStillStuckResumedIterationAtPart1(
  goalDir: string,
  checkerTurn: (verdict: "architect" | "progress") => FakeTurnHandler,
  queueTask: (harness: FakeHarness, slug: string, file: string) => void,
) {
  await createFolderStore(goalDir, undefined, {}).appendRecord(
    {
      iteration: 1,
      slug: "beta",
      step: "merge",
      round: 1,
      actor: "script",
    },
    {
      ok: false,
      cause: cause(
        'merge failed: branch "factory-task/demo/beta" does not exist',
      ),
    },
  );

  const second = new FakeHarness({ id: "fake" });
  queueDigestSteer(second);
  second.script(digestScoutTurn(goalDir, 1), {
    when: whenTurn({ step: "digest" }),
  });
  second.script(checkerTurn("architect"), {
    when: whenTurn({ step: "plancheck" }),
  });
  queueTask(second, "delta", "delta.txt");
  // The architect-summoning resume does not consume the pass budget: the
  // boundary runs at iteration 2 in the same launch.
  second.script(
    (req, ctx) => {
      fs.appendFileSync(
        path.join(goalDir, "plan.md"),
        "\n## architect edit after the stuck resume\n",
        "utf8",
      );
      ctx.writeOutcome(
        outcome({ summary: "still stuck", decision: "continue" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "architect" }) },
  );

  return { second };
}

async function endsStillStuckResumedIterationAtPart2(
  goalDir: string,
  checkerTurn: (verdict: "architect" | "progress") => FakeTurnHandler,
  repo: TmpRepo,
  scope: Awaited<ReturnType<typeof endsStillStuckResumedIterationAtPart1>>,
) {
  const { second } = scope;
  second.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "nothing to file" }));
      return fakeTurnResult(req);
    },
    {
      when: (req) =>
        whenTurn({ step: "pm" })(req) &&
        req.prompt.includes("pending steers: `none`") &&
        req.prompt.includes("stalled parks: `none`"),
    },
  );
  scriptStallLeave(second, ["beta"]);
  second.script(checkerTurn("architect"), {
    when: whenTurn({ step: "plancheck" }),
  });

  await expectDispatch(
    3,
    ["run", "--repo", repo.dir, "--goal", "demo", "--iterations", "1"],
    { harnesses: { fake: second } },
  );

  const store = createFolderStore(goalDir, undefined, {});
  const records = await store.listRecords();
  const state = derive(await store.listTasks(), records);
  expect(state.tasks.beta!.status).toBe("parked");
  expect(causeText(state.tasks.beta!.cause)).toContain("does not exist");
  expect(state.tasks.gamma!.status).toBe("pending");
  expect(state.tasks.delta!.status).toBe("merged");
  // The resume's architect route reached the boundary in iteration 1
  // (the first launch also had one architect there); the checker ran.
  expect(
    records.filter(
      (r) => r.actor === "agent" && r.step === "architect" && r.iteration === 1,
    ).length,
  ).toBe(2);

  return { ...scope, store, records };
}

async function endsStillStuckResumedIterationAtPart3(
  goalDir: string,
  scope: Awaited<ReturnType<typeof endsStillStuckResumedIterationAtPart2>>,
) {
  const { records, store } = scope;
  expect(
    records.filter(
      (r) => r.actor === "agent" && r.step === "plancheck" && r.iteration === 1,
    ),
  ).toHaveLength(1);
  const routes = records.filter((r) => r.step === "steer-routes");
  expect(
    routes.some((r) =>
      (r.outcome?.steerRoutes ?? []).some(
        (entry) =>
          entry.steer.startsWith("digest-1-") && entry.route === "architect",
      ),
    ),
  ).toBe(true);
  // The iteration ends at the boundary with the stuck state recorded, and
  // the digest steer stays in the inbox, unanswered by this boundary's
  // architect, so a later consult presents it again.
  expect(
    records.filter(
      (r) => r.actor === "agent" && r.step === "architect" && r.iteration === 2,
    ),
  ).toHaveLength(0);
  expect(await store.readFile("iterations/1/summary.md")).toContain(
    "nothing dispatchable, non-terminal work remains: gamma pending",
  );
  expect(
    fs
      .readdirSync(path.join(goalDir, "mailbox/inbox"))
      .some((name) => name.startsWith("digest-1-")),
  ).toBe(true);
}

const PLAN4 = `# Milestone 1 — files

## alpha
Create alpha.txt.

## beta
Create beta.txt.

## gamma
Create gamma.txt. Needs beta merged.

## delta
Create delta.txt.
`;

function task4(slug: string, deps: string[]): string {
  return [
    "---",
    `slug: ${slug}`,
    `title: Create ${slug}`,
    "kind: task",
    "flow: implement-review",
    `deps: [${deps.join(", ")}]`,
    `scope: [${slug}.txt]`,
    `source: Milestone 1 / ${slug}`,
    "---",
    "",
    `Create ${slug}.txt.`,
    "",
  ].join("\n");
}

function scriptFileFourTasks(first: FakeHarness, taskDir: string): void {
  first.script((req, ctx) => {
    fs.writeFileSync(
      path.join(taskDir, "alpha.md"),
      task4("alpha", []),
      "utf8",
    );
    fs.writeFileSync(
      path.join(taskDir, "beta.md"),
      task4("beta", ["alpha"]),
      "utf8",
    );
    fs.writeFileSync(
      path.join(taskDir, "gamma.md"),
      task4("gamma", ["beta"]),
      "utf8",
    );
    fs.writeFileSync(
      path.join(taskDir, "delta.md"),
      task4("delta", []),
      "utf8",
    );
    ctx.writeOutcome(outcome({ summary: "filed" }));
    return fakeTurnResult(req);
  });
}

/**
 * A first launch interrupted during alpha's review: alpha lands, beta and
 * delta stay ready, gamma waits on beta.
 */
async function interruptedAfterAlpha(): Promise<{
  repo: TmpRepo;
  goalDir: string;
  taskDir: string;
}> {
  const s = setupRepo();
  const controller = createDrainController();
  const restoreWarn = silenceWarn();
  try {
    const first = new FakeHarness({ id: "fake" });
    first.script((req, ctx) => {
      fs.writeFileSync(path.join(s.goalDir, "plan.md"), PLAN4, "utf8");
      ctx.writeOutcome(outcome({ summary: "planned", decision: "continue" }));
      return fakeTurnResult(req);
    });
    scriptFileFourTasks(first, s.taskDir);
    first.script((req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "alpha added" }));
      return fakeTurnResult(req);
    });
    first.script((req, ctx) => {
      controller.handleSignal("SIGINT");
      ctx.writeOutcome(
        outcome({ summary: "alpha approved", verdict: "approve" }),
      );
      return fakeTurnResult(req);
    });
    await expectDispatch(130, ["run", "--repo", s.repo.dir, "--goal", "demo"], {
      harnesses: { fake: first },
      signals: controller,
    });
    const state = derive(
      await createFolderStore(s.goalDir, undefined, {}).listTasks(),
      await createFolderStore(s.goalDir, undefined, {}).listRecords(),
    );
    expect(state.tasks.alpha!.status).toBe("merged");
    expect(state.tasks.beta!.status).toBe("ready");
    expect(state.tasks.gamma!.status).toBe("pending");
    expect(state.tasks.delta!.status).toBe("ready");
    return s;
  } finally {
    restoreWarn();
  }
}

function implementsFile(slug: string, file: string): FakeTurnHandler {
  return (req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, file), `${file}\n`, "utf8");
    ctx.writeOutcome(outcome({ summary: `${slug} added` }));
    return fakeTurnResult(req);
  };
}

function approves(slug: string): FakeTurnHandler {
  return (req, ctx) => {
    ctx.writeOutcome(
      outcome({ summary: `${slug} approved`, verdict: "approve" }),
    );
    return fakeTurnResult(req);
  };
}

/** Queues one slug's implement and review turns, bound to that slug. */
function queueTask(harness: FakeHarness, slug: string, file: string): void {
  harness.script(implementsFile(slug, file), {
    when: whenTurn({ slug, step: "implement" }),
  });
  harness.script(approves(slug), {
    when: whenTurn({ slug, step: "review" }),
  });
}

/** The checker's verdict once the resumed dispatch runs out. */
function checkerTurn(verdict: "architect" | "progress"): FakeTurnHandler {
  return (req, ctx) => {
    ctx.writeOutcome(
      outcome({
        summary: `checker verdict ${verdict}`,
        planCheck: { verdict, evidence: [], followUps: [] },
      }),
    );
    return fakeTurnResult(req);
  };
}

/** The digest-steer turn that files beta-2 and repoints gamma's dep. */
function digestRepairHandler(
  taskDir: string,
  onPrompt: (req: Parameters<FakeTurnHandler>[0]) => void,
): FakeTurnHandler {
  return (req, ctx) => {
    onPrompt(req);
    const id = digestSteerId(req);
    fs.writeFileSync(
      path.join(taskDir, "beta-2.md"),
      [
        "---",
        "slug: beta-2",
        "title: Create beta",
        "kind: task",
        "flow: implement-review",
        "deps: []",
        "scope: [beta.txt]",
        `source: "steer: ${id}"`,
        "---",
        "",
        "Create beta.txt. This continues the quarantined beta file.",
        "",
      ].join("\n"),
      "utf8",
    );
    const gamma = fs.readFileSync(path.join(taskDir, "gamma.md"), "utf8");
    fs.writeFileSync(
      path.join(taskDir, "gamma.md"),
      gamma.replace("deps: [beta]", "deps: [beta-2]"),
      "utf8",
    );
    ctx.writeOutcome(
      outcome({
        summary: `digest steer ${id}: beta's file was quarantined`,
        steerRoutes: [
          {
            steer: id,
            route: "task",
            answer: "beta-2 continues beta; gamma now waits on beta-2",
          },
        ],
      }),
    );
    return fakeTurnResult(req);
  };
}

/** Queues the repaired resume: digest steer, digest scout, tasks, done. */
function scriptRepairSecondLaunch(
  second: FakeHarness,
  taskDir: string,
  goalDir: string,
  onPmDigest: (saw: boolean) => void,
): void {
  queueDigestSteer(
    second,
    digestRepairHandler(taskDir, (req) => {
      onPmDigest(req.prompt.includes("digest-scout-marker"));
    }),
  );
  second.script(digestScoutTurn(goalDir, 1), {
    when: whenTurn({ step: "digest" }),
  });
  queueTask(second, "beta-2", "beta.txt");
  queueTask(second, "gamma", "gamma.txt");
  queueTask(second, "delta", "delta.txt");
  second.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
    return fakeTurnResult(req);
  });
}

/** Asserts the repaired resume kept one PM repair turn and landed everything. */
async function expectRepairedResume(
  store: ReturnType<typeof createFolderStore>,
  records: Awaited<ReturnType<KernelRuntime["store"]["listRecords"]>>,
  state: ReturnType<typeof derive>,
  pmSawDigest: boolean,
): Promise<void> {
  // The resume ran the digest and handed it to the PM; no architect turn
  // joined the resumed iteration.
  expect(pmSawDigest).toBe(true);
  expect(
    records.filter((r) => r.step === "digest" && r.iteration === 1),
  ).toHaveLength(1);
  expect(
    records.filter(
      (r) => r.actor === "agent" && r.step === "architect" && r.iteration === 1,
    ).length,
  ).toBe(1);
  // One PM repair turn (the digest steer turn) on top of the first launch's
  // derive PM turn. Every task landed, so no open work remained for the
  // checker: the boundary consulted directly.
  expect(
    records.filter(
      (r) => r.actor === "agent" && r.step === "pm" && r.iteration === 1,
    ),
  ).toHaveLength(2);
  const repair = records.find(
    (r) => r.step === "steer-routes" && r.iteration === 1,
  );
  expect(repair).toBeDefined();
  expect(records.filter((r) => r.step === "plancheck")).toHaveLength(0);
  // Dispatch continued: the repaired continuation and its dependents landed.
  expect(state.tasks["beta-2"]!.status).toBe("merged");
  expect(state.tasks.gamma!.status).toBe("merged");
  expect(state.tasks.delta!.status).toBe("merged");
  expect(state.tasks.beta).toBeUndefined();
  expect((await store.readTask("beta-2"))!.source).toMatch(/^steer: digest-1-/);
  expect((await store.readTask("gamma"))!.deps).toEqual(["beta-2"]);
  expect(state.goal).toBe("done");
}

function registerResumeRepairDamagedTask(): void {
  it("repairs a damaged task file with one PM turn and dispatch continues", async () => {
    const { repo, goalDir, taskDir } = await interruptedAfterAlpha();
    try {
      // A damaged task file: the store quarantines beta at launch, so gamma's
      // dep can never land and the resumed iteration has nothing dispatchable.
      fs.writeFileSync(
        path.join(taskDir, "beta.md"),
        "not a task file\n",
        "utf8",
      );

      const second = new FakeHarness({ id: "fake" });
      let pmSawDigest = false;
      scriptRepairSecondLaunch(second, taskDir, goalDir, (saw) => {
        pmSawDigest = saw;
      });

      await expectDispatch(
        0,
        ["run", "--repo", repo.dir, "--goal", "demo", "--iterations", "3"],
        { harnesses: { fake: second } },
      );

      const store = createFolderStore(goalDir, undefined, {});
      const records = await store.listRecords();
      const state = derive(await store.listTasks(), records);
      await expectRepairedResume(store, records, state, pmSawDigest);
    } finally {
      repo.cleanup();
    }
  }, 120_000);
}

function registerResumeRepairStillStuck(): void {
  it("ends a still-stuck resumed iteration at the boundary with the cause recorded", async () => {
    const { repo, goalDir } = await interruptedAfterAlpha();
    try {
      const scope1 = await endsStillStuckResumedIterationAtPart1(
        goalDir,
        checkerTurn,
        queueTask,
      );
      const scope2 = await endsStillStuckResumedIterationAtPart2(
        goalDir,
        checkerTurn,
        repo,
        scope1,
      );
      await endsStillStuckResumedIterationAtPart3(goalDir, scope2);
    } finally {
      repo.cleanup();
    }
  }, 120_000);
}

describe("resume repair — nothing dispatchable", () => {
  registerResumeRepairDamagedTask();
  registerResumeRepairStillStuck();
});
