/**
 * One iteration's phases: prepare the resume, post the resume evidence, run the
 * front or resume front, the boundary turn, dispatch, the front-path stop and
 * the iteration facts that decide whether the launch continues.
 */
import { runBoundary } from "./boundary.js";
import { formatCause, makeCause } from "./cause.js";
import { derive } from "./derive.js";
import { postLaunchDigest } from "./digest.js";
import { runDispatch } from "./dispatch.js";
import { readFrontClass } from "./flow-context.js";
import { type FrontResult, runFront } from "./front.js";
import { runBoundaryTurn } from "./integration-lock.js";
import {
  infraCause,
  openTasks,
  recordFrontStop,
  statusForIteration,
  unfinishedTasks,
  writeIterationFacts,
} from "./launch-facts.js";
import {
  architectRouteWaiting,
  interruptedRelaunch,
  processedSteers,
  resumeGate,
} from "./launch-resume.js";
import type { GoalRun, IterationRun } from "./launch-run.js";
import { type Hold, scanInbox, sweepHolds } from "./mailbox.js";
import { runSteerPm } from "./pm.js";
import { scriptMeta } from "./record.js";
import { RESUME_REFUSED_STEP, RESUME_STEP } from "./resume.js";
import type { State } from "./types.js";

export async function prepareIteration(
  run: GoalRun,
  before: State,
): Promise<IterationRun> {
  const recordsBefore = await run.store.listRecords();
  let resume =
    before.interrupted && run.loopIndex === 0 && !run.resumeForcedOff;
  let resumeHolds: Hold[] = [];
  if (resume) {
    const gate = await resumeGate(run.runtime, before, recordsBefore);
    resumeHolds = gate.holds;
    if (gate.refusal !== undefined) {
      resume = false;
      await run.store.appendRecord(
        scriptMeta(before.iteration, RESUME_REFUSED_STEP),
        { ok: false, cause: makeCause("resume", gate.refusal) },
      );
    }
  }
  const iteration = resume ? before.iteration : before.iteration + 1;
  if (resume) {
    const attempt =
      recordsBefore.filter(
        (r) => r.iteration === iteration && r.step === RESUME_STEP,
      ).length + 1;
    await run.store.appendRecord(scriptMeta(iteration, RESUME_STEP), {
      ok: true,
      outcome: {
        status: "done",
        summary: `resume attempt ${attempt} of iteration ${iteration}`,
        concerns: [],
        forward: [],
      },
    });
  }
  await run.store.sweepTasks(iteration);
  await sweepHolds(run.store, iteration, Object.keys(before.tasks));
  return {
    run,
    before,
    recordsBefore,
    resume,
    resumeHolds,
    iteration,
    digestSteer: null,
    front: { action: "dispatch" },
    decision: "continue",
    seenSteers: [],
    processedBefore: 0,
    humanInterventions: 0,
    frontFinished: false,
  };
}

/**
 * A clean resume skips the architect turn but not the digest: the digest is
 * delivered to the PM as a steer, and that one turn routes the evidence and
 * any repair it warrants before dispatch. A relaunch that recovered an
 * interrupted turn continues that turn instead, so it runs no digest and
 * posts nothing to the PM.
 */
async function runResumeEvidence(it: IterationRun): Promise<void> {
  if (interruptedRelaunch(it.run)) return;
  const { runtime, store } = it.run;
  it.digestSteer = await runBoundaryTurn(
    runtime,
    { iteration: it.iteration, step: "digest" },
    async () =>
      postLaunchDigest(runtime, it.iteration, await store.listRecords()),
  );
  if (!it.digestSteer) return;
  const steer = it.digestSteer;
  const tasks = await store.listTasks();
  it.resumeSteerPm = await runBoundaryTurn(
    runtime,
    { iteration: it.iteration, step: "pm" },
    async () =>
      runSteerPm(runtime, {
        iteration: it.iteration,
        state: derive(
          tasks,
          await store.listRecords(),
          runtime.configs.process.flows,
        ),
        tasks,
        steers: [steer],
        cwd: runtime.paths.goalCheckout,
      }),
  );
}

/**
 * A resume has no front turn. The architect is the only consumer of an
 * architect route or an underivable finding, so that is the one case where
 * dispatch must not be forced: the boundary runs first in the same iteration.
 */
async function resumeFront(it: IterationRun): Promise<FrontResult> {
  const boundaryWaiting =
    it.resumeSteerPm?.status === "architect" ||
    (await architectRouteWaiting(it.run.store));
  return { action: boundaryWaiting ? "boundary" : "dispatch" };
}

/** A front turn's stop is final for the launch: record its decision and report it. */
async function runFrontTurn(it: IterationRun): Promise<FrontResult> {
  const { runtime, store } = it.run;
  const front = await runBoundaryTurn(
    runtime,
    { iteration: it.iteration, step: "front" },
    () => runFront(runtime, { iteration: it.iteration, state: it.before }),
  );
  if (front.action === "blocked") {
    const cause = `front turn ended the launch as blocked: ${
      front.cause ?? "unknown cause"
    }`;
    await recordFrontStop(store, it.iteration, "blocked", cause);
    it.lastSummary = await writeIterationFacts(
      runtime,
      it.iteration,
      "blocked-by-user",
      0,
      makeCause("boundary", cause),
    );
    it.stopCause = makeCause("boundary", cause);
  }
  if (front.action === "infra") {
    const cause = `front turn ended the launch as infra: ${
      front.cause ?? "unknown cause"
    }; relaunch to retry`;
    it.lastSummary = await writeIterationFacts(
      runtime,
      it.iteration,
      "stopped-with-debt",
      0,
      makeCause("boundary", cause),
    );
    it.ended = "infra";
    it.stopCause = makeCause("boundary", cause);
  }
  return front;
}

/** The architect turn, when the front sent the iteration to the boundary. */
async function runBoundaryStage(it: IterationRun): Promise<void> {
  if (it.front.action !== "boundary") return;
  const { runtime } = it.run;
  it.boundary = await runBoundary(runtime, {
    relaunch:
      it.run.relaunch && it.run.loopIndex === 0 && !it.run.resumeForcedOff,
    // A clean resume already wrote this iteration's digest and posted it as a
    // steer; an interrupt relaunch runs none at all. Either way a second
    // scout turn would duplicate or invent evidence.
    ...(it.resume || interruptedRelaunch(it.run) ? { digest: false } : {}),
    iteration: it.iteration,
    frontPack: it.front.packPath,
    runConfigPath: runtime.configs.files?.run,
  });
  it.iteration = it.boundary.iteration;
  it.decision = it.boundary.decision;
  it.seenSteers = it.boundary.seenSteers;
  if (it.boundary.stop) {
    it.ended = "infra";
    it.stopCause = makeCause(
      "boundary",
      `infrastructure stop during iteration ${it.iteration}: ${infraCause(it.boundary.stop)}; relaunch to retry`,
    );
  }
}

/** Dispatch, when the boundary did not decide and nothing stopped the launch. */
async function runDispatchStage(it: IterationRun): Promise<void> {
  if (
    it.decision !== "continue" ||
    it.ended !== undefined ||
    it.run.signals.shouldStop()
  )
    return;
  it.dispatched = await runDispatch(it.run.runtime, {
    iteration: it.iteration,
    seenSteers: it.seenSteers,
    signals: it.run.signals,
  });
  it.dispatchCause = it.dispatched.cause;
  if (it.dispatched.reason !== "infra" && it.dispatched.reason !== "cancelled")
    return;
  it.ended = it.dispatched.reason;
  if (it.dispatched.reason !== "infra") return;
  it.dispatchCause = makeCause(
    "boundary",
    `infrastructure stop during iteration ${it.iteration}: ${
      it.dispatched.cause ? formatCause(it.dispatched.cause) : "unknown cause"
    }; relaunch to retry`,
  );
  it.stopCause = it.dispatchCause;
}

/**
 * Only steers the dying pass already claimed stay seen: architect-seen (a
 * presented/unanswered record) or PM-claimed (a hold file). Anything else in
 * the inbox never reached either consumer, so dispatch must give it its PM
 * steer turn instead of dropping it as already read.
 */
async function resumeSeenSteers(it: IterationRun): Promise<string[]> {
  const inbox = await scanInbox(it.run.store);
  const holdSteers = new Set(it.resumeHolds.map((h) => h.steer));
  const presented = new Set<string>();
  for (const rec of it.recordsBefore) {
    if (
      (rec.step === "steer-presented" || rec.step === "steer-unanswered") &&
      rec.slug
    )
      presented.add(rec.slug);
  }
  const seen = inbox
    .filter((s) => holdSteers.has(s.id) || presented.has(s.id))
    .map((s) => s.id);
  // The digest steer was just claimed by the resume PM turn; dispatch must not
  // hand it a second PM turn.
  if (it.digestSteer) seen.push(it.digestSteer.id);
  return seen;
}

/** A front path that landed records its own stop; an upscope keeps the goal active. */
async function finishFront(it: IterationRun): Promise<boolean> {
  if (
    it.resume ||
    it.front.action !== "dispatch" ||
    it.dispatched?.reason !== "boundary"
  )
    return false;
  const { runtime, store } = it.run;
  let escalated = false;
  try {
    escalated = readFrontClass(runtime)?.class === "bigger";
  } catch {
    escalated = false;
  }
  // An upscope escalation rewrote the class mid-dispatch: the goal stays active
  // so the next launch runs the architect instead of stopping here.
  if (!escalated) {
    const afterDispatch = derive(
      await store.listTasks(),
      await store.listRecords(),
      runtime.configs.process.flows,
    );
    const unfinished = unfinishedTasks(afterDispatch);
    const landed =
      Object.keys(afterDispatch.tasks).length > 0 && unfinished.length === 0;
    await recordFrontStop(
      store,
      it.iteration,
      landed ? "done" : "blocked",
      landed
        ? `front path landed every task in iteration ${it.iteration}`
        : `front path stopped with ${unfinished.join(", ")} in iteration ${it.iteration}`,
    );
  }
  return true;
}

/** True when a resumed dispatch left non-terminal work behind: the boundary must run next. */
function settledResume(it: IterationRun, after: State): boolean {
  if (!it.resume || it.boundary !== undefined || it.dispatched === undefined)
    return false;
  const everyLanded = Object.values(after.tasks).every(
    (task) =>
      task.status === "merged" ||
      task.status === "finished" ||
      task.status === "cancelled",
  );
  return (
    it.dispatched.taskTurnsStarted === 0 ||
    it.dispatched.planCheck === "architect" ||
    (it.dispatched.reason === "boundary" && everyLanded)
  );
}

/**
 * Writes the iteration's facts and decides whether the launch continues. A
 * resume that ran no boundary and started no task turn is not a pass: give the
 * budget back and make the next loop run the boundary.
 */
async function settleIteration(
  it: IterationRun,
): Promise<"continue" | "stop" | "giveBack"> {
  const { runtime, store, signals } = it.run;
  const afterStop = derive(
    await store.listTasks(),
    await store.listRecords(),
    runtime.configs.process.flows,
  );
  const stopped = it.ended !== undefined;
  const status = statusForIteration({
    decision: it.decision,
    ended: it.ended,
    stopped,
    signalsStopped: signals.shouldStop(),
    goal: afterStop.goal,
  });
  // A resumed iteration that ends at the boundary has no architect turn to
  // hand the stuck state to in this iteration; the cause travels in the
  // summary the next iteration's architect reads in its pack.
  const open = it.resume ? openTasks(afterStop) : [];
  const stuckCause =
    it.dispatched?.reason === "boundary" && open.length > 0
      ? makeCause(
          "stuck",
          `resumed iteration ${it.iteration}: nothing dispatchable, non-terminal work remains: ${open.join(", ")}`,
        )
      : undefined;
  it.lastSummary = await writeIterationFacts(
    runtime,
    it.iteration,
    status,
    it.humanInterventions,
    it.boundary?.cause
      ? makeCause("boundary", it.boundary.cause)
      : (it.dispatchCause ?? stuckCause),
  );
  it.run.lastSummary = it.lastSummary;
  it.run.ended = it.ended;
  it.run.stopCause = it.stopCause;
  if (it.decision !== "continue" || stopped || signals.shouldStop())
    return "stop";
  if (it.frontFinished) return "stop";
  if (!settledResume(it, afterStop)) return "continue";
  // An empty, architect-summoning, or fully landed resume that ran no boundary
  // is not a pass: give the budget back and go straight to the boundary. A
  // resume that did rule already made this iteration's progress, so it keeps
  // the pass and never loops back into a consult.
  it.run.resumeForcedOff = true;
  return "giveBack";
}

/** One iteration: resume evidence, front, boundary, dispatch, facts. */
export async function runIteration(
  it: IterationRun,
): Promise<"continue" | "stop" | "giveBack"> {
  if (it.resume) await runResumeEvidence(it);
  it.processedBefore = await processedSteers(it.run.store);
  it.front = it.resume ? await resumeFront(it) : await runFrontTurn(it);
  if (it.front.action === "blocked" || it.front.action === "infra")
    return stopIteration(it);
  if (it.resume) it.seenSteers = await resumeSeenSteers(it);
  await runBoundaryStage(it);
  it.run.iterations += 1;
  await runDispatchStage(it);
  it.humanInterventions = Math.max(
    0,
    (await processedSteers(it.run.store)) - it.processedBefore,
  );
  it.frontFinished = await finishFront(it);
  return settleIteration(it);
}

function stopIteration(it: IterationRun): "stop" {
  it.run.lastSummary = it.lastSummary;
  it.run.ended = it.ended;
  it.run.stopCause = it.stopCause;
  return "stop";
}
