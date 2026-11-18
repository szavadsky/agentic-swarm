import type { z } from "zod";
import {
  type Outcome,
  outcomeSchema,
  type TaskFile,
  type TaskTypeDefinition,
} from "./types.js";

/**
 * The kernel's fixed output schemas. A task type names one of these; it never
 * supplies its own. Adding a schema here is a kernel change, and every task
 * type already names only names from this registry (pre-flight refuses others).
 */
export const OUTCOME_SCHEMAS = {
  outcome: outcomeSchema,
} as const;

export function outcomeSchemaFor(name: string): z.ZodType<Outcome> | undefined {
  if (!Object.hasOwn(OUTCOME_SCHEMAS, name)) return undefined;
  return OUTCOME_SCHEMAS[name as keyof typeof OUTCOME_SCHEMAS];
}

/** Known schema names for findings that name the accepted set. */
export function outcomeSchemaNames(): string {
  return Object.keys(OUTCOME_SCHEMAS).join(", ");
}

/**
 * The schema a task's turns deliver: the type's named schema, or the kernel
 * outcome schema for a legacy file that names no type.
 */
export function taskOutcomeSchema(
  task: TaskFile,
  taskTypes: Record<string, TaskTypeDefinition> = {},
): z.ZodType<Outcome> {
  if (task.type === undefined) return outcomeSchema;
  const definition = Object.hasOwn(taskTypes, task.type)
    ? taskTypes[task.type]
    : undefined;
  if (!definition) {
    throw new Error(
      `task "${task.slug}" has type "${task.type}": type "${task.type}" is not configured`,
    );
  }
  const schema = outcomeSchemaFor(definition.schema);
  if (!schema) {
    throw new Error(
      `task "${task.slug}" type "${task.type}" names schema "${definition.schema}": not a kernel outcome schema (${outcomeSchemaNames()})`,
    );
  }
  return schema;
}
