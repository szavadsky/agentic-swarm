/**
 * Kernel-0 public shapes (KERNEL0 §4). Everything the shell writes is derived
 * from task files plus append-only step records; nothing here is stored state.
 */
import { z } from "zod";
import type { CheckResult } from "../core/checks/types.js";
import type { Repo } from "../core/git/repo.js";
import type {
  Harness,
  ModelRef,
  ServedUsage,
  SessionRef,
  Stop,
  TurnAttempt,
  Usage,
} from "../harness/types.js";
import type { PriceSource } from "./openrouter.js";
import type { PlanFile, PlanScope } from "./plan-file.js";
import type { PromptLibrary } from "./prompts.js";

export const concernSchema = z.object({
  kind: z.enum(["debt", "risk", "uncertainty", "choice"]),
  calibration: z.enum(["fyi", "architect", "owner"]),
  text: z.string().min(1),
  evidence: z.string().optional(),
});

/** One ingested concern's kernel-assigned id: `<recordId>#<n>`, 1-based in the record's outcome. */
export type ConcernId = string;

/** A concern as the kernel read it back from a record: ingest assigns `id`, agents never write one. */
export type RecordedConcern = Concern & { id?: ConcernId };

/** One debt's closure: the id the kernel assigned, and what removed the debt. */
export const debtClosedEntrySchema = z.object({
  id: z.string().min(1),
  reason: z.string().min(1),
});

/** One steer's answer: the pending steer's id, and the architect's answer. */
export const steerAnswerSchema = z.object({
  steer: z.string().min(1),
  answer: z.string().min(1),
});

/** One fix turn's answer to a prior review finding, by its numbered position. */
export const replySchema = z.object({
  finding: z.number().int().positive(),
  reply: z.string().min(1),
});
/**
 * Where the PM's steer turn sends one steer: handled now, a new task, carried
 * into the goal's intent by the intent agent, an architect (the goal architect,
 * or `{architect: id}` for one scope), or drain-then-architect.
 */
export const steerRouteSchema = z.union([
  z.enum(["task", "spike", "intent", "architect", "stall"]),
  z
    .object({ architect: z.string().min(1) })
    .strict()
    .describe("one architect's scope: `main` or an epic id"),
]);
export type SteerRoute = z.infer<typeof steerRouteSchema>;

export const steerRouteEntrySchema = z.object({
  steer: z.string().min(1),
  route: steerRouteSchema,
  /** The PM's answer for a `task` steer; absent for every other route. */
  answer: z.string().optional(),
});

/**
 * What the decider does with one parked slug: amend keeps the slug (a new
 * revision of its file), cancel spends it, replace and split continue the kept
 * branch under new slugs, leave defers to the architect.
 */
export const stallRouteEntrySchema = z.object({
  slug: z.string().min(1),
  action: z.enum(["amend", "cancel", "replace", "split", "leave"]),
  reason: z.string().min(1),
});
export type StallRouteEntry = z.infer<typeof stallRouteEntrySchema>;
export type StallDecision = StallRouteEntry["action"];

/** One plan item's check result: what the checker inspected and what it showed. */
export const planCheckEvidenceSchema = z.object({
  item: z.string().min(1),
  status: z.enum(["done", "missing", "below-standard", "unverifiable"]),
  evidence: z.string().min(1),
});
export type PlanCheckEvidence = z.infer<typeof planCheckEvidenceSchema>;

/**
 * One follow-up the checker names without new direction. A parked slug gets
 * the decider's four decisions — amend under the same slug, cancel, replace
 * with one new task, split into several; a dead dep or unmerged work keeps its
 * mechanical fix.
 */
export const planCheckFollowUpSchema = z.object({
  kind: z.enum([
    "amend",
    "cancel",
    "replace",
    "split",
    "missing-dep",
    "unmerged",
  ]),
  /** The slug this follow-up acts on: a parked task, or the pending task a dead dep blocks. */
  slug: z.string().min(1),
  /** A missing-dep follow-up's dead dependency; absent for every other kind. */
  dep: z.string().optional(),
  reason: z.string().min(1),
});
export type PlanCheckFollowUp = z.infer<typeof planCheckFollowUpSchema>;

/**
 * The checker's report: the kernel resumes dispatch on `progress` and
 * consults the architect on `architect`. One enum, because the kernel
 * branches on it.
 */
export const planCheckSchema = z.object({
  verdict: z.enum(["progress", "architect"]),
  evidence: z.array(planCheckEvidenceSchema).default([]),
  followUps: z.array(planCheckFollowUpSchema).default([]),
});
export type PlanCheck = z.infer<typeof planCheckSchema>;
export type PlanCheckVerdict = PlanCheck["verdict"];

/**
 * One plan-check follow-up the PM routed: `continue` carries the checker's
 * kind out now (amend, cancel, replace, split, a dead-dep drop), `leave` keeps
 * it for the architect.
 */
export const planCheckRouteEntrySchema = z.object({
  slug: z.string().min(1),
  action: z.enum(["continue", "leave"]),
  reason: z.string().min(1),
});
export type PlanCheckRouteEntry = z.infer<typeof planCheckRouteEntrySchema>;

/** One architect mark on a plan-review finding: whether the advisory review helped. */
export const planReviewMarkSchema = z.object({
  finding: z.number().int().positive(),
  mark: z.enum(["helpful", "unhelpful"]),
});
export type PlanReviewMark = z.infer<typeof planReviewMarkSchema>;

/** One plan-review finding: the plan line it concerns and what would satisfy it. */
export const planReviewFindingSchema = z.object({
  planLine: z.string().min(1).describe("the plan line or bullet it concerns"),
  finding: z.string().min(1).describe("what fails and what would satisfy it"),
});
export type PlanReviewFinding = z.infer<typeof planReviewFindingSchema>;

/**
 * A plan review's findings: technical concerns first, then plan-and-dependency
 * notes. No verdict, no last call — the review advises, the architect decides.
 * The kernel numbers them in this order for the architect's marks.
 */
export const planReviewOutcomeSchema = z.object({
  technical: z
    .array(planReviewFindingSchema)
    .default([])
    .describe(
      "technical concerns: impractical direction, a real bug, a foundation the plan assumes and the repo lacks",
    ),
  planNotes: z
    .array(planReviewFindingSchema)
    .default([])
    .describe(
      "plan and dependency notes: an unactionable bullet, missing coverage, ordering",
    ),
});
export type PlanReviewOutcome = z.infer<typeof planReviewOutcomeSchema>;

/** The only agent ↔ script surface; one schema for every step. Field
 * descriptions render into the outcome prompt skeleton, so they are the
 * prompt-facing wording; comments below keep kernel-only behavior. */
export const outcomeSchema = z.object({
  status: z
    .enum(["done", "blocked", "failed", "upscope"])
    .describe("upscope on task steps only"),
  summary: z.string().describe("one paragraph"),
  concerns: z.array(concernSchema).default([]),
  // Parse-only: old records close debts and answer steers here, and no prompt
  // asks for a line; `debtClosed` and `steerAnswers` are the protocol. Kept
  // required because every delivery defaults it empty.
  forward: z.array(z.string()).default([]),
  // Kernel-recorded debts are closed by the id the record ingest assigned, not
  // by quoting the debt text.
  debtClosed: z
    .array(debtClosedEntrySchema)
    .optional()
    .describe(
      "close one open debt by the id in the pack's debt register; reason says what removed it",
    ),
  // The architect answers every pending steer from its pack's steer list.
  steerAnswers: z
    .array(steerAnswerSchema)
    .optional()
    .describe(
      "one {steer, answer} per pending steer, steer id from the steer list",
    ),
  // A fix turn answers its prior review with one entry per numbered finding;
  // the summary stays free text. Derive parks an empty fix with no replies.
  replies: z
    .array(replySchema)
    .optional()
    .describe(
      "fix turns only: one {finding, reply} per numbered prior finding; finding is its 1-based position",
    ),
  verdict: z
    .enum(["approve", "changes", "reject"])
    .optional()
    .describe("review steps only"),
  decision: z
    .enum(["continue", "done", "blocked"])
    .optional()
    .describe("architect step only"),
  // `yes` parks with cause upscope and (standalone only) rewrites the front
  // class to bigger; `no` and absent keep the normal verdict path.
  upscope: z
    .enum(["yes", "no"])
    .optional()
    .describe("standalone review escalation: answer with the verdict"),
  // Absent on a legacy steer turn means every steer goes to the architect.
  steerRoutes: z
    .array(steerRouteEntrySchema)
    .optional()
    .describe("PM steer turns only: one route per claimed steer"),
  // The kernel resumes amend/replace/split slugs, cancels `cancel` slugs and
  // records `leave` reasons for the next boundary.
  stallRoutes: z
    .array(stallRouteEntrySchema)
    .optional()
    .describe("PM stall turns only: one entry per parked slug"),
  // The kernel branches on the verdict.
  planCheck: planCheckSchema.optional().describe("plan-checker turns only"),
  // Findings reach the architect before the PM; no verdict is taken here.
  planReview: planReviewOutcomeSchema
    .optional()
    .describe("plan-review turns only: technical findings and plan notes"),
  // The kernel resumes amended/continued follow-ups, cancels a cancel
  // follow-up and records `leave` reasons for the next boundary.
  planCheckRoutes: z
    .array(planCheckRouteEntrySchema)
    .optional()
    .describe("plan-check PM turns only: one entry per checker follow-up"),
  planReviewMarks: z
    .array(planReviewMarkSchema)
    .optional()
    .describe("architect step only: one mark per plan-review finding"),
});

export type Concern = z.infer<typeof concernSchema>;
export type Outcome = z.infer<typeof outcomeSchema>;
/** One record's outcome as ingested: the same shape, its concerns carrying kernel ids. */
export type RecordedOutcome = Omit<Outcome, "concerns"> & {
  concerns: RecordedConcern[];
};
export type ReviewVerdict = NonNullable<Outcome["verdict"]>;
export type GoalDecision = NonNullable<Outcome["decision"]>;
/** Spike finishes with findings; development merges its branch. */
export type TaskKind = "development" | "spike";

/** One configured task type: the flow it runs, its kind and its output schema. */
export interface TaskTypeDefinition {
  flow: string;
  kind: TaskKind;
  /** A kernel outcome schema name; a task type never supplies its own. */
  schema: string;
}

export interface TaskFile {
  slug: string;
  title: string;
  /** The configured type this file named; absent on a legacy file. */
  type?: string;
  /** Resolved from `type`; a legacy file declares it directly. */
  kind: TaskKind;
  /** Resolved from `type`; a legacy file declares it directly. */
  flow: string;
  deps: string[];
  scope: string[];
  /** The epic that owns this task; absent means goal-level work. */
  epic?: string;
  tier?: string;
  /**
   * The decider's revision of this task, 0 until it amends a park under the
   * same slug. Derive counts only records after the park an earlier revision
   * ended, so a bump restarts the flow with its counts while the kept branch
   * and the records stay.
   */
  revision: number;
  /** A parked task whose kept branch this task continues from. */
  base?: string;
  /** Plan heading this task derives from. */
  source: string;
  body: string;
  /** Outcome reminders for this task's turns; defaults to process `reminders`. */
  repairTurns?: number;
  /**
   * Per-turn wall bound in minutes for this task's turns; overrides the alias
   * wall, still capped by the run's `limits.turnMinutes`. Owner ruling 2.
   */
  turnMinutes?: number;
  /** Plan-checker re-runs per iteration; exhausted rounds consult the architect. */
}

export interface TaskFileFinding {
  slug: string;
  file: string;
  kind: "malformed" | "unconfigured-type";
  reason: string;
}

export type TaskStatus =
  | "pending"
  | "ready"
  | "running"
  | "merged"
  | "finished"
  | "parked"
  | "cancelled";

/**
 * The next thing the task needs: a flow step id, or one of the script phases.
 * Flow step ids are open so a configured flow (not this union) drives dispatch.
 */
export type TaskPhase = string;

/** A completed step repeated an earlier fingerprint in the item's history. */
export interface ProgressRepeat {
  fingerprint: string;
  step: string;
  round: number;
  firstRound: number;
}

/**
 * A park or failure cause, closed by `kind`: the kernel switches on it and
 * never on `detail`. `detail` is free text for prompts, summaries and records.
 */
export const causeKindSchema = z.enum([
  "gates",
  "conflict",
  "base-conflict",
  "no-progress",
  "empty-diff",
  "round-limit",
  "change-requests-exhausted",
  "overflow",
  "infra",
  "infra-repeat",
  "setup",
  "containment",
  "outside-change",
  "integration-moved",
  "budget",
  "steer",
  "blocked",
  "upscope",
  "failed",
  "review-rejected",
  "refused",
  "invalid-outcome",
  "merge-failed",
  "quarantine",
  "held",
  "stuck",
  "resume",
  "gate-flake",
  "note",
  "boundary",
  "error",
  "unknown",
]);
export type CauseKind = z.infer<typeof causeKindSchema>;

export const causeSchema = z.object({
  kind: causeKindSchema,
  detail: z.string(),
});
export type Cause = z.infer<typeof causeSchema>;

export interface TaskState {
  status: TaskStatus;
  /** The task file's epic, copied so a consumer reading state keeps the owner. */
  epic?: string;
  cause?: Cause;
  /** Agent turns spent on this slug, a spend fact only: no bound reads it. */
  turns: number;
  /** Current implementation/review round, 1-based. */
  round: number;
  kind: TaskKind;
  flow: string;
  phase: TaskPhase;
  commit?: string;
  verdict?: ReviewVerdict;
  /** A derived terminal outcome that still needs its park record. */
  park?: Cause;
  /** No-progress over the item's history; the next action is the loop park. */
  loop?: ProgressRepeat;
  /** A red gate run sent the task back to implement: the fix turn resumes its session, and only a merged-result fix skips the next review. */
  gateFix?: boolean;
  /** True when this gate-fix turn is the last allowed fix turn before red gates park. */
  gateLastCall?: boolean;
}

export type GoalStatus = "active" | "done" | "blocked";

/**
 * One epic's derived state. The epic's last completed subarchitect record owns
 * its decision; `done` additionally requires every task in the epic to be
 * terminal, so a task that reopens reopens the epic. An epic without a
 * subarchitect turn (the top architect owns it) closes on its tasks alone.
 */
export interface EpicState {
  /** The epic's task slugs; goal-level tasks appear only in `tasks`. */
  tasks: string[];
  /** The last completed subarchitect decision; absent before the first turn. */
  decision?: GoalDecision;
  /** No subarchitect veto and no task in the epic is open. */
  done: boolean;
}

export interface State {
  goal: GoalStatus;
  /** Highest iteration seen in records; 0 before the first boundary turn. */
  iteration: number;
  terminal: boolean;
  /** The current iteration was interrupted with ready work left; a relaunch resumes it. */
  interrupted: boolean;
  tasks: Record<string, TaskState>;
  /** Every epic the task files and subarchitect records name. */
  epics: Record<string, EpicState>;
}

export type Action =
  | { kind: "step"; slug: string; step: string; round: number }
  | { kind: "checks"; slug: string }
  | { kind: "merge"; slug: string }
  | { kind: "finish"; slug: string }
  | { kind: "park"; slug: string; cause: Cause }
  | { kind: "boundary" }
  | { kind: "exit"; reason: string };

/** What a turn's missing-outcome repair ask renders from. */
export interface RepairSpec {
  /**
   * Prompt template for the in-session repair ask. Absent renders the
   * `delivery-repair` template.
   */
  repairPrompt?: string;
  /**
   * The product the turn must deliver, named in the repair ask and the failure
   * finding. Absent names the outcome (or the verdict on a review turn).
   */
  deliverable?: string;
}

/** A step's prompt template and the run-config alias its turns run on. */
export interface TurnSpec extends PromptSpec {
  /** Run-config alias; pre-flight requires every named alias. */
  alias: string;
}

/**
 * The kernel turns that run outside a configured flow. Their names are the
 * record step vocabulary; process config names a prompt and alias for each.
 * Plan review is the architecture flow, configured by its own block.
 */
export const BOUNDARY_STEPS = [
  "architect",
  "digest",
  "front",
  "intent",
  "packprep",
  "plancheck",
  "pm",
  "steward",
] as const;
export type BoundaryStep = (typeof BOUNDARY_STEPS)[number];

/** Kernel turns owned by the architecture flow rather than the boundary block. */
export const ARCHITECTURE_STEPS = ["planreview", "planreturn"] as const;

/**
 * The epic architect's consult, run only at hierarchy depth 2. It is not a
 * boundary-block step: it runs on the architect's alias, so no run config
 * needs a second alias, and its records carry `architect: <epic>`.
 */
export const HIERARCHY_STEPS = ["subarchitect"] as const;

/** Every kernel turn outside a task flow; none starts a task turn. */
export const KERNEL_STEPS = [
  ...BOUNDARY_STEPS,
  ...ARCHITECTURE_STEPS,
  ...HIERARCHY_STEPS,
] as const;
export type KernelStep = (typeof KERNEL_STEPS)[number];

/** A boundary- or architecture-turn prompt; the alias is named elsewhere. */
export interface PromptSpec extends RepairSpec {
  /** Prompt template name under `prompts/`. */
  prompt: string;
}

/**
 * The architecture flow: who reviews the architect's plan, and whether the
 * architect gets one turn on the technical findings before the PM derives
 * tasks. `planReturn` is required exactly when that turn is allowed.
 */
export interface ArchitectureConfig {
  planReview: PromptSpec;
  /** Run-config aliases; one fresh read-only review turn each, in order. */
  reviewers: string[];
  architectReturn: "on-technical-concerns" | "never";
  planReturn?: PromptSpec;
}

/**
 * Hierarchy depth and the epic architect's prompt. Depth 1 (the default) is
 * one architect; depth 2 adds one subarchitect consult per active epic. The
 * subarchitect runs on the boundary architect's alias, so only the prompt
 * differs.
 */
export interface HierarchyConfig {
  depth: 1 | 2;
  subarchitect: PromptSpec;
}

export interface FlowStep extends RepairSpec {
  id: string;
  /** Non-script steps name their prompt and alias; script steps (`checks`) name neither. */
  prompt?: string;
  alias?: string;
  /** Review steps carry the verdict contract and consume a review round. */
  review?: boolean;
  /**
   * QA steps carry the accept-or-changes contract, consume the same acceptance
   * round as a review, and gate the tree before the reviewer sees it.
   */
  qa?: boolean;
  /**
   * Review adjudication: this verdict-only step runs after the preceding
   * review's change request, re-judges its findings and may discard them.
   * `all` runs on every change-bearing review cycle; `last` only on the final
   * one. The step must directly follow the review it adjudicates.
   */
  adjudicate?: "last" | "all";
  /**
   * Review, QA and checks steps: how many change requests this step may issue
   * before its call is the last one. Absent means the default (two).
   */
  changeRequests?: number;
  /**
   * Run-config aliases the step's later attempts run on after failure-kind
   * launches, in order: the first alternate after the first failure, the
   * second after the second, and the last one for every attempt beyond.
   * The position derives from records, so a relaunch lands on the same alias.
   */
  alternates?: string[];
  /** How this step's later turn follows the one it repairs; default same-session. */
  followUp?: FollowUp;
}

/**
 * How a step's later turn follows the turn it repairs: a fix turn or a review
 * round after the first.
 */
export interface FollowUp {
  mode: "same-session" | "de-novo" | "different-model";
  /**
   * Run-config alias the later turn runs on when mode is `different-model`; the
   * prompt stays the step's, so a retry changes the model, not the role.
   */
  alias?: string;
  /**
   * `different-model` only: resume the step's last session across the switch
   * when the portability graph admits it; otherwise the turn starts de novo.
   * Absent starts de novo, like a plain model switch.
   */
  keepSession?: boolean;
}

export interface FlowDefinition {
  steps: FlowStep[];
}

/** Limits the pure `next` needs; resolved from the three config layers. */
export interface Limits {
  flows: Record<string, FlowDefinition>;
  iterations: number;
  concurrency: {
    overall: number;
    /** Quota-pool name -> parallel sessions; pools are named on aliases. */
    perSubscription: Record<string, number>;
    /** Model id -> parallel sessions; empty means no per-model cap. */
    perModel: Record<string, number>;
  };
  /** Optional drain limits for one iteration: new turns, wall clock and USD. */
  iterationTurns?: number;
  iterationWallMs?: number;
  iterationUsd?: number;
  /** Per-turn wall bound in minutes; caps the alias wall timeout. */
  turnMinutes?: number;
  /** Per-iteration wall bound in minutes; folds into `iterationWallMs`. */
  iterationMinutes?: number;
  /** Plan-checker re-runs per iteration; exhausted rounds consult the architect. */
  planCheckRounds: number;
  /** Resume attempts limit; default 2. */
  resumeAttempts?: number;
  /** Amends one parked slug may receive per iteration; default 1. */
  parkAmends?: number;
  /** Minimum free bytes in the temporary directory. */
  minTmpFreeBytes?: number;
}

export type StepActor = "agent" | "script";

/**
 * Why a launch ran again: a technical glitch (infra stop or fallback hop),
 * a bona fide change request (a review `changes`), a QA finding that sent the
 * work back, or a bona fide failure (agent `failed`/`blocked` or no outcome
 * after reminders).
 */
export type LaunchKind = "glitch" | "change-request" | "qa-finding" | "failure";

/** Idle is separate from wall: a long tool call streams nothing but is not stuck. */
export interface Timeouts {
  idleMs: number;
  wallMs: number;
}

/** A full test-suite run can stream nothing for many minutes. */
export const DEFAULT_TIMEOUTS: Timeouts = {
  idleMs: 20 * 60_000,
  wallMs: 60 * 60_000,
};

/**
 * One append-only record, materialized from `records/<dir>/`: `started.yaml`
 * exists before a turn, `end.yaml` commits it and seals its files read-only,
 * `outcome.yaml` holds the agent's accepted outcome. Script steps have actor
 * `script` and no outcome, except `steer-routes`: it stores the accepted
 * steer-route map so the boundary never reads a failed rung's routes.
 */
export interface StepRecord {
  seq: number;
  iteration: number;
  slug?: string;
  step: string;
  round: number;
  actor: StepActor;
  /**
   * The architect that owns this record's work: `main` for goal-level work or
   * an epic's id for epic work.
   */
  architect?: string;
  /** Agent steps only; `model` is the model actually used when reported. */
  alias?: string;
  model?: ModelRef;
  /** Every retry/fallback hop the harness made for this turn. */
  attempts?: TurnAttempt[];
  /**
   * Models the turn actually served, each with its share of the tokens.
   * Measurement only: routing, admission and fallback counts keep the alias.
   */
  served?: ServedUsage[];
  /** Validator findings that triggered outcome reminders, in round order. */
  repairFindings?: string[];
  /**
   * Set when the turn delivered after its reminders: the final outcome passed
   * the same checks, so every listed finding is closed.
   */
  repairFindingsResolved?: boolean;
  /** Incident launches only: why this launch ran again. */
  launchKind?: LaunchKind;
  /** Resumed turn: unsplit input is priced as the cached prefix. */
  cachedPrefix?: boolean;
  /** Task hash at dispatch, for the frozen-task check. */
  taskHash?: string;
  /**
   * The task revision this record belongs to. A park carries the revision it
   * ended, so derive can ignore the parks of revisions the task has amended
   * past; absent reads as 0.
   */
  revision?: number;
  /** Integration head (or parked branch tip) the branch started from. */
  base?: string;
  stop?: Stop;
  usage?: Usage;
  /** Priced tokens of this turn's session-end compaction, when the harness reported them. */
  compactUsage?: Usage;
  session?: SessionRef;
  commit?: string;
  /** Spike finish only: `<commit>:<report path>`, the finding's one copy. */
  report?: string;
  /** Intent turn only: the unified diff the turn carried into the goal's intent. */
  diff?: string;
  /** UTF-8 bytes of the rendered prompt sent to the harness (agent steps only). */
  promptBytes?: number;
  /** Boundary roles only: UTF-8 bytes of the iteration context pack. */
  packBytes?: number;
  /** Raw stream transcript in the session store, when the harness keeps one. */
  transcript?: string;
  /** Tree of the resulting worktree, the per-step no-progress component. */
  tree?: string;
  /** base-advance only: integration head tree at the creation advance. */
  headTree?: string;
  /**
   * Resolve only: tracked paths the turn changed outside the conflict set.
   * Non-empty sends the reviewable change through the flow's review step
   * before the merge retries; empty lands the resolution on its checks.
   */
  outside?: string[];
  checks?: CheckResult[];
  /** Files and lines the turn's commit changed, measured at commit time. */
  edits?: WorkEdits;
  /** Gates run by this record; checks records only. */
  testRuns?: number;
  /** Wall time in ms; checks/commit records stamp the gate/commit run itself. */
  wallMs?: number;
  outcome?: RecordedOutcome;
  ok?: boolean;
  cause?: Cause;
  startedAt: string;
  endedAt?: string;
}

/** Work one turn committed: files changed plus added/removed lines. */
export interface WorkEdits {
  files: number;
  added: number;
  removed: number;
}

/** Input of one turn/script step, written before the turn starts. */
export interface RecordStart {
  iteration: number;
  slug?: string;
  step: string;
  round: number;
  actor: StepActor;
  /** The architect that owns this record's work; see `StepRecord.architect`. */
  architect?: string;
  alias?: string;
  model?: ModelRef;
  taskHash?: string;
  /** The task revision this record belongs to; absent reads as 0. */
  revision?: number;
  base?: string;
  /** Merge steps: the planned squash commit, written before the ref moves. */
  commit?: string;
}

/** Settled fields written atomically as `end.yaml`. */
export interface RecordEnd {
  /** Set when the harness reports the model actually used (S1 contract). */
  model?: ModelRef;
  stop?: Stop;
  usage?: Usage;
  /** Raw session-end compaction tokens from the settle; the agent turn prices them. */
  compactUsage?: Usage;
  session?: SessionRef;
  /** Resumed turn: unsplit input is priced as the cached prefix. */
  cachedPrefix?: boolean;
  /** Rendered prompt and, for the boundary roles, context-pack size. */
  promptBytes?: number;
  packBytes?: number;
  transcript?: string;
  attempts?: TurnAttempt[];
  /** Per-model split of a turn whose harness resolved its model natively. */
  served?: ServedUsage[];
  /** Validator findings that triggered outcome reminders, in round order. */
  repairFindings?: string[];
  /**
   * Set when the turn delivered after its reminders: the final outcome passed
   * the same checks, so every listed finding is closed.
   */
  repairFindingsResolved?: boolean;
  /** Incident launches only: why this launch ran again. */
  launchKind?: LaunchKind;
  commit?: string;
  /** Spike finish only: `<commit>:<report path>`, the finding's one copy. */
  report?: string;
  /** Intent turn only: the unified diff the turn carried into the goal's intent. */
  diff?: string;
  tree?: string;
  /** base-advance only: integration head tree at the creation advance. */
  headTree?: string;
  /** Resolve only: paths the turn changed outside the conflict set. */
  outside?: string[];
  checks?: CheckResult[];
  edits?: WorkEdits;
  testRuns?: number;
  wallMs?: number;
  outcome?: Outcome;
  ok?: boolean;
  cause?: Cause;
}

/** Handle for an in-flight turn; the directory exists but has no end. */
export interface TurnRecord {
  dir: string;
  meta: StepRecord;
  /** Absolute path the agent writes its outcome file to. */
  outcomePath: string;
  /** Writes outcome, then end.yaml, then seals the record read-only. */
  finish(end: RecordEnd): Promise<StepRecord>;
}

/**
 * One kernel write under the goal dir, declared before its bytes land. The
 * kernel's store is the declaration point: a goal artifact change the ledger
 * does not explain belongs to the turn in flight, never to the kernel.
 */
export interface DeclaredWrite {
  /** Goal-relative path with `/` separators. */
  rel: string;
  /** When the write settled; absent while it is in flight at the check. */
  endedAt?: string;
}

/** The directory a goal artifact lives in; `goal` owns the files no sub-store does. */
export type ArtifactArea =
  | "goal"
  | "records"
  | "tasks"
  | "plans"
  | "mailbox"
  | "iterations";

/** One goal artifact, addressed by the store that owns it. */
export interface ArtifactRef {
  readonly area: ArtifactArea;
  /** Path inside the area's directory; empty names that directory. */
  readonly rel?: string;
}

/** One record directory and whether its start/end committed. */
export interface RecordDir {
  /** Directory name, `NNNNN-i<iteration>[-<slug>]-<step>-r<round>`. */
  name: string;
  /** Absolute directory path. */
  path: string;
  started: boolean;
  ended: boolean;
}

/** The files a record directory owns; nothing else is a record. */
export type RecordFile = "started.yaml" | "outcome.yaml" | "end.yaml";

export interface RecordStore {
  /** Absolute directory the record owns; prompts and briefs carry it. */
  dir(record: StepRecord): string;
  /** Absolute path of one of the record's files. */
  file(record: StepRecord, name: RecordFile): string;
  /**
   * The reviewer prompt's `checks_log`: the record's own directory, which the
   * store materialized when the record started.
   */
  checksLog(record: StepRecord): string;
  /** Every record directory on disk, in name order. */
  dirs(): Promise<RecordDir[]>;
  /** Includes unfinished records (started, no end); sorted by seq. */
  list(): Promise<StepRecord[]>;
  start(meta: RecordStart): Promise<TurnRecord>;
  append(meta: RecordStart, end: RecordEnd): Promise<StepRecord>;
  /** Writes an end for a record a dead process left open, then seals it. */
  close(name: string, end: RecordEnd): Promise<void>;
  /** Makes an ended record's files read-only. */
  seal(name: string): Promise<void>;
}

export interface TaskStore {
  /** Absolute directory holding the task files. */
  readonly dir: string;
  /** Absolute path of one task file; prompts carry it. */
  path(slug: string): string;
  /** Raw task texts by slug, sorted. */
  texts(): Promise<Map<string, string>>;
  list(): Promise<TaskFile[]>;
  read(slug: string): Promise<TaskFile | null>;
  write(task: TaskFile): Promise<void>;
  /** Writes one file byte for byte: a kernel restore. */
  writeText(slug: string, text: string): Promise<void>;
  /** Restores what a turn changed or created; names the slugs it put back. */
  restore(before: Map<string, string>): Promise<string[]>;
  findings(): Promise<TaskFileFinding[]>;
  /** Quarantines malformed files and records each; one listing's sweep. */
  sweep(iteration: number): Promise<void>;
}

export interface PlanStore {
  /** Absolute path of the goal's plan file; prompts carry it. */
  readonly path: string;
  /** Every plan the register names, goal plan first. */
  registered(): PlanFile[];
  /** The registered plans whose file exists, in register order. */
  existing(): PlanFile[];
  /** Every plan file on disk (goal plus `epics/*.md`), the ownership view. */
  filesOnDisk(): PlanFile[];
  /** A scope's bytes; the goal plan when no scope is named. */
  read(scope?: PlanScope): Promise<string | null>;
  exists(scope?: PlanScope): Promise<boolean>;
  /** Kernel write: declares the path and replaces the file atomically. */
  write(scope: PlanScope, text: string): Promise<void>;
  /** Deletes the plan; absent is a no-op. */
  remove(scope?: PlanScope): Promise<void>;
}

/** The files one iteration directory owns. */
export type IterationFile =
  | "context-pack.md"
  | "context-data.json"
  | "summary.md"
  | "digest.md"
  | "metrics.yaml";

export interface IterationStore {
  /** Goal-relative path of one iteration file. */
  rel(iteration: number, file: IterationFile): string;
  /** Absolute path of one iteration file; prompts carry it. */
  path(iteration: number, file: IterationFile): string;
  read(iteration: number, file: IterationFile): Promise<string | null>;
  write(iteration: number, file: IterationFile, text: string): Promise<void>;
}

/** The mailbox queues a steer moves through. */
export type MailboxQueue =
  | "inbox"
  | "processed"
  | "outbox"
  | "holds"
  | "quarantine";

export interface MailboxStore {
  /** Absolute holds directory: where the PM writes one file per steer. */
  readonly holds: string;
  /** Absolute quarantine directory for holds that decide nothing. */
  readonly quarantine: string;
  /** Goal-relative path of a queue, or a file in it; prompts carry it. */
  rel(queue: MailboxQueue, name?: string): string;
  /** Reads a queue file; null when absent. */
  read(queue: MailboxQueue, name: string): Promise<string | null>;
  /** Writes a queue file atomically; materializes the queue directory. */
  write(queue: MailboxQueue, name: string, text: string): Promise<void>;
  /** Publishes a steer through the private tmp dir, then renames it in. */
  publish(name: string, text: string): Promise<void>;
  /** Renames between queues; false when the source is gone. */
  move(
    from: MailboxQueue,
    fromName: string,
    to: MailboxQueue,
    toName: string,
  ): Promise<boolean>;
  /** Removes a queue file; absent is a no-op. */
  remove(queue: MailboxQueue, name: string): Promise<void>;
  /** Non-dot files directly in a queue, sorted. */
  files(queue: MailboxQueue): Promise<string[]>;
  /** Sizes of those files, by name, for the inbox settle check. */
  sizes(queue: MailboxQueue): Promise<Map<string, number>>;
}

export interface ArtifactStore {
  readonly goalDir: string;
  /** The store's areas, each owning its files and the paths they live at. */
  readonly records: RecordStore;
  readonly tasks: TaskStore;
  readonly plans: PlanStore;
  readonly mailbox: MailboxStore;
  readonly iterations: IterationStore;
  /**
   * Absolute path of an artifact without touching the disk. Prompts carry it;
   * a writer uses `localPath` so its parent exists.
   */
  pathOf(ref: ArtifactRef): string;
  /** Absolute path of an artifact, its parent directory created. */
  localPath(ref: ArtifactRef): Promise<string>;
  /**
   * Raw directories below are the folder backend's layout, kept for the
   * unchanged suite; kernel modules reach artifacts through the areas above.
   */
  readonly tasksDir: string;
  readonly recordsDir: string;
  readonly mailboxDir: string;
  readonly iterationsDir: string;
  ensureLayout(): Promise<void>;
  /** Goal-relative read; null when absent. */
  readFile(rel: string): Promise<string | null>;
  /** Goal-relative write; declares the path in the kernel write ledger. */
  writeFile(rel: string, text: string): Promise<void>;
  /** Goal-relative directory listing, sorted; empty when absent. */
  listDir(rel: string): Promise<string[]>;
  listTasks(): Promise<TaskFile[]>;
  scanTaskFindings(): Promise<TaskFileFinding[]>;
  sweepTasks(iteration: number): Promise<void>;
  readTask(slug: string): Promise<TaskFile | null>;
  writeTask(task: TaskFile): Promise<void>;
  startRecord(meta: RecordStart): Promise<TurnRecord>;
  appendRecord(meta: RecordStart, end: RecordEnd): Promise<StepRecord>;
  /** Includes unfinished records (started, no end); sorted by seq. */
  listRecords(): Promise<StepRecord[]>;
  /**
   * Every goal-dir write this process's kernel declared, in order. Process
   * local: one launch owns a goal (the run lock), so no other process writes
   * its artifacts while a turn is contained.
   */
  declaredWrites(): readonly DeclaredWrite[];
}

/** A runner whose printed failure report the kernel parses by name. */
export type GatePattern = "pytest" | "jest" | "cargo";

/** One repo gate command and the shared resources it needs to itself. */
export interface GateConfig {
  id: string;
  command: string;
  /**
   * Mutex names held while this gate runs. Within one factory process, gates
   * naming the same mutex never overlap, in one run or in concurrent runs in
   * other worktrees; a gate that names none never waits for one.
   */
  serial: string[];
  /**
   * Environment variables mapped to worktree-relative directories. The kernel
   * creates them and exports absolute paths, so two worktrees get two dirs.
   */
  env?: Record<string, string>;
  /**
   * `junit` names the worktree-relative report the command writes before it
   * exits; `pattern` names a runner whose printed failures the kernel reads.
   */
  format?: { junit?: string; pattern?: GatePattern };
}

/**
 * How the kernel stores one goal's artifacts. The backend is selected by name,
 * never by where a path happens to point.
 *
 * - `folder`: a plain directory, gitignored when it lives inside the repo.
 * - `same-repo`: a directory inside the repo, committed after every kernel
 *   write so orchestration artifacts are never left unmerged on a branch.
 * - `git-repo`: a separate git repository, committed and pushed after every
 *   write.
 */
export type ArtifactBackend = "folder" | "same-repo" | "git-repo";

export interface ArtifactBackendConfig {
  backend: ArtifactBackend;
  /**
   * Store location, repo-relative or absolute. Defaults to `artifactRoot` for
   * `folder`/`same-repo` and to `<worktreeRoot>/artifacts` for `git-repo`.
   */
  root?: string;
  /**
   * `git-repo` only: the separate repository to clone and push. A local path is
   * resolved against the main repository; anything with a scheme is passed
   * through unchanged.
   */
  remote?: string;
}

/** A backend resolved against one repository and goal. */
export interface ArtifactLocation {
  backend: ArtifactBackend;
  /** Absolute directory holding every goal's artifacts. */
  root: string;
  /** `git-repo` only: the resolved remote, when one is configured. */
  remote?: string;
}

export interface RepoConfig {
  baseBranch: string;
  /** Goal directories live at <repo>/<artifactRoot>/<goal> unless a backend names another root. */
  artifactRoot: string;
  /** How artifacts are stored; absent reads as the plain folder backend. */
  artifacts?: ArtifactBackendConfig;
  identity?: { name: string; email: string };
  setup: string[];
  gates: GateConfig[];
  cleanliness?: {
    maxFileSizeBytes?: number;
    allowedExtensions?: string[];
  };
}

export interface ProcessConfig {
  flows: Record<string, FlowDefinition>;
  /**
   * Task type name -> what a task file naming it runs. The type owns the
   * flow, kind and output schema; a task file names only the type.
   */
  taskTypes: Record<string, TaskTypeDefinition>;
  /** Each kernel boundary step's prompt and alias; pre-flight requires these aliases. */
  boundary: Record<BoundaryStep, TurnSpec>;
  /** The plan review flow that completes before the PM derives tasks. */
  architecture: ArchitectureConfig;
  /** Hierarchy depth and the epic architect's prompt; absent reads as depth 1. */
  hierarchy?: HierarchyConfig;
  /** Repair template a step renders when it names none; defaults to `delivery-repair`. */
  repairPrompt?: string;
  /** Outcome reminders after the first attempt; a task file's `repairTurns` overrides it for that task's turns only. */
  reminders: number;
  calibration?: string;
  promptsDir?: string;
  presets?: Record<string, { calibration: string }>;
}

/** One fallback tier: another alias's whole ladder, or a model with its own effort. */
export type FallbackConfig = FallbackAliasConfig | FallbackModelConfig;

/** A fallback that reuses another alias's ladder, primary first. */
export interface FallbackAliasConfig {
  /** Run-config alias whose primary and fallback tiers this entry contributes. */
  alias: string;
}

/** A fallback that names a model on the alias's harness or another, with its own effort. */
export interface FallbackModelConfig {
  /** Harness id; defaults to the alias's harness. */
  harness?: string;
  model: string;
  /** Effort level; defaults to the alias's resolved effort. */
  effort?: string;
  /** Quota pool this tier draws on; defaults to the alias's subscription. */
  subscription?: string;
}

/** One rotation entry: the alias's primary harness, model and effort for an iteration. */
export interface AliasEntry {
  harness: string;
  model: string;
  effort?: string;
}

export interface AliasConfig {
  harness: string;
  model: string;
  effort?: string;
  /**
   * Per-iteration primaries: iteration N resolves `rotate[N % rotate.length]`.
   * Absent or empty keeps the alias's own harness and model on every iteration.
   */
  rotate?: AliasEntry[];
  /** Quota pool this alias draws on; absent means throttled only overall. */
  subscription?: string;
  fallbacks?: FallbackConfig[];
  /** Alias the PM ladder climbs to after a tier fails; absent ends the ladder. */
  escalateTo?: string;
  /** Alias-level turn bounds; config defaults match `DEFAULT_TIMEOUTS`. */
  timeouts?: Timeouts;
}

/** One run-config harness entry: an adapter binding, executable override or opaque options. */
export interface HarnessConfig {
  /** Adapter binding; absent for a native adapter that only takes a binary. */
  acpx?: import("../harness/acpx/config.js").AcpxConfig;
  /** Executable override; absent resolves through PATH. */
  binary?: string;
  /** Opaque adapter options: acpx `args`/`env`, omp overlay keys. */
  options?: Record<string, unknown>;
}

export interface RunConfig {
  aliases: Record<string, AliasConfig>;
  /** Harness id -> adapter binding, binary override or opaque options. */
  harnesses?: Record<string, HarnessConfig>;
  /** Extra environment names a spawned harness or agent inherits. */
  envAllowlist?: string[];
  /** Harness model id -> OpenRouter model id, for ids matching cannot resolve. */
  priceIds?: Record<string, string>;
  limits: {
    concurrency: {
      overall: number;
      perSubscription: Record<string, number>;
      perModel: Record<string, number>;
    };
    iterations: number;
    /** Plan-checker re-runs per iteration; exhausted rounds consult the architect. */
    planCheckRounds: number;
    /** Resume attempts limit; default 2. */
    resumeAttempts?: number;
    turns?: number;
    wallMinutes?: number;
    /** Optional USD brake: crossing it drains the iteration. */
    iterationUsd?: number;
    /** Per-turn wall bound in minutes; caps the alias wall timeout. */
    turnMinutes?: number;
    /** Per-iteration wall bound in minutes; folds into `iterationWallMs`. */
    iterationMinutes?: number;
    /** Minimum free bytes in the temporary directory. */
    minTmpFreeBytes?: number;
  };
  sessions: { dir: string; keepRuns: number; retention: "short" | "long" };
  /**
   * Quota-pool cooldown: a quota stop's stated reset sets the pool's skip
   * window, capped by `maxResetMinutes` when set; without a stated reset the
   * window is `resetMinutes` from the stop (default 300).
   */
  quota?: { resetMinutes: number; maxResetMinutes?: number };
  worktreeRoot?: string;
  /** Enable artifact LSP where the harness supports it. */
  lsp?: boolean;
  /** Cheap model pinned for architect subagents. */
  scouts?: { model: string; effort?: string };
  preset?: string;
  /** Directional harness edges across which a session may be resumed. */
  portability?: { from: string; to: string }[];
}

/** Absolute paths of the three layers, for findings that must name the file. */
export interface ConfigFiles {
  repo: string;
  processDefault: string;
  processOverride: string;
  run: string;
}

export interface ConfigBundle {
  repo: RepoConfig;
  process: ProcessConfig;
  run: RunConfig;
  files?: ConfigFiles;
}

export interface GoalPaths {
  repoRoot: string;
  goalDir: string;
  goalCheckout: string;
  integrationBranch: string;
  worktreeRoot: string;
  sessionsDir: string;
  /** The resolved artifact backend and the root holding every goal. */
  artifacts: ArtifactLocation;
}

/** Everything a boundary or flow step needs; built once by the launch. */
export interface KernelRuntime {
  paths: GoalPaths;
  configs: ConfigBundle;
  repo: Repo;
  store: ArtifactStore;
  harnesses: ReadonlyMap<string, Harness>;
  prompts: PromptLibrary;
  limits: Limits;
  /**
   * Quota pool keys (subscription, or harness+model when none) latched by a
   * quota stop, mapped to the epoch ms they may serve again. Loaded from the
   * session store at launch, so a relaunch before a stored reset skips the
   * pool; turns skip tiers drawing on a pool until its reset time.
   */
  exhaustedPools: Map<string, number>;
  /** Price cache and fetcher; undefined means the shared cache plus network. */
  priceSource?: PriceSource;
}
