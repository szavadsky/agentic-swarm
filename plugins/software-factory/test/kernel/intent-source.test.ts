import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  type FakeTurnHandler,
  FakeHarness,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runBoundary } from "../../src/kernel/boundary.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { postSteer } from "../../src/kernel/mailbox.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import {
  containmentSnapshot,
  containmentViolation,
  ensureTaskWorktree,
} from "../../src/kernel/worktree.js";
import type { TmpRepo } from "../helpers/tmp-repo.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";
import {
  approver,
  editPlan,
  implementer,
  outboxOf,
  writeHold,
  writePlan,
} from "./steer-helpers.js";

const REPO_BEFORE =
  "# Repo intent\n\nThe factory carries every intent bullet.\nDrop the export requirement.\n";
const REPO_EXPORT =
  "# Repo intent\n\nThe factory carries every intent bullet.\nExport is in scope.\n";
/** The delta goal's shape: a note that names the repo file as its source. */
const POINTER =
  "# Goal\n\nBuild the factory fully as specified in `INTENT.md` (repo root).\n";

function intentPath(runtime: KernelRuntime): string {
  return path.join(runtime.store.goalDir, "intent.md");
}

function readIntent(runtime: KernelRuntime): string {
  return fs.readFileSync(intentPath(runtime), "utf8");
}

/** The repo intent file the pointer note names, in the goal checkout. */
function repoIntentPath(runtime: KernelRuntime): string {
  return path.join(runtime.paths.goalCheckout, "INTENT.md");
}

function packAt(runtime: KernelRuntime, packPath: string | undefined): string {
  return fs.readFileSync(path.join(runtime.store.goalDir, packPath!), "utf8");
}

/** One steer PM turn: hold beta as mooted and route the steer to the intent agent. */
function routeIntent(runtime: KernelRuntime): FakeTurnHandler {
  return (req, ctx) => {
    writeHold(runtime, "s1", ["beta"]);
    ctx.writeOutcome(
      outcome({
        summary: "s1 amends intent",
        steerRoutes: [{ steer: "s1", route: "intent" }],
      }),
    );
    return fakeTurnResult(req);
  };
}

/**
 * The architect turn that edits the plan, answers the steer, and the no-op
 * planner turn after it.
 */
function scriptArchitect(
  harness: FakeHarness,
  runtime: KernelRuntime,
  opts: { summary: string; answer: string },
): void {
  harness.script((req, ctx) => {
    expect(req.prompt).toContain("- s1 (mailbox/inbox/s1.md)");
    editPlan(runtime);
    ctx.writeOutcome(
      outcome({
        summary: opts.summary,
        decision: "continue",
        steerAnswers: [{ steer: "s1", answer: opts.answer }],
      }),
    );
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "tasks unchanged" }));
    return fakeTurnResult(req);
  });
}

/**
 * Drives one iteration to its boundary with a pending intent-routed steer on a
 * pointer-note goal: alpha merges, the held beta never starts, and the plan
 * check falls through to the boundary.
 */
async function dispatchPointerSteer(
  harness: FakeHarness,
  runtime: KernelRuntime,
) {
  writePlan(runtime);
  await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
  await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
  fs.writeFileSync(intentPath(runtime), POINTER, "utf8");
  harness.script(
    implementer("alpha.txt", async () => {
      await postSteer(runtime.store, "s1", "Amend intent: export is in scope.");
    }),
    { when: whenTurn({ slug: "alpha", step: "implement" }) },
  );
  harness.script(routeIntent(runtime), { when: whenTurn({ step: "pm" }) });
  harness.script(approver("alpha is correct"), {
    when: whenTurn({ slug: "alpha", step: "review" }),
  });
  return runDispatch(runtime, { iteration: 1 });
}

/** The one intent turn's record, or undefined when the turn never landed. */
async function intentRecord(runtime: KernelRuntime) {
  return (await runtime.store.listRecords()).find(
    (record) =>
      record.step === "intent" && record.slug === "s1" && record.endedAt,
  );
}

/** A checkout with no uncommitted edit survives the next reset. */
function expectCleanCheckout(runtime: KernelRuntime, repo: TmpRepo): void {
  const status = repo.git(["status", "--porcelain"], {
    cwd: runtime.paths.goalCheckout,
  });
  expect(status.stdout).toBe("");
}

/** The repo file is edited and committed on the goal branch; the note is not. */
async function expectRepoIntentCarried(
  runtime: KernelRuntime,
  repo: TmpRepo,
  source: string,
): Promise<void> {
  expect(readIntent(runtime)).toBe(POINTER);
  expect(fs.readFileSync(source, "utf8")).toBe(REPO_EXPORT);
  expectCleanCheckout(runtime, repo);
  const record = await intentRecord(runtime);
  expect(record?.diff).toContain("--- INTENT.md");
  expect(record?.diff).toContain("+Export is in scope.");
  expect(record?.commit).toBeDefined();
  expect(record?.checkoutWrites).toEqual(["INTENT.md"]);
  const ancestor = repo.git(
    ["merge-base", "--is-ancestor", record!.commit!, "HEAD"],
    { cwd: runtime.paths.goalCheckout, allowFail: true },
  );
  expect(ancestor.code).toBe(0);
  expect(
    (await runtime.store.listRecords()).some(
      (entry) => entry.step === "containment",
    ),
  ).toBe(false);
}

async function carriesSteerIntoRepoIntent(): Promise<void> {
  const { repo, goal } = setupFlowRepo({
    limits: { concurrency: { overall: 1 } },
  });
  try {
    repo.writeFile("INTENT.md", REPO_BEFORE);
    repo.commit("add the repo intent", ["INTENT.md"]);
    const harness = new FakeHarness({ id: "fake" });
    const runtime = await makeRuntime(repo, goal, { fake: harness });
    const source = repoIntentPath(runtime);
    harness.script(
      (req, ctx) => {
        expect(req.prompt).toContain(source);
        fs.writeFileSync(source, REPO_EXPORT, "utf8");
        ctx.writeOutcome(
          outcome({ summary: "the repo intent now covers export" }),
        );
        return fakeTurnResult(req);
      },
      { when: whenTurn({ slug: "s1", step: "intent" }) },
    );

    const dispatched = await dispatchPointerSteer(harness, runtime);
    expect(dispatched.reason).toBe("boundary");
    // The pointer note is untouched; the repo file it names is edited and
    // committed on the goal branch, so a later reset cannot lose it.
    await expectRepoIntentCarried(runtime, repo, source);

    scriptArchitect(harness, runtime, {
      summary: "the plan follows the repo intent",
      answer: "repo intent carried",
    });
    const boundary = await runBoundary(runtime, { relaunch: false });
    expect(boundary.decision).toBe("continue");
    expect(readIntent(runtime)).toBe(POINTER);
    expect(fs.readFileSync(source, "utf8")).toBe(REPO_EXPORT);
    const pack = packAt(runtime, boundary.packPath);
    expect(pack).toContain("--- INTENT.md");
    expect(pack).toContain("+Export is in scope.");
    expect(pack).toContain("- s1 (mailbox/inbox/s1.md) — intent turn ");
    expect(pack).toContain("- s1 [intent]");
    expect(outboxOf(runtime, "s1")).toContain("repo intent carried");
  } finally {
    cleanupFlowRepo(repo);
  }
}

async function restoresRepoIntentWhenAgentCarriesNothing(): Promise<void> {
  const { repo, goal } = setupFlowRepo({
    limits: { concurrency: { overall: 1 } },
  });
  try {
    repo.writeFile("INTENT.md", REPO_BEFORE);
    repo.commit("add the repo intent", ["INTENT.md"]);
    const harness = new FakeHarness({ id: "fake" });
    const runtime = await makeRuntime(repo, goal, { fake: harness });
    const source = repoIntentPath(runtime);
    harness.script(
      (req, ctx) => {
        fs.appendFileSync(source, "\nHalf an edit.\n", "utf8");
        ctx.writeOutcome(
          outcome({
            status: "blocked",
            summary: "the steer does not say what to remove",
          }),
        );
        return fakeTurnResult(req);
      },
      { when: whenTurn({ slug: "s1", step: "intent" }) },
    );

    const dispatched = await dispatchPointerSteer(harness, runtime);
    expect(dispatched.reason).toBe("boundary");
    // A half edit never reaches the owner's source and is never committed.
    expect(fs.readFileSync(source, "utf8")).toBe(REPO_BEFORE);
    expect(readIntent(runtime)).toBe(POINTER);
    expectCleanCheckout(runtime, repo);
    expect((await intentRecord(runtime))?.commit).toBeUndefined();

    scriptArchitect(harness, runtime, {
      summary: "the repo intent is unchanged",
      answer: "left for the architect",
    });
    const boundary = await runBoundary(runtime, { relaunch: false });
    expect(boundary.decision).toBe("continue");
    expect(fs.readFileSync(source, "utf8")).toBe(REPO_BEFORE);
    const pack = packAt(runtime, boundary.packPath);
    expect(pack).toContain("not carried: blocked:");
    expect(pack).toContain("the steer still needs the architect");
    expect(pack).not.toContain("+Export is in scope.");
    expect(outboxOf(runtime, "s1")).toContain("left for the architect");
  } finally {
    cleanupFlowRepo(repo);
  }
}

async function keepsPointerNoteWhenAgentEditsIt(): Promise<void> {
  const { repo, goal } = setupFlowRepo({
    limits: { concurrency: { overall: 1 } },
  });
  try {
    repo.writeFile("INTENT.md", REPO_BEFORE);
    repo.commit("add the repo intent", ["INTENT.md"]);
    const harness = new FakeHarness({ id: "fake" });
    const runtime = await makeRuntime(repo, goal, { fake: harness });
    const source = repoIntentPath(runtime);
    harness.script(
      (req, ctx) => {
        fs.appendFileSync(intentPath(runtime), "\nHalf an edit.\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "edited the note instead" }));
        return fakeTurnResult(req);
      },
      { when: whenTurn({ slug: "s1", step: "intent" }), fallback: true },
    );

    const dispatched = await dispatchPointerSteer(harness, runtime);
    expect(dispatched.reason).toBe("boundary");
    // The reminder sees the owner's note restored, and the unchanged source
    // keeps failing: the pointer note never becomes the agent's edit.
    expect(readIntent(runtime)).toBe(POINTER);
    expect(fs.readFileSync(source, "utf8")).toBe(REPO_BEFORE);
    expectCleanCheckout(runtime, repo);
    const record = await intentRecord(runtime);
    expect(record?.diff).toBeUndefined();
    expect(record?.commit).toBeUndefined();

    scriptArchitect(harness, runtime, {
      summary: "the steer reaches me with no intent change",
      answer: "the repo intent stays as written",
    });
    const boundary = await runBoundary(runtime, { relaunch: false });
    expect(boundary.decision).toBe("continue");
    const pack = packAt(runtime, boundary.packPath);
    expect(pack).toContain("not carried:");
    expect(pack).toContain("the steer still needs the architect");
    expect(readIntent(runtime)).toBe(POINTER);
    expect(fs.readFileSync(source, "utf8")).toBe(REPO_BEFORE);
    expect(outboxOf(runtime, "s1")).toContain(
      "the repo intent stays as written",
    );
  } finally {
    cleanupFlowRepo(repo);
  }
}

/** A clean goal checkout with INTENT.md, a task worktree and its snapshot. */
async function concurrentIntentCheckout() {
  const { repo, goal } = setupFlowRepo();
  repo.writeFile("INTENT.md", REPO_BEFORE);
  repo.commit("add the repo intent", ["INTENT.md"]);
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  const file = task("task", { scope: ["task.txt"] });
  await writeTask(runtime, file);
  const ensured = await ensureTaskWorktree(runtime, file);
  const snapshot = await containmentSnapshot(runtime, ensured.path);
  return {
    repo,
    runtime,
    source: repoIntentPath(runtime),
    worktree: ensured.path,
    branch: ensured.branch,
    snapshot,
  };
}

/** The intent record an intent turn opens before it touches its source. */
function startIntentTurn(runtime: KernelRuntime) {
  return runtime.store.startRecord({
    iteration: 1,
    slug: "s1",
    step: "intent",
    round: 1,
    actor: "agent",
    checkoutWrites: ["INTENT.md"],
  });
}

async function exemptsOpenIntentSourceEdit(): Promise<void> {
  const { repo, runtime, source, worktree, branch, snapshot } =
    await concurrentIntentCheckout();
  try {
    await startIntentTurn(runtime);
    fs.writeFileSync(source, REPO_EXPORT, "utf8");
    // The source entry is the intent turn's; another checkout path is not.
    expect(
      await containmentViolation(runtime, worktree, branch, snapshot),
    ).toBeUndefined();
    fs.writeFileSync(
      path.join(runtime.paths.goalCheckout, "other.txt"),
      "task\n",
      "utf8",
    );
    expect(
      await containmentViolation(runtime, worktree, branch, snapshot),
    ).toContain("files changed outside the worktree");
  } finally {
    cleanupFlowRepo(repo);
  }
}

async function exemptsIntentCommitBeforeRecord(): Promise<void> {
  const { repo, runtime, source, worktree, branch, snapshot } =
    await concurrentIntentCheckout();
  try {
    await startIntentTurn(runtime);
    fs.writeFileSync(source, REPO_EXPORT, "utf8");
    repo.git(["add", "INTENT.md"], { cwd: runtime.paths.goalCheckout });
    repo.git(["commit", "-m", "factory: s1 intent change"], {
      cwd: runtime.paths.goalCheckout,
    });
    // The record is still open, so the commit is not on its end yet.
    expect(
      await containmentViolation(runtime, worktree, branch, snapshot),
    ).toBeUndefined();
  } finally {
    cleanupFlowRepo(repo);
  }
}

async function closedIntentStillBreachesSourceEdit(): Promise<void> {
  const { repo, runtime, source, worktree, branch, snapshot } =
    await concurrentIntentCheckout();
  try {
    const record = await startIntentTurn(runtime);
    await record.finish({ ok: true });
    fs.writeFileSync(source, REPO_EXPORT, "utf8");
    // The intent record is closed, so its declared path is no longer the
    // task's cover for editing the shared checkout.
    expect(
      await containmentViolation(runtime, worktree, branch, snapshot),
    ).toContain("files changed outside the worktree");
  } finally {
    cleanupFlowRepo(repo);
  }
}

async function stillBreachesTaskCheckoutEdit(): Promise<void> {
  const { repo, runtime, source, worktree, branch, snapshot } =
    await concurrentIntentCheckout();
  try {
    fs.writeFileSync(source, REPO_EXPORT, "utf8");
    expect(
      await containmentViolation(runtime, worktree, branch, snapshot),
    ).toContain("files changed outside the worktree");
  } finally {
    cleanupFlowRepo(repo);
  }
}

describe("intent source steer", () => {
  it(
    "edits the repo file a pointer note names, commits it on the goal branch and leaves the note untouched",
    carriesSteerIntoRepoIntent,
    60_000,
  );
  it(
    "restores a half-edited repo intent and hands the steer to the architect",
    restoresRepoIntentWhenAgentCarriesNothing,
    60_000,
  );
  it(
    "keeps the pointer note out of the intent turn even when the agent edits it",
    keepsPointerNoteWhenAgentEditsIt,
    60_000,
  );
  it(
    "does not blame a task settle for an open intent turn's source edit",
    exemptsOpenIntentSourceEdit,
    60_000,
  );
  it(
    "does not blame a task settle for an intent commit whose record is still open",
    exemptsIntentCommitBeforeRecord,
    60_000,
  );
  it(
    "still breaches a task's own goal-checkout edit with no intent turn",
    stillBreachesTaskCheckoutEdit,
    60_000,
  );
  it(
    "stops exempting the source once its intent record closes",
    closedIntentStillBreachesSourceEdit,
    60_000,
  );
});
