/**
 * The prompt variables a turn renders: its handoff findings (the latest
 * acceptance or the checks that sent it back), the gate-last-call ask, and the
 * task/worktree facts every prompt shares. `promptVars` is the composition.
 */
import type { CheckResult } from "../core/checks/types.js";
import {
  type BaseGateState,
  formatBaseGates,
  preexistingRed,
  recordedBaseGates,
} from "./baseline.js";
import { frontPack, standaloneUpscopeAsk } from "./flow-context-front.js";
import {
  authorConcerns,
  bySeq,
  countRedGateRequests,
  fixDispositions,
  lastAcceptance,
  lastChecks,
  lastDecide,
  lastMergeChecks,
  lastReview,
} from "./flow-context-history.js";
import {
  attributedFailures,
  checksAttributed,
  formatFailingChecks,
  newGateFailures,
} from "./gates.js";
import { gateCommandsText } from "./infra.js";
import { outcomeExampleVar } from "./outcome-example.js";
import { expectationForStep } from "./outcome.js";
import { taskOutcomeSchema } from "./outcome-schemas.js";
import { qaOutcomeSchema } from "./qa.js";
import { CHECK_HANDOFF_DEFAULTS, type PromptLibrary } from "./prompts.js";
import { formatAcceptanceFindings, formatReviewFindings } from "./record.js";
import {
  agentSteps,
  isLastChecksFixCall,
  isAcceptanceStep,
  launchCounts,
} from "./review.js";
import { spikeReportPath } from "./spike-report.js";
import type {
  FlowDefinition,
  KernelRuntime,
  StepRecord,
  TaskFile,
  TaskState,
} from "./types.js";

interface Handoff {
  review?: StepRecord;
  acceptance?: StepRecord;
  qaStep: boolean;
  checks?: StepRecord;
  base?: BaseGateState;
  findings: string;
}

/**
 * The red checks a record charges the task for the fix ask: the close-time
 * attribution when the record carries it, else the baseline comparison the
 * older record was judged by.
 */
function recordFailures(
  rec: StepRecord,
  preexisting: ReadonlySet<string>,
): CheckResult[] {
  if (checksAttributed(rec.checks)) return attributedFailures(rec.checks);
  return newGateFailures(rec.checks ?? [], preexisting);
}

/** The latest acceptance or red checks, and the last-call ask when this is the gate fix's last round. */
function readHandoff(
  records: StepRecord[],
  task: TaskFile,
  flow: FlowDefinition,
  state: TaskState | undefined,
  stepId: string | undefined,
  prompts: PromptLibrary,
): Handoff {
  const review = lastReview(records, task.slug, flow);
  const acceptance = lastAcceptance(records, task.slug, flow);
  const decide = lastDecide(records, task.slug);
  const qaStep = flow.steps.find((step) => step.id === stepId)?.qa === true;
  const checks = lastChecks(records, task.slug);
  const mergeChecks = lastMergeChecks(records, task.slug);
  // A decide turn's `changes` verdict is the next fix turn's findings, like a
  // review's: it is the ask that sent the work back.
  const latest = [acceptance, decide, checks, mergeChecks]
    .filter((r): r is StepRecord => Boolean(r))
    .sort(bySeq)
    .at(-1);
  const base = recordedBaseGates(records);
  const preexisting = preexistingRed(base);
  let findings = "";
  if (latest === acceptance && acceptance?.outcome)
    findings = formatAcceptanceFindings(acceptance.outcome);
  else if (latest === decide && decide?.outcome)
    findings = formatAcceptanceFindings(decide.outcome);
  else if (latest?.checks)
    findings = formatFailingChecks(recordFailures(latest, preexisting));

  const isGateLastCall =
    state?.gateLastCall === true ||
    (state === undefined &&
      (latest === checks || latest === mergeChecks) &&
      isLastChecksFixCall(flow, countRedGateRequests(records, task.slug)));
  if (isGateLastCall) {
    const ask = prompts.render("gate-last-call", {}).trim();
    findings = findings ? `${ask}\n\n${findings}` : ask;
  }
  return { review, acceptance, qaStep, checks, base, findings };
}

/** The reviewer re-judges its own prior round; QA re-judges the last acceptance. */
function priorFindings(
  qaStep: boolean,
  acceptance: StepRecord | undefined,
  review: StepRecord | undefined,
): string {
  if (qaStep)
    return acceptance?.outcome
      ? formatAcceptanceFindings(acceptance.outcome)
      : "";
  return review?.outcome ? formatReviewFindings(review.outcome) : "";
}

/** The task's environment notes as prompt bullet lines; empty when it has none. */
function formatEnvNotes(notes: string[] | undefined): string {
  return (notes ?? []).map((note) => `- ${note}`).join("\n");
}

/** The task and worktree facts every turn renders. */
function commonVars(
  runtime: KernelRuntime,
  task: TaskFile,
  worktree: string,
  round: number,
  handoff: Handoff,
  state?: TaskState,
): Record<string, string> {
  const { checks } = handoff;
  return {
    task_path: runtime.store.tasks.path(task.slug),
    cleanliness_revision: state?.cleanlinessRevision ? "true" : "false",
    worktree,
    // Where a spike commits its finding; empty for a development task and a
    // `nogit` task, whose product lives outside git.
    report_path:
      task.kind === "spike" && !task.nogit ? spikeReportPath(task.slug) : "",
    env_notes: formatEnvNotes(task.envNotes),
    setup_command: runtime.configs.repo.setup.join(" && ") || "none",
    gate_commands: gateCommandsText(
      runtime.store.goalDir,
      runtime.configs.repo.gates,
    ),
    base_gates: formatBaseGates(handoff.base),
    findings: handoff.findings,
    pending_signal: state?.pendingSignal
      ? `${state.pendingSignal.kind}: ${state.pendingSignal.evidence}`
      : "",
    checks_result: checks?.checks
      ? formatFailingChecks(checks.checks) || "pass"
      : CHECK_HANDOFF_DEFAULTS.checks_result,
    checks_tree: checks?.tree ?? CHECK_HANDOFF_DEFAULTS.checks_tree,
    checks_log: checks
      ? runtime.store.records.checksLog(checks)
      : CHECK_HANDOFF_DEFAULTS.checks_log,
    round: String(round),
    base_hash: "",
    head_hash: "",
  };
}

/** The round an acceptance prompt shows: its own change-bearing call, not the task's global round. */
function promptRound(
  flow: FlowDefinition,
  stepId: string | undefined,
  round: number,
  state: TaskState | undefined,
): number {
  const step =
    stepId === undefined
      ? undefined
      : flow.steps.find((candidate) => candidate.id === stepId);
  if (!state || step === undefined || !isAcceptanceStep(step)) return round;
  return launchCounts(state.launches, step.id).changeRequests + 1;
}

export function promptVars(
  runtime: KernelRuntime,
  task: TaskFile,
  worktree: string,
  records: StepRecord[],
  round: number,
  flow: FlowDefinition,
  state?: TaskState,
  stepId?: string,
): Record<string, string> {
  const handoff = readHandoff(
    records,
    task,
    flow,
    state,
    stepId,
    runtime.prompts,
  );
  const { qaStep, acceptance, review } = handoff;
  const step = stepId
    ? flow.steps.find((candidate) => candidate.id === stepId)
    : undefined;
  const expectation = step
    ? expectationForStep(step.id, { current: flow })
    : "any";
  const schema = qaStep
    ? qaOutcomeSchema
    : taskOutcomeSchema(task, runtime.configs.process.taskTypes);
  // Only a flow's last agent receives the standalone escalation ask; the
  // reviewer is that agent in every built-in review flow, and a
  // reviewer-less flow asks its implementer instead.
  const lastAgent =
    step !== undefined && agentSteps(flow).at(-1)?.id === step.id;
  const upscopeAsk = lastAgent
    ? standaloneUpscopeAsk(runtime, task, records)
    : "";
  const askFields = upscopeAsk !== "" ? ["upscope"] : [];
  return {
    ...commonVars(
      runtime,
      task,
      worktree,
      promptRound(flow, stepId, round, state),
      handoff,
      state,
    ),
    prior_findings: priorFindings(qaStep, acceptance, review),
    prior_concerns: qaStep ? "" : authorConcerns(records, task.slug, flow),
    fix_dispositions: fixDispositions(records, task.slug, flow, round, state),
    front_pack: frontPack(runtime, task, records) ?? "",
    // The standalone escalation ask for the flow's last agent; empty when
    // this task is part of an architect plan.
    upscope_ask: upscopeAsk,
    // A relaunched or trivial turn overrides it with `resumeNote` before
    // rendering the implement prompt.
    resume_note: "",
    // QA carries its own kernel schema; every other step delivers the task
    // type's schema (a spike and a development task may differ even when the
    // same role runs both). The example is narrowed to the fields this step
    // delivers, so a bare done is never shown a verdict it cannot give.
    outcome_schema: outcomeExampleVar(
      step?.prompt ?? "implementer",
      expectation,
      schema,
      askFields,
    ),
  };
}
