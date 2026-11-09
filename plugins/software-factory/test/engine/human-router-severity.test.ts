import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runAgentStep } from "../../src/core/flows/step-runner.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
import { readJournal } from "../../src/core/journal.js";
import { questionBlocks } from "../../src/core/steer.js";
import { concernFingerprint } from "../../src/core/concerns.js";
import {
  applyReviewTriage,
  listHydratedConcerns,
} from "../../src/core/triage.js";
import {
  collectRoutedBlockers,
  deriveTaskState,
} from "../../src/core/derive/task.js";
import type {
  Concern,
  ConcernSeverity,
  PipelineConfig,
  ProjectConfig,
  ReviewSuggestion,
  StoredConcernArtifact,
} from "../../src/core/artifacts.js";

/**
 * Single human-disposition router + active severity policy (§18; ADRs
 * adr-human-router-single, adr-severity-policy-active, adr-hydrated-sets).
 *
 * Every triager's human-* disposition is routed by the same triage/ingest path:
 * - human-async blocks [item] for items, [task] for plan/close-up triage;
 * - human-stop blocks item+task (or task) and therefore halts with exit 10;
 * - human-awareness, routed rm-*, and dismissed escalated concerns become a
 *   digest entry (human-awareness, blocks []) that never blocks or halts;
 * - rm-* is exempt from severity thresholds;
 * - severity below `concerns.minBlockingSeverity` downgrades blocking
 *   dispositions to the digest, and below `concerns.minDigestSeverity` the
 *   concern is not surfaced at all. Defaults are medium/high (code fallback).
 *
 * Routed blockers honor `minBlockingSeverity` in derive (default high), and the
 * item-machine raw question path never double-writes a concern-id question.
 */

const ORCH = ".factory";
const TASK = "router-severity";
const agentsDir = path.resolve(import.meta.dir, "../../agents");

const baseConcernsReviewPolicy = [
  "fix",
  "optional",
  "architect",
  "human-awareness",
  "human-async",
  "human-stop",
];

function makePipeline(concerns?: PipelineConfig["concerns"]): PipelineConfig {
  return {
    models: {
      roles: {
        workhorse: { model: "model-workhorse" },
        "alt-workhorse": { model: "model-alt-workhorse" },
        architect: { model: "model-architect" },
        "alt-architect": { model: "model-alt-architect" },
        simpler: { model: "model-simpler" },
      },
    },
    agents: {
      developer: { role: "workhorse" },
      reviewer: { role: "alt-workhorse" },
      qa: { role: "alt-workhorse" },
      "plan-reviewer": { role: "alt-architect" },
      "wave-close-up": { role: "alt-workhorse" },
      "plan-close-up": { role: "alt-workhorse" },
      architect: { role: "architect" },
      pm: { role: "alt-workhorse" },
    },
    flows: { simple: { steps: [] }, story: { dev: { steps: [] } }, spike: {} },
    reviewPolicy: { default: baseConcernsReviewPolicy },
    limits: {},
    ...(concerns ? { concerns } : {}),
  };
}

type ConcernOverrides = Partial<StoredConcernArtifact> & { id: string };

function storedConcern(overrides: ConcernOverrides): StoredConcernArtifact {
  return {
    kind: "risk",
    summary: `Concern ${overrides.id}`,
    detail: "detail",
    severity: "medium",
    status: "open",
    source: { record: "001-develop-a1", agent: "developer" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function writeConcernAt(taskDir: string, concern: StoredConcernArtifact): string {
  const file = path.join(taskDir, "concerns", `${concern.id}.yaml`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(concern, null, 2), "utf8");
  return file;
}

function writeItem(taskDir: string, slug: string, deps: string[] = []): void {
  const dir = path.join(taskDir, "items", slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "assignment.yaml"),
    [
      `slug: ${slug}`,
      "kind: dev",
      `title: ${slug}`,
      "assignment: Do the work",
      "wave: 1",
      deps.length > 0 ? `deps:\n${deps.map((d) => `  - ${d}`).join("\n")}` : "deps: []",
    ].join("\n") + "\n",
    "utf8"
  );
}

describe("Single human router (adr-human-router-single)", () => {
  let tmpRepo: TmpRepo;
  let repo: Repo;
  let taskWt: string;
  let taskDir: string;
  let worktreeRoot: string;
  let project: ProjectConfig;
  let prompts: ReturnType<typeof loadPromptLibrary>;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    worktreeRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
    taskWt = tmpRepo.dir;
    taskDir = path.join(taskWt, ORCH, TASK);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Router severity\n", "utf8");
    tmpRepo.commit("add router severity task");
    project = { orchestrationFolder: ORCH, worktreeRoot };
    prompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [] });
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  function concernFiles(): string[] {
    const dir = path.join(taskDir, "concerns");
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((n) => n.startsWith("c-") && n.endsWith(".yaml"))
      .map((n) => n.slice(0, -".yaml".length))
      .sort();
  }

  function mailboxFiles(): string[] {
    const dir = path.join(taskDir, "steer", "tousertoreview");
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((n) => n.endsWith(".yaml")).sort();
  }

  async function readQuestion(id: string): Promise<Record<string, any>> {
    return readYaml<Record<string, any>>(
      path.join(taskDir, "steer", "tousertoreview", `${id}.yaml`)
    );
  }

  async function reviewOnce(suggestions: ReviewSuggestion[], item?: string) {
    return applyReviewTriage({
      taskDir,
      taskWt,
      repo,
      isTriager: true,
      concernIds: [...concernFiles(), ...(fs.existsSync(path.join(taskDir, "concerns"))
        ? fs
            .readdirSync(path.join(taskDir, "concerns"))
            .filter((n) => n.startsWith("rm-") && n.endsWith(".yaml"))
            .map((n) => n.slice(0, -".yaml".length))
        : [])],
      ...(item ? { item } : {}),
      suggestions,
    });
  }

  it("routes a plan-reviewer human-stop to one concern question that blocks the task", async () => {
    const cid = "c-1111111111";
    writeConcernAt(taskDir, storedConcern({ id: cid, kind: "blocker", severity: "high", status: "open" }));

    const suggestion: ReviewSuggestion = {
      id: cid,
      disposition: "human-stop",
      summary: "Irreversible data-loss hazard",
      detail: "Stop before writing anything else",
    };
    await reviewOnce([suggestion]);
    // Dedup by existence: a re-run must not create a second mailbox entry.
    await reviewOnce([suggestion]);

    expect(mailboxFiles()).toEqual([`q-concern-${cid}.yaml`]);
    const q = await readQuestion(`q-concern-${cid}`);
    expect(q.id).toBe(`q-concern-${cid}`);
    expect(q.disposition).toBe("human-stop");
    // Plan/close-up triage has no item context: the blocker is the whole task.
    expect([...(q.blocks ?? [])].sort()).toEqual(["task"]);
    expect(questionBlocks(q as any, "task")).toBe(true);

    const stored = await readYaml<StoredConcernArtifact>(
      path.join(taskDir, "concerns", `${cid}.yaml`)
    );
    expect(stored.status).toBe("routed");
    expect(stored.disposition).toBe("human-stop");
  });

  it("routes a close-up human-async to the task when there is no item context", async () => {
    const cid = "c-2222222222";
    writeConcernAt(taskDir, storedConcern({ id: cid, kind: "question", severity: "high", status: "open" }));

    await reviewOnce([
      {
        id: cid,
        disposition: "human-async",
        summary: "Which storage backend?",
        detail: "The operator must choose before the plan proceeds",
      },
    ]);

    expect(mailboxFiles()).toEqual([`q-concern-${cid}.yaml`]);
    const q = await readQuestion(`q-concern-${cid}`);
    expect(q.disposition).toBe("human-async");
    expect([...(q.blocks ?? [])]).toEqual(["task"]);
    expect(questionBlocks(q as any, "task")).toBe(true);
  });

  it("shows a plan-reviewer routed architect concern in the next architect hydration", async () => {
    const cid = "c-2222222223";
    writeConcernAt(
      taskDir,
      storedConcern({ id: cid, kind: "risk", severity: "high", status: "open", affects: ["item-a"] })
    );

    await reviewOnce([
      { id: cid, disposition: "architect", summary: "Architect must decide on the cache contract" },
    ]);

    const stored = await readYaml<StoredConcernArtifact>(
      path.join(taskDir, "concerns", `${cid}.yaml`)
    );
    expect(stored.status).toBe("routed");
    expect(stored.disposition).toBe("architect");

    const architectSet = await listHydratedConcerns(taskDir, "architect");
    expect(architectSet.find((r) => r.id === cid)).toMatchObject({
      id: cid,
      kind: "risk",
      severity: "high",
      disposition: "architect",
    });
    // Routed concerns are architect/close-up input, not reviewer input.
    const reviewSet = await listHydratedConcerns(taskDir, "review");
    expect(reviewSet.some((r) => r.id === cid)).toBe(false);
  });

  it("turns routed remarkable decisions into digest-only entries regardless of disposition", async () => {
    const stopRm = "rm-3333333333";
    const architectRm = "rm-4444444444";
    fs.mkdirSync(path.join(taskDir, "concerns"), { recursive: true });
    for (const id of [stopRm, architectRm]) {
      await writeYamlAtomic(path.join(taskDir, "concerns", `${id}.yaml`), {
        id,
        chosen: `Chosen ${id}`,
        alternatives: ["Alternative"],
        why: "Tradeoff recorded for the operator",
        status: "open",
        source: { record: "001-architect-a1", agent: "architect" },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    }

    await reviewOnce([
      { id: stopRm, disposition: "human-stop", summary: "Blocking-looking remarkable" },
      { id: architectRm, disposition: "architect", summary: "Routed remarkable" },
    ]);

    expect(mailboxFiles().sort()).toEqual(
      [`q-concern-${stopRm}.yaml`, `q-concern-${architectRm}.yaml`].sort()
    );
    for (const id of [stopRm, architectRm]) {
      const q = await readQuestion(`q-concern-${id}`);
      expect(q.disposition).toBe("human-awareness");
      expect(q.blocks ?? []).toEqual([]);
      expect(questionBlocks(q as any, "task")).toBe(false);
    }
  });

  it("digests a dismissed escalated concern as q-escalated while keeping the dismissal", async () => {
    const cid = "c-5555555555";
    writeConcernAt(
      taskDir,
      storedConcern({
        id: cid,
        kind: "risk",
        severity: "high",
        status: "open",
        source: { record: "001-develop-a1", agent: "developer", escalated: true },
      })
    );

    await reviewOnce([
      {
        id: cid,
        disposition: "dismiss",
        summary: "Already covered by the plan",
        detail: "Superseded by milestone m2",
      },
    ]);

    expect(mailboxFiles()).toEqual([`q-escalated-${cid}.yaml`]);
    const q = await readQuestion(`q-escalated-${cid}`);
    expect(q.disposition).toBe("human-awareness");
    expect(q.blocks ?? []).toEqual([]);
    expect(questionBlocks(q as any, "task")).toBe(false);

    const stored = await readYaml<StoredConcernArtifact>(
      path.join(taskDir, "concerns", `${cid}.yaml`)
    );
    expect(stored.status).toBe("dismissed");
    expect(stored.dismissReason).toBe("Superseded by milestone m2");
    expect(concernFiles()).toEqual([cid]);
  });

  it("keeps an ordinary dismissal on disk with its reason and produces no mailbox effect", async () => {
    const cid = "c-6666666666";
    writeConcernAt(
      taskDir,
      storedConcern({ id: cid, severity: "high", status: "open", affects: ["item-1"] })
    );

    await reviewOnce([
      { id: cid, disposition: "dismiss", summary: "Not actionable", detail: "By design" },
    ]);

    expect(mailboxFiles()).toEqual([]);
    const stored = await readYaml<StoredConcernArtifact>(
      path.join(taskDir, "concerns", `${cid}.yaml`)
    );
    expect(stored.status).toBe("dismissed");
    expect(stored.dismissReason).toBe("By design");
    expect(concernFiles()).toEqual([cid]);
  });

  it("suppresses human-awareness digests below minDigestSeverity and downgrades stops below minBlockingSeverity", async () => {
    const high = "c-7777777771";
    const medium = "c-7777777772";
    const low = "c-7777777773";
    writeConcernAt(taskDir, storedConcern({ id: high, severity: "high", status: "open" }));
    writeConcernAt(taskDir, storedConcern({ id: medium, severity: "medium", status: "open" }));
    writeConcernAt(taskDir, storedConcern({ id: low, severity: "low", status: "open" }));

    const harness = new FakeHarness();
    const data = {
      status: "approved",
      summary: "Plan review with human routes",
      suggestions: [
        { id: high, disposition: "human-stop", summary: "High severity stop" },
        { id: medium, disposition: "human-stop", summary: "Medium severity stop" },
        { id: low, disposition: "human-awareness", summary: "Low severity awareness" },
      ],
    };
    const label = `${TASK}/runs/plan-review#a1`;
    harness.scriptOutcome(label, { ok: true, data });
    harness.scriptOutcome(`${label}#relaunch`, { ok: true, data });

    // No pipeline.concerns: the code fallback must be medium/high.
    const result = await runAgentStep({
      task: TASK,
      stepId: "plan-review",
      stepFragment: "steps/plan-review",
      agent: "plan-reviewer",
      role: "alt-architect",
      cwd: taskWt,
      taskWt,
      taskDir,
      recordsDir: path.join(taskDir, "runs"),
      repo,
      harness,
      pipeline: makePipeline(),
      project,
      prompts,
      promptVars: {
        plan: "{}",
        intent: "# Intent",
        context: "",
        limits: "",
        dispositionsCriteria: "Use the review disposition vocabulary.",
      },
    });
    expect(result.status).toBe("ok");

    expect(mailboxFiles().sort()).toEqual(
      [`q-concern-${high}.yaml`, `q-concern-${medium}.yaml`].sort()
    );
    const highQ = await readQuestion(`q-concern-${high}`);
    expect(highQ.disposition).toBe("human-stop");
    expect([...(highQ.blocks ?? [])].sort()).toEqual(["task"]);

    const mediumQ = await readQuestion(`q-concern-${medium}`);
    expect(mediumQ.disposition).toBe("human-awareness");
    expect(mediumQ.blocks ?? []).toEqual([]);
    expect(questionBlocks(mediumQ as any, "task")).toBe(false);

    expect(mailboxFiles()).not.toContain(`q-concern-${low}.yaml`);
  });

  it("digests a low-severity routed blocker when minDigest is low but never derives it as blocking", async () => {
    const cid = "c-8888888888";
    writeConcernAt(
      taskDir,
      storedConcern({
        id: cid,
        kind: "blocker",
        severity: "low",
        status: "open",
        affects: ["item-low"],
      })
    );
    writeItem(taskDir, "item-low");

    const pipeline = makePipeline({ minDigestSeverity: "low", minBlockingSeverity: "high" });
    const harness = new FakeHarness();
    const data = {
      status: "approved",
      summary: "Low-severity blocker needs a digest",
      suggestions: [
        { id: cid, disposition: "human-awareness", summary: "Low-severity blocker" },
      ],
    };
    const label = `${TASK}/runs/plan-review#a1`;
    harness.scriptOutcome(label, { ok: true, data });
    harness.scriptOutcome(`${label}#relaunch`, { ok: true, data });
    const result = await runAgentStep({
      task: TASK,
      stepId: "plan-review",
      stepFragment: "steps/plan-review",
      agent: "plan-reviewer",
      role: "alt-architect",
      cwd: taskWt,
      taskWt,
      taskDir,
      recordsDir: path.join(taskDir, "runs"),
      repo,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: {
        plan: "{}",
        intent: "# Intent",
        context: "",
        limits: "",
        dispositionsCriteria: "Use the review disposition vocabulary.",
      },
    });
    expect(result.status).toBe("ok");

    expect(mailboxFiles()).toEqual([`q-concern-${cid}.yaml`]);
    const q = await readQuestion(`q-concern-${cid}`);
    expect(q.disposition).toBe("human-awareness");
    expect(questionBlocks(q as any, "task")).toBe(false);

    // Hydrated for the architect, but not a routing/blocking input at high.
    const architectSet = await listHydratedConcerns(taskDir, "architect");
    expect(architectSet.some((r) => r.id === cid)).toBe(true);
    const blockedAtHigh = await (
      collectRoutedBlockers as (dir: string, min?: ConcernSeverity) => Promise<Set<string>>
    )(taskDir, "high");
    expect(blockedAtHigh.has("item-low")).toBe(false);
    const blockedAtLow = await (
      collectRoutedBlockers as (dir: string, min?: ConcernSeverity) => Promise<Set<string>>
    )(taskDir, "low");
    expect(blockedAtLow.has("item-low")).toBe(true);

    const state = await deriveTaskState({ taskDir, task: TASK, taskWt, pipeline });
    expect(state.itemMap["item-low"]?.status).toBe("pending");
    expect(state.status).not.toBe("blocked");
  });
});

describe("Severity policy in derive (adr-severity-policy-active)", () => {
  const tmpDirs: string[] = [];

  function makeTaskDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-router-severity-"));
    tmpDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("collectRoutedBlockers filters routed blockers by minBlockingSeverity, defaulting to high", async () => {
    const taskDir = makeTaskDir();
    writeConcernAt(taskDir, storedConcern({
      id: "c-high0000001",
      kind: "blocker",
      status: "routed",
      severity: "high",
      affects: ["item-high"],
    }));
    writeConcernAt(taskDir, storedConcern({
      id: "c-medium00001",
      kind: "blocker",
      status: "routed",
      severity: "medium",
      affects: ["item-medium"],
    }));
    writeConcernAt(taskDir, storedConcern({
      id: "c-low00000001",
      kind: "blocker",
      status: "routed",
      severity: "low",
      affects: ["item-low"],
    }));
    writeConcernAt(taskDir, storedConcern({
      id: "c-highrisk001",
      kind: "risk",
      status: "routed",
      severity: "high",
      affects: ["item-risk"],
    }));
    writeConcernAt(taskDir, storedConcern({
      id: "c-highopen001",
      kind: "blocker",
      status: "open",
      severity: "high",
      affects: ["item-open"],
    }));

    const collect = collectRoutedBlockers as (
      dir: string,
      min?: ConcernSeverity
    ) => Promise<Set<string>>;
    expect([...(await collect(taskDir))].sort()).toEqual(["item-high"]);
    expect([...(await collect(taskDir, "high"))].sort()).toEqual(["item-high"]);
    expect([...(await collect(taskDir, "medium"))].sort()).toEqual(["item-high", "item-medium"]);
    expect([...(await collect(taskDir, "low"))].sort()).toEqual([
      "item-high",
      "item-low",
      "item-medium",
    ]);
  });

  it("threads pipeline.concerns.minBlockingSeverity into task derivation with a high fallback", async () => {
    const taskDir = makeTaskDir();
    writeItem(taskDir, "blocker-source");
    writeItem(taskDir, "dependent", ["blocker-source"]);
    writeConcernAt(taskDir, storedConcern({
      id: "c-mediumblk01",
      kind: "blocker",
      status: "routed",
      severity: "medium",
      affects: ["blocker-source"],
    }));

    // Absent pipeline config falls back to high: a medium blocker is not blocking.
    const fallback = await deriveTaskState({ taskDir, task: "router-severity", taskWt: makeTaskDir() });
    expect(fallback.itemMap["blocker-source"]?.status).toBe("pending");
    expect(fallback.itemMap["dependent"]?.status).toBe("pending");
    expect(fallback.status).not.toBe("blocked");

    // An explicit medium threshold activates the routed blocker cascade.
    const threadedPipeline = makePipeline({ minBlockingSeverity: "medium" });
    const threaded = await deriveTaskState({
      taskDir,
      task: "router-severity",
      taskWt: taskDir,
      pipeline: threadedPipeline,
    });
    expect(threaded.itemMap["blocker-source"]?.status).toBe("blocked");
    expect(threaded.itemMap["dependent"]?.status).toBe("blocked");
    expect(threaded.status).toBe("blocked");
  });
});

describe("Ingest allowlist (adr-severity-policy-active)", () => {
  let tmpRepo: TmpRepo;
  let repo: Repo;
  let taskWt: string;
  let taskDir: string;
  let worktreeRoot: string;
  let project: ProjectConfig;
  let prompts: ReturnType<typeof loadPromptLibrary>;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    worktreeRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
    taskWt = tmpRepo.dir;
    taskDir = path.join(taskWt, ORCH, TASK);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Allowlist\n", "utf8");
    tmpRepo.commit("add allowlist task");
    project = { orchestrationFolder: ORCH, worktreeRoot };
    prompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [] });
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  function concernFiles(): string[] {
    const dir = path.join(taskDir, "concerns");
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((n) => n.startsWith("c-") && n.endsWith(".yaml")).sort();
  }

  let runSeq = 0;
  async function runDeveloper(
    pipeline: PipelineConfig,
    stepId: "test-first" | "poc",
    summary: string
  ) {
    runSeq++;
    const harness = new FakeHarness();
    const data = {
      status: "ok",
      summary: `Ran ${stepId}`,
      concerns: [{ kind: "risk", summary, detail: "allowlist gate", severity: "high" }],
    };
    const label = `${TASK}/runs/${stepId}#a1`;
    harness.scriptOutcome(label, { ok: true, data });
    harness.scriptOutcome(`${label}#relaunch`, { ok: true, data });
    return runAgentStep({
      task: TASK,
      stepId,
      stepFragment: `steps/${stepId}`,
      agent: "developer",
      role: "workhorse",
      cwd: taskWt,
      taskWt,
      taskDir,
      recordsDir: path.join(taskDir, `runs-allowlist-${runSeq}`),
      repo,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: { assignment: "Implement the change", citations: "[]", context: "", feedback: "" },
    });
  }

  it("skips concerns from non-allowlisted agents, journals the skip, and keeps the step ok", async () => {
    const skippedByAgent = await runDeveloper(
      makePipeline({ raiseAllowlist: ["qa"] }),
      "test-first",
      "Not allowlisted because the key is the agent"
    );
    expect(skippedByAgent.status).toBe("ok");

    // The gate key is source.agent, never the step fragment.
    const skippedByFragment = await runDeveloper(
      makePipeline({ raiseAllowlist: ["test-first"] }),
      "test-first",
      "Not allowlisted because fragments are not keys"
    );
    expect(skippedByFragment.status).toBe("ok");
    expect(concernFiles()).toEqual([]);

    // The developer agent covers develop/poc/test-assumptions/test-first/
    // simple-implement/fix-round, so the same allowlist entry admits poc.
    const allowed = await runDeveloper(
      makePipeline({ raiseAllowlist: ["developer"] }),
      "poc",
      "Allowed because source.agent is developer"
    );
    expect(allowed.status).toBe("ok");
    expect(concernFiles()).toHaveLength(1);

    const events = await readJournal(taskDir);
    const skipped = events.filter((e) => e.type === "concern_ingest_skipped");
    expect(skipped).toHaveLength(2);
    expect(skipped.map((e) => e.agent)).toEqual(["developer", "developer"]);
  });
});

describe("Engine human routing with concern triage (adr-human-router-single)", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  interface EngineConcern {
    kind: Concern["kind"];
    summary: string;
    severity: ConcernSeverity;
    affects: string[];
  }

  /**
   * Builds a real task/repo fixture: ingest, plan, PM edits, item steps and
   * close-ups are scripted so non-halting paths finish. The first item's
   * developer raises the concern; its review triages that exact concern id.
   */
  function engineFixture(
    task: string,
    worktreeRoot: string,
    harness: FakeHarness,
    items: { slug: string; title: string }[],
    concern: EngineConcern,
    reviewSuggestion: ReviewSuggestion,
    concerns?: PipelineConfig["concerns"]
  ): {
    pipeline: PipelineConfig;
    project: ProjectConfig;
    prompts: ReturnType<typeof loadPromptLibrary>;
  } {
    const project: ProjectConfig = { orchestrationFolder: ORCH, worktreeRoot };
    const pipeline = makePipeline(concerns);
    pipeline.flows = {
      simple: { steps: [] },
      story: {
        dev: {
          fixLoopTo: "develop",
          steps: [
            { id: "develop", agent: "developer", role: "workhorse" },
            { id: "review", agent: "reviewer", role: "alt-workhorse" },
          ],
        },
      },
      spike: {},
    };
    pipeline.agents = {
      triage: { role: "workhorse" },
      infra: { role: "workhorse" },
      architect: { role: "architect" },
      "plan-reviewer": { role: "alt-architect" },
      pm: { role: "alt-workhorse" },
      developer: { role: "workhorse" },
      reviewer: { role: "alt-workhorse" },
      "wave-close-up": { role: "alt-workhorse" },
      "plan-close-up": { role: "alt-workhorse" },
    };
    pipeline.limits = {
      maxParallelItems: 2,
      maxParallelTurns: 4,
      maxStepAttempts: 3,
      maxFixRounds: 3,
    };
    const prompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [] });

    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "story", rationale: "Human routing flow", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: { setup: [], gates: [{ id: "test", command: "true" }], testRunner: { command: "true" } },
    });
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: items.map((it) => ({
          slug: it.slug,
          kind: "dev",
          title: it.title,
          milestoneId: "m1",
          deps: [],
        })),
      },
    });
    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: { status: "approved", summary: "Plan ok", suggestions: [] },
    });
    // A routed high-severity blocker triggers one architect consult per concern.
    harness.scriptOutcome(`${task}/runs/consult-concern-${reviewSuggestion.id}#a1`, {
      ok: true,
      data: {
        id: `decision-concern-${reviewSuggestion.id}`,
        context: "item",
        decision: "continue",
        rationale: "Proceed after recording the concern",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    });
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        items: items.map((it) => ({
          slug: it.slug,
          outlineRef: it.slug,
          kind: "dev",
          title: it.title,
          assignment: `Implement ${it.title}`,
          milestone: "m1",
          wave: 1,
          deps: [],
        })),
      },
    });

    const firstSlug = items[0]!.slug;
    for (const it of items) {
      harness.scriptOutcome(`${task}/items/${it.slug}/develop#a1`, (run) => {
        fs.writeFileSync(
          path.join(run.cwd, `${it.slug}.ts`),
          `export const ${it.slug.replace(/-/g, "_")} = 1;\n`
        );
        return {
          ok: true,
          data: {
            status: "ok",
            summary: `Developed ${it.slug}`,
            ...(it.slug === firstSlug ? { concerns: [concern] } : {}),
          },
        };
      });
      harness.scriptOutcome(`${task}/items/${it.slug}/review#a1`, {
        ok: true,
        data:
          it.slug === firstSlug
            ? { status: "approved", summary: "Review routed", suggestions: [reviewSuggestion] }
            : { status: "approved", summary: "Approved", suggestions: [] },
      });
    }

    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", mergedItems: [], summary: "Wave report" },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: {
        id: "dec-wave-1",
        context: "wave",
        decision: "continue",
        timestamp: new Date().toISOString(),
      },
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Plan close-up complete" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Iteration complete" },
    });

    return { pipeline, project, prompts };
  }

  async function runScenario(opts: {
    task: string;
    items: { slug: string; title: string }[];
    concern: EngineConcern;
    disposition: "human-stop" | "human-async";
    concerns?: PipelineConfig["concerns"];
  }): Promise<{
    res: Awaited<ReturnType<typeof runTask>>;
    deployedTaskDir: string;
    cid: string;
  }> {
    const taskDir = path.join(tmpRepo.dir, ORCH, opts.task);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), `Intent for ${opts.task}\n`, "utf8");
    tmpRepo.commit(`add ${opts.task} intent`);

    const worktreeRoot = path.join(tmpRepo.dir + `-${opts.task}-wt`);
    fs.mkdirSync(worktreeRoot, { recursive: true });
    const repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
    const harness = new FakeHarness();
    const cid = concernFingerprint({ kind: opts.concern.kind, summary: opts.concern.summary });

    const { pipeline, project, prompts } = engineFixture(
      opts.task,
      worktreeRoot,
      harness,
      opts.items,
      opts.concern,
      {
        id: cid,
        disposition: opts.disposition,
        summary: "Operator decision required",
        detail: "The concern needs an explicit human decision",
      },
      opts.concerns
    );

    const res = await runTask(
      { harness, repo, project, pipelineFor: async () => pipeline, prompts },
      opts.task,
      { maxTicks: 30 }
    );
    const deployedTaskDir = path.join(worktreeRoot, `topic_${opts.task}`, ORCH, opts.task);
    return { res, deployedTaskDir, cid };
  }

  function mailboxFiles(taskDir: string): string[] {
    const dir = path.join(taskDir, "steer", "tousertoreview");
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((n) => n.endsWith(".yaml")).sort();
  }

  it("halts with exit 10 for a high-severity human-stop concern, writing one q-concern entry", async () => {
    const { res, deployedTaskDir, cid } = await runScenario({
      task: "router-stop",
      items: [{ slug: "item-1", title: "Item 1" }],
      concern: {
        kind: "blocker",
        summary: "Irreversible migration hazard",
        severity: "high",
        affects: ["item-1"],
      },
      disposition: "human-stop",
    });

    expect(res.status).toBe("blocked");
    expect(res.exitCode).toBe(10);

    // No double write: the concern-id disposition produces exactly one
    // q-concern-<cid> entry; the item-machine raw path must skip it.
    expect(mailboxFiles(deployedTaskDir)).toEqual([`q-concern-${cid}.yaml`]);
    const q = await readYaml<Record<string, any>>(
      path.join(deployedTaskDir, "steer", "tousertoreview", `q-concern-${cid}.yaml`)
    );
    expect(q.disposition).toBe("human-stop");
    expect([...(q.blocks ?? [])].sort()).toEqual(["item-1", "task"]);

    const stored = await readYaml<StoredConcernArtifact>(
      path.join(deployedTaskDir, "concerns", `${cid}.yaml`)
    );
    expect(stored.status).toBe("routed");
    expect(stored.disposition).toBe("human-stop");
  });

  it("parks a high-severity human-async item and halts for the open question", async () => {
    const { res, deployedTaskDir, cid } = await runScenario({
      task: "router-async",
      items: [
        { slug: "item-a", title: "Item A" },
        { slug: "item-b", title: "Item B" },
      ],
      concern: {
        kind: "question",
        summary: "Which storage backend should be used",
        severity: "high",
        affects: ["item-a"],
      },
      disposition: "human-async",
    });

    // item-b merges while item-a waits on the operator, then the run
    // halts: an open blocking question means the operator owns the next
    // move (merged halt gate; exit 10, not a silent done over the open
    // question).
    expect(res.status).toBe("blocked");
    expect(res.exitCode).toBe(10);
    expect(mailboxFiles(deployedTaskDir)).toEqual([`q-concern-${cid}.yaml`]);
    const q = await readYaml<Record<string, any>>(
      path.join(deployedTaskDir, "steer", "tousertoreview", `q-concern-${cid}.yaml`)
    );
    expect(q.disposition).toBe("human-async");
    expect(q.blocks ?? []).toEqual(["item-a"]);

    const state = await readYaml<Record<string, any>>(
      path.join(deployedTaskDir, "state.yaml")
    );
    expect(state.items["item-a"]?.status).toBe("blocked");
    expect(state.items["item-b"]?.status).toBe("merged");
  });

  it("downgrades a medium-severity human-stop concern to a digest and finishes unblocked", async () => {
    const { res, deployedTaskDir, cid } = await runScenario({
      task: "router-downgrade",
      items: [{ slug: "item-1", title: "Item 1" }],
      concern: {
        kind: "blocker",
        summary: "Medium-severity schema concern",
        severity: "medium",
        affects: ["item-1"],
      },
      disposition: "human-stop",
    });

    expect(res.status).toBe("done");
    expect(res.exitCode).toBe(0);
    expect(mailboxFiles(deployedTaskDir)).toEqual([`q-concern-${cid}.yaml`]);
    const q = await readYaml<Record<string, any>>(
      path.join(deployedTaskDir, "steer", "tousertoreview", `q-concern-${cid}.yaml`)
    );
    expect(q.disposition).toBe("human-awareness");
    expect(q.blocks ?? []).toEqual([]);
    expect(questionBlocks(q as any, "task")).toBe(false);

    const stored = await readYaml<StoredConcernArtifact>(
      path.join(deployedTaskDir, "concerns", `${cid}.yaml`)
    );
    expect(stored.status).toBe("routed");

    const state = await readYaml<Record<string, any>>(
      path.join(deployedTaskDir, "state.yaml")
    );
    expect(state.items["item-1"]?.status).toBe("merged");
    expect(state.status).toBe("done");
  });
});
