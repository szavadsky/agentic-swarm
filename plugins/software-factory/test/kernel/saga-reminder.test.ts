import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { loadConfigs } from "../../src/kernel/config.js";
import { dryRunPrompts } from "../../src/kernel/prompt-dry-run.js";
import { sagaReminderVar } from "../../src/kernel/saga-reminder.js";
import { outcome } from "./e2e-helpers.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

/** A repo whose only process override is the saga task count. */
function repoWithThreshold(threshold: number): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-saga-reminder-"));
  fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".factory/process.yaml"),
    `sagaTaskCount: ${threshold}\n`,
  );
  return root;
}

function dryRunArchitect(root: string): string {
  const render = dryRunPrompts(loadConfigs(root), root).find(
    (candidate) => candidate.name === "architect",
  );
  expect(render, "the dry-run renders the architect").toBeDefined();
  return render!.text;
}

/** The prompt the real architect turn renders for a goal holding `tasks`. */
async function architectPrompt(
  threshold: number,
  tasks: number,
): Promise<string> {
  const { repo, goal } = setupFlowRepo({
    process: { sagaTaskCount: threshold },
  });
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  try {
    for (let index = 0; index < tasks; index += 1)
      await writeTask(runtime, task(`task-${index}`));
    fs.writeFileSync(
      path.join(runtime.store.goalDir, "plan.md"),
      "# Plan\n",
      "utf8",
    );
    let prompt = "";
    harness.script(
      (req, ctx) => {
        prompt = req.prompt ?? "";
        ctx.writeOutcome(
          outcome({ summary: "nothing to plan yet", decision: "done" }),
        );
        return fakeTurnResult(req);
      },
      { when: whenTurn({ step: "architect" }) },
    );
    await runBoundary(runtime, { relaunch: false });
    return prompt;
  } finally {
    cleanupFlowRepo(repo);
  }
}

describe("saga reminder", () => {
  it("renders no reminder at the threshold and one past it", () => {
    expect(sagaReminderVar(20, 20)).toBe("");
    expect(sagaReminderVar(20, undefined)).toBe("");
    const past = sagaReminderVar(21, 20);
    expect(past).toContain("## Consider a saga");
    expect(past).toContain("This goal holds 21 tasks, past the configured 20.");
  });

  it("shows the reminder in the dry-run past the configured count and hides it below", () => {
    const above = repoWithThreshold(3);
    const below = repoWithThreshold(1000);
    try {
      expect(dryRunArchitect(above)).toContain("## Consider a saga");
      expect(dryRunArchitect(above)).toContain("past the configured 3.");
      expect(dryRunArchitect(below)).not.toContain("## Consider a saga");
    } finally {
      fs.rmSync(above, { recursive: true, force: true });
      fs.rmSync(below, { recursive: true, force: true });
    }
  });

  it("reminds the architect turn past the configured task count and not below", async () => {
    expect(await architectPrompt(1, 2)).toContain("## Consider a saga");
    expect(await architectPrompt(5, 2)).not.toContain("## Consider a saga");
  });
});
