import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type { PipelineConfig, ProjectConfig, StepMetaArtifact } from "../../src/core/artifacts.js";
import { readYaml } from "../../src/core/records/io.js";

function makePipeline(): PipelineConfig {
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
      pm: { role: "alt-workhorse", tools: [] },
      developer: { role: "workhorse" },
      "wave-close-up": { role: "wave-close-up" },
      "plan-close-up": { role: "plan-close-up" },
    },
    flows: {
      simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
      story: {
        dev: {
          steps: [{ id: "develop", agent: "developer", role: "workhorse" }],
        },
      },
      spike: {},
    },
    limits: {
      maxPlanReviewRounds: 1,
      maxAmendmentsPerIteration: 3,
    },
  };
}

function setupTask(tmpRepo: TmpRepo, task: string, orchFolder: string): void {
  const taskDir = path.join(tmpRepo.dir, orchFolder, task);
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, "INTENT.md"), `${task} intent\n`, "utf8");
  tmpRepo.commit(`Add intent for ${task}`);
}

function scriptIngest(harness: FakeHarness, task: string): void {
  harness.scriptOutcome(`${task}/runs/triage#a1`, {
    ok: true,
    data: { kind: "story", rationale: "Standard story", citations: [] },
  });
  harness.scriptOutcome(`${task}/runs/infra#a1`, {
    ok: true,
    data: { setup: [], gates: [{ id: "t", command: "true" }], testRunner: { command: "true" } },
  });
}

function scriptWaveClose(
  harness: FakeHarness,
  task: string,
  itemSlugs: string[],
  opts?: { wave?: number; reportId?: string }
): void {
  const wave = opts?.wave ?? 1;
  for (const slug of itemSlugs) {
    harness.scriptOutcome(`${task}/items/${slug}/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, `${slug}.txt`), `${slug}\n`);
      return { ok: true, data: { status: "ok", summary: `${slug} done` } };
    });
  }
  harness.scriptOutcome(`${task}/runs/wave-close-up-1-${wave}#a1`, {
    ok: true,
    data: { wave, iteration: 1, status: "complete", mergedItems: itemSlugs, summary: `Wave ${wave} ok` },
  });
  harness.scriptOutcome(`${task}/runs/architect-wave-report-1-${wave}#a1`, {
    ok: true,
    data: { id: opts?.reportId ?? `dec-${wave}`, context: "wave", decision: "continue", timestamp: new Date().toISOString() },
  });
  harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
    ok: true,
    data: { iteration: 1, status: "complete", summary: "All done" },
  });
  harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
    ok: true,
    data: { iteration: 1, status: "complete", summary: "Delivered" },
  });
}

function outline(slug: string) {
  return { slug, kind: "dev", title: slug, milestoneId: "m1" };
}

function editItem(slug: string) {
  return { slug, outlineRef: slug, kind: "dev", title: slug, assignment: `Work ${slug}`, milestone: "m1", wave: 1 };
}

describe("Engine: plan outline-count pre-check and pm-edits bounce (§8.4.2a, §8.4.4a)", () => {
  let tmpRepo: TmpRepo;
  let worktreeRoot: string;
  let repoObj: Repo;
  let project: ProjectConfig;
  let prompts: any;
  const orchFolder = ".factory";

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    worktreeRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
    project = { orchestrationFolder: orchFolder, worktreeRoot };
    prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("68-style over-limit plan gets ONE resumed repair with counts; compliant revision flows, PM never sees the invalid plan", async () => {
    const task = "plan-limits-repair-task";
    setupTask(tmpRepo, task, orchFolder);
    const pipeline = makePipeline();
    pipeline.limits = { ...pipeline.limits, maxItemsPerPlan: 2 };
    const harness = new FakeHarness();
    scriptIngest(harness, task);

    // Architect emits 4 outlines against a limit of 2 (the live 68-vs-50 shape).
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      sessionId: "arch-sess-limits",
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: [outline("o1"), outline("o2"), outline("o3"), outline("o4")],
      },
    });

    let repairPrompt = "";
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a2`, (run) => {
      repairPrompt = run.prompt;
      expect(run.session.resume).toBe("arch-sess-limits");
      return {
        ok: true,
        sessionId: "arch-sess-limits",
        data: {
          iteration: 1,
          milestones: [{ id: "m1", title: "M1" }],
          itemOutlines: [outline("o1"), outline("o2")],
        },
      };
    });

    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: { status: "approved", summary: "ok", suggestions: [] },
    });

    let pmPrompt = "";
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, (run) => {
      pmPrompt = run.prompt;
      return { ok: true, data: { iteration: 1, items: [editItem("o1"), editItem("o2")] } };
    });
    scriptWaveClose(harness, task, ["o1", "o2"]);

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );
    expect(res.status).toBe("done");

    // Repair turn fired exactly once with the offending counts, not a renumber.
    expect(repairPrompt).toContain("got 4");
    expect(repairPrompt).toContain("maximum items limit of 2");
    expect(repairPrompt).toContain("replanAfter");
    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    const journal = fs.readFileSync(path.join(deployedTaskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("plan_limits_repair");
    // PM only ever saw the compliant revision.
    expect(pmPrompt).toContain('"slug": "o1"');
    expect(pmPrompt).not.toContain("o3");
    const plan = await readYaml<any>(path.join(deployedTaskDir, "plan", "plan-1.yaml"));
    expect(plan.itemOutlines.map((o: any) => o.slug).sort()).toEqual(["o1", "o2"]);
  });

  it("pm-edits invalid after repair bounces to architect once and recovers when PM re-runs clean", async () => {
    const task = "pmfix-bounce-recovery-task";
    setupTask(tmpRepo, task, orchFolder);
    const pipeline = makePipeline();
    const harness = new FakeHarness();
    scriptIngest(harness, task);
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      sessionId: "arch-sess-b",
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: [outline("r1")],
      },
    });
    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: { status: "approved", summary: "ok", suggestions: [] },
    });
    const badEdits = {
      ok: true,
      sessionId: "pm-sess-b",
      data: {
        iteration: 1,
        items: [{ ...editItem("r1"), kind: "nope-kind" }],
      },
    } as const;
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, badEdits);
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a2`, badEdits);

    let bouncePrompt = "";
    harness.scriptOutcome(`${task}/runs/architect-pmfix-1#a1`, (run) => {
      bouncePrompt = run.prompt;
      return {
        ok: true,
        data: {
          iteration: 1,
          milestones: [{ id: "m1", title: "M1" }],
          itemOutlines: [outline("r1")],
        },
      };
    });
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a3`, {
      ok: true,
      data: { iteration: 1, items: [editItem("r1")] },
    });
    scriptWaveClose(harness, task, ["r1"]);

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );
    expect(res.status).toBe("done");

    // Bounce carried the validation errors as feedback.
    expect(bouncePrompt).toContain("Unknown item kind");
    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    const journal = fs.readFileSync(path.join(deployedTaskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("pm_edits_bounced_to_architect");
    expect(journal).toContain("pm_edits_bounce_recovered");
    // Exactly one bounce: a single pmfix record, and the post-bounce PM ran fresh.
    const runs = fs.readdirSync(path.join(deployedTaskDir, "runs"));
    expect(runs.filter((r) => r.includes("architect-pmfix-1"))).toHaveLength(1);
    expect(fs.existsSync(path.join(deployedTaskDir, "plan", "edits-1.0.yaml"))).toBe(true);
  });

  it("restart in the live dead state (ok pm-edits, no edits file, validation_failed journal) goes straight to the bounce", async () => {
    const task = "pmfix-restart-task";
    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
    tmpRepo.createBranch(`topic/${task}`);
    tmpRepo.createWorktree(`topic/${task}`, taskWtPath);
    const deployedTaskDir = path.join(taskWtPath, orchFolder, task);
    fs.mkdirSync(deployedTaskDir, { recursive: true });
    fs.writeFileSync(path.join(deployedTaskDir, "INTENT.md"), `${task} intent\n`, "utf8");
    fs.writeFileSync(
      path.join(deployedTaskDir, "triage.yaml"),
      JSON.stringify({ kind: "story", rationale: "Story", citations: [] }, null, 2)
    );
    fs.writeFileSync(
      path.join(deployedTaskDir, "context.yaml"),
      JSON.stringify({ citations: [] }, null, 2)
    );
    fs.writeFileSync(
      path.join(deployedTaskDir, "infra.yaml"),
      JSON.stringify({ setup: [], gates: [{ id: "t", command: "true" }], testRunner: { command: "true" } }, null, 2)
    );
    fs.writeFileSync(
      path.join(deployedTaskDir, "gates-baseline.yaml"),
      JSON.stringify({ status: "green", results: [] }, null, 2)
    );

    const planDir = path.join(deployedTaskDir, "plan");
    fs.mkdirSync(planDir, { recursive: true });
    const plan = {
      iteration: 1,
      milestones: [{ id: "m1", title: "M1" }],
      itemOutlines: [outline("r1")],
    };
    fs.writeFileSync(path.join(planDir, "plan-1.yaml"), JSON.stringify(plan, null, 2));

    const runsDir = path.join(deployedTaskDir, "runs");
    const ts = () => new Date().toISOString();
    function seedRecord(dir: string, meta: StepMetaArtifact, output?: unknown): void {
      const recDir = path.join(runsDir, dir);
      fs.mkdirSync(recDir, { recursive: true });
      fs.writeFileSync(path.join(recDir, "input.md"), "seeded\n");
      fs.writeFileSync(path.join(recDir, "meta.yaml"), JSON.stringify(meta, null, 2));
      if (output !== undefined) {
        fs.writeFileSync(path.join(recDir, "output.yaml"), JSON.stringify(output, null, 2));
      }
    }
    seedRecord("001-triage-a1", { seq: 1, name: "triage", attempt: 1, status: "ok", startedAt: ts(), endedAt: ts() } as StepMetaArtifact);
    seedRecord("002-infra-a1", { seq: 2, name: "infra", attempt: 1, status: "ok", startedAt: ts(), endedAt: ts() } as StepMetaArtifact);
    seedRecord(
      "003-architect-plan-1-a1",
      { seq: 3, name: "architect-plan-1", attempt: 1, agent: "architect", role: "architect", models: ["m"], status: "ok", startedAt: ts(), endedAt: ts() } as StepMetaArtifact,
      plan
    );
    seedRecord(
      "004-plan-review-1-1-a1",
      { seq: 4, name: "plan-review-1-1", attempt: 1, agent: "plan-reviewer", role: "alt-architect", models: ["m"], status: "ok", startedAt: ts(), endedAt: ts() } as StepMetaArtifact,
      { status: "approved", summary: "ok", suggestions: [] }
    );
    const failedEdits = {
      iteration: 1,
      items: [
        { ...editItem("r1"), kind: "dev" },
        { slug: "extra-1", outlineRef: "r1", kind: "dev", title: "Extra", assignment: "Extra work", milestone: "m1", wave: 1 },
        { slug: "extra-2", outlineRef: "r1", kind: "dev", title: "Extra 2", assignment: "Extra work 2", milestone: "m1", wave: 1 },
      ],
    };
    seedRecord(
      "005-pm-edits-1-a1",
      { seq: 5, name: "pm-edits-1", attempt: 1, agent: "pm", role: "alt-workhorse", models: ["m"], status: "ok", startedAt: ts(), endedAt: ts() } as StepMetaArtifact,
      failedEdits
    );
    seedRecord(
      "006-pm-edits-1-a2",
      { seq: 6, name: "pm-edits-1", attempt: 2, agent: "pm", role: "alt-workhorse", models: ["m"], status: "ok", startedAt: ts(), endedAt: ts() } as StepMetaArtifact,
      failedEdits
    );
    // The live launch-9 dead state: records committed, but the
    // validation_failed/repaired journal tail UNCOMMITTED at crash time.
    // Restart repair must commit it as recovery (never stash it), or the
    // journal-keyed restart-bounce detector goes blind.
    const journalLines = [
      { type: "pm_edits_repaired", errors: ["Total items (3) exceeds maximum items limit of 2"], ts: ts() },
      { type: "pm_edits_validation_failed", errors: ["Total items (3) exceeds maximum items limit of 2"], ts: ts() },
      { type: "pm_edits_repaired", errors: ["Total items (3) exceeds maximum items limit of 2"], ts: ts() },
      { type: "pm_edits_validation_failed", errors: ["Total items (3) exceeds maximum items limit of 2"], ts: ts() },
    ];
    tmpRepo.git(["add", "-A"], { cwd: taskWtPath });
    tmpRepo.git(["commit", "-m", "seed live dead state (records only)"], { cwd: taskWtPath });
    // Uncommitted at crash: journal tail + a stray outside-orchestration file.
    fs.writeFileSync(
      path.join(deployedTaskDir, "journal.ndjson"),
      journalLines.map((e) => JSON.stringify(e)).join("\n") + "\n"
    );
    fs.writeFileSync(path.join(taskWtPath, "agent-dropping.tmp"), "stray agent dirt\n", "utf8");

    // No edits file: the dead run never wrote one.
    expect(fs.existsSync(path.join(planDir, "edits-1.0.yaml"))).toBe(false);

    const harness = new FakeHarness();
    // NOTE: pm-edits-1#a1/#a2 are intentionally NOT scripted: any re-run throws.
    harness.scriptOutcome(`${task}/runs/architect-pmfix-1#a1`, {
      ok: true,
      data: plan,
    });
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a3`, {
      ok: true,
      data: { iteration: 1, items: [editItem("r1")] },
    });
    scriptWaveClose(harness, task, ["r1"]);
    const pipeline = makePipeline();

    const res = await runTask(
      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
      task
    );
    expect(res.status).toBe("done");

    const labels = harness.calls
      .filter((c) => c.type === "run")
      .map((c) => (c as any).run.label);
    // Straight to the bounce: pmfix runs before any fresh PM turn, and the
    // stale pm-edits attempts are never re-run.
    const pmfixIdx = labels.findIndex((l) => l.includes("/runs/architect-pmfix-1#"));
    expect(pmfixIdx).toBeGreaterThanOrEqual(0);
    const firstPmIdx = labels.findIndex((l) => l.includes("/runs/pm-edits-1#"));
    expect(firstPmIdx).toBeGreaterThan(pmfixIdx);
    expect(labels.some((l) => l.includes("/runs/pm-edits-1#a1") || l.includes("/runs/pm-edits-1#a2"))).toBe(false);
    expect(labels.some((l) => l.includes("/runs/plan-review-1-"))).toBe(false);
    const journal = fs.readFileSync(path.join(deployedTaskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("pm_edits_restart_bounce");
    expect(journal).toContain("pm_edits_bounced_to_architect");
    expect(fs.existsSync(path.join(planDir, "edits-1.0.yaml"))).toBe(true);
    // Restart repair committed the dirty journal as recovery (detector-visible)
    // and stashed only the outside-orchestration dropping.
    const logSubjects = tmpRepo.git(["log", "--format=%s"], { cwd: taskWtPath }).stdout.split("\n");
    expect(logSubjects.some((s) => s.includes("factory: restart recovery"))).toBe(true);
    const stashShow = tmpRepo.git(["stash", "show", "--include-untracked", "--name-only", "stash@{0}"], { cwd: taskWtPath });
    expect(stashShow.stdout).toContain("agent-dropping.tmp");
    expect(stashShow.stdout).not.toContain("journal.ndjson");
    // Recovery commit itself contains the journal tail (detector evidence).
    const journalAtRecovery = tmpRepo.git(["log", "--format=%H", "--grep=factory: restart recovery"], { cwd: taskWtPath }).stdout.trim().split("\n")[0]!;
    const journalShown = tmpRepo.git(["show", `${journalAtRecovery}:.factory/${task}/journal.ndjson`], { cwd: taskWtPath });
    expect(journalShown.stdout).toContain("pm_edits_validation_failed");
  });
});
