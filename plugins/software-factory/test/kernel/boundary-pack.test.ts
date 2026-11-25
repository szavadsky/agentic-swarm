import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import {
  contextDataRelPath,
  contextPackRelPath,
} from "../../src/kernel/context-pack.js";
import { PACK_PREP_STEP } from "../../src/kernel/pack-prep.js";
import { scriptMeta } from "../../src/kernel/record.js";
import { createFolderStore } from "../../src/kernel/store.js";
import {
  cleanup,
  launch,
  makeGoal,
  outcome,
  scriptDigest,
  simpleTask,
  writePlan,
  writeTask,
} from "./e2e-helpers.js";
import { cause, causeText, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  setupFlowRepo,
  whenTurn,
  writeTask as writeRuntimeTask,
} from "./s2-helpers.js";

const PLAN = `# Milestone 1

## later
Nothing to dispatch yet; the plan is the architect's.
`;

async function listsStartedWithoutEndRecordsAsPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  fs.writeFileSync(path.join(runtime.store.goalDir, "plan.md"), PLAN, "utf8");
  const closed = await runtime.store.startRecord({
    iteration: 1,
    slug: "alpha",
    step: "implement",
    round: 1,
    actor: "agent",
  });
  await closed.finish({ ok: true });
  const open = await runtime.store.startRecord({
    iteration: 1,
    slug: "beta",
    step: "implement",
    round: 1,
    actor: "agent",
  });
  harness.script((req, ctx) => {
    fs.appendFileSync(
      path.join(runtime.store.goalDir, "plan.md"),
      "\n## architect edit\n",
      "utf8",
    );
    ctx.writeOutcome(
      outcome({ summary: "planned nothing yet", decision: "continue" }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
    return fakeTurnResult(req);
  });

  const runPath = runtime.configs.files?.run;
  expect(runPath).toBe(path.join(repo.dir, ".factory/run.yaml"));

  return { runtime, closed, open, runPath };
}

async function listsStartedWithoutEndRecordsAsPart2(
  scope: Awaited<ReturnType<typeof listsStartedWithoutEndRecordsAsPart1>>,
) {
  const { runtime, runPath, open, closed } = scope;
  const boundary = await runBoundary(runtime, {
    relaunch: false,
    runConfigPath: runPath,
  });
  expect(boundary.decision).toBe("continue");
  const packRel = contextPackRelPath(boundary.iteration);
  expect(boundary.packPath).toBe(packRel);
  const pack = fs.readFileSync(
    path.join(runtime.store.goalDir, packRel),
    "utf8",
  );
  expect(pack).toContain(`- ${open.dir}`);
  expect(pack).not.toContain(closed.dir);
  expect(pack).toContain(`- run config: ${runPath}`);
}

async function neverTruncatesStatusTableHundredPart1(
  goal: ReturnType<typeof makeGoal>,
) {
  const store = createFolderStore(goal.goalDir, undefined, {});
  const slugs: string[] = [];
  for (let i = 0; i < 100; i++) {
    const slug = `bulk-${String(i).padStart(3, "0")}`;
    slugs.push(slug);
    writeTask(goal.goalDir, simpleTask(slug, `${slug}.txt`));
    await store.appendRecord(scriptMeta(1, "park", { slug }), {
      ok: true,
      cause: cause("seeded terminal for pack size"),
    });
  }
  const harness = new FakeHarness({ id: "fake" });
  scriptDigest(harness, goal.goalDir, 2);
  harness.script((req, ctx) => {
    writePlan(goal.goalDir, PLAN);
    ctx.writeOutcome(
      outcome({ summary: "planned nothing yet", decision: "continue" }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
    return fakeTurnResult(req);
  });

  await launch(goal.repo, harness);

  const records = await createFolderStore(
    goal.goalDir,
    undefined,
    {},
  ).listRecords();
  const architect = records.find((r) => r.step === "architect");
  expect(architect).toBeDefined();
  const pack = fs.readFileSync(
    path.join(goal.goalDir, contextPackRelPath(architect!.iteration)),
    "utf8",
  );
  expect(pack.length).toBeGreaterThan(8000);
  for (const slug of slugs) expect(pack).toContain(`| ${slug} |`);
  expect(pack).toContain(
    `- plan (architect edits this): ${path.join(goal.goalDir, "plan.md")}`,
  );

  return { architect, pack };
}

async function neverTruncatesStatusTableHundredPart2(
  goal: ReturnType<typeof makeGoal>,
  scope: Awaited<ReturnType<typeof neverTruncatesStatusTableHundredPart1>>,
) {
  const { pack, architect } = scope;
  expect(pack).toContain(`- intent: ${path.join(goal.goalDir, "intent.md")}`);
  expect(pack).toContain(
    `- previous-launch digest: ${path.join(goal.goalDir, "iterations/2/digest.md")}`,
  );
  expect(pack).toContain(
    "## Debt register (open debt-kind concerns; own one by citing its id in a plan bullet, or close it with `debtClosed: [{id, reason}]`)\n- none open",
  );
  expect(pack).toContain("## Open records (started, no end)\n- none");
  expect(pack).toContain(
    `- run config: ${path.join(goal.repo.dir, ".factory/run.yaml")}`,
  );
  expect(architect?.packBytes).toBe(Buffer.byteLength(pack, "utf8"));
}

async function fallsBackScriptRenderRecordsGlitchPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeRuntimeTask(runtime, task("alpha"));
  fs.writeFileSync(path.join(runtime.store.goalDir, "plan.md"), PLAN, "utf8");
  const wasteRecord = "records/00001-i1-waste-turn-implement-r1";
  fs.mkdirSync(path.join(runtime.store.goalDir, "iterations/1"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(runtime.store.goalDir, "iterations/1/summary.md"),
    `# Iteration 1 summary\n\n## Waste\n- wasted turns: 1 of 3 agent turns\n- records:\n  - ${wasteRecord}: implementer/implementer (implement r1) — structure: infra — infra: network\n\n## Metrics\n- turns: 1\n`,
    "utf8",
  );
  harness.script(
    (req, ctx) => {
      fs.appendFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "\n## architect edit\n",
        "utf8",
      );
      ctx.writeOutcome(outcome({ summary: "planned", decision: "continue" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "architect" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({ status: "failed", summary: "could not read the data" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: PACK_PREP_STEP }) },
  );

  const boundary = await runBoundary(runtime, {
    relaunch: false,
    iteration: 2,
  });

  return { runtime, wasteRecord, boundary };
}

async function fallsBackScriptRenderRecordsGlitchPart2(
  scope: Awaited<ReturnType<typeof fallsBackScriptRenderRecordsGlitchPart1>>,
) {
  const { boundary, runtime, wasteRecord } = scope;
  expect(boundary.decision).toBe("continue");
  const pack = fs.readFileSync(
    path.join(runtime.store.goalDir, contextPackRelPath(2)),
    "utf8",
  );
  expect(pack).toContain("# Context pack — goal demo, iteration 2");
  expect(pack).toContain("## Task status");
  expect(pack).toContain("| alpha |");
  expect(pack).toContain("## Waste (previous iteration summary)");
  expect(pack).toContain(
    `${wasteRecord}: implementer/implementer (implement r1) — structure: infra — infra: network`,
  );
  const fallback = (await runtime.store.listRecords()).find(
    (record) => record.step === "packprep-fallback",
  );
  expect(fallback?.ok).toBe(false);
  expect(fallback?.launchKind).toBe("glitch");
  expect(causeText(fallback?.cause)).toContain(
    "turn declared failed: could not read the data",
  );
  expect(causeText(fallback?.cause)).toContain(
    "the script render is this iteration's pack",
  );
}

async function hasPreparerReturnBriefsPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeRuntimeTask(runtime, task("alpha"));
  fs.writeFileSync(path.join(runtime.store.goalDir, "plan.md"), PLAN, "utf8");
  const packRel = contextPackRelPath(2);
  const dataRel = contextDataRelPath(2);
  const brief = "the code map names src/kernel only this iteration";
  const divergentPack = "# Prepared pack\n\n## Paths\n- plan: /goal/plan.md\n";
  const wasteRecord = "records/00001-i1-waste-turn-implement-r1";
  fs.mkdirSync(path.join(runtime.store.goalDir, "iterations/1"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(runtime.store.goalDir, "iterations/1/summary.md"),
    `# Iteration 1 summary\n\n## Waste\n- records:\n  - ${wasteRecord}: implementer/implementer (implement r1) — structure: infra — infra: network\n\n## Metrics\n- turns: 1\n`,
    "utf8",
  );
  const state = { prepPrompt: "" };
  harness.script(
    (req, ctx) => {
      state.prepPrompt = req.prompt;
      const data = JSON.parse(
        fs.readFileSync(path.join(runtime.store.goalDir, dataRel), "utf8"),
      );
      expect(data.tasks).toContainEqual(
        expect.objectContaining({ slug: "alpha", status: "ready" }),
      );
      expect(data.paths.previousWaste).toContain(wasteRecord);
      // A pack the preparer writes is never the index: the script overwrites it.
      fs.writeFileSync(
        path.join(runtime.store.goalDir, packRel),
        divergentPack,
        "utf8",
      );
      ctx.writeOutcome(
        outcome({
          summary: "prepared the briefs",
          packBriefs: [{ section: "codeMap", summary: brief }],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: PACK_PREP_STEP }) },
  );

  return { harness, runtime, packRel, dataRel, brief, divergentPack, state };
}

function expectBriefedPack(
  pack: string,
  scope: {
    brief: string;
    dataPath: string;
    divergentPack: string;
    planPath: string;
  },
): void {
  expect(pack).toContain("# Context pack — goal demo, iteration 2");
  expect(pack).toContain("## Task status");
  expect(pack).toContain(`- plan (architect edits this): ${scope.planPath}`);
  expect(pack).toContain(`- ${scope.brief}`);
  expect(pack).toContain(`- full: ${scope.dataPath} (#codeMap)`);
  expect(pack).not.toContain(scope.divergentPack);
}

async function hasPreparerReturnBriefsPart2(
  scope: Awaited<ReturnType<typeof hasPreparerReturnBriefsPart1>>,
) {
  const { harness, runtime, packRel, brief, divergentPack, state, dataRel } =
    scope;
  const dataPath = path.join(runtime.store.goalDir, dataRel);
  const planPath = path.join(runtime.store.goalDir, "plan.md");
  const expected = { brief, dataPath, divergentPack, planPath };
  harness.script(
    (req, ctx) => {
      expectBriefedPack(
        fs.readFileSync(path.join(runtime.store.goalDir, packRel), "utf8"),
        expected,
      );
      fs.appendFileSync(
        path.join(runtime.store.goalDir, "plan.md"),
        "\n## architect edit\n",
        "utf8",
      );
      ctx.writeOutcome(outcome({ summary: "planned", decision: "continue" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "architect" }) },
  );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );

  const boundary = await runBoundary(runtime, {
    relaunch: false,
    iteration: 2,
  });
  expect(boundary.decision).toBe("continue");
  expect(boundary.packPath).toBe(packRel);
  const pack = fs.readFileSync(
    path.join(runtime.store.goalDir, packRel),
    "utf8",
  );
  expectBriefedPack(pack, expected);
  expect(pack).toContain("## Waste (previous iteration summary)");
  expect(state.prepPrompt).toContain("You prepare the context pack");
  expect(state.prepPrompt).toContain(dataPath);
  expect(state.prepPrompt).toContain("packBriefs:");
  expect(state.prepPrompt).not.toContain("context pack to write");
  const records = await runtime.store.listRecords();
  const prep = records.find(
    (record) => record.step === PACK_PREP_STEP && record.actor === "agent",
  );
  expect(prep?.alias).toBe("pack-preparer");

  return { ...scope, records, prep };
}

async function hasPreparerReturnBriefsPart3(
  scope: Awaited<ReturnType<typeof hasPreparerReturnBriefsPart2>>,
) {
  const { prep, records } = scope;
  expect(prep?.outcome?.status).toBe("done");
  expect(records.some((record) => record.step === "packprep-fallback")).toBe(
    false,
  );
}

function registerBoundaryContextPackPart1(): void {
  it("writes the pack where the architect record measures it", async () => {
    const goal = makeGoal();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        writePlan(goal.goalDir, PLAN);
        ctx.writeOutcome(
          outcome({ summary: "planned nothing yet", decision: "continue" }),
        );
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "no tasks to file" }));
        return fakeTurnResult(req);
      });

      await launch(goal.repo, harness);

      const records = await createFolderStore(
        goal.goalDir,
        undefined,
        {},
      ).listRecords();
      const architect = records.find((r) => r.step === "architect");
      expect(architect).toBeDefined();
      const packPath = path.join(goal.goalDir, contextPackRelPath(1));
      const written = fs.readFileSync(packPath);
      expect(written.length).toBeGreaterThan(0);
      expect(architect?.packBytes).toBe(written.length);
      const pack = fs.readFileSync(packPath, "utf8");
      expect(pack).toContain(
        `- run config: ${path.join(goal.repo.dir, ".factory/run.yaml")}`,
      );
      expect(pack).toContain("## Open records (started, no end)\n- none");
      // The first iteration's pack is the script render, never a preparer turn.
      expect(
        harness.calls.some(
          (call) => fakeTurnIdentity(call).step === PACK_PREP_STEP,
        ),
      ).toBe(false);
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

function registerBoundaryContextPackPart2(): void {
  it("renders the index the preparer briefed from the full status data", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const scope1 = await hasPreparerReturnBriefsPart1(repo, goal);
      const scope2 = await hasPreparerReturnBriefsPart2(scope1);
      await hasPreparerReturnBriefsPart3(scope2);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("falls back to the script render and records a glitch when the preparer fails", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const scope1 = await fallsBackScriptRenderRecordsGlitchPart1(repo, goal);
      await fallsBackScriptRenderRecordsGlitchPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);

  it("never truncates the status table with a hundred parked tasks", async () => {
    const goal = makeGoal();
    try {
      const scope1 = await neverTruncatesStatusTableHundredPart1(goal);
      await neverTruncatesStatusTableHundredPart2(goal, scope1);
    } finally {
      cleanup(goal);
    }
  }, 90_000);

  it("lists started-without-end records as open and names the run config", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const scope1 = await listsStartedWithoutEndRecordsAsPart1(repo, goal);
      await listsStartedWithoutEndRecordsAsPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 90_000);
}

describe("boundary context pack", () => {
  registerBoundaryContextPackPart1();

  registerBoundaryContextPackPart2();
});
