import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runAgentStep } from "../../src/core/flows/step-runner.js";
import { runConcernConsult } from "../../src/core/flows/consults.js";
import { deriveTaskState } from "../../src/core/derive/task.js";
import { readJournal } from "../../src/core/journal.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
import type {
  PipelineConfig,
  ProjectConfig,
  StoredConcernArtifact,
} from "../../src/core/artifacts.js";

/**
 * Close-up propose/confirm lifecycle and unblock (adr-closeup-lifecycle-resolved).
 *
 * Close-ups propose `concernResolutions` as pending intent only. The architect
 * confirms or rejects them during architect ingests: accept+resolve makes the
 * concern `resolved`, accept+carry routes it to the architect, accept+propagate
 * pushes a condensed copy to the parent task (epic helper), and reject clears
 * the pending proposal without changing status or disposition. A concern
 * consult's direct `concernResolution` is applied when its decision commits, so
 * the next derive no longer blocks the affected item. A wave close-up assigns
 * a fallback disposition to triage-less open concerns so simple/no-behavior
 * items still reach the architect or the debt list; blockers stay open for
 * explicit triage and fallback never invents a human disposition.
 */

const ORCH = ".factory";
const TASK = "lifecycle-task";

let tmpRepo: TmpRepo;
let repo: Repo;
let taskWt: string;
let taskDir: string;
let pipeline: PipelineConfig;
let project: ProjectConfig;
let prompts: ReturnType<typeof loadPromptLibrary>;

beforeEach(() => {
  tmpRepo = createTmpRepo();
  const worktreeRoot = path.join(tmpRepo.dir + "-wt");
  fs.mkdirSync(worktreeRoot, { recursive: true });
  repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
  taskWt = tmpRepo.dir;
  taskDir = path.join(taskWt, ORCH, TASK);
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Lifecycle\n", "utf8");
  tmpRepo.commit("add lifecycle task");

  pipeline = {
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
      qa: { role: "alt-workhorse" },
      reviewer: { role: "alt-workhorse" },
      architect: { role: "architect" },
      "wave-close-up": { role: "alt-workhorse" },
      "plan-close-up": { role: "alt-workhorse" },
    },
    flows: { simple: { steps: [] }, story: {}, spike: {} },
    limits: {},
  };
  project = { orchestrationFolder: ORCH, worktreeRoot };
  prompts = loadPromptLibrary({
    builtinDir: path.resolve(import.meta.dir, "../../agents"),
    overrideDirs: [],
  });
});

afterEach(() => {
  tmpRepo.cleanup();
});

function storedConcern(
  overrides: Partial<StoredConcernArtifact> & { id: string }
): StoredConcernArtifact {
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

async function writeConcern(
  root: string,
  concern: StoredConcernArtifact
): Promise<string> {
  const file = path.join(root, "concerns", `${concern.id}.yaml`);
  await writeYamlAtomic(file, concern);
  return file;
}

async function readConcern(
  id: string,
  root = taskDir
): Promise<StoredConcernArtifact> {
  return readYaml<StoredConcernArtifact>(path.join(root, "concerns", `${id}.yaml`));
}

async function runStep(opts: {
  data: unknown;
  agent: string;
  stepId: string;
  stepFragment: string;
  task?: string;
  taskDir?: string;
  promptVars: Record<string, string>;
}) {
  const harness = new FakeHarness();
  const label = `${opts.task ?? TASK}/runs/${opts.stepId}#a1`;
  harness.scriptOutcome(label, { ok: true, data: opts.data });
  harness.scriptOutcome(`${label}#relaunch`, { ok: true, data: opts.data });
  harness.scriptComplete(() => opts.data);

  return runAgentStep({
    task: opts.task ?? TASK,
    stepId: opts.stepId,
    stepFragment: opts.stepFragment,
    agent: opts.agent,
    cwd: taskWt,
    taskWt,
    taskDir: opts.taskDir ?? taskDir,
    recordsDir: path.join(opts.taskDir ?? taskDir, "runs"),
    repo,
    harness,
    pipeline,
    project,
    prompts,
    promptVars: opts.promptVars,
  });
}

function architectCloseup(id: string, confirm: "accept" | "reject") {
  return runStep({
    agent: "architect",
    stepId: "architect-closeup-1",
    stepFragment: "steps/architect-closeup",
    data: {
      iteration: 1,
      status: "complete",
      summary: "Plan complete",
      concernConfirms: [{ id, confirm }],
    },
    promptVars: { closeup: "audit", plan: "{}", intent: "lifecycle" },
  });
}

describe("Close-up lifecycle: architect confirmations", () => {
  it("accept resolves a pending resolve and derive exposes the resolved status", async () => {
    await writeConcern(
      taskDir,
      storedConcern({
        id: "c-resolved",
        status: "routed",
        disposition: "architect",
        pendingResolution: {
          action: "resolve",
          by: "wave-close-up",
          at: "2026-01-01T00:00:01.000Z",
        },
      })
    );
    tmpRepo.commit("seed pending resolve");

    const result = await architectCloseup("c-resolved", "accept");
    expect(result.ok).toBe(true);

    const stored = await readConcern("c-resolved");
    expect(stored.status).toBe("resolved");
    expect(stored.pendingResolution).toBeUndefined();

    const state = await deriveTaskState({ taskDir, task: TASK, pipeline });
    expect(state.concerns.resolved).toBe(1);
    expect(state.concerns.routed).toBe(0);
  });

  it("accept carries a pending carry to the architect", async () => {
    await writeConcern(
      taskDir,
      storedConcern({
        id: "c-carried",
        status: "open",
        pendingResolution: {
          action: "carry",
          note: "architect should decide",
          by: "wave-close-up",
          at: "2026-01-01T00:00:01.000Z",
        },
      })
    );
    tmpRepo.commit("seed pending carry");

    const result = await architectCloseup("c-carried", "accept");
    expect(result.ok).toBe(true);

    const stored = await readConcern("c-carried");
    expect(stored.status).toBe("routed");
    expect(stored.disposition).toBe("architect");
    expect(stored.pendingResolution).toBeUndefined();
  });

  it("accept propagates a pending propagate to the parent concern store", async () => {
    const parentTaskDir = path.join(taskWt, ORCH, "saga");
    const childTaskDir = path.join(parentTaskDir, "epic-a");
    fs.mkdirSync(path.join(parentTaskDir, "items", "epic-a"), { recursive: true });
    fs.writeFileSync(path.join(parentTaskDir, "INTENT.md"), "# Saga\n", "utf8");
    fs.writeFileSync(
      path.join(parentTaskDir, "items", "epic-a", "assignment.yaml"),
      "slug: epic-a\nkind: epic\ntitle: Epic A\nassignment: Deliver epic A\nwave: 1\ndeps: []\n",
      "utf8"
    );
    fs.mkdirSync(childTaskDir, { recursive: true });
    await writeConcern(
      childTaskDir,
      storedConcern({
        id: "c-propagated",
        status: "open",
        source: { record: "001-develop-a1", agent: "developer", item: "child-item" },
        pendingResolution: {
          action: "propagate",
          note: "saga should own this",
          by: "plan-close-up",
          at: "2026-01-01T00:00:01.000Z",
        },
      })
    );
    tmpRepo.commit("seed epic child concern");

    const result = await runStep({
      task: "saga--epic-a",
      taskDir: childTaskDir,
      agent: "architect",
      stepId: "architect-closeup-1",
      stepFragment: "steps/architect-closeup",
      data: {
        iteration: 1,
        status: "complete",
        summary: "Plan complete",
        concernConfirms: [{ id: "c-propagated", confirm: "accept" }],
      },
      promptVars: { closeup: "audit", plan: "{}", intent: "lifecycle" },
    });
    expect(result.ok).toBe(true);

    const child = await readConcern("c-propagated", childTaskDir);
    expect(child.pendingResolution).toBeUndefined();

    const parentConcerns = path.join(parentTaskDir, "concerns");
    const copies = fs.existsSync(parentConcerns)
      ? fs.readdirSync(parentConcerns).filter((name) => name.startsWith("c-"))
      : [];
    expect(copies).toHaveLength(1);
    const copy = await readYaml<StoredConcernArtifact>(
      path.join(parentConcerns, copies[0]!)
    );
    expect(copy.summary).toBe("[epic] Concern c-propagated");
    expect(copy.source.epic).toBe("epic-a");
    expect(copy.status).toBe("open");
  });

  it("reject clears the pending resolution, preserving open status and disposition", async () => {
    await writeConcern(
      taskDir,
      storedConcern({
        id: "c-rejected",
        status: "open",
        pendingResolution: {
          action: "resolve",
          by: "wave-close-up",
          at: "2026-01-01T00:00:01.000Z",
        },
      })
    );
    tmpRepo.commit("seed pending reject");

    const result = await architectCloseup("c-rejected", "reject");
    expect(result.ok).toBe(true);

    const stored = await readConcern("c-rejected");
    expect(stored.status).toBe("open");
    expect(stored.disposition).toBeUndefined();
    expect(stored.pendingResolution).toBeUndefined();
  });
});

describe("Close-up lifecycle: consult unblock", () => {
  it("consult resolve unblocks the affected item on the next derive", async () => {
    const itemDir = path.join(taskDir, "items", "blocked-item");
    fs.mkdirSync(itemDir, { recursive: true });
    fs.writeFileSync(
      path.join(itemDir, "assignment.yaml"),
      "slug: blocked-item\nkind: dev\ntitle: Blocked item\nassignment: Implement\nwave: 1\ndeps: []\n",
      "utf8"
    );
    const blocker = storedConcern({
      id: "c-blocker",
      kind: "blocker",
      summary: "Database migration pending",
      severity: "high",
      status: "routed",
      affects: ["blocked-item"],
      disposition: "architect",
    });
    await writeConcern(taskDir, blocker);
    tmpRepo.commit("seed blocked item and concern");

    const before = await deriveTaskState({ taskDir, task: TASK, pipeline });
    expect(before.itemMap["blocked-item"]?.status).toBe("blocked");

    const harness = new FakeHarness();
    const label = `${TASK}/runs/consult-concern-c-blocker#a1`;
    const output = {
      decision: "continue",
      rationale: "Migration is no longer required",
      concernResolution: { id: "c-blocker", action: "resolve" },
    };
    harness.scriptOutcome(label, { ok: true, data: output });
    harness.scriptOutcome(`${label}#relaunch`, { ok: true, data: output });
    harness.scriptComplete(() => output);

    const res = await runConcernConsult({
      task: TASK,
      concern: blocker,
      taskDir,
      taskWt,
      repo,
      harness,
      pipeline,
      project,
      prompts,
    });
    expect(res.decision?.concernResolution).toEqual({
      id: "c-blocker",
      action: "resolve",
    });

    const decisionPath = path.join(taskDir, "decisions", "concern-c-blocker.yaml");
    expect(fs.existsSync(decisionPath)).toBe(true);
    const decision = await readYaml<Record<string, unknown>>(decisionPath);
    expect(decision.concernResolution).toEqual({
      id: "c-blocker",
      action: "resolve",
    });

    const stored = await readConcern("c-blocker");
    expect(stored.status).toBe("resolved");
    expect(stored.pendingResolution).toBeUndefined();

    const after = await deriveTaskState({ taskDir, task: TASK, pipeline });
    expect(after.itemMap["blocked-item"]?.status).toBe("pending");
    expect(after.concerns.resolved).toBe(1);
  });

  it("ignores concernResolution from an item consult and journals the drop", async () => {
    await writeConcern(
      taskDir,
      storedConcern({ id: "c-cross-emitted", status: "open" })
    );
    tmpRepo.commit("seed cross-emission concern");

    const result = await runStep({
      agent: "architect",
      stepId: "consult-item-guard",
      stepFragment: "steps/architect-consult-item",
      data: {
        decision: "retry-with-guidance",
        rationale: "Retry",
        concernResolution: { id: "c-cross-emitted", action: "resolve" },
      },
      promptVars: {
        item: "guard-item",
        assignment: "work",
        priorAttempts: "",
        diff: "",
        feedback: "",
      },
    });
    expect(result.ok).toBe(true);

    const stored = await readConcern("c-cross-emitted");
    expect(stored.status).toBe("open");
    expect(stored.pendingResolution).toBeUndefined();

    const events = await readJournal(taskDir);
    const ignored = events.filter(
      (event) =>
        event.type === "concern_resolution_ignored" &&
        event.step === "consult-item-guard"
    );
    expect(ignored).toHaveLength(1);
  });
});

describe("Close-up lifecycle: wave fallback", () => {
  async function runWaveCloseup() {
    return runStep({
      agent: "wave-close-up",
      stepId: "wave-close-up-1-1",
      stepFragment: "steps/wave-close-up",
      data: {
        wave: 1,
        iteration: 1,
        status: "complete",
        mergedItems: [],
        summary: "Wave 1 complete",
      },
      promptVars: { task: TASK, waveReport: "wave 1", infra: "" },
    });
  }

  it("falls back over triage-less open concerns and lists tech-debt as derived debt", async () => {
    await writeConcern(
      taskDir,
      storedConcern({
        id: "c-debt",
        kind: "tech-debt",
        summary: "Duplicate helper",
        status: "open",
        source: { record: "001-develop-a1", agent: "developer", item: "simple" },
      })
    );
    await writeConcern(
      taskDir,
      storedConcern({ id: "c-assumption", kind: "assumption", status: "open" })
    );
    await writeConcern(
      taskDir,
      storedConcern({ id: "c-risk", kind: "risk", status: "open" })
    );
    await writeConcern(
      taskDir,
      storedConcern({ id: "c-question", kind: "question", status: "open" })
    );
    // Pending proposals are owned by architect confirmation, not by fallback.
    await writeConcern(
      taskDir,
      storedConcern({
        id: "c-pending",
        kind: "tech-debt",
        status: "open",
        pendingResolution: {
          action: "resolve",
          by: "plan-close-up",
          at: "2026-01-01T00:00:01.000Z",
        },
      })
    );
    tmpRepo.commit("seed triage-less concerns");

    const result = await runWaveCloseup();
    expect(result.ok).toBe(true);

    const debt = await readConcern("c-debt");
    expect(debt.status).toBe("routed");
    expect(debt.disposition).toBe("optional");

    for (const id of ["c-assumption", "c-risk", "c-question"]) {
      const routed = await readConcern(id);
      expect(routed.status).toBe("routed");
      expect(routed.disposition).toBe("architect");
    }

    const pending = await readConcern("c-pending");
    expect(pending.status).toBe("open");
    expect(pending.disposition).toBeUndefined();
    expect(pending.pendingResolution?.action).toBe("resolve");

    const all = await Promise.all(
      ["c-debt", "c-assumption", "c-risk", "c-question", "c-pending"].map((id) =>
        readConcern(id)
      )
    );
    for (const concern of all) {
      expect(concern.disposition?.startsWith("human-") ?? false).toBe(false);
    }

    const state = await deriveTaskState({ taskDir, task: TASK, pipeline });
    expect(state.debt).toContain("[simple] Duplicate helper");
  });

  it("leaves blocker concerns open for explicit triage", async () => {
    await writeConcern(
      taskDir,
      storedConcern({
        id: "c-blocker-open",
        kind: "blocker",
        summary: "Needs explicit human/architect triage",
        severity: "high",
        status: "open",
      })
    );
    // A triage-less non-blocker in the same pass proves the fallback ran while
    // deliberately skipping the blocker.
    await writeConcern(
      taskDir,
      storedConcern({ id: "c-risk-routed", kind: "risk", status: "open" })
    );
    tmpRepo.commit("seed triage-less blocker");

    const result = await runWaveCloseup();
    expect(result.ok).toBe(true);

    const routedRisk = await readConcern("c-risk-routed");
    expect(routedRisk.status).toBe("routed");
    expect(routedRisk.disposition).toBe("architect");

    const stored = await readConcern("c-blocker-open");
    expect(stored.status).toBe("open");
    expect(stored.disposition).toBeUndefined();
  });
});
