/**
 * A depth-2 steer whose epic is not the live PM's stays out of that turn: the
 * live sink refuses it, the loop wakes, and its own epic's PM routes it. A
 * claim that still carries a foreign steer is rejected by the steer validation.
 */

import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import type { LiveAgents } from "../../src/harness/types.js";
import { derive } from "../../src/kernel/derive.js";
import { scanInbox } from "../../src/kernel/mailbox.js";
import { runSteerPm } from "../../src/kernel/pm.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import type { PmScope } from "../../src/kernel/pm/types.js";
import { pmScopeOf } from "./e2e-helpers.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";
import {
  ALPHA_PLAN,
  approver,
  BETA_PLAN,
  GOAL_PLAN,
  implementer,
} from "./saga-helpers.js";

const WATCH_TICK_MS = 20;
const DEBOUNCE_SECONDS = 0.02;
const S1 = "s1";
const S1_TEXT = "keep alpha's interface small";
const S2 = "s2";
const S2_TEXT = "late beta change";

const S1_STEER = `---\nepic: alpha\n---\n\n${S1_TEXT}.\n`;
const S2_STEER = `---\nepic: beta\n---\n\n${S2_TEXT}.\n`;

interface ScopeCtx {
  repo: ReturnType<typeof setupFlowRepo>["repo"];
  runtime: KernelRuntime;
  harness: FakeHarness;
  injected: string[];
}

/** A two-epic goal with one dispatchable alpha task and an optional live sink. */
async function scopeCtx(live: boolean): Promise<ScopeCtx> {
  const { repo, goal } = setupFlowRepo({
    process: { hierarchy: { depth: 2 } },
    limits: {
      concurrency: { overall: 1 },
      steerDebounceSeconds: DEBOUNCE_SECONDS,
    },
  });
  const injected: string[] = [];
  const agents: LiveAgents = {
    list: async () => [],
    steer: async () => {},
    steerSession: async (message) => {
      injected.push(message);
    },
  };
  const harness = new FakeHarness({
    id: "fake",
    ...(live ? { live: () => agents } : {}),
  });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  fs.mkdirSync(path.join(runtime.store.goalDir, "epics"), { recursive: true });
  fs.writeFileSync(
    path.join(runtime.store.goalDir, "plan.md"),
    GOAL_PLAN,
    "utf8",
  );
  fs.writeFileSync(
    path.join(runtime.store.goalDir, "epics/alpha.md"),
    ALPHA_PLAN,
    "utf8",
  );
  fs.writeFileSync(
    path.join(runtime.store.goalDir, "epics/beta.md"),
    BETA_PLAN,
    "utf8",
  );
  await writeTask(
    runtime,
    task("alpha.build", { epic: "alpha", body: "Create alpha.txt." }),
  );
  return { repo, runtime, harness, injected };
}

/** One steer at the live PM turn: alpha's PM posts a beta steer and routes s1. */
function scriptAlphaPm(ctx: ScopeCtx): void {
  ctx.harness.script(
    async (req, turnedCtx) => {
      expect(pmScopeOf(req)).toBe("alpha");
      expect(req.prompt).toContain(S1_TEXT);
      expect(req.prompt).not.toContain(S2_TEXT);
      await ctx.runtime.store.mailbox.publish(`${S2}.md`, S2_STEER);
      // Longer than the watch tick plus debounce: a scope-blind sink would have
      // injected s2 by now and its text would be in this turn's claim.
      await sleep(WATCH_TICK_MS * 10);
      expect(ctx.injected).toEqual([]);
      expect(req.prompt).not.toContain(S2_TEXT);
      turnedCtx.writeOutcome(
        outcome({
          summary: "alpha holds its interface",
          steerRoutes: [{ steer: S1, route: "architect" }],
        }),
      );
      return fakeTurnResult(req);
    },
    {
      when: (req) => pmScopeOf(req) === "alpha" && req.prompt.includes(S1_TEXT),
    },
  );
}

/** The beta steer gets beta's own PM turn and no other PM answers it. */
function scriptBetaPm(ctx: ScopeCtx): void {
  ctx.harness.script(
    (req, turnedCtx) => {
      expect(pmScopeOf(req)).toBe("beta");
      expect(req.prompt).not.toContain(S1_TEXT);
      expect(req.prompt).toContain(S2_TEXT);
      turnedCtx.writeOutcome(
        outcome({
          summary: "beta sees its own steer",
          steerRoutes: [{ steer: S2, route: "architect" }],
        }),
      );
      return fakeTurnResult(req);
    },
    {
      when: (req) => pmScopeOf(req) === "beta" && req.prompt.includes(S2_TEXT),
    },
  );
}

/** Alpha's task turn posts s1; both epic PM handlers are bound. */
function scriptLiveScope(ctx: ScopeCtx): void {
  ctx.harness.script(
    implementer("alpha.txt", () =>
      ctx.runtime.store.mailbox.publish(`${S1}.md`, S1_STEER),
    ),
    { when: whenTurn({ slug: "alpha.build", step: "implement" }) },
  );
  ctx.harness.script(approver("alpha is correct"), {
    when: whenTurn({ slug: "alpha.build", step: "review" }),
  });
  scriptAlphaPm(ctx);
  scriptBetaPm(ctx);
}

/** Every committed route with the PM scope that accepted it. */
async function routesOf(
  ctx: ScopeCtx,
): Promise<Array<{ steer: string; architect: string | undefined }>> {
  const records = await ctx.runtime.store.listRecords();
  return records
    .filter((record) => record.step === "steer-routes")
    .flatMap((record) =>
      (record.outcome?.steerRoutes ?? []).map((entry) => ({
        steer: entry.steer,
        architect: record.architect,
      })),
    );
}

function registerLiveSteerScope(): void {
  it("queues a steer of another epic instead of injecting it into the live PM", async () => {
    const ctx = await scopeCtx(true);
    try {
      scriptLiveScope(ctx);
      const dispatched = await runDispatch(ctx.runtime, {
        iteration: 1,
        steerWatchTickMs: WATCH_TICK_MS,
      });
      expect(dispatched.reason).toBe("boundary");
      expect(ctx.injected).toEqual([]);
      expect(await routesOf(ctx)).toEqual([
        { steer: S1, architect: "alpha" },
        { steer: S2, architect: "beta" },
      ]);
    } finally {
      cleanupFlowRepo(ctx.repo);
    }
  }, 60_000);
}

async function steerFrom(runtime: KernelRuntime, id: string) {
  const steers = await scanInbox(runtime.store, { settleMs: 0 });
  const steer = steers.find((entry) => entry.id === id);
  if (!steer) throw new Error(`steer ${id} is not in the inbox`);
  return steer;
}

/** A PM that routes the foreign steer; bound once per ladder rung. */
const refusingPm: FakeTurnHandler = (req, turnedCtx) => {
  expect(req.prompt).toContain(S2_TEXT);
  turnedCtx.writeOutcome(
    outcome({
      summary: "alpha would route beta's steer",
      steerRoutes: [{ steer: S2, route: "architect" }],
    }),
  );
  return fakeTurnResult(req);
};

/** One two-rung ladder that carries the foreign steer in its claim. */
async function foreignClaim(ctx: ScopeCtx, scope?: PmScope) {
  ctx.harness.script(refusingPm);
  ctx.harness.script(refusingPm);
  const tasks = await ctx.runtime.store.listTasks();
  return runSteerPm(ctx.runtime, {
    iteration: 1,
    state: derive(tasks, []),
    tasks,
    steers: [await steerFrom(ctx.runtime, S2)],
    ...(scope ? { scope } : {}),
    cwd: ctx.runtime.paths.goalCheckout,
  });
}

function registerForeignClaimRefusal(): void {
  it("rejects a claim that carries another epic's steer even with a route", async () => {
    const ctx = await scopeCtx(false);
    try {
      await ctx.runtime.store.mailbox.publish(`${S2}.md`, S2_STEER);
      const run = await foreignClaim(ctx, { kind: "epic", epic: "alpha" });
      if (run.status !== "architect")
        throw new Error(`the foreign claim was not refused: ${run.status}`);
      expect(run.findings).toContain(
        `steer "${S2}" is epic beta's; the PM for epic alpha routes only epic alpha steers`,
      );
      const goalRun = await foreignClaim(ctx);
      if (goalRun.status !== "architect")
        throw new Error(`the goal claim was not refused: ${goalRun.status}`);
      expect(goalRun.findings).toContain(
        `steer "${S2}" is epic beta's; the goal PM routes only goal-level steers`,
      );
      expect(await routesOf(ctx)).toEqual([]);
      expect(
        await ctx.runtime.store.mailbox.read("inbox", `${S2}.md`),
      ).not.toBeNull();
    } finally {
      cleanupFlowRepo(ctx.repo);
    }
  }, 60_000);
}

describe("epic steer scope at the live PM", () => {
  registerLiveSteerScope();
  registerForeignClaimRefusal();
});
