// biome-ignore-all lint/complexity: split-rest
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { FRONT_CLASS_FLOWS, frontClassTypesVar } from "../src/kernel/front.js";
import type { OutcomeExpectation } from "../src/kernel/outcome.js";
import {
  outcomeRepairSchemaVar,
  outcomeSchemaVar,
  renderSkeleton,
  taskFrontmatterVar,
  taskTypesVar,
  tierNamesVar,
} from "../src/kernel/prompt-schema.js";
import { loadPromptLibrary, loadPrompts } from "../src/kernel/prompts.js";
import { parseTaskFile, taskFrontmatterSchema } from "../src/kernel/tasks.js";
import type { ProcessConfig, RunConfig } from "../src/kernel/types.js";
import {
  concernSchema,
  debtClosedEntrySchema,
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

describe("prompts: PromptLibrary", () => {
  let dir: string;

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
});

/** Top-level `key:` lines of a rendered skeleton, in order. */
function skeletonKeys(skeleton: string): string[] {
  return skeleton
    .split("\n")
    .map((line) => /^([A-Za-z0-9_]+): /.exec(line)?.[1])
    .filter((key): key is string => key !== undefined);
}

/** One top-level field's rendered line. */
function skeletonLine(skeleton: string, key: string): string {
  const line = skeleton
    .split("\n")
    .find((candidate) => candidate.startsWith(`${key}: `));
  if (!line) throw new Error(`skeleton has no ${key} line`);
  return line;
}

/** One top-level field's rendered shape, before its trailing comment. */
function skeletonShape(skeleton: string, key: string): string {
  const [shape = ""] = skeletonLine(skeleton, key).split("  # ");
  return shape;
}

/** One top-level field's rendered comment, or "" without one. */
function skeletonComment(skeleton: string, key: string): string {
  const line = skeletonLine(skeleton, key);
  const at = line.indexOf("  # ");
  return at === -1 ? "" : line.slice(at + 4);
}

describe("prompts: schema skeletons", () => {
  it("renders every outcome field a turn writes, so a new field cannot go missing", () => {
    expect(skeletonKeys(outcomeSchemaVar())).toEqual(
      Object.keys(outcomeSchema.shape).filter((key) => key !== "forward"),
    );
    // `forward` is parse-only: old records still carry it, no turn writes one.
    expect(outcomeSchemaVar()).not.toContain("forward:");
  });

  it("renders every nested outcome key in its own field's shape", () => {
    const skeleton = outcomeSchemaVar();
    const nested: [string, { shape: Record<string, unknown> }][] = [
      ["concerns", concernSchema],
      ["debtClosed", debtClosedEntrySchema],
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
      const shape = skeletonShape(skeleton, field);
      for (const key of Object.keys(schema.shape)) {
        expect(shape, `${field} is missing nested key ${key}`).toContain(key);
      }
    }
    // Optional nested fields keep their `?` marker.
    expect(skeletonShape(skeleton, "concerns")).toContain("evidence?");
    expect(skeletonShape(skeleton, "steerRoutes")).toContain("answer?");
    expect(skeletonShape(skeleton, "planCheck")).toContain("dep?");
  });

  it("renders every nested enum value in its own field's comment", () => {
    const skeleton = outcomeSchemaVar();
    const enums: [string, string[]][] = [
      [
        "concerns",
        ["debt", "risk", "uncertainty", "choice", "fyi", "architect", "owner"],
      ],
      ["steerRoutes", ["task", "spike", "architect", "stall"]],
      ["stallRoutes", ["amend", "cancel", "replace", "split", "leave"]],
      [
        "planCheck",
        [
          "progress",
          "architect",
          "done",
          "missing",
          "below-standard",
          "unverifiable",
          "amend",
          "cancel",
          "replace",
          "split",
          "missing-dep",
          "unmerged",
        ],
      ],
      ["planCheckRoutes", ["continue", "leave"]],
      ["planReviewMarks", ["helpful", "unhelpful"]],
    ];
    for (const [field, values] of enums) {
      const comment = skeletonComment(skeleton, field);
      for (const value of values) {
        expect(comment, `${field} is missing enum value ${value}`).toContain(
          value,
        );
      }
    }
  });

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

  it("pins the outcome skeleton wording", () => {
    expect(outcomeSchemaVar()).toBe(
      [
        "```yaml",
        "status: done | blocked | failed | upscope  # upscope on task steps only",
        "summary: one paragraph",
        "concerns: [{kind, calibration, text, evidence?}]  # kind: debt | risk | uncertainty | choice; calibration: fyi | architect | owner",
        "debtClosed: [{id, reason}]  # optional; close one open debt by the id in the pack's debt register; reason says what removed it",
        "steerAnswers: [{steer, answer}]  # optional; one {steer, answer} per pending steer, steer id from the steer list",
        "replies: [{finding, reply}]  # optional; fix turns only: one {finding, reply} per numbered prior finding; finding is its 1-based position",
        "verdict: approve | changes | reject  # optional; review steps only",
        "decision: continue | done | blocked  # optional; architect step only",
        "upscope: yes | no  # optional; standalone review escalation: answer with the verdict",
        "steerRoutes: [{steer, route, answer?}]  # optional; PM steer turns only: one route per claimed steer; route: task | spike | architect | stall",
        "stallRoutes: [{slug, action, reason}]  # optional; PM stall turns only: one entry per parked slug; action: amend | cancel | replace | split | leave",
        "planCheck: {verdict, evidence: [{item, status, evidence}], followUps: [{kind, slug, dep?, reason}]}  # optional; plan-checker turns only; verdict: progress | architect; evidence.status: done | missing | below-standard | unverifiable; followUps.kind: amend | cancel | replace | split | missing-dep | unmerged",
        "planReview: {technical: [{planLine, finding}], planNotes: [{planLine, finding}]}  # optional; plan-review turns only: technical findings and plan notes",
        "planCheckRoutes: [{slug, action, reason}]  # optional; plan-check PM turns only: one entry per checker follow-up; action: continue | leave",
        "planReviewMarks: [{finding, mark}]  # optional; architect step only: one mark per plan-review finding; mark: helpful | unhelpful",
        "```",
      ].join("\n"),
    );
  });

  it("renders the fields a prompt author writes", () => {
    expect(skeletonKeys(taskFrontmatterVar())).toEqual([
      "slug",
      "title",
      "type",
      "deps",
      "scope",
      "tier",
      "revision",
      "base",
      "source",
      "repairTurns",
      "turnMinutes",
    ]);
  });

  it("pins the task-frontmatter skeleton wording", () => {
    expect(taskFrontmatterVar()).toBe(
      [
        "```yaml",
        "slug: namespaced kebab-case, matches the file name",
        "title: one line",
        "type: one of the configured task types; it supplies flow, kind and schema",
        "deps: [a slug that must merge first]",
        "scope: [a predicted area]",
        "tier: default, or a run-config alias  # optional",
        "revision: one more than the parked revision when amending under its slug  # optional",
        "base: the parked slug this continues  # optional",
        "source: plan heading, front, steer, stall or plan-check turn",
        "repairTurns: outcome-repair turns for this task's turns  # optional",
        "turnMinutes: per-turn wall bound in minutes  # optional",
        "```",
      ].join("\n"),
    );
  });

  it("keeps the frontmatter schema in step with the task parser", () => {
    const text = [
      "---",
      "slug: auth.token-refresh",
      "title: Refresh tokens",
      "type: development",
      "deps: [auth.session-store]",
      "scope: [auth]",
      "tier: escalation",
      "revision: 1",
      "base: auth.probe",
      "source: Milestone auth / refresh",
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
});

describe("prompts: repair skeleton", () => {
  it("renders every ungated outcome field in some role's repair ask", () => {
    const repairs: [string, OutcomeExpectation][] = [
      ["implementer", "any"],
      ["reviewer", "review"],
      ["architect", "architect"],
      ["pm", "any"],
      ["plan-checker", "any"],
      ["review-architect", "any"],
      ["architect-review-return", "any"],
    ];
    const rendered = new Set(
      repairs.flatMap(([role, expectation]) =>
        skeletonKeys(outcomeRepairSchemaVar(role, expectation)),
      ),
    );
    // `forward` is parse-only for old records; no repair ask can deliver it.
    const ungated = Object.keys(outcomeSchema.shape).filter(
      (key) => key !== "verdict" && key !== "decision" && key !== "forward",
    );
    expect(ungated.filter((key) => !rendered.has(key))).toEqual([]);
  });

  it("drops the gated lines a bare done cannot deliver", () => {
    const implementer = outcomeRepairSchemaVar("implementer", "any");
    expect(skeletonKeys(implementer)).toEqual([
      "status",
      "summary",
      "concerns",
      "debtClosed",
      "steerAnswers",
      "replies",
    ]);
    expect(implementer).not.toContain("verdict:");
    expect(implementer).not.toContain("decision:");
  });

  it("keeps the one gated line the step delivers", () => {
    const review = outcomeRepairSchemaVar("reviewer", "review");
    expect(review).toContain("verdict: approve | changes | reject");
    expect(review).not.toContain("decision:");
    const architect = outcomeRepairSchemaVar("architect", "architect");
    expect(architect).toContain("decision: continue | done | blocked");
    expect(architect).not.toContain("verdict:");
  });

  it("keeps the reporting fields a role's turns deliver", () => {
    const pm = outcomeRepairSchemaVar("pm", "any");
    for (const field of ["steerRoutes:", "stallRoutes:", "planCheckRoutes:"]) {
      expect(pm).toContain(field);
    }
    // The plan check itself belongs to the checker, not the PM's routing turn.
    expect(pm).not.toContain("planCheck:");
    expect(pm).not.toContain("verdict:");
    expect(outcomeRepairSchemaVar("plan-checker", "any")).toContain(
      "planCheck:",
    );
    expect(outcomeRepairSchemaVar("reviewer", "review")).toContain(
      "upscope: yes | no",
    );
    expect(outcomeRepairSchemaVar("implementer", "any")).toContain("replies:");
    expect(outcomeRepairSchemaVar("implementer", "any")).not.toContain(
      "steerRoutes:",
    );
    expect(outcomeRepairSchemaVar("architect", "architect")).toContain(
      "planReviewMarks:",
    );
    expect(outcomeRepairSchemaVar("review-architect", "any")).toContain(
      "planReview:",
    );
    expect(outcomeRepairSchemaVar("review-architect", "any")).not.toContain(
      "verdict:",
    );
    expect(outcomeRepairSchemaVar("architect-review-return", "any")).toContain(
      "planReviewMarks:",
    );
    // Debt closure and steer answers are protocol fields on every role's ask.
    for (const role of ["architect", "pm", "implementer"]) {
      const rendered = outcomeRepairSchemaVar(role, "any");
      expect(rendered).toContain("debtClosed:");
      expect(rendered).toContain("steerAnswers:");
    }
    expect(outcomeRepairSchemaVar("pm", "any")).not.toContain("forward:");
  });
});

describe("prompts: config names", () => {
  it("lists task types in config order with what each supplies", () => {
    expect(
      taskTypesVar({
        development: {
          flow: "implement-review",
          kind: "development",
          schema: "outcome",
        },
        spike: { flow: "spike", kind: "spike", schema: "outcome" },
      }),
    ).toBe(
      "development (flow: implement-review, kind: development, schema: outcome), spike (flow: spike, kind: spike, schema: outcome)",
    );
  });

  it("renders an empty task type list as none", () => {
    expect(taskTypesVar({})).toBe("none");
    expect(taskTypesVar(undefined)).toBe("none");
  });

  it("lists run-config aliases in config order", () => {
    expect(tierNamesVar({ implementer: {}, escalation: {} })).toBe(
      "implementer, escalation",
    );
    expect(tierNamesVar({})).toBe("none");
    expect(tierNamesVar(undefined)).toBe("none");
  });

  it("renders the task type each front class writes", () => {
    const rendered = frontClassTypesVar({
      development: {
        flow: FRONT_CLASS_FLOWS.task,
        kind: "development",
        schema: "outcome",
      },
      trivial: {
        flow: FRONT_CLASS_FLOWS.trivial,
        kind: "development",
        schema: "outcome",
      },
    });
    expect(rendered).toContain("`development` for task");
    expect(rendered).toContain("`trivial` for trivial");
    expect(frontClassTypesVar({})).toContain("none for task");
  });
});

describe("prompts: schema defaults", () => {
  const TASK_TYPES = {
    development: {
      flow: "implement-review",
      kind: "development" as const,
      schema: "outcome",
    },
    spike: { flow: "spike", kind: "spike" as const, schema: "outcome" },
  };

  function libraryWithConfig(
    taskTypes: Record<string, unknown> = TASK_TYPES,
    aliases?: Record<string, unknown>,
  ) {
    return loadPrompts(
      {
        flows: {},
        taskTypes,
        boundary: TEST_BOUNDARY,
        reminders: 1,
      } as ProcessConfig,
      os.tmpdir(),
      { aliases },
    );
  }

  it("fills the outcome partial from the schema without turn vars", () => {
    const rendered = libraryWithConfig({}).render("outcome", {});
    expect(rendered).toContain("status: done | blocked | failed | upscope");
    expect(rendered).toContain(
      "verdict: approve | changes | reject  # optional; review steps only",
    );
    expect(rendered).not.toContain("{{");
  });

  it("fills the task-frontmatter partial from schema and config", () => {
    const rendered = libraryWithConfig(TASK_TYPES, {
      escalation: {},
    }).render("task-frontmatter", {});
    expect(rendered).toContain(
      "type: one of the configured task types; it supplies flow, kind and schema",
    );
    expect(rendered).toContain(
      "Configured task types: development (flow: implement-review, kind: development, schema: outcome), spike (flow: spike, kind: spike, schema: outcome).",
    );
    expect(rendered).toContain("Configured tiers: escalation.");
    expect(rendered).not.toContain("{{");
  });

  it("requires the new variables on the authoring roles", () => {
    const lib = libraryWithConfig();
    expect(lib.placeholders("front")).toEqual(
      expect.arrayContaining([
        "outcome_schema",
        "task_frontmatter",
        "task_types",
        "tiers",
        "class_types",
      ]),
    );
    expect(lib.placeholders("pm")).toEqual(
      expect.arrayContaining([
        "outcome_schema",
        "task_frontmatter",
        "task_types",
        "tiers",
      ]),
    );
    expect(lib.placeholders("pm")).not.toContain("class_types");
    expect(lib.placeholders("architect")).toEqual(
      expect.arrayContaining(["outcome_schema", "task_types", "tiers"]),
    );
  });
});
