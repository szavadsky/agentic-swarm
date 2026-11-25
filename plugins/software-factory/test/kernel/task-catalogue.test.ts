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
import { createFolderStore } from "../../src/kernel/store.js";
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

describe("task catalogue", () => {
  registerFactFinder();

  registerPoc();

  registerComputerUse();
});
