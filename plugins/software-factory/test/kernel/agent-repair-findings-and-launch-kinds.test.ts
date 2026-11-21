import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Repo } from "../../src/core/git/repo.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runAgentTurn } from "../../src/kernel/agent.js";
import { resolveTurn } from "../../src/kernel/flow-context.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { appendPark, parkLaunchKind } from "../../src/kernel/record.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type {
  KernelRuntime,
  ProcessConfig,
  RepoConfig,
  RunConfig,
} from "../../src/kernel/types.js";
import { TEST_ARCHITECTURE, TEST_BOUNDARY, cause } from "./helpers.js";

function runtimeFor(fake: FakeHarness, root: string): KernelRuntime {
  const scope1 = runtimeForPart1();
  return runtimeForPart2(root, fake, scope1);
}

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

async function setupLocal2() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-launch-"));
  const fake = new FakeHarness({ id: "fake" });
  const runtime = runtimeFor(fake, root);
  await runtime.store.ensureLayout();
  return { root, fake, runtime };
}

const reviewerVarsLocal = {
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

function registerRepairFindingsAndLaunchKindsPart3(): void {
  it("marks fallback hops as glitches", async () => {
    const { root, fake, runtime } = await setupLocal2();
    try {
      const base = resolveTurn(runtime, "implementer", "implementer");
      const target = {
        ...base,
        tiers: [
          { harness: fake, model: { id: "fake-a" } },
          { harness: fake, model: { id: "fake-b" } },
        ],
      };
      fake.script((req) =>
        fakeTurnResult(req, { stop: { kind: "infra", cause: "quota" } }),
      );
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "via fallback" });
        return fakeTurnResult(req);
      });

      const result = await runAgentTurn(runtime, {
        target,
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });

      expect(result.outcome?.summary).toBe("via fallback");
      expect(result.record.launchKind).toBe("glitch");
      expect(runtime.exhaustedPools.has("fake+fake-a")).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerRepairFindingsAndLaunchKindsPart4(): void {
  it("records exhausted pool on quota stop but not on timeout, rate, or crash", async () => {
    for (const cause of ["timeout", "rate", "crash"] as const) {
      const { root, fake, runtime } = await setupLocal2();
      try {
        const base = resolveTurn(runtime, "implementer", "implementer");
        const target = {
          ...base,
          tiers: [
            { harness: fake, model: { id: "fake-a" } },
            { harness: fake, model: { id: "fake-b" } },
          ],
        };
        fake.script((req) =>
          fakeTurnResult(req, { stop: { kind: "infra", cause } }),
        );
        fake.script((req, ctx) => {
          ctx.writeOutcome({ status: "done", summary: "delivered" });
          return fakeTurnResult(req);
        });

        await runAgentTurn(runtime, {
          target,
          cwd: root,
          meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
          vars: implementerVars,
          expectation: "any",
        });

        expect(runtime.exhaustedPools.size).toBe(0);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });
}

function registerRepairFindingsAndLaunchKindsPart5(): void {
  it("marks review changes as change-request and failed outcomes as failure", async () => {
    const { root, fake, runtime } = await setupLocal2();
    try {
      fake.script((req, ctx) => {
        ctx.writeOutcome({
          status: "done",
          summary: "needs work",
          verdict: "changes",
        });
        return fakeTurnResult(req);
      });
      const changes = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "reviewer", "reviewer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "review", round: 1 },
        vars: reviewerVarsLocal,
        expectation: "review",
      });
      expect(changes.record.launchKind).toBe("change-request");

      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "failed", summary: "broken" });
        return fakeTurnResult(req);
      });
      const failed = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "implementer", "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 2 },
        vars: implementerVars,
        expectation: "any",
      });
      expect(failed.record.launchKind).toBe("failure");

      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      const exhausted = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "implementer", "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "b", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });
      expect(exhausted.outcome?.status).toBe("failed");
      expect(exhausted.record.launchKind).toBe("failure");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerRepairFindingsAndLaunchKindsPart6(): void {
  it("reads the reminder count from process config", async () => {
    const { root, fake, runtime } = await setupLocal2();
    try {
      runtime.configs.process.reminders = 0;
      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      const none = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "implementer", "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });
      expect(fake.calls).toHaveLength(1);
      expect(none.outcome?.status).toBe("failed");

      runtime.configs.process.reminders = 2;
      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "recovered on 2" });
        return fakeTurnResult(req);
      });
      const two = await runAgentTurn(runtime, {
        target: resolveTurn(runtime, "implementer", "implementer"),
        cwd: root,
        meta: { iteration: 1, slug: "b", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });
      expect(fake.calls).toHaveLength(4);
      expect(two.outcome?.summary).toBe("recovered on 2");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerRepairFindingsAndLaunchKindsPart7(): void {
  it("stores a typed kind on every park", async () => {
    const { root, runtime } = await setupLocal2();
    try {
      expect(parkLaunchKind(cause("overflow"))).toBe("glitch");
      expect(parkLaunchKind(cause("infra-repeat: timeout"))).toBe("glitch");
      expect(
        parkLaunchKind(
          cause(
            'review round limit reached after verdict "changes" (2 rounds)',
          ),
        ),
      ).toBe("change-request");
      expect(parkLaunchKind(cause("failed: no plan"))).toBe("failure");
      // A failure summary quoting the verdict enum is not a change request.
      expect(
        parkLaunchKind(
          cause("failed: missing verdict (approve | changes | reject)"),
        ),
      ).toBe("failure");
      expect(parkLaunchKind(cause("review rejected: changes requested"))).toBe(
        "failure",
      );

      await appendPark(
        runtime.store,
        { iteration: 1, slug: "a", round: 1, revision: 0 },
        cause("overflow"),
      );
      await appendPark(
        runtime.store,
        { iteration: 1, slug: "b", round: 1, revision: 0 },
        cause('review round limit reached after verdict "changes" (2 rounds)'),
      );
      await appendPark(
        runtime.store,
        { iteration: 1, slug: "c", round: 1, revision: 0 },
        cause("failed: no plan"),
      );
      const records = await runtime.store.listRecords();
      expect(records.find((r) => r.slug === "a")?.launchKind).toBe("glitch");
      expect(records.find((r) => r.slug === "b")?.launchKind).toBe(
        "change-request",
      );
      expect(records.find((r) => r.slug === "c")?.launchKind).toBe("failure");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

describe("repair findings and launch kinds", () => {
  registerRepairFindingsAndLaunchKindsPart3();

  registerRepairFindingsAndLaunchKindsPart4();

  registerRepairFindingsAndLaunchKindsPart5();

  registerRepairFindingsAndLaunchKindsPart6();

  registerRepairFindingsAndLaunchKindsPart7();
});
