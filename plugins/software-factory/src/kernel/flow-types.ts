/** The flow's public shapes: front class, turn targets, sessions, step state and timeouts. */

import { z } from "zod";
import type {
  Harness,
  InfraCause,
  ModelRef,
  SessionRef,
  TurnRequest,
} from "../harness/types.js";
import type { ConflictSnapshot } from "./merge-conflict.js";
import type {
  AdmittedTier,
  Cause,
  FlowDefinition,
  FlowStep,
  KernelRuntime,
  StepRecord,
  TaskFile,
  TaskState,
  Timeouts,
} from "./types.js";

export const classSchema = z
  .object({
    class: z.enum(["trivial", "task", "bigger"]),
    slug: z.string().min(1).optional(),
  })
  .strict();

export type FrontClass = z.infer<typeof classSchema>;

/** The review turn whose ended session is being compacted: step role and 1-based round. */
export interface CompactionReview {
  review: boolean;
  round: number;
}

/** The session a trivial implement turn resumes, or why the task parks instead. */
export type TrivialResume = { session: SessionRef } | { cause: Cause };

/** Why a turn is rendered the resume fragment. */
export type ResumeReason = "relaunch" | "fallback" | "trivial";

/** The facts the resume fragment renders; empty strings for the parts a reason does not use. */
export interface ResumeNoteOptions {
  branch?: string;
  worktree?: string;
  sessionCwd?: string;
}

/** One resolved fallback tier: the harness, model, effort and quota pool one call draws on. */
export interface ResolvedTier {
  harness: Harness;
  model: ModelRef;
  effort?: string;
  subscription?: string;
  /** Harness configuration passed through `TurnRequest.opaque`. */
  opaque?: unknown;
}

/** Everything one turn needs to run: the resolved prompt, alias, harness, model and its own limits. */
export interface TurnTarget {
  /** Prompt template the turn renders; the role the agent acts as. */
  prompt: string;
  alias: string;
  /** Repair template the step named; absent renders `delivery-repair`. */
  repairPrompt?: string;
  /** Ask for a turn that settled no outcome at all; absent keeps the repair ask. */
  unfinishedPrompt?: string;
  /** Product the step named; absent derives from the turn's expectation. */
  deliverable?: string;
  harness: Harness;
  model: ModelRef;
  effort?: string;
  subscription?: string;
  /**
   * Effective fallback chain, primary first: tiers whose quota pool is recorded
   * in `exhaustedPools` are dropped, so `[0]` mirrors the fields above. Empty
   * when every tier is exhausted: no call may run, and `unavailable` says why.
   */
  tiers: ResolvedTier[];
  /**
   * Why no tier can serve this turn: every tier's quota pool is exhausted.
   * `harness`, `model` and `opaque` name the chain's last tier for bookkeeping,
   * but a turn must not call it; dispatch defers the work under this cause.
   */
  unavailable?: string;
  /** Chain index `tiers[0]` had in the alias's configured chain before exhausted tiers were dropped; the chain length when none is left. */
  tierOffset: number;
  timeouts?: Timeouts;
  /** Harness configuration passed through `TurnRequest.opaque`. */
  opaque?: unknown;
}

export interface TaskMeta {
  iteration: number;
  slug: string;
  round: number;
  revision: number;
  architect?: string;
}

export interface TaskActionResult {
  /** The classified fault, unflattened so dispatch can judge its cause. */
  infra?: { cause: InfraCause; details?: string };
  cancelled?: boolean;
}

export interface TaskGateRun extends TaskActionResult {
  checks: import("../core/checks/types.js").CheckResult[];
}

type Contained = Awaited<
  ReturnType<typeof import("./worktree.js").containmentSnapshot>
>;
type TurnTimeouts = NonNullable<TurnRequest["timeouts"]>;

/** The mutable progress of one step's preparation; helpers fill it in phases. */
export interface StepRun {
  runtime: KernelRuntime;
  task: TaskFile;
  state: TaskState;
  iteration: number;
  step: FlowStep;
  flow: FlowDefinition;
  records: StepRecord[];
  ensured: Job;
  fix: boolean;
  resolveStep: boolean;
  amendedFirstTurn: boolean;
  keptBranch: boolean;
  pendingResolve: { head: string; paths: string[] } | null;
  resolveIsCreation: boolean;
  resolveIsFirstTurn: boolean;
  startPoint: string;
  preexisting: Set<string>;
  resolve?: {
    head: string;
    conflicts: string[];
    snapshot: ConflictSnapshot;
  };
  target?: TurnTarget;
  /** The leg admission chose; absent is the alias's primary. */
  tier?: AdmittedTier;
  session?: SessionRef;
  trivial: boolean;
  /** This step's turn continues one recovery sealed as a bare crash. */
  relaunch: boolean;
  turnCwd?: string;
  vars?: Record<string, string>;
  baseHash?: string;
  lastCall: boolean;
  contained?: Contained;
  timeouts?: TurnTimeouts;
  tracked?: TimeoutTracker;
  startHead?: string;
  breach?: string;
}

/**
 * A harness turn that outlives the wall bound keeps running after the agent's
 * race synthesizes its timeout result. The tracker sees the orphan the agent
 * abandoned: still pending at settle, or finished past the bound. An adapter
 * that reports timeout promptly (elapsed under the bound) is not an orphan;
 * its writes are final and settle commits them through the kept-outcome rule.
 */
export interface TimeoutTracker {
  harnesses: Harness[];
  timedOut: () => boolean;
  waitSettled: () => Promise<void>;
}

export type Job = Awaited<
  ReturnType<typeof import("./worktree.js").ensureTaskWorktree>
>;

export type Opened = { ensured: Job } | { result: Record<string, never> };
