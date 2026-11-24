import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { z } from "zod";
import { validateFile } from "../src/cli/commands.js";
import { loadConfigs, packageRoot } from "../src/kernel/config.js";
import {
  outcomeExampleVar,
  outcomeExamples,
} from "../src/kernel/outcome-example.js";
import {
  expectationForStep,
  type OutcomeExpectation,
  parseOutcome,
  validateExpectation,
} from "../src/kernel/outcome.js";
import { dryRunPrompts } from "../src/kernel/prompt-dry-run.js";
import {
  renderSkeleton,
  taskFrontmatterVar,
} from "../src/kernel/prompt-schema.js";
import { loadPromptLibrary, loadPrompts } from "../src/kernel/prompts.js";
import { qaOutcomeSchema } from "../src/kernel/qa.js";
import { parseTaskFile, taskFrontmatterSchema } from "../src/kernel/tasks.js";
import type { ProcessConfig, RunConfig } from "../src/kernel/types.js";
import {
  concernSchema,
  outcomeSchema,
  planCheckEvidenceSchema,
  planCheckFollowUpSchema,
  planCheckRouteEntrySchema,
  planCheckSchema,
  planReviewFindingSchema,
  planReviewMarkSchema,
  planReviewOutcomeSchema,
  replySchema,
  stallRouteEntrySchema,
  steerAnswerSchema,
  steerRouteEntrySchema,
} from "../src/kernel/types.js";
import { TEST_BOUNDARY } from "./kernel/helpers.js";
import {
  outcomeBlocks,
  writeRecordOutcome,
} from "./kernel/outcome-fixtures.js";

let dir: string;

/** Top-level `key:` lines of a rendered skeleton, in order. */
function skeletonKeys(skeleton: string): string[] {
  return skeleton
    .split("\n")
    .map((line) => /^([A-Za-z0-9_]+): /.exec(line)?.[1])
    .filter((key): key is string => key !== undefined);
}

/** One top-level field's rendered shape, before its trailing comment. */
function skeletonShape(skeleton: string, key: string): string {
  const line = skeleton
    .split("\n")
    .find((candidate) => candidate.startsWith(`${key}: `));
  if (!line) throw new Error(`skeleton has no ${key} line`);
  const [shape = ""] = line.split("  # ");
  return shape;
}

/** A role prompt and the expectation its step enforces. */
const ROLE_EXPECTATIONS: [string, OutcomeExpectation][] = [
  ["architect", "architect"],
  ["subarchitect", "architect"],
  ["implementer", "any"],
  ["reviewer", "review"],
  ["qa", "qa"],
  ["pm", "any"],
  ["plan-checker", "any"],
  ["review-architect", "any"],
  ["architect-review-return", "any"],
  ["front", "any"],
  ["intent", "any"],
  ["digest", "any"],
  ["pack-preparer", "any"],
  ["scout", "any"],
  ["steward", "any"],
  ["delivery-repair", "any"],
  ["unfinished-turn", "any"],
  ["rescue-turn", "any"],
];

function schemaFor(expectation: OutcomeExpectation) {
  return expectation === "qa" ? qaOutcomeSchema : outcomeSchema;
}

function qaReport(outcome: unknown): { verdict: string; findings: string[] } {
  const report = (outcome as { qa?: { verdict: string; findings: string[] } })
    .qa;
  if (!report) throw new Error("outcome carries no qa report");
  return report;
}

function promptsOutcomeExamplesValidity() {
  it("renders two examples that parse and pass the step's expectation", () => {
    for (const [prompt, expectation] of ROLE_EXPECTATIONS) {
      const schema = schemaFor(expectation);
      const blocks = outcomeBlocks(
        outcomeExampleVar(prompt, expectation, schema),
      );
      expect(blocks, prompt).toHaveLength(2);
      for (const [index, block] of blocks.entries()) {
        const parsed = parseOutcome(block, schema);
        expect(
          validateExpectation(parsed, expectation),
          `${prompt} example ${index}`,
        ).toEqual([]);
      }
    }
  });

  it("keeps debtClosed empty, so the example needs no ingested id", () => {
    for (const [prompt, expectation] of ROLE_EXPECTATIONS) {
      const example = outcomeExamples(prompt, expectation).primary;
      expect(example, prompt).toHaveProperty("debtClosed");
      expect(example.debtClosed, prompt).toEqual([]);
    }
  });
}

function promptsOutcomeExamplesCoverage() {
  it("renders every outcome field some step writes, so a new field cannot go missing", () => {
    // `forward` is parse-only for old records; no step writes it.
    const written = Object.keys(outcomeSchema.shape).filter(
      (field) => field !== "forward",
    );
    const rendered = new Set(
      ROLE_EXPECTATIONS.flatMap(([prompt, expectation]) =>
        Object.keys(outcomeExamples(prompt, expectation).primary),
      ),
    );
    expect(written.filter((field) => !rendered.has(field))).toEqual([]);
  });
}

function promptsOutcomeExamplesAlternatives() {
  it("offers the other verdict or decision as the alternative", () => {
    const review = outcomeExamples("reviewer", "review");
    expect(review.primary.verdict).toBe("approve");
    expect(review.alternative.verdict).toBe("changes");

    const architect = outcomeExamples("architect", "architect");
    expect(architect.primary.decision).toBe("continue");
    expect(architect.alternative.decision).toBe("done");

    const qa = outcomeExamples("qa", "qa", qaOutcomeSchema);
    expect(qaReport(qa.primary).verdict).toBe("accept");
    expect(qaReport(qa.primary).findings).toEqual([]);
    expect(qaReport(qa.alternative).verdict).toBe("changes");
    expect(qaReport(qa.alternative).findings.length).toBeGreaterThan(0);
  });

  it("keeps the same outcome as the fenced-block alternative when the step gates nothing", () => {
    const any = outcomeExamples("implementer", "any");
    expect(any.alternative).toEqual(any.primary);
    expect(outcomeExampleVar("implementer", "any")).toContain(
      "The same outcome as the last fenced YAML block of your final message is also valid:",
    );
  });
}

function promptsOutcomeExamplesNarrowing() {
  it("narrows each example to the fields its step delivers", () => {
    const implementer = outcomeExamples("implementer", "any").primary;
    expect(implementer).toHaveProperty("replies");
    expect(implementer).not.toHaveProperty("verdict");
    expect(implementer).not.toHaveProperty("decision");

    const reviewer = outcomeExamples("reviewer", "review").primary;
    expect(reviewer).toHaveProperty("verdict");
    expect(reviewer).toHaveProperty("upscope");
    expect(reviewer).not.toHaveProperty("decision");
    expect(reviewer).not.toHaveProperty("planCheck");

    const architect = outcomeExamples("architect", "architect").primary;
    expect(architect).toHaveProperty("decision");
    expect(architect).toHaveProperty("intentStatus");
    expect(architect).not.toHaveProperty("verdict");

    const qa = outcomeExamples("qa", "qa", qaOutcomeSchema).primary;
    expect(qaReport(qa).verdict).toBe("accept");
    expect(qa).not.toHaveProperty("decision");
    expect(qa).not.toHaveProperty("replies");
  });
}

function promptsOutcomeExamplesNested() {
  it("renders every nested key in its field's example, so a dropped key fails", () => {
    const examples = ROLE_EXPECTATIONS.map(
      ([prompt, expectation]) => outcomeExamples(prompt, expectation).primary,
    );
    // `debtClosed` stays empty: an entry cites an ingest-assigned id, so a
    // filled entry would fail `validate` in a record directory.
    const nested: [string, { shape: Record<string, unknown> }][] = [
      ["concerns", concernSchema],
      ["steerAnswers", steerAnswerSchema],
      ["replies", replySchema],
      ["steerRoutes", steerRouteEntrySchema],
      ["stallRoutes", stallRouteEntrySchema],
      ["planCheck", planCheckSchema],
      ["planCheck", planCheckEvidenceSchema],
      ["planCheck", planCheckFollowUpSchema],
      ["planCheckRoutes", planCheckRouteEntrySchema],
      ["planReview", planReviewOutcomeSchema],
      ["planReview", planReviewFindingSchema],
      ["planReviewMarks", planReviewMarkSchema],
    ];
    for (const [field, schema] of nested) {
      const example = examples.find((candidate) => field in candidate) as
        | Record<string, unknown>
        | undefined;
      expect(example, `${field} has no example`).toBeDefined();
      const text = yaml.stringify(example![field], { lineWidth: 0 });
      for (const key of Object.keys(schema.shape)) {
        expect(text, `${field} is missing nested key ${key}`).toContain(key);
      }
    }
  });
}

function promptsOutcomeExamplesPart2() {
  it("renders both examples for every shipped flow step, and factory validate accepts them", async () => {
    const configs = loadConfigs(packageRoot);
    const renders = new Map(
      dryRunPrompts(configs, packageRoot).map((render) => [
        render.name,
        render.text,
      ]),
    );
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "prompts-examples-"));
    try {
      for (const flow of Object.values(configs.process.flows)) {
        for (const step of flow.steps) {
          if (step.prompt === undefined) continue;
          const text = renders.get(step.prompt);
          expect(
            text,
            `dry-run has no render for ${step.prompt}`,
          ).toBeDefined();
          const expectation = expectationForStep(
            step.id,
            configs.process.flows,
          );
          // The dry-run renders the same generated example, not a hand copy.
          expect(text).toContain(
            outcomeExampleVar(step.prompt, expectation, schemaFor(expectation)),
          );
          const blocks = outcomeBlocks(text!);
          expect(blocks, `${step.id} examples`).toHaveLength(2);
          for (const [index, block] of blocks.entries()) {
            const file = writeRecordOutcome(
              root,
              `${step.id}-${index}`,
              step.id,
              block,
            );
            const result = await validateFile(file, {
              step: step.id,
              repo: packageRoot,
            });
            expect(result.findings, `${step.id} example ${index}`).toEqual([]);
          }
        }
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

function promptsSchemaSkeletonsPart3() {
  it("renders a nested field added to a schema, so a dropped nested key fails", () => {
    const report = (fields: z.ZodRawShape) =>
      z.object({ report: z.object(fields) });
    expect(
      skeletonShape(renderSkeleton(report({ kept: z.string() })), "report"),
    ).toBe("report: {kept}");
    expect(
      skeletonShape(
        renderSkeleton(report({ kept: z.string(), added: z.string() })),
        "report",
      ),
    ).toBe("report: {kept, added}");
  });
}

function promptsSchemaSkeletonsPart4() {
  it("renders the fields a prompt author writes", () => {
    expect(skeletonKeys(taskFrontmatterVar())).toEqual([
      "slug",
      "title",
      "type",
      "deps",
      "epic",
      "tier",
      "revision",
      "base",
      "source",
      "envNotes",
      "repairTurns",
      "turnMinutes",
    ]);
  });
}

function promptsSchemaSkeletonsPart5() {
  it("pins the task-frontmatter skeleton wording", () => {
    expect(taskFrontmatterVar()).toBe(
      [
        "```yaml",
        "slug: namespaced kebab-case, matches the file name",
        "title: one line",
        "type: one of the configured task types; it supplies flow, kind and schema",
        "deps: [a slug that must merge first]",
        "epic: the epic that owns this task; absent means goal-level work  # optional",
        "tier: default, or a run-config alias  # optional",
        "revision: one more than the parked revision when amending under its slug  # optional",
        "base: the parked slug this continues  # optional",
        "source: plan heading, front, steer, stall or plan-check turn",
        "envNotes: [one environment fact, flake or workaround]  # optional; infra facts, known flakes and workarounds for this task's implementer turns",
        "repairTurns: outcome-repair turns for this task's turns  # optional",
        "turnMinutes: per-turn wall bound in minutes  # optional",
        "```",
      ].join("\n"),
    );
  });
}

function promptsSchemaSkeletonsPart6() {
  it("keeps the frontmatter schema in step with the task parser", () => {
    const text = [
      "---",
      "slug: auth.token-refresh",
      "title: Refresh tokens",
      "type: development",
      "deps: [auth.session-store]",
      "scope: [auth]",
      "epic: auth",
      "tier: escalation",
      "revision: 1",
      "base: auth.probe",
      "source: Milestone auth / refresh",
      "envNotes:",
      "  - bun install needs the network",
      "repairTurns: 1",
      "turnMinutes: 45",
      "---",
      "",
      "Why: rotate without a re-login.",
      "Done when: refresh rotates the token.",
      "",
    ].join("\n");
    const { body: _body, ...frontmatter } = parseTaskFile(
      text,
      "auth.token-refresh",
      {
        development: {
          flow: "implement-review",
          kind: "development",
          schema: "outcome",
        },
      },
    );
    expect(Object.keys(frontmatter).sort()).toEqual(
      Object.keys(taskFrontmatterSchema.shape).sort(),
    );
    expect(() => taskFrontmatterSchema.parse(frontmatter)).not.toThrow();
    expect(taskFrontmatterVar()).toContain(
      "type: one of the configured task types",
    );
    expect(taskFrontmatterVar()).not.toContain("kind:");
  });
}

function registerPromptsPromptLibraryPart1(): void {
  it("renders includes and leaves no unresolved variables", () => {
    const lib = loadPromptLibrary({ builtinDir: dir });
    expect(lib.render("steps/develop", { task: "add auth" })).toContain(
      "Task: add auth",
    );
    expect(lib.render("steps/develop", { task: "add auth" })).toContain(
      "Workspace Containment",
    );
  });

  it("throws for a missing variable and reports placeholders", () => {
    const lib = loadPromptLibrary({ builtinDir: dir });
    expect(lib.placeholders("steps/develop")).toEqual(["task"]);
    expect(() => lib.render("steps/develop", {})).toThrow(
      "Missing required prompt variables",
    );
    expect(() => lib.render("steps/missing", {})).toThrow("not found");
  });

  it("lets the process config replace the calibration partial", () => {
    const process = {
      flows: {},
      boundary: TEST_BOUNDARY,
      reminders: 1,
      calibration: "CUSTOM CALIBRATION",
    } as ProcessConfig;
    const lib = loadPrompts(process, dir, { run: {} as RunConfig });
    expect(lib.render("calibration", {})).toBe("CUSTOM CALIBRATION");
    // Built-ins still render when the process config sets no calibration.
    const builtin = loadPrompts(
      { flows: {}, boundary: TEST_BOUNDARY, reminders: 1 } as ProcessConfig,
      dir,
      { run: {} as RunConfig },
    );
    expect(builtin.render("calibration", {})).toContain(
      "A concern is a recorded debt",
    );
  });
}

function registerPromptsPromptLibraryPart2(): void {
  it("lets an override directory shadow the built-in fragment", () => {
    const overrideDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompts-override-"),
    );
    try {
      fs.mkdirSync(path.join(overrideDir, "steps"), { recursive: true });
      fs.writeFileSync(
        path.join(overrideDir, "steps", "develop.md"),
        "override {{task}}",
      );
      const lib = loadPromptLibrary({
        builtinDir: dir,
        overrideDirs: [overrideDir],
      });
      expect(lib.render("steps/develop", { task: "x" })).toBe("override x");
    } finally {
      fs.rmSync(overrideDir, { recursive: true, force: true });
    }
  });
}

describe("prompts: PromptLibrary", () => {
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "prompts-test-"));
    fs.mkdirSync(path.join(dir, "_shared"), { recursive: true });
    fs.mkdirSync(path.join(dir, "steps"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "_shared", "containment.md"),
      "Workspace Containment: stay inside the worktree.",
    );
    fs.writeFileSync(
      path.join(dir, "steps", "develop.md"),
      "# Develop\nTask: {{task}}\n{% include '_shared/containment' %}\n",
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  registerPromptsPromptLibraryPart1();

  registerPromptsPromptLibraryPart2();
});

describe("prompts: outcome examples", () => {
  promptsOutcomeExamplesValidity();

  promptsOutcomeExamplesCoverage();

  promptsOutcomeExamplesAlternatives();

  promptsOutcomeExamplesNarrowing();

  promptsOutcomeExamplesNested();

  promptsOutcomeExamplesPart2();
});

describe("prompts: schema skeletons", () => {
  promptsSchemaSkeletonsPart3();

  promptsSchemaSkeletonsPart4();

  promptsSchemaSkeletonsPart5();

  promptsSchemaSkeletonsPart6();
});
