import { describe, expect, it } from "bun:test";
import os from "node:os";
import { FRONT_CLASS_FLOWS, frontClassTypesVar } from "../src/kernel/front.js";
import {
  outcomeRepairSchemaVar,
  taskTypesVar,
  tierNamesVar,
} from "../src/kernel/prompt-schema.js";
import { packPreparerOutcomeSchema } from "../src/kernel/pack-prep.js";
import { loadPrompts } from "../src/kernel/prompts.js";
import type { ProcessConfig } from "../src/kernel/types.js";
import { TEST_BOUNDARY } from "./kernel/helpers.js";

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
  const scope1 = promptsSchemaDefaultsPart1();
  promptsSchemaDefaultsPart2(scope1);
});

function promptsSchemaDefaultsPart1() {
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

  return { TASK_TYPES, libraryWithConfig };
}

function promptsSchemaDefaultsPart2(
  scope: ReturnType<typeof promptsSchemaDefaultsPart1>,
) {
  const { libraryWithConfig, TASK_TYPES } = scope;
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
}

describe("prompts: repair skeleton", () => {
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
    expect(
      outcomeRepairSchemaVar("pack-preparer", "any", packPreparerOutcomeSchema),
    ).toContain("packBriefs:");
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
