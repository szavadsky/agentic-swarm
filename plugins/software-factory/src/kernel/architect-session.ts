import { createHash } from "node:crypto";
import fs from "node:fs";
import type { SessionRef } from "../harness/types.js";
import type { TurnTarget } from "./flow-context.js";
import { resumableRef } from "./sessions.js";
import { MAIN_ARCHITECT } from "./tasks.js";
import type { KernelRuntime, Outcome, StepRecord } from "./types.js";

/**
 * The pre-turn plan bytes, hashed. Null when the plan is missing or unreadable
 * before the turn, so a turn that creates it counts as an edit.
 */
export function snapshotPlan(planPath: string | undefined): string | null {
  if (!planPath) return null;
  try {
    return createHash("sha256").update(fs.readFileSync(planPath)).digest("hex");
  } catch {
    return null;
  }
}

/**
 * The boundary blocks a continue with no plan edit on disk; the delivery guard
 * moves that failure into the turn so one repair ask can still deliver it.
 * Done and blocked stop the goal and need no plan. The snapshot is taken once
 * before the first attempt, so the repair turn compares against the pre-turn
 * plan: an edit or a newly created plan delivers, a byte-identical plan fails.
 * The boundary's post-turn check calls this same rule as a backstop for a
 * halted turn that kept its continue decision.
 */
export function missingPlanFinding(
  planPath: string | undefined,
  decision: Outcome["decision"],
  beforeHash: string | null,
  who = "architect",
): string | null {
  if (decision !== "continue") return null;
  if (!planPath) return null;
  const afterHash = snapshotPlan(planPath);
  if (afterHash === null) {
    return (
      `${who} continued but ${planPath} does not exist; ` +
      "the deliverable is a plan edit or a stop decision"
    );
  }
  if (afterHash === beforeHash) {
    return (
      `${who} continued but ${planPath} is unchanged since the turn started; ` +
      "the deliverable is a plan edit or a stop decision"
    );
  }
  return null;
}

/**
 * The boundary records that own a plan scope: the main architect's `architect`
 * turn, or one epic's `subarchitect` consult. The plan-review return continues
 * its plan's owner, so this selects exactly what that owner's own turn resumes;
 * two subarchitects never resume each other and an epic never the main one.
 */
export function planOwnerSelector(
  architect: string | undefined,
): (record: StepRecord) => boolean {
  const owner = architect ?? MAIN_ARCHITECT;
  return owner === MAIN_ARCHITECT
    ? (record) => record.step === "architect"
    : (record) => record.step === "subarchitect" && record.architect === owner;
}

/**
 * The session ref is re-derived from the last record the selector names, never
 * kept in memory: a relaunch reads it off disk. A first turn has no prior and
 * starts de novo silently; a prior that cannot be resumed is logged naming the
 * turn and the blocker, then the turn starts de novo. Resume is cwd- and
 * model-bound, and only when the harness says it can and the run config's
 * portability graph admits the recorded harness's session.
 */
export async function resumableSession(
  runtime: KernelRuntime,
  records: readonly StepRecord[],
  select: (record: StepRecord) => boolean,
  target: Pick<TurnTarget, "harness" | "model">,
  who: string,
): Promise<SessionRef | undefined> {
  const last = records
    .filter((r) => select(r) && r.session && r.endedAt)
    .sort((a, b) => a.seq - b.seq)
    .at(-1);
  if (!last?.session) return undefined;
  return resumableRef(runtime, last.session, target, who);
}
