import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { deriveTaskState } from "../../src/core/derive/task.js";
import { appendJournal } from "../../src/core/journal.js";
import type { PipelineConfig } from "../../src/core/artifacts.js";

// Task-level `failed` means NOTHING recoverable remains — not any-item-failed.
// Regression: a live ex-stranded item (frozen `running` + consult-exhausted
// abandon, re-queued) plus runnable siblings derived task `failed` at startup,
// journaling bare `task_failed` and exiting before recovery could run.

function makePipeline(): PipelineConfig {
  return {
    models: {
      roles: {
        workhorse: { model: "deepseek-chat" },
        "alt-workhorse": { model: "deepseek-chat" },
        architect: { model: "deepseek-reasoner" },
      },
    },
    agents: {
      triage: { role: "workhorse" },
      infra: { role: "workhorse" },
      architect: { role: "architect" },
      developer: { role: "workhorse" },
      reviewer: { role: "alt-workhorse" },
    },
    flows: {
      simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
      story: {},
      spike: {},
    },
    limits: {},
  };
}

function runningReviewRecord(stepsDir: string, dirName: string, seq: number) {
  const rd = path.join(stepsDir, dirName);
  fs.mkdirSync(rd, { recursive: true });
  fs.writeFileSync(path.join(rd, "input.md"), "prompt\n");
  fs.writeFileSync(
    path.join(rd, "meta.yaml"),
    `seq: ${seq}\nname: review\nattempt: 1\nfixRound: 1\nagent: reviewer\nrole: alt-workhorse\nmodels: [m]\nstatus: ok\nstartedAt: 2026-01-01T00:00:00.000Z\nendedAt: 2026-01-01T00:00:01.000Z\n`
  );
  fs.writeFileSync(
    path.join(rd, "output.yaml"),
    `status: ok\nsummary: work\nsuggestions:\n  - id: f${seq}\n    disposition: fix\n    summary: fix it\n`
  );
}

function closeupRecord(taskDir: string, n: number) {
  const dirName = `00${n}-architect-closeup-${n}-a1`;
  const rd = path.join(taskDir, "runs", dirName);
  fs.mkdirSync(rd, { recursive: true });
  fs.writeFileSync(path.join(rd, "input.md"), "prompt\n");
  fs.writeFileSync(
    path.join(rd, "meta.yaml"),
    `seq: ${n}\nname: architect-closeup-${n}\nattempt: 1\nagent: architect\nrole: architect\nmodels: [m]\nstatus: ok\nstartedAt: 2026-01-01T00:00:00.000Z\nendedAt: 2026-01-01T00:00:01.000Z\n`
  );
  fs.writeFileSync(
    path.join(rd, "output.yaml"),
    `iteration: ${n}\nstatus: next-iteration\nsummary: open\n`
  );
  fs.writeFileSync(
    path.join(taskDir, `closeup-${n}.yaml`),
    `iteration: ${n}\nstatus: next-iteration\nsummary: open\n`
  );
}

function setupItem(taskDir: string, slug: string, kind: string, extra?: { abandon?: boolean }) {
  const itemDir = path.join(taskDir, "items", slug);
  const stepsDir = path.join(itemDir, "steps");
  fs.mkdirSync(stepsDir, { recursive: true });
  fs.writeFileSync(
    path.join(itemDir, "assignment.yaml"),
    `slug: ${slug}\nkind: ${kind}\ntitle: ${slug}\nassignment: Work\nwave: 1\n`
  );
  if (extra?.abandon) {
    const decisionsDir = path.join(taskDir, "decisions");
    fs.mkdirSync(decisionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(decisionsDir, `001-item-${slug}-abandon.yaml`),
      `id: dec-1\ncontext: item\nitem: ${slug}\ndecision: abandon\nreason: consults-exhausted\nrationale: exhausted\ntimestamp: 2026-01-01T00:00:02.000Z\n`
    );
  }
  return { itemDir, stepsDir };
}

describe("task derive: failed item with live siblings stays active", () => {
  let tmpRepo: TmpRepo;
  let pipeline: PipelineConfig;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    pipeline = makePipeline();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("failed + running sibling → active, failed item stays failed", async () => {
    const task = "failed-with-sibling-task";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    setupItem(taskDir, "doomed-1", "dev", { abandon: true });
    const { stepsDir } = setupItem(taskDir, "live-1", "fact-finder");
    runningReviewRecord(stepsDir, "001-review-r1-a1", 1);

    const state = await deriveTaskState({ taskDir, task, taskWt: tmpRepo.dir, pipeline });
    expect(state.items.find((i) => i.slug === "doomed-1")?.status).toBe("failed");
    expect(state.items.find((i) => i.slug === "live-1")?.status).toBe("running");
    expect(state.status).toBe("active");
    expect(state.failureDetails).toBeUndefined();
  });

  it("all items terminal-failed + nothing recoverable → failed with task_failed_why naming items", async () => {
    const task = "all-failed-task";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    setupItem(taskDir, "doomed-1", "dev", { abandon: true });
    setupItem(taskDir, "doomed-2", "dev", { abandon: true });

    const state = await deriveTaskState({ taskDir, task, taskWt: tmpRepo.dir, pipeline });
    expect(state.status).toBe("failed");
    expect(state.failureDetails?.failedItems.sort()).toEqual(["doomed-1", "doomed-2"]);
    expect(state.failureDetails?.recoverableItems).toEqual([]);
    expect(state.failureDetails?.mergeRetryAvailable).toEqual([]);
    expect(state.failureDetails?.unrequeuedStranded).toEqual([]);
  });

  it("live shape: ex-stranded abandoned item + fresh iteration plan → active so restart drives recovery", async () => {
    const task = "stranded-restart-task";
    const taskDir = path.join(tmpRepo.dir, ".factory", task);
    // ownership-map-revalidation: stranded iteration 5 (closeup-4 landed),
    // frozen running review + consults-exhausted abandon on restart.
    const { stepsDir } = setupItem(taskDir, "ownership-map-revalidation", "fact-finder", { abandon: true });
    runningReviewRecord(stepsDir, "008-review-r2-a1", 8);
    // Fresh iteration-5 work still live.
    const live = setupItem(taskDir, "secrets-triage-spike", "fact-finder");
    runningReviewRecord(live.stepsDir, "003-research-r2-a1", 3);
    for (const n of [1, 2, 3, 4]) closeupRecord(taskDir, n);
    tmpRepo.commit("closeups 1-4 landed");
    fs.mkdirSync(path.join(taskDir, "plan"), { recursive: true });
    fs.writeFileSync(
      path.join(taskDir, "plan", "plan-5.yaml"),
      "iteration: 5\nmilestones: []\nitemOutlines:\n  - slug: secrets-triage-spike\n    kind: fact-finder\n    title: Spike\n"
    );
    await appendJournal(taskDir, {
      type: "item_stranded",
      item: "ownership-map-revalidation",
      iteration: 5,
      status: "running",
      strandedFrom: 4,
    });

    const state = await deriveTaskState({ taskDir, task, taskWt: tmpRepo.dir, pipeline });
    expect(state.iteration).toBe(5);
    expect(state.items.find((i) => i.slug === "ownership-map-revalidation")?.status).toBe("failed");
    expect(state.status).toBe("active");
  });
});
