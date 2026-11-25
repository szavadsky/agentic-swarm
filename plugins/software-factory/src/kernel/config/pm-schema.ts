/** The PM stage's flow schema: the built-in derive step and config-only turns. */

import { z } from "zod";
import { BUILTIN_PM_FLOW_STEPS, DEFAULT_PM_FLOW_STEPS } from "../types.js";

const BUILTIN_PM_STEP_IDS: ReadonlySet<string> = new Set(BUILTIN_PM_FLOW_STEPS);

/**
 * One PM-flow step: the built-in `derive` id binds the PM ladder and names no
 * turn fields; a non-built-in id names its prompt and alias.
 */
export const pmFlowStepSchema = z
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
    repairPrompt: z.string().min(1).optional(),
    unfinishedPrompt: z.string().min(1).optional(),
    deliverable: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (step) =>
      !BUILTIN_PM_STEP_IDS.has(step.id) ||
      (step.prompt === undefined &&
        step.alias === undefined &&
        step.repairPrompt === undefined &&
        step.unfinishedPrompt === undefined &&
        step.deliverable === undefined),
    {
      message:
        "the built-in PM step `derive` cannot name a prompt, alias, repair prompt, unfinished prompt or deliverable",
      path: ["id"],
    },
  )
  .refine(
    (step) =>
      BUILTIN_PM_STEP_IDS.has(step.id) ||
      (step.prompt !== undefined && step.alias !== undefined),
    {
      message: "a non-built-in PM flow step needs a prompt and an alias",
      path: ["prompt"],
    },
  );

/** The PM flow: one derive step, with config-only turns before or after it. */
export const pmSchema = z
  .object({
    steps: z.array(pmFlowStepSchema).min(1),
  })
  .strict()
  .refine(
    (pm) => {
      const ids = pm.steps.map((step) => step.id);
      return new Set(ids).size === ids.length;
    },
    {
      message: "the PM flow's steps must not repeat a step id",
      path: ["steps"],
    },
  )
  .refine(
    (pm) => pm.steps.filter((step) => step.id === "derive").length === 1,
    {
      message: 'the PM flow must name exactly one "derive" step',
      path: ["steps"],
    },
  );

export const DEFAULT_PM_FLOW = { steps: DEFAULT_PM_FLOW_STEPS };
