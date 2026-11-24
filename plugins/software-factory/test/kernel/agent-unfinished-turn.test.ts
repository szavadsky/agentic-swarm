import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Repo } from "../../src/core/git/repo.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runAgentTurn } from "../../src/kernel/agent.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { resolveTurn } from "../../src/kernel/flow-context.js";
import { outcomeRepairSchemaVar } from "../../src/kernel/prompt-schema.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type {
  KernelRuntime,
  ProcessConfig,
  RepoConfig,
  RunConfig,
} from "../../src/kernel/types.js";
import { implementerTurn } from "./e2e-helpers.js";
import { task, TEST_ARCHITECTURE, TEST_BOUNDARY } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

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

const reviewTurnVars = {
  task_path: "/g/tasks/a.md",
  worktree: "/wt/a",
  base_hash: "aaa",
  head_hash: "bbb",
  round: "1",
  max_rounds: "2",
  base_gates: "not recorded",
  prior_findings: "",
  upscope_ask: "",
  last_call: "false",
};

function runtimeFor(fake: FakeHarness, root: string): KernelRuntime {
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
      implementer: { harness: "fake", model: "fake-implementer" },
      reviewer: { harness: "fake", model: "fake-reviewer" },
    },
    limits: {
      concurrency: { overall: 1, perSubscription: {}, perModel: {} },
      iterations: 1,
      planCheckRounds: 2,
    },
    sessions: { dir: "", keepRuns: 1, retention: "short" },
  };
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
    priceSource: {
      cachePath: path.join(root, "price-cache.json"),
      fetchModels: async () => {
        throw new Error("price fetch disabled in tests");
      },
    },
  };
}

async function setupDirect() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-unfinished-"));
  const fake = new FakeHarness({ id: "fake" });
  const runtime = runtimeFor(fake, root);
  await runtime.store.ensureLayout();
  return { root, fake, runtime };
}

function turn(
  runtime: KernelRuntime,
  root: string,
  extra: {
    unfinishedPrompt?: string;
  } = {},
) {
  return runAgentTurn(runtime, {
    target: {
      ...resolveTurn(runtime, "implementer", "implementer"),
      ...extra,
    },
    cwd: root,
    meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
    vars: implementerVars,
    expectation: "any",
  });
}

function asksNoOutcomeNoEditToFinish(): void {
  it("asks a no-outcome, no-edit turn to finish the task, in the same session", async () => {
    const { root, fake, runtime } = await setupDirect();
    try {
      fake.script((req) => fakeTurnResult(req, { text: "planned only" }));
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "finished" });
        return fakeTurnResult(req);
      });

      const result = await turn(runtime, root, {
        unfinishedPrompt: "unfinished-turn",
      });

      expect(fake.calls).toHaveLength(2);
      expect(result.record.asks).toEqual(["unfinished"]);
      const ask = fake.calls[1]!.prompt;
      expect(ask).toContain(
        "Your turn settled no outcome and did not finish the task.",
      );
      expect(ask).toContain(implementerVars.task_path);
      expect(ask).toContain(implementerVars.worktree);
      expect(ask).toContain("Read that task file now");
      expect(ask).not.toContain("Correct only the outcome");
      // One session: the finish ask resumes the turn that explored.
      expect(fake.calls[1]!.session).toBeDefined();
      expect(fake.knownSessions().size).toBe(1);
      expect(result.outcome?.summary).toBe("finished");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function asksAfterPartialEdits(): void {
  it("asks the same finish ask after partial edits, not by the diff", async () => {
    const { root, fake, runtime } = await setupDirect();
    try {
      fake.script((req) => {
        fs.writeFileSync(path.join(req.cwd!, "partial.txt"), "x\n", "utf8");
        return fakeTurnResult(req, { text: "started the edit" });
      });
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "finished" });
        return fakeTurnResult(req);
      });

      const result = await turn(runtime, root, {
        unfinishedPrompt: "unfinished-turn",
      });

      expect(result.record.asks).toEqual(["unfinished"]);
      expect(fake.calls[1]!.prompt).toContain("did not finish the task");
      expect(result.outcome?.status).toBe("done");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function keepsOutcomeAskForMalformedOutcome(): void {
  it("keeps the outcome-only ask when a malformed outcome was delivered", async () => {
    const { root, fake, runtime } = await setupDirect();
    try {
      let outcomePath = "";
      fake.script((req) => {
        outcomePath = req.outcomePath!;
        fs.writeFileSync(req.outcomePath!, "status: [unclosed\nsummary: x\n");
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "recovered" });
        return fakeTurnResult(req);
      });

      const result = await turn(runtime, root, {
        unfinishedPrompt: "unfinished-turn",
      });

      expect(fake.calls).toHaveLength(2);
      expect(result.record.asks).toEqual(["outcome"]);
      const ask = fake.calls[1]!.prompt;
      expect(ask).toContain(
        "You are the implementer. Your turn did not deliver its outcome.",
      );
      expect(ask).not.toContain("did not finish the task");
      expect(ask).toContain("not valid YAML");
      expect(result.outcome?.summary).toBe("recovered");
      expect(outcomePath).not.toBe("");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function keepsOutcomeAskWhenExpectationFails(): void {
  it("keeps the outcome-only ask when a delivered outcome fails the expectation", async () => {
    const { root, fake, runtime } = await setupDirect();
    try {
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "no verdict yet" });
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        ctx.writeOutcome({
          status: "done",
          summary: "recovered",
          verdict: "approve",
        });
        return fakeTurnResult(req);
      });

      const result = await runAgentTurn(runtime, {
        target: {
          ...resolveTurn(runtime, "reviewer", "reviewer"),
          unfinishedPrompt: "unfinished-turn",
        },
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "review", round: 1 },
        vars: reviewTurnVars,
        expectation: "review",
      });

      expect(fake.calls).toHaveLength(2);
      expect(result.record.asks).toEqual(["outcome"]);
      const ask = fake.calls[1]!.prompt;
      expect(ask).toContain(
        "You are the reviewer. Your turn did not deliver its verdict.",
      );
      expect(ask).toContain("verdict is required");
      expect(ask).not.toContain("did not finish the task");
      expect(result.outcome?.verdict).toBe("approve");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function rendersTodaysAskWithoutUnfinishedPrompt(): void {
  it("renders today's ask byte for byte when the step names no unfinishedPrompt", async () => {
    const { root, fake, runtime } = await setupDirect();
    try {
      let outcomePath = "";
      fake.script((req) => {
        outcomePath = req.outcomePath!;
        return fakeTurnResult(req, { text: "nothing" });
      });
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "recovered" });
        return fakeTurnResult(req);
      });

      const result = await turn(runtime, root);

      expect(result.record.asks).toEqual(["outcome"]);
      expect(fake.calls[1]!.prompt).toBe(
        runtime.prompts.render("delivery-repair", {
          role: "implementer",
          deliverable: "outcome",
          done_allowed: "true",
          findings:
            "- no outcome written to the outcome path and no fenced YAML block in the final message",
          outcome_path: outcomePath,
          outcome_schema: outcomeRepairSchemaVar("implementer", "any"),
        }),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function sendsNoAskAfterHaltedStop(): void {
  it("sends no ask after a halted stop", async () => {
    const { root, fake, runtime } = await setupDirect();
    try {
      fake.script((req) =>
        fakeTurnResult(req, { stop: { kind: "refusal", details: "no" } }),
      );

      const result = await turn(runtime, root, {
        unfinishedPrompt: "unfinished-turn",
      });

      expect(fake.calls).toHaveLength(1);
      expect(result.record.asks).toBeUndefined();
      expect(result.outcome).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

describe("unfinished implement turn", () => {
  asksNoOutcomeNoEditToFinish();
  asksAfterPartialEdits();
  keepsOutcomeAskForMalformedOutcome();
  keepsOutcomeAskWhenExpectationFails();
  rendersTodaysAskWithoutUnfinishedPrompt();
  sendsNoAskAfterHaltedStop();
});

interface FlowScope {
  repo: ReturnType<typeof setupFlowRepo>["repo"];
  runtime: Awaited<ReturnType<typeof makeRuntime>>;
  harness: FakeHarness;
  records: Awaited<ReturnType<KernelRuntime["store"]["listRecords"]>>;
  state: ReturnType<typeof derive>;
  result: Awaited<ReturnType<typeof runDispatch>>;
}

function expectUnfinishedFlow(scope: FlowScope): void {
  const { repo, runtime, harness, records, state, result } = scope;
  expect(result.reason).toBe("boundary");
  expect(state.tasks.task!.status).toBe("merged");

  const implement = records.find(
    (r) => r.slug === "task" && r.step === "implement",
  )!;
  expect(implement.asks).toEqual(["unfinished"]);
  // Implement, the finish ask, QA and the review.
  expect(harness.calls).toHaveLength(4);
  const ask = harness.calls[1]!.prompt;
  expect(ask).toContain(runtime.store.tasks.path("task"));
  expect(ask).toContain(
    path.join(path.dirname(runtime.paths.goalCheckout), "demo-tasks", "task"),
  );
  expect(ask).toContain("Read that task file now");

  const checks = records.filter(
    (r) => r.slug === "task" && r.step === "checks",
  );
  expect(checks).toHaveLength(1);
  expect(checks[0]!.ok).toBe(true);
  expect(repo.git(["show", "factory/demo:task.txt"]).stdout.trim()).toBe(
    "task.txt",
  );
}

function landsEditsInShippedFlow(): void {
  it("lands the edits made in answer through the commit and the checks", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "work", command: "test -f task.txt" }],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req) =>
        fakeTurnResult(req, { text: "read the task and planned" }),
      );
      harness.script(implementerTurn("task.txt"));
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      const result = await runDispatch(runtime, { iteration: 1 });
      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expectUnfinishedFlow({
        repo,
        runtime,
        harness,
        records,
        state,
        result,
      });
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("unfinished implement turn in the shipped flow", () => {
  landsEditsInShippedFlow();
});
