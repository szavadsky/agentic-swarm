import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runAgentTurn } from "../../src/kernel/agent.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { resolveTurn } from "../../src/kernel/flow-context.js";
import { runGates } from "../../src/kernel/gates.js";
import { nonModelFindings } from "../../src/kernel/preflight.js";
import { semaphoresFor } from "../../src/kernel/semaphores.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

const SHARED = "shared";

/** Shell single-quotes a path, so a temp dir with a quote cannot break a gate. */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** The one implement turn a fact-find task runs, with the step's semaphore. */
function oneStepFlow(
  stepSemaphores: readonly string[],
): Record<string, unknown> {
  return {
    flows: {
      "fact-find": {
        steps: [
          {
            id: "implement",
            prompt: "implementer",
            alias: "researcher",
            semaphores: [...stepSemaphores],
            unfinishedPrompt: "unfinished-turn",
          },
        ],
      },
    },
  };
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 5_000,
): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("waitFor timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const IMPLEMENTER_VARS = {
  task_path: "/g/tasks/a.md",
  report_path: "",
  front_pack: "",
  worktree: "/wt/a",
  resume_note: "",
  setup_command: "none",
  gate_commands: "none",
  base_gates: "not recorded",
  findings: "",
};

function registerOneNamePerTurn(): void {
  it("gives a turn one count when its step, subscription and harness name one semaphore", async () => {
    const { repo, goal } = setupFlowRepo({
      semaphores: [{ name: SHARED, max: 1 }],
      harnessSemaphores: { fake: SHARED },
      subscriptions: { researcher: SHARED },
      process: oneStepFlow([SHARED]),
      gates: [],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const held: number[] = [];
      harness.script(
        (req, ctx) => {
          held.push(semaphoresFor(runtime.configs).held(SHARED));
          ctx.writeOutcome(outcome({ summary: "fact found" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "implement" }) },
      );
      await writeTask(runtime, task("probe", { type: "fact-finder" }));

      await runDispatch(runtime, { iteration: 1 });

      // The step, the subscription and the harness all name `shared`; the
      // turn takes one count, not three, or max 1 would have blocked it.
      expect(held).toEqual([1]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerDistinctSourcesPerTurn(): void {
  it("holds one count for each distinct overall, step, subscription and harness semaphore during a turn", async () => {
    const names = [
      "overall-sem",
      "step-sem",
      "sub-sem",
      "harness-sem",
    ] as const;
    const { repo, goal } = setupFlowRepo({
      semaphores: names.map((name) => ({ name, max: 1 })),
      limits: { overallSemaphore: "overall-sem" },
      harnessSemaphores: { fake: "harness-sem" },
      subscriptions: { researcher: "sub-sem" },
      process: oneStepFlow(["step-sem"]),
      gates: [],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const semaphores = semaphoresFor(runtime.configs);
      const heldDuringTurn: Record<string, number>[] = [];
      harness.script(
        (req, ctx) => {
          heldDuringTurn.push(
            Object.fromEntries(
              names.map((name) => [name, semaphores.held(name)]),
            ),
          );
          ctx.writeOutcome(outcome({ summary: "fact found" }));
          return fakeTurnResult(req);
        },
        { when: whenTurn({ step: "implement" }) },
      );
      await writeTask(runtime, task("probe", { type: "fact-finder" }));

      await runDispatch(runtime, { iteration: 1 });

      expect(heldDuringTurn).toEqual([
        {
          "overall-sem": 1,
          "step-sem": 1,
          "sub-sem": 1,
          "harness-sem": 1,
        },
      ]);
      for (const name of names) {
        expect(semaphores.held(name)).toBe(0);
      }
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerGateTurnOverlap(): void {
  it("never overlaps a tests gate and a live turn sharing one semaphore", async () => {
    const shared = fs.mkdtempSync(path.join(os.tmpdir(), "semaphore-gate-"));
    const log = path.join(shared, "order.log");
    const command = [
      `printf 'gate-start\\n' >> ${shellQuote(log)}`,
      `printf 'gate-end\\n' >> ${shellQuote(log)}`,
    ].join("; ");
    const { repo, goal } = setupFlowRepo({
      repoSemaphores: [{ name: SHARED, max: 1 }],
      harnessSemaphores: { fake: SHARED },
      gates: [{ id: "tests", command, semaphores: [SHARED] }],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const held: number[] = [];
      harness.script(async (req, ctx) => {
        held.push(semaphoresFor(runtime.configs).held(SHARED));
        fs.appendFileSync(log, "turn-start\n");
        await new Promise((resolve) => setTimeout(resolve, 250));
        ctx.writeOutcome(outcome({ summary: "live turn done" }));
        fs.appendFileSync(log, "turn-end\n");
        return fakeTurnResult(req);
      });

      const turn = runAgentTurn(runtime, {
        target: resolveTurn(runtime, "implementer", "implementer"),
        cwd: repo.dir,
        meta: { iteration: 1, slug: "live", step: "implement", round: 1 },
        vars: IMPLEMENTER_VARS,
        expectation: "any",
        semaphores: [SHARED],
      });
      await waitFor(
        () =>
          fs.existsSync(log) &&
          fs.readFileSync(log, "utf8").includes("turn-start"),
      );

      const checks = await runGates(runtime, repo.dir);
      await turn;

      expect(checks.map((check) => check.ok)).toEqual([true]);
      expect(held).toEqual([1]);
      // The gate declares the same semaphore, so it waits out the live turn
      // rather than running beside it.
      expect(fs.readFileSync(log, "utf8").trim().split("\n")).toEqual([
        "turn-start",
        "turn-end",
        "gate-start",
        "gate-end",
      ]);
    } finally {
      cleanupFlowRepo(repo);
      fs.rmSync(shared, { recursive: true, force: true });
    }
  }, 60_000);
}

function registerFallbackTier(): void {
  it("runs a free fallback tier when the primary tier's semaphore is taken", async () => {
    const { repo, goal } = setupFlowRepo({
      semaphores: [
        { name: "primary", max: 1 },
        { name: "secondary", max: 1 },
      ],
      harnessSemaphores: { fake: "primary", "fake-b": "secondary" },
      process: oneStepFlow([]),
      aliases: {
        researcher: {
          harness: "fake",
          model: "fake-research",
          fallbacks: [{ harness: "fake-b", model: "fake-research-b" }],
        },
      },
      gates: [],
    });
    try {
      const primary = new FakeHarness({ id: "fake" });
      const fallback = new FakeHarness({ id: "fake-b" });
      const runtime = await makeRuntime(repo, goal, {
        fake: primary,
        "fake-b": fallback,
      });
      const semaphores = semaphoresFor(runtime.configs);
      const holdPrimary = semaphores.tryAcquire(["primary"]);
      expect(holdPrimary).toBeDefined();
      try {
        fallback.script((req, ctx) => {
          ctx.writeOutcome(outcome({ summary: "fallback served" }));
          return fakeTurnResult(req);
        });
        await writeTask(runtime, task("probe", { type: "fact-finder" }));

        await runDispatch(runtime, { iteration: 1 });

        expect(primary.calls).toHaveLength(0);
        expect(fallback.calls).toHaveLength(1);
        expect(semaphores.held("secondary")).toBe(0);
      } finally {
        holdPrimary?.();
      }
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerDeclarationFindings(): void {
  it("reports an undeclared reference and a cross-layer max conflict", async () => {
    const { repo, goal } = setupFlowRepo({
      repoSemaphores: [{ name: "tests", max: 1 }],
      semaphores: [{ name: "tests", max: 2 }],
      gates: [{ id: "unit", command: "true", semaphores: ["missing"] }],
    });
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const files = runtime.configs.files;
      if (files === undefined)
        throw new Error("loadConfigs must carry its files");
      const findings = (
        await nonModelFindings({
          configs: runtime.configs,
          files,
        })
      ).findings;

      expect(
        findings.some(
          (finding) =>
            finding.key === "semaphores.tests" &&
            finding.message.includes("conflicts with max 1"),
        ),
      ).toBe(true);
      expect(
        findings.some(
          (finding) =>
            finding.key === "gates.unit.semaphores" &&
            finding.message.includes('no semaphore named "missing"'),
        ),
      ).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("named semaphore dispatch", () => {
  registerOneNamePerTurn();
  registerDistinctSourcesPerTurn();
  registerGateTurnOverlap();
  registerFallbackTier();
  registerDeclarationFindings();
});
