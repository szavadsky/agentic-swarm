import { commitAll } from "../core/git/commit.js";
import { runAgentTurn } from "./agent.js";
import { preexistingRed, recordedBaseGates } from "./baseline.js";
import { runGates } from "./gates.js";
import { mergeTask, type MergeResult } from "./integrate.js";
import {
  appendChecks,
  appendCommit,
  appendDebt,
  appendFinish,
  appendPark,
  scriptMeta,
} from "./record.js";
import { materialHash } from "./tasks.js";
import {
  containmentSnapshot,
  containmentViolation,
  ensureTaskWorktree,
  headSha,
  treeSha,
} from "./worktree.js";
import {
  checksDue,
  compactSession,
  findStep,
  firstBase,
  flowOf,
  followUpSession,
  frontSessionFor,
  isFixTurn,
  promptVars,
  stepTarget,
} from "./flow-context.js";
import type {
  Action,
  FlowDefinition,
  FlowStep,
  KernelRuntime,
  RecordEnd,
  StepRecord,
  TaskFile,
  TaskState,
} from "./types.js";

export interface TaskActionResult {
  infra?: { kind: "infra"; cause: string };
  cancelled?: boolean;
}

/** Mechanical commit, recorded with its tree for no-progress history. */
async function commitStep(
  runtime: KernelRuntime,
  meta: { iteration: number; slug: string; round: number },
  cwd: string,
  message: string
): Promise<RecordEnd> {
  await commitAll(runtime.repo, cwd, message);
  const commit = await headSha(cwd);
  const tree = await treeSha(cwd);
  await appendCommit(runtime.store, meta, commit, tree);
  return { commit, tree };
}

function parkCause(status: string, summary: string | undefined): string {
  return `${status}: ${summary ?? "no summary"}`;
}

async function handleStepResult(
  runtime: KernelRuntime,
  task: TaskFile,
  step: FlowStep,
  state: TaskState,
  flow: FlowDefinition,
  iteration: number,
  worktree: string,
  preexisting: ReadonlySet<string>,
  stop: StepRecord["stop"],
  outcome: StepRecord["outcome"]
): Promise<TaskActionResult> {
  if (stop?.kind === "infra") {
    // The classifier already scrubbed and capped `details`; append it verbatim
    // so the operator sees the provider error behind a bare cause like "auth".
    const cause = stop.details ? `${stop.cause}: ${stop.details}` : stop.cause;
    return { infra: { kind: "infra", cause } };
  }
  if (stop?.kind === "cancelled") return { cancelled: true };
  if (stop?.kind === "truncated") return {};
  const meta = { iteration, slug: task.slug, round: state.round };
  if (stop?.kind === "refusal") {
    await appendPark(runtime.store, meta, `refused: ${stop.details ?? "no details"}`);
    return {};
  }
  const status = outcome?.status;
  if (status === "blocked" || status === "failed" || status === "upscope") {
    await appendPark(runtime.store, meta, parkCause(status, outcome?.summary));
    return {};
  }
  if (step.review) {
    const lastRound = state.round >= flow.reviewRounds;
    if (outcome?.verdict === "reject") {
      await appendPark(runtime.store, meta, `review rejected: ${outcome.summary}`);
    } else if (lastRound && outcome?.verdict === "changes") {
      await appendDebt(runtime.store, meta, outcome.concerns, outcome.summary);
    } else if (lastRound && outcome?.verdict === "approve" && outcome.concerns.length > 0) {
      await appendDebt(runtime.store, meta, outcome.concerns, outcome.summary);
    } else if (!outcome?.verdict) {
      await appendPark(runtime.store, meta, `review produced no verdict: ${outcome?.summary ?? "no summary"}`);
    }
    return {};
  }
  if (checksDue(flow, step.id)) {
    const checks = await runGates(runtime, worktree);
    await appendChecks(runtime.store, meta, checks, { preexisting });
  }
  return {};
}

interface StepDeps {
  runtime: KernelRuntime;
  task: TaskFile;
  state: TaskState;
  iteration: number;
  step: FlowStep;
  flow: FlowDefinition;
}

async function runStep(deps: StepDeps): Promise<TaskActionResult> {
  const { runtime, task, state, iteration, step, flow } = deps;
  const records = await runtime.store.listRecords();
  const ensured = await ensureTaskWorktree(runtime, task);
  if (ensured.error) {
    await appendPark(runtime.store, { iteration, slug: task.slug, round: state.round }, ensured.error);
    return {};
  }
  if (ensured.setup && !ensured.setup.ok) {
    const cause = `worktree setup failed: ${ensured.setup.error ?? "unknown"}`;
    await runtime.store.appendRecord(scriptMeta(iteration, "setup", { slug: task.slug, round: state.round }), {
      ok: false,
      cause,
    });
    await appendPark(runtime.store, { iteration, slug: task.slug, round: state.round }, cause);
    return {};
  }

  const meta = { iteration, slug: task.slug, round: state.round };
  const preexisting = preexistingRed(recordedBaseGates(records));
  const target = stepTarget(runtime, task, state, step.id);
  const session = isFixTurn(flow, state, step.id)
    ? await followUpSession(runtime, task, target, records, ensured.path)
    : task.flow === "just-implement" && state.turns === 0
      ? frontSessionFor(runtime, target.alias, records, ensured.path)
      : undefined;
  const vars = promptVars(runtime, task, ensured.path, records, state.round, flow);
  vars.base_hash = firstBase(records, task.slug) ?? ensured.startPoint;
  vars.head_hash = await headSha(ensured.path);
  // A turn may only change its own worktree (implementer.md). Snapshot the
  // shared checkouts now; the settle below refuses the commit on any breach.
  const contained = await containmentSnapshot(runtime, ensured.path);
  let breach: string | undefined;
  const result = await runAgentTurn(runtime, {
    target,
    cwd: ensured.path,
    meta: {
      ...meta,
      step: step.id,
      base: firstBase(records, task.slug) ?? ensured.startPoint,
      taskHash: materialHash(task),
    },
    vars,
    expectation: step.review ? "review" : "any",
    session,
    settle: async (_record, outcome, live) => {
      breach = await containmentViolation(runtime, ensured.path, ensured.branch, contained);
      if (breach) return { ok: false, cause: `containment: ${breach}` };
      const settled = await commitStep(runtime, meta, ensured.path, `factory: ${task.slug} ${step.id} r${state.round}`);
      // Compact where the session ends, so the stored ref is already compacted
      // when a later fix turn resumes it. An infra/refusal stop delivers no
      // outcome; that session is not kept.
      if (!outcome || !live) return settled;
      const compacted = await compactSession(runtime, live);
      return compacted ? { ...settled, session: compacted } : settled;
    },
  });
  if (breach) {
    await appendPark(runtime.store, meta, `containment: ${breach}`);
    return {};
  }
  return handleStepResult(
    runtime,
    task,
    step,
    state,
    flow,
    iteration,
    ensured.path,
    preexisting,
    result.record.stop,
    result.outcome
  );
}

async function runChecks(
  runtime: KernelRuntime,
  task: TaskFile,
  state: TaskState,
  iteration: number
): Promise<TaskActionResult> {
  const ensured = await ensureTaskWorktree(runtime, task);
  if (ensured.error) {
    await appendPark(runtime.store, { iteration, slug: task.slug, round: state.round }, ensured.error);
    return {};
  }
  if (ensured.setup && !ensured.setup.ok) {
    const cause = `worktree setup failed: ${ensured.setup.error ?? "unknown"}`;
    await runtime.store.appendRecord(scriptMeta(iteration, "setup", { slug: task.slug, round: state.round }), {
      ok: false,
      cause,
    });
    await appendPark(runtime.store, { iteration, slug: task.slug, round: state.round }, cause);
    return {};
  }
  const checks = await runGates(runtime, ensured.path);
  const preexisting = preexistingRed(recordedBaseGates(await runtime.store.listRecords()));
  await appendChecks(runtime.store, { iteration, slug: task.slug, round: state.round }, checks, {
    preexisting,
  });
  return {};
}

/** Executes one dispatch action; every script step writes its own record. */
export async function executeTaskAction(
  runtime: KernelRuntime,
  task: TaskFile,
  action: Action,
  iteration: number,
  state: TaskState
): Promise<TaskActionResult | MergeResult> {
  if (action.kind === "step") {
    const flow = flowOf(runtime, task);
    const step = findStep(flow, action.step);
    return runStep({ runtime, task, state, iteration, step, flow });
  }
  if (action.kind === "checks") {
    return runChecks(runtime, task, state, iteration);
  }
  if (action.kind === "merge") {
    return mergeTask(runtime, task, iteration, state);
  }
  if (action.kind === "finish") {
    await appendFinish(runtime.store, { iteration, slug: task.slug, round: state.round }, state.commit);
    return {};
  }
  if (action.kind === "park") {
    await appendPark(runtime.store, { iteration, slug: task.slug, round: state.round }, action.cause);
    return {};
  }
  return {};
}
