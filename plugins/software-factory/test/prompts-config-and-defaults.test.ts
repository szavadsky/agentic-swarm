import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfigs } from "../src/kernel/config.js";
import { FRONT_TRIVIAL_FLOW, frontClassTypesVar } from "../src/kernel/front.js";
import { taskTypesVar, tierNamesVar } from "../src/kernel/prompt-schema.js";
import { outcomeExampleVar } from "../src/kernel/outcome-example.js";
import { packPreparerOutcomeSchema } from "../src/kernel/pack-prep.js";
import { dryRunPrompts } from "../src/kernel/prompt-dry-run.js";
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
          useWhen: "work that lands after review",
        },
        spike: {
          flow: "spike",
          kind: "spike",
          schema: "outcome",
          useWhen: "a question only evidence answers",
        },
      }),
    ).toBe(
      "development (flow: implement-review, kind: development, schema: outcome, use when: work that lands after review), spike (flow: spike, kind: spike, schema: outcome, use when: a question only evidence answers)",
    );
  });

  it("renders an empty task type list as none", () => {
    expect(taskTypesVar({})).toBe("none");
    expect(taskTypesVar(undefined)).toBe("none");
  });

  it("marks a nogit type in the rendered catalog", () => {
    expect(
      taskTypesVar({
        "fact-finder": {
          flow: "fact-find",
          kind: "spike",
          schema: "outcome",
          nogit: true,
          useWhen: "research a library",
        },
      }),
    ).toBe(
      "fact-finder (flow: fact-find, kind: spike, schema: outcome, nogit: true, use when: research a library)",
    );
  });

  it("lists run-config aliases in config order", () => {
    expect(tierNamesVar({ implementer: {}, escalation: {} })).toBe(
      "implementer, escalation",
    );
    expect(tierNamesVar({})).toBe("none");
    expect(tierNamesVar(undefined)).toBe("none");
  });

  registerFrontClassTypes();
});

function registerFrontClassTypes(): void {
  it("renders every configured development type a front class may write", () => {
    expect(
      frontClassTypesVar({
        feature: {
          flow: "feature",
          kind: "development",
          schema: "outcome",
          useWhen: "a repo's own delivery shape",
        },
        development: {
          flow: "implement-review",
          kind: "development",
          schema: "outcome",
          useWhen: "work that lands after review",
        },
        trivial: {
          flow: FRONT_TRIVIAL_FLOW,
          kind: "development",
          schema: "outcome",
          useWhen: "a small fully understood change",
        },
        spike: {
          flow: "spike",
          kind: "spike",
          schema: "outcome",
          useWhen: "a question only evidence answers",
        },
      }),
    ).toBe("`trivial` for trivial, `feature` or `development` for task");
    expect(frontClassTypesVar({})).toBe("none for trivial, none for task");
  });

  it("has no task type for a class whose only development flow is the trivial one", () => {
    expect(
      frontClassTypesVar({
        trivial: {
          flow: FRONT_TRIVIAL_FLOW,
          kind: "development",
          schema: "outcome",
          useWhen: "a small fully understood change",
        },
      }),
    ).toBe("`trivial` for trivial, none for task");
  });
}

describe("prompts: configured use-when", () => {
  it("renders a repo's own use-when to the architect, PM and checker", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "prompts-use-when-"));
    fs.mkdirSync(path.join(root, ".factory"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".factory/process.yaml"),
      "taskTypes:\n  development:\n    flow: implement-review\n    kind: development\n    schema: outcome\n    useWhen: touches the billing ledger\n",
    );
    try {
      const renders = new Map(
        dryRunPrompts(loadConfigs(root), root).map((render) => [
          render.name,
          render.text,
        ]),
      );
      const configured =
        "development (flow: implement-review, kind: development, schema: outcome, use when: touches the billing ledger)";
      for (const name of ["architect", "pm", "plan-checker"]) {
        expect(
          renders.get(name),
          `dry-run has no render for ${name}`,
        ).toContain(configured);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
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
      useWhen: "work that lands after review",
    },
    spike: {
      flow: "spike",
      kind: "spike" as const,
      schema: "outcome",
      useWhen: "a question only evidence answers",
    },
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
    expect(rendered).toContain("A complete outcome for this step:");
    expect(rendered).toContain("status: done");
    expect(rendered).toContain("replies:");
    expect(rendered).not.toContain("status: done |");
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
      "Configured task types: development (flow: implement-review, kind: development, schema: outcome, use when: work that lands after review), spike (flow: spike, kind: spike, schema: outcome, use when: a question only evidence answers).",
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

describe("prompts: repair examples", () => {
  it("keeps the reporting fields a role's turns deliver", () => {
    const pm = outcomeExampleVar("pm", "any");
    for (const field of ["steerRoutes:", "stallRoutes:", "planCheckRoutes:"]) {
      expect(pm).toContain(field);
    }
    // The plan check itself belongs to the checker, not the PM's routing turn.
    expect(pm).not.toContain("planCheck:");
    expect(pm).not.toContain("verdict:");
    expect(outcomeExampleVar("plan-checker", "any")).toContain("planCheck:");
    expect(outcomeExampleVar("reviewer", "review")).toContain("upscope: no");
    expect(outcomeExampleVar("implementer", "any")).toContain("replies:");
    expect(outcomeExampleVar("implementer", "any")).not.toContain(
      "steerRoutes:",
    );
    expect(
      outcomeExampleVar("pack-preparer", "any", packPreparerOutcomeSchema),
    ).toContain("packBriefs:");
    expect(outcomeExampleVar("architect", "architect")).toContain(
      "planReviewMarks:",
    );
    expect(outcomeExampleVar("review-architect", "any")).toContain(
      "planReview:",
    );
    expect(outcomeExampleVar("review-architect", "any")).not.toContain(
      "verdict:",
    );
    expect(outcomeExampleVar("architect-review-return", "any")).toContain(
      "planReviewMarks:",
    );
    // Debt closure and steer answers are protocol fields on every role's ask.
    for (const role of ["architect", "pm", "implementer"]) {
      const rendered = outcomeExampleVar(role, "any");
      expect(rendered).toContain("debtClosed:");
      expect(rendered).toContain("steerAnswers:");
    }
    expect(outcomeExampleVar("pm", "any")).not.toContain("forward:");
  });
});
