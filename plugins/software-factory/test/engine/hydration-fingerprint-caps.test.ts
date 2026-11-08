import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import yaml from "yaml";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runAgentStep } from "../../src/core/flows/step-runner.js";
import { runIteration } from "../../src/core/flows/iteration.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
import {
  aggregateConcerns,
  applyConcernTriage,
  concernFingerprint,
  countConcerns,
  listConcerns,
} from "../../src/core/concerns.js";
import * as triageModule from "../../src/core/triage.js";
import type {
  ConcernSource,
  PipelineConfig,
  ProjectConfig,
  StoredConcernArtifact,
} from "../../src/core/artifacts.js";

/**
 * Unified hydration, step-role byte caps, hydrated sets and fingerprint identity
 * (ADRs adr-hydration-single-cap, adr-hydrated-sets, adr-fingerprint-affects-union).
 *
 * Callers compute byte inputs; `hydrateStepConcerns` caps and renders. Review and
 * QA hydrate from the prompt diff, close-ups from the task-branch diff, and
 * plan-review/architect/develop-family from their registered prompt input.
 */

const ORCH = ".factory";
const TASK = "hydration-caps";
const agentsDir = path.resolve(import.meta.dir, "../../agents");

type Hydrate = (
  taskDir: string,
  request: {
    stepRole: string;
    inputBytes?: number;
    diffBytes?: number;
    taskDiffBytes?: number;
    consumer?: string;
  }
) => Promise<string>;
type ListHydrated = (
  taskDir: string,
  consumer: string
) => Promise<Array<Record<string, any>>>;

/**
 * New triage exports are looked up dynamically so this file collects against the
 * pre-implementation module and fails on behavior, not on a missing import.
 */
function hydrationApi(): { hydrate: Hydrate; list: ListHydrated } {
  const mod = triageModule as unknown as {
    hydrateStepConcerns?: Hydrate;
    listHydratedConcerns?: ListHydrated;
  };
  const hydrate = mod.hydrateStepConcerns;
  const list = mod.listHydratedConcerns;
  if (!hydrate || !list) {
    return {
      hydrate: (() => {
        throw new Error("hydrateStepConcerns is not implemented");
      }) as unknown as Hydrate,
      list: (() => {
        throw new Error("listHydratedConcerns is not implemented");
      }) as unknown as ListHydrated,
    };
  }
  return { hydrate, list };
}

const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");
const idLines = (text: string) => text.split("\n").filter((line) => /^\s*- id: (c|rm)-/.test(line));
const occurrences = (text: string, needle: string) => text.split(needle).length - 1;

describe("Hydration caps (adr-hydration-single-cap)", () => {
  let tmpRepo: TmpRepo;
  let repo: Repo;
  let taskWt: string;
  let taskDir: string;
  let worktreeRoot: string;
  let pipeline: PipelineConfig;
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
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Hydration caps\n", "utf8");
    tmpRepo.commit("add hydration caps task");

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
        reviewer: { role: "alt-workhorse" },
        qa: { role: "alt-workhorse" },
        architect: { role: "architect" },
        "plan-reviewer": { role: "alt-architect" },
        pm: { role: "alt-workhorse" },
        "wave-close-up": { role: "alt-workhorse" },
        "plan-close-up": { role: "alt-workhorse" },
      },
      flows: { simple: { steps: [] }, story: { dev: { steps: [] } }, spike: {} },
      limits: { maxPlanReviewRounds: 1 },
    };
    project = { orchestrationFolder: ORCH, worktreeRoot };
    prompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [] });
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  function concern(
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

  async function writeConcern(overrides: Partial<StoredConcernArtifact> & { id: string }) {
    await writeYamlAtomic(path.join(taskDir, "concerns", `${overrides.id}.yaml`), concern(overrides));
  }

  function concernsDir() {
    return path.join(taskDir, "concerns");
  }

  function concernFiles(prefix = "c-") {
    const dir = concernsDir();
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((name) => name.startsWith(prefix) && name.endsWith(".yaml"))
      .map((name) => name.slice(0, -".yaml".length))
      .sort();
  }

  function runReview(promptVars: Record<string, string>, promptsFor = prompts) {
    const harness = new FakeHarness();
    const label = `${TASK}/runs/review#a1`;
    harness.scriptOutcome(label, {
      ok: true,
      data: { status: "approved", summary: "Looks fine", suggestions: [] },
    });
    harness.scriptOutcome(`${label}#relaunch`, {
      ok: true,
      data: { status: "approved", summary: "Looks fine", suggestions: [] },
    });
    fs.mkdirSync(path.join(taskDir, "runs"), { recursive: true });
    return runAgentStep({
      task: TASK,
      stepId: "review",
      stepFragment: "steps/review",
      agent: "reviewer",
      cwd: taskWt,
      taskWt,
      taskDir,
      recordsDir: path.join(taskDir, "runs"),
      repo,
      harness,
      pipeline,
      project,
      prompts: promptsFor,
      promptVars,
    }).then((result) => ({ result, harness }));
  }

  function promptOf(harness: FakeHarness): string {
    const call = harness.calls.find((c) => c.type === "run");
    if (!call || call.type !== "run") throw new Error("no agent run captured");
    return call.run.prompt;
  }

  it("caps review hydration at min(diffBytes, 2000) bytes", async () => {
    await writeConcern({
      id: "c-aaaaaaaaaa",
      kind: "risk",
      summary: "Retry loop can spin",
      detail: "DETAIL_SENTINEL" + "d".repeat(600),
      severity: "high",
      affects: ["item-a"],
    });
    await writeConcern({
      id: "c-bbbbbbbbbb",
      kind: "blocker",
      summary: "Missing adapter",
      detail: "e".repeat(600),
      severity: "medium",
    });

    const { hydrate } = hydrationApi();
    const hydrated = await hydrate(taskDir, { stepRole: "review", diffBytes: 5000 });
    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(2000);
    expect(utf8Bytes(hydrated)).toBeLessThan(5000);
    expect(hydrated).toContain("c-aaaaaaaaaa");
    expect(hydrated).toContain("Retry loop can spin");
    expect(hydrated).not.toContain("DETAIL_SENTINEL");
    expect(yaml.parse(hydrated)).toHaveLength(2);

    const small = await hydrate(taskDir, { stepRole: "review", diffBytes: 320 });
    expect(utf8Bytes(small)).toBeLessThanOrEqual(320);
    expect(small).toContain("c-");
  });

  it("caps plan-review hydration at min(inputBytes, 500) bytes", async () => {
    await writeConcern({
      id: "c-cccccccccc",
      kind: "tech-debt",
      summary: "Plan duplicates the retry helper",
      detail: "f".repeat(600),
      severity: "medium",
      affects: ["m1"],
    });
    await writeConcern({
      id: "c-dddddddddd",
      kind: "risk",
      summary: "Milestone boundary depends on an unbuilt adapter",
      detail: "g".repeat(600),
      severity: "high",
      affects: ["m1"],
    });

    const { hydrate } = hydrationApi();
    const hydrated = await hydrate(taskDir, { stepRole: "plan-review", inputBytes: 4000 });
    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(500);
    expect(utf8Bytes(hydrated)).toBeLessThan(4000);
    expect(hydrated).toContain("c-cccccccccc");

    // Iteration 2+ has merged code on the branch: classification still uses the
    // registered prompt input, not a branch-state diff inference.
    const iterationTwo = await hydrate(taskDir, { stepRole: "plan-review", inputBytes: 294 });
    expect(utf8Bytes(iterationTwo)).toBeLessThanOrEqual(294);
  });

  it("caps wave-close-up hydration at min(taskDiffBytes, 2000) bytes", async () => {
    await writeConcern({
      id: "c-eeeeeeeeee",
      kind: "tech-debt",
      summary: "Shared helper duplicated in two modules",
      detail: "h".repeat(3000),
      severity: "medium",
    });
    await writeConcern({
      id: "c-ffffffffff",
      kind: "assumption",
      summary: "Cache survives restart",
      detail: "i".repeat(3000),
      severity: "low",
    });

    const { hydrate } = hydrationApi();
    const hydrated = await hydrate(taskDir, { stepRole: "wave-close-up", taskDiffBytes: 5000 });
    expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(2000);
    expect(utf8Bytes(hydrated)).toBeLessThan(5000);
    expect(hydrated).toContain("c-eeeeeeeeee");

    const planCloseup = await hydrate(taskDir, {
      stepRole: "plan-close-up",
      taskDiffBytes: 5000,
    });
    expect(utf8Bytes(planCloseup)).toBeLessThanOrEqual(2000);
  });

  it("returns empty hydration for zero and tiny caps", async () => {
    await writeConcern({
      id: "c-1111111111",
      kind: "risk",
      summary: "Visible only when the cap allows bytes",
      detail: "j".repeat(600),
    });

    const { hydrate } = hydrationApi();
    const positive = await hydrate(taskDir, { stepRole: "review", diffBytes: 5000 });
    expect(positive).not.toBe("");
    expect(idLines(positive).length).toBeGreaterThan(0);

    for (const cap of [0, 1, 3]) {
      const empty = await hydrate(taskDir, { stepRole: "review", diffBytes: cap });
      expect(empty).toBe("");
      expect(idLines(empty)).toEqual([]);
    }
  });

  it("injects review concernsYaml by diff bytes and lets caller-supplied values win", async () => {
    const summary = "Retry loop can spin";
    const cid = "c-2222222222";
    await writeConcern({
      id: cid,
      kind: "risk",
      summary,
      detail: "DETAIL_SENTINEL" + "k".repeat(400),
      severity: "high",
      affects: ["item-a"],
    });

    // Zero-byte diff: the computed cap is zero, so no concerns are hydrated.
    const zero = await runReview({ assignment: "Review", checks: "", diff: "", dispositionsCriteria: "" });
    expect(promptOf(zero.harness)).not.toContain(cid);

    const hydrated = await runReview({
      assignment: "Review",
      checks: "",
      diff: "d".repeat(3000),
      dispositionsCriteria: "",
    });
    const prompt = promptOf(hydrated.harness);
    expect(prompt).toContain(cid);
    expect(prompt).toContain(summary);
    expect(prompt).not.toContain("DETAIL_SENTINEL");

    const supplied = await runReview({
      assignment: "Review",
      checks: "",
      diff: "d".repeat(3000),
      dispositionsCriteria: "",
      concernsYaml: "CALLER-CONCERNS: c-caller",
    });
    const suppliedPrompt = promptOf(supplied.harness);
    expect(suppliedPrompt).toContain("CALLER-CONCERNS: c-caller");
    expect(suppliedPrompt).not.toContain(cid);
  });

  it("computes close-up task diff bytes through the injected git function", async () => {
    const cid = "c-3333333333";
    await writeConcern({
      id: cid,
      kind: "risk",
      summary: "Close-up concern",
      detail: "l".repeat(400),
      severity: "medium",
    });

    const overridesDir = fs.mkdtempSync(path.join(os.tmpdir(), "closeup-prompts-"));
    fs.mkdirSync(path.join(overridesDir, "steps"), { recursive: true });
    fs.writeFileSync(
      path.join(overridesDir, "steps", "wave-close-up.md"),
      "Task {{task}}\n{{waveReport}}\n{{infra}}\nHYDRATE:\n{{concernsYaml}}\nEND\n",
      "utf8"
    );
    const closeupPrompts = loadPromptLibrary({ builtinDir: agentsDir, overrideDirs: [overridesDir] });

    const gitCalls: string[][] = [];
    const gitFn = async (_cwd: string, args: string[]) => {
      gitCalls.push(args);
      return { stdout: "x".repeat(5000), stderr: "", code: 0 };
    };
    const harness = new FakeHarness();
    harness.scriptOutcome(`${TASK}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report" },
    });
    harness.scriptOutcome(`${TASK}/runs/wave-close-up-1-1#a1#relaunch`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report" },
    });
    try {
      await runAgentStep({
        task: TASK,
        stepId: "wave-close-up-1-1",
        stepFragment: "steps/wave-close-up",
        agent: "wave-close-up",
        cwd: taskWt,
        taskWt,
        taskDir,
        parentBranch: "topic/demo",
        recordsDir: path.join(taskDir, "runs"),
        repo,
        harness,
        pipeline,
        project,
        prompts: closeupPrompts,
        promptVars: { task: TASK, waveReport: "Wave 1", infra: "" },
        gitFn,
      } as any);
    } finally {
      fs.rmSync(overridesDir, { recursive: true, force: true });
    }

    expect(gitCalls).toContainEqual(["diff", "topic/demo...HEAD"]);
    const prompt = promptOf(harness);
    const block = /HYDRATE:\n([\s\S]*?)\nEND/.exec(prompt)?.[1] ?? "";
    expect(block).toContain(cid);
    expect(utf8Bytes(block)).toBeLessThanOrEqual(2000);
    expect(utf8Bytes(block)).toBeLessThan(5000);
  });

  it("hydrates architect turns from concernsYaml without a duplicate concerns section", async () => {
    const cid = "c-4444444444";
    await writeConcern({
      id: cid,
      kind: "blocker",
      summary: "Database schema migration is pending",
      detail: "m".repeat(400),
      severity: "high",
      status: "routed",
      disposition: "architect",
      affects: ["seed"],
    });
    await writeYamlAtomic(path.join(taskDir, "decisions", "dec-1.yaml"), {
      id: "dec-1",
      context: "task",
      decision: "continue",
      rationale: "漢".repeat(120),
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    const overridesDir = fs.mkdtempSync(path.join(os.tmpdir(), "architect-plan-prompts-"));
    fs.mkdirSync(path.join(overridesDir, "steps"), { recursive: true });
    fs.writeFileSync(
      path.join(overridesDir, "steps", "architect-plan.md"),
      "DEBT<{{debt}}>STEER<{{steering}}>CONCERNS:\n{{concernsYaml}}\nEND\n",
      "utf8"
    );
    const architectPrompts = loadPromptLibrary({
      builtinDir: agentsDir,
      overrideDirs: [overridesDir],
    });

    const harness = new FakeHarness();
    let architectPrompt = "";
    harness.scriptOutcome(`${TASK}/runs/architect-plan-1#a1`, (run) => {
      architectPrompt = run.prompt;
      return {
        ok: true,
        data: {
          iteration: 1,
          milestones: [{ id: "m1", title: "M1", scenarios: ["Scenario"] }],
          itemOutlines: [],
        },
      };
    });
    harness.scriptOutcome(`${TASK}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: { status: "approved", summary: "Plan ok", suggestions: [] },
    });
    harness.scriptOutcome(`${TASK}/runs/pm-edits-1#a1`, {
      ok: true,
      data: { iteration: 1, items: [] },
    });

    try {
      await runIteration({
        task: TASK,
        taskDir,
        taskWt,
        repo,
        harness,
        pipeline: {
          ...pipeline,
          limits: {
            hydrationBytes: 20,
            maxPlanReviewRounds: 1,
            maxIterations: 3,
            maxParallelItems: 2,
            maxParallelTurns: 4,
            maxStepAttempts: 3,
            maxFixRounds: 3,
          },
        },
        project,
        prompts: architectPrompts,
      });
    } finally {
      fs.rmSync(overridesDir, { recursive: true, force: true });
    }

    expect(architectPrompt).toContain(cid);
    expect(occurrences(architectPrompt, cid)).toBe(1);
    expect(architectPrompt).not.toContain("--- Concerns ---");

    const debt = /DEBT<([\s\S]*?)>STEER</.exec(architectPrompt)?.[1] ?? "";
    const steering = /STEER<([\s\S]*?)>CONCERNS:/.exec(architectPrompt)?.[1] ?? "";
    expect(utf8Bytes(debt)).toBeLessThanOrEqual(20);
    expect(utf8Bytes(steering)).toBeLessThanOrEqual(20);
    expect(debt).not.toContain("\uFFFD");
    expect(steering).not.toContain("\uFFFD");

    const concerns = /CONCERNS:\n([\s\S]*?)\nEND/.exec(architectPrompt)?.[1] ?? "";
    expect(utf8Bytes(concerns)).toBeLessThanOrEqual(500);
    expect(concerns).toContain(cid);
  });
});

describe("Hydrated concern sets (adr-hydrated-sets)", () => {
  let tmpRepo: TmpRepo;
  let taskDir: string;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    taskDir = path.join(tmpRepo.dir, ORCH, TASK);
    fs.mkdirSync(taskDir, { recursive: true });
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  function concern(
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

  async function writeConcern(overrides: Partial<StoredConcernArtifact> & { id: string }) {
    await writeYamlAtomic(path.join(taskDir, "concerns", `${overrides.id}.yaml`), concern(overrides));
  }

  async function writeRemarkable(
    id: string,
    chosen: string,
    overrides: Record<string, unknown> = {}
  ) {
    await writeYamlAtomic(path.join(taskDir, "concerns", `${id}.yaml`), {
      id,
      chosen,
      alternatives: ["Other"],
      why: "w".repeat(300),
      status: "open",
      source: { record: "001-architect-plan-a1", agent: "architect" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    });
  }

  it("hydrates open concerns with pending resolutions for review", async () => {
    const pending = {
      action: "carry" as const,
      note: "Needs an architect decision",
      by: "wave-close-up",
      at: "2026-01-02T00:00:00.000Z",
    };
    await writeConcern({
      id: "c-5555555555",
      summary: "Needs a decision",
      detail: "DETAIL_SENTINEL".padEnd(500, "n"),
      pendingResolution: pending,
    });

    const { list } = hydrationApi();
    for (const consumer of ["review", "develop", "qa"]) {
      const hydrated = await list(taskDir, consumer);
      expect(hydrated).toHaveLength(1);
      expect(hydrated[0]).toMatchObject({
        id: "c-5555555555",
        kind: "risk",
        summary: "Needs a decision",
        pendingResolution: pending,
      });
      expect(hydrated[0]).not.toHaveProperty("detail");
    }
  });

  it("includes routed concerns for close-ups but not for review", async () => {
    await writeConcern({ id: "c-6666666666", status: "open", createdAt: "2026-01-01T00:00:00.000Z" });
    await writeConcern({
      id: "c-7777777777",
      status: "routed",
      disposition: "architect",
      createdAt: "2026-01-02T00:00:00.000Z",
    });
    await writeConcern({ id: "c-8888888888", status: "resolved", createdAt: "2026-01-03T00:00:00.000Z" });

    const { list } = hydrationApi();
    const review = await list(taskDir, "review");
    expect(review.map((r) => r.id)).toEqual(["c-6666666666"]);

    const closeup = await list(taskDir, "closeup");
    expect(closeup.map((r) => r.id)).toEqual(["c-6666666666", "c-7777777777"]);
  });

  it("hydrates open remarkables as terse remarkable records", async () => {
    await writeRemarkable("rm-aaaaaaaaaa", "File-per-concern YAML store");
    await writeRemarkable("rm-bbbbbbbbbb", "Routed choice", { status: "routed" });

    const { list } = hydrationApi();
    const review = await list(taskDir, "review");
    expect(review).toEqual([
      { id: "rm-aaaaaaaaaa", kind: "remarkable", summary: "File-per-concern YAML store" },
    ]);

    const architect = await list(taskDir, "architect");
    expect(architect).toEqual([
      { id: "rm-aaaaaaaaaa", kind: "remarkable", summary: "File-per-concern YAML store" },
    ]);
  });

  it("includes dismissed escalated concerns only in the architect set", async () => {
    await writeConcern({
      id: "c-9999999999",
      status: "dismissed",
      dismissReason: "not real",
      source: { record: "002-review-a1", agent: "reviewer", escalated: true },
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    await writeConcern({
      id: "c-ababababab",
      status: "dismissed",
      dismissReason: "quiet",
      createdAt: "2026-01-02T00:00:00.000Z",
    });
    await writeConcern({
      id: "c-acacacacac",
      status: "open",
      createdAt: "2026-01-03T00:00:00.000Z",
    });

    const { list } = hydrationApi();
    const review = await list(taskDir, "review");
    expect(review.map((r) => r.id)).toEqual(["c-acacacacac"]);

    const architect = await list(taskDir, "architect");
    expect(architect.map((r) => r.id)).toEqual(["c-9999999999", "c-acacacacac"]);
    expect(architect[0]).toMatchObject({
      id: "c-9999999999",
      status: "dismissed",
      escalated: true,
    });
  });

  it("counts concerns only, never remarkables", async () => {
    await writeRemarkable("rm-cccccccccc", "A remarkable choice");
    expect(await countConcerns(taskDir)).toEqual({ open: 0, dismissed: 0, routed: 0, resolved: 0 });

    await writeConcern({ id: "c-adadadadad", status: "open" });
    expect(await countConcerns(taskDir)).toEqual({ open: 1, dismissed: 0, routed: 0, resolved: 0 });
  });
});

describe("Concern identity and affects union (adr-fingerprint-affects-union)", () => {
  let tmpRepo: TmpRepo;
  let repo: Repo;
  let taskWt: string;
  let taskDir: string;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: path.join(tmpRepo.dir + "-wt") });
    taskWt = tmpRepo.dir;
    taskDir = path.join(taskWt, ORCH, TASK);
    fs.mkdirSync(taskDir, { recursive: true });
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  function source(record = "001-develop-a1"): ConcernSource {
    return { record, agent: "developer" };
  }

  function concernFiles() {
    const dir = path.join(taskDir, "concerns");
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((name) => name.startsWith("c-") && name.endsWith(".yaml"))
      .map((name) => name.slice(0, -".yaml".length))
      .sort();
  }

  /** Pre-fix identity hash (kind + normalized summary + location + sorted affects). */
  function legacyFingerprint(input: {
    kind: string;
    summary: string;
    location?: { file: string; line?: number };
    affects?: string[];
  }): string {
    const norm = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
    const affects = [...new Set((input.affects ?? []).map((a) => a.trim()))].sort();
    const parts = [
      input.kind,
      norm(input.summary),
      input.location?.file.trim() ?? null,
      input.location?.line ?? null,
      affects,
    ];
    return `c-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
  }

  it("fingerprints kind, normalized summary, and location without affects", () => {
    const identity = {
      kind: "risk" as const,
      summary: "  Flaky   GATE ",
      location: { file: "src/core/example.ts", line: 7 },
    };
    const id = concernFingerprint({ ...identity, affects: ["item-b", "item-a"] });

    expect(id).toMatch(/^c-[0-9a-f]{10}$/);
    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).toBe(id);
    expect(concernFingerprint({ ...identity, affects: [] })).toBe(id);
    expect(concernFingerprint({ ...identity, detail: "long detail", severity: "high" })).toBe(id);

    expect(concernFingerprint({ ...identity, kind: "blocker" })).not.toBe(id);
    expect(
      concernFingerprint({ ...identity, location: { file: "src/core/example.ts", line: 8 } })
    ).not.toBe(id);
  });

  it("unions affects without forking and preserves terminal status", async () => {
    const identity = {
      kind: "risk" as const,
      summary: "Flaky gate blocks merges",
      location: { file: "src/core/merge.ts", line: 12 },
    };
    const id = concernFingerprint(identity);

    await aggregateConcerns(
      { taskDir, taskWt, repo, source: source() },
      [{ ...identity, detail: "short", severity: "low", affects: ["item-a"] }]
    );
    expect(concernFiles()).toEqual([id]);

    await aggregateConcerns(
      { taskDir, taskWt, repo, source: source("002-develop-a1") },
      [{ ...identity, detail: "a much longer detail", severity: "high", affects: ["item-b", "item-a"] }]
    );
    expect(concernFiles()).toEqual([id]);
    let stored = await readYaml<StoredConcernArtifact>(
      path.join(taskDir, "concerns", `${id}.yaml`)
    );
    expect(stored.affects).toEqual(["item-a", "item-b"]);
    expect(stored.status).toBe("open");
    expect(stored.detail).toBe("a much longer detail");
    expect(stored.severity).toBe("high");
    expect(stored.source.escalated).toBe(true);

    await applyConcernTriage({
      taskDir,
      taskWt,
      repo,
      isTriager: true,
      suggestions: [
        { id, disposition: "dismiss", summary: "Duplicate", detail: "covered by ADR-1" },
      ],
    });

    await aggregateConcerns(
      { taskDir, taskWt, repo, source: source("003-review-a1") },
      [{ ...identity, detail: "new detail", severity: "low", affects: ["item-c"] }]
    );
    expect(concernFiles()).toEqual([id]);
    stored = await readYaml<StoredConcernArtifact>(path.join(taskDir, "concerns", `${id}.yaml`));
    expect(stored.status).toBe("dismissed");
    expect(stored.dismissReason).toBe("covered by ADR-1");
    expect(stored.affects).toEqual(["item-a", "item-b", "item-c"]);
    expect(stored.source.escalated).toBe(true);
  });

  it("renames a legacy affects-keyed file to the stable id", async () => {
    const identity = {
      kind: "risk" as const,
      summary: "Legacy concern",
      location: { file: "src/legacy.ts", line: 4 },
    };
    const legacyId = legacyFingerprint({ ...identity, affects: ["old"] });
    const stableId = concernFingerprint(identity);
    expect(legacyId).not.toBe(stableId);

    await writeYamlAtomic(path.join(taskDir, "concerns", `${legacyId}.yaml`), {
      id: legacyId,
      ...identity,
      detail: "legacy detail",
      severity: "medium",
      status: "open",
      affects: ["old"],
      source: { record: "000-develop-a1", agent: "developer" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(concernFiles()).toEqual([legacyId]);

    await aggregateConcerns(
      { taskDir, taskWt, repo, source: source("001-develop-a1") },
      [{ ...identity, detail: "new detail", severity: "high", affects: ["new"] }]
    );

    expect(concernFiles()).toEqual([stableId]);
    expect(fs.existsSync(path.join(taskDir, "concerns", `${legacyId}.yaml`))).toBe(false);
    const stored = await readYaml<StoredConcernArtifact>(
      path.join(taskDir, "concerns", `${stableId}.yaml`)
    );
    expect(stored.id).toBe(stableId);
    expect(stored.affects).toEqual(["new", "old"]);
    expect(stored.detail).toBe("new detail");
    expect(stored.severity).toBe("high");

    // Re-emitting with another affect keeps the same stable triage id.
    await aggregateConcerns(
      { taskDir, taskWt, repo, source: source("002-develop-a1") },
      [{ ...identity, affects: ["new", "third"] }]
    );
    expect(concernFiles()).toEqual([stableId]);
    expect((await listConcerns(taskDir)).map((c) => c.id)).toEqual([stableId]);
  });
});
