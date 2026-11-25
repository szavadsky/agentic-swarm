import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { executeTaskAction } from "../../src/kernel/flow.js";
import type { Action, KernelRuntime } from "../../src/kernel/types.js";
import {
  containmentSnapshot,
  containmentViolation,
  ensureTaskWorktree,
} from "../../src/kernel/worktree.js";
import { task, causeText } from "./helpers.js";
import {
  cleanupFlowRepo,
  goalCheckout,
  makeRuntime,
  outcome,
  setupFlowRepo,
  scriptStallLeave,
  writeTask,
} from "./s2-helpers.js";

async function ignoresSiblingRecordOpensAcrossPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const file = task("task", { scope: ["task.txt"] });
  await writeTask(runtime, file);
  const ensured = await ensureTaskWorktree(runtime, file);

  // A sibling commit record that opens across the snapshot's record
  // read: stamped before the snapshot, its files land after. The read
  // misses it (filtered here; under load the directory read wins the
  // race), so the check must clear it by sequence, not by timestamp.
  const open = await runtime.store.startRecord({
    iteration: 1,
    step: "commit",
    round: 1,
    actor: "script",
    slug: "other",
    commit: "0".repeat(40),
  });
  const past = new Date(Date.now() - 60_000).toISOString();
  fs.writeFileSync(
    path.join(open.dir, "started.yaml"),
    yaml.stringify({ ...open.meta, startedAt: past }),
    "utf8",
  );
  const filteredStore = Object.assign(
    Object.create(Object.getPrototypeOf(runtime.store)),
    runtime.store,
    {
      listRecords: async () => {
        const records = await runtime.store.listRecords();
        return records.filter((r) => r.seq !== open.meta.seq);
      },
    },
  );
  const snapshot = await containmentSnapshot(
    { ...runtime, store: filteredStore },
    ensured.path,
  );

  return { runtime, ensured, open, past, snapshot };
}

async function ignoresSiblingRecordOpensAcrossPart2(
  scope: Awaited<ReturnType<typeof ignoresSiblingRecordOpensAcrossPart1>>,
) {
  const { open, past, runtime, ensured, snapshot } = scope;
  fs.writeFileSync(
    path.join(open.dir, "end.yaml"),
    yaml.stringify({
      ok: true,
      commit: "0".repeat(40),
      tree: "1".repeat(40),
      endedAt: past,
    }),
    "utf8",
  );

  expect(
    await containmentViolation(runtime, ensured.path, ensured.branch, snapshot),
  ).toBeUndefined();
}

async function refusesMergeWhoseIntegrationHeadPart1(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
  checkout: string,
) {
  const harness = new FakeHarness({ id: "fake" });
  harness.script((req, ctx) => {
    fs.writeFileSync(path.join(req.cwd!, "task.txt"), "task\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "implemented" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });

  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const file = task("task", { scope: ["task.txt"] });
  await writeTask(runtime, file);
  const drive = async (action: Action): Promise<void> => {
    const before = derive(
      await runtime.store.listTasks(),
      await runtime.store.listRecords(),
      runtime.configs.process.flows,
    );
    await executeTaskAction(runtime, file, action, 1, before.tasks[file.slug]!);
  };
  await drive({ kind: "step", slug: "task", step: "implement", round: 1 });
  await drive({ kind: "step", slug: "task", step: "review", round: 1 });
  // Differ the merged tree so the merge gates run: without a concurrent
  // landing the merge would skip them on the already-judged tree.
  fs.writeFileSync(path.join(checkout, "other.txt"), "other\n", "utf8");
  repo.git(["add", "other.txt"], { cwd: checkout });
  repo.git(["commit", "-m", "concurrent landing"], { cwd: checkout });
  await drive({ kind: "merge", slug: "task" });
  scriptStallLeave(harness, ["task"]);
  await runDispatch(runtime, { iteration: 1 });

  const records = await runtime.store.listRecords();
  const state = derive(
    await runtime.store.listTasks(),
    records,
    runtime.configs.process.flows,
  );
  expect(state.tasks.task!.status).toBe("parked");

  return { records, state };
}

async function refusesMergeWhoseIntegrationHeadPart2(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  scope: Awaited<ReturnType<typeof refusesMergeWhoseIntegrationHeadPart1>>,
) {
  const { state, records } = scope;
  expect(state.tasks.task!.cause?.kind).toBe("merge-failed");
  expect(causeText(state.tasks.task!.cause)).toContain(
    "merge-failed: integration-moved: expected ",
  );
  const failed = records.filter(
    (r) => r.slug === "task" && r.step === "merge" && r.ok === false,
  );
  // The dispatch merge and the wave-end kept-land retry both hit the moved
  // head, and neither overwrote the outside commit.
  expect(failed.length).toBeGreaterThanOrEqual(1);
  expect(failed.every((r) => r.cause?.kind === "integration-moved")).toBe(true);
  expect(causeText(failed[0]!.cause)).toMatch(/^integration-moved: expected /);
  expect(
    repo.git(["log", "-1", "--format=%s", "factory/demo"]).stdout.trim(),
  ).toBe("outside");
}

function registerAgentContainmentPart17(): void {
  it("parks a turn that rewrites a goal file the kernel wrote before the turn", async () => {
    const { repo, goal, goalDir } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script((req, ctx) => {
        fs.writeFileSync(
          path.join(goalDir, "iterations/1/summary.md"),
          "# Forged summary\n",
          "utf8",
        );
        fs.writeFileSync(path.join(req.cwd!, "task.txt"), "task\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "implemented" }));
        return fakeTurnResult(req);
      });

      scriptStallLeave(harness, ["task"]);
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      await runtime.store.writeFile(
        "iterations/1/summary.md",
        "# Summary\nengine wrote this\n",
      );
      await writeTask(runtime, task("task", { scope: ["task.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      const records = await runtime.store.listRecords();
      const state = derive(
        await runtime.store.listTasks(),
        records,
        runtime.configs.process.flows,
      );
      expect(state.tasks.task!.status).toBe("parked");
      expect(causeText(state.tasks.task!.cause)).toContain(
        "changed iterations/1/summary.md",
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

async function openSiblingMergeBeforeTurn(runtime: KernelRuntime) {
  // A sibling merge that opened before the turn. Its close is stamped
  // before the snapshot but lands between the snapshot's artifact walk
  // and its record read: the dispatch interleaving where a script merge
  // and an agent turn start in the same poll round.
  const open = await runtime.store.startRecord({
    iteration: 1,
    step: "merge",
    round: 1,
    actor: "script",
    slug: "other",
    commit: "0".repeat(40),
  });
  const past = new Date(Date.now() - 60_000).toISOString();
  fs.writeFileSync(
    path.join(open.dir, "started.yaml"),
    yaml.stringify({ ...open.meta, startedAt: past }),
    "utf8",
  );
  return { open, past };
}

async function startGatedContainmentSnapshot(
  runtime: KernelRuntime,
  worktree: string,
) {
  // Gate the snapshot's record read so the close lands after the walk
  // but before the read, deterministically.
  let entered = false;
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const gatedStore = Object.assign(
    Object.create(Object.getPrototypeOf(runtime.store)),
    runtime.store,
    {
      listRecords: async () => {
        entered = true;
        await released;
        return runtime.store.listRecords();
      },
    },
  );
  const snapshot = containmentSnapshot(
    { ...runtime, store: gatedStore },
    worktree,
  );
  const deadline = Date.now() + 30_000;
  while (!entered && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  if (!entered) throw new Error("snapshot never reached its record read");
  return { snapshot, release: () => release() };
}

function closeSiblingMergeRecord(open: { dir: string }, past: string): void {
  fs.writeFileSync(
    path.join(open.dir, "end.yaml"),
    yaml.stringify({
      ok: true,
      commit: "0".repeat(40),
      cause: "recovered merge after crash",
      endedAt: past,
    }),
    "utf8",
  );
}

function registerAgentContainmentPart18(): void {
  it("ignores a sibling record whose close lands between the snapshot walk and its record read", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });
      const file = task("task", { scope: ["task.txt"] });
      await writeTask(runtime, file);
      const ensured = await ensureTaskWorktree(runtime, file);

      const { open, past } = await openSiblingMergeBeforeTurn(runtime);
      const { snapshot, release } = await startGatedContainmentSnapshot(
        runtime,
        ensured.path,
      );
      closeSiblingMergeRecord(open, past);
      release();
      const walked = await snapshot;

      expect(
        await containmentViolation(
          runtime,
          ensured.path,
          ensured.branch,
          walked,
        ),
      ).toBeUndefined();
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerAgentContainmentPart19(): void {
  it("ignores a sibling record that opens across the snapshot's record read", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const scope1 = await ignoresSiblingRecordOpensAcrossPart1(repo, goal);
      await ignoresSiblingRecordOpensAcrossPart2(scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("refuses a merge whose integration head moved during the gate", async () => {
    const gate =
      'if [ "$(git rev-parse --abbrev-ref HEAD)" = "HEAD" ]; then ' +
      "git -C ../demo commit --allow-empty -m outside; fi";
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "detached", command: gate }],
    });
    const checkout = goalCheckout(repo, goal);
    try {
      const scope1 = await refusesMergeWhoseIntegrationHeadPart1(
        repo,
        goal,
        checkout,
      );
      await refusesMergeWhoseIntegrationHeadPart2(repo, scope1);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

/** A flow repo whose artifact store commits into the main checkout. */
function sameRepoFlow(): ReturnType<typeof setupFlowRepo> {
  const flow = setupFlowRepo();
  const config = yaml.parse(flow.repo.readFile(".factory/repo.yaml"));
  config.artifacts = { backend: "same-repo", root: ".factory/artifacts" };
  flow.repo.writeFile(".factory/repo.yaml", yaml.stringify(config));
  flow.repo.commit("same-repo artifacts");
  return flow;
}

async function sameRepoSnapshot(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
) {
  const runtime = await makeRuntime(repo, goal, {
    fake: new FakeHarness({ id: "fake" }),
  });
  const file = task("task", { scope: ["task.txt"] });
  await writeTask(runtime, file);
  const ensured = await ensureTaskWorktree(runtime, file);
  const snapshot = await containmentSnapshot(runtime, ensured.path);
  return { runtime, ensured, snapshot };
}

function registerAgentContainmentPart20(): void {
  it("exempts a same-repo store commit that lands during the turn", async () => {
    const { repo, goal } = sameRepoFlow();
    try {
      const { runtime, ensured, snapshot } = await sameRepoSnapshot(repo, goal);
      await runtime.store.writeFile("plan.md", "# Plan\n");

      expect(
        await containmentViolation(
          runtime,
          ensured.path,
          ensured.branch,
          snapshot,
        ),
      ).toBeUndefined();
      const incidents = (await runtime.store.listRecords()).filter(
        (r) => r.step === "containment",
      );
      expect(incidents).toHaveLength(0);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerAgentContainmentPart21(): void {
  it("records an operator commit stacked under a same-repo store commit", async () => {
    const { repo, goal } = sameRepoFlow();
    try {
      const { runtime, ensured, snapshot } = await sameRepoSnapshot(repo, goal);
      repo.writeFile("operator.txt", "operator\n");
      repo.commit("operator edit");
      await runtime.store.writeFile("plan.md", "# Plan\n");

      expect(
        await containmentViolation(
          runtime,
          ensured.path,
          ensured.branch,
          snapshot,
        ),
      ).toBeUndefined();
      const incidents = (await runtime.store.listRecords()).filter(
        (r) => r.step === "containment",
      );
      expect(incidents).toHaveLength(1);
      expect(incidents[0]!.cause?.kind).toBe("outside-change");
      expect(causeText(incidents[0]!.cause)).toContain(
        `HEAD moved in ${repo.dir}`,
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("agent containment", () => {
  registerAgentContainmentPart17();

  registerAgentContainmentPart18();

  registerAgentContainmentPart19();

  registerAgentContainmentPart20();

  registerAgentContainmentPart21();
});
