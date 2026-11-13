/**
 * Kernel-0 public shapes (KERNEL0 §4). Everything the shell writes is derived
 * from task files plus append-only step records; nothing here is stored state.
 */
import { z } from "zod";
import type { Harness, ModelRef, SessionRef, Stop, Usage } from "../harness/types.js";
import type { CheckResult } from "../core/checks/types.js";
import type { Repo } from "../core/git/repo.js";
import type { PromptLibrary } from "../core/prompts.js";

export const concernSchema = z.object({
  kind: z.enum(["debt", "risk", "uncertainty", "choice"]),
  calibration: z.enum(["fyi", "architect", "owner"]),
  text: z.string().min(1),
  evidence: z.string().optional(),
});

/** The only agent ↔ script surface; one schema for every step. */
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
export type ReviewVerdict = NonNullable<Outcome["verdict"]>;
export type GoalDecision = NonNullable<Outcome["decision"]>;
export type TaskKind = "task" | "spike";

export interface TaskFile {
  slug: string;
  title: string;
  kind: TaskKind;
  flow: string;
  deps: string[]; scope: string[]; tier?: string;
  /** A parked task whose kept branch this task continues from. */
  base?: string;
  /** Plan heading this task derives from. */
  source: string;
  body: string;
}

export type TaskStatus = "pending" | "ready" | "running" | "merged" | "finished" | "parked" | "cancelled";
export type TaskPhase = "implement" | "review" | "merge" | "finish" | "parked" | "done";

export interface TaskState {
  status: TaskStatus;
  cause?: string;
  /** Non-infra agent turns spent on this slug (item budget). */
  turns: number;
  /** Current implementation/review round, 1-based. */
  round: number;
  kind: TaskKind; flow: string; phase: TaskPhase;
  commit?: string; verdict?: ReviewVerdict;
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

/** Idle is separate from wall: a long tool call streams nothing but is not stuck. */
export interface Timeouts {
  idleMs: number;
  wallMs: number;
}

/** A full test-suite run can stream nothing for many minutes. */
export const DEFAULT_TIMEOUTS: Timeouts = { idleMs: 20 * 60_000, wallMs: 60 * 60_000 };

/**
 * One append-only record, materialized from `records/<dir>/`: `started.yaml`
 * exists before a turn, `end.yaml` commits it, `outcome.yaml` holds the agent's
 * accepted outcome. Script steps have actor `script` and no outcome.
 */
export interface StepRecord {
  seq: number;
  iteration: number;
  slug?: string; step: string;
  round: number; actor: StepActor;
  /** Agent steps only; `model` is the model actually used when reported. */
  alias?: string;
  model?: ModelRef;
  /** Task hash at dispatch, for the frozen-task check. */
  taskHash?: string;
  /** Integration head (or parked branch tip) the branch started from. */
  base?: string;
  stop?: Stop; usage?: Usage;
  session?: SessionRef; commit?: string;
  /** Raw stream transcript in the session store, when the harness keeps one. */
  transcript?: string;
  checks?: CheckResult[]; outcome?: Outcome;
  ok?: boolean; cause?: string;
  startedAt: string; endedAt?: string;
}

/** Input of one turn/script step, written before the turn starts. */
export interface RecordStart {
  iteration: number;
  slug?: string; step: string;
  round: number; actor: StepActor;
  alias?: string;
  model?: ModelRef;
  taskHash?: string;
  base?: string;
}

/** Settled fields written atomically as `end.yaml`. */
export interface RecordEnd {
  /** Set when the harness reports the model actually used (S1 contract). */
  model?: ModelRef;
  stop?: Stop; usage?: Usage; session?: SessionRef;
  transcript?: string;
  commit?: string; checks?: CheckResult[]; outcome?: Outcome;
  ok?: boolean; cause?: string;
}

/** Handle for an in-flight turn; the directory exists but has no end. */
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
  /** Alias-level turn bounds; config defaults match `DEFAULT_TIMEOUTS`. */
  timeouts?: Timeouts;
}

export interface RunConfig {
  aliases: Record<string, AliasConfig>;
  limits: { concurrency: number; perHarness: Record<string, number>; iterations: number };
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
