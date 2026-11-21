import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Repo } from "../../src/core/git/repo.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runAgentTurn } from "../../src/kernel/agent.js";
import { boundaryTarget, resolveTurn } from "../../src/kernel/flow-context.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type {
  KernelRuntime,
  ProcessConfig,
  RepoConfig,
  RunConfig,
} from "../../src/kernel/types.js";
import { TEST_ARCHITECTURE, TEST_BOUNDARY } from "./helpers.js";

function runtimeFor(fake: FakeHarness, root: string): KernelRuntime {
  const scope1 = runtimeForPart1();
  return runtimeForPart2(root, fake, scope1);
}

const vars = {
  turn: "boundary",
  iteration: "1",
  intent_path: "/g/intent.md",
  plan_path: "/g/plan.md",
  checkout: "/wt",
  pack_path: "/g/pack.md",
  digest_path: "",
  steers: "none",
};

const implementerVars = {
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

async function setupLocal() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-repair-"));
  const fake = new FakeHarness({ id: "fake" });
  const runtime = runtimeFor(fake, root);
  await runtime.store.ensureLayout();
  return { root, fake, runtime };
}

function invalidYaml(line: string): string {
  return `status: [unclosed ${line}\nsummary: x\n`;
}

async function setupLocal2() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-launch-"));
  const fake = new FakeHarness({ id: "fake" });
  const runtime = runtimeFor(fake, root);
  await runtime.store.ensureLayout();
  return { root, fake, runtime };
}

function runtimeForPart1() {
  const process: ProcessConfig = {
    taskTypes: {},
    flows: {},
    boundary: TEST_BOUNDARY,
    architecture: TEST_ARCHITECTURE,
    reminders: 1,
  };
  const repo: RepoConfig = {
    baseBranch: "main",
    artifactRoot: ".factory/artifacts",
    setup: [],
    gates: [],
  };
  const run: RunConfig = {
    aliases: {
      architect: { harness: "fake", model: "fake-architect" },
      pm: { harness: "fake", model: "fake-pm" },
      implementer: { harness: "fake", model: "fake-implementer" },
      reviewer: { harness: "fake", model: "fake-reviewer" },
      steward: { harness: "fake", model: "fake-steward" },
      "plan-checker": { harness: "fake", model: "fake-check" },
      intent: { harness: "fake", model: "fake-intent" },
      "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
      "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
      front: { harness: "fake", model: "fake-front" },
    },
    limits: {
      concurrency: { overall: 1, perSubscription: {}, perModel: {} },
      iterations: 1,
      planCheckRounds: 2,
    },
    sessions: { dir: "", keepRuns: 1, retention: "short" },
  };

  return { process, repo, run };
}

function runtimeForPart2(
  root: string,
  fake: FakeHarness,
  scope: ReturnType<typeof runtimeForPart1>,
): KernelRuntime {
  const { repo, process, run } = scope;
  return {
    paths: {
      repoRoot: root,
      goalDir: path.join(root, "goal"),
      goalCheckout: root,
      integrationBranch: "factory/g",
      worktreeRoot: root,
      sessionsDir: path.join(root, "sessions"),
      artifacts: { backend: "folder", root },
    },
    configs: { repo, process, run },
    repo: new Repo({ mainRoot: root, worktreeRoot: root }),
    store: createFolderStore(path.join(root, "goal"), undefined, {}),
    harnesses: new Map([["fake", fake]]),
    prompts: loadPrompts(process, root, {}),
    limits: {
      flows: {},
      iterations: 1,
      concurrency: { overall: 1, perSubscription: {}, perModel: {} },
      planCheckRounds: 2,
    },
    exhaustedPools: new Map(),
    // Hermetic prices: the test-local cache, never the network.
    priceSource: {
      cachePath: path.join(root, "price-cache.json"),
      fetchModels: async () => {
        throw new Error("price fetch disabled in tests");
      },
    },
  };
}

function registerBoundedRepairsPart7(): void {
  it("carries each repair latest YAML finding verbatim with line and column", async () => {
    const { root, fake, runtime } = await setupLocal();
    try {
      const firstBad = invalidYaml("one");
      const secondBad = `status: done\nsummary: [bad\n: oops\n`;
      fake.script((req) => {
        fs.writeFileSync(req.outcomePath!, firstBad, "utf8");
        return fakeTurnResult(req);
      });
      fake.script((req) => {
        fs.writeFileSync(req.outcomePath!, secondBad, "utf8");
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "recovered" });
        return fakeTurnResult(req);
      });

      const result = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "implementer", "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
        repairTurns: 2,
      });

      expect(fake.calls).toHaveLength(3);
      expect(result.outcome?.summary).toBe("recovered");
      const firstAsk = fake.calls[1]!.prompt;
      const secondAsk = fake.calls[2]!.prompt;
      expect(firstAsk).toContain("not valid YAML");
      expect(firstAsk).toMatch(/line \d+, column \d+/);
      expect(secondAsk).toContain("not valid YAML");
      expect(secondAsk).toMatch(/line \d+, column \d+/);
      expect(secondAsk).not.toContain(firstBad.trim());
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerBoundedRepairsPart8(): void {
  it("lets a task repairTurns override shrink the loop", async () => {
    const { root, fake, runtime } = await setupLocal();
    try {
      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      const zero = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "implementer", "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
        repairTurns: 0,
      });
      expect(fake.calls).toHaveLength(1);
      expect(zero.outcome?.status).toBe("failed");

      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      const one = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "implementer", "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "b", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
        repairTurns: 1,
      });
      expect(fake.calls).toHaveLength(3);
      expect(one.outcome?.status).toBe("failed");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerBoundedRepairsPart9(): void {
  it("spends no repair on refusal or cancelled stops", async () => {
    const { root, fake, runtime } = await setupLocal();
    try {
      fake.script((req) =>
        fakeTurnResult(req, { stop: { kind: "refusal", details: "no" } }),
      );
      const refused = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "implementer", "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });
      expect(fake.calls).toHaveLength(1);
      expect(refused.outcome).toBeUndefined();

      fake.script((req) =>
        fakeTurnResult(req, { stop: { kind: "cancelled" } }),
      );
      const cancelled = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "implementer", "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 2 },
        vars: implementerVars,
        expectation: "any",
      });
      expect(fake.calls).toHaveLength(2);
      expect(cancelled.outcome).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerBoundedRepairsPart10(): void {
  it("ends the loop when a repair is interrupted without an outcome", async () => {
    const { root, fake, runtime } = await setupLocal();
    try {
      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      fake.script((req) =>
        fakeTurnResult(req, { stop: { kind: "infra", cause: "quota" } }),
      );

      const result = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "implementer", "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });

      expect(fake.calls).toHaveLength(2);
      expect(result.outcome).toBeUndefined();
      expect(result.record.stop).toEqual({ kind: "infra", cause: "quota" });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerBoundedRepairsPart11(): void {
  it("checks the architect plan finding on every repair round", async () => {
    const { root, fake, runtime } = await setupLocal();
    try {
      const planPath = path.join(runtime.store.goalDir, "plan.md");
      fs.writeFileSync(planPath, "# Plan\n", "utf8");
      fake.script((req, ctx) => {
        ctx.writeOutcome({
          status: "done",
          summary: "go",
          decision: "continue",
        });
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        ctx.writeOutcome({
          status: "done",
          summary: "still going",
          decision: "continue",
        });
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        fs.writeFileSync(planPath, "# Plan\n\n## alpha\n", "utf8");
        ctx.writeOutcome({
          status: "done",
          summary: "fixed",
          decision: "continue",
        });
        return fakeTurnResult(req);
      });

      const result = await runAgentTurn(runtime, {
        target: boundaryTarget(runtime, "architect"),
        cwd: root,
        meta: { iteration: 1, step: "architect", round: 1 },
        vars: { ...vars, plan_path: planPath },
        expectation: "architect",
        repairTurns: 2,
      });

      expect(fake.calls).toHaveLength(3);
      expect(result.outcome?.decision).toBe("continue");
      expect(fake.calls[1]!.prompt).toContain(
        "is unchanged since the turn started",
      );
      expect(fake.calls[2]!.prompt).toContain(
        "is unchanged since the turn started",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerRepairFindingsAndLaunchKindsPart1(): void {
  it("marks repair findings resolved when the repair delivers", async () => {
    const { root, fake, runtime } = await setupLocal2();
    try {
      fake.script((req) => {
        fs.writeFileSync(
          req.outcomePath!,
          "status: [unclosed\nsummary: x\n",
          "utf8",
        );
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "recovered" });
        return fakeTurnResult(req);
      });

      const result = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "implementer", "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });

      expect(fake.calls).toHaveLength(2);
      expect(result.outcome?.status).toBe("done");
      expect(result.record.repairFindings?.join("\n")).toContain(
        "not valid YAML",
      );
      expect(result.record.repairFindings?.join("\n")).toMatch(
        /line \d+, column \d+/,
      );
      // The reminder delivered: the finding stays for the incident count and
      // reads as resolved, so the launch did not fail.
      expect(result.record.repairFindingsResolved).toBe(true);
      expect(result.record.launchKind).toBeUndefined();
      const reread = await runtime.store.listRecords();
      const stored = reread.find((r) => r.seq === result.record.seq);
      expect(stored?.repairFindings).toEqual(result.record.repairFindings);
      expect(stored?.repairFindingsResolved).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerRepairFindingsAndLaunchKindsPart2(): void {
  it("marks infra stops as glitches", async () => {
    const { root, fake, runtime } = await setupLocal2();
    try {
      fake.script((req) =>
        fakeTurnResult(req, { stop: { kind: "infra", cause: "quota" } }),
      );

      const result = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "implementer", "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });

      expect(result.outcome).toBeUndefined();
      expect(result.record.launchKind).toBe("glitch");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

describe("bounded repairs", () => {
  registerBoundedRepairsPart7();

  registerBoundedRepairsPart8();

  registerBoundedRepairsPart9();

  registerBoundedRepairsPart10();

  registerBoundedRepairsPart11();
});

describe("repair findings and launch kinds", () => {
  registerRepairFindingsAndLaunchKindsPart1();

  registerRepairFindingsAndLaunchKindsPart2();
});
