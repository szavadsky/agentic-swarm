import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "./helpers/tmp-repo.js";
import { FakeHarness } from "../src/harness/fake/fake-harness.js";
import { Repo } from "../src/core/git/repo.js";
import { loadPromptLibrary } from "../src/core/prompts.js";
import { runAgentStep } from "../src/core/flows/step-runner.js";
import { tickItemMachine } from "../src/core/flows/item-machine.js";
import { generateReviewSchema } from "../src/core/records/review-schema.js";
import {
  isTriagerAgent,
  resolveReviewAllowed,
} from "../src/core/review-policy.js";
import type { PipelineConfig, ProjectConfig } from "../src/core/artifacts.js";

const CANONICAL = [
  "fix",
  "optional",
  "architect",
  "human-awareness",
  "human-async",
];

function pipelineWith(
  reviewPolicy?: PipelineConfig["reviewPolicy"]
): PipelineConfig {
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
    },
    flows: { simple: { steps: [] }, story: {}, spike: {} },
    limits: {},
    reviewPolicy,
  };
}

function dispositionEnum(schema: Record<string, unknown>): string[] {
  const properties = schema.properties as any;
  return properties.suggestions.items.properties.disposition.enum;
}

describe("Review policy resolution (§8.7, §18)", () => {
  it("falls back to the canonical builtin dispositions", () => {
    expect(resolveReviewAllowed(pipelineWith(), "reviewer", false)).toEqual(
      CANONICAL
    );
    expect(resolveReviewAllowed(pipelineWith({}), "qa", false)).toEqual(
      CANONICAL
    );
  });

  it("prefers a per-agent policy over default and default over builtin", () => {
    const pipeline = pipelineWith({
      default: ["fix", "optional"],
      reviewer: ["architect"],
    });

    expect(resolveReviewAllowed(pipeline, "reviewer", false)).toEqual([
      "architect",
    ]);
    expect(resolveReviewAllowed(pipeline, "qa", false)).toEqual([
      "fix",
      "optional",
    ]);
    expect(
      resolveReviewAllowed(pipelineWith({ default: ["fix"] }), "qa", false)
    ).toEqual(["fix"]);
  });

  it("reads legacy allowedDispositions as the default alias", () => {
    expect(
      resolveReviewAllowed(
        pipelineWith({ allowedDispositions: ["fix", "human-stop"] }),
        "reviewer",
        false
      )
    ).toEqual(["fix", "human-stop"]);

    expect(
      resolveReviewAllowed(
        pipelineWith({ default: ["architect"], allowedDispositions: ["fix"] }),
        "reviewer",
        false
      )
    ).toEqual(["architect"]);
  });

  it("appends dismiss for triagers without duplicates", () => {
    expect(resolveReviewAllowed(pipelineWith(), "reviewer", true)).toEqual([
      ...CANONICAL,
      "dismiss",
    ]);
    expect(
      resolveReviewAllowed(
        pipelineWith({ reviewer: ["fix", "dismiss"] }),
        "reviewer",
        true
      )
    ).toEqual(["fix", "dismiss"]);
    expect(
      resolveReviewAllowed(
        pipelineWith({ default: ["fix", "dismiss"] }),
        "plan-reviewer",
        true
      )
    ).toEqual(["fix", "dismiss"]);
  });

  it("never grants dismiss to non-triagers, even when configured", () => {
    expect(
      resolveReviewAllowed(
        pipelineWith({ qa: ["fix", "dismiss"] }),
        "qa",
        false
      )
    ).toEqual(["fix"]);
    expect(
      resolveReviewAllowed(
        pipelineWith({ default: ["fix", "dismiss"] }),
        "reviewer",
        false
      )
    ).toEqual(["fix"]);
  });

  it("restricts the triager set to reviewer and plan-reviewer", () => {
    const candidates = [
      "reviewer",
      "plan-reviewer",
      "wave-close-up",
      "plan-close-up",
      "developer",
      "qa",
      "architect",
      "fact-finder",
    ];
    expect(candidates.filter((agent) => isTriagerAgent(agent)).sort()).toEqual([
      "plan-reviewer",
      "reviewer",
    ]);
  });

  it("composed triager resolution excludes dismiss for close-ups", () => {
    const pipeline = pipelineWith({ default: ["fix", "dismiss"] });
    for (const agent of ["wave-close-up", "plan-close-up"]) {
      const allowed = resolveReviewAllowed(
        pipeline,
        agent,
        isTriagerAgent(agent)
      );
      expect(allowed).toEqual(["fix"]);
      expect(
        dispositionEnum(generateReviewSchema(allowed))
      ).not.toContain("dismiss");
    }

    for (const agent of ["reviewer", "plan-reviewer"]) {
      const allowed = resolveReviewAllowed(
        pipelineWith(),
        agent,
        isTriagerAgent(agent)
      );
      expect(allowed).toContain("dismiss");
      expect(dispositionEnum(generateReviewSchema(allowed))).toContain(
        "dismiss"
      );
    }
  });
});

describe("Generated review schema gating (§8.7)", () => {
  it("offers dismiss only when the resolved policy comes from a triager", () => {
    const triagerSchema = generateReviewSchema(
      resolveReviewAllowed(pipelineWith(), "reviewer", true)
    );
    expect(dispositionEnum(triagerSchema)).toContain("dismiss");

    const qaSchema = generateReviewSchema(
      resolveReviewAllowed(pipelineWith({ default: ["fix"] }), "qa", false)
    );
    expect(dispositionEnum(qaSchema)).not.toContain("dismiss");
    expect(dispositionEnum(qaSchema)).toEqual(["fix"]);
  });
});

describe("FakeHarness review-step dispositions (§8.7, §18)", () => {
  let tmpRepo: TmpRepo;
  let repoObj: Repo;
  let prompts: ReturnType<typeof loadPromptLibrary>;
  let project: ProjectConfig;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    const worktreeRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
    prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../agents"),
      overrideDirs: [],
    });
    project = { orchestrationFolder: ".factory", worktreeRoot };
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  async function runStep(options: {
    task: string;
    agent: string;
    stepId: string;
    stepFragment: string;
    pipeline: PipelineConfig;
    data: unknown;
    promptVars: Record<string, string>;
  }) {
    const taskDir = path.join(tmpRepo.dir, ".factory", options.task);
    const recordsDir = path.join(taskDir, "runs");
    fs.mkdirSync(recordsDir, { recursive: true });

    const harness = new FakeHarness();
    harness.scriptOutcome(`${options.task}/runs/${options.stepId}#a1`, {
      ok: true,
      data: options.data,
    });

    const res = await runAgentStep({
      task: options.task,
      stepId: options.stepId,
      stepFragment: options.stepFragment,
      agent: options.agent,
      cwd: tmpRepo.dir,
      taskWt: tmpRepo.dir,
      taskDir,
      recordsDir,
      repo: repoObj,
      harness,
      pipeline: options.pipeline,
      project,
      prompts,
      promptVars: options.promptVars,
    });

    return { res, harness };
  }

  const reviewPromptVars = {
    assignment: "Implement the feature",
    checks: "",
    diff: "",
    dispositionsCriteria: "",
  };
  const planReviewPromptVars = {
    plan: "{}",
    intent: "Intent",
    context: "",
    limits: "{}",
    dispositionsCriteria: "",
  };

  it("reviewer accepts a dismiss suggestion whose id matches a concern", async () => {
    const concernId = "c-0123456789";
    const { res, harness } = await runStep({
      task: "reviewer-dismiss",
      agent: "reviewer",
      stepId: "review",
      stepFragment: "steps/review",
      pipeline: pipelineWith({ default: ["fix"] }),
      promptVars: reviewPromptVars,
      data: {
        status: "approved",
        summary: "Triaged worker concerns",
        suggestions: [
          {
            id: concernId,
            disposition: "dismiss",
            summary: "Not a real finding",
            detail: "Duplicate of an existing concern",
          },
        ],
      },
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe("ok");
    const suggestion = (res.output as any).suggestions[0];
    expect(suggestion.id).toBe(concernId);
    expect(suggestion.disposition).toBe("dismiss");
    const schema = (harness.calls[0] as any).run.outputSchema;
    expect(dispositionEnum(schema)).toContain("dismiss");
  });

  it("plan-reviewer is a triager and may dismiss architect concerns", async () => {
    const { res, harness } = await runStep({
      task: "plan-reviewer-dismiss",
      agent: "plan-reviewer",
      stepId: "plan-review-1-1",
      stepFragment: "steps/plan-review",
      pipeline: pipelineWith({ default: ["fix"] }),
      promptVars: planReviewPromptVars,
      data: {
        status: "approved",
        summary: "Triaged architect concerns",
        suggestions: [
          {
            id: "c-abcdef",
            disposition: "dismiss",
            summary: "Not a real finding",
            detail: "Already resolved in the plan",
          },
        ],
      },
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe("ok");
    const schema = (harness.calls[0] as any).run.outputSchema;
    expect(dispositionEnum(schema)).toContain("dismiss");
  });

  it("qa rejects dismiss even when the legacy policy lists it", async () => {
    const { res, harness } = await runStep({
      task: "qa-rejects-dismiss",
      agent: "qa",
      stepId: "qa",
      stepFragment: "steps/qa",
      pipeline: pipelineWith({ allowedDispositions: ["fix", "dismiss"] }),
      promptVars: {
        assignment: "Implement the feature",
        checks: "",
        testDiff: "",
        diff: "",
        dispositionsCriteria: "",
      },
      data: {
        status: "approved",
        summary: "QA triage attempt",
        suggestions: [
          {
            id: "c-0123456789",
            disposition: "dismiss",
            summary: "Not a real finding",
            detail: "Duplicate of an existing concern",
          },
        ],
      },
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe("rejected");
    const schema = (harness.calls[0] as any).run.outputSchema;
    expect(dispositionEnum(schema)).not.toContain("dismiss");
  });
});

describe("Item-machine review prompt uses the canonical resolver (§8.7)", () => {
  let tmpRepo: TmpRepo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  it("renders dismiss in the reviewer dispositions when the agent is a triager", async () => {
    const task = "policy-prompt-task";
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    const itemSlug = "policy-item";
    const itemDir = path.join(taskDir, "items", itemSlug);
    fs.mkdirSync(itemDir, { recursive: true });
    fs.writeFileSync(
      path.join(itemDir, "assignment.yaml"),
      JSON.stringify(
        {
          slug: itemSlug,
          kind: "dev",
          title: "Review policy item",
          assignment: "Implement the feature",
          milestone: "m1",
          wave: 1,
          deps: [],
        },
        null,
        2
      )
    );

    const childBranch = `topic/${task}--${itemSlug}`;
    const childWt = tmpRepo.createWorktree(childBranch);
    const repoObj = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot: path.join(tmpRepo.dir, ".worktrees"),
    });
    const project: ProjectConfig = {
      orchestrationFolder: orchFolder,
      worktreeRoot: repoObj.worktreeRoot,
    };
    const pipeline = pipelineWith({ reviewer: ["fix"] });
    pipeline.flows.story = {
      dev: {
        fixLoopTo: "develop",
        steps: [{ id: "review", agent: "reviewer", role: "alt-workhorse" }],
      },
    };

    const prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../agents"),
      overrideDirs: [],
    });
    const harness = new FakeHarness();
    const reviewData = {
      status: "approved",
      summary: "Triaged worker concerns",
      suggestions: [
        {
          id: "c-0123456789",
          disposition: "dismiss",
          summary: "Not a real finding",
          detail: "Duplicate of an existing concern",
        },
      ],
    };
    harness.scriptOutcome(`${task}/items/${itemSlug}/review#a1`, {
      ok: true,
      data: reviewData,
    });
    // Reuse mode retries the same session when the output is schema-invalid;
    // keep the replay valid-shaped for the red run without crashing the fake.
    harness.scriptOutcome(`${task}/items/${itemSlug}/review#a1#repair-ask`, {
      ok: true,
      data: reviewData,
    });

    await tickItemMachine({
      task,
      itemSlug,
      parentBranch: `topic/${task}`,
      taskWt: tmpRepo.dir,
      childWt,
      taskDir,
      repo: repoObj,
      harness,
      pipeline,
      project,
      prompts,
    });

    const inputPath = path.join(
      childWt,
      orchFolder,
      task,
      "items",
      itemSlug,
      "steps",
      "001-review-a1",
      "input.md"
    );
    expect(fs.existsSync(inputPath)).toBe(true);
    const input = fs.readFileSync(inputPath, "utf8");
    expect(input).toContain("Allowed dispositions for this review: fix, dismiss.");
  });
});
