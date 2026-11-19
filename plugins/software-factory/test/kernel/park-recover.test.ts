import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { defaultParkRoute } from "../../src/kernel/park-route.js";
import { runStallPm } from "../../src/kernel/pm.js";
import { scriptMeta } from "../../src/kernel/record.js";
import { parseTaskFile, renderTaskFile } from "../../src/kernel/tasks.js";
import { task } from "./helpers.js";
import { withKernelRoleFallbacks } from "./fake-defaults.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

/** One red gate, then the fix arm: the first red asks for a fix, the second parks. */
const process = {
  flows: {
    "implement-review": {
      steps: [
        {
          id: "implement",
          prompt: "implementer",
          alias: "implementer",
          alternates: ["implementer-alt"],
        },
        { id: "checks", changeRequests: 0 },
        {
          id: "review",
          prompt: "reviewer",
          alias: "reviewer",
          review: true,
          changeRequests: 0,
        },
      ],
    },
  },
};

const aliases = {
  architect: { harness: "fake", model: "fake-architect" },
  pm: { harness: "fake", model: "fake-pm" },
  digest: { harness: "fake", model: "fake-digest" },
  implementer: { harness: "fake", model: "fake-impl" },
  "implementer-alt": { harness: "fake", model: "fake-alt-impl" },
  researcher: { harness: "fake", model: "fake-research" },
  reviewer: { harness: "fake", model: "fake-review" },
  steward: { harness: "fake", model: "fake-steward" },
  "plan-checker": { harness: "fake", model: "fake-check" },
  "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
};

const BETA_BODY = "Write beta.txt.\nDone when: beta.txt holds beta.";

function bumpRevision(
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
  slug: string,
): void {
  const file = path.join(runtime.store.tasksDir, `${slug}.md`);
  const current = parseTaskFile(fs.readFileSync(file, "utf8"), slug);
  fs.writeFileSync(
    file,
    renderTaskFile({
      ...current,
      revision: current.revision + 1,
      body: `${current.body}\nKeep the kept work and finish it.`,
    }),
    "utf8",
  );
}

describe("per-cause default routing", () => {
  it("leaves review rejections and design blockers to the architect", () => {
    // The task's named edge: a rejected premise or an impossible approach is
    // direction, not a retry.
    expect(defaultParkRoute("review rejected: premise is wrong").action).toBe(
      "leave",
    );
    expect(
      defaultParkRoute("blocked: the API cannot express this").action,
    ).toBe("leave");
    // The fixable classes keep the branch; the spike's table is the default.
    expect(defaultParkRoute("gates: unit").action).toBe("amend");
    expect(defaultParkRoute("base-conflict: clash.txt").action).toBe("amend");
    expect(defaultParkRoute("failed: no work").action).toBe("replace");
    expect(defaultParkRoute("anything else").action).toBe("leave");
  });
});

describe("park recovery inside the running iteration", () => {
  it("amends a red-gate park in an iteration that merged another task, and the task reruns in-iteration", async () => {
    const { repo, goal } = setupFlowRepo({
      process,
      aliases,
      gates: [{ id: "ready", command: "test ! -f beta-red.txt" }],
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      let stallPrompt = "";
      let betaTurns = 0;

      harness.script(
        (req, ctx) => {
          fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
          ctx.writeOutcome(outcome({ summary: "alpha implemented" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "alpha", step: "implement" }) },
      );
      const approve: FakeTurnHandler = (req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      };
      harness.script(approve, { when: whenTurn({ step: "review" }) });
      harness.script(approve, { when: whenTurn({ step: "review" }) });
      // The first turn arms the gate, the gate-fix turn keeps the same red,
      // and the amended turn keeps the branch and clears it.
      const betaTurn: FakeTurnHandler = (req, ctx) => {
        betaTurns += 1;
        if (betaTurns === 1) {
          fs.writeFileSync(
            path.join(req.cwd!, "beta-red.txt"),
            "red\n",
            "utf8",
          );
        } else if (betaTurns === 2) {
          fs.writeFileSync(path.join(req.cwd!, "fix-1.txt"), "fix\n", "utf8");
        } else {
          expect(fs.existsSync(path.join(req.cwd!, "fix-1.txt"))).toBe(true);
          expect(fs.existsSync(path.join(req.cwd!, "beta-red.txt"))).toBe(true);
          fs.rmSync(path.join(req.cwd!, "beta-red.txt"), { force: true });
          fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
        }
        ctx.writeOutcome(outcome({ summary: "beta implemented" }));
        return fakeTurnResult(req);
      };
      for (let i = 0; i < 3; i += 1)
        harness.script(betaTurn, {
          when: whenTurn({ slug: "beta", step: "implement" }),
        });
      harness.script(
        (req, ctx) => {
          stallPrompt = req.prompt;
          bumpRevision(runtime, "beta");
          ctx.writeOutcome(
            outcome({
              summary: "amend beta",
              stallRoutes: [
                {
                  slug: "beta",
                  action: "amend",
                  reason: "the named gate is fixable on the kept branch",
                },
              ],
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );

      await writeTask(
        runtime,
        task("alpha", { scope: ["alpha.txt"], body: "Write alpha.txt." }),
      );
      await writeTask(
        runtime,
        task("beta", { scope: ["beta.txt"], body: BETA_BODY }),
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.alpha!.status).toBe("merged");
      expect(state.tasks.beta!.status).toBe("merged");

      // One wave merged alpha and still parked beta; the PM decided the park
      // and beta reran on its branch before the boundary.
      expect(
        records.some(
          (r) =>
            r.slug === "alpha" &&
            r.step === "merge" &&
            r.ok === true &&
            r.iteration === 1,
        ),
      ).toBe(true);
      const routes = records.filter((r) => r.step === "stall-routes");
      expect(routes).toHaveLength(1);
      expect(routes[0]!.iteration).toBe(1);
      expect(routes[0]!.outcome?.stallRoutes).toEqual([
        {
          slug: "beta",
          action: "amend",
          reason: "the named gate is fixable on the kept branch",
        },
      ]);
      const betaTurnsRun = records
        .filter(
          (r) =>
            r.slug === "beta" && r.step === "implement" && r.actor === "agent",
        )
        .sort((a, b) => a.seq - b.seq);
      expect(betaTurnsRun).toHaveLength(3);
      expect(betaTurnsRun.map((r) => r.revision)).toEqual([0, 0, 1]);
      // The amend restarts the round, and the failure class that parked it
      // sends the rerun to the step's next alternate.
      expect(betaTurnsRun[2]!.round).toBe(1);
      expect(betaTurnsRun[2]!.model!.id).toBe("fake-alt-impl");
      for (const record of records.filter((r) => r.slug === "beta")) {
        expect(record.iteration).toBe(1);
      }

      // The PM saw the park evidence, the kept branch and the cause's default.
      expect(stallPrompt).toContain("cause: gates: ready");
      expect(stallPrompt).toContain("factory-task/demo/beta");
      expect(stallPrompt).toContain("amends: 0 of 1");
      expect(stallPrompt).toContain("default: amend — fix the named gate");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("refuses a second amend of one slug in an iteration and leaves the park", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("alpha", { scope: ["alpha.txt"], body: "Write alpha.txt." }),
      );
      await runtime.store.appendRecord(
        scriptMeta(1, "park", { slug: "alpha" }),
        {
          ok: true,
          cause: "gates: unit",
        },
      );
      await runtime.store.appendRecord(
        scriptMeta(1, "stall-routes", { round: 1 }),
        {
          ok: true,
          outcome: outcome({
            summary: "amended alpha",
            stallRoutes: [
              { slug: "alpha", action: "amend", reason: "fixed the gate" },
            ],
          }),
        },
      );
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      let brief = "";
      harness.script(
        (req, ctx) => {
          brief = req.prompt;
          bumpRevision(runtime, "alpha");
          ctx.writeOutcome(
            outcome({
              summary: "amend alpha again",
              stallRoutes: [
                { slug: "alpha", action: "amend", reason: "try again" },
              ],
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );
      // The bound refuses the first turn; the retry picks a decision the
      // budget allows.
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcome({
              summary: "leave the park for the architect",
              stallRoutes: [
                {
                  slug: "alpha",
                  action: "leave",
                  reason: "the amend budget is spent",
                },
              ],
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );

      const result = await runStallPm(runtime, {
        iteration: 1,
        state,
        slugs: ["alpha"],
        cwd: runtime.paths.goalCheckout,
      });
      expect(result.continued).toEqual([]);
      expect(result.left).toEqual(["alpha"]);
      const records = await runtime.store.listRecords();
      const validations = records.filter((r) => r.step === "pm-validate");
      expect(validations[0]!.cause).toContain("limits.parkAmends");
      // The refused amend was rolled back: the retry left revision 0.
      const file = path.join(runtime.store.tasksDir, "alpha.md");
      expect(
        parseTaskFile(fs.readFileSync(file, "utf8"), "alpha").revision,
      ).toBe(0);
      // The first PM turn saw the spent budget and the cause's default.
      expect(brief).toContain("amends: 1 of 1");
      expect(brief).toContain("amend refused");
      expect(brief).toContain("default: amend — fix the named gate");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("merges a moved head into an amended kept branch on its first turn and resolves it there", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      let amendedPrompt = "";
      let headAtAmend = "";

      harness.script(
        (req, ctx) => {
          fs.writeFileSync(path.join(req.cwd!, "clash.txt"), "beta\n", "utf8");
          ctx.writeOutcome(
            outcome({ status: "failed", summary: "beta left the clash open" }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "beta", step: "implement" }) },
      );
      harness.script(
        (req, ctx) => {
          amendedPrompt = req.prompt;
          // The head moved while beta was parked; the first turn merges it
          // and asks for the conflict to be settled in this turn.
          expect(req.prompt).toContain("Conflicted files: clash.txt");
          fs.writeFileSync(
            path.join(req.cwd!, "clash.txt"),
            "beta\nzeta\n",
            "utf8",
          );
          fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
          ctx.writeOutcome(outcome({ summary: "beta resolved the clash" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "beta", step: "implement" }) },
      );
      harness.script(
        (req, ctx) => {
          fs.writeFileSync(path.join(req.cwd!, "zeta.txt"), "zeta\n", "utf8");
          fs.writeFileSync(path.join(req.cwd!, "clash.txt"), "zeta\n", "utf8");
          ctx.writeOutcome(outcome({ summary: "zeta implemented" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ slug: "zeta", step: "implement" }) },
      );
      const approve: FakeTurnHandler = (req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      };
      harness.script(approve, { when: whenTurn({ step: "review" }) });
      harness.script(approve, { when: whenTurn({ step: "review" }) });
      harness.script(
        (req, ctx) => {
          headAtAmend = repo.git(["rev-parse", "factory/demo"]).stdout.trim();
          bumpRevision(runtime, "beta");
          ctx.writeOutcome(
            outcome({
              summary: "amend beta",
              stallRoutes: [
                {
                  slug: "beta",
                  action: "amend",
                  reason: "the kept clash resolution is worth keeping",
                },
              ],
            }),
          );
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );

      await writeTask(
        runtime,
        task("beta", { scope: ["beta.txt", "clash.txt"], body: BETA_BODY }),
      );
      await writeTask(
        runtime,
        task("zeta", { scope: ["zeta.txt", "clash.txt"], body: "Write zeta." }),
      );

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.zeta!.status).toBe("merged");
      expect(state.tasks.beta!.status).toBe("merged");

      // The amended turn merged the head before it ran and judged the range
      // from that head.
      const amended = records
        .filter(
          (r) =>
            r.slug === "beta" &&
            r.step === "implement" &&
            r.actor === "agent" &&
            r.revision === 1,
        )
        .at(-1)!;
      expect(amended.base).toBe(headAtAmend);
      expect(amendedPrompt).toContain("Conflicted files: clash.txt");
      // The conflict was resolved in the turn, never parked.
      expect(
        records.some(
          (r) =>
            r.slug === "beta" &&
            r.step === "park" &&
            r.cause?.startsWith("base-conflict:"),
        ),
      ).toBe(false);
      expect(repo.git(["show", "factory/demo:clash.txt"]).stdout.trim()).toBe(
        "beta\nzeta",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
