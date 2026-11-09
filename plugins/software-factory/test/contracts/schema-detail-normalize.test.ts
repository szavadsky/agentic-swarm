import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAjv } from "../../src/core/config/ajv.js";
import { resolveStepSchema, runAgentStep } from "../../src/core/flows/step-runner.js";
import { aggregateConcerns } from "../../src/core/concerns.js";
import { readYaml } from "../../src/core/records/io.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import type {
  PipelineConfig,
  ProjectConfig,
  StoredConcernArtifact,
} from "../../src/core/artifacts.js";

/**
 * Contract tests for the lowercase concern `detail` field (docs/factory.v2.md §18).
 *
 * Every producer schema must accept `detail` and reject the capital-D `Detail`
 * spelling. Step-runner validation is the write gate: a rejected output never
 * reaches the concern store. When a concern is re-emitted, the stored detail
 * with the most UTF-8 bytes wins so funnel byte budgets cannot lose detail
 * through round-trips.
 */

const pluginRoot = path.resolve(import.meta.dir, "../..");

type JsonSchema = Record<string, any>;

interface Producer {
  name: string;
  schema: () => JsonSchema;
  base: JsonSchema;
}

const PRODUCERS: Producer[] = [
  {
    name: "decisions",
    schema: () => resolveStepSchema(pluginRoot, "architect", "architect-wave-report"),
    base: { decision: "continue" },
  },
  {
    name: "developer-output",
    schema: () => resolveStepSchema(pluginRoot, "developer", "develop"),
    base: { status: "ok", summary: "Implemented the change" },
  },
  {
    name: "fact-finder-output",
    schema: () => resolveStepSchema(pluginRoot, "fact-finder", "research"),
    base: { status: "ok", summary: "Investigated", findings: "The API supports retries" },
  },
  {
    name: "plan",
    schema: () => resolveStepSchema(pluginRoot, "architect", "architect-plan"),
    base: { iteration: 1, milestones: [], itemOutlines: [] },
  },
  {
    name: "plan-closeup",
    schema: () => resolveStepSchema(pluginRoot, "plan-close-up", "plan-close-up"),
    base: { iteration: 1, status: "complete", summary: "Plan complete" },
  },
  {
    name: "architect-closeup shares plan-closeup",
    schema: () => resolveStepSchema(pluginRoot, "architect", "architect-closeup"),
    base: { iteration: 1, status: "complete", summary: "Plan complete" },
  },
  {
    name: "wave-closeup",
    schema: () => resolveStepSchema(pluginRoot, "wave-close-up", "wave-close-up"),
    base: { wave: 1, iteration: 1, status: "complete", mergedItems: [], summary: "Wave merged" },
  },
];

describe("lowercase concern detail in producer schemas", () => {
  it("accepts lowercase detail and rejects capital-D Detail in every producer schema", () => {
    for (const producer of PRODUCERS) {
      const schema = producer.schema();
      const validate = createAjv().compile(schema);
      const concerns = schema.properties?.concerns;
      const item = concerns?.items;

      expect(item?.properties?.detail).toEqual({ type: "string" });
      expect(item?.properties?.Detail).toBeUndefined();
      expect(item?.additionalProperties).toBe(false);

      expect(
        validate({ ...producer.base, concerns: [{ kind: "risk", summary: "Lowercase", detail: "kept" }] })
      ).toBe(true);
      expect(
        validate({ ...producer.base, concerns: [{ kind: "risk", summary: "Capital", Detail: "wrong" }] })
      ).toBe(false);
    }
  });

  it("keeps the reference-only review schema on lowercase detail", () => {
    const schema: JsonSchema = JSON.parse(
      fs.readFileSync(path.resolve(pluginRoot, "config/schemas/review.schema.json"), "utf8")
    );
    const validate = createAjv().compile(schema);
    const base = { status: "approved", summary: "Sound", suggestions: [] };

    expect(schema.properties?.newConcerns?.items?.properties?.detail).toEqual({ type: "string" });
    expect(schema.properties?.newConcerns?.items?.properties?.Detail).toBeUndefined();
    expect(
      validate({ ...base, newConcerns: [{ kind: "risk", summary: "Lowercase", detail: "kept" }] })
    ).toBe(true);
    expect(
      validate({ ...base, newConcerns: [{ kind: "risk", summary: "Capital", Detail: "wrong" }] })
    ).toBe(false);
  });
});

describe("step-runner concern detail write gate", () => {
  const ORCH = ".factory";
  const TASK = "detail-gate-task";

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
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Detail gate\n", "utf8");
    tmpRepo.commit("add detail gate task");

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
      agents: { developer: { role: "workhorse" } },
      flows: { simple: { steps: [] }, story: {}, spike: {} },
      limits: {},
    };
    project = { orchestrationFolder: ORCH, worktreeRoot };
    prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });
  });

  afterEach(() => tmpRepo.cleanup());

  async function runDevelop(concern: Record<string, unknown>) {
    const harness = new FakeHarness();
    const label = `${TASK}/runs/develop#a1`;
    const data = { status: "ok", summary: "Implemented", evidence: ["test"], concerns: [concern] };
    harness.scriptOutcome(label, { ok: true, data });
    harness.scriptOutcome(`${label}#relaunch`, { ok: true, data });
    harness.scriptComplete(() => data);
    return runAgentStep({
      task: TASK,
      stepId: "develop",
      stepFragment: "steps/develop",
      agent: "developer",
      cwd: taskWt,
      taskWt,
      taskDir,
      recordsDir: path.join(taskDir, "runs"),
      repo,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: { assignment: "detail gate", target: "tests", citations: "[]" },
    });
  }

  it("stores lowercase detail and rejects capital-D Detail before any store write", async () => {
    const accepted = await runDevelop({ kind: "risk", summary: "Lowercase", detail: "kept as written" });
    expect(accepted.status).toBe("ok");

    const files = fs.readdirSync(path.join(taskDir, "concerns")).filter((f) => f.endsWith(".yaml"));
    expect(files).toHaveLength(1);
    const stored = await readYaml<StoredConcernArtifact>(path.join(taskDir, "concerns", files[0]!));
    expect(stored.detail).toBe("kept as written");

    const rejected = await runDevelop({ kind: "risk", summary: "Capital", Detail: "wrong casing" });
    expect(rejected.status).toBe("rejected");
    expect(rejected.meta.error).toContain("Detail");
    const after = fs.readdirSync(path.join(taskDir, "concerns")).filter((f) => f.endsWith(".yaml"));
    expect(after).toHaveLength(1);
  });
});

const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");

describe("concern detail merge keeps the longest stored value", () => {
  let taskDir: string;

  beforeEach(() => {
    taskDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-detail-merge-"));
  });

  afterEach(() => fs.rmSync(taskDir, { recursive: true, force: true }));

  it("keeps a 200-byte stored detail when a 20-byte detail is re-emitted", async () => {
    const source = { record: "001-develop-a1", agent: "developer" } as const;
    const longDetail = "L".repeat(200);
    const shortDetail = "s".repeat(20);

    await aggregateConcerns(
      { taskDir, taskWt: taskDir, source },
      [{ kind: "risk", summary: "Long-lived detail", detail: longDetail }],
      [],
      { commit: false }
    );
    const merged = await aggregateConcerns(
      { taskDir, taskWt: taskDir, source: { record: "002-develop-a1", agent: "developer" } },
      [{ kind: "risk", summary: "Long-lived detail", detail: shortDetail }],
      [],
      { commit: false }
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]!.detail).toBe(longDetail);
    const stored = await readYaml<StoredConcernArtifact>(
      path.join(taskDir, "concerns", `${merged[0]!.id}.yaml`)
    );
    expect(stored.detail).toBe(longDetail);
  });

  it("keeps the stored detail with more UTF-8 bytes when the re-emit has more characters", async () => {
    const source = { record: "001-develop-a1", agent: "developer" } as const;
    // Funnel budgets are byte-based: 70 CJK characters occupy 210 UTF-8 bytes.
    const storedDetail = "\u754c".repeat(70);
    const shorterByteDetail = "a".repeat(100);
    expect(storedDetail.length).toBeLessThan(shorterByteDetail.length);
    expect(utf8Bytes(storedDetail)).toBeGreaterThan(utf8Bytes(shorterByteDetail));

    await aggregateConcerns(
      { taskDir, taskWt: taskDir, source },
      [{ kind: "risk", summary: "Byte-budgeted detail", detail: storedDetail }],
      [],
      { commit: false }
    );
    const merged = await aggregateConcerns(
      { taskDir, taskWt: taskDir, source: { record: "002-develop-a1", agent: "developer" } },
      [{ kind: "risk", summary: "Byte-budgeted detail", detail: shorterByteDetail }],
      [],
      { commit: false }
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]!.detail).toBe(storedDetail);
    const stored = await readYaml<StoredConcernArtifact>(
      path.join(taskDir, "concerns", `${merged[0]!.id}.yaml`)
    );
    expect(stored.detail).toBe(storedDetail);
  });
});
