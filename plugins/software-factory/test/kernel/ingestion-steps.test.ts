import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import {
  DEFAULT_INGESTION_STEPS,
  ingestionSchema,
  ingestionStepSchema,
} from "../../src/kernel/config/flow-schema.js";
import { contextPackRelPath } from "../../src/kernel/context-pack.js";
import { derive } from "../../src/kernel/derive.js";
import { CODE_MAP_FILE, contextCodeMap } from "../../src/kernel/ingestion.js";
import { runFront } from "../../src/kernel/front.js";
import type {
  KernelRuntime,
  State,
  StepRecord,
} from "../../src/kernel/types.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome as outcomeOf,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";
import { task } from "./helpers.js";

function extraYaml(): Record<string, unknown> {
  return {
    ingestion: [
      { id: "branch" },
      { id: "front" },
      {
        id: "requirements",
        prompt: "front",
        alias: "pm",
        deliverable: "requirements note",
      },
    ],
  };
}

function scoutYaml(): Record<string, unknown> {
  return {
    ingestion: [
      { id: "branch" },
      { id: "front" },
      {
        id: "scout",
        prompt: "scout",
        alias: "pm",
        deliverable: "code map",
        when: ["bigger"],
      },
    ],
  };
}

function trivialFront(
  goalDir: string,
  slug: string,
): (
  req: Parameters<FakeHarness["turn"]>[0],
  ctx: { writeOutcome(v: unknown): void },
) => Promise<ReturnType<typeof fakeTurnResult>> {
  return (req, ctx) => {
    const pack = path.join(goalDir, contextPackRelPath(1));
    fs.mkdirSync(path.dirname(pack), { recursive: true });
    fs.writeFileSync(pack, "# Front pack\n", "utf8");
    fs.writeFileSync(
      path.join(goalDir, "class.yaml"),
      `class: trivial\nslug: ${slug}\n`,
      "utf8",
    );
    ctx.writeOutcome(outcomeOf({ summary: "classified trivial" }));
    return Promise.resolve(fakeTurnResult(req));
  };
}

function biggerFront(
  goalDir: string,
): (
  req: Parameters<FakeHarness["turn"]>[0],
  ctx: { writeOutcome(v: unknown): void },
) => Promise<ReturnType<typeof fakeTurnResult>> {
  return (req, ctx) => {
    const pack = path.join(goalDir, contextPackRelPath(1));
    fs.mkdirSync(path.dirname(pack), { recursive: true });
    fs.writeFileSync(pack, "# Front pack\n", "utf8");
    fs.writeFileSync(
      path.join(goalDir, "class.yaml"),
      "class: bigger\n",
      "utf8",
    );
    ctx.writeOutcome(outcomeOf({ summary: "classified bigger" }));
    return Promise.resolve(fakeTurnResult(req));
  };
}

async function emptyState(runtime: KernelRuntime): Promise<State> {
  return derive([], [], runtime.configs.process.flows);
}

async function agentSteps(runtime: KernelRuntime): Promise<string[]> {
  const records = await runtime.store.listRecords();
  return records
    .filter((r: StepRecord) => r.actor === "agent")
    .sort((a, b) => a.seq - b.seq)
    .map((r) => r.step);
}

async function recordOf(
  runtime: KernelRuntime,
  step: string,
): Promise<StepRecord | undefined> {
  return (await runtime.store.listRecords()).find((r) => r.step === step);
}

describe("ingestion step schema", () => {
  it("rejects an unknown step without a prompt", () => {
    const result = ingestionStepSchema.safeParse({ id: "custom-step" });
    expect(result.success).toBe(false);
  });

  it("accepts an unknown step with a prompt and alias", () => {
    const result = ingestionStepSchema.safeParse({
      id: "requirements",
      prompt: "front",
      alias: "pm",
    });
    expect(result.success).toBe(true);
  });

  it("validates the when clause as one class or several", () => {
    expect(
      ingestionStepSchema.safeParse({
        id: "requirements",
        prompt: "front",
        when: "trivial",
      }).success,
    ).toBe(true);
    expect(
      ingestionStepSchema.safeParse({
        id: "requirements",
        prompt: "front",
        when: ["trivial", "bigger"],
      }).success,
    ).toBe(true);
  });

  it("rejects a prompt or gate on a built-in step", () => {
    expect(
      ingestionStepSchema.safeParse({ id: "front", prompt: "front" }).success,
    ).toBe(false);
    expect(
      ingestionStepSchema.safeParse({ id: "branch", when: "bigger" }).success,
    ).toBe(false);
  });

  it("rejects a when clause ahead of the classifier", () => {
    const gated = [
      { id: "branch" },
      { id: "requirements", prompt: "front", when: ["bigger"] },
      { id: "front" },
    ];
    expect(ingestionSchema.safeParse(gated).success).toBe(false);
    expect(
      ingestionSchema.safeParse([
        { id: "branch" },
        { id: "requirements", prompt: "front" },
        { id: "front" },
      ]).success,
    ).toBe(true);
  });

  it("ships branch then front as the kernel default", () => {
    expect(DEFAULT_INGESTION_STEPS).toEqual([
      { id: "branch" },
      { id: "front" },
    ]);
  });
});

function registersConfiguredStep(): void {
  it("runs a configured extra agent step after the classifier, in order", async () => {
    const { repo, goalDir, goal } = setupFlowRepo({
      process: extraYaml(),
      classYaml: null,
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(trivialFront(goalDir, "demo-task"), {
        when: whenTurn({ step: "front" }),
      });
      harness.script(
        (req, ctx) => {
          expect(req.prompt).toContain("You are the front");
          ctx.writeOutcome(outcomeOf({ summary: "requirements gathered" }));
          return Promise.resolve(fakeTurnResult(req));
        },
        { when: whenTurn({ step: "requirements" }) },
      );
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("demo-task", { flow: "just-implement", scope: ["demo-task.txt"] }),
      );
      const result = await runFront(runtime, {
        iteration: 1,
        state: await emptyState(runtime),
      });
      expect(result.action, result.cause ?? "").toBe("dispatch");
      expect(await agentSteps(runtime)).toEqual(["front", "requirements"]);
      const requirements = await recordOf(runtime, "requirements");
      expect(requirements?.outcome?.summary).toBe("requirements gathered");
      expect(requirements?.alias).toBe("pm");
    } finally {
      cleanupFlowRepo(repo);
    }
  });
}

function registersBranchStep(): void {
  it("records the goal branch before the classifier turn", async () => {
    const { repo, goalDir, goal } = setupFlowRepo({
      process: extraYaml(),
      classYaml: null,
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(trivialFront(goalDir, "demo-task"), {
        when: whenTurn({ step: "front" }),
      });
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(outcomeOf({ summary: "requirements gathered" }));
          return Promise.resolve(fakeTurnResult(req));
        },
        { when: whenTurn({ step: "requirements" }) },
      );
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("demo-task", { flow: "just-implement", scope: ["demo-task.txt"] }),
      );
      await runFront(runtime, {
        iteration: 1,
        state: await emptyState(runtime),
      });
      const records = await runtime.store.listRecords();
      const branches = records.filter((r) => r.step === "branch");
      const front = records.find((r) => r.step === "front");
      expect(branches).toHaveLength(1);
      expect(branches[0]?.ok).toBe(true);
      expect(front?.seq).toBeGreaterThan(branches[0]!.seq);
    } finally {
      cleanupFlowRepo(repo);
    }
  });
}

function registersBiggerScout(): void {
  it("a bigger goal's scout writes the code map instead of a file listing", async () => {
    const { repo, goalDir, goal } = setupFlowRepo({
      process: scoutYaml(),
      classYaml: null,
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(biggerFront(goalDir), {
        when: whenTurn({ step: "front" }),
      });
      harness.script(
        (req, ctx) => {
          expect(req.prompt).toContain("You are the scout");
          const goalDir = path.resolve(path.dirname(req.outcomePath!), "../..");
          fs.writeFileSync(
            path.join(goalDir, CODE_MAP_FILE),
            "- src/kernel/ — 8 files\n- test/kernel/ — 6 files\n",
            "utf8",
          );
          ctx.writeOutcome(outcomeOf({ summary: "code map written" }));
          return Promise.resolve(fakeTurnResult(req));
        },
        { when: whenTurn({ step: "scout" }) },
      );
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const result = await runFront(runtime, {
        iteration: 1,
        state: await emptyState(runtime),
      });
      expect(result.action, result.cause ?? "").toBe("boundary");
      expect(await contextCodeMap(runtime)).toEqual([
        "src/kernel/ — 8 files",
        "test/kernel/ — 6 files",
      ]);
      expect(await agentSteps(runtime)).toEqual(["front", "scout"]);
    } finally {
      cleanupFlowRepo(repo);
    }
  });
}

function registersSmallerGoal(): void {
  it("a smaller goal skips the scout step", async () => {
    const { repo, goalDir, goal } = setupFlowRepo({
      process: scoutYaml(),
      classYaml: null,
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(trivialFront(goalDir, "demo-task"), {
        when: whenTurn({ step: "front" }),
      });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("demo-task", { flow: "just-implement", scope: ["demo-task.txt"] }),
      );
      const result = await runFront(runtime, {
        iteration: 1,
        state: await emptyState(runtime),
      });
      expect(result.action, result.cause ?? "").toBe("dispatch");
      expect(await agentSteps(runtime)).toEqual(["front"]);
      expect(await recordOf(runtime, "scout")).toBeUndefined();
    } finally {
      cleanupFlowRepo(repo);
    }
  });
}

function registersMissingCodeMap(): void {
  it("a scout that writes no code map stops the launch as infra", async () => {
    const { repo, goalDir, goal } = setupFlowRepo({
      process: scoutYaml(),
      classYaml: null,
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(biggerFront(goalDir), {
        when: whenTurn({ step: "front" }),
      });
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(outcomeOf({ summary: "mapped nothing" }));
          return Promise.resolve(fakeTurnResult(req));
        },
        { when: whenTurn({ step: "scout" }) },
      );
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const result = await runFront(runtime, {
        iteration: 1,
        state: await emptyState(runtime),
      });
      expect(result.action).toBe("infra");
      expect(result.step).toBe("scout");
      expect(result.cause).toContain("wrote no code map");
    } finally {
      cleanupFlowRepo(repo);
    }
  });
}

function registersRemovedScout(): void {
  it("removing the scout step removes its turn and falls back to the index", async () => {
    const process = {
      ingestion: [{ id: "branch" }, { id: "front" }],
    };
    const { repo, goalDir, goal } = setupFlowRepo({ process, classYaml: null });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(biggerFront(goalDir), {
        when: whenTurn({ step: "front" }),
      });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const result = await runFront(runtime, {
        iteration: 1,
        state: await emptyState(runtime),
      });
      expect(result.action, result.cause ?? "").toBe("boundary");
      expect(await agentSteps(runtime)).toEqual(["front"]);
      expect(await recordOf(runtime, "scout")).toBeUndefined();
      const map = await contextCodeMap(runtime);
      expect(map).toContain("(root) — 1 file");
      expect(map.join("\n")).not.toContain("fixture");
    } finally {
      cleanupFlowRepo(repo);
    }
  });
}

function registersBlockedScout(): void {
  it("stops a blocked scout as blocked, not infra", async () => {
    const { repo, goalDir, goal } = setupFlowRepo({
      process: scoutYaml(),
      classYaml: null,
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(biggerFront(goalDir), {
        when: whenTurn({ step: "front" }),
      });
      harness.script(
        (req, ctx) => {
          ctx.writeOutcome(
            outcomeOf({
              status: "blocked",
              summary: "the checkout is unreadable",
            }),
          );
          return Promise.resolve(fakeTurnResult(req));
        },
        { when: whenTurn({ step: "scout" }) },
      );
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const result = await runFront(runtime, {
        iteration: 1,
        state: await emptyState(runtime),
      });
      expect(result.action).toBe("blocked");
      expect(result.step).toBe("scout");
      expect(result.cause).toContain("the checkout is unreadable");
    } finally {
      cleanupFlowRepo(repo);
    }
  });
}

function registersShippedDefaults(): void {
  it("the shipped defaults classify without an extra turn", async () => {
    const { repo, goalDir, goal } = setupFlowRepo({ classYaml: null });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(trivialFront(goalDir, "demo-task"), {
        when: whenTurn({ step: "front" }),
      });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(
        runtime,
        task("demo-task", { flow: "just-implement", scope: ["demo-task.txt"] }),
      );
      const result = await runFront(runtime, {
        iteration: 1,
        state: await emptyState(runtime),
      });
      expect(result.action, result.cause ?? "").toBe("dispatch");
      expect(await agentSteps(runtime)).toEqual(["front"]);
    } finally {
      cleanupFlowRepo(repo);
    }
  });
}

describe("configured ingestion", () => {
  registersConfiguredStep();
  registersBranchStep();
  registersBiggerScout();
  registersSmallerGoal();
  registersMissingCodeMap();
  registersRemovedScout();
  registersShippedDefaults();
  registersBlockedScout();
});
