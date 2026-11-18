/**
 * Kernel-0 public shapes (KERNEL0 §4). Everything the shell writes is derived
 * from task files plus append-only step records; nothing here is stored state.
 */
import { z } from "zod";
import type { CheckResult } from "../core/checks/types.js";
import type { Repo } from "../core/git/repo.js";
import type { PromptLibrary } from "./prompts.js";
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

export const concernSchema = z.object({
  kind: z.enum(["debt", "risk", "uncertainty", "choice"]),
  calibration: z.enum(["fyi", "architect", "owner"]),
  text: z.string().min(1),
  evidence: z.string().optional(),
});

/** One fix turn's answer to a prior review finding, by its numbered position. */
export const replySchema = z.object({
  finding: z.number().int().positive(),
  reply: z.string().min(1),
});
/** Where the PM's steer turn sends one steer: handled now, a new task, the architect, or drain-then-architect. */
export const steerRouteSchema = z.enum(["task", "spike", "architect", "stall"]);
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

/** The only agent ↔ script surface; one schema for every step. Field
 * descriptions render into the outcome prompt skeleton, so they are the
 * prompt-facing wording; comments below keep kernel-only behavior. */
export const outcomeSchema = z.object({
  status: z
    .enum(["done", "blocked", "failed", "upscope"])
    .describe("upscope on task steps only"),
  summary: z.string().describe("one paragraph"),
  concerns: z.array(concernSchema).default([]),
  forward: z.array(z.string()).default([]),
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

export interface TaskState {
  status: TaskStatus;
  cause?: string;
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
  park?: string;
  /** No-progress over the item's history; the next action is the loop park. */
  loop?: ProgressRepeat;
  /** A red gate run sent the task back to implement: the fix turn resumes its session, and only a merged-result fix skips the next review. */
  gateFix?: boolean;
  /** True when this gate-fix turn is the last allowed fix turn before red gates park. */
  gateLastCall?: boolean;
}

export type GoalStatus = "active" | "done" | "blocked";

export interface State {
  goal: GoalStatus;
  /** Highest iteration seen in records; 0 before the first boundary turn. */
  iteration: number;
  terminal: boolean;
  /** The current iteration was interrupted with ready work left; a relaunch resumes it. */
  interrupted: boolean;
  tasks: Record<string, TaskState>;
}

export type Action =
  | { kind: "step"; slug: string; step: string; round: number }
  | { kind: "checks"; slug: string }
  | { kind: "merge"; slug: string }
  | { kind: "finish"; slug: string }
  | { kind: "park"; slug: string; cause: string }
  | { kind: "boundary" }
  | { kind: "exit"; reason: string };

export interface FlowStep {
  id: string;
  role?: string;
  /** Review steps carry the verdict contract and consume a review round. */
  review?: boolean;
  /**
   * Review and checks steps: how many change requests this step may issue before
   * its call is the last one. Absent means the default (two).
   */
  changeRequests?: number;
}

/** How a fix turn follows the turn it repairs. */
export interface FollowUp {
  mode: "same-session" | "de-novo" | "different-model";
  /** Role (and therefore alias/prompt) used when mode is `different-model`. */
  role?: string;
}

export interface FlowDefinition {
  steps: FlowStep[];
  followUp?: FollowUp;
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
}

export type StepActor = "agent" | "script";

/**
 * Why a launch ran again: a technical glitch (infra stop or fallback hop),
 * a bona fide change request (a review `changes`), or a bona fide failure
 * (agent `failed`/`blocked` or no outcome after reminders).
 */
export type LaunchKind = "glitch" | "change-request" | "failure";

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
  checks?: CheckResult[];
  /** Files and lines the turn's commit changed, measured at commit time. */
  edits?: WorkEdits;
  /** Gates run by this record; checks records only. */
  testRuns?: number;
  /** Wall time in ms; checks/commit records stamp the gate/commit run itself. */
  wallMs?: number;
  outcome?: Outcome;
  ok?: boolean;
  cause?: string;
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
  /** Incident launches only: why this launch ran again. */
  launchKind?: LaunchKind;
  commit?: string;
  tree?: string;
  /** base-advance only: integration head tree at the creation advance. */
  headTree?: string;
  checks?: CheckResult[];
  edits?: WorkEdits;
  testRuns?: number;
  wallMs?: number;
  outcome?: Outcome;
  ok?: boolean;
  cause?: string;
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

export interface ArtifactStore {
  readonly goalDir: string;
  readonly tasksDir: string;
  readonly recordsDir: string;
  readonly mailboxDir: string;
  readonly iterationsDir: string;
  ensureLayout(): Promise<void>;
  /** Goal-relative read; null when absent. */
  readFile(rel: string): Promise<string | null>;
  writeFile(rel: string, text: string): Promise<void>;
  /** Goal-relative directory listing, sorted; empty when absent. */
  listDir(rel: string): Promise<string[]>;
  listTasks(): Promise<TaskFile[]>;
  readTask(slug: string): Promise<TaskFile | null>;
  writeTask(task: TaskFile): Promise<void>;
  startRecord(meta: RecordStart): Promise<TurnRecord>;
  appendRecord(meta: RecordStart, end: RecordEnd): Promise<StepRecord>;
  /** Includes unfinished records (started, no end); sorted by seq. */
  listRecords(): Promise<StepRecord[]>;
}

export interface RepoConfig {
  baseBranch: string;
  /** Goal directories live at <repo>/<artifactRoot>/<goal>. */
  artifactRoot: string;
  worktreeRoot?: string;
  identity?: { name: string; email: string };
  setup: string[];
  gates: {
    id: string;
    command: string;
    format?: { junit?: string; pattern?: "pytest" | "jest" | "cargo" };
  }[];
}

export interface RoleConfig {
  /** Prompt template name under `prompts/`. */
  prompt: string;
  /** Run-config alias; defaults to the role name. */
  alias?: string;
}

export interface ProcessConfig {
  flows: Record<string, FlowDefinition>;
  /**
   * Task type name -> what a task file naming it runs. The type owns the
   * flow, kind and output schema; a task file names only the type.
   */
  taskTypes?: Record<string, TaskTypeDefinition>;
  roles: Record<string, RoleConfig>;
  /** Outcome reminders after the first attempt; a task file's `repairTurns` overrides it for that task's turns only. */
  reminders: number;
  calibration?: string;
  promptsDir?: string;
  presets?: Record<string, { calibration: string }>;
}

/** One fallback tier: a model on the alias's harness or another, with its own effort. */
export interface FallbackConfig {
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

/** One run-config harness entry: an adapter binding or an executable override. */
export interface HarnessConfig {
  /** Adapter binding; absent for a native adapter that only takes a binary. */
  acpx?: import("../harness/acpx/config.js").AcpxConfig;
  /** Executable override; absent resolves through PATH. */
  binary?: string;
}

export interface RunConfig {
  aliases: Record<string, AliasConfig>;
  /** Harness id -> adapter or binary override; native omp takes only a binary. */
  harnesses?: Record<string, HarnessConfig>;
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
    turns?: number;
    wallMinutes?: number;
    /** Optional USD brake: crossing it drains the iteration. */
    iterationUsd?: number;
    /** Per-turn wall bound in minutes; caps the alias wall timeout. */
    turnMinutes?: number;
    /** Per-iteration wall bound in minutes; folds into `iterationWallMs`. */
    iterationMinutes?: number;
  };
  sessions: { dir: string; keepRuns: number; retention: "short" | "long" };
  worktreeRoot?: string;
  /** Enable artifact LSP where the harness supports it. */
  lsp?: boolean;
  /** Cheap model pinned for architect subagents. */
  scouts?: { model: string; effort?: string };
  preset?: string;
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
   * Quota pool keys (subscription, or harness+model when none) exhausted during
   * this launch. Subsequent turns skip tiers drawing on these pools.
   */
  exhaustedPools: Set<string>;
  /** Price cache and fetcher; undefined means the shared cache plus network. */
  priceSource?: PriceSource;
}
