import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { pmSchema } from "../../src/kernel/config.js";
import { derive } from "../../src/kernel/derive.js";
import { runPmFlow } from "../../src/kernel/pm.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { workCalls } from "./fake-defaults.js";
import { simpleTask } from "./e2e-helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
} from "./s2-helpers.js";

const PLAN = `# Milestone 1

## alpha
Create alpha.
`;

const PREASSESS = { id: "preassess", prompt: "preassess", alias: "pm" };
const POSTAUDIT = { id: "postaudit", prompt: "postaudit", alias: "pm" };
const DERIVE = { id: "derive" };

function writePmFlowPrompts(repoDir: string): void {
  fs.mkdirSync(path.join(repoDir, ".factory/prompts"), { recursive: true });
  fs.writeFileSync(
    path.join(repoDir, ".factory/prompts/preassess.md"),
    "Assess the run before the derive turn.\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(repoDir, ".factory/prompts/postaudit.md"),
    "Audit the tasks the derive turn wrote:\n{{existing_tasks}}\n",
    "utf8",
  );
}

/** A repo whose process config names the given PM steps, when any. */
async function pmFlowRuntime(steps?: unknown[]) {
  const { repo, goal } = setupFlowRepo({
    ...(steps ? { process: { pm: { steps } } } : {}),
  });
  writePmFlowPrompts(repo.dir);
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  fs.writeFileSync(path.join(runtime.store.goalDir, "plan.md"), PLAN, "utf8");
  return { repo, runtime, harness };
}

/** A repo whose initial stage runs the given PM steps. */
async function pmStageRuntime(steps: unknown[]) {
  const { repo, goal } = setupFlowRepo({
    process: {
      architecture: {
        flows: [
          { when: ["initial"], steps: [{ id: "architect" }, { id: "pm" }] },
        ],
      },
      pm: { steps },
    },
  });
  writePmFlowPrompts(repo.dir);
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  fs.writeFileSync(path.join(runtime.store.goalDir, "plan.md"), PLAN, "utf8");
  return { repo, runtime, harness };
}

function scriptArchitect(runtime: KernelRuntime, harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      fs.appendFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "\n## architect edit\n",
        "utf8",
      );
      ctx.writeOutcome(outcome({ summary: "planned", decision: "continue" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "architect" }) },
  );
}

function ranSteps(harness: FakeHarness): (string | undefined)[] {
  return harness.calls.map((call) => fakeTurnIdentity(call).step);
}

function scriptPmFlowSteps(runtime: KernelRuntime, harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      expect(fs.existsSync(path.join(runtime.store.tasksDir, "alpha.md"))).toBe(
        false,
      );
      ctx.writeOutcome(outcome({ summary: "assessed the run" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "preassess" }) },
  );
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(
        path.join(runtime.store.tasksDir, "alpha.md"),
        simpleTask("alpha", "alpha.txt"),
        "utf8",
      );
      ctx.writeOutcome(outcome({ summary: "derived alpha" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
  harness.script(
    (req, ctx) => {
      expect(req.prompt).toContain("- alpha | new |");
      ctx.writeOutcome(outcome({ summary: "audited the tasks" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "postaudit" }) },
  );
}

function boundaryPmSteps(harness: FakeHarness): (string | undefined)[] {
  return workCalls(harness).map((call) => fakeTurnIdentity(call).step);
}

function runsConfiguredPmFlow(): void {
  it("runs a config-only step before and after the derive turn", async () => {
    const { repo, runtime, harness } = await pmFlowRuntime([
      PREASSESS,
      DERIVE,
      POSTAUDIT,
    ]);
    try {
      scriptPmFlowSteps(runtime, harness);

      const result = await runPmFlow(runtime, {
        iteration: 1,
        state: derive([], []),
        cwd: runtime.paths.goalCheckout,
      });

      expect(result.status).toBe("done");
      expect(ranSteps(harness)).toEqual(["preassess", "pm", "postaudit"]);
      const records = await runtime.store.listRecords();
      expect(
        records.find((record) => record.step === "postaudit")?.outcome?.summary,
      ).toBe("audited the tasks");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);
}

function runsPmDeriveAlone(): void {
  it("runs the derive turn alone when the config names no PM flow", async () => {
    const { repo, runtime, harness } = await pmFlowRuntime();
    try {
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(outcome());
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "pm" }) },
      );

      const result = await runPmFlow(runtime, {
        iteration: 1,
        state: derive([], []),
        cwd: runtime.paths.goalCheckout,
      });

      expect(result.status).toBe("done");
      expect(ranSteps(harness)).toEqual(["pm"]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);
}

function blocksAtInfraPmStep(): void {
  it("blocks the stage at a config-only step that dies on infrastructure", async () => {
    const { repo, runtime, harness } = await pmFlowRuntime([PREASSESS, DERIVE]);
    try {
      harness.script(
        (req) =>
          fakeTurnResult(req, { stop: { kind: "infra", cause: "quota" } }),
        { when: whenTurn({ step: "preassess" }) },
      );

      const result = await runPmFlow(runtime, {
        iteration: 1,
        state: derive([], []),
        cwd: runtime.paths.goalCheckout,
      });

      expect(result).toEqual({
        status: "step-infra",
        step: "preassess",
        stop: { kind: "infra", cause: "quota" },
      });
      expect(ranSteps(harness)).toEqual(["preassess"]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);
}

function runsPmStepsInsideStage(): void {
  it("runs the configured PM steps inside a stage boundary", async () => {
    const { repo, runtime, harness } = await pmStageRuntime([
      PREASSESS,
      DERIVE,
      POSTAUDIT,
    ]);
    try {
      scriptPmFlowSteps(runtime, harness);
      scriptArchitect(runtime, harness);

      const result = await runBoundary(runtime, {
        relaunch: false,
        launchReason: "initial",
      });

      expect(result.decision).toBe("continue");
      expect(boundaryPmSteps(harness)).toEqual([
        "architect",
        "preassess",
        "pm",
        "postaudit",
      ]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);
}

function blocksBoundaryAtInfraPmStep(): void {
  it("blocks the boundary at a config-only step that dies on infrastructure", async () => {
    const { repo, runtime, harness } = await pmStageRuntime([
      PREASSESS,
      DERIVE,
    ]);
    try {
      harness.script(
        (req) =>
          fakeTurnResult(req, {
            stop: {
              kind: "infra",
              cause: "quota",
              details: "pool exhausted",
            },
          }),
        { when: whenTurn({ step: "preassess" }) },
      );
      scriptArchitect(runtime, harness);

      const result = await runBoundary(runtime, {
        relaunch: false,
        launchReason: "initial",
      });

      expect(result.decision).toBe("blocked");
      expect(result.cause).toBe(
        'PM step "preassess" stopped on infrastructure: quota: pool exhausted',
      );
      expect(result.stop).toEqual({
        cause: "quota",
        details: "pool exhausted",
      });
      expect(boundaryPmSteps(harness)).toEqual(["architect", "preassess"]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);
}

function refusesPmFlowShape(): void {
  it("refuses a PM flow without exactly one derive step", () => {
    const audit = { id: "audit", prompt: "preassess", alias: "pm" };
    expect(pmSchema.safeParse({ steps: [audit] }).success).toBe(false);
    expect(pmSchema.safeParse({ steps: [DERIVE, DERIVE] }).success).toBe(false);
    expect(
      pmSchema.safeParse({
        steps: [{ id: "derive", prompt: "preassess", alias: "pm" }],
      }).success,
    ).toBe(false);
    expect(pmSchema.safeParse({ steps: [DERIVE, audit] }).success).toBe(true);
  });
}

describe("configured PM flow", () => {
  runsConfiguredPmFlow();

  runsPmStepsInsideStage();

  blocksBoundaryAtInfraPmStep();

  runsPmDeriveAlone();

  blocksAtInfraPmStep();

  refusesPmFlowShape();
});
