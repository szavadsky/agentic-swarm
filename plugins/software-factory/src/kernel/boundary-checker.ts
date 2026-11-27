/**
 * The boundary's plan-checker pass: the goal's check plus, at hierarchy depth
 * 2, one check per active epic bottom-to-top. Each round either resumes
 * dispatch through its follow-up PM or leaves the consult to the architect.
 */
import { boundaryPassPlan } from "./boundary-context.js";
import { boundaryResult } from "./boundary-state.js";
import type { ConsultContext } from "./boundary-types.js";
import { runBoundaryTurn } from "./integration-lock.js";
import {
  consultGate,
  PLAN_CHECK_STEP,
  runPlanCheckRound,
} from "./plan-check.js";

/** The next round number for one checker scope in this iteration. */
function checkerRound(
  context: ConsultContext,
  architect: string | undefined,
): number {
  return (
    context.records.filter(
      (record) =>
        record.iteration === context.iteration &&
        record.actor === "agent" &&
        record.step === PLAN_CHECK_STEP &&
        record.architect === architect &&
        record.endedAt,
    ).length + 1
  );
}

/** The result a closed checker round sends the iteration, or undefined to continue. */
function checkedResult(
  context: ConsultContext,
  checked: Awaited<ReturnType<typeof runPlanCheckRound>>,
): ReturnType<typeof boundaryResult> | undefined {
  if (checked.status === "architect") {
    return boundaryResult(context, "continue", {
      cause: `PM ladder routed to the architect: ${checked.findings.join("; ")}`,
    });
  }
  if (checked.continued.length > 0) return boundaryResult(context, "continue");
  return undefined;
}

/** One checker turn in the goal's or one epic's scope. */
async function runCheckerRound(
  context: ConsultContext,
  architect: string | undefined,
) {
  const { runtime } = context;
  // `planCheckRounds` bounds the rounds one scope owns, wherever they ran.
  const round = checkerRound(context, architect);
  return runBoundaryTurn(
    runtime,
    { iteration: context.iteration, step: PLAN_CHECK_STEP },
    () =>
      runPlanCheckRound(runtime, {
        iteration: context.iteration,
        round,
        state: context.state,
        ...(architect ? { epic: architect } : {}),
      }),
  );
}

/**
 * The plan checker runs before the architect; a follow-up skips the consult.
 * Depth 2 checks bottom-to-top: every active epic's plan and tasks, then the
 * goal over every plan. Each epic check records that epic as its architect, so
 * a later consult still recognizes the goal's own check.
 */
export async function runChecker(
  context: ConsultContext,
): Promise<ReturnType<typeof boundaryResult> | undefined> {
  const { runtime } = context;
  const plan = await runtime.store.plans.exists();
  // Each scope owns its `planCheckRounds` budget: an epic that spent its
  // rounds is skipped here instead of starving the top turn, and the goal
  // check still runs on its own budget.
  const gate = (architect?: string) =>
    consultGate({
      plan,
      records: context.records,
      bound: runtime.limits.planCheckRounds,
      ...(architect ? { architect } : {}),
    });
  const passPlan = boundaryPassPlan({
    plan: context.plan,
    depth: runtime.configs.process.hierarchy?.depth ?? 1,
    tasks: context.tasks,
    state: context.state,
    records: context.records,
  });
  for (const row of passPlan.checkerEpics) {
    if (gate(row.epic) !== "check") continue;
    const result = checkedResult(
      context,
      await runCheckerRound(context, row.epic),
    );
    if (result) return result;
  }
  if (gate() !== "check") return undefined;
  return checkedResult(context, await runCheckerRound(context, undefined));
}
