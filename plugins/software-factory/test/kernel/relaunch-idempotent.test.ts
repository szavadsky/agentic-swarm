import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { createDrainController } from "../../src/kernel/signals.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { expectDispatch } from "./e2e-helpers.js";
import {
  ALPHA,
  BETA,
  PLAN,
  isDigestSteerTurn,
  outcome,
  queueDigestSteer,
  setupRepo,
  silenceWarn,
} from "./resume-helpers.js";

const GAMMA = `---
slug: gamma
title: Create gamma
kind: task
flow: implement-review
deps: []
scope: [gamma.txt]
source: Milestone 1 / gamma
---

Create gamma.txt.
`;

type Tree = Map<string, string>;

function snapshotTree(root: string): Tree {
  const files: Tree = new Map();
  const walk = (dir: string, rel: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const child = rel === "" ? entry.name : `${rel}/${entry.name}`;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, child);
      else files.set(child, fs.readFileSync(abs, "utf8"));
    }
  };
  walk(root, "");
  return files;
}

/**
 * Paths a relaunch may write: the append-only step records, and the script
 * artifacts derived from them (iteration digests, summaries and metrics, and
 * the mailbox). Everything else is authored by a turn or the operator.
 */
function isRecordTree(rel: string): boolean {
  return (
    rel.startsWith("records/") ||
    rel.startsWith("iterations/") ||
    rel.startsWith("mailbox/") ||
    rel === "metrics.yaml"
  );
}

function diffTrees(
  before: Tree,
  after: Tree,
): { added: string[]; removed: string[]; changed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const [rel, text] of after) {
    const old = before.get(rel);
    if (old === undefined) added.push(rel);
    else if (old !== text) changed.push(rel);
  }
  for (const rel of before.keys()) if (!after.has(rel)) removed.push(rel);
  return {
    added: added.sort(),
    removed: removed.sort(),
    changed: changed.sort(),
  };
}

/** Every change is a record or a script artifact derived from one. */
function expectOnlyRecordTreeChanges(before: Tree, after: Tree): void {
  const diff = diffTrees(before, after);
  expect(diff.removed.filter((rel) => !isRecordTree(rel))).toEqual([]);
  expect(diff.changed.filter((rel) => !isRecordTree(rel))).toEqual([]);
  expect(diff.added.filter((rel) => !isRecordTree(rel))).toEqual([]);
  expect(diff.changed.filter((rel) => rel.startsWith("records/"))).toEqual([]);
}

/** The agent turns a launch ran before its first task turn. */
function turnsBeforeFirstTask(harness: FakeHarness): {
  step: string | undefined;
  digest: boolean;
}[] {
  const turns: { step: string | undefined; digest: boolean }[] = [];
  for (const call of harness.calls) {
    const identity = fakeTurnIdentity(call);
    if (identity.slug !== undefined) break;
    turns.push({ step: identity.step, digest: isDigestSteerTurn(call) });
  }
  return turns;
}

describe("relaunch is idempotent by script", () => {
  it("two relaunches resume the same iteration with only digest turns and leave the authored tree untouched", async () => {
    const { repo, goalDir, taskDir } = setupRepo();
    const firstDrain = createDrainController();
    const secondDrain = createDrainController();
    const restoreWarn = silenceWarn();
    try {
      // Launch 1: plan three tasks, land alpha, and interrupt while alpha's
      // review is in flight. beta and gamma stay ready.
      const first = new FakeHarness({ id: "fake" });
      first.script((req, ctx) => {
        fs.writeFileSync(path.join(goalDir, "plan.md"), PLAN, "utf8");
        ctx.writeOutcome(outcome({ summary: "planned", decision: "continue" }));
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        fs.writeFileSync(path.join(taskDir, "alpha.md"), ALPHA, "utf8");
        fs.writeFileSync(path.join(taskDir, "beta.md"), BETA, "utf8");
        fs.writeFileSync(path.join(taskDir, "gamma.md"), GAMMA, "utf8");
        ctx.writeOutcome(outcome({ summary: "filed" }));
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "alpha.txt"), "alpha\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "alpha added" }));
        return fakeTurnResult(req);
      });
      first.script((req, ctx) => {
        firstDrain.handleSignal("SIGINT");
        ctx.writeOutcome(
          outcome({ summary: "alpha approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      await expectDispatch(130, ["run", "--repo", repo.dir, "--goal", "demo"], {
        harnesses: { fake: first },
        signals: firstDrain,
      });

      const interruptedTree = snapshotTree(goalDir);
      const store = createFolderStore(goalDir, undefined, {});
      const interrupted = derive(
        await store.listTasks(),
        await store.listRecords(),
      );
      expect(interrupted.interrupted).toBe(true);
      expect(interrupted.iteration).toBe(1);
      expect(interrupted.tasks.alpha!.status).toBe("merged");
      expect(interrupted.tasks.beta!.status).toBe("ready");
      expect(interrupted.tasks.gamma!.status).toBe("ready");

      // Relaunch 1: resume iteration 1. The digest reaches the PM, then beta
      // lands; the SIGINT while beta's implement turn is in flight drains the
      // pass before gamma starts, so the iteration stays interrupted.
      const second = new FakeHarness({ id: "fake" });
      queueDigestSteer(second);
      second.script((req, ctx) => {
        secondDrain.handleSignal("SIGINT");
        fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "beta added" }));
        return fakeTurnResult(req);
      });
      second.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "beta approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      await expectDispatch(130, ["run", "--repo", repo.dir, "--goal", "demo"], {
        harnesses: { fake: second },
        signals: secondDrain,
      });

      const afterFirstRelaunch = derive(
        await store.listTasks(),
        await store.listRecords(),
      );
      expect(afterFirstRelaunch.interrupted).toBe(true);
      expect(afterFirstRelaunch.iteration).toBe(1);
      expect(afterFirstRelaunch.tasks.beta!.status).toBe("merged");
      expect(afterFirstRelaunch.tasks.gamma!.status).toBe("ready");
      expectOnlyRecordTreeChanges(interruptedTree, snapshotTree(goalDir));

      // No front or architect turn precedes dispatch on a resume: the digest
      // scout and the PM turn that reads the digest steer are the whole prefix.
      const firstRelaunchTurns = turnsBeforeFirstTask(second);
      expect(firstRelaunchTurns).toHaveLength(2);
      expect(firstRelaunchTurns[0]).toEqual({ step: "digest", digest: false });
      expect(firstRelaunchTurns[1]).toEqual({ step: "pm", digest: true });

      // Relaunch 2: resume the same iteration again; gamma lands and the
      // iteration closes. No architect runs in iteration 1.
      const third = new FakeHarness({ id: "fake" });
      queueDigestSteer(third);
      third.script((req, ctx) => {
        fs.writeFileSync(path.join(req.cwd!, "gamma.txt"), "gamma\n", "utf8");
        ctx.writeOutcome(outcome({ summary: "gamma added" }));
        return fakeTurnResult(req);
      });
      third.script((req, ctx) => {
        ctx.writeOutcome(
          outcome({ summary: "gamma approved", verdict: "approve" }),
        );
        return fakeTurnResult(req);
      });
      third.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "goal met", decision: "done" }));
        return fakeTurnResult(req);
      });
      await expectDispatch(
        0,
        ["run", "--repo", repo.dir, "--goal", "demo", "--iterations", "3"],
        { harnesses: { fake: third } },
      );

      const secondRelaunchTurns = turnsBeforeFirstTask(third);
      expect(secondRelaunchTurns).toHaveLength(2);
      expect(secondRelaunchTurns[0]).toEqual({
        step: "digest",
        digest: false,
      });
      expect(secondRelaunchTurns[1]).toEqual({ step: "pm", digest: true });

      const records = await store.listRecords();
      const state = derive(await store.listTasks(), records);
      expect(state.goal).toBe("done");
      expect(state.tasks.alpha!.status).toBe("merged");
      expect(state.tasks.beta!.status).toBe("merged");
      expect(state.tasks.gamma!.status).toBe("merged");

      const resumes = records.filter(
        (r) => r.iteration === 1 && r.step === "resume",
      );
      expect(resumes.map((r) => r.outcome?.summary)).toEqual([
        "resume attempt 1 of iteration 1",
        "resume attempt 2 of iteration 1",
      ]);
      expect(records.some((r) => r.step === "resume-refused")).toBe(false);
      expect(
        records.filter(
          (r) =>
            r.iteration === 1 && r.actor === "agent" && r.step === "architect",
        ),
      ).toHaveLength(1);
      expect(
        records
          .filter((r) => r.slug === "gamma")
          .every((r) => r.iteration === 1),
      ).toBe(true);

      // The authored tree is byte-identical across both relaunches; only the
      // record tree grew, and no record was rewritten.
      const finalTree = snapshotTree(goalDir);
      expectOnlyRecordTreeChanges(interruptedTree, finalTree);
      for (const rel of [
        "intent.md",
        "class.yaml",
        "plan.md",
        "tasks/alpha.md",
        "tasks/beta.md",
        "tasks/gamma.md",
      ]) {
        expect(finalTree.get(rel)).toBe(interruptedTree.get(rel));
      }
    } finally {
      restoreWarn();
      repo.cleanup();
    }
  }, 120_000);
});
