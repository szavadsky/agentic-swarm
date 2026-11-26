/** `factory records`: read-only queries over a goal's append-only step records. */

import fs from "node:fs";
import path from "node:path";
import { loadConfigs, resolveGoalPaths } from "../../kernel/config.js";
import { DEFAULT_ROLE_BY_STEP, rolesByStep } from "../../kernel/metrics.js";
import { createArtifactStore } from "../../kernel/store-backend.js";
import type { StepRecord } from "../../kernel/types.js";
import { causeKindSchema } from "../../kernel/types/state.js";
import type { RecordQuery } from "./types.js";

/** The role a step ran as: its flow prompt, the built-in map, or its step id. */
function roleOf(
  record: StepRecord,
  roleByStep: Record<string, string>,
): string {
  return roleByStep[record.step] ?? record.step;
}

function causeFilter(value: string): string {
  const parsed = causeKindSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new Error(
    `--cause "${value}" is not a cause kind; expected one of: ${causeKindSchema.options.join(", ")}`,
  );
}

/** Reads the goal's records and keeps those every given filter matches. */
export async function queryRecords(
  repo: string,
  goal: string,
  query: RecordQuery = {},
): Promise<StepRecord[]> {
  const cause =
    query.cause === undefined ? undefined : causeFilter(query.cause);
  const repoRoot = path.resolve(repo);
  const configs = loadConfigs(repoRoot);
  const paths = resolveGoalPaths(configs, repoRoot, goal);
  if (!fs.existsSync(paths.goalDir))
    throw new Error(`goal "${goal}" has no directory at ${paths.goalDir}`);
  const store = createArtifactStore(paths, configs.process.taskTypes);
  const roleByStep = {
    ...DEFAULT_ROLE_BY_STEP,
    ...rolesByStep(configs.process.flows),
  };
  // listRecords keeps append order, including a record whose turn is unfinished.
  return (await store.listRecords()).filter(
    (record) =>
      (query.step === undefined || record.step === query.step) &&
      (query.role === undefined || roleOf(record, roleByStep) === query.role) &&
      (cause === undefined || record.cause?.kind === cause) &&
      (query.iteration === undefined || record.iteration === query.iteration),
  );
}
