import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runChildTask, runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { ensureTaskWorktree, ensureChildWorktree } from "../../src/core/git/index.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import { concernFingerprint, listConcerns } from "../../src/core/concerns.js";
import { hydrateStepConcerns } from "../../src/core/triage.js";
import { writeYamlAtomic } from "../../src/core/records/io.js";
import { propagateEpicConcerns } from "../../src/core/flows/epic-propagation.js";
import type {
  PipelineConfig,
  ProjectConfig,
  RemarkableDecision,
  StoredConcernArtifact,
} from "../../src/core/artifacts.js";

/**
 * Epic-to-saga push (adr-epic-push-condensed): open/routed child concerns and
 * open child remarkables become condensed parent-task copies with an `[epic]`
 * summary prefix, while dismissed/resolved entries stay local. Child questions
 * carrying blocks are forwarded to the parent mailbox. Copies remain open, so
 * they never halt the parent; only forwarded questions can.
 */

const ORCH = ".factory";
const TASK = "saga-task";
const EPIC = "big-epic";
const agentsDir = path.resolve(import.meta.dir, "../../agents");

const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");

function childConcern(
  overrides: Partial<StoredConcernArtifact> & { id: string; summary: string }
): StoredConcernArtifact {
  return {
    kind: "risk",
    detail: "detail",
    severity: "medium",
    status: "open",
    source: { record: "002-develop-a1", agent: "developer", item: "child-item" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

type RemarkableFixture = RemarkableDecision & {
  id: string;
  status: string;
  source: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function childRemarkable(
  overrides: Partial<RemarkableFixture> & { id: string; chosen: string }
): RemarkableFixture {
  return {
    alternatives: ["alternatives"],
    why: "why",
    status: "open",
    source: { record: "003-develop-a1", agent: "developer", item: "child-item" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** `source.epic` is part of the new propagation contract; artifacts.ts does not declare it yet. */
function sourceEpic(record: StoredConcernArtifact): string | undefined {
  return (record.source as StoredConcernArtifact["source"] & { epic?: string }).epic;
}

async function writeConcern(taskDir: string, record: StoredConcernArtifact): Promise<void> {
  await writeYamlAtomic(path.join(taskDir, "concerns", `${record.id}.yaml`), record);
}

async function writeRemarkable(
  taskDir: string,
  record: RemarkableFixture
): Promise<void> {
  await writeYamlAtomic(path.join(taskDir, "concerns", `${record.id}.yaml`), record);
}

function readRemarkables(taskDir: string): Array<Record<string, any>> {
  const dir = path.join(taskDir, "concerns");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.startsWith("rm-") && name.endsWith(".yaml"))
    .sort()
    .map((name) => yaml.parse(fs.readFileSync(path.join(dir, name), "utf8")) as Record<string, any>);
}

function questionFiles(taskDir: string): string[] {
  const dir = path.join(taskDir, "steer", "tousertoreview");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith(".yaml")).sort();
}

function pipelineFixture(): PipelineConfig {
  return {
    models: {
      roles: {
        workhorse: { model: "deepseek-chat" },
        "alt-workhorse": { model: "deepseek-chat" },
        architect: { model: "deepseek-reasoner" },
        "alt-architect": { model: "deepseek-reasoner" },
        "task-reviewer": { model: "deepseek-chat" },
        "wave-close-up": { model: "deepseek-chat" },
        "plan-close-up": { model: "deepseek-chat" },
        simpler: { model: "deepseek-chat" },
      },
    },
    agents: {
      triage: { role: "workhorse" },
      infra: { role: "workhorse" },
      architect: { role: "architect" },
      "plan-reviewer": { role: "alt-architect" },
      pm: { role: "alt-workhorse" },
      developer: { role: "workhorse" },
      "wave-close-up": { role: "wave-close-up" },
      "plan-close-up": { role: "plan-close-up" },
    },
    flows: {
      simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
      story: { dev: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] } },
      spike: {},
    },
    limits: { maxPlanReviewRounds: 1 },
  };
}

describe("Epic to saga propagation (adr-epic-push-condensed)", () => {
  let tmpRepo: TmpRepo;
  let parentWt: string;
  let parentTaskDir: string;
  let childTaskDir: string;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    parentWt = tmpRepo.dir;
    parentTaskDir = path.join(parentWt, ORCH, TASK);
    childTaskDir = path.join(tmpRepo.dir, "child-wt", ORCH, TASK, EPIC);
    fs.mkdirSync(path.join(parentTaskDir, "concerns"), { recursive: true });
    fs.mkdirSync(path.join(childTaskDir, "concerns"), { recursive: true });
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  async function createWorktreePair() {
    const worktreeRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    const repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
    const project: ProjectConfig = { orchestrationFolder: ORCH, worktreeRoot };
    const pipeline = pipelineFixture();
    const prompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [] });
    const intentPath = path.join(tmpRepo.dir, ORCH, TASK, "INTENT.md");
    fs.mkdirSync(path.dirname(intentPath), { recursive: true });
    fs.writeFileSync(intentPath, "Saga umbrella task\n", "utf8");
    tmpRepo.commit("add saga intent");

    const parentWtInfo = await ensureTaskWorktree(repo, TASK, {
      intentPath,
      orchestrationFolder: ORCH,
    });
    const parentTaskDir = path.join(parentWtInfo.path, ORCH, TASK);
    const parent = { branch: `topic/${TASK}`, path: parentWtInfo.path, taskDir: parentTaskDir };
    const childWtInfo = await ensureChildWorktree(repo, parent, EPIC);
    const childTaskDir = path.join(childWtInfo.path, ORCH, TASK, EPIC);
    fs.mkdirSync(path.join(childTaskDir, "concerns"), { recursive: true });

    return {
      repo,
      project,
      pipeline,
      prompts,
      parent,
      parentWt: parentWtInfo.path,
      parentTaskDir,
      childTaskDir,
    };
  }

  it("copies open and routed concerns with an [epic] summary while dismissed stays local", async () => {
    const openDetail = "d".repeat(120);
    await writeConcern(
      childTaskDir,
      childConcern({
        id: "c-child-open",
        kind: "risk",
        summary: "Epic-visible risk",
        detail: openDetail,
        severity: "high",
      })
    );
    await writeConcern(
      childTaskDir,
      childConcern({
        id: "c-child-routed",
        kind: "blocker",
        summary: "Routed blocker",
        detail: "needs epic attention",
        status: "routed",
        source: { record: "004-review-a1", agent: "reviewer", item: "child-item" },
      })
    );
    await writeConcern(
      childTaskDir,
      childConcern({ id: "c-child-dismissed", summary: "Dismissed local", status: "dismissed" })
    );
    await writeConcern(
      childTaskDir,
      childConcern({ id: "c-child-resolved", summary: "Resolved local", status: "resolved" })
    );
    await writeRemarkable(
      childTaskDir,
      childRemarkable({
        id: "rm-child-1",
        chosen: "Use SQLite",
        alternatives: ["Postgres"],
        why: "small why",
      })
    );

    await propagateEpicConcerns({
      childTaskDir,
      parentTaskDir,
      parentWt,
      epic: EPIC,
    });

    const copies = await listConcerns(parentTaskDir);
    expect(copies).toHaveLength(2);

    const openSummary = `[epic] Epic-visible risk`;
    const openCopy = copies.find((c) => c.summary === openSummary);
    expect(openCopy).toBeDefined();
    expect(openCopy!.id).toBe(concernFingerprint({ kind: "risk", summary: openSummary }));
    expect(openCopy!.status).toBe("open");
    expect(openCopy!.detail).toBe(openDetail);
    expect(sourceEpic(openCopy!)).toBe(EPIC);
    expect(openCopy!.source.record).toBe(`epic:${EPIC}/002-develop-a1`);
    expect(fs.existsSync(path.join(parentTaskDir, "concerns", `${openCopy!.id}.yaml`))).toBe(true);

    const routedSummary = `[epic] Routed blocker`;
    const routedCopy = copies.find((c) => c.summary === routedSummary);
    expect(routedCopy).toBeDefined();
    expect(routedCopy!.id).toBe(concernFingerprint({ kind: "blocker", summary: routedSummary }));
    expect(routedCopy!.status).toBe("open");
    expect(routedCopy!.source.record).toBe(`epic:${EPIC}/004-review-a1`);

    expect(copies.some((c) => c.summary.includes("Dismissed local"))).toBe(false);
    expect(copies.some((c) => c.summary.includes("Resolved local"))).toBe(false);

    const remarkables = readRemarkables(parentTaskDir);
    expect(remarkables).toHaveLength(1);
    const copiedRemark = remarkables[0]!;
    expect(copiedRemark.chosen).toBe("[epic] Use SQLite");
    expect(copiedRemark.id).not.toBe("rm-child-1");
    expect(copiedRemark.id).toMatch(/^rm-[0-9a-f]{10}$/);
    expect(fs.existsSync(path.join(parentTaskDir, "concerns", `${copiedRemark.id}.yaml`))).toBe(true);
  });

  it("condenses long detail and why to the byte cap on a char boundary", async () => {
    const detail800 = "\u754c".repeat(266) + "ab"; // 3*266 + 2 = 800 UTF-8 bytes
    const detail2000 = "\u00e9".repeat(1000); // 2*1000 = 2000 UTF-8 bytes
    const detail121 = "x".repeat(121);
    const why800 = "\u754c".repeat(266) + "ab";
    expect(utf8Bytes(detail800)).toBe(800);
    expect(utf8Bytes(detail2000)).toBe(2000);
    expect(utf8Bytes(detail121)).toBe(121);

    await writeConcern(
      childTaskDir,
      childConcern({ id: "c-detail-800", summary: "Detail 800", detail: detail800 })
    );
    await writeConcern(
      childTaskDir,
      childConcern({ id: "c-detail-2000", summary: "Detail 2000", detail: detail2000 })
    );
    await writeConcern(
      childTaskDir,
      childConcern({ id: "c-detail-121", summary: "Detail 121", detail: detail121 })
    );
    await writeRemarkable(
      childTaskDir,
      childRemarkable({ id: "rm-long-why", chosen: "Long why decision", why: why800 })
    );

    await propagateEpicConcerns({ childTaskDir, parentTaskDir, parentWt, epic: EPIC });

    const copies = await listConcerns(parentTaskDir);
    const copyOf = (summary: string) => {
      const copy = copies.find((c) => c.summary === summary);
      expect(copy).toBeDefined();
      return copy!;
    };

    const condensed800 = copyOf("[epic] Detail 800").detail;
    expect(utf8Bytes(condensed800)).toBeLessThanOrEqual(400); // min(500, 800/2)
    expect(utf8Bytes(condensed800)).toBeLessThan(800);
    expect(detail800.startsWith(condensed800)).toBe(true);
    expect(condensed800.includes("\uFFFD")).toBe(false);

    const condensed2000 = copyOf("[epic] Detail 2000").detail;
    expect(utf8Bytes(condensed2000)).toBeLessThanOrEqual(500); // capped at 500 bytes
    expect(utf8Bytes(condensed2000)).toBeLessThan(2000);
    expect(detail2000.startsWith(condensed2000)).toBe(true);
    expect(condensed2000.includes("\uFFFD")).toBe(false);

    const condensed121 = copyOf("[epic] Detail 121").detail;
    expect(utf8Bytes(condensed121)).toBeLessThanOrEqual(60); // min(500, floor(121/2))
    expect(utf8Bytes(condensed121)).toBeLessThan(121);
    expect(detail121.startsWith(condensed121)).toBe(true);

    const remarkables = readRemarkables(parentTaskDir);
    const copiedRemark = remarkables.find((r) => r.chosen === "[epic] Long why decision");
    expect(copiedRemark).toBeDefined();
    expect(utf8Bytes(copiedRemark!.why)).toBeLessThanOrEqual(400);
    expect(utf8Bytes(copiedRemark!.why)).toBeLessThan(800);
    expect(why800.startsWith(copiedRemark!.why)).toBe(true);
  });

  it("is restart-idempotent and preserves parent triage", async () => {
    await writeConcern(
      childTaskDir,
      childConcern({ id: "c-restart", summary: "Restart-safe risk", detail: "original detail" })
    );
    await writeRemarkable(
      childTaskDir,
      childRemarkable({ id: "rm-restart", chosen: "Keep queue", why: "queue is durable" })
    );

    await propagateEpicConcerns({ childTaskDir, parentTaskDir, parentWt, epic: EPIC });
    const firstCopies = await listConcerns(parentTaskDir);
    expect(firstCopies).toHaveLength(1);
    const copyId = firstCopies[0]!.id;
    const firstRemark = readRemarkables(parentTaskDir)[0]!;

    await writeYamlAtomic(path.join(parentTaskDir, "concerns", `${copyId}.yaml`), {
      ...firstCopies[0]!,
      status: "dismissed",
      disposition: "dismiss",
      dismissReason: "operator dismissed",
    });
    await writeYamlAtomic(path.join(parentTaskDir, "concerns", `${firstRemark.id}.yaml`), {
      ...firstRemark,
      status: "dismissed",
    });

    await propagateEpicConcerns({ childTaskDir, parentTaskDir, parentWt, epic: EPIC });

    const secondCopies = await listConcerns(parentTaskDir);
    expect(secondCopies).toHaveLength(1);
    expect(secondCopies[0]!.id).toBe(copyId);
    expect(secondCopies[0]!.status).toBe("dismissed");
    expect(secondCopies[0]!.dismissReason).toBe("operator dismissed");

    const secondRemarkables = readRemarkables(parentTaskDir);
    expect(secondRemarkables).toHaveLength(1);
    expect(secondRemarkables[0]!.id).toBe(firstRemark.id);
    expect(secondRemarkables[0]!.status).toBe("dismissed");

    const local = await listConcerns(childTaskDir);
    expect(local).toHaveLength(1);
    expect(local[0]!.status).toBe("open");
    expect(local[0]!.id).toBe("c-restart");
  });

  it("forwards blocked child questions as q-epic-* with mapped blocks", async () => {
    const childSteerDir = path.join(childTaskDir, "steer", "tousertoreview");
    fs.mkdirSync(childSteerDir, { recursive: true });
    const childQuestions = [
      {
        id: "q-child-item-abc",
        ref: "child-item",
        disposition: "human-async",
        question: "Approve child item?",
        blocks: ["child-item"],
        status: "open",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "q-task-def",
        ref: "task",
        disposition: "human-stop",
        question: "Stop everything?",
        blocks: ["task", "child-item"],
        status: "open",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "q-no-blocks",
        ref: "child-item",
        disposition: "human-awareness",
        question: "FYI only",
        blocks: [],
        status: "open",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    for (const q of childQuestions) {
      await writeYamlAtomic(path.join(childSteerDir, `${q.id}.yaml`), q);
    }
    const beforeChildFiles = questionFiles(childTaskDir).map((name) =>
      fs.readFileSync(path.join(childSteerDir, name), "utf8")
    );

    await propagateEpicConcerns({ childTaskDir, parentTaskDir, parentWt, epic: EPIC });

    expect(questionFiles(parentTaskDir)).toEqual([
      `q-epic-${EPIC}-child-item-abc.yaml`,
      `q-epic-${EPIC}-task-def.yaml`,
    ]);

    const parentSteerDir = path.join(parentTaskDir, "steer", "tousertoreview");
    const itemQuestion = yaml.parse(
      fs.readFileSync(path.join(parentSteerDir, `q-epic-${EPIC}-child-item-abc.yaml`), "utf8")
    );
    expect(itemQuestion.id).toBe(`q-epic-${EPIC}-child-item-abc`);
    expect(itemQuestion.blocks).toEqual([EPIC]);
    expect(itemQuestion.question).toBe("Approve child item?");
    expect(itemQuestion.disposition).toBe("human-async");
    expect(itemQuestion.status).toBe("open");

    const taskQuestion = yaml.parse(
      fs.readFileSync(path.join(parentSteerDir, `q-epic-${EPIC}-task-def.yaml`), "utf8")
    );
    expect(taskQuestion.blocks).toEqual([TASK, EPIC]);

    const afterChildFiles = questionFiles(childTaskDir).map((name) =>
      fs.readFileSync(path.join(childSteerDir, name), "utf8")
    );
    expect(afterChildFiles).toEqual(beforeChildFiles);
    expect(questionFiles(childTaskDir)).toHaveLength(3);
  });

  it("hydrates propagated copies into the saga architect concernsYaml", async () => {
    await writeConcern(
      childTaskDir,
      childConcern({
        id: "c-saga-visible",
        kind: "blocker",
        summary: "Saga-visible blocker",
        detail: "short detail",
        severity: "high",
      })
    );

    await propagateEpicConcerns({ childTaskDir, parentTaskDir, parentWt, epic: EPIC });
    const copyId = concernFingerprint({
      kind: "blocker",
      summary: "[epic] Saga-visible blocker",
    });

    const hydrated = await hydrateStepConcerns(parentTaskDir, {
      stepRole: "architect-wave-report",
      inputBytes: 10_000,
    });
    expect(hydrated).toContain(copyId);
    expect(hydrated).toContain("[epic] Saga-visible blocker");
    const records = yaml.parse(hydrated) as Array<Record<string, unknown>>;
    expect(
      records.some(
        (r) => r.id === copyId && r.summary === "[epic] Saga-visible blocker"
      )
    ).toBe(true);
  });

  it("runTask exits 0 when only open copies were propagated", async () => {
    const {
      repo,
      project,
      pipeline,
      prompts,
      parentWt,
      parentTaskDir: deployedParentDir,
      childTaskDir: deployedChildDir,
    } = await createWorktreePair();

    const longDetail = "\u754c".repeat(266) + "ab";
    await writeYamlAtomic(
      path.join(deployedChildDir, "concerns", "c-open-child.yaml"),
      childConcern({ id: "c-open-child", summary: "Open child risk", detail: longDetail })
    );
    await writeYamlAtomic(
      path.join(deployedChildDir, "concerns", "c-dismissed-child.yaml"),
      childConcern({ id: "c-dismissed-child", summary: "Dismissed child risk", status: "dismissed" })
    );

    const harness = new FakeHarness();
    harness.scriptOutcome(`${TASK}/runs/triage#a1`, {
      ok: true,
      data: { kind: "saga", rationale: "Epic umbrella", citations: [] },
    });
    harness.scriptOutcome(`${TASK}/runs/infra#a1`, {
      ok: true,
      data: { setup: [], gates: [{ id: "t", command: "true" }], testRunner: { command: "true" } },
    });
    harness.scriptOutcome(`${TASK}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: [{ slug: EPIC, kind: "epic", title: "Big epic", milestoneId: "m1" }],
        epics: [{ slug: EPIC, intent: "Epic intent: build the big feature.\n" }],
      },
    });
    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: { status: "approved", summary: "ok", suggestions: [] },
    });
    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        items: [
          {
            slug: EPIC,
            outlineRef: EPIC,
            kind: "epic",
            title: "Big epic",
            assignment: "Run epic",
            milestone: "m1",
            wave: 1,
          },
        ],
      },
    });

    const childTask = `${TASK}--${EPIC}`;
    harness.scriptOutcome(`${childTask}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "Child M1" }],
        itemOutlines: [{ slug: "child-item", kind: "dev", title: "Child item", milestoneId: "m1" }],
      },
    });
    harness.scriptOutcome(`${childTask}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: { status: "approved", summary: "child plan ok", suggestions: [] },
    });
    harness.scriptOutcome(`${childTask}/runs/pm-edits-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        items: [
          {
            slug: "child-item",
            outlineRef: "child-item",
            kind: "dev",
            title: "Child item",
            assignment: "Child work",
            milestone: "m1",
            wave: 1,
          },
        ],
      },
    });
    harness.scriptOutcome(`${childTask}/items/child-item/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "epic-feature.ts"), "export const epic = true;\n");
      return { ok: true, data: { status: "ok", summary: "Epic feature done" } };
    });
    harness.scriptOutcome(`${childTask}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["child-item"], summary: "Child wave ok" },
    });
    harness.scriptOutcome(`${childTask}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: { id: "dec-c1", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    harness.scriptOutcome(`${childTask}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Child milestones done" },
    });
    harness.scriptOutcome(`${childTask}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Child task delivered" },
    });

    harness.scriptOutcome(`${TASK}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: [EPIC], summary: "Parent wave ok" },
    });
    harness.scriptOutcome(`${TASK}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: { id: "dec-p1", context: "wave", decision: "continue", timestamp: new Date().toISOString() },
    });
    harness.scriptOutcome(`${TASK}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Parent milestones done" },
    });
    harness.scriptOutcome(`${TASK}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Parent task delivered" },
    });

    const res = await runTask(
      { harness, repo, project, pipelineFor: async () => pipeline, prompts },
      TASK
    );

    expect(res.status).toBe("done");
    expect(res.exitCode).toBe(0);

    const copies = await listConcerns(deployedParentDir);
    expect(copies).toHaveLength(1);
    const copy = copies[0]!;
    expect(copy.summary).toBe("[epic] Open child risk");
    expect(copy.status).toBe("open");
    expect(sourceEpic(copy)).toBe(EPIC);
    expect(utf8Bytes(copy.detail)).toBeLessThanOrEqual(400);
    expect(utf8Bytes(copy.detail)).toBeLessThan(800);
    expect(longDetail.startsWith(copy.detail)).toBe(true);

    expect(fs.existsSync(path.join(deployedParentDir, "items", EPIC, "child-closeup.yaml"))).toBe(true);
    expect(questionFiles(deployedParentDir)).toEqual([]);
    // Merge cleanup removes the epic child worktree but keeps its branch;
    // no-back-sync is verified via branch content, not worktree persistence.
    expect(fs.existsSync(deployedChildDir)).toBe(false);
    const epicBranch = `topic/${TASK}--${EPIC}`;
    const branchCheck = tmpRepo.git(["rev-parse", "--verify", `refs/heads/${epicBranch}`], { allowFail: true });
    expect(branchCheck.code).toBe(0);
    const openRel = path.posix.join(ORCH, TASK, EPIC, "concerns", "c-open-child.yaml");
    const dismissedRel = path.posix.join(ORCH, TASK, EPIC, "concerns", "c-dismissed-child.yaml");
    const openShow = tmpRepo.git(["show", `${epicBranch}:${openRel}`]);
    expect(openShow.stdout).toContain("Open child risk");
    expect(openShow.stdout).not.toContain("[epic]");
    const dismissedShow = tmpRepo.git(["show", `${epicBranch}:${dismissedRel}`]);
    expect(dismissedShow.stdout).toContain("Dismissed child risk");
    expect(dismissedShow.stdout).toContain("dismissed");

    // The existing child-closeup commit covers the propagated copies too.
    const closeupRel = path.posix.join(ORCH, TASK, "items", EPIC, "child-closeup.yaml");
    const copyRel = path.posix.join(ORCH, TASK, "concerns", `${copy.id}.yaml`);
    const commit = tmpRepo
      .git(["log", "-1", "--format=%H", "--", closeupRel], { cwd: parentWt })
      .stdout.trim();
    expect(commit.length).toBeGreaterThan(0);
    const committedFiles = tmpRepo
      .git(["show", "--name-only", "--format=", commit], { cwd: parentWt })
      .stdout;
    expect(committedFiles).toContain(closeupRel);
    expect(committedFiles).toContain(copyRel);
  }, 60000);

  it("propagates after a failed child iteration as well", async () => {
    const { repo, project, pipeline, prompts, parent, parentTaskDir: deployedParentDir, childTaskDir: deployedChildDir } =
      await createWorktreePair();
    await writeYamlAtomic(
      path.join(deployedChildDir, "concerns", "c-failed-child.yaml"),
      childConcern({ id: "c-failed-child", summary: "Failed child risk", detail: "local detail" })
    );

    const harness = new FakeHarness();
    harness.scriptOutcome(`${TASK}--${EPIC}/runs/architect-plan-1#a1`, {
      ok: false,
      error: "architect unavailable",
    });

    const res = await runChildTask(
      { harness, repo, project, pipelineFor: async () => pipeline, prompts },
      parent,
      EPIC
    );

    expect(res.status).toBe("failed");
    expect(res.exitCode).toBe(1);
    const copies = await listConcerns(deployedParentDir);
    expect(copies).toHaveLength(1);
    expect(copies[0]!.summary).toBe("[epic] Failed child risk");
    expect(copies[0]!.status).toBe("open");
    expect(copies[0]!.detail).toBe("local detail");
    expect(
      fs.existsSync(path.join(deployedParentDir, "items", EPIC, "child-closeup.yaml"))
    ).toBe(true);
  }, 60000);
});
