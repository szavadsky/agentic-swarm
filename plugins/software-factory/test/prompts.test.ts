import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { FRONT_CLASS_FLOWS, frontClassFlowsVar } from "../src/kernel/front.js";
import type { OutcomeExpectation } from "../src/kernel/outcome.js";
import {
  flowNamesVar,
  outcomeRepairSchemaVar,
  outcomeSchemaVar,
  renderSkeleton,
  taskFrontmatterVar,
  tierNamesVar,
} from "../src/kernel/prompt-schema.js";
import { loadPromptLibrary, loadPrompts } from "../src/kernel/prompts.js";
import { parseTaskFile, taskFrontmatterSchema } from "../src/kernel/tasks.js";
import {
  concernSchema,
  outcomeSchema,
  planCheckEvidenceSchema,
  planCheckFollowUpSchema,
  planCheckRouteEntrySchema,
  planCheckSchema,
  planReviewMarkSchema,
  replySchema,
  stallRouteEntrySchema,
  steerRouteEntrySchema,
} from "../src/kernel/types.js";
import type { ProcessConfig } from "../src/kernel/types.js";

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
      roles: {},
      itemTurns: 8,
      calibration: "CUSTOM CALIBRATION",
    } as ProcessConfig;
    const lib = loadPrompts(process, dir);
    expect(lib.render("calibration", {})).toBe("CUSTOM CALIBRATION");
    // Built-ins still render when the process config sets no calibration.
    const builtin = loadPrompts(
      { flows: {}, roles: {}, itemTurns: 8 } as ProcessConfig,
      dir,
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
  it("renders every outcome schema field, so a new field cannot go missing", () => {
    expect(skeletonKeys(outcomeSchemaVar())).toEqual(
      Object.keys(outcomeSchema.shape),
    );
  });

  it("renders every nested outcome key in its own field's shape", () => {
    const skeleton = outcomeSchemaVar();
    const nested: [string, { shape: Record<string, unknown> }][] = [
      ["concerns", concernSchema],
      ["replies", replySchema],
      ["steerRoutes", steerRouteEntrySchema],
      ["stallRoutes", stallRouteEntrySchema],
      ["planCheck", planCheckSchema],
      ["planCheck", planCheckEvidenceSchema],
      ["planCheck", planCheckFollowUpSchema],
      ["planCheckRoutes", planCheckRouteEntrySchema],
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
      ["stallRoutes", ["continue", "leave"]],
      [
        "planCheck",
        [
          "progress",
          "architect",
          "done",
          "missing",
          "below-standard",
          "unverifiable",
          "continuation",
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
        "forward: []",
        "replies: [{finding, reply}]  # optional; fix turns only: one {finding, reply} per numbered prior finding; finding is its 1-based position",
        "verdict: approve | changes | reject  # optional; review steps only",
        "decision: continue | done | blocked  # optional; architect step only",
        "upscope: yes | no  # optional; standalone review escalation: answer with the verdict",
        "steerRoutes: [{steer, route, answer?}]  # optional; PM steer turns only: one route per claimed steer; route: task | spike | architect | stall",
        "stallRoutes: [{slug, action, reason}]  # optional; PM stall turns only: one entry per parked slug; action: continue | leave",
        "planCheck: {verdict, evidence: [{item, status, evidence}], followUps: [{kind, slug, dep?, reason}]}  # optional; plan-checker turns only; verdict: progress | architect; evidence.status: done | missing | below-standard | unverifiable; followUps.kind: continuation | missing-dep | unmerged",
        "planCheckRoutes: [{slug, action, reason}]  # optional; plan-check PM turns only: one entry per checker follow-up; action: continue | leave",
        "planReviewMarks: [{finding, mark}]  # optional; architect step only: one mark per plan-review finding; mark: helpful | unhelpful",
        "```",
      ].join("\n"),
    );
  });

  it("renders every task-frontmatter schema field", () => {
    expect(skeletonKeys(taskFrontmatterVar())).toEqual(
      Object.keys(taskFrontmatterSchema.shape),
    );
  });

  it("pins the task-frontmatter skeleton wording", () => {
    expect(taskFrontmatterVar()).toBe(
      [
        "```yaml",
        "slug: namespaced kebab-case, matches the file name",
        "title: one line",
        "kind: task | spike  # task merges, spike finishes with findings",
        "flow: one of the configured flows",
        "deps: [a slug that must merge first]",
        "scope: [a predicted area]",
        "tier: default, or a run-config alias  # optional",
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
      "kind: spike",
      "flow: spike",
      "deps: [auth.session-store]",
      "scope: [auth]",
      "tier: escalation",
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
    );
    expect(Object.keys(frontmatter).sort()).toEqual(
      Object.keys(taskFrontmatterSchema.shape).sort(),
    );
    expect(() => taskFrontmatterSchema.parse(frontmatter)).not.toThrow();
    expect(taskFrontmatterVar()).toContain("kind: task | spike");
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
    ];
    const rendered = new Set(
      repairs.flatMap(([role, expectation]) =>
        skeletonKeys(outcomeRepairSchemaVar(role, expectation)),
      ),
    );
    const ungated = Object.keys(outcomeSchema.shape).filter(
      (key) => key !== "verdict" && key !== "decision",
    );
    expect(ungated.filter((key) => !rendered.has(key))).toEqual([]);
  });

  it("drops the gated lines a bare done cannot deliver", () => {
    const implementer = outcomeRepairSchemaVar("implementer", "any");
    expect(skeletonKeys(implementer)).toEqual([
      "status",
      "summary",
      "concerns",
      "forward",
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
  });
});

describe("prompts: config names", () => {
  it("marks the kernel default flow in config order", () => {
    expect(
      flowNamesVar({
        "implement-review": {},
        "just-implement": {},
        spike: {},
      }),
    ).toBe("implement-review (default), just-implement, spike");
  });

  it("renders no default marker when the config lacks the default flow", () => {
    expect(flowNamesVar({ custom: {} })).toBe("custom");
    expect(flowNamesVar({})).toBe("none");
  });

  it("lists run-config aliases in config order", () => {
    expect(tierNamesVar({ implementer: {}, escalation: {} })).toBe(
      "implementer, escalation",
    );
    expect(tierNamesVar({})).toBe("none");
    expect(tierNamesVar(undefined)).toBe("none");
  });

  it("renders the front class mapping from the enforced mapping", () => {
    const rendered = frontClassFlowsVar();
    for (const [cls, flow] of Object.entries(FRONT_CLASS_FLOWS)) {
      expect(rendered).toContain(`\`${flow}\` for ${cls}`);
    }
  });
});

describe("prompts: schema defaults", () => {
  function library(
    flows: Record<string, unknown>,
    aliases?: Record<string, unknown>,
  ) {
    return loadPrompts(
      {
        flows: Object.fromEntries(
          Object.keys(flows).map((name) => [
            name,
            { steps: [], reviewRounds: 1 },
          ]),
        ),
        roles: {},
        itemTurns: 8,
      } as ProcessConfig,
      os.tmpdir(),
      aliases,
    );
  }

  it("fills the outcome partial from the schema without turn vars", () => {
    const rendered = library({}).render("outcome", {});
    expect(rendered).toContain("status: done | blocked | failed | upscope");
    expect(rendered).toContain(
      "verdict: approve | changes | reject  # optional; review steps only",
    );
    expect(rendered).not.toContain("{{");
  });

  it("fills the task-frontmatter partial from schema and config", () => {
    const rendered = library(
      { "implement-review": {}, spike: {} },
      { escalation: {} },
    ).render("task-frontmatter", {});
    expect(rendered).toContain("kind: task | spike");
    expect(rendered).toContain(
      "Configured flows: implement-review (default), spike.",
    );
    expect(rendered).toContain("Configured tiers: escalation.");
    expect(rendered).not.toContain("{{");
  });

  it("requires the new variables on the authoring roles", () => {
    const lib = library({ "implement-review": {} }, { escalation: {} });
    expect(lib.placeholders("front")).toEqual(
      expect.arrayContaining([
        "outcome_schema",
        "task_frontmatter",
        "flows",
        "tiers",
        "class_flows",
      ]),
    );
    expect(lib.placeholders("pm")).toEqual(
      expect.arrayContaining([
        "outcome_schema",
        "task_frontmatter",
        "flows",
        "tiers",
      ]),
    );
    expect(lib.placeholders("pm")).not.toContain("class_flows");
    expect(lib.placeholders("architect")).toEqual(
      expect.arrayContaining(["outcome_schema", "flows", "tiers"]),
    );
  });
});
