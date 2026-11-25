import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import {
  runBoundary,
  type BoundaryOptions,
} from "../../src/kernel/boundary.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask as writeRuntimeTask,
} from "./s2-helpers.js";

const PLAN = `# Milestone 1

## later
Nothing to dispatch yet; the plan is the architect's.
`;

function writeArchitectFlowPrompts(repoDir: string): void {
  fs.mkdirSync(path.join(repoDir, ".factory/prompts"), { recursive: true });
  fs.writeFileSync(
    path.join(repoDir, ".factory/prompts/assess.md"),
    "Assess the previous run.\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(repoDir, ".factory/prompts/secondreview.md"),
    "Review the plan once more.\n",
    "utf8",
  );
}

function scriptConfiguredArchitectFlow(
  harness: FakeHarness,
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
): void {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "assessed the previous run" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "assess" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "second review done" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "secondreview" }) },
  );
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
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
}

interface ConfiguredFlowOptions {
  flows?: unknown[];
  launchReason?: BoundaryOptions["launchReason"];
}

async function runsConfiguredArchitectFlow(opts: ConfiguredFlowOptions = {}) {
  const { repo, goal } = setupFlowRepo({
    process: {
      architecture: {
        flows: opts.flows ?? [
          {
            when: ["initial"],
            steps: [
              { id: "assess", prompt: "assess", alias: "architect" },
              { id: "architect" },
              {
                id: "secondreview",
                prompt: "secondreview",
                alias: "plan-reviewer",
              },
              { id: "planreview" },
              { id: "pm" },
            ],
          },
        ],
      },
    },
  });
  writeArchitectFlowPrompts(repo.dir);
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeRuntimeTask(runtime, task("alpha"));
  fs.writeFileSync(path.join(runtime.store.goalDir, "plan.md"), PLAN, "utf8");
  scriptConfiguredArchitectFlow(harness, runtime);
  const boundary = await runBoundary(runtime, {
    relaunch: false,
    ...(opts.launchReason ? { launchReason: opts.launchReason } : {}),
  });
  return { repo, harness, boundary };
}

function ranSteps(harness: FakeHarness): (string | undefined)[] {
  return harness.calls.map((call) => fakeTurnIdentity(call).step);
}

function configOnlyFlowTest(): void {
  it("runs a config-only assessment before the architect and a second reviewer after it", async () => {
    const scope = await runsConfiguredArchitectFlow();
    try {
      expect(scope.boundary.decision).toBe("continue");
      const steps = ranSteps(scope.harness);
      expect(steps.indexOf("assess")).toBeGreaterThanOrEqual(0);
      expect(steps.indexOf("assess")).toBeLessThan(steps.indexOf("architect"));
      expect(steps.indexOf("secondreview")).toBeGreaterThan(
        steps.indexOf("architect"),
      );
      expect(steps.indexOf("secondreview")).toBeLessThan(steps.indexOf("pm"));
    } finally {
      cleanupFlowRepo(scope.repo);
    }
  }, 90_000);
}

function launchReasonFlowTest(): void {
  it("selects the flow its launch reason names", async () => {
    const scope = await runsConfiguredArchitectFlow({
      launchReason: "relaunch",
      flows: [
        {
          when: ["initial"],
          steps: [{ id: "architect" }, { id: "planreview" }, { id: "pm" }],
        },
        {
          when: ["relaunch"],
          steps: [
            { id: "assess", prompt: "assess", alias: "architect" },
            { id: "architect" },
            { id: "planreview" },
            { id: "pm" },
          ],
        },
      ],
    });
    try {
      expect(ranSteps(scope.harness)).toContain("assess");
    } finally {
      cleanupFlowRepo(scope.repo);
    }
  }, 90_000);
}

function initialFlowFallbackTest(): void {
  it("falls back to the initial flow when no flow names the launch reason", async () => {
    const scope = await runsConfiguredArchitectFlow({
      launchReason: "concerns",
      flows: [
        {
          when: ["initial"],
          steps: [
            { id: "assess", prompt: "assess", alias: "architect" },
            { id: "architect" },
            { id: "planreview" },
            { id: "pm" },
          ],
        },
        {
          when: ["relaunch"],
          steps: [
            {
              id: "secondreview",
              prompt: "secondreview",
              alias: "plan-reviewer",
            },
            { id: "architect" },
            { id: "planreview" },
            { id: "pm" },
          ],
        },
      ],
    });
    try {
      const steps = ranSteps(scope.harness);
      expect(steps).toContain("assess");
      expect(steps).not.toContain("secondreview");
    } finally {
      cleanupFlowRepo(scope.repo);
    }
  }, 90_000);
}

describe("configured architect flow", () => {
  configOnlyFlowTest();

  launchReasonFlowTest();

  initialFlowFallbackTest();
});
