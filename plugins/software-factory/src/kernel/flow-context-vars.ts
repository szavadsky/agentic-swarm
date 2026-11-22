/**
 * The prompt variables a turn renders: its handoff findings (the latest
 * acceptance or the checks that sent it back), the gate-last-call ask, and the
 * task/worktree facts every prompt shares. `promptVars` is the composition.
 */
import {
  type BaseGateState,
  formatBaseGates,
  preexistingRed,
  recordedBaseGates,
} from "./baseline.js";
import { frontPack, standaloneUpscopeAsk } from "./flow-context-front.js";
import {
  bySeq,
  countRedGateRequests,
  fixDispositions,
  lastAcceptance,
  lastChecks,
  lastMergeChecks,
  lastReview,
} from "./flow-context-history.js";
import { formatFailingChecks, newGateFailures } from "./gates.js";
import { taskOutcomeSchema } from "./outcome-schemas.js";
import { outcomeSchemaVar, qaOutcomeSchemaVar } from "./prompt-schema.js";
import { CHECK_HANDOFF_DEFAULTS, GATE_LAST_CALL_ASK } from "./prompts.js";
import { formatAcceptanceFindings, formatReviewFindings } from "./record.js";
import { isLastChecksFixCall } from "./review.js";
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

/** The latest acceptance or red checks, and the last-call ask when this is the gate fix's last round. */
function readHandoff(
  records: StepRecord[],
  task: TaskFile,
  flow: FlowDefinition,
  state: TaskState | undefined,
  stepId: string | undefined,
): Handoff {
  const review = lastReview(records, task.slug, flow);
  const acceptance = lastAcceptance(records, task.slug, flow);
  const qaStep = flow.steps.find((step) => step.id === stepId)?.qa === true;
  const checks = lastChecks(records, task.slug);
  const mergeChecks = lastMergeChecks(records, task.slug);
  const latest = [acceptance, checks, mergeChecks]
    .filter((r): r is StepRecord => Boolean(r))
    .sort(bySeq)
    .at(-1);
  const base = recordedBaseGates(records);
  const preexisting = preexistingRed(base);
  let findings = "";
  if (latest === acceptance && acceptance?.outcome)
    findings = formatAcceptanceFindings(acceptance.outcome);
  else if (latest?.checks)
    findings = formatFailingChecks(newGateFailures(latest.checks, preexisting));

  const isGateLastCall =
    state?.gateLastCall === true ||
    (state === undefined &&
      (latest === checks || latest === mergeChecks) &&
      isLastChecksFixCall(flow, countRedGateRequests(records, task.slug)));
  if (isGateLastCall) {
    findings = findings
      ? `${GATE_LAST_CALL_ASK}\n\n${findings}`
      : GATE_LAST_CALL_ASK;
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
    // Where a spike commits its finding; empty for every other task.
    report_path: task.kind === "spike" ? spikeReportPath(task.slug) : "",
    setup_command: runtime.configs.repo.setup.join(" && ") || "none",
    gate_commands:
      runtime.configs.repo.gates
        .map((g) => `- ${g.id}: ${g.command}`)
        .join("\n") || "none",
    base_gates: formatBaseGates(handoff.base),
    findings: handoff.findings,
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
  const handoff = readHandoff(records, task, flow, state, stepId);
  const { qaStep, acceptance, review } = handoff;
  return {
    ...commonVars(runtime, task, worktree, round, handoff, state),
    prior_findings: priorFindings(qaStep, acceptance, review),
    fix_dispositions: fixDispositions(records, task.slug, flow, round, state),
    front_pack: frontPack(runtime, task, records) ?? "",
    // The standalone escalation ask for the reviewer; empty when this task is
    // part of an architect plan. The implementer template ignores it.
    upscope_ask: standaloneUpscopeAsk(runtime, task),
    // A de-novo turn carries no follow-up notice; the trivial path overrides
    // this with `trivialResumeNote` before rendering the implement prompt.
    resume_note: "",
    // QA carries its own kernel schema; every other step delivers the task
    // type's schema (a spike and a development task may differ even when the
    // same role runs both).
    outcome_schema: qaStep
      ? qaOutcomeSchemaVar()
      : outcomeSchemaVar(
          undefined,
          taskOutcomeSchema(task, runtime.configs.process.taskTypes),
        ),
  };
}
