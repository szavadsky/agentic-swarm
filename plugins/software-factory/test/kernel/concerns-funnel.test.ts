import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { openConcerns } from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import {
  activeHolds,
  heldBoundaryCause,
} from "../../src/kernel/dispatch-holds.js";
import { readHolds } from "../../src/kernel/mailbox.js";
import { runStallPm } from "../../src/kernel/pm.js";
import { cleanupFlowRepo, whenTurn } from "../kernel/s2-helpers.js";
import { cause, task } from "./helpers.js";
import {
  CONCERN_ID,
  CONCERN_TEXT,
  hold,
  liveHolds,
  recordConcern,
  runStall,
  stallLeave,
  stallWithConcern,
} from "./concerns-funnel-helpers.js";
import { fakeTurnResult, FakeHarness } from "../../src/harness/fake/index.js";
import {
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";
import { writeHold, writePlan } from "./steer-holds-helpers.js";

function registerConcernHoldGating(): void {
  it("holds the tasks a concern names while it is open and none after it closes", () => {
    const holds = [hold(CONCERN_ID, ["alpha", "beta"]), hold("s1", ["gamma"])];
    const gated = activeHolds(holds, new Set(["s1"]), new Set([CONCERN_ID]));
    expect([...gated.slugs.keys()].sort()).toEqual(["alpha", "beta", "gamma"]);
    expect(gated.slugs.get("alpha")).toBe(`concern ${CONCERN_ID}`);
    expect(gated.slugs.get("gamma")).toBe("s1");
    const closed = activeHolds(holds, new Set(["s1"]), new Set());
    expect([...closed.slugs.keys()]).toEqual(["gamma"]);
  });

  it("never drains the goal for a concern, and holds nothing for an empty mark", () => {
    const gated = activeHolds(
      [hold(CONCERN_ID, [], true)],
      new Set(),
      new Set([CONCERN_ID]),
    );
    expect(gated.goal).toBeUndefined();
    expect(gated.slugs.size).toBe(0);
  });

  it("names the concern, not a steer id, in the boundary cause of a held wave", () => {
    const gated = activeHolds(
      [hold(CONCERN_ID, ["alpha"])],
      new Set(),
      new Set([CONCERN_ID]),
    );
    const boundaryCause = heldBoundaryCause(gated, {
      tasks: { alpha: { status: "ready" } },
    } as never);
    expect(boundaryCause).toEqual(
      cause(`steer: concern ${CONCERN_ID} holds alpha`),
    );
  });
}

function registerConcernMarkBlocking(): void {
  it("holds the tasks a wave-end mark names and keeps the concern in the pack", async () => {
    const { repo, runtime, harness, state } = await stallWithConcern();
    try {
      harness.script(
        (req, ctx) => {
          expect(req.prompt).toContain("open concerns:");
          expect(req.prompt).toContain(
            `- ${CONCERN_ID} [risk/architect]: ${CONCERN_TEXT}`,
          );
          return stallLeave(runtime, { id: CONCERN_ID, slugs: ["gamma"] })(
            req,
            ctx,
          );
        },
        { when: whenTurn({ step: "pm" }) },
      );
      expect(await runStall(runtime, state)).toEqual({
        continued: [],
        left: ["alpha"],
      });
      expect([...(await liveHolds(runtime)).slugs.keys()]).toEqual(["gamma"]);
      // The mark withholds work; the concern itself still travels.
      const records = await runtime.store.listRecords();
      expect(openConcerns(records).map((concern) => concern.id)).toContain(
        CONCERN_ID,
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerConcernMarkPassed(): void {
  it("records a passed-on concern with an empty hold that withholds nothing", async () => {
    const { repo, runtime, harness, state } = await stallWithConcern();
    try {
      harness.script(stallLeave(runtime), { when: whenTurn({ step: "pm" }) });
      expect(await runStall(runtime, state)).toEqual({
        continued: [],
        left: ["alpha"],
      });
      expect((await liveHolds(runtime)).slugs.size).toBe(0);
      const holds = (await readHolds(runtime.store)).holds;
      expect(holds.find((entry) => entry.steer === CONCERN_ID)).toEqual({
        steer: CONCERN_ID,
        slugs: [],
        goal: false,
      });
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("lists a judged concern once, never again", async () => {
    const { repo, runtime, harness, state } = await stallWithConcern();
    try {
      harness.script(stallLeave(runtime), { when: whenTurn({ step: "pm" }) });
      await runStall(runtime, state);
      harness.script(
        (req, ctx) => {
          expect(req.prompt).toContain("open concerns: `none`");
          return stallLeave(runtime)(req, ctx);
        },
        { when: whenTurn({ step: "pm" }) },
      );
      expect((await runStall(runtime, state)).left).toEqual(["alpha"]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerConcernMarkInvalid(): void {
  it("refuses a mark naming a task that does not exist and drops it", async () => {
    const { repo, runtime, harness, state } = await stallWithConcern();
    try {
      for (let round = 0; round < 2; round++) {
        harness.script(
          stallLeave(runtime, { id: CONCERN_ID, slugs: ["ghost"] }),
          { when: whenTurn({ step: "pm" }) },
        );
      }
      expect((await runStall(runtime, state)).left).toEqual(["alpha"]);
      const rejection = (await runtime.store.listRecords()).find(
        (record) => record.step === "pm-validate" && !record.ok,
      );
      expect(rejection?.cause?.detail).toContain(
        `concern ${CONCERN_ID} hold names unknown task(s): ghost`,
      );
      const file = path.join(runtime.store.mailbox.holds, `${CONCERN_ID}.yaml`);
      expect(fs.existsSync(file)).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerConcernOnlyPm(): void {
  it("judges open concerns without parks, forbids task edits, and retries with the concerns contract", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: {
        concurrency: { overall: 1, perSubscription: {}, perModel: {} },
      },
    });
    const harness = new FakeHarness({ id: "fake" });
    const runtime = await makeRuntime(repo, goal, { fake: harness });
    try {
      writePlan(runtime);
      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      await recordConcern(runtime, "beta");
      await runtime.store.appendRecord(
        {
          iteration: 1,
          slug: "beta",
          step: "merge",
          round: 1,
          actor: "script",
        },
        { ok: true },
      );
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      let retryPrompt = "";
      harness.script(
        (req, ctx) => {
          expect(req.prompt).toContain("stalled parks: `none`");
          expect(req.prompt).toContain(
            `- ${CONCERN_ID} [risk/architect]: ${CONCERN_TEXT}`,
          );
          // Editing a task file on a concern-only turn must be rejected.
          fs.appendFileSync(
            path.join(runtime.store.tasksDir, "alpha.md"),
            "\nEdited.\n",
            "utf8",
          );
          ctx.writeOutcome(outcome({ summary: "illegal edit" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );
      harness.script(
        (req, ctx) => {
          retryPrompt = req.prompt;
          writeHold(runtime, CONCERN_ID, ["alpha"]);
          ctx.writeOutcome(outcome({ summary: "marked blocking concern" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );
      const res = await runStallPm(runtime, {
        iteration: 1,
        state,
        slugs: [],
        cwd: runtime.paths.goalCheckout,
      });
      expect(res).toEqual({ continued: [], left: [] });
      expect(retryPrompt).toContain("Restated PM concerns contract:");
      expect(retryPrompt).not.toContain("Route every parked slug");
      expect([...(await liveHolds(runtime)).slugs.keys()]).toEqual(["alpha"]);
      const records = await runtime.store.listRecords();
      expect(records.filter((r) => r.step === "stall-routes")).toEqual([]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("concerns funnel", () => {
  registerConcernHoldGating();
  registerConcernMarkBlocking();
  registerConcernMarkPassed();
  registerConcernMarkInvalid();
  registerConcernOnlyPm();
});
