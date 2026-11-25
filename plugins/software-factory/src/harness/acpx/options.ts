/**
 * The two harness-entry `options` keys the acpx adapter reads. Every other key
 * stays opaque to the adapter and to pre-flight, which checks these shapes
 * before an adapter is constructed.
 */

import type { AcpxOptionProblem } from "./types.js";

export type { AcpxOptionProblem } from "./types.js";

/** `typeof` for scalar shapes; arrays report themselves rather than "object". */
function shapeOf(value: unknown): string {
  if (value === null) return "null";
  return Array.isArray(value) ? "array" : typeof value;
}

/** The entry's `args`: a string list, or absent. A scalar would spread per character into argv. */
function argsProblem(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return undefined;
  }
  const got = Array.isArray(value)
    ? "array with non-string entries"
    : shapeOf(value);
  return `Invalid "args" option: expected string array, got ${got}`;
}

/** The entry's `env`: a string-to-string record, or absent; other values cannot reach the child env. */
function envProblem(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === "string")
  ) {
    return undefined;
  }
  const got = Array.isArray(value)
    ? "array"
    : value !== null && typeof value === "object"
      ? "object with non-string values"
      : shapeOf(value);
  return `Invalid "env" option: expected string-to-string object, got ${got}`;
}

/** Shape problems in the keys the adapter reads; other option keys stay opaque. */
export function acpxOptionProblems(
  options: Record<string, unknown> | undefined,
): AcpxOptionProblem[] {
  const problems: AcpxOptionProblem[] = [];
  const args = argsProblem(options?.args);
  if (args) problems.push({ key: "args", message: args });
  const env = envProblem(options?.env);
  if (env) problems.push({ key: "env", message: env });
  return problems;
}

/** The validated `args` list; throws when the shape is wrong. */
export function acpxArgs(value: unknown): string[] | undefined {
  const problem = argsProblem(value);
  if (problem) throw new Error(problem);
  return value as string[] | undefined;
}

/** The validated `env` map; throws when the shape is wrong. */
export function acpxEnv(value: unknown): Record<string, string> | undefined {
  const problem = envProblem(value);
  if (problem) throw new Error(problem);
  return value as Record<string, string> | undefined;
}
