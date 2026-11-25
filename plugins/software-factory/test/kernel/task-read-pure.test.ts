import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createFolderStore } from "../../src/kernel/store.js";
import { runGoal } from "../../src/kernel/launch.js";
import { cleanup, makeGoal, outcome } from "./e2e-helpers.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { withKernelRoleFallbacks } from "./fake-defaults.js";
import { testPriceSource } from "../helpers/price-source.js";

describe("task read pure", () => {
  registerTaskReadPurePart1();
  registerTaskReadPurePart2();
  registerTaskReadPurePart3();
  registerTaskReadPurePart4();
});

async function sweepTasksQuarantinesMalformedPart1(
  goal: ReturnType<typeof makeGoal>,
) {
  fs.mkdirSync(goal.tasksDir, { recursive: true });
  fs.writeFileSync(
    path.join(goal.tasksDir, "malformed.md"),
    "broken\n",
    "utf8",
  );
  // Valid task to prevent preflight refusal
  fs.writeFileSync(
    path.join(goal.tasksDir, "valid.md"),
    "---\nslug: valid\ntitle: Valid\ntype: test-type\n---\nDone when: test.\n",
    "utf8",
  );
  // Unconfigured type, should remain untouched
  fs.writeFileSync(
    path.join(goal.tasksDir, "unconfigured.md"),
    "---\nslug: unconfigured\ntitle: Unconfigured\ntype: unknown\n---\nDone when: test.\n",
    "utf8",
  );

  const harness = withKernelRoleFallbacks(new FakeHarness({ id: "fake" }));
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({
        summary: "the plan needs nothing yet",
        decision: "done",
      }),
    );
    return fakeTurnResult(req);
  });

  await runGoal({
    repo: goal.repo.dir,
    goal: "demo",
    iterations: 1,
    harnesses: { fake: harness },
    baseGates: false,
    priceSource: testPriceSource(goal.repo.dir),
  });

  const quarantined = path.join(goal.tasksDir, "quarantine", "malformed.md");
  expect(fs.existsSync(quarantined)).toBe(true);
}

async function sweepTasksQuarantinesMalformedPart2(
  goal: ReturnType<typeof makeGoal>,
) {
  expect(fs.existsSync(path.join(goal.tasksDir, "unconfigured.md"))).toBe(true);

  const records = await createFolderStore(
    goal.goalDir,
    undefined,
    {},
  ).listRecords();
  const quarantineRecord = records.find((r) => r.step === "task-quarantine");
  expect(quarantineRecord).toBeDefined();
  expect(quarantineRecord?.iteration).toBeGreaterThanOrEqual(1);
}

function registerTaskReadPurePart1(): void {
  it("listTasks is pure and does not write", async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "factory-task-read-pure-"),
    );
    try {
      const store = createFolderStore(path.join(root, "goal"), undefined, {});
      await store.ensureLayout();

      // Create unconfigured type task
      fs.writeFileSync(
        path.join(store.tasksDir, "unconfigured.md"),
        "---\nslug: unconfigured\ntitle: Unconfigured\ntype: unknown\n---\nDone when: test.\n",
        "utf8",
      );

      // Create malformed task
      fs.writeFileSync(
        path.join(store.tasksDir, "malformed.md"),
        "broken\n",
        "utf8",
      );

      const beforeFiles = fs.readdirSync(store.tasksDir, { recursive: true });

      // This should NOT write anything
      const tasks = await store.listTasks();

      const afterFiles = fs.readdirSync(store.tasksDir, { recursive: true });

      // Verify no quarantine directory created, no new files
      expect(afterFiles).toEqual(beforeFiles);

      // Verify records are empty
      expect(await store.listRecords()).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerTaskReadPurePart2(): void {
  it("scanTaskFindings identifies unconfigured and malformed tasks", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-task-scan-"));
    try {
      const store = createFolderStore(path.join(root, "goal"), undefined, {});
      await store.ensureLayout();

      // Create unconfigured type task
      fs.writeFileSync(
        path.join(store.tasksDir, "unconfigured.md"),
        "---\nslug: unconfigured\ntitle: Unconfigured\ntype: unknown\n---\nDone when: test.\n",
        "utf8",
      );

      // Create malformed task
      fs.writeFileSync(
        path.join(store.tasksDir, "malformed.md"),
        "broken\n",
        "utf8",
      );

      const findings = await store.scanTaskFindings();
      expect(findings).toHaveLength(2);
      expect(findings.find((f) => f.slug === "unconfigured")?.kind).toBe(
        "unconfigured-type",
      );
      expect(findings.find((f) => f.slug === "malformed")?.kind).toBe(
        "malformed",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function registerTaskReadPurePart3(): void {
  it("runGoal refuses launch for unconfigured task type", async () => {
    const goal = makeGoal();
    try {
      fs.mkdirSync(goal.tasksDir, { recursive: true });
      fs.writeFileSync(
        path.join(goal.tasksDir, "unconfigured.md"),
        "---\nslug: unconfigured\ntitle: Unconfigured\ntype: unknown\n---\nDone when: test.\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(goal.tasksDir, "malformed.md"),
        "broken\n",
        "utf8",
      );

      const run = () =>
        runGoal({
          repo: goal.repo.dir,
          goal: "demo",
          iterations: 1,
          harnesses: {},
          baseGates: false,
          priceSource: testPriceSource(goal.repo.dir),
        });

      await expect(run()).rejects.toThrow(
        /tasks\/unconfigured.md:.*task "unconfigured" has type "unknown"/,
      );

      // Verify no records appended
      expect(
        await createFolderStore(goal.goalDir, undefined, {}).listRecords(),
      ).toEqual([]);

      // Verify files in place
      expect(fs.existsSync(path.join(goal.tasksDir, "unconfigured.md"))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(goal.tasksDir, "malformed.md"))).toBe(
        true,
      );
    } finally {
      cleanup(goal);
    }
  });
}

function registerTaskReadPurePart4(): void {
  it("sweepTasks quarantines malformed tasks after launch lock", async () => {
    const goal = makeGoal({
      processYaml: `
taskTypes:
  unknown:
    flow: implement-review
    kind: development
    schema: outcome
    useWhen: fixture work
  test-type:
    flow: implement-review
    kind: development
    schema: outcome
    useWhen: fixture work
`,
    });
    try {
      await sweepTasksQuarantinesMalformedPart1(goal);
      await sweepTasksQuarantinesMalformedPart2(goal);
    } finally {
      cleanup(goal);
    }
  });
}
