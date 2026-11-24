import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Repo } from "../../src/core/git/repo.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { OUTCOME_SETTLE_MS, runAgentTurn } from "../../src/kernel/agent.js";
import type { AgentTurnSpec } from "../../src/kernel/agent/types.js";
import { resolveTurn } from "../../src/kernel/flow-context.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type {
  KernelRuntime,
  ProcessConfig,
  RepoConfig,
  RunConfig,
} from "../../src/kernel/types.js";
import { TEST_ARCHITECTURE, TEST_BOUNDARY } from "./helpers.js";

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

function configsFor(): {
  process: ProcessConfig;
  repo: RepoConfig;
  run: RunConfig;
} {
  return {
    process: {
      taskTypes: {},
      flows: {},
      boundary: TEST_BOUNDARY,
      architecture: TEST_ARCHITECTURE,
      reminders: 1,
    },
    repo: {
      baseBranch: "main",
      artifactRoot: ".factory/artifacts",
      setup: [],
      gates: [],
    },
    run: {
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
    },
  };
}

function runtimeFor(fake: FakeHarness, root: string): KernelRuntime {
  const { process, repo, run } = configsFor();
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

async function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-live-settle-"));
  const fake = new FakeHarness({ id: "fake" });
  const runtime = runtimeFor(fake, root);
  await runtime.store.ensureLayout();
  return { root, fake, runtime };
}

function turn(
  runtime: KernelRuntime,
  root: string,
  extra: Partial<AgentTurnSpec> = {},
) {
  return runAgentTurn(runtime, {
    target: resolveTurn(runtime, "implementer", "implementer"),
    cwd: root,
    meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
    vars: implementerVars,
    expectation: "any",
    repairTurns: 1,
    ...extra,
  });
}

function deliversLateLiveOutcome(): void {
  it("delivers a valid outcome written after the settle by a live process", async () => {
    const { root, fake, runtime } = await setup();
    try {
      let live = true;
      let exited: (() => void) | undefined;
      const exit = new Promise<void>((resolve) => {
        exited = resolve;
      });
      fake.isLive = () => live;
      fake.waitExit = async () => {
        await exit;
      };
      fake.script((req) => {
        setTimeout(() => {
          fs.mkdirSync(path.dirname(req.outcomePath!), { recursive: true });
          fs.writeFileSync(
            req.outcomePath!,
            "status: done\nsummary: written after the settle\n",
          );
          live = false;
          exited?.();
        }, OUTCOME_SETTLE_MS + 100);
        return fakeTurnResult(req, { text: "live" });
      });

      const result = await turn(runtime, root);

      expect(fake.calls).toHaveLength(1);
      expect(result.outcome?.summary).toBe("written after the settle");
      expect(result.record.stop).toEqual({ kind: "done" });
      expect(result.record.repairFindings).toBeUndefined();
      expect(result.record.asks).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function neverWaitsForDeadProcess(): void {
  it("never waits for a process the harness reports dead", async () => {
    const { root, fake, runtime } = await setup();
    try {
      const waits: number[] = [];
      fake.isLive = () => false;
      fake.waitExit = async () => {
        throw new Error("a dead process must not be awaited");
      };
      fake.script((req) => fakeTurnResult(req, { text: "nothing" }));
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "repaired" });
        return fakeTurnResult(req);
      });

      const result = await turn(runtime, root, {
        sleep: async (ms: number) => {
          waits.push(ms);
        },
      });

      expect(waits).toEqual([OUTCOME_SETTLE_MS]);
      expect(fake.calls).toHaveLength(2);
      expect(result.record.asks).toEqual(["outcome"]);
      expect(result.outcome?.summary).toBe("repaired");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function boundsLiveWaitByWall(): void {
  it("bounds a live process's wait by the remaining wall clock", async () => {
    const { root, fake, runtime } = await setup();
    try {
      fake.isLive = () => true;
      fake.waitExit = () => new Promise(() => {});
      fake.script((req) => fakeTurnResult(req, { text: "live" }));

      const result = await turn(runtime, root, {
        timeouts: { idleMs: 0, wallMs: 100 },
      });

      expect(fake.calls).toHaveLength(1);
      expect(result.record.repairFindings).toBeUndefined();
      expect(result.record.asks).toBeUndefined();
      expect(result.record.stop).toEqual({
        kind: "infra",
        cause: "timeout",
        details: "wall clock 100ms exceeded",
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function sendsRepairAfterLiveExit(): void {
  it("sends the repair ask only after the live process has exited", async () => {
    const { root, fake, runtime } = await setup();
    try {
      let live = true;
      let exited: (() => void) | undefined;
      const exit = new Promise<void>((resolve) => {
        exited = resolve;
      });
      fake.isLive = () => live;
      fake.waitExit = async () => {
        await exit;
      };
      fake.script((req) => {
        setTimeout(() => {
          live = false;
          exited?.();
        }, OUTCOME_SETTLE_MS + 200);
        return fakeTurnResult(req, { text: "nothing yet" });
      });
      let askedWhileLive = false;
      fake.script((req, ctx) => {
        askedWhileLive = live;
        ctx.writeOutcome({ status: "done", summary: "repaired after exit" });
        return fakeTurnResult(req);
      });

      const result = await turn(runtime, root);

      expect(askedWhileLive).toBe(false);
      expect(fake.calls).toHaveLength(2);
      expect(result.outcome?.summary).toBe("repaired after exit");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function deliversLateWriteWithoutExit(): void {
  it("delivers a late write from a process that never exits", async () => {
    const { root, fake, runtime } = await setup();
    try {
      fake.isLive = () => true;
      fake.waitExit = () => new Promise(() => {});
      fake.script((req) => {
        setTimeout(() => {
          fs.mkdirSync(path.dirname(req.outcomePath!), { recursive: true });
          fs.writeFileSync(
            req.outcomePath!,
            "status: done\nsummary: written while live\n",
          );
        }, OUTCOME_SETTLE_MS + 50);
        return fakeTurnResult(req, { text: "live" });
      });

      const before = Date.now();
      const result = await turn(runtime, root, {
        timeouts: { idleMs: 0, wallMs: 10_000 },
      });

      expect(Date.now() - before).toBeLessThan(5_000);
      expect(fake.calls).toHaveLength(1);
      expect(result.outcome?.summary).toBe("written while live");
      expect(result.record.stop).toEqual({ kind: "done" });
      expect(result.record.repairFindings).toBeUndefined();
      expect(result.record.asks).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function survivesPartialLateWrite(): void {
  it("keeps waiting through a partial late write", async () => {
    const { root, fake, runtime } = await setup();
    try {
      fake.isLive = () => true;
      fake.waitExit = () => new Promise(() => {});
      fake.script((req) => {
        const write = (body: string) => {
          fs.mkdirSync(path.dirname(req.outcomePath!), { recursive: true });
          fs.writeFileSync(req.outcomePath!, body);
        };
        setTimeout(() => write("status: do"), OUTCOME_SETTLE_MS - 200);
        setTimeout(
          () => write("status: done\nsummary: completed after partial\n"),
          OUTCOME_SETTLE_MS + 100,
        );
        return fakeTurnResult(req, { text: "live" });
      });

      const result = await turn(runtime, root, {
        timeouts: { idleMs: 0, wallMs: 5_000 },
      });

      expect(result.outcome?.summary).toBe("completed after partial");
      expect(result.record.stop).toEqual({ kind: "done" });
      expect(result.record.asks).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function survivesPartialBeforeStop(): void {
  it("waits through a partial write already present at the stop", async () => {
    const { root, fake, runtime } = await setup();
    try {
      fake.isLive = () => true;
      fake.waitExit = () => new Promise(() => {});
      fake.script((req) => {
        fs.mkdirSync(path.dirname(req.outcomePath!), { recursive: true });
        fs.writeFileSync(req.outcomePath!, "status: do");
        setTimeout(
          () =>
            fs.writeFileSync(
              req.outcomePath!,
              "status: done\nsummary: completed from a partial\n",
            ),
          OUTCOME_SETTLE_MS + 100,
        );
        return fakeTurnResult(req, { text: "live" });
      });

      const result = await turn(runtime, root, {
        timeouts: { idleMs: 0, wallMs: 10_000 },
      });

      expect(result.outcome?.summary).toBe("completed from a partial");
      expect(result.record.stop).toEqual({ kind: "done" });
      expect(result.record.asks).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

describe("live harness settle", () => {
  deliversLateLiveOutcome();
  neverWaitsForDeadProcess();
  boundsLiveWaitByWall();
  sendsRepairAfterLiveExit();
  deliversLateWriteWithoutExit();
  survivesPartialLateWrite();
  survivesPartialBeforeStop();
});
