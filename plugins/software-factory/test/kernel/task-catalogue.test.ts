import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { contextPackRelPath } from "../../src/kernel/context-pack.js";
import { loadConfigs } from "../../src/kernel/config.js";
import { derive } from "../../src/kernel/derive.js";
import { runGoal } from "../../src/kernel/launch.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type { State } from "../../src/kernel/types.js";
import { testPriceSource } from "../helpers/price-source.js";
import { withKernelRoleFallbacks } from "./fake-defaults.js";
import {
  cleanup,
  type E2EGoal,
  expectLaunch,
  makeGoal,
  outcome,
  stateOf,
  writeTask,
} from "./e2e-helpers.js";

const PLAN = "# Plan\n\n## probe\nAnswer the probe question.\n";

/** A plan whose headings match the batch the PM files below. */
const BATCH_PLAN = [
  "# Plan",
  "",
  "## alpha",
  "Deliver alpha.",
  "",
  "## gate",
  "Promote the batch.",
  "",
  "## follow",
  "Follow the promotion.",
  "",
].join("\n");

/** One task file: a typed task with its dependencies and a done-when. */
function typedDependent(
  slug: string,
  type: string,
  deps: string[],
  done: string,
): string {
  return [
    "---",
    `slug: ${slug}`,
    `title: ${slug}`,
    `type: ${type}`,
    `deps: [${deps.join(", ")}]`,
    "source: plan",
    "---",
    "",
    `Deliver ${slug}.`,
    "",
    `Done when: ${done}`,
    "",
  ].join("\n");
}

/** Goal state derived with the repo's configured task types, so typed files parse. */
async function typedStateOf(goal: E2EGoal): Promise<State> {
  const configs = loadConfigs(goal.repo.dir);
  const store = createFolderStore(
    goal.goalDir,
    undefined,
    configs.process.taskTypes,
  );
  return derive(
    await store.listTasks(),
    await store.listRecords(),
    configs.process.flows,
  );
}

function typedTask(
  slug: string,
  type: string,
  body = "Answer the question.\n\nDone when: the answer is delivered.",
): string {
  return [
    "---",
    `slug: ${slug}`,
    `title: ${slug}`,
    `type: ${type}`,
    "deps: []",
    "source: front",
    "---",
    "",
    body,
    "",
  ].join("\n");
}

function outsideFile(name: string): { dir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-nogit-"));
  return { dir, file: path.join(dir, name) };
}

function architect(
  goal: E2EGoal,
  decision: "continue" | "done",
): FakeTurnHandler {
  return (req, ctx) => {
    expect(req.prompt).toContain("You are the architect");
    if (decision === "continue")
      fs.appendFileSync(goal.planPath, `\n${PLAN}`, "utf8");
    ctx.writeOutcome(outcome({ summary: `architect ${decision}`, decision }));
    return fakeTurnResult(req);
  };
}

function pmWrites(goal: E2EGoal, task: string): FakeTurnHandler {
  return (req, ctx) => {
    expect(req.prompt).toContain("You are the PM");
    writeTask(goal.goalDir, task);
    ctx.writeOutcome(outcome({ summary: "filed the task" }));
    return fakeTurnResult(req);
  };
}

function deliversOutside(
  file: string,
  text: string,
  summary: string,
): FakeTurnHandler {
  return (req, ctx) => {
    expect(req.prompt).toContain("- spike report: ``");
    expect(req.prompt).not.toContain("Commit the report at");
    fs.writeFileSync(file, text);
    ctx.writeOutcome(outcome({ summary }));
    return fakeTurnResult(req);
  };
}

function approve(): FakeTurnHandler {
  return (req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  };
}

async function recordsOf(goal: E2EGoal) {
  return createFolderStore(goal.goalDir, undefined, {}).listRecords();
}

async function runFactFinder(goal: E2EGoal, file: string): Promise<void> {
  const harness = new FakeHarness({ id: "fake" });
  harness.script(architect(goal, "continue"));
  harness.script(pmWrites(goal, typedTask("probe", "fact-finder")));
  harness.script(
    deliversOutside(file, "# Finding\nThe probe answer.\n", "delivered"),
  );
  harness.script(architect(goal, "done"));
  await expectLaunch(0, goal.repo, harness, 2);
}

async function expectFactFinder(goal: E2EGoal, file: string): Promise<void> {
  const state = await stateOf(goal.goalDir);
  expect(state.tasks.probe!.status).toBe("finished");
  expect(fs.readFileSync(file, "utf8")).toBe("# Finding\nThe probe answer.\n");
  expect(file.startsWith(goal.repo.dir + path.sep)).toBe(false);
  const records = await recordsOf(goal);
  expect(
    records.filter((r) => r.slug === "probe" && r.step === "merge"),
  ).toEqual([]);
  const finish = records.find((r) => r.slug === "probe" && r.step === "finish");
  expect(finish?.report).toBeUndefined();
}

function registerFactFinder(): void {
  it("runs one-agent fact finders that deliver outside git and never merge", async () => {
    const goal = makeGoal();
    const delivered = outsideFile("finding.md");
    try {
      const mainTip = goal.repo.git(["rev-parse", "main"]).stdout;
      await runFactFinder(goal, delivered.file);
      await expectFactFinder(goal, delivered.file);
      expect(goal.repo.git(["rev-parse", "factory/demo"]).stdout).toBe(mainTip);
    } finally {
      fs.rmSync(delivered.dir, { recursive: true, force: true });
      cleanup(goal);
    }
  }, 90_000);
}

async function runPoc(goal: E2EGoal, file: string): Promise<void> {
  const harness = new FakeHarness({ id: "fake" });
  harness.script(architect(goal, "continue"));
  harness.script(pmWrites(goal, typedTask("probe", "poc")));
  harness.script(deliversOutside(file, "proof of concept\n", "built the POC"));
  harness.script(approve());
  harness.script(architect(goal, "done"));
  await expectLaunch(0, goal.repo, harness, 2);
}

async function expectPoc(goal: E2EGoal, file: string): Promise<void> {
  const records = await recordsOf(goal);
  expect((await stateOf(goal.goalDir)).tasks.probe!.status).toBe("finished");
  expect(
    records
      .filter((r) => r.slug === "probe" && r.actor === "agent")
      .map((r) => r.step),
  ).toEqual(["implement", "review"]);
  expect(records.some((r) => r.slug === "probe" && r.step === "finish")).toBe(
    true,
  );
  expect(
    records.filter((r) => r.slug === "probe" && r.step === "merge"),
  ).toEqual([]);
  expect(fs.readFileSync(file, "utf8")).toBe("proof of concept\n");
}

function registerPoc(): void {
  it("runs a nogit PoC through its implementer and reviewer without a merge", async () => {
    const goal = makeGoal();
    const delivered = outsideFile("poc.txt");
    try {
      await runPoc(goal, delivered.file);
      await expectPoc(goal, delivered.file);
    } finally {
      fs.rmSync(delivered.dir, { recursive: true, force: true });
      cleanup(goal);
    }
  }, 90_000);
}

function scriptComputerUse(goal: E2EGoal, packPath: string): FakeHarness {
  const harness = new FakeHarness({ id: "fake" });
  harness.script((req, ctx) => {
    expect(req.prompt).toContain("You are the front");
    fs.mkdirSync(path.dirname(packPath), { recursive: true });
    fs.writeFileSync(packPath, "# Front pack\n", "utf8");
    fs.writeFileSync(
      path.join(goal.goalDir, "class.yaml"),
      "class: task\nslug: page\n",
      "utf8",
    );
    writeTask(goal.goalDir, typedTask("page", "computer-use"));
    ctx.writeOutcome(outcome({ summary: "classified the browser delivery" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "page.txt"), "page\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "built the page" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    expect(req.prompt).toContain("## Browser acceptance");
    ctx.writeOutcome(
      outcome({
        summary: "browser path works",
        qa: { verdict: "accept", findings: [] },
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({
        summary: "code QA accepts",
        qa: { verdict: "accept", findings: [] },
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script(approve());
  return harness;
}

async function expectComputerUse(goal: E2EGoal): Promise<void> {
  const records = await recordsOf(goal);
  expect((await stateOf(goal.goalDir)).tasks.page!.status).toBe("merged");
  expect(
    records
      .filter((r) => r.slug === "page" && r.actor === "agent")
      .map((r) => r.step),
  ).toEqual(["implement", "browser", "qa", "review"]);
  expect(
    records.find((r) => r.slug === "page" && r.step === "browser")?.alias,
  ).toBe("qa");
  expect(
    records.some(
      (r) => r.slug === "page" && r.step === "merge" && r.ok === true,
    ),
  ).toBe(true);
}

function registerComputerUse(): void {
  it("runs computer-use through browser acceptance before QA and review", async () => {
    const goal = makeGoal({ classYaml: null });
    try {
      const packPath = path.join(goal.goalDir, contextPackRelPath(1));
      const harness = scriptComputerUse(goal, packPath);
      await expectLaunch(0, goal.repo, harness, 3);
      await expectComputerUse(goal);
    } finally {
      cleanup(goal);
    }
  }, 90_000);
}

/** The architect's plan edit: the batch the first launch derives and lands. */
function batchArchitect(goal: E2EGoal): FakeTurnHandler {
  return (req, ctx) => {
    expect(req.prompt).toContain("You are the architect");
    fs.appendFileSync(goal.planPath, BATCH_PLAN, "utf8");
    ctx.writeOutcome(
      outcome({ summary: "planned the batch", decision: "continue" }),
    );
    return fakeTurnResult(req);
  };
}

/** The PM files the predecessor, the promote barrier and the dependent work. */
function batchTasks(goal: E2EGoal): FakeTurnHandler {
  return (req, ctx) => {
    expect(req.prompt).toContain("You are the PM");
    writeTask(
      goal.goalDir,
      typedDependent("alpha", "development", [], "alpha works"),
    );
    writeTask(
      goal.goalDir,
      typedDependent(
        "gate",
        "promote",
        ["alpha"],
        "the operator promoted the build",
      ),
    );
    writeTask(
      goal.goalDir,
      typedDependent("follow", "development", ["gate"], "follow works"),
    );
    ctx.writeOutcome(outcome({ summary: "filed the batch" }));
    return fakeTurnResult(req);
  };
}

/** A development implement turn: write the task's file and report done. */
function implementsTask(slug: string): FakeTurnHandler {
  return (req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, `${slug}.txt`), `${slug}\n`, "utf8");
    ctx.writeOutcome(outcome({ summary: `${slug} implemented` }));
    return fakeTurnResult(req);
  };
}

function launchBatch(goal: E2EGoal, harness: FakeHarness) {
  return runGoal({
    repo: goal.repo.dir,
    goal: "demo",
    iterations: 2,
    harnesses: { fake: withKernelRoleFallbacks(harness) },
    priceSource: testPriceSource(goal.repo.dir),
  });
}

async function stopsAtPromoteBarrier(goal: E2EGoal): Promise<void> {
  const harness = new FakeHarness({ id: "fake" });
  harness.script(batchArchitect(goal));
  harness.script(batchTasks(goal));
  harness.script(implementsTask("alpha"));
  harness.script(approve());
  const result = await launchBatch(goal, harness);
  expect(result.stop).toBe("promote");
  expect(result.cause).toContain("promote task gate");
  expect(result.cause).toContain("awaits promotion");
  const state = await typedStateOf(goal);
  expect(state.tasks.alpha!.status).toBe("merged");
  expect(state.tasks.gate!.status).toBe("finished");
  expect(state.tasks.follow!.status).toBe("ready");
  // The barrier runs no flow turn of its own.
  expect(
    (await recordsOf(goal)).filter(
      (r) => r.slug === "gate" && r.actor === "agent",
    ),
  ).toEqual([]);
}

async function continuesAfterPromotion(goal: E2EGoal): Promise<void> {
  const harness = new FakeHarness({ id: "fake" });
  // The relaunch resumes the interrupted iteration: the dependent work runs
  // first, then the next boundary closes the goal.
  harness.script(implementsTask("follow"));
  harness.script(approve());
  harness.script((req, ctx) => {
    expect(req.prompt).toContain("You are the architect");
    ctx.writeOutcome(outcome({ summary: "batch complete", decision: "done" }));
    return fakeTurnResult(req);
  });
  const result = await launchBatch(goal, harness);
  expect(result.stop).toBe("done");
  const state = await typedStateOf(goal);
  expect(state.tasks.follow!.status).toBe("merged");
}

function registerPromote(): void {
  it("stops the launch at a promote task and a relaunch after promotion continues", async () => {
    const goal = makeGoal();
    try {
      await stopsAtPromoteBarrier(goal);
      await continuesAfterPromotion(goal);
    } finally {
      cleanup(goal);
    }
  }, 120_000);
}

describe("task catalogue", () => {
  registerFactFinder();

  registerPoc();

  registerComputerUse();

  registerPromote();
});
