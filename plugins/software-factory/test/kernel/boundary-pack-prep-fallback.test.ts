import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { git } from "../../src/core/git/exec.js";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import {
  type ContextPackInput,
  contextDataRelPath,
  contextPackRelPath,
  PACK_BRIEF_SUMMARY_MAX,
  renderContextPack,
} from "../../src/kernel/context-pack.js";
import { SECTION_HEADINGS } from "../../src/kernel/context-pack/append.js";
import { derive } from "../../src/kernel/derive.js";
import { PACK_PREP_STEP } from "../../src/kernel/pack-prep.js";
import { scriptMeta } from "../../src/kernel/record.js";
import { spikeReportPath } from "../../src/kernel/spike-report.js";
import { causeText, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask as writeRuntimeTask,
} from "./s2-helpers.js";

const PLAN = `# Milestone 1

## later
Nothing to dispatch yet; the plan is the architect's.
`;

const TEST_ALIASES = {
  architect: { harness: "fake", model: "fake-architect" },
  pm: { harness: "fake", model: "fake-pm" },
  digest: { harness: "fake", model: "fake-digest" },
  implementer: { harness: "fake", model: "fake-impl" },
  researcher: { harness: "fake", model: "fake-research" },
  reviewer: { harness: "fake", model: "fake-review" },
  qa: { harness: "fake", model: "fake-qa" },
  steward: { harness: "fake", model: "fake-steward" },
  "plan-checker": { harness: "fake", model: "fake-check" },
  intent: { harness: "fake", model: "fake-intent" },
  "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
  "pack-preparer": {
    harness: "fake",
    model: "fake-pack-prep",
    fallbacks: [{ alias: "pack-preparer-backup" }],
  },
  "pack-preparer-backup": {
    harness: "fake",
    model: "fake-pack-prep-backup",
  },
};

function scriptBoundaryFollowThrough(
  harness: FakeHarness,
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
) {
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
}

function scriptFallbackPreparer(harness: FakeHarness) {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({ status: "failed", summary: "primary failed" }),
      );
      return fakeTurnResult(req);
    },
    {
      when: (req) =>
        fakeTurnIdentity(req).step === PACK_PREP_STEP &&
        req.model.id === "fake-pack-prep",
    },
  );

  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "backup selected the briefs",
          packBriefs: [
            { section: "codeMap", summary: "only src/kernel changed" },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    {
      when: (req) =>
        fakeTurnIdentity(req).step === PACK_PREP_STEP &&
        req.model.id === "fake-pack-prep-backup",
    },
  );
}

async function verifyAliasFallbackRecords(
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
) {
  const records = await runtime.store.listRecords();
  const prepRecords = records.filter((r) => r.step === PACK_PREP_STEP);
  expect(prepRecords).toHaveLength(2);
  expect(prepRecords[0]?.alias).toBe("pack-preparer");
  expect(prepRecords[0]?.round).toBe(1);
  expect(prepRecords[1]?.alias).toBe("pack-preparer-backup");
  expect(prepRecords[1]?.round).toBe(2);
  expect(prepRecords[1]?.outcome?.status).toBe("done");
  expect(records.some((r) => r.step === "packprep-fallback")).toBe(false);
}

async function runFallbackSuccessTest() {
  const { repo, goal } = setupFlowRepo({ aliases: TEST_ALIASES });
  try {
    const harness = new FakeHarness({ id: "fake" });
    const runtime = await makeRuntime(repo, goal, { fake: harness });
    await writeRuntimeTask(runtime, task("alpha"));
    fs.writeFileSync(path.join(runtime.store.goalDir, "plan.md"), PLAN, "utf8");
    const packRel = contextPackRelPath(2);

    scriptFallbackPreparer(harness);
    scriptBoundaryFollowThrough(harness, runtime);

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
    expect(pack).toContain("- only src/kernel changed");
    expect(pack).toContain(
      `- full: ${path.join(runtime.store.goalDir, contextDataRelPath(2))} (#codeMap)`,
    );
    expect(pack).toContain("## Task status");
    await verifyAliasFallbackRecords(runtime);
  } finally {
    cleanupFlowRepo(repo);
  }
}

function scriptAllPreparersFail(harness: FakeHarness) {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({ status: "failed", summary: "primary failed" }),
      );
      return fakeTurnResult(req);
    },
    {
      when: (req) =>
        fakeTurnIdentity(req).step === PACK_PREP_STEP &&
        req.model.id === "fake-pack-prep",
    },
  );

  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ status: "failed", summary: "backup failed" }));
      return fakeTurnResult(req);
    },
    {
      when: (req) =>
        fakeTurnIdentity(req).step === PACK_PREP_STEP &&
        req.model.id === "fake-pack-prep-backup",
    },
  );
}

async function verifyAllPreparersFail(
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
) {
  const boundary = await runBoundary(runtime, {
    relaunch: false,
    iteration: 2,
  });
  expect(boundary.decision).toBe("continue");
  const pack = fs.readFileSync(
    path.join(runtime.store.goalDir, contextPackRelPath(2)),
    "utf8",
  );
  expect(pack).toContain("# Context pack — goal demo, iteration 2");
  expect(pack).toContain("| alpha |");

  const records = await runtime.store.listRecords();
  const prepRecords = records.filter((r) => r.step === PACK_PREP_STEP);
  expect(prepRecords).toHaveLength(2);
  const fallback = records.find((r) => r.step === "packprep-fallback");
  expect(fallback?.ok).toBe(false);
  expect(fallback?.launchKind).toBe("glitch");
  expect(causeText(fallback?.cause)).toContain("backup failed");
}

async function runAllAliasesFailTest() {
  const { repo, goal } = setupFlowRepo({ aliases: TEST_ALIASES });
  try {
    const harness = new FakeHarness({ id: "fake" });
    const runtime = await makeRuntime(repo, goal, { fake: harness });
    await writeRuntimeTask(runtime, task("alpha"));
    fs.writeFileSync(path.join(runtime.store.goalDir, "plan.md"), PLAN, "utf8");

    scriptAllPreparersFail(harness);
    scriptBoundaryFollowThrough(harness, runtime);
    await verifyAllPreparersFail(runtime);
  } finally {
    cleanupFlowRepo(repo);
  }
}

async function createLargeRepoAndSpike(
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
) {
  const largeRepoFilePath = path.join(
    runtime.paths.goalCheckout,
    "large-repo-file.txt",
  );
  const largeRepoBody =
    "OVERSIZED_REPO_FILE_LINE_BODY_CONTENT_".repeat(20) + "\n";
  fs.writeFileSync(largeRepoFilePath, largeRepoBody.repeat(200), "utf8");

  const spikeTask = task("oversized-spike", { kind: "spike", flow: "spike" });
  await writeRuntimeTask(runtime, spikeTask);
  const spikeReportRel = spikeReportPath("oversized-spike");
  const largeSpikeReportBody =
    "# Oversized Spike Report Finding\n\n" +
    "DETAILED_REPORT_BODY_TEXT_LINE_\n".repeat(400);
  const spikeReportAbs = path.join(runtime.paths.goalCheckout, spikeReportRel);
  fs.mkdirSync(path.dirname(spikeReportAbs), { recursive: true });
  fs.writeFileSync(spikeReportAbs, largeSpikeReportBody, "utf8");

  await git(runtime.paths.goalCheckout, ["add", "."]);
  await git(runtime.paths.goalCheckout, ["commit", "-m", "add large files"]);
  const headRes = await git(runtime.paths.goalCheckout, ["rev-parse", "HEAD"]);
  const commitHash = headRes.stdout.trim();

  await runtime.store.appendRecord(
    scriptMeta(1, "finish", { slug: "oversized-spike" }),
    { ok: true, report: `${commitHash}:${spikeReportRel}` },
  );
  return { spikeReportRel, largeSpikeReportBody };
}

function verifyScriptPackContent(
  pack: string,
  spikeReportRel: string,
  largeSpikeReportBody: string,
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
) {
  expect(pack).toContain("## Spike findings");
  const byteCount = Buffer.byteLength(largeSpikeReportBody.trim(), "utf8");
  expect(pack).toContain(
    `- oversized-spike: ${spikeReportRel} (${byteCount} bytes)`,
  );
  expect(pack).not.toContain("DETAILED_REPORT_BODY_TEXT_LINE_");
  expect(pack).not.toContain("OVERSIZED_REPO_FILE_LINE_BODY_CONTENT_");
  expect(pack).toContain("## Paths");
  expect(pack).toContain("## Task status");
  expect(pack).toContain("| oversized-spike |");
  expect(pack).toContain("## Task files");
  expect(pack).toContain(
    `- oversized-spike: ${runtime.store.tasks.dir}/oversized-spike.md`,
  );
}

async function runNoPastedBodiesTest() {
  const { repo, goal } = setupFlowRepo();
  try {
    const harness = new FakeHarness({ id: "fake" });
    const runtime = await makeRuntime(repo, goal, { fake: harness });
    const { spikeReportRel, largeSpikeReportBody } =
      await createLargeRepoAndSpike(runtime);

    fs.writeFileSync(path.join(runtime.store.goalDir, "plan.md"), PLAN, "utf8");

    harness.script(
      (req, ctx) => {
        ctx.writeOutcome(
          outcome({ status: "failed", summary: "failed to prep" }),
        );
        return fakeTurnResult(req);
      },
      { when: whenTurn({ step: PACK_PREP_STEP }) },
    );
    scriptBoundaryFollowThrough(harness, runtime);

    const boundary = await runBoundary(runtime, {
      relaunch: false,
      iteration: 2,
    });
    expect(boundary.decision).toBe("continue");

    const pack = fs.readFileSync(
      path.join(runtime.store.goalDir, contextPackRelPath(2)),
      "utf8",
    );
    verifyScriptPackContent(
      pack,
      spikeReportRel,
      largeSpikeReportBody,
      runtime,
    );
  } finally {
    cleanupFlowRepo(repo);
  }
}

function testEmptyDerivedStatusPack() {
  const pack = renderContextPack({
    goal: "empty-status-demo",
    iteration: 1,
    intentPath: "/goal/intent.md",
    planPath: "/goal/plan.md",
    checkout: "/wt/empty",
    integrationBranch: "factory/empty",
    headHash: "0123456789abcdef",
    recordsDir: "/goal/records",
    tasksDir: "/goal/tasks",
    tasks: [],
    state: derive([], []),
    steers: [],
    setup: [],
    gates: [],
    forwarded: [],
    debts: [],
  });
  expect(pack).toContain("- intent: /goal/intent.md");
  expect(pack).toContain("- plan (architect edits this): /goal/plan.md");
  expect(pack).toContain("- goal checkout: /wt/empty");
  expect(pack).toContain("- records: /goal/records");
  expect(pack).toContain("## Task status");
  expect(pack).toContain("| (none yet) |");
  expect(pack).toContain("## Debt register");
  expect(pack).toContain("- none open");
  expect(pack).toContain("## Open records");
  expect(pack).toContain("- none");
}

/** A pack input with every briefable section populated. */
function briefPackInput(): ContextPackInput {
  const tasks = [task("alpha")];
  return {
    goal: "brief-demo",
    iteration: 2,
    intentPath: "/goal/intent.md",
    planPath: "/goal/plan.md",
    checkout: "/wt/demo",
    integrationBranch: "factory/demo",
    headHash: "0123456789abcdef",
    recordsDir: "/goal/records",
    tasksDir: "/goal/tasks",
    dataPath: "/goal/iterations/2/context-data.json",
    tasks,
    state: derive(tasks, []),
    steers: [],
    setup: [],
    gates: [],
    forwarded: [],
    debts: [],
    planCheck: {
      iteration: 1,
      verdict: "architect",
      evidence: [
        { item: "alpha", status: "missing", evidence: "no task file" },
      ],
    },
    codeMap: ["src/"],
    pmAnswers: ["- s1: answered"],
  };
}

/** The pack split at section boundaries, so a brief can be compared block by block. */
function sectionBlocks(pack: string): Map<string, string> {
  return new Map(
    pack.split("\n\n").map((block) => [block.split("\n")[0]!, block]),
  );
}

describe("pack briefs", () => {
  it("renders every section a brief does not name exactly as the fallback", () => {
    const input = briefPackInput();
    const fallback = sectionBlocks(renderContextPack(input));
    const briefed = sectionBlocks(
      renderContextPack({
        ...input,
        briefs: [
          { section: "planCheck", summary: "stale check, no new evidence" },
        ],
      }),
    );
    expect([...briefed.keys()]).toEqual([...fallback.keys()]);
    for (const [title, block] of fallback) {
      if (title === SECTION_HEADINGS.planCheck) continue;
      expect(briefed.get(title)).toBe(block);
    }
    expect(briefed.get(SECTION_HEADINGS.planCheck)).toContain(
      "- stale check, no new evidence",
    );
    expect(fallback.get(SECTION_HEADINGS.planCheck)).toContain(
      "- alpha (missing): no task file",
    );
  });

  it("caps a long brief but never drops its pointer", () => {
    const input = briefPackInput();
    const summary = "detail ".repeat(60).trim();
    const pack = renderContextPack({
      ...input,
      briefs: [{ section: "planCheck", summary }],
    });
    expect(pack).toContain(`- full: ${input.dataPath} (#planCheck)`);
    const briefLine = pack
      .split("\n")
      .find((line) => line.startsWith("- detail"));
    expect(briefLine?.endsWith("…")).toBe(true);
    expect(briefLine!.length).toBeLessThanOrEqual(PACK_BRIEF_SUMMARY_MAX + 2);
    expect(pack).not.toContain(summary);
  });
});

describe("pack brief pointers", () => {
  it("leaves an absent section absent rather than briefing nothing", () => {
    const input = briefPackInput();
    const pack = renderContextPack({
      ...input,
      planCheck: undefined,
      briefs: [{ section: "planCheck", summary: "nothing to say" }],
    });
    expect(pack).not.toContain(SECTION_HEADINGS.planCheck);
    expect(pack).not.toContain("(#planCheck)");
  });

  it("refuses a brief when the input names no pointer", () => {
    const input = briefPackInput();
    delete input.dataPath;
    expect(() =>
      renderContextPack({
        ...input,
        briefs: [{ section: "planCheck", summary: "no pointer" }],
      }),
    ).toThrow("needs the status data path");
  });
});

describe("pack-preparer fallback chain and single script index", () => {
  it(
    "tries fallback chain when primary fails and keeps backup pack",
    () => runFallbackSuccessTest(),
    90_000,
  );

  it(
    "renders every section whole when every preparer fails",
    () => runAllAliasesFailTest(),
    90_000,
  );

  it(
    "asserts script pack carries no pasted bodies for large files",
    () => runNoPastedBodiesTest(),
    90_000,
  );

  it("renders pointers and zero counts when pack has no derived status", () =>
    testEmptyDerivedStatusPack());
});
