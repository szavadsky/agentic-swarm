import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runAgentStep } from "../../src/core/flows/step-runner.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
import {
  aggregateConcerns,
  applyCloseupResolutions,
  applyConcernTriage,
  concernFingerprint,
  listOpenConcerns,
  partitionSuggestions,
  reconcileConcerns,
} from "../../src/core/concerns.js";
import type {
  Concern,
  ConcernSource,
  PipelineConfig,
  ProjectConfig,
  ReviewSuggestion,
  StoredConcernArtifact,
} from "../../src/core/artifacts.js";

/**
 * Funnel behaviour for concern-producing steps (docs/factory.v2.md §18).
 *
 * The schema is the write gate: a valid concern payload must reach the
 * canonical artifact writer, while an unknown `kind` must be rejected by
 * validation and never reach that writer. `detail` and `severity` are
 * optional in JSON; the runtime concern store fills defaults.
 */
describe("Concern funnel schemas", () => {
  let tmpRepo: TmpRepo;
  let repoObj: Repo;
  let pipeline: PipelineConfig;
  let project: ProjectConfig;
  let prompts: ReturnType<typeof loadPromptLibrary>;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    project = {
      orchestrationFolder: ".factory",
      worktreeRoot: path.join(tmpRepo.dir, ".worktrees"),
    };
    repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: project.worktreeRoot });
    pipeline = {
      models: {
        roles: {
          workhorse: { model: "deepseek-chat" },
          simpler: { model: "deepseek-chat" },
        },
      },
      agents: {
        developer: { role: "workhorse" },
      },
      flows: {
        simple: { steps: [] },
        story: {},
        spike: {},
      },
      limits: {},
    };
    prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  async function runConcernStep(opts: {
    task: string;
    item: string;
    stepFragment: "poc" | "test-assumptions";
    data: Record<string, unknown>;
    markerPath: string;
  }) {
    const taskDir = path.join(tmpRepo.dir, ".factory", opts.task);
    const recordsDir = path.join(taskDir, "items", opts.item, "steps");
    fs.mkdirSync(recordsDir, { recursive: true });
    const childWt = tmpRepo.createWorktree(`topic/${opts.task}--${opts.item}`);

    const harness = new FakeHarness();
    const label = `${opts.task}/items/${opts.item}/develop#a1`;
    harness.scriptOutcome(label, { ok: true, data: opts.data });
    harness.scriptOutcome(`${label}#relaunch`, { ok: true, data: opts.data });
    harness.scriptComplete(() => opts.data);

    let writes = 0;
    const result = await runAgentStep({
      task: opts.task,
      item: opts.item,
      stepId: "develop",
      stepFragment: opts.stepFragment,
      agent: "developer",
      cwd: childWt,
      taskDir,
      recordsDir,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: {
        assignment: "Exercise concern schema",
        context: "Concern funnel test context",
      },
      writeArtifact: async (output) => {
        writes++;
        fs.writeFileSync(opts.markerPath, JSON.stringify(output), "utf8");
      },
    });

    return { result, writes };
  }

  it("valid concerns pass validation and unknown kinds reject with no artifact write", async () => {
    // Valid payload: minimal concern (detail/severity omitted) plus a fully populated one.
    const validMarker = path.join(tmpRepo.dir, "valid-concern-write.json");
    const validData = {
      status: "ok",
      summary: "PoC completed",
      evidence: ["poc/attempt.ts ran"],
      concerns: [
        { kind: "assumption", summary: "Provider retries are safe" },
        {
          kind: "risk",
          summary: "PoC relies on an unstable API",
          detail: "The endpoint shape may change",
          severity: "medium",
          location: { file: "poc/attempt.ts", line: 12 },
          affects: ["concerns-funnel"],
        },
      ],
    };

    const valid = await runConcernStep({
      task: "concern-valid",
      item: "poc-item",
      stepFragment: "poc",
      data: validData,
      markerPath: validMarker,
    });

    expect(valid.result.ok).toBe(true);
    expect(valid.result.status).toBe("ok");
    expect(valid.writes).toBe(1);
    expect(fs.existsSync(validMarker)).toBe(true);
    const written = JSON.parse(fs.readFileSync(validMarker, "utf8"));
    expect(written.concerns.map((c: any) => c.kind)).toEqual(["assumption", "risk"]);

    // Invalid payload: unknown concern kind must be rejected by the schema,
    // and the canonical artifact writer must never run.
    const invalidMarker = path.join(tmpRepo.dir, "invalid-concern-write.json");
    const invalidData = {
      status: "ok",
      summary: "Assumptions tested",
      evidence: ["tests/assumption.test.ts passed"],
      concerns: [{ kind: "bug", summary: "Unknown concern kind" }],
    };

    const invalid = await runConcernStep({
      task: "concern-invalid",
      item: "assumption-item",
      stepFragment: "test-assumptions",
      data: invalidData,
      markerPath: invalidMarker,
    });

    expect(invalid.result.ok).toBe(false);
    expect(invalid.result.status).toBe("rejected");
    expect(invalid.writes).toBe(0);
    expect(fs.existsSync(invalidMarker)).toBe(false);
    expect(invalid.result.meta.error ?? "").toContain("/concerns/0/kind");
  });
});

/**
 * Behaviour of the taskWt concern store (docs/factory.v2.md §18; ADRs
 * adr-concern-store-taskwt, adr-fingerprint-merge, adr-triage-suggestions-dismiss).
 *
 * `{task}/concerns/` lives on the task worktree while item steps only commit
 * childWt, so the store must write an explicit taskWt path, serialize
 * read-modify-write merges per task, and commit taskWt immediately. One file
 * per fingerprint keeps retries and restarts idempotent.
 */
describe("Concern store", () => {
  const ORCH = ".factory";
  const TASK = "concern-store";

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
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Concern store\n", "utf8");
    tmpRepo.commit("add concern store task");

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
        "fact-finder": { role: "workhorse" },
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

  function concernSource(
    record: string,
    agent = "developer",
    extra: Partial<ConcernSource> = {}
  ): ConcernSource {
    return { record, agent, ...extra };
  }

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

  async function writeStoredConcern(concern: StoredConcernArtifact): Promise<string> {
    const file = path.join(taskDir, "concerns", `${concern.id}.yaml`);
    await writeYamlAtomic(file, concern);
    return file;
  }

  async function runStep(opts: {
    item?: string;
    agent: string;
    stepId: string;
    stepFragment: string;
    cwd: string;
    recordsDir: string;
    data: unknown;
    promptVars: Record<string, string>;
    writeArtifact?: (output: unknown) => Promise<void>;
  }) {
    const harness = new FakeHarness();
    const label = opts.item
      ? `${TASK}/items/${opts.item}/${opts.stepId}#a1`
      : `${TASK}/runs/${opts.stepId}#a1`;
    harness.scriptOutcome(label, { ok: true, data: opts.data });
    harness.scriptOutcome(`${label}#relaunch`, { ok: true, data: opts.data });
    harness.scriptComplete(() => opts.data);

    return runAgentStep({
      task: TASK,
      item: opts.item,
      stepId: opts.stepId,
      stepFragment: opts.stepFragment,
      agent: opts.agent,
      cwd: opts.cwd,
      taskDir,
      recordsDir: opts.recordsDir,
      taskWt,
      repo,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: opts.promptVars,
      writeArtifact: opts.writeArtifact,
    });
  }

  it("fingerprints concern identity, ignoring detail, severity, and affect order", () => {
    const identity = {
      kind: "risk" as const,
      summary: "  Flaky   GATE ",
      location: { file: "src/core/example.ts", line: 7 },
      affects: ["item-b", "item-a"],
    };
    const fp = concernFingerprint(identity);

    expect(fp).toMatch(/^c-[0-9a-f]{10}$/);
    expect(concernFingerprint({ ...identity, detail: "short", severity: "low" })).toBe(fp);
    expect(
      concernFingerprint({ ...identity, detail: "a much longer detail", severity: "high" })
    ).toBe(fp);
    expect(
      concernFingerprint({ ...identity, summary: "flaky gate", affects: ["item-a", "item-b"] })
    ).toBe(fp);

    expect(concernFingerprint({ ...identity, kind: "blocker" })).not.toBe(fp);
    expect(
      concernFingerprint({ ...identity, location: { file: "src/core/example.ts", line: 8 } })
    ).not.toBe(fp);
    expect(concernFingerprint({ ...identity, affects: ["item-a"] })).not.toBe(fp);
  });

  it("aggregates a developer concern to one open taskWt file with defaults, source, and immediate commit", async () => {
    const item = "item-a";
    const childWt = tmpRepo.createWorktree(`topic/${TASK}--${item}`);
    const recordsDir = path.join(childWt, ORCH, TASK, "items", item, "steps");
    fs.mkdirSync(recordsDir, { recursive: true });

    const result = await runStep({
      item,
      agent: "developer",
      stepId: "develop",
      stepFragment: "steps/develop",
      cwd: childWt,
      recordsDir,
      data: {
        status: "ok",
        summary: "Implemented the dependency",
        evidence: ["bun test passed"],
        concerns: [
          { kind: "blocker", summary: "Dependent item has no implementation", affects: [item] },
        ],
      },
      promptVars: { assignment: "Implement", target: "tests", citations: "[]" },
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("ok");

    const concernsDir = path.join(taskDir, "concerns");
    expect(fs.existsSync(concernsDir)).toBe(true);
    const files = fs.readdirSync(concernsDir).filter((f) => f.endsWith(".yaml"));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^c-[0-9a-f]{10}\.yaml$/);

    const stored = await readYaml<StoredConcernArtifact>(path.join(concernsDir, files[0]!));
    expect(stored.status).toBe("open");
    expect(stored.severity).toBe("medium");
    expect(stored.detail).toBe(stored.summary);
    expect(stored.source.record).toBe("001-develop-a1");
    expect(stored.source.agent).toBe("developer");
    expect(stored.source.item).toBe(item);

    // The concern is committed on taskWt, never written to the child worktree.
    const rel = path
      .relative(taskWt, path.join(concernsDir, files[0]!))
      .replace(/\\/g, "/");
    expect(
      tmpRepo.git(["cat-file", "-e", `HEAD:${rel}`], { cwd: taskWt, allowFail: true }).code
    ).toBe(0);
    expect(fs.existsSync(path.join(childWt, ORCH, TASK, "concerns"))).toBe(false);
  });

  it("merges re-emitted concerns into one file with longer detail, max severity, and advanced timestamps", async () => {
    let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
    const now = () => new Date(nowMs);

    const first = await aggregateConcerns(
      { taskDir, taskWt, repo, now, source: concernSource("001-develop-a1") },
      [{ kind: "risk", summary: "Flaky gate", detail: "short", severity: "low" }]
    );
    expect(first).toHaveLength(1);
    const id = first[0]!.id;
    const file = path.join(taskDir, "concerns", `${id}.yaml`);
    const created = await readYaml<StoredConcernArtifact>(file);

    nowMs += 60_000;
    const second = await aggregateConcerns(
      {
        taskDir,
        taskWt,
        repo,
        now,
        source: concernSource("002-develop-a1", "developer", { step: "develop", item: "item-a" }),
      },
      [{ kind: "risk", summary: "flaky   gate", detail: "a much longer detail", severity: "high" }]
    );
    expect(second).toHaveLength(1);
    expect(second[0]!.id).toBe(id);

    const merged = await readYaml<StoredConcernArtifact>(file);
    expect(merged.detail).toBe("a much longer detail");
    expect(merged.severity).toBe("high");
    expect(merged.status).toBe("open");
    expect(merged.source.record).toBe("002-develop-a1");
    expect(merged.createdAt).toBe(created.createdAt);
    expect(merged.updatedAt).toBe("2026-01-01T00:01:00.000Z");
    const lastSeen = (merged.source as ConcernSource & { lastSeen?: string }).lastSeen;
    expect(typeof lastSeen).toBe("string");
    expect(Date.parse(lastSeen!)).toBe(nowMs);

    // A shorter detail never replaces the longer stored one.
    nowMs += 60_000;
    await aggregateConcerns(
      { taskDir, taskWt, repo, now, source: concernSource("003-develop-a1") },
      [{ kind: "risk", summary: "Flaky gate", detail: "tiny", severity: "low" }]
    );
    const shorter = await readYaml<StoredConcernArtifact>(file);
    expect(shorter.detail).toBe("a much longer detail");
    expect(shorter.severity).toBe("high");

    // Equal-length details keep the latest re-emit.
    const equalA = "a".repeat(32);
    const equalB = "b".repeat(32);
    nowMs += 60_000;
    await aggregateConcerns(
      { taskDir, taskWt, repo, now, source: concernSource("004-develop-a1") },
      [{ kind: "risk", summary: "Flaky gate", detail: equalA, severity: "medium" }]
    );
    expect((await readYaml<StoredConcernArtifact>(file)).detail).toBe(equalA);
    nowMs += 60_000;
    await aggregateConcerns(
      { taskDir, taskWt, repo, now, source: concernSource("005-develop-a1") },
      [{ kind: "risk", summary: "Flaky gate", detail: equalB, severity: "medium" }]
    );
    expect((await readYaml<StoredConcernArtifact>(file)).detail).toBe(equalB);

    const files = fs.readdirSync(path.join(taskDir, "concerns")).filter((f) => f.endsWith(".yaml"));
    expect(files).toHaveLength(1);
    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
  });

  it("keeps dismissed status and flags escalation when a higher severity is re-emitted", async () => {
    let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
    const now = () => new Date(nowMs);

    const first = await aggregateConcerns(
      { taskDir, taskWt, repo, now, source: concernSource("001-develop-a1") },
      [{ kind: "risk", summary: "Endpoint may change", detail: "initial", severity: "low" }]
    );
    expect(first).toHaveLength(1);
    const id = first[0]!.id;

    const triaged = await applyConcernTriage({
      taskDir,
      taskWt,
      repo,
      now,
      isTriager: true,
      suggestions: [
        {
          id,
          disposition: "dismiss",
          summary: "Not real",
          detail: "covered by contract test",
        },
      ],
    });
    expect(triaged).toHaveLength(1);
    expect(triaged[0]!.status).toBe("dismissed");

    nowMs += 60_000;
    await aggregateConcerns(
      { taskDir, taskWt, repo, now, source: concernSource("002-develop-a1") },
      [
        {
          kind: "risk",
          summary: "Endpoint may change",
          detail: "a longer detail",
          severity: "high",
        },
      ]
    );

    const merged = await readYaml<StoredConcernArtifact>(
      path.join(taskDir, "concerns", `${id}.yaml`)
    );
    expect(merged.status).toBe("dismissed");
    expect(merged.dismissReason).toBe("covered by contract test");
    expect(merged.severity).toBe("high");
    expect(merged.source.escalated).toBe(true);
    expect(await listOpenConcerns(taskDir)).toEqual([]);
  });

  it("lists only open concerns in stable order", async () => {
    await writeStoredConcern(
      storedConcern({ id: "c-1111111111", createdAt: "2026-01-02T00:00:00.000Z" })
    );
    await writeStoredConcern(
      storedConcern({ id: "c-2222222222", createdAt: "2026-01-01T00:00:00.000Z" })
    );
    await writeStoredConcern(
      storedConcern({
        id: "c-3333333333",
        status: "dismissed",
        createdAt: "2026-01-01T00:00:00.000Z",
      })
    );
    await writeStoredConcern(
      storedConcern({
        id: "c-4444444444",
        status: "resolved",
        createdAt: "2026-01-01T00:00:00.000Z",
      })
    );
    await writeYamlAtomic(path.join(taskDir, "concerns", "rm-5555555555.yaml"), {
      id: "rm-5555555555",
      chosen: "A decision",
      alternatives: ["Other"],
      why: "reasons",
      status: "open",
      source: { record: "001-architect-plan-a1", agent: "architect" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const open = await listOpenConcerns(taskDir);
    expect(open.map((c) => c.id)).toEqual(["c-2222222222", "c-1111111111"]);
    expect(open.every((c) => typeof c.kind === "string" && typeof c.detail === "string")).toBe(true);
  });

  it("triages only exact-id suggestions and persists dismiss reasons", async () => {
    await writeStoredConcern(storedConcern({ id: "c-aaaaaaaaaa" }));
    await writeStoredConcern(storedConcern({ id: "c-bbbbbbbbbb" }));

    const triaged = await applyConcernTriage({
      taskDir,
      taskWt,
      repo,
      isTriager: true,
      suggestions: [
        {
          id: "c-aaaaaaaaaa",
          disposition: "dismiss",
          summary: "Duplicate",
          detail: "covered by ADR-1",
        },
        { id: "s-1", disposition: "dismiss", summary: "Not a concern", detail: "unrelated finding" },
      ],
    });

    expect(triaged.map((c) => c.id)).toEqual(["c-aaaaaaaaaa"]);
    const dismissed = await readYaml<StoredConcernArtifact>(
      path.join(taskDir, "concerns", "c-aaaaaaaaaa.yaml")
    );
    expect(dismissed.status).toBe("dismissed");
    expect(dismissed.dismissReason).toBe("covered by ADR-1");

    const untouched = await readYaml<StoredConcernArtifact>(
      path.join(taskDir, "concerns", "c-bbbbbbbbbb.yaml")
    );
    expect(untouched.status).toBe("open");
    expect(untouched.dismissReason).toBeUndefined();
    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
  });

  it("routes non-dismiss triage dispositions and gates non-triagers", async () => {
    await writeStoredConcern(storedConcern({ id: "c-cccccccccc" }));

    const ignored = await applyConcernTriage({
      taskDir,
      taskWt,
      repo,
      isTriager: false,
      suggestions: [{ id: "c-cccccccccc", disposition: "fix", summary: "Fix it" }],
    });
    expect(ignored).toEqual([]);
    const stillOpen = await readYaml<StoredConcernArtifact>(
      path.join(taskDir, "concerns", "c-cccccccccc.yaml")
    );
    expect(stillOpen.status).toBe("open");
    expect(stillOpen.disposition).toBeUndefined();

    const triaged = await applyConcernTriage({
      taskDir,
      taskWt,
      repo,
      isTriager: true,
      suggestions: [{ id: "c-cccccccccc", disposition: "fix", summary: "Fix it" }],
    });
    expect(triaged).toHaveLength(1);
    const routed = await readYaml<StoredConcernArtifact>(
      path.join(taskDir, "concerns", "c-cccccccccc.yaml")
    );
    expect(routed.status).toBe("routed");
    expect(routed.disposition).toBe("fix");
  });

  it("rejects dismiss triage without detail and leaves the concern unchanged", async () => {
    await writeStoredConcern(storedConcern({ id: "c-dddddddddd" }));

    await expect(
      applyConcernTriage({
        taskDir,
        taskWt,
        repo,
        isTriager: true,
        suggestions: [{ id: "c-dddddddddd", disposition: "dismiss", summary: "No reason" }],
      })
    ).rejects.toThrow(/detail/i);

    const stored = await readYaml<StoredConcernArtifact>(
      path.join(taskDir, "concerns", "c-dddddddddd.yaml")
    );
    expect(stored.status).toBe("open");
    expect(stored.dismissReason).toBeUndefined();
  });

  it("partitions suggestions by exact concern id", () => {
    const suggestions: ReviewSuggestion[] = [
      { id: "c-aaaaaaaaaa", disposition: "dismiss", summary: "Concern" },
      { id: "rm-bbbbbbbbbb", disposition: "architect", summary: "Remarkable" },
      { id: "s-1", disposition: "fix", summary: "Finding" },
      { id: "c-cccccccccc", disposition: "optional", summary: "Unknown concern id" },
    ];

    const { triage, findings } = partitionSuggestions(
      suggestions,
      new Set(["c-aaaaaaaaaa", "rm-bbbbbbbbbb"])
    );

    expect(triage.map((s) => s.id)).toEqual(["c-aaaaaaaaaa", "rm-bbbbbbbbbb"]);
    expect(findings.map((s) => s.id)).toEqual(["s-1", "c-cccccccccc"]);
  });

  it("records close-up pending resolutions without changing concern status", async () => {
    await writeStoredConcern(
      storedConcern({ id: "c-eeeeeeeeee", status: "routed", disposition: "architect" })
    );
    await writeStoredConcern(
      storedConcern({ id: "c-ffffffffff", status: "routed", disposition: "fix" })
    );
    await writeStoredConcern(
      storedConcern({ id: "c-9999999999", status: "open" })
    );

    const applied = await applyCloseupResolutions({
      taskDir,
      taskWt,
      repo,
      by: "wave-close-up",
      resolutions: [
        { id: "c-eeeeeeeeee", action: "carry", note: "architect should decide" },
        { id: "c-ffffffffff", action: "resolve" },
        { id: "c-9999999999", action: "propagate", note: "saga decision" },
        { id: "c-8888888888", action: "resolve", note: "unknown id" },
      ],
    });

    expect(applied.map((c) => c.id).sort()).toEqual([
      "c-9999999999",
      "c-eeeeeeeeee",
      "c-ffffffffff",
    ]);
    const carried = await readYaml<StoredConcernArtifact>(
      path.join(taskDir, "concerns", "c-eeeeeeeeee.yaml")
    );
    expect(carried.status).toBe("routed");
    expect(carried.pendingResolution?.action).toBe("carry");
    expect(carried.pendingResolution?.note).toBe("architect should decide");
    expect(carried.pendingResolution?.by).toBe("wave-close-up");
    expect(typeof carried.pendingResolution?.at).toBe("string");

    const resolved = await readYaml<StoredConcernArtifact>(
      path.join(taskDir, "concerns", "c-ffffffffff.yaml")
    );
    expect(resolved.status).toBe("routed");
    expect(resolved.pendingResolution?.action).toBe("resolve");

    const propagated = await readYaml<StoredConcernArtifact>(
      path.join(taskDir, "concerns", "c-9999999999.yaml")
    );
    expect(propagated.status).toBe("open");
    expect(propagated.pendingResolution?.action).toBe("propagate");
    expect(propagated.pendingResolution?.note).toBe("saga decision");
    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
  });

  it("aggregates remarkable decisions into rm-* files and triages them by exact id", async () => {
    await aggregateConcerns(
      {
        taskDir,
        taskWt,
        repo,
        source: concernSource("001-architect-plan-a1", "architect", { step: "architect-plan" }),
      },
      [],
      [
        {
          chosen: "Atomic YAML files",
          alternatives: ["One big file", "A database"],
          why: "diffable and conflict-free",
        },
      ]
    );

    const concernsDir = path.join(taskDir, "concerns");
    expect(fs.existsSync(concernsDir)).toBe(true);
    const files = fs
      .readdirSync(concernsDir)
      .filter((f) => f.startsWith("rm-") && f.endsWith(".yaml"));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^rm-[0-9a-f]{10}\.yaml$/);

    const remarkable = await readYaml<Record<string, any>>(
      path.join(concernsDir, files[0]!)
    );
    expect(remarkable.status).toBe("open");
    expect(remarkable.chosen).toBe("Atomic YAML files");
    expect(remarkable.source.record).toBe("001-architect-plan-a1");
    expect(remarkable.source.agent).toBe("architect");

    const rmId = files[0]!.replace(/\.yaml$/, "");
    const triaged = await applyConcernTriage({
      taskDir,
      taskWt,
      repo,
      isTriager: true,
      suggestions: [
        {
          id: rmId,
          disposition: "dismiss",
          summary: "Standard",
          detail: "No tradeoff worth reporting",
        },
      ],
    });
    expect(triaged).toHaveLength(1);
    const after = await readYaml<Record<string, any>>(path.join(concernsDir, files[0]!));
    expect(after.status).toBe("dismissed");
    expect(after.dismissReason).toBe("No tradeoff worth reporting");
  });

  it("rejects unknown concern kinds without partial writes and leaves existing files untouched", async () => {
    const existing = await writeStoredConcern(
      storedConcern({ id: "c-0123456789", summary: "Existing concern" })
    );
    const before = fs.readFileSync(existing, "utf8");

    await expect(
      aggregateConcerns({ taskDir, taskWt, repo, source: concernSource("001-develop-a1") }, [
        { kind: "risk", summary: "Valid" },
        { kind: "bug", summary: "Invalid" } as unknown as Concern,
      ])
    ).rejects.toThrow(/kind/i);

    const concernsDir = path.join(taskDir, "concerns");
    const files = fs.readdirSync(concernsDir).filter((f) => f.endsWith(".yaml"));
    expect(files).toEqual(["c-0123456789.yaml"]);
    expect(fs.readFileSync(existing, "utf8")).toBe(before);
  });

  it("writes distinct fingerprints concurrently without deadlock or lost commits", async () => {
    const results = await Promise.all([
      aggregateConcerns({ taskDir, taskWt, repo, source: concernSource("001-develop-a1") }, [
        { kind: "risk", summary: "Concurrent risk A" },
      ]),
      aggregateConcerns({ taskDir, taskWt, repo, source: concernSource("002-develop-a1") }, [
        { kind: "tech-debt", summary: "Concurrent debt B" },
      ]),
    ]);
    expect(results[0]).toHaveLength(1);
    expect(results[1]).toHaveLength(1);

    const files = fs
      .readdirSync(path.join(taskDir, "concerns"))
      .filter((f) => f.endsWith(".yaml"));
    expect(files).toHaveLength(2);

    const tracked = tmpRepo
      .git(["ls-tree", "-r", "--name-only", "HEAD"], { cwd: taskWt })
      .stdout.split("\n");
    for (const file of files) {
      expect(tracked).toContain(`${ORCH}/${TASK}/concerns/${file}`);
    }
    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
  });

  it("serializes concurrent merges of the same fingerprint into one merged file", async () => {
    const first = aggregateConcerns(
      { taskDir, taskWt, repo, source: concernSource("001-develop-a1") },
      [{ kind: "risk", summary: "Same concern", detail: "short", severity: "low" }]
    );
    const second = aggregateConcerns(
      { taskDir, taskWt, repo, source: concernSource("002-develop-a1") },
      [
        {
          kind: "risk",
          summary: "Same concern",
          detail: "a much longer concurrent detail",
          severity: "high",
        },
      ]
    );
    const [a, b] = await Promise.all([first, second]);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);

    const files = fs
      .readdirSync(path.join(taskDir, "concerns"))
      .filter((f) => f.endsWith(".yaml"));
    expect(files).toHaveLength(1);
    const stored = await readYaml<StoredConcernArtifact>(
      path.join(taskDir, "concerns", files[0]!)
    );
    expect(stored.detail).toBe("a much longer concurrent detail");
    expect(stored.severity).toBe("high");
    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");
  });

  it("wires reviewer output: aggregate new concerns before triaging pre-existing ids only", async () => {
    await writeStoredConcern(storedConcern({ id: "c-aaaaaaaaaa" }));
    const newSummary = "Newly observed retry risk";
    const newId = concernFingerprint({ kind: "risk", summary: newSummary });
    const runsDir = path.join(taskDir, "runs");
    fs.mkdirSync(runsDir, { recursive: true });

    const result = await runStep({
      agent: "reviewer",
      stepId: "review",
      stepFragment: "steps/review",
      cwd: taskWt,
      recordsDir: runsDir,
      data: {
        status: "approved",
        summary: "Reviewed",
        newConcerns: [{ kind: "risk", summary: newSummary }],
        suggestions: [
          {
            id: "c-aaaaaaaaaa",
            disposition: "dismiss",
            summary: "Duplicate",
            detail: "covered by ADR-1",
          },
          {
            id: newId,
            disposition: "dismiss",
            summary: "Self",
            detail: "must not dismiss a same-step concern",
          },
        ],
      },
      promptVars: { assignment: "Review", checks: "", diff: "", dispositionsCriteria: "" },
    });
    expect(result.ok).toBe(true);

    const concernsDir = path.join(taskDir, "concerns");
    const newFile = path.join(concernsDir, `${newId}.yaml`);
    expect(fs.existsSync(newFile)).toBe(true);
    const created = await readYaml<StoredConcernArtifact>(newFile);
    expect(created.status).toBe("open");
    expect(created.source.record).toBe("001-review-a1");

    const preExisting = await readYaml<StoredConcernArtifact>(
      path.join(concernsDir, "c-aaaaaaaaaa.yaml")
    );
    expect(preExisting.status).toBe("dismissed");
    expect(preExisting.dismissReason).toBe("covered by ADR-1");
  });

  it("wires consult writeArtifact producers to the concern store", async () => {
    const runsDir = path.join(taskDir, "runs");
    fs.mkdirSync(runsDir, { recursive: true });
    let artifactWrites = 0;

    const result = await runStep({
      agent: "architect",
      stepId: "consult-item",
      stepFragment: "steps/architect-consult-item",
      cwd: taskWt,
      recordsDir: runsDir,
      data: {
        decision: "retry-with-guidance",
        rationale: "Retry with a narrower scope",
        concerns: [{ kind: "question", summary: "Which API version is authoritative?" }],
        remarkable: [{ chosen: "Retry", alternatives: ["Escalate"], why: "Cheap to test" }],
      },
      promptVars: { item: "item-a", assignment: "", priorAttempts: "", diff: "", feedback: "" },
      writeArtifact: async () => {
        artifactWrites++;
      },
    });

    expect(result.ok).toBe(true);
    expect(artifactWrites).toBe(1);
    const concernsDir = path.join(taskDir, "concerns");
    const files = fs.existsSync(concernsDir) ? fs.readdirSync(concernsDir) : [];
    const concernFiles = files.filter((f) => f.startsWith("c-"));
    const remarkableFiles = files.filter((f) => f.startsWith("rm-"));
    expect(concernFiles).toHaveLength(1);
    expect(remarkableFiles).toHaveLength(1);

    const stored = await readYaml<StoredConcernArtifact>(
      path.join(concernsDir, concernFiles[0]!)
    );
    expect(stored.source.agent).toBe("architect");
    expect(stored.source.record).toBe("001-consult-item-a1");
    expect(stored.source.step).toBe("consult-item");
  });

  it("wires close-up producers: aggregates concerns and applies resolutions", async () => {
    await writeStoredConcern(
      storedConcern({ id: "c-aaaaaaaaaa", status: "routed", disposition: "architect" })
    );
    const runsDir = path.join(taskDir, "runs");
    fs.mkdirSync(runsDir, { recursive: true });

    const result = await runStep({
      agent: "wave-close-up",
      stepId: "wave-close-up-1-1",
      stepFragment: "steps/wave-close-up",
      cwd: taskWt,
      recordsDir: runsDir,
      data: {
        wave: 1,
        iteration: 1,
        status: "complete",
        mergedItems: [],
        summary: "Wave 1 complete",
        concerns: [{ kind: "tech-debt", summary: "Close-up found duplicated helpers" }],
        concernResolutions: [{ id: "c-aaaaaaaaaa", action: "carry", note: "needs architect" }],
      },
      promptVars: { task: TASK, waveReport: "wave 1", infra: "" },
    });
    expect(result.ok).toBe(true);

    const concernsDir = path.join(taskDir, "concerns");
    const newFiles = fs
      .readdirSync(concernsDir)
      .filter((f) => f.startsWith("c-") && f !== "c-aaaaaaaaaa.yaml");
    expect(newFiles).toHaveLength(1);
    const created = await readYaml<StoredConcernArtifact>(
      path.join(concernsDir, newFiles[0]!)
    );
    expect(created.status).toBe("open");
    expect(created.source.record).toBe("001-wave-close-up-1-1-a1");

    const carried = await readYaml<StoredConcernArtifact>(
      path.join(concernsDir, "c-aaaaaaaaaa.yaml")
    );
    expect(carried.status).toBe("routed");
    expect(carried.pendingResolution?.action).toBe("carry");
    expect(carried.pendingResolution?.by).toBe("wave-close-up");
  });

  it("aggregates concerns and remarkable decisions across producer schemas", async () => {
    const runsDir = path.join(taskDir, "runs");
    fs.mkdirSync(runsDir, { recursive: true });

    const producers: Array<{
      agent: string;
      stepId: string;
      stepFragment: string;
      promptVars: Record<string, string>;
      base: Record<string, unknown>;
      concernField: "concerns" | "newConcerns";
      remarkable: boolean;
    }> = [
      {
        agent: "developer",
        stepId: "develop",
        stepFragment: "steps/develop",
        promptVars: { assignment: "", target: "tests", citations: "[]" },
        base: { status: "ok", summary: "dev" },
        concernField: "concerns",
        remarkable: true,
      },
      {
        agent: "developer",
        stepId: "poc",
        stepFragment: "steps/poc",
        promptVars: { assignment: "", context: "" },
        base: { status: "ok", summary: "poc" },
        concernField: "concerns",
        remarkable: true,
      },
      {
        agent: "developer",
        stepId: "test-assumptions",
        stepFragment: "steps/test-assumptions",
        promptVars: { assignment: "", context: "" },
        base: { status: "ok", summary: "assumptions" },
        concernField: "concerns",
        remarkable: true,
      },
      {
        agent: "fact-finder",
        stepId: "research",
        stepFragment: "steps/research",
        promptVars: { assignment: "", intent: "", citations: "[]" },
        base: { status: "ok", summary: "ff", findings: "f" },
        concernField: "concerns",
        remarkable: true,
      },
      {
        agent: "qa",
        stepId: "qa",
        stepFragment: "steps/qa",
        promptVars: {
          assignment: "",
          checks: "",
          testDiff: "",
          diff: "",
          dispositionsCriteria: "",
        },
        base: { status: "approved", summary: "qa", suggestions: [] },
        concernField: "newConcerns",
        remarkable: false,
      },
      {
        agent: "architect",
        stepId: "architect-plan",
        stepFragment: "steps/architect-plan",
        promptVars: {
          task: TASK,
          iteration: "1",
          intent: "",
          context: "",
          infra: "",
          debt: "",
          steering: "",
          limits: "",
        },
        base: { iteration: 1, milestones: [], itemOutlines: [] },
        concernField: "concerns",
        remarkable: true,
      },
      {
        agent: "architect",
        stepId: "architect-wave-report-1-1",
        stepFragment: "steps/architect-wave-report",
        promptVars: { plan: "{}", waveReport: "", debt: "", steering: "" },
        base: { decision: "continue" },
        concernField: "concerns",
        remarkable: true,
      },
      {
        agent: "wave-close-up",
        stepId: "wave-close-up-1-1",
        stepFragment: "steps/wave-close-up",
        promptVars: { task: TASK, waveReport: "", infra: "" },
        base: { wave: 1, iteration: 1, status: "complete", mergedItems: [], summary: "wave" },
        concernField: "concerns",
        remarkable: true,
      },
    ];

    const concernsDir = path.join(taskDir, "concerns");
    for (const [index, producer] of producers.entries()) {
      const summary = `Producer ${index} concern`;
      const chosen = `Producer ${index} decision`;
      const data = {
        ...producer.base,
        [producer.concernField]: [{ kind: "risk", summary }],
        ...(producer.remarkable
          ? { remarkable: [{ chosen, alternatives: ["alt"], why: "because" }] }
          : {}),
      };

      const result = await runStep({
        agent: producer.agent,
        stepId: producer.stepId,
        stepFragment: producer.stepFragment,
        cwd: taskWt,
        recordsDir: runsDir,
        data,
        promptVars: producer.promptVars,
      });
      expect(result.ok).toBe(true);
      expect(fs.existsSync(concernsDir)).toBe(true);

      const concernFiles = fs
        .readdirSync(concernsDir)
        .filter((f) => f.startsWith("c-") && f.endsWith(".yaml"));
      const stored = await Promise.all(
        concernFiles.map((f) => readYaml<StoredConcernArtifact>(path.join(concernsDir, f)))
      );
      const hit = stored.find((c) => c.summary === summary);
      expect(hit).toBeDefined();
      expect(hit!.status).toBe("open");
      expect(hit!.source.agent).toBe(producer.agent);
      expect(hit!.source.record).toContain(producer.stepId);

      if (producer.remarkable) {
        const rmFiles = fs
          .readdirSync(concernsDir)
          .filter((f) => f.startsWith("rm-") && f.endsWith(".yaml"));
        const remarkables = await Promise.all(
          rmFiles.map((f) => readYaml<Record<string, any>>(path.join(concernsDir, f)))
        );
        expect(remarkables.some((r) => r.chosen === chosen)).toBe(true);
      }
    }
  });

  it("reconciles missing concerns from committed step records idempotently", async () => {
    const recordDir = path.join(taskDir, "items", "item-a", "steps", "001-develop-a1");
    fs.mkdirSync(recordDir, { recursive: true });
    fs.writeFileSync(path.join(recordDir, "input.md"), "prompt\n", "utf8");
    await writeYamlAtomic(path.join(recordDir, "meta.yaml"), {
      seq: 1,
      name: "develop",
      attempt: 1,
      agent: "developer",
      role: "workhorse",
      models: ["model-workhorse"],
      status: "ok",
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:01:00.000Z",
    });
    await writeYamlAtomic(path.join(recordDir, "output.yaml"), {
      status: "ok",
      summary: "done",
      concerns: [
        {
          kind: "risk",
          summary: "Reconciled from record",
          detail: "full detail",
          severity: "high",
        },
      ],
    });
    tmpRepo.commit("committed step record", [
      path.relative(taskWt, recordDir).replace(/\\/g, "/"),
    ]);

    const first = await reconcileConcerns({ taskDir, taskWt, repo });
    expect(first).toHaveLength(1);

    const concernsDir = path.join(taskDir, "concerns");
    const files = fs
      .readdirSync(concernsDir)
      .filter((f) => f.startsWith("c-") && f.endsWith(".yaml"));
    expect(files).toHaveLength(1);
    const stored = await readYaml<StoredConcernArtifact>(
      path.join(concernsDir, files[0]!)
    );
    expect(stored.summary).toBe("Reconciled from record");
    expect(stored.detail).toBe("full detail");
    expect(stored.status).toBe("open");
    expect(stored.source.record).toBe("001-develop-a1");
    expect(stored.source.agent).toBe("developer");
    // Replay derives timestamps from meta.endedAt, not wall-clock.
    expect(stored.updatedAt).toBe("2026-01-01T00:01:00.000Z");
    expect(stored.createdAt).toBe("2026-01-01T00:01:00.000Z");
    expect(stored.source.lastSeen).toBe("2026-01-01T00:01:00.000Z");

    // A second startup is a byte- and commit-level no-op.
    const fileHash = (f: string) => fs.readFileSync(f, "utf8");
    const beforeBytes = fileHash(path.join(concernsDir, files[0]!));
    const beforeHead = tmpRepo.git(["rev-parse", "HEAD"], { cwd: taskWt }).stdout.trim();
    const replay = await reconcileConcerns({ taskDir, taskWt, repo });
    expect(replay).toHaveLength(1);
    expect(fileHash(path.join(concernsDir, files[0]!))).toBe(beforeBytes);
    expect(tmpRepo.git(["rev-parse", "HEAD"], { cwd: taskWt }).stdout.trim()).toBe(beforeHead);
    expect(tmpRepo.git(["status", "--porcelain"], { cwd: taskWt }).stdout).toBe("");

    // Simulate an earlier triage: a second reconcile must preserve it and not
    // duplicate the file.
    stored.status = "dismissed";
    stored.dismissReason = "already handled";
    await writeYamlAtomic(path.join(concernsDir, files[0]!), stored);

    const second = await reconcileConcerns({ taskDir, taskWt, repo });
    expect(second).toHaveLength(1);
    expect(
      fs.readdirSync(concernsDir).filter((f) => f.startsWith("c-") && f.endsWith(".yaml"))
    ).toHaveLength(1);
    const after = await readYaml<StoredConcernArtifact>(
      path.join(concernsDir, files[0]!)
    );
    expect(after.status).toBe("dismissed");
    expect(after.dismissReason).toBe("already handled");
  });

  it("commits stray concerns files during startup recovery instead of stashing them", async () => {
    const task = "recovery-task";
    const mainTaskDir = path.join(tmpRepo.dir, ORCH, task);
    fs.mkdirSync(mainTaskDir, { recursive: true });
    fs.writeFileSync(path.join(mainTaskDir, "INTENT.md"), "# recovery\n", "utf8");
    tmpRepo.commit("add recovery intent");

    const recoveryWtRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(recoveryWtRoot, { recursive: true });
    const recoveryRepo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: recoveryWtRoot });
    const recoveryTaskWt = tmpRepo.createWorktree(
      `topic/${task}`,
      path.join(recoveryWtRoot, `topic_${task}`)
    );
    await writeYamlAtomic(
      path.join(recoveryTaskWt, ORCH, task, "concerns", "c-0123456789.yaml"),
      storedConcern({ id: "c-0123456789" })
    );

    const recoveryPipeline: PipelineConfig = {
      models: {
        roles: {
          workhorse: { model: "model-workhorse" },
          simpler: { model: "model-simpler" },
        },
      },
      agents: {},
      flows: { simple: { steps: [] }, story: {}, spike: {} },
      limits: {},
    };
    const result = await runTask(
      {
        harness: new FakeHarness(),
        repo: recoveryRepo,
        project: { orchestrationFolder: ORCH, worktreeRoot: recoveryWtRoot },
        pipelineFor: async () => recoveryPipeline,
        prompts,
      },
      task,
      { maxTicks: 0 }
    );
    expect(result.status).toBe("stopped");

    const rel = `${ORCH}/${task}/concerns/c-0123456789.yaml`;
    expect(
      tmpRepo.git(["cat-file", "-e", `HEAD:${rel}`], {
        cwd: recoveryTaskWt,
        allowFail: true,
      }).code
    ).toBe(0);
    expect(tmpRepo.git(["stash", "list"], { cwd: recoveryTaskWt }).stdout).toBe("");
  });

  it("keeps step status ok and journals an ingest error when concern ingestion fails", async () => {
    fs.writeFileSync(path.join(taskDir, "concerns"), "not a directory", "utf8");
    const runsDir = path.join(taskDir, "runs");
    fs.mkdirSync(runsDir, { recursive: true });

    const result = await runStep({
      agent: "developer",
      stepId: "develop",
      stepFragment: "steps/develop",
      cwd: taskWt,
      recordsDir: runsDir,
      data: {
        status: "ok",
        summary: "done",
        concerns: [{ kind: "risk", summary: "Ingest me" }],
      },
      promptVars: { assignment: "", target: "tests", citations: "[]" },
    });

    expect(result.status).toBe("ok");
    expect(result.meta.error).toBeUndefined();
    const journal = fs.readFileSync(path.join(taskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("concern_ingest_error");
  });
});
