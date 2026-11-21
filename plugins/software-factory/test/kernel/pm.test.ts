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
import { parseTaskFile } from "../../src/kernel/tasks.js";
import type {
  KernelRuntime,
  ProcessConfig,
  RepoConfig,
  RunConfig,
} from "../../src/kernel/types.js";
import { simpleTask } from "./e2e-helpers.js";
import { causeText } from "./helpers.js";
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

async function setup(): Promise<{
  root: string;
  runtime: KernelRuntime;
  fake: FakeHarness;
  planPath: string;
}> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-pm-"));
  const fake = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
  const runtime = runtimeFor(fake, root);
  await runtime.store.ensureLayout();
  const planPath = path.join(runtime.store.goalDir, "plan.md");
  fs.writeFileSync(planPath, "# Plan\n\n## alpha\nCreate alpha.\n", "utf8");
  return { root, runtime, fake, planPath };
}

async function marksMergedFinishedTasksFrozenReadPart1(
  planPath: string,
  runtime: KernelRuntime,
) {
  fs.writeFileSync(
    planPath,
    "# Plan\n\n## alpha\nCreate alpha.\n\n## probe\nProbe.\n\n## work\nWork.\n\n## later\nLater.\n",
    "utf8",
  );
  for (const text of [
    simpleTask("alpha", "alpha.txt"),
    simpleTask("probe", "finding.md", { kind: "spike", flow: "spike" }),
    simpleTask("work", "work.txt"),
    simpleTask("later", "later.txt", { deps: ["work"] }),
  ]) {
    await runtime.store.writeTask(
      parseTaskFile(text, /^slug:\s*(\S+)/m.exec(text)![1]!),
    );
  }
  await runtime.store.appendRecord(
    {
      iteration: 1,
      slug: "alpha",
      step: "merge",
      round: 1,
      actor: "script",
    },
    { ok: true },
  );
  await runtime.store.appendRecord(
    {
      iteration: 1,
      slug: "probe",
      step: "finish",
      round: 1,
      actor: "script",
    },
    { ok: true },
  );
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
  );
  expect(state.tasks.alpha!.status).toBe("merged");
  expect(state.tasks.probe!.status).toBe("finished");
  expect(state.tasks.later!.status).toBe("pending");

  return { state };
}

async function marksMergedFinishedTasksFrozenReadPart2(
  runtime: KernelRuntime,
  fake: FakeHarness,
  root: string,
  scope: Awaited<ReturnType<typeof marksMergedFinishedTasksFrozenReadPart1>>,
) {
  const { state } = scope;
  const frozenBefore = new Map(
    ["alpha", "probe"].map((slug) => [
      slug,
      fs.readFileSync(path.join(runtime.store.tasksDir, `${slug}.md`), "utf8"),
    ]),
  );

  fake.script((req, ctx) => {
    const line = (slug: string) =>
      req.prompt
        .split("\n")
        .find((candidate) => candidate.includes(`- ${slug} |`)) ?? "";
    expect(line("alpha")).toContain("| frozen (read-only)");
    expect(line("probe")).toContain("| frozen (read-only)");
    expect(line("later")).not.toContain("frozen");
    fs.appendFileSync(
      path.join(runtime.store.tasksDir, "later.md"),
      "\nPM edit.\n",
      "utf8",
    );
    ctx.writeOutcome({
      status: "done",
      summary: "edited the pending task",
      concerns: [],
      forward: [],
    });
    return fakeTurnResult(req);
  });

  const result = await runPm(runtime, {
    iteration: 1,
    state,
    cwd: root,
  });
  expect(result.status).toBe("done");

  return { ...scope, frozenBefore };
}

async function marksMergedFinishedTasksFrozenReadPart3(
  runtime: KernelRuntime,
  scope: Awaited<ReturnType<typeof marksMergedFinishedTasksFrozenReadPart2>>,
) {
  const { frozenBefore } = scope;
  for (const [slug, text] of frozenBefore) {
    expect(
      fs.readFileSync(path.join(runtime.store.tasksDir, `${slug}.md`), "utf8"),
    ).toBe(text);
  }
  expect(
    fs.readFileSync(path.join(runtime.store.tasksDir, "later.md"), "utf8"),
  ).toContain("PM edit.");
  const records = await runtime.store.listRecords();
  expect(records.filter((record) => record.step === "pm-reconcile")).toEqual(
    [],
  );
}

async function restoresMergedTaskFinishedSpikePMPart1(runtime: KernelRuntime) {
  const alpha = simpleTask("alpha", "alpha.txt");
  const probe = simpleTask("probe", "finding.md", {
    kind: "spike",
    flow: "spike",
  });
  await runtime.store.writeTask(parseTaskFile(alpha, "alpha"));
  await runtime.store.writeTask(parseTaskFile(probe, "probe"));
  const before = new Map(
    ["alpha", "probe"].map((slug) => [
      slug,
      fs.readFileSync(path.join(runtime.store.tasksDir, `${slug}.md`), "utf8"),
    ]),
  );
  await runtime.store.appendRecord(
    {
      iteration: 1,
      slug: "alpha",
      step: "merge",
      round: 1,
      actor: "script",
    },
    { ok: true },
  );
  await runtime.store.appendRecord(
    {
      iteration: 1,
      slug: "probe",
      step: "finish",
      round: 1,
      actor: "script",
    },
    { ok: true },
  );
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
  );
  expect(state.tasks.alpha!.status).toBe("merged");
  expect(state.tasks.probe!.status).toBe("finished");

  return { before, state };
}

async function restoresMergedTaskFinishedSpikePMPart2(
  runtime: KernelRuntime,
  fake: FakeHarness,
  scope: Awaited<ReturnType<typeof restoresMergedTaskFinishedSpikePMPart1>>,
) {
  const { before } = scope;
  fake.script((req, ctx) => {
    for (const slug of ["alpha", "probe"]) {
      fs.appendFileSync(
        path.join(runtime.store.tasksDir, `${slug}.md`),
        "\nPM edit.\n",
        "utf8",
      );
    }
    ctx.writeOutcome({
      status: "done",
      summary: "edited frozen work",
      concerns: [],
      forward: [],
    });
    return fakeTurnResult(req);
  });
  fake.script((req, ctx) => {
    expect(req.prompt).toContain('frozen task "alpha" was edited; restored');
    expect(req.prompt).toContain('frozen task "probe" was edited; restored');
    for (const slug of ["alpha", "probe"]) {
      expect(
        fs.readFileSync(
          path.join(runtime.store.tasksDir, `${slug}.md`),
          "utf8",
        ),
      ).toBe(before.get(slug)!);
    }
    ctx.writeOutcome({
      status: "done",
      summary: "acknowledged",
      concerns: [],
      forward: [],
    });
    return fakeTurnResult(req);
  });
}

async function restoresMergedTaskFinishedSpikePMPart3(
  runtime: KernelRuntime,
  root: string,
  scope: Awaited<ReturnType<typeof restoresMergedTaskFinishedSpikePMPart1>>,
) {
  const { state, before } = scope;
  const result = await runPm(runtime, {
    iteration: 1,
    state,
    cwd: root,
  });
  expect(result.status).toBe("done");
  for (const slug of ["alpha", "probe"]) {
    expect(
      fs.readFileSync(path.join(runtime.store.tasksDir, `${slug}.md`), "utf8"),
    ).toBe(before.get(slug)!);
  }
  const records = await runtime.store.listRecords();
  const reconcile = records.find((r) => r.step === "pm-reconcile");
  expect(reconcile?.ok).toBe(false);
  expect(causeText(reconcile?.cause)).toContain('frozen task "alpha"');
  expect(causeText(reconcile?.cause)).toContain('frozen task "probe"');
}

function registerPMTurnReconciliationPart1(): void {
  it("ends the iteration after a second validation failure", async () => {
    const { root, runtime, fake, planPath } = await setup();
    try {
      fake.script((req, ctx) => {
        fs.writeFileSync(
          path.join(runtime.store.tasksDir, "b.md"),
          simpleTask("b", "b.txt", { deps: ["missing"] }),
          "utf8",
        );
        ctx.writeOutcome({
          status: "done",
          summary: "filed b",
          concerns: [],
          forward: [],
        });
        return fakeTurnResult(req);
      });
      fake.script((req, ctx) => {
        fs.writeFileSync(
          path.join(runtime.store.tasksDir, "c.md"),
          simpleTask("c", "c.txt", { deps: ["c"] }),
          "utf8",
        );
        ctx.writeOutcome({
          status: "done",
          summary: "filed c",
          concerns: [],
          forward: [],
        });
        return fakeTurnResult(req);
      });

      const result = await runPm(runtime, {
        iteration: 1,
        state: derive([], []),
        cwd: root,
      });
      expect(result.status).toBe("exhausted");
      expect(result.rungs).toHaveLength(2);
      expect(fake.calls).toHaveLength(2);
      expect(fake.calls[1]!.prompt).toContain(
        'depends on missing task "missing"',
      );
      const records = await runtime.store.listRecords();
      expect(
        records.some((r) => r.step === "pm-validate" && r.ok === false),
      ).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerPMTurnReconciliationPart2(): void {
  it("restores a merged task and a finished spike the PM touched and reports both", async () => {
    const { root, runtime, fake, planPath } = await setup();
    try {
      const scope1 = await restoresMergedTaskFinishedSpikePMPart1(runtime);
      await restoresMergedTaskFinishedSpikePMPart2(runtime, fake, scope1);
      await restoresMergedTaskFinishedSpikePMPart3(runtime, root, scope1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("marks merged and finished tasks frozen and read-only while pending tasks stay editable", async () => {
    const { root, runtime, fake, planPath } = await setup();
    try {
      const scope1 = await marksMergedFinishedTasksFrozenReadPart1(
        planPath,
        runtime,
      );
      const scope2 = await marksMergedFinishedTasksFrozenReadPart2(
        runtime,
        fake,
        root,
        scope1,
      );
      await marksMergedFinishedTasksFrozenReadPart3(runtime, scope2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

describe("PM turn reconciliation", () => {
  registerPMTurnReconciliationPart1();

  registerPMTurnReconciliationPart2();
});
