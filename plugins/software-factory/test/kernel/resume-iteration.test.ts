import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { expectDispatch } from "./e2e-helpers.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { postSteer } from "../../src/kernel/mailbox.js";
import { createDrainController } from "../../src/kernel/signals.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { whenTurn } from "./s2-helpers.js";
import {
  PLAN,
  ALPHA,
  BETA,
  outcome,
  setupRepo,
  silenceWarn,
  DIGEST_SCOUT_MARKER,
  digestTaskTurn,
  queueDigestSteer,
  digestScoutTurn,
  addAlias,
} from "./resume-helpers.js";

describe("resume iteration — SIGINT and hard death", () => {
  describe("resume iteration — SIGINT mid-dispatch", () => {
    it("finishes the interrupted iteration on relaunch without an extra architect record", async () => {
      const { repo, goalDir, taskDir } = setupRepo();
      const controller = createDrainController();
      const restoreWarn = silenceWarn();
      try {
        const scope1 = await finishesInterruptedIterationPart1(
          goalDir,
          taskDir,
          controller,
          repo,
        );
        await finishesInterruptedIterationPart2(goalDir, taskDir, repo, scope1);
      } finally {
        restoreWarn();
        repo.cleanup();
      }
    }, 120_000);
  });

  describe("resume iteration — hard death", () => {
    it("resumes the same iteration with a digest steer and no architect", async () => {
      const { repo, goalDir, taskDir } = setupRepo();
      const controller = createDrainController();
      const restoreWarn = silenceWarn();
      try {
        const scope1 = await resumesSameIterationDigestSteerNoPart1(
          goalDir,
          taskDir,
          controller,
          repo,
        );
        const scope2 = await resumesSameIterationDigestSteerNoPart2(
          goalDir,
          taskDir,
          scope1,
        );
        const scope3 = await resumesSameIterationDigestSteerNoPart3(
          goalDir,
          repo,
          scope2,
        );
        await resumesSameIterationDigestSteerNoPart4(scope3);
      } finally {
        restoreWarn();
        repo.cleanup();
      }
    }, 120_000);

    it("gives an unclaimed steer its PM steer turn after resume", async () => {
      await givesUnclaimedSteerPMSteerTurn();
    }, 120_000);
  });
});

/** Runs the unclaimed-steer resume scenario end to end. */
async function givesUnclaimedSteerPMSteerTurn(): Promise<void> {
  const { repo, goalDir, taskDir } = setupRepo();
  const controller = createDrainController();
  const restoreWarn = silenceWarn();
  try {
    const scope1 = await givesUnclaimedSteerPMSteerTurnPart1(
      goalDir,
      taskDir,
      controller,
      repo,
    );
    const scope2 = await givesUnclaimedSteerPMSteerTurnPart2(
      goalDir,
      repo,
      scope1,
    );
    await givesUnclaimedSteerPMSteerTurnPart3(goalDir, scope2);
  } finally {
    restoreWarn();
    repo.cleanup();
  }
}

/** Scripts the first launch that is interrupted during alpha's review. */
function scriptInterruptedFirstLaunch(
  first: FakeHarness,
  goalDir: string,
  taskDir: string,
  controller: ReturnType<typeof createDrainController>,
): void {
  first.script((req, ctx) => {
    fs.writeFileSync(path.join(goalDir, "plan.md"), PLAN, "utf8");
    ctx.writeOutcome(outcome({ summary: "planned", decision: "continue" }));
    return fakeTurnResult(req);
  });
  first.script((req, ctx) => {
    fs.writeFileSync(path.join(taskDir, "alpha.md"), ALPHA, "utf8");
    fs.writeFileSync(path.join(taskDir, "beta.md"), BETA, "utf8");
    ctx.writeOutcome(outcome({ summary: "filed" }));
    return fakeTurnResult(req);
  });
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
}

async function finishesInterruptedIterationPart1(
  goalDir: string,
  taskDir: string,
  controller: ReturnType<typeof createDrainController>,
  repo: ReturnType<typeof setupRepo>["repo"],
) {
  const first = new FakeHarness({ id: "fake" });
  scriptInterruptedFirstLaunch(first, goalDir, taskDir, controller);

  await expectDispatch(130, ["run", "--repo", repo.dir, "--goal", "demo"], {
    harnesses: { fake: first },
    signals: controller,
  });

  const store1 = createFolderStore(goalDir, undefined, {});
  const state1 = derive(await store1.listTasks(), await store1.listRecords());
  expect(state1.tasks.alpha!.status).toBe("merged");
  expect(state1.tasks.beta!.status).toBe("ready");

  return { store1 };
}

async function finishesInterruptedIterationPart2(
  goalDir: string,
  taskDir: string,
  repo: ReturnType<typeof setupRepo>["repo"],
  scope: Awaited<ReturnType<typeof finishesInterruptedIterationPart1>>,
) {
  const { store1 } = scope;
  const architectIter1Before = (await store1.listRecords()).filter(
    (r) => r.actor === "agent" && r.step === "architect" && r.iteration === 1,
  ).length;
  expect(architectIter1Before).toBe(1);

  // Relaunch finishes iteration 1: the digest steer reaches the PM, then
  // dispatches beta, with no new architect record in iteration 1.
  const second = new FakeHarness({ id: "fake" });
  queueDigestSteer(second, digestTaskTurn(taskDir, "beta"));
  second.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "beta added" }));
    return fakeTurnResult(req);
  });
  second.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "beta approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
  second.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
    return fakeTurnResult(req);
  });

  await expectDispatch(
    0,
    ["run", "--repo", repo.dir, "--goal", "demo", "--iterations", "3"],
    {
      harnesses: { fake: second },
    },
  );

  const store2 = createFolderStore(goalDir, undefined, {});
  const records2 = await store2.listRecords();
  const state2 = derive(await store2.listTasks(), records2);
  expect(state2.goal).toBe("done");
  expect(state2.tasks.beta!.status).toBe("merged");

  const architectIter1After = records2.filter(
    (r) => r.actor === "agent" && r.step === "architect" && r.iteration === 1,
  ).length;
  expect(architectIter1After).toBe(1);
  // beta's records land in iteration 1 (same iteration resumed).
  const betaRecords = records2.filter((r) => r.slug === "beta");
  expect(betaRecords.every((r) => r.iteration === 1)).toBe(true);
}

async function givesUnclaimedSteerPMSteerTurnPart1(
  goalDir: string,
  taskDir: string,
  controller: ReturnType<typeof createDrainController>,
  repo: ReturnType<typeof setupRepo>["repo"],
) {
  const first = new FakeHarness({ id: "fake" });
  first.script((req, ctx) => {
    fs.writeFileSync(path.join(goalDir, "plan.md"), PLAN, "utf8");
    ctx.writeOutcome(outcome({ summary: "planned", decision: "continue" }));
    return fakeTurnResult(req);
  });
  first.script((req, ctx) => {
    fs.writeFileSync(path.join(taskDir, "alpha.md"), ALPHA, "utf8");
    fs.writeFileSync(path.join(taskDir, "beta.md"), BETA, "utf8");
    ctx.writeOutcome(outcome({ summary: "filed" }));
    return fakeTurnResult(req);
  });
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
  await expectDispatch(130, ["run", "--repo", repo.dir, "--goal", "demo"], {
    harnesses: { fake: first },
    signals: controller,
  });

  // Dropped after the dying pass boundary read it: never claimed by the
  // architect, never given a PM steer turn.
  const inbox = createFolderStore(goalDir, undefined, {});
  await postSteer(inbox, "s1", "Please note beta for later.");
  const pmBefore = (await inbox.listRecords()).filter(
    (r) => r.actor === "agent" && r.step === "pm" && r.iteration === 1,
  ).length;
  expect(pmBefore).toBe(1);

  const second = new FakeHarness({ id: "fake" });
  queueDigestSteer(second, digestTaskTurn(taskDir, "beta"));

  return { second };
}

async function givesUnclaimedSteerPMSteerTurnPart2(
  goalDir: string,
  repo: ReturnType<typeof setupRepo>["repo"],
  scope: Awaited<ReturnType<typeof givesUnclaimedSteerPMSteerTurnPart1>>,
) {
  const { second } = scope;
  second.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "steer s1 routed to the architect",
          steerRoutes: [{ steer: "s1", route: "architect" }],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => req.prompt.includes("s1 (mailbox/inbox/s1.md)") },
  );
  second.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "beta added" }));
    return fakeTurnResult(req);
  });
  second.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "beta approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
  // The resumed pass is not budgeted: the boundary closes the goal.
  second.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "architect" }) },
  );
  await expectDispatch(
    0,
    ["run", "--repo", repo.dir, "--goal", "demo", "--iterations", "1"],
    { harnesses: { fake: second } },
  );

  const store2 = createFolderStore(goalDir, undefined, {});
  const records2 = await store2.listRecords();
  const state2 = derive(await store2.listTasks(), records2);
  expect(state2.tasks.beta!.status).toBe("merged");

  return { ...scope, records2 };
}

async function givesUnclaimedSteerPMSteerTurnPart3(
  goalDir: string,
  scope: Awaited<ReturnType<typeof givesUnclaimedSteerPMSteerTurnPart2>>,
) {
  const { records2 } = scope;
  expect(
    records2.filter(
      (r) => r.actor === "agent" && r.step === "pm" && r.iteration === 1,
    ).length,
  ).toBe(3);
  expect(fs.existsSync(path.join(goalDir, "mailbox/holds/s1.yaml"))).toBe(true);
}

async function resumesSameIterationDigestSteerNoPart1(
  goalDir: string,
  taskDir: string,
  controller: ReturnType<typeof createDrainController>,
  repo: ReturnType<typeof setupRepo>["repo"],
) {
  const first = new FakeHarness({ id: "fake" });
  first.script((req, ctx) => {
    fs.writeFileSync(path.join(goalDir, "plan.md"), PLAN, "utf8");
    ctx.writeOutcome(outcome({ summary: "planned", decision: "continue" }));
    return fakeTurnResult(req);
  });
  first.script((req, ctx) => {
    fs.writeFileSync(path.join(taskDir, "alpha.md"), ALPHA, "utf8");
    fs.writeFileSync(path.join(taskDir, "beta.md"), BETA, "utf8");
    ctx.writeOutcome(outcome({ summary: "filed" }));
    return fakeTurnResult(req);
  });
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
  await expectDispatch(130, ["run", "--repo", repo.dir, "--goal", "demo"], {
    harnesses: { fake: first },
    signals: controller,
  });

  // A hard death mid-iteration: beta's turn started but the process died
  // before it finished, leaving an orphan with no end record.
  const store1 = createFolderStore(goalDir, undefined, {});

  return { store1 };
}

async function resumesSameIterationDigestSteerNoPart2(
  goalDir: string,
  taskDir: string,
  scope: Awaited<ReturnType<typeof resumesSameIterationDigestSteerNoPart1>>,
) {
  const { store1 } = scope;
  await store1.startRecord({
    iteration: 1,
    slug: "beta",
    step: "implement",
    round: 1,
    actor: "agent",
    alias: "implementer",
    model: { id: "fake-impl" },
  });
  const orphans = (await store1.listRecords()).filter((r) => !r.endedAt);
  expect(orphans).toHaveLength(1);

  // The resume skips the architect but still runs the digest, and the PM
  // routes its evidence before dispatch.
  const second = new FakeHarness({ id: "fake" });
  const state = { pmSawDigest: false };
  queueDigestSteer(second, (req, ctx) => {
    state.pmSawDigest = req.prompt.includes("digest-scout-marker");
    return digestTaskTurn(taskDir, "beta")(req, ctx);
  });
  second.script(digestScoutTurn(goalDir, 1), {
    when: whenTurn({ step: "digest" }),
  });
  second.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "beta added" }));
    return fakeTurnResult(req);
  });
  second.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "beta approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
  second.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
    return fakeTurnResult(req);
  });

  return { ...scope, second, state };
}

async function resumesSameIterationDigestSteerNoPart3(
  goalDir: string,
  repo: ReturnType<typeof setupRepo>["repo"],
  scope: Awaited<ReturnType<typeof resumesSameIterationDigestSteerNoPart2>>,
) {
  const { second } = scope;
  await expectDispatch(
    0,
    ["run", "--repo", repo.dir, "--goal", "demo", "--iterations", "3"],
    { harnesses: { fake: second } },
  );

  const store2 = createFolderStore(goalDir, undefined, {});
  const records2 = await store2.listRecords();
  const state2 = derive(await store2.listTasks(), records2);
  expect(state2.goal).toBe("done");
  expect(state2.tasks.beta!.status).toBe("merged");

  // Recovery sealed the orphan as a bare crash: no details, usage, or
  // prompt bytes from any turn the harness reported.
  const sealed = records2.find(
    (r) =>
      r.slug === "beta" && r.step === "implement" && r.stop?.kind === "infra",
  );
  expect(sealed?.stop).toEqual({ kind: "infra", cause: "crash" });
  expect(sealed?.ok).toBe(false);
  expect(sealed?.usage).toBeUndefined();
  expect(sealed?.promptBytes).toBeUndefined();

  // Same iteration resumed: one architect record in iteration 1, every
  // beta record in iteration 1, and the digest ran and reached the PM.
  expect(
    records2.filter(
      (r) => r.actor === "agent" && r.step === "architect" && r.iteration === 1,
    ).length,
  ).toBe(1);
  expect(
    records2.filter((r) => r.slug === "beta").every((r) => r.iteration === 1),
  ).toBe(true);

  return { ...scope, store2, records2 };
}

async function resumesSameIterationDigestSteerNoPart4(
  scope: Awaited<ReturnType<typeof resumesSameIterationDigestSteerNoPart3>>,
) {
  const { records2, store2, state } = scope;
  expect(
    records2.filter(
      (r) => r.actor === "agent" && r.step === "digest" && r.iteration === 1,
    ).length,
  ).toBe(1);
  expect(await store2.readFile("iterations/1/digest.md")).toContain(
    DIGEST_SCOUT_MARKER,
  );
  expect(state.pmSawDigest).toBe(true);
  const routes = records2.filter((r) => r.step === "steer-routes");
  expect(
    routes.some((r) =>
      (r.outcome?.steerRoutes ?? []).some(
        (entry) =>
          entry.steer.startsWith("digest-1-") && entry.route === "task",
      ),
    ),
  ).toBe(true);
  expect(await store2.readFile("iterations/2/digest.md")).toBeNull();
}
