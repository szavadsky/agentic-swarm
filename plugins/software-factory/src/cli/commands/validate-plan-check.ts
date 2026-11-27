/** Plan-check deliverable validation: follow-up slugs in the plans, concern ids open. */

import fs from "node:fs";
import path from "node:path";
import { openConcernIds } from "../../kernel/context-pack.js";
import { validatePlanCheck } from "../../kernel/plan-check.js";
import { existingPlans, registeredPlans } from "../../kernel/plan-file.js";
import { createFolderStore, recordDirName } from "../../kernel/store.js";
import type { Outcome, ProcessConfig } from "../../kernel/types.js";

/**
 * The plans a record outcome was delivered against. Records live at
 * `<goal>/records/<record>/outcome.yaml`; the goal plan's register names every
 * active plan. A file outside a goal layout has no plan to check against.
 */
function recordPlans(abs: string): string[] {
  const recordDir = path.dirname(abs);
  const goalDir = path.dirname(path.dirname(recordDir));
  return existingPlans(registeredPlans(goalDir)).map((plan) =>
    fs.readFileSync(plan.path, "utf8"),
  );
}

/**
 * The open concern ids the records beside an outcome carry, so a checker's
 * `planCheck.concerns` names a concern that exists. Outside a goal's record
 * tree there is nothing to resolve against, so the check is skipped.
 */
async function recordOpenConcernIds(
  abs: string,
  process: ProcessConfig,
): Promise<Set<string> | undefined> {
  const recordsDir = path.dirname(path.dirname(abs));
  if (path.basename(recordsDir) !== "records") return undefined;
  const store = createFolderStore(
    path.dirname(recordsDir),
    undefined,
    process.taskTypes ?? {},
  );
  const [records, tasks] = await Promise.all([
    store.listRecords(),
    store.listTasks(),
  ]);
  // The outcome being validated is the tree's own; its answers are the
  // proposal, not a resolution of the concerns it names.
  const current = path.basename(path.dirname(abs));
  return openConcernIds(
    records.filter((record) => recordDirName(record.seq, record) !== current),
    tasks,
  );
}

/** The plan-check delivery's findings; an outcome outside a goal has no plan to check. */
export async function planCheckFindings(
  abs: string,
  outcome: Outcome,
  process: ProcessConfig,
): Promise<string[]> {
  const plans = recordPlans(abs);
  if (plans.length === 0) return [];
  const open =
    (outcome.planCheck?.concerns?.length ?? 0) > 0
      ? await recordOpenConcernIds(abs, process)
      : undefined;
  return validatePlanCheck(plans, outcome, open);
}
