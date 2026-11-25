import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Repo } from "../../src/core/git/repo.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runPm } from "../../src/kernel/pm.js";
import { loadPrompts } from "../../src/kernel/prompts.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type {
  KernelRuntime,
  ProcessConfig,
  RepoConfig,
  RunConfig,
} from "../../src/kernel/types.js";
import { outcome } from "./e2e-helpers.js";
import { withKernelRoleFallbacks } from "./fake-defaults.js";
import { TEST_ARCHITECTURE, TEST_BOUNDARY } from "./helpers.js";

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
    aliases: { pm: { harness: "fake", model: "fake-pm" } },
    limits: {
      concurrency: { overall: 1, perSubscription: {}, perModel: {} },
      iterations: 3,
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
      iterations: 3,
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

async function setup(caps?: { resume: boolean }): Promise<{
  root: string;
  runtime: KernelRuntime;
  fake: FakeHarness;
  planPath: string;
}> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-pm-diff-"));
  const fake = withKernelRoleFallbacks(
    new FakeHarness({ id: "fake", ...(caps ? { caps } : {}) }),
  );
  const runtime = runtimeFor(fake, root);
  await runtime.store.ensureLayout();
  return {
    root,
    runtime,
    fake,
    planPath: path.join(runtime.store.goalDir, "plan.md"),
  };
}

async function runDerive(
  runtime: KernelRuntime,
  root: string,
  iteration: number,
): Promise<void> {
  await runPm(runtime, {
    iteration,
    state: derive([], []),
    cwd: root,
  });
}

describe("PM plan diff and session continuity", () => {
  it("shows the plan diff and resumes the compacted PM session on the second derive turn", async () => {
    const { root, runtime, fake, planPath } = await setup();
    try {
      fs.writeFileSync(
        planPath,
        "# Plan\n\n- alpha — Create alpha.\n- gamma — Create gamma.\n",
        "utf8",
      );
      let firstPrompt = "";
      fake.script((req, ctx) => {
        firstPrompt = req.prompt;
        ctx.writeOutcome(outcome({ summary: "first derive" }));
        return fakeTurnResult(req);
      });
      await runDerive(runtime, root, 1);
      expect(firstPrompt).toContain("- plan diff: none");
      const first = (await runtime.store.listRecords())
        .filter((record) => record.step === "pm")
        .at(-1);
      expect(first?.session).toBeDefined();
      expect(fake.compactions.map((ref) => ref.id)).toEqual([
        first!.session!.id,
      ]);

      fs.writeFileSync(
        planPath,
        "# Plan\n\n- alpha — Create alpha revised.\n- beta — Create beta.\ncancelled: gamma — obsolete\n",
        "utf8",
      );
      let secondPrompt = "";
      fake.script((req, ctx) => {
        secondPrompt = req.prompt;
        expect(req.session?.id).toBe(first?.session?.id);
        expect(req.session?.compacted).toBe(true);
        ctx.writeOutcome(outcome({ summary: "second derive" }));
        return fakeTurnResult(req);
      });
      await runDerive(runtime, root, 2);
      expect(secondPrompt).toContain("- plan diff: \n  added:");
      expect(secondPrompt).toContain("- beta — Create beta.");
      expect(secondPrompt).toContain(
        "changed:\n  - alpha — Create alpha revised.",
      );
      expect(secondPrompt).toContain("cancelled:\n  - gamma — obsolete");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("PM plan diff without resume", () => {
  it("starts the second derive de novo on a non-resumable harness and still shows the diff", async () => {
    const { root, runtime, fake, planPath } = await setup({ resume: false });
    try {
      fs.writeFileSync(planPath, "# Plan\n\n- alpha — Create alpha.\n", "utf8");
      fake.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "first derive" }));
        return fakeTurnResult(req);
      });
      await runDerive(runtime, root, 1);

      fs.writeFileSync(
        planPath,
        "# Plan\n\n- alpha — Create alpha.\n- beta — Create beta.\n",
        "utf8",
      );
      let secondPrompt = "";
      fake.script((req, ctx) => {
        secondPrompt = req.prompt;
        expect(req.session).toBeUndefined();
        ctx.writeOutcome(outcome({ summary: "second derive" }));
        return fakeTurnResult(req);
      });
      await runDerive(runtime, root, 2);
      expect(secondPrompt).toContain("- plan diff: \n  added:");
      expect(secondPrompt).toContain("- beta — Create beta.");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("PM plan diff on a same-iteration re-derive", () => {
  it("shows the added/changed diff when the plan changes between derives in the same iteration", async () => {
    const { root, runtime, fake, planPath } = await setup();
    try {
      fs.writeFileSync(planPath, "# Plan\n\n- alpha — Create alpha.\n", "utf8");
      fake.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "first derive" }));
        return fakeTurnResult(req);
      });
      await runDerive(runtime, root, 1);

      fs.writeFileSync(
        planPath,
        "# Plan\n\n- alpha — Create alpha revised.\n- beta — Create beta.\n",
        "utf8",
      );
      let secondPrompt = "";
      fake.script((req, ctx) => {
        secondPrompt = req.prompt;
        ctx.writeOutcome(outcome({ summary: "second derive" }));
        return fakeTurnResult(req);
      });
      await runDerive(runtime, root, 1);
      expect(secondPrompt).toContain("- plan diff: \n  added:");
      expect(secondPrompt).toContain("- beta — Create beta.");
      expect(secondPrompt).toContain(
        "changed:\n  - alpha — Create alpha revised.",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
