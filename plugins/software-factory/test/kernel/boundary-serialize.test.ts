import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { postSteer } from "../../src/kernel/mailbox.js";
import { createFolderStore } from "../../src/kernel/store.js";
import {
  cleanup,
  launch,
  makeGoal,
  outcome,
  writePlan,
} from "./e2e-helpers.js";
import { task, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

const PLAN = `# Milestone 1

## later
Nothing to dispatch yet; the plan is the architect's.
`;

/** Shell single-quotes a path, so a temp dir with a quote cannot break a gate. */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * A gate that holds the merge scratch worktree until the test releases it.
 * Task checks run in their own worktrees, where the name never matches.
 */
function blockingMergeGate(shared: string, scratch: string): string {
  const dir = shellQuote(shared);
  return [
    `if [ "$(basename "$PWD")" = ${shellQuote(scratch)} ]; then`,
    `  touch ${dir}/merge-holding`,
    "  for _ in $(seq 1 600); do",
    `    [ -f ${dir}/release ] && exit 0`,
    "    sleep 0.05",
    "  done",
    "  exit 1",
    "fi",
  ].join("\n");
}

async function waitFor(file: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!fs.existsSync(file)) {
    if (Date.now() - start > timeoutMs)
      throw new Error(`timed out waiting for ${file}`);
    await sleep(10);
  }
}

describe("boundary turns hold the merge lock", () => {
  it("holds a steer-PM turn until the merge releases the integration checkout", async () => {
    const shared = fs.mkdtempSync(path.join(os.tmpdir(), "boundary-lock-"));
    const holding = path.join(shared, "merge-holding");
    const release = path.join(shared, "release");
    const steerPosted = path.join(shared, "steer-posted");
    const goalName = "demo";
    const { repo, goal } = setupFlowRepo({
      goal: goalName,
      gates: [
        {
          id: "probe",
          command: blockingMergeGate(shared, `${goalName}-merge`),
        },
      ],
      limits: { concurrency: { overall: 3 } },
    });
    try {
      const scope1 = await holdsSteerPMTurnUntilMergeReleasesPart1(
        repo,
        goal,
        holding,
        steerPosted,
      );
      const scope2 = await holdsSteerPMTurnUntilMergeReleasesPart2(
        holding,
        release,
        scope1,
      );
      await holdsSteerPMTurnUntilMergeReleasesPart3(
        holding,
        steerPosted,
        release,
        scope2,
      );
    } finally {
      cleanupFlowRepo(repo);
      fs.rmSync(shared, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("boundary turn containment", () => {
  it("records a boundary turn that writes into the integration checkout", async () => {
    const goal = makeGoal();
    try {
      const checkout = goalCheckout(goal.repo, "demo");
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        writePlan(goal.goalDir, PLAN);
        fs.writeFileSync(path.join(req.cwd!, "rogue.txt"), "rogue\n", "utf8");
        ctx.writeOutcome(
          outcome({ summary: "planned nothing yet", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
        return fakeTurnResult(req);
      });

      await launch(goal.repo, harness);

      const records = await createFolderStore(
        goal.goalDir,
        undefined,
        {},
      ).listRecords();
      const breach = records.filter((record) => record.step === "containment");
      expect(breach).toHaveLength(1);
      expect(breach[0]?.ok).toBe(false);
      expect(causeText(breach[0]?.cause)).toContain(
        "boundary-write: architect:",
      );
      expect(causeText(breach[0]?.cause)).toContain(
        `files changed outside the worktree in ${checkout}`,
      );
      // The incident is a record, not a silent repair: the turn's write stands.
      expect(fs.existsSync(path.join(checkout, "rogue.txt"))).toBe(true);
    } finally {
      cleanup(goal);
    }
  }, 60_000);
});

async function holdsSteerPMTurnUntilMergeReleasesPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
  holding: string,
  steerPosted: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  for (const slug of ["alpha", "beta", "gamma"])
    await writeTask(runtime, task(slug, { scope: [`${slug}.txt`] }));

  const implement =
    (slug: string) =>
    (
      req: Parameters<FakeHarness["turn"]>[0],
      ctx: { writeOutcome(value: unknown): void },
    ) => {
      fs.writeFileSync(path.join(req.cwd!, `${slug}.txt`), `${slug}\n`, "utf8");
      ctx.writeOutcome(outcome({ summary: `${slug} implemented` }));
      return fakeTurnResult(req);
    };
  harness.script(implement("alpha"), {
    when: whenTurn({ slug: "alpha", step: "implement" }),
  });
  harness.script(implement("beta"), {
    when: whenTurn({ slug: "beta", step: "implement" }),
  });
  harness.script(
    async (req, ctx) => {
      // The steer must be in the inbox before this turn returns, so the
      // loop wakes with something new to claim while the merge still holds.
      await waitFor(holding, 15_000);
      await waitFor(steerPosted, 15_000);
      return implement("gamma")(req, ctx);
    },
    { when: whenTurn({ slug: "gamma", step: "implement" }) },
  );

  return { harness, runtime };
}

async function holdsSteerPMTurnUntilMergeReleasesPart2(
  holding: string,
  release: string,
  scope: Awaited<ReturnType<typeof holdsSteerPMTurnUntilMergeReleasesPart1>>,
) {
  const { harness, runtime } = scope;
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "review" }), fallback: true },
  );

  const state = { steerStartedWhileHeld: false, steerStarted: false };
  harness.script(
    (req, ctx) => {
      state.steerStarted = true;
      state.steerStartedWhileHeld =
        fs.existsSync(holding) && !fs.existsSync(release);
      ctx.writeOutcome(
        outcome({
          summary: "steer routed to the architect",
          steerRoutes: [{ steer: "s1", route: "architect" }],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );

  const dispatched = runDispatch(runtime, { iteration: 1 });

  return { ...scope, state, dispatched };
}

async function holdsSteerPMTurnUntilMergeReleasesPart3(
  holding: string,
  steerPosted: string,
  release: string,
  scope: Awaited<ReturnType<typeof holdsSteerPMTurnUntilMergeReleasesPart2>>,
) {
  const { runtime, state, dispatched } = scope;
  try {
    await waitFor(holding, 15_000);
    await postSteer(runtime.store, "s1", "Route this steer by hand.");
    fs.writeFileSync(steerPosted, "");
    // Give the waking dispatch loop time to claim the steer and reach its
    // PM turn; an unlocked turn starts now, a locked one waits.
    const deadline = Date.now() + 1_500;
    while (!state.steerStarted && Date.now() < deadline) await sleep(10);
    fs.writeFileSync(release, "");
    const result = await dispatched;
    expect(result.reason).toBe("boundary");
  } finally {
    fs.writeFileSync(release, "");
    await dispatched;
  }
  expect(state.steerStarted).toBe(true);
  expect(state.steerStartedWhileHeld).toBe(false);
}
