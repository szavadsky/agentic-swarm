import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { cleanup, expectLaunch, makeGoal, outcome } from "./e2e-helpers.js";
import {
  ALPHA_PLAN,
  approver,
  BETA_PLAN,
  epicTask,
  GOAL_PLAN,
  implementer,
  iterationOf,
  readPack,
  SAGA_PROCESS,
  stepOf,
  writeEpicSteer,
} from "./saga-helpers.js";

const PROCESS = SAGA_PROCESS;

const STEER = "steer-alpha";
const STEER_TEXT = "hold alpha's interface steady";

/** A PM turn scoped to one epic, or the goal-level top PM when absent. */
function pmTurn(req: Parameters<FakeTurnHandler>[0], epic?: string): boolean {
  if (stepOf(req) !== "pm") return false;
  return epic
    ? req.prompt.includes(`- epic: \`${epic}\``)
    : !req.prompt.includes("- epic:");
}

function epicConsult(
  req: Parameters<FakeTurnHandler>[0],
  iteration: string,
  epic: string,
  pass: "report" | "direction",
): boolean {
  return (
    stepOf(req) === "subarchitect" &&
    iterationOf(req).includes(iteration) &&
    req.prompt.includes(`- epic: \`${epic}\``) &&
    req.prompt.includes(`- pass: \`${pass}\``)
  );
}

interface SagaPmCtx {
  goal: ReturnType<typeof makeGoal>;
  planPath: string;
  alphaPlan: string;
  betaPlan: string;
  harness: FakeHarness;
}

/** Iteration 1: the top registers both epics; the direction pass plans them. */
function scriptRegisterAndPlans(ctx: SagaPmCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      fs.writeFileSync(ctx.planPath, GOAL_PLAN, "utf8");
      turnedCtx.writeOutcome(
        outcome({ summary: "split into alpha and beta", decision: "continue" }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => iterationOf(req).includes("-i1-architect-") },
  );
  for (const [epic, plan, text] of [
    ["alpha", ctx.alphaPlan, ALPHA_PLAN],
    ["beta", ctx.betaPlan, BETA_PLAN],
  ] as const) {
    ctx.harness.script(
      (req, turnedCtx) => {
        fs.mkdirSync(path.dirname(plan), { recursive: true });
        fs.writeFileSync(plan, text, "utf8");
        turnedCtx.writeOutcome(
          outcome({ summary: `epic ${epic} planned`, decision: "continue" }),
        );
        return fakeTurnResult(req);
      },
      { when: (req) => epicConsult(req, "-i1-", epic, "direction") },
    );
  }
}

/** Each epic's own PM derives that epic's plan, before the top PM runs. */
function scriptDerivePms(ctx: SagaPmCtx, iteration: string): void {
  for (const [epic, file] of [
    ["alpha", "alpha.txt"],
    ["beta", "beta.txt"],
  ] as const) {
    const slug = `${epic}.build`;
    ctx.harness.script(
      (req, turnedCtx) => {
        expect(req.prompt).toContain(`- epic \`${epic}\`:`);
        expect(req.prompt).not.toContain("- goal:");
        expect(req.prompt).toContain(`- epic: \`${epic}\``);
        expect(req.prompt).not.toContain(STEER_TEXT);
        if (iteration !== "-i1-") {
          turnedCtx.writeOutcome(
            outcome({ summary: `${epic} has no new work` }),
          );
          return fakeTurnResult(req);
        }
        fs.mkdirSync(ctx.goal.tasksDir, { recursive: true });
        fs.writeFileSync(
          path.join(ctx.goal.tasksDir, `${slug}.md`),
          epicTask(slug, epic, file),
          "utf8",
        );
        turnedCtx.writeOutcome(
          outcome({ summary: `filed ${slug} in epic ${epic}` }),
        );
        return fakeTurnResult(req);
      },
      {
        when: (req) =>
          pmTurn(req, epic) && iterationOf(req).includes(iteration),
      },
    );
  }
}

/**
 * The top PM sees the goal and the epics' tasks but never an epic plan or the
 * epic-scoped steer. In iteration 1 it drops that steer after its turn.
 */
function scriptTopPm(
  ctx: SagaPmCtx,
  opts: { iteration: string; dropSteer: boolean },
): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      expect(req.prompt).toContain("- goal:");
      expect(req.prompt).not.toContain("- epic `alpha`: ");
      expect(req.prompt).not.toContain("- epic `beta`: ");
      expect(req.prompt).not.toContain(STEER_TEXT);
      if (opts.iteration === "-i1-") {
        expect(req.prompt).toContain("alpha.build");
        expect(req.prompt).toContain("beta.build");
      }
      if (opts.dropSteer)
        writeEpicSteer(ctx.goal.goalDir, STEER, "alpha", STEER_TEXT);
      turnedCtx.writeOutcome(outcome({ summary: "no goal-level tasks" }));
      return fakeTurnResult(req);
    },
    { when: (req) => pmTurn(req) && iterationOf(req).includes(opts.iteration) },
  );
}

/** Both epics' task turns in iteration 1. */
function scriptSagaTasks(ctx: SagaPmCtx): void {
  for (const [slug, file] of [
    ["alpha.build", "alpha.txt"],
    ["beta.build", "beta.txt"],
  ] as const) {
    ctx.harness.script(implementer(file), {
      when: (req) =>
        fakeTurnIdentity(req).slug === slug &&
        fakeTurnIdentity(req).step === "implement",
    });
    ctx.harness.script(approver(`${slug} is correct`), {
      when: (req) =>
        fakeTurnIdentity(req).slug === slug &&
        fakeTurnIdentity(req).step === "review",
    });
  }
}

/**
 * The steer is alpha's: only alpha's PM routes it. Alpha's architect sees it in
 * its own pack, answers it, and the answer lands in the outbox.
 */
function scriptSteerPm(ctx: SagaPmCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      expect(req.prompt).toContain(`- epic: \`alpha\``);
      expect(req.prompt).not.toContain("- goal:");
      expect(req.prompt).toContain(STEER_TEXT);
      turnedCtx.writeOutcome(
        outcome({
          summary: "alpha owns the steer",
          steerRoutes: [{ steer: STEER, route: "architect" }],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => pmTurn(req, "alpha") && req.prompt.includes(STEER_TEXT) },
  );
}

/** Iteration 2's bottom-up reports: alpha answers the steer, beta never sees it. */
function scriptReportsI2(ctx: SagaPmCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      expect(readPack(req)).toContain(STEER);
      turnedCtx.writeOutcome(
        outcome({
          summary: "alpha holds its interface",
          decision: "continue",
          steerAnswers: [{ steer: STEER, answer: "alpha will hold" }],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => epicConsult(req, "-i2-", "alpha", "report") },
  );
  ctx.harness.script(
    (req, turnedCtx) => {
      expect(readPack(req)).not.toContain(STEER);
      turnedCtx.writeOutcome(
        outcome({ summary: "beta still owes work", decision: "continue" }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => epicConsult(req, "-i2-", "beta", "report") },
  );
}

/** Iteration 2's top turn names no epic for direction and edits the goal plan. */
function scriptArchitectI2(ctx: SagaPmCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      expect(readPack(req)).not.toContain(STEER);
      fs.appendFileSync(
        ctx.planPath,
        "\n## Milestone 2\n- hold the cross-epic interface.\n",
        "utf8",
      );
      turnedCtx.writeOutcome(
        outcome({
          summary: "no epic takes new direction",
          decision: "continue",
          epicConsults: [],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => iterationOf(req).includes("-i2-architect-") },
  );
}

/** Iteration 3: both epics finish, then the top closes the goal. */
function scriptDoneIteration(ctx: SagaPmCtx): void {
  for (const epic of ["alpha", "beta"] as const) {
    ctx.harness.script(
      (req, turnedCtx) => {
        turnedCtx.writeOutcome(
          outcome({ summary: `${epic} complete`, decision: "done" }),
        );
        return fakeTurnResult(req);
      },
      { when: (req) => epicConsult(req, "-i3-", epic, "report") },
    );
  }
  ctx.harness.script(
    (req, turnedCtx) => {
      turnedCtx.writeOutcome(
        outcome({ summary: "goal complete", decision: "done" }),
      );
      return fakeTurnResult(req);
    },
    { when: (req) => iterationOf(req).includes("-i3-architect-") },
  );
}

/** Each epic plan became a task of its own epic; the top PM filed none. */
function expectScopedTasks(goal: ReturnType<typeof makeGoal>): void {
  for (const [slug, epic] of [
    ["alpha.build", "alpha"],
    ["beta.build", "beta"],
  ] as const) {
    const text = fs.readFileSync(
      path.join(goal.tasksDir, `${slug}.md`),
      "utf8",
    );
    expect(text).toContain(`epic: ${epic}`);
  }
}

/** Each PM turn records the architect it derives for; the top records none. */
async function expectPmScopes(
  goal: ReturnType<typeof makeGoal>,
): Promise<void> {
  const store = createFolderStore(goal.goalDir, undefined, {});
  const pms = (await store.listRecords()).filter(
    (record) => record.step === "pm",
  );
  expect(pms.some((record) => record.architect === "alpha")).toBe(true);
  expect(pms.some((record) => record.architect === "beta")).toBe(true);
  expect(pms.some((record) => record.architect === undefined)).toBe(true);
}

/** The epic steer's only PM and architect are alpha's; the top and beta never see it. */
function expectSteerIsolated(ctx: SagaPmCtx): void {
  const steerTurns = ctx.harness.calls.filter(
    (call) => stepOf(call) === "pm" && call.prompt.includes(STEER_TEXT),
  );
  expect(steerTurns.length).toBeGreaterThan(0);
  for (const call of steerTurns) {
    expect(call.prompt).toContain("- epic: `alpha`");
    expect(call.prompt).not.toContain("- goal:");
  }
  const alphaReport = ctx.harness.calls.find((call) =>
    epicConsult(call, "-i2-", "alpha", "report"),
  );
  if (!alphaReport) throw new Error("alpha's report turn did not run");
  expect(readPack(alphaReport)).toContain(STEER);
  expect(
    fs.readFileSync(
      path.join(ctx.goal.goalDir, "mailbox/outbox", `steer-${STEER}.md`),
      "utf8",
    ),
  ).toContain("alpha will hold");
  expect(
    fs.existsSync(path.join(ctx.goal.goalDir, "mailbox/inbox", `${STEER}.md`)),
  ).toBe(false);
  // Every later consult and PM turn runs without the answered steer.
  for (const call of ctx.harness.calls) {
    if (!["pm", "subarchitect", "architect"].includes(stepOf(call))) continue;
    if (iterationOf(call).includes("-i1-")) continue;
    if (epicConsult(call, "-i2-", "alpha", "report")) continue;
    expect(call.prompt).not.toContain(STEER_TEXT);
  }
}

function registerEpicPms(): void {
  it("derives each epic's plan through its own PM and keeps an epic steer to that PM and architect", async () => {
    const goal = makeGoal({ processYaml: PROCESS });
    try {
      const ctx: SagaPmCtx = {
        goal,
        planPath: goal.planPath,
        alphaPlan: path.join(goal.goalDir, "epics/alpha.md"),
        betaPlan: path.join(goal.goalDir, "epics/beta.md"),
        harness: new FakeHarness({ id: "fake" }),
      };
      scriptRegisterAndPlans(ctx);
      scriptSagaTasks(ctx);
      scriptSteerPm(ctx);
      scriptDerivePms(ctx, "-i1-");
      scriptTopPm(ctx, { iteration: "-i1-", dropSteer: true });
      scriptReportsI2(ctx);
      scriptArchitectI2(ctx);
      scriptDerivePms(ctx, "-i2-");
      scriptTopPm(ctx, { iteration: "-i2-", dropSteer: false });
      scriptDoneIteration(ctx);

      await expectLaunch(0, goal.repo, ctx.harness, 3);
      expectScopedTasks(goal);
      await expectPmScopes(goal);
      expectSteerIsolated(ctx);
    } finally {
      cleanup(goal);
    }
  }, 60_000);
}

describe("one PM per epic", () => {
  registerEpicPms();
});
