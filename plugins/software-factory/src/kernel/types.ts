/**
 * Kernel-0 public shapes (KERNEL0 §4). Everything the shell writes is derived
 * from task files plus append-only step records; nothing here is stored state.
 */
import { z } from "zod";
import type { Harness, ModelRef, SessionRef, Stop, Usage } from "../harness/types.js";
import type { CheckResult } from "../core/checks/types.js";
import type { Repo } from "../core/git/repo.js";
import type { PromptLibrary } from "../core/prompts.js";

/** Outcome kinds and calibration levels are closed: one schema for every step. */
export const concernSchema = z.object({
  kind: z.enum(["debt", "risk", "uncertainty", "choice"]),
  calibration: z.enum(["fyi", "architect", "owner"]),
  text: z.string().min(1),
  evidence: z.string().optional(),
});

export const outcomeSchema = z.object({
  status: z.enum(["done", "blocked", "failed", "upscope"]),
  summary: z.string(),
  concerns: z.array(concernSchema).default([]),
  forward: z.array(z.string()).default([]),
  verdict: z.enum(["approve", "changes", "reject"]).optional(),
  decision: z.enum(["continue", "done", "blocked"]).optional(),
});

export type Concern = z.infer<typeof concernSchema>;
export type Outcome = z.infer<typeof outcomeSchema>;
export type OutcomeStatus = Outcome["status"];
export type ReviewVerdict = NonNullable<Outcome["verdict"]>;
export type GoalDecision = NonNullable<Outcome["decision"]>;

export type TaskKind = "task" | "spike";

/** One PM-derived task file; `body` is the brief below the frontmatter. */
export interface TaskFile {
  slug: string;
  title: string;
  kind: TaskKind;
  flow: string;
  deps: string[];
  scope: string[];
  tier?: string;
  /** Slug of a parked task whose kept branch this task continues from. */
  base?: string;
  /** Plan heading this task derives from. */
  source: string;
  body: string;
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
 * What the shell must do next for a task. Derived from the record sequence;
 * `next` maps it to an action and applies the round/item limits.
 */
export type TaskPhase = "implement" | "review" | "merge" | "finish" | "parked" | "done";

export interface TaskState {
  status: TaskStatus;
  cause?: string;
  /** Non-infra agent turns spent on this slug (item budget). */
  turns: number;
  /** Current implementation/review round, 1-based. */
  round: number;
  kind: TaskKind;
  flow: string;
  phase: TaskPhase;
  /** Last commit produced by the slug (implement commit or merge commit). */
  commit?: string;
  verdict?: ReviewVerdict;
}

export type GoalStatus = "active" | "done" | "blocked";

export interface State {
  goal: GoalStatus;
  /** Highest iteration seen in records; 0 before the first boundary turn. */
  iteration: number;
  terminal: boolean;
  tasks: Record<string, TaskState>;
}

export type Action =
  | { kind: "step"; slug: string; step: string; round: number }
  | { kind: "merge"; slug: string }
  | { kind: "finish"; slug: string }
  | { kind: "park"; slug: string; cause: string }
  | { kind: "boundary" }
  | { kind: "exit"; reason: string };

export interface FlowStep {
  id: string;
  role: string;
  /** Review steps carry the verdict contract and consume a review round. */
  review?: boolean;
}

export interface FlowDefinition {
  steps: FlowStep[];
  reviewRounds: number;
}

/** Limits the pure `next` needs; resolved from the three config layers. */
export interface Limits {
  itemTurns: number;
  flows: Record<string, Pick<FlowDefinition, "reviewRounds">>;
  iterations: number;
  concurrency: number;
  perHarness: Record<string, number>;
}

export type StepActor = "agent" | "script";

/**
 * One append-only record, materialized from `records/<dir>/`:
 * `started.yaml` exists before a turn, `end.yaml` commits it, `outcome.yaml`
 * holds the agent's raw outcome. Script steps (checks, merge, park, finish)
 * have actor `script` and no outcome.
 */
export interface StepRecord {
  seq: number;
  iteration: number;
  slug?: string;
  step: string;
  round: number;
  actor: StepActor;
  /** Agent steps only. `model` is the model actually used when the harness reports it. */
  alias?: string;
  model?: ModelRef;
  /** Task file hash captured when the task was dispatched (frozen-task check). */
  taskHash?: string;
  /** Integration head the task branch started from. */
  base?: string;
  stop?: Stop;
  usage?: Usage;
  session?: SessionRef;
  commit?: string;
  checks?: CheckResult[];
  outcome?: Outcome;
  /** Script result; absent for agent steps that have not started/ended. */
  ok?: boolean;
  cause?: string;
  startedAt: string;
  endedAt?: string;
}

/** Input of one turn/script step, written before the turn starts. */
export interface RecordStart {
  iteration: number;
  slug?: string;
  step: string;
  round: number;
  actor: StepActor;
  /** Agent steps only; script records carry neither. */
  alias?: string;
  model?: ModelRef;
  taskHash?: string;
  base?: string;
}

/** Settled fields written atomically as `end.yaml`. */
export interface RecordEnd {
  stop?: Stop;
  usage?: Usage;
  session?: SessionRef;
  commit?: string;
  checks?: CheckResult[];
  outcome?: Outcome;
  ok?: boolean;
  cause?: string;
}

/** Handle for an in-flight turn; the record directory exists but has no end. */
export interface TurnRecord {
  dir: string;
  meta: StepRecord;
  /** Absolute path the agent writes its outcome file to. */
  outcomePath: string;
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
  gates: { id: string; command: string }[];
}

export interface RoleConfig {
  /** Prompt template name under `prompts/`. */
  prompt: string;
  /** Run-config alias; defaults to the role name. */
  alias?: string;
}

export interface ProcessConfig {
  flows: Record<string, FlowDefinition>;
  roles: Record<string, RoleConfig>;
  itemTurns: number;
  calibration?: string;
  promptsDir?: string;
}

export interface AliasConfig {
  harness: string;
  model: string;
  effort?: string;
  fallbacks?: string[];
}

export interface RunConfig {
  aliases: Record<string, AliasConfig>;
  limits: {
    concurrency: number;
    perHarness: Record<string, number>;
    iterations: number;
  };
  sessions: { dir: string; keepRuns: number };
  worktreeRoot?: string;
}

export interface ConfigBundle {
  repo: RepoConfig;
  process: ProcessConfig;
  run: RunConfig;
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
}
