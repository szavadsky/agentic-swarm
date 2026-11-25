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
import { renderTaskFile } from "../../src/kernel/tasks.js";
import type {
  KernelRuntime,
  ProcessConfig,
  RepoConfig,
  RunConfig,
} from "../../src/kernel/types.js";
import { outcome } from "./e2e-helpers.js";
import { withKernelRoleFallbacks } from "./fake-defaults.js";
import {
  causeText,
  TEST_ARCHITECTURE,
  TEST_BOUNDARY,
  task,
} from "./helpers.js";

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
    // Hermetic prices: the test-local cache, never the network.
    priceSource: {
      cachePath: path.join(root, "price-cache.json"),
      fetchModels: async () => {
        throw new Error("price fetch disabled in tests");
      },
    },
  };
}

function scopedRuntime(): {
  root: string;
  runtime: KernelRuntime;
  fake: FakeHarness;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-pm-scopes-"));
  const fake = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
  const runtime = runtimeFor(fake, root);
  fs.mkdirSync(path.join(runtime.store.goalDir, "epics"), {
    recursive: true,
  });
  fs.mkdirSync(runtime.store.tasksDir, { recursive: true });
  fs.writeFileSync(
    path.join(runtime.store.goalDir, "plan.md"),
    [
      "# Plan",
      "",
      "## Architect register",
      "",
      "- epic `auth` | architect `subarchitect` | plan `epics/auth.md` | scope `src/auth/**` | opened i1 | active",
      "- epic `billing` | architect `subarchitect` | plan `epics/billing.md` | scope `src/billing/**` | opened i1 | active",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(runtime.store.goalDir, "epics/auth.md"),
    "# Epic auth\n\n- auth.login — Add login.\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(runtime.store.goalDir, "epics/billing.md"),
    "# Epic billing\n\n- billing.invoice — Add invoices.\n",
    "utf8",
  );
  return { root, runtime, fake };
}

/** Runs the epic PMs, then the top PM, each in its own scope. */
async function runScopedPms(
  runtime: KernelRuntime,
  root: string,
): Promise<void> {
  for (const scope of [
    { kind: "epic", epic: "auth" },
    { kind: "epic", epic: "billing" },
    { kind: "goal" },
  ] as const) {
    const result = await runPm(runtime, {
      iteration: 1,
      state: derive(await runtime.store.listTasks(), []),
      cwd: root,
      scope,
    });
    expect(result.status).toBe("done");
  }
}

function registerPMOverPlanScopesPart1(): void {
  it("derives each epic plan through that epic's PM and keeps the goal plan for the top", async () => {
    const { root, runtime, fake } = scopedRuntime();
    try {
      const authPlan = path.join(runtime.store.goalDir, "epics/auth.md");
      const billingPlan = path.join(runtime.store.goalDir, "epics/billing.md");
      for (const [epic, planPath] of [
        ["auth", authPlan],
        ["billing", billingPlan],
      ] as const) {
        fake.script((req, ctx) => {
          expect(req.prompt).toContain(`- epic: \`${epic}\``);
          expect(req.prompt).toContain(`- epic \`${epic}\`: ${planPath}`);
          expect(req.prompt).not.toContain("- goal:");
          const plan = fs.readFileSync(planPath, "utf8");
          for (const match of plan.matchAll(/^- (\S+) —/gmu)) {
            const slug = match[1]!;
            fs.writeFileSync(
              path.join(runtime.store.tasksDir, `${slug}.md`),
              renderTaskFile(task(slug, { epic, source: "plan" })),
              "utf8",
            );
          }
          ctx.writeOutcome(outcome({ summary: `derived epic ${epic}` }));
          return fakeTurnResult(req);
        });
      }
      fake.script((req, ctx) => {
        expect(req.prompt).toContain("- goal:");
        expect(req.prompt).not.toContain("- epic `auth`: ");
        expect(req.prompt).not.toContain("- epic `billing`: ");
        ctx.writeOutcome(outcome({ summary: "no goal-level tasks" }));
        return fakeTurnResult(req);
      });

      await runScopedPms(runtime, root);
      const tasks = await runtime.store.listTasks();
      expect(tasks.map((entry) => [entry.slug, entry.epic])).toEqual([
        ["auth.login", "auth"],
        ["billing.invoice", "billing"],
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerPMOverPlanScopesPart2(): void {
  it("restores an edit to any epic plan and reports which plan changed", async () => {
    const { root, runtime, fake } = scopedRuntime();
    try {
      const authPlan = path.join(runtime.store.goalDir, "epics/auth.md");
      const billingPlan = path.join(runtime.store.goalDir, "epics/billing.md");
      const authBefore = fs.readFileSync(authPlan, "utf8");
      const billingBefore = fs.readFileSync(billingPlan, "utf8");
      fake.script((req, ctx) => {
        fs.appendFileSync(authPlan, "\n## smuggled\n", "utf8");
        fs.appendFileSync(billingPlan, "\n## smuggled\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "edited both plans" }));
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        expect(req.prompt).toContain(
          "epics/auth.md changed during the PM turn; restored",
        );
        expect(req.prompt).toContain(
          "epics/billing.md changed during the PM turn; restored",
        );
        ctx.writeOutcome(outcome({ summary: "left the plans alone" }));
        return fakeTurnResult(req);
      });

      const result = await runPm(runtime, {
        iteration: 1,
        state: derive([], []),
        cwd: root,
      });
      expect(result.status).toBe("done");
      expect(fs.readFileSync(authPlan, "utf8")).toBe(authBefore);
      expect(fs.readFileSync(billingPlan, "utf8")).toBe(billingBefore);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerPMOverPlanScopesPart3(): void {
  it("applies each plan's cancellation only to the tasks that plan owns", async () => {
    const { root, runtime, fake } = scopedRuntime();
    try {
      await runtime.store.writeTask(
        task("auth.old", {
          epic: "auth",
          body: "Old auth work.\nDone when: it works.",
        }),
      );
      await runtime.store.writeTask(
        task("billing.old", {
          epic: "billing",
          body: "Old billing work.\nDone when: it works.",
        }),
      );
      fs.appendFileSync(
        path.join(runtime.store.goalDir, "epics/auth.md"),
        [
          "cancelled: auth.old — auth replaced it",
          "cancelled: billing.old — an epic plan cannot retire this",
          "",
        ].join("\n"),
        "utf8",
      );
      fs.appendFileSync(
        path.join(runtime.store.goalDir, "epics/billing.md"),
        "cancelled: billing.old — billing replaced it\n",
        "utf8",
      );
      fake.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "applied the scoped plan" }));
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "applied the scoped plan" }));
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no goal cancellations" }));
        return fakeTurnResult(req);
      });

      await runScopedPms(runtime, root);
      const cancels = (await runtime.store.listRecords())
        .filter((record) => record.step === "cancel")
        .map((record) => [record.slug, causeText(record.cause)]);
      expect(cancels).toEqual([
        ["auth.old", "auth replaced it"],
        ["billing.old", "billing replaced it"],
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerPMOverPlanScopesPart4(): void {
  it("refuses a foreign epic task, restores it, and lets the next rung complete", async () => {
    const { root, runtime, fake } = scopedRuntime();
    try {
      const foreign = path.join(runtime.store.tasksDir, "billing.invoice.md");
      const own = path.join(runtime.store.tasksDir, "auth.login.md");
      fake.script((req, ctx) => {
        fs.writeFileSync(
          foreign,
          renderTaskFile(
            task("billing.invoice", { epic: "billing", source: "plan" }),
          ),
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "wrote another epic's task" }));
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        expect(req.prompt).toContain(
          `task "billing.invoice" is epic billing's; the PM for epic auth writes only epic auth tasks`,
        );
        fs.writeFileSync(
          own,
          renderTaskFile(task("auth.login", { epic: "auth", source: "plan" })),
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "wrote only auth's task" }));
        return fakeTurnResult(req);
      });

      const result = await runPm(runtime, {
        iteration: 1,
        state: derive([], []),
        cwd: root,
        scope: { kind: "epic", epic: "auth" },
      });
      expect(result.status).toBe("done");
      expect(result.rungs.map((rung) => rung.failure)).toEqual([
        `task "billing.invoice" is epic billing's; the PM for epic auth writes only epic auth tasks`,
      ]);
      expect(fs.existsSync(foreign)).toBe(false);
      expect(
        (await runtime.store.listTasks()).map((entry) => entry.slug),
      ).toEqual(["auth.login"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

describe("PM over plan scopes", () => {
  registerPMOverPlanScopesPart1();

  registerPMOverPlanScopesPart2();

  registerPMOverPlanScopesPart3();

  registerPMOverPlanScopesPart4();
});
