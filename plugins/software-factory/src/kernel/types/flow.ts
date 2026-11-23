/** Flow, architecture and step definitions. */

/** Built-in ingestion step ids that bind to kernel execution. */
export const BUILTIN_INGESTION_IDS = ["branch", "front"] as const;
export type BuiltinIngestionId = (typeof BUILTIN_INGESTION_IDS)[number];

export type IngestionWhenClass = "trivial" | "task" | "bigger";

/** One ingestion step from process config. */
export interface IngestionStepConfig {
  id: string;
  prompt?: string;
  alias?: string;
  deliverable?: string;
  /** Goal classes this step runs for; absent runs for every class. */
  when?: IngestionWhenClass[];
}

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
  /**
   * Steps that must complete before this one becomes ready. Absent on a plain
   * linear flow: the list order is the dependency. Steps keep their list slot
   * as the topological tiebreak, so ready steps keep sequential execution in
   * list order; checks and the merge stay at the flow's end.
   */
  after?: string[];
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
  /**
   * Flow-shape flag the loader sets: a config that names any `after` edge.
   * Derive and gate dispatch only branch on it; a plain listing keeps the
   * linear machine byte for byte.
   */
  dag?: boolean;
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
