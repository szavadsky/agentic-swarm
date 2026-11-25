/**
 * The schema-enforced file checks: `factory validate` and the schema-validation
 * gate read this one list, so both agree on what is invalid. The config checks
 * a launch and `validate` share are the kernel's non-model list.
 */

import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import type { ZodType } from "zod";
import {
  ConfigError,
  loadRunConfig,
  processOverrideSchema,
  repoConfigSchema,
} from "../../kernel/config.js";
import { issueText } from "../../kernel/findings.js";
import { classSchema } from "../../kernel/flow-context.js";
import { infraSchema } from "../../kernel/infra.js";
import { holdFileSchema } from "../../kernel/mailbox.js";
import { parseOutcome } from "../../kernel/outcome.js";
import {
  parseTaskFile,
  validateTaskFlows,
  validateTaskGraph,
} from "../../kernel/tasks.js";
import type { FlowDefinition, TaskTypeDefinition } from "../../kernel/types.js";
import type { FileCheckInput, TaskDirFindings, ValidateKind } from "./types.js";

/** The file kinds `factory validate` recognizes, as the unknown-kind message lists them. */
export const KNOWN_VALIDATE_KINDS =
  "tasks/*.md, holds/*.yaml, class.yaml, outcome.yaml, repo.yaml, run.yaml, process.yaml, infra.yaml";

const KIND_BY_BASENAME = Object.fromEntries(
  (["class", "outcome", "repo", "run", "process", "infra"] as const).flatMap(
    (kind) =>
      [
        [`${kind}.yaml`, kind],
        [`${kind}.yml`, kind],
      ] as const,
  ),
);

/** The kind a path names, or null when the path names no schema-enforced file. */
export function inferValidateKind(absPath: string): ValidateKind | null {
  const base = path.basename(absPath);
  const named = KIND_BY_BASENAME[base];
  if (named) return named;
  const segments = absPath.split(path.sep);
  if (segments.includes("holds") && /\.ya?ml$/i.test(base)) return "hold";
  if (segments.includes("tasks") && base.endsWith(".md")) return "task";
  return null;
}

/** One YAML file against a schema, as the `file: path: message` lines both readers print. */
export function schemaFindings(
  text: string,
  file: string,
  schema: ZodType<unknown>,
): string[] {
  let raw: unknown;
  try {
    raw = yaml.parse(text);
  } catch (err) {
    return [`${file}: invalid YAML: ${(err as Error).message}`];
  }
  const result = schema.safeParse(raw ?? {});
  if (result.success) return [];
  return result.error.issues.map((issue) => `${file}: ${issueText(issue)}`);
}

/**
 * A hold file's shape, in the one message `readHolds` also reports: the schemas
 * that stand for it are unions whose zod detail names no operator action.
 */
function holdFindings(text: string, file: string): string[] {
  let raw: unknown;
  try {
    raw = yaml.parse(text);
  } catch (err) {
    return [`${file}: not valid YAML: ${(err as Error).message}`];
  }
  return holdFileSchema.safeParse(raw).success
    ? []
    : [`${file}: must be { slugs: string[], goal: boolean }`];
}

/** A run config through its `extends` chain: its findings already name the file that owns each key. */
export function runConfigFindings(file: string): string[] {
  try {
    loadRunConfig(file);
    return [];
  } catch (err) {
    return err instanceof ConfigError
      ? err.findings.map((f) => `${f.file}: ${f.key}: ${f.message}`)
      : [`${file}: ${(err as Error).message}`];
  }
}

/** An outcome as the kernel parses it; a step's expectation stays with `validate`. */
function outcomeFindings(text: string, file: string): string[] {
  try {
    parseOutcome(text);
    return [];
  } catch (err) {
    return [`${file}: ${(err as Error).message}`];
  }
}

/**
 * A directory's task files, as the gate groups them: sibling tasks load
 * together, so one malformed file does not hide a dependency finding, and a
 * missing or cyclic dependency reads as a finding, not a crash. Flow existence
 * is a config check `validate` adds; a tree walk stops at the graph. `checked`
 * counts the files that parsed, which is the gate's valid-file summary.
 */
export async function taskDirFindings(
  dir: string,
  taskTypes: Record<string, TaskTypeDefinition>,
  flows?: Record<string, FlowDefinition>,
): Promise<TaskDirFindings> {
  const names = (await fs.promises.readdir(dir))
    .filter((name) => name.endsWith(".md"))
    .sort();
  const tasks: Parameters<typeof validateTaskGraph>[0] = [];
  const findings: string[] = [];
  let checked = 0;
  for (const name of names) {
    const file = path.join(dir, name);
    try {
      tasks.push(
        parseTaskFile(
          await fs.promises.readFile(file, "utf8"),
          path.basename(name, ".md"),
          taskTypes,
        ),
      );
      checked += 1;
    } catch (err) {
      findings.push(`${file}: ${(err as Error).message}`);
    }
  }
  for (const finding of validateTaskGraph(tasks)) {
    findings.push(`${dir}: ${finding}`);
  }
  if (flows) {
    for (const finding of validateTaskFlows(tasks, flows)) {
      findings.push(`${dir}: ${finding}`);
    }
  }
  return { findings, checked };
}

/** One kind's check, the same one `validate` runs and the gate walks. */
type FileCheck = (input: FileCheckInput) => Promise<string[]> | string[];

const FILE_CHECKS: Record<ValidateKind, FileCheck> = {
  task: ({ file, process, flows }) => {
    const config = process();
    return taskDirFindings(
      path.dirname(file),
      config.taskTypes,
      flows ? config.flows : undefined,
    ).then((result) => result.findings);
  },
  class: ({ file, text }) => schemaFindings(text, file, classSchema),
  outcome: ({ file, text }) => outcomeFindings(text, file),
  hold: ({ file, text }) => holdFindings(text, file),
  repo: ({ file, text }) => schemaFindings(text, file, repoConfigSchema),
  run: ({ file }) => runConfigFindings(file),
  process: ({ file, text }) =>
    schemaFindings(text, file, processOverrideSchema),
  infra: ({ file, text }) => schemaFindings(text, file, infraSchema),
};

/** Every finding one schema-enforced file has; empty means the file is valid. */
export async function fileFindings(input: FileCheckInput): Promise<string[]> {
  return await FILE_CHECKS[input.kind](input);
}
