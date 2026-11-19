import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { loadConfigs, resolveGoalPaths } from "../../src/kernel/config.js";
import { derive } from "../../src/kernel/derive.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { expectLaunch } from "./e2e-helpers.js";

const ARCHITECT_PLAN = `# Milestone 1 — files

## alpha
Create alpha.txt so the integration branch carries it.
Done when: alpha.txt exists.

## beta
Depends on alpha landing first; create beta.txt.
Done when: beta.txt exists on top of alpha.
`;

const ALPHA = `---
slug: alpha
title: Create alpha
kind: task
flow: implement-review
deps: []
scope: [alpha.txt]
source: Milestone 1 / alpha
---

Create alpha.txt.

Done when: alpha.txt exists.
`;

const BETA = `---
slug: beta
title: Create beta after alpha
kind: task
flow: implement-review
deps: [alpha]
scope: [beta.txt]
source: Milestone 1 / beta
---

Create beta.txt after alpha has merged.

Done when: beta.txt exists.
`;

function outcome(value: Record<string, unknown>) {
  return { status: "done", summary: "ok", concerns: [], forward: [], ...value };
}

function setupRepo(): {
  repo: TmpRepo;
  goalDir: string;
  planPath: string;
  newHarness: () => FakeHarness;
} {
  const repo = createTmpRepo();
  repo.writeFile(
    ".factory/repo.yaml",
    [
      "baseBranch: main",
      "artifactRoot: .factory/artifacts",
      "setup: []",
      "gates:",
      "  - id: alpha-exists",
      "    command: test -f alpha.txt",
      "",
    ].join("\n"),
  );
  repo.writeFile(
    ".factory/run.yaml",
    [
      "aliases:",
      "  architect: { harness: fake, model: fake-architect }",
      "  pm: { harness: fake, model: fake-pm }",
      "  implementer: { harness: fake, model: fake-impl }",
      "  implementer-b: { harness: fake, model: fake-impl-b }",
      "  researcher: { harness: fake, model: fake-research }",
      "  reviewer: { harness: fake, model: fake-review }",
      "  steward: { harness: fake, model: fake-steward }",
      "  plan-checker: { harness: fake, model: fake-check }",
      "  plan-reviewer: { harness: fake, model: fake-plan-review }",
      "  digest: { harness: fake, model: fake-digest }",
      "limits: { iterations: 1, concurrency: { overall: 1 } }",
      "",
    ].join("\n"),
  );
  repo.commit("factory config");
  const goalDir = path.join(repo.dir, ".factory/artifacts/demo");
  fs.mkdirSync(goalDir, { recursive: true });
  fs.writeFileSync(
    path.join(goalDir, "intent.md"),
    "# Goal\n\nCreate alpha then beta.\n",
    "utf8",
  );
  fs.writeFileSync(path.join(goalDir, "class.yaml"), "class: bigger\n", "utf8");
  return {
    repo,
    goalDir,
    planPath: path.join(goalDir, "plan.md"),
    newHarness: () => new FakeHarness({ id: "fake" }),
  };
}

function scriptPlanning(
  harness: FakeHarness,
  goalDir: string,
  taskDir: string,
): void {
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(goalDir, "plan.md"), ARCHITECT_PLAN, "utf8");
    ctx.writeOutcome(
      outcome({ summary: "planned alpha then beta", decision: "continue" }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(taskDir, "alpha.md"), ALPHA, "utf8");
    fs.writeFileSync(path.join(taskDir, "beta.md"), BETA, "utf8");
    ctx.writeOutcome(outcome({ summary: "filed alpha and beta" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "alpha added" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({ summary: "alpha is correct", verdict: "approve" }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    expect(fs.existsSync(path.join(req.cwd!, "alpha.txt"))).toBe(true);
    fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "beta added on alpha" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(
      outcome({ summary: "beta is correct", verdict: "approve" }),
    );
    return fakeTurnResult(req);
  });
}

async function runScenario(): Promise<void> {
  const { repo, goalDir, planPath, newHarness } = setupRepo();
  try {
    const first = newHarness();
    scriptPlanning(first, goalDir, path.join(goalDir, "tasks"));
    await expectLaunch(3, repo, first);

    let store = createFolderStore(goalDir, undefined, {});
    const state = derive(await store.listTasks(), await store.listRecords());
    expect(state.goal).toBe("active");
    expect(state.tasks.alpha!.status).toBe("merged");
    expect(state.tasks.beta!.status).toBe("merged");
    expect(state.iteration).toBe(1);

    expect(repo.git(["show", "factory/demo:alpha.txt"]).stdout.trim()).toBe(
      "alpha",
    );
    expect(repo.git(["show", "factory/demo:beta.txt"]).stdout.trim()).toBe(
      "beta",
    );
    expect(fs.existsSync(path.join(goalDir, "iterations/1/summary.md"))).toBe(
      true,
    );
    expect(
      fs.existsSync(
        path.join(goalDir, "mailbox/outbox/iteration-1-summary.md"),
      ),
    ).toBe(true);
    expect(fs.existsSync(path.join(goalDir, "metrics.yaml"))).toBe(true);
    const mergeRecords = (await store.listRecords()).filter(
      (r) => r.step === "merge",
    );
    expect(mergeRecords.map((r) => [r.slug, r.ok])).toEqual([
      ["alpha", true],
      ["beta", true],
    ]);

    const second = newHarness();
    second.script((req, ctx) => {
      const digest = path.join(goalDir, "iterations/2/digest.md");
      expect(fs.readFileSync(digest, "utf8")).toContain("architect");
      fs.appendFileSync(digest, "\n## Loops\n- none\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "digest written" }));
      return fakeTurnResult(req);
    });
    second.script((req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
      return fakeTurnResult(req);
    });
    await expectLaunch(0, repo, second);

    store = createFolderStore(goalDir, undefined, {});
    const after = derive(await store.listTasks(), await store.listRecords());
    expect(after.goal).toBe("done");
    expect(after.iteration).toBe(2);
    expect(fs.existsSync(path.join(goalDir, "iterations/2/summary.md"))).toBe(
      true,
    );
    expect(
      fs.readFileSync(path.join(goalDir, "iterations/2/digest.md"), "utf8"),
    ).toContain("Loops");

    // State is only derived: deleting everything but tasks/ and records/ loses nothing.
    const configs = loadConfigs(repo.dir);
    const paths = resolveGoalPaths(configs, repo.dir, "demo");
    expect(paths.goalDir).toBe(goalDir);
    for (const entry of fs.readdirSync(goalDir)) {
      if (entry === "tasks" || entry === "records") continue;
      fs.rmSync(path.join(goalDir, entry), { recursive: true, force: true });
    }
    const stripped = createFolderStore(goalDir, undefined, {});
    const derivedAgain = derive(
      await stripped.listTasks(),
      await stripped.listRecords(),
    );
    expect(derivedAgain).toEqual(after);
  } finally {
    const worktreeRoot = path.resolve(
      repo.dir,
      "..",
      ".factory-worktrees",
      path.basename(repo.dir),
    );
    repo.cleanup();
    fs.rmSync(worktreeRoot, { recursive: true, force: true });
  }
}

describe("KERNEL0 scenario 1 — two dependent tasks, then architect done", () => {
  it("merges both tasks on the first launch and closes the goal on the second", async () => {
    await runScenario();
  }, 60_000);

  it("repeats on a fresh temp repo", async () => {
    await runScenario();
  }, 60_000);
});
