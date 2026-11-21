/** Turn, flow, task-type, architecture and hierarchy schemas. */

import { z } from "zod";
import { BOUNDARY_STEPS } from "../types.js";
import type { BoundaryStep } from "../types.js";

/** One step's prompt template and run-config alias. */
export const turnSchema = z
  .object({
    prompt: z.string().min(1),
    alias: z.string().min(1),
    /** Prompt template for the missing-outcome repair ask; defaults to `delivery-repair`. */
    repairPrompt: z.string().min(1).optional(),
    /** Product the turn must deliver; defaults by expectation, else `outcome`. */
    deliverable: z.string().min(1).optional(),
  })
  .strict();

export const followUpSchema = z
  .object({
    mode: z
      .enum(["same-session", "de-novo", "different-model"])
      .default("same-session"),
    alias: z.string().min(1).optional(),
    /** Resume the step's last session across a model switch when portable. */
    keepSession: z.boolean().optional(),
  })
  .strict()
  .refine(
    (followUp) => followUp.mode !== "different-model" || !!followUp.alias,
    {
      message: "a different-model follow-up needs an alias",
      path: ["alias"],
    },
  )
  .refine(
    (followUp) =>
      followUp.keepSession === undefined || followUp.mode === "different-model",
    {
      message: "keepSession needs a different-model follow-up",
      path: ["keepSession"],
    },
  );

/** One flow step; `review` marks the step that consumes a review round. */
export const flowStepSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(
        /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
        "step id must be a simple name (no path separators)",
      ),
    prompt: z.string().min(1).optional(),
    alias: z.string().min(1).optional(),
    /** Prompt template for the missing-outcome repair ask; defaults to `delivery-repair`. */
    repairPrompt: z.string().min(1).optional(),
    /** Product the turn must deliver; defaults by expectation, else `outcome`. */
    deliverable: z.string().min(1).optional(),
    review: z.boolean().default(false),
    /** QA acceptance step: its own schema, verdict and gate handoff. */
    qa: z.boolean().default(false),
    /** Review adjudication: `all` cycles or only the last change-bearing one. */
    adjudicate: z.enum(["last", "all"]).optional(),
    /** Review, QA and checks steps: change requests honored before the last call. */
    changeRequests: z.number().int().nonnegative().optional(),
    /** Aliases later attempts run on after failure-kind launches, in order. */
    alternates: z.array(z.string().min(1)).optional(),
    /** How this step's later turn follows the one it repairs. */
    followUp: followUpSchema.optional(),
  })
  .strict()
  .refine(
    (step) =>
      step.id === "checks" ||
      (step.prompt !== undefined && step.alias !== undefined),
    {
      message: "a step other than checks needs a prompt and an alias",
      path: ["prompt"],
    },
  )
  .refine((step) => step.alternates === undefined || step.alias !== undefined, {
    message: "alternates need a step alias to alternate with",
    path: ["alternates"],
  })
  .refine((step) => !(step.review && step.qa), {
    message: "a step is either a review or a QA acceptance step, not both",
    path: ["qa"],
  })
  .refine((step) => !(step.adjudicate && (step.review || step.qa)), {
    message:
      "an adjudicate step is neither a review nor a QA step: it re-judges the review before it",
    path: ["adjudicate"],
  })
  .refine(
    (step) =>
      step.adjudicate === undefined || step.changeRequests === undefined,
    {
      message:
        "an adjudicate step takes no changeRequests: the review it follows owns the bound",
      path: ["changeRequests"],
    },
  );

export const flowSchema = z
  .object({
    steps: z.array(flowStepSchema).min(1),
  })
  .strict()
  .refine(
    (flow) => {
      const steps = flow.steps.filter(
        (step) => step.id !== "checks" && step.id !== "resolve",
      );
      return steps.every(
        (step, index) =>
          step.adjudicate === undefined || steps[index - 1]?.review === true,
      );
    },
    {
      message:
        "an adjudicate step must directly follow a review step: it adjudicates that review's findings",
      path: ["steps"],
    },
  );

/**
 * One task type: the flow a task runs, whether it is a spike or development
 * work, and the kernel output schema its turns deliver. The type owns all
 * three so a task file cannot pair a spike kind with a review-only flow.
 */
export const taskTypeSchema = z
  .object({
    flow: z.string().min(1),
    kind: z.enum(["spike", "development"]),
    schema: z.string().min(1),
  })
  .strict();

/** Every boundary step names its prompt and alias; unknown steps are refused. */
export const boundarySchema = z
  .object(
    Object.fromEntries(
      BOUNDARY_STEPS.map((step) => [step, turnSchema]),
    ) as Record<BoundaryStep, typeof turnSchema>,
  )
  .strict();

/** A repo override may retarget one boundary step without restating the rest. */
export const boundaryOverrideSchema = z
  .object(
    Object.fromEntries(
      BOUNDARY_STEPS.map((step) => [step, turnSchema.optional()]),
    ) as Record<BoundaryStep, z.ZodOptional<typeof turnSchema>>,
  )
  .strict();

/**
 * An architecture prompt: the reviewers supply the aliases, the architect
 * boundary step supplies the return's alias.
 */
const promptSpecSchema = turnSchema.omit({ alias: true });

/** The plan review flow: its prompt, reviewers, and the architect's return. */
export const architectureSchema = z
  .object({
    planReview: promptSpecSchema,
    reviewers: z.array(z.string().min(1)).min(1),
    architectReturn: z.enum(["on-technical-concerns", "never"]),
    planReturn: promptSpecSchema.optional(),
  })
  .strict()
  .refine(
    (architecture) =>
      architecture.architectReturn === "never" ||
      architecture.planReturn !== undefined,
    {
      message: "an architect return needs a planReturn prompt",
      path: ["planReturn"],
    },
  );

/** A repo override may retarget one architecture key without restating the rest. */
export const architectureOverrideSchema = z
  .object({
    planReview: promptSpecSchema.optional(),
    reviewers: z.array(z.string().min(1)).min(1).optional(),
    architectReturn: z.enum(["on-technical-concerns", "never"]).optional(),
    planReturn: promptSpecSchema.optional(),
  })
  .strict();

/** The hierarchy knob: depth 1 (the norm) or 2, and the epic architect's prompt. */
export const hierarchySchema = z
  .object({
    depth: z.union([z.literal(1), z.literal(2)]),
    subarchitect: promptSpecSchema,
  })
  .strict();

/** A repo override may set the depth without restating the prompt. */
export const hierarchyOverrideSchema = z
  .object({
    depth: z.union([z.literal(1), z.literal(2)]).optional(),
    subarchitect: promptSpecSchema.optional(),
  })
  .strict();
