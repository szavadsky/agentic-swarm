import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Repo } from "../../src/core/git/repo.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runAgentTurn } from "../../src/kernel/agent.js";
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-rescue-"));
  const fake = new FakeHarness({ id: "fake" });
  const runtime = runtimeFor(fake, root);
  await runtime.store.ensureLayout();
  return { root, fake, runtime };
}

function turn(
  runtime: KernelRuntime,
  root: string,
  rescues: AgentTurnSpec["rescue"],
) {
  return runAgentTurn(runtime, {
    target: {
      ...resolveTurn(runtime, "implementer", "implementer"),
      unfinishedPrompt: "unfinished-turn",
    },
    cwd: root,
    meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
    vars: implementerVars,
    expectation: "any",
    rescue: rescues,
  });
}

function rescuesAfterTheReminder(): void {
  it("adds one fresh-session rescue call and records its findings and cost", async () => {
    const { root, fake, runtime } = await setupDirect();
    try {
      const asks: string[] = [];
      fake.script((req) =>
        fakeTurnResult(req, { text: "worked", usage: { out: 2 } }),
      );
      fake.script((req) =>
        fakeTurnResult(req, { text: "still nothing", usage: { out: 2 } }),
      );
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "finished the work" });
        return fakeTurnResult(req, { usage: { out: 2 } });
      });

      const result = await turn(runtime, root, async (findings) => {
        asks.push(...findings);
        return "rescue this turn";
      });

      expect(fake.calls).toHaveLength(3);
      expect(asks).toEqual(["no outcome after repair"]);
      expect(fake.calls[2]!.prompt).toBe("rescue this turn");
      // The rescue is the one fresh session: the reminder resumed the first.
      expect(fake.calls[1]!.session).toBeDefined();
      expect(fake.calls[2]!.session).toBeUndefined();
      expect(result.record.asks).toEqual(["unfinished", "rescue"]);
      expect(result.record.repairFindings).toEqual([
        "no outcome written to the outcome path and no fenced YAML block in the final message",
        "no outcome after repair",
      ]);
      expect(result.record.repairFindingsResolved).toBe(true);
      expect(result.record.attempts).toHaveLength(3);
      expect(result.record.usage?.out).toBe(6);
      expect(result.outcome?.status).toBe("done");
      expect(result.outcome?.summary).toBe("finished the work");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function clearsTheStaleOutcomeFile(): void {
  it("removes the failed attempt's outcome file before the rescue writes", async () => {
    const { root, fake, runtime } = await setupDirect();
    try {
      fake.script((req) => {
        fs.writeFileSync(req.outcomePath!, "status: [unclosed\n");
        return fakeTurnResult(req);
      });
      fake.script((req) => fakeTurnResult(req, { text: "still nothing" }));
      let stalePresent: boolean | undefined;
      fake.script((req, ctx) => {
        stalePresent = fs.existsSync(req.outcomePath!);
        ctx.writeOutcome({ status: "done", summary: "rescued" });
        return fakeTurnResult(req);
      });

      const result = await turn(runtime, root, async () => "rescue this turn");

      expect(stalePresent).toBe(false);
      expect(result.record.asks).toEqual(["outcome", "rescue"]);
      expect(result.outcome?.summary).toBe("rescued");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function skipsEmptyBranches(): void {
  it("sends no rescue call when the branch holds nothing", async () => {
    const { root, fake, runtime } = await setupDirect();
    try {
      fake.script((req) => fakeTurnResult(req, { text: "planned" }));
      fake.script((req) => fakeTurnResult(req, { text: "still planned" }));
      let asked = false;

      const result = await turn(runtime, root, async () => {
        asked = true;
        return null;
      });

      expect(asked).toBe(true);
      expect(fake.calls).toHaveLength(2);
      expect(result.record.asks).toEqual(["unfinished"]);
      expect(result.outcome?.status).toBe("failed");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function skipsHaltedStops(): void {
  it("calls no rescue after a halted stop", async () => {
    const { root, fake, runtime } = await setupDirect();
    try {
      fake.script((req) =>
        fakeTurnResult(req, { stop: { kind: "refusal", details: "no" } }),
      );
      let asked = false;

      const result = await turn(runtime, root, async () => {
        asked = true;
        return "rescue this turn";
      });

      expect(asked).toBe(false);
      expect(fake.calls).toHaveLength(1);
      expect(result.record.asks).toBeUndefined();
      expect(result.outcome).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function skipsDeliveredOutcomes(): void {
  it("calls no rescue when the reminder delivered a valid outcome", async () => {
    const { root, fake, runtime } = await setupDirect();
    try {
      fake.script((req) => fakeTurnResult(req, { text: "planned" }));
      fake.script((req, ctx) => {
        ctx.writeOutcome({ status: "done", summary: "delivered" });
        return fakeTurnResult(req);
      });
      let asked = false;

      const result = await turn(runtime, root, async () => {
        asked = true;
        return "rescue this turn";
      });

      expect(asked).toBe(false);
      expect(fake.calls).toHaveLength(2);
      expect(result.record.asks).toEqual(["unfinished"]);
      expect(result.outcome?.summary).toBe("delivered");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function failsOnSecondInvalidOutcome(): void {
  it("fails the turn as today when the rescue outcome is invalid", async () => {
    const { root, fake, runtime } = await setupDirect();
    try {
      fake.script((req) => fakeTurnResult(req, { text: "planned" }));
      fake.script((req) => fakeTurnResult(req, { text: "still planned" }));
      fake.script((req) => {
        fs.writeFileSync(req.outcomePath!, "status: [unclosed\n");
        return fakeTurnResult(req);
      });

      const result = await turn(runtime, root, async () => "rescue this turn");

      expect(fake.calls).toHaveLength(3);
      expect(result.record.asks).toEqual(["unfinished", "rescue"]);
      expect(result.record.repairFindingsResolved).toBeUndefined();
      expect(result.outcome?.status).toBe("failed");
      expect(result.outcome?.summary).toContain("not valid YAML");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function endsOnRescueInfraStop(): void {
  it("ends as an infra stop when the rescue call cannot run", async () => {
    const { root, fake, runtime } = await setupDirect();
    try {
      fake.script((req) => fakeTurnResult(req, { text: "planned" }));
      fake.script((req) => fakeTurnResult(req, { text: "still planned" }));
      fake.script((req) =>
        fakeTurnResult(req, {
          stop: { kind: "infra", cause: "quota", details: "quota spent" },
        }),
      );

      const result = await turn(runtime, root, async () => "rescue this turn");

      expect(fake.calls).toHaveLength(3);
      expect(result.record.asks).toEqual(["unfinished", "rescue"]);
      expect(result.record.stop).toEqual({
        kind: "infra",
        cause: "quota",
        details: "quota spent",
      });
      expect(result.outcome).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

describe("rescue of a turn whose work survived its reminder", () => {
  rescuesAfterTheReminder();
  clearsTheStaleOutcomeFile();
  skipsEmptyBranches();
  skipsHaltedStops();
  skipsDeliveredOutcomes();
  failsOnSecondInvalidOutcome();
  endsOnRescueInfraStop();
});
