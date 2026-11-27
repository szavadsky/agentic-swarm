/** Repository, run and fallback configuration shapes. */

import type { FindingSeverity } from "../../core/checks/findings.js";
import type { Repo } from "../../core/git/repo.js";
import type { SandboxCommand } from "../../core/sandbox.js";
import type { SemaphoreDeclaration } from "../../core/semaphores-types.js";
import type { CacheTtl, Harness } from "../../harness/types.js";
import type { PriceSource } from "../openrouter.js";
import type { PromptLibrary } from "../prompts.js";
import type { PoolReset } from "../quota-pools.js";
import type {
  ArchitectureConfig,
  BoundaryStep,
  FlowDefinition,
  HierarchyConfig,
  IngestionStepConfig,
  Limits,
  PmConfig,
  Timeouts,
  TurnSpec,
} from "./flow.js";
import type { StallDecision } from "./outcome.js";
import type { ArtifactStore } from "./records.js";
import type { CauseKind } from "./state.js";
import type { TaskTypeDefinition } from "./tasks.js";

/** A repo-declared regex over a gate log for a tool that emits no report. */
export interface GateRegex {
  pattern: string;
  tool?: string;
  rule?: string;
  severity?: FindingSeverity;
}

/** One repo gate command and the shared resources it needs to itself. */
export interface GateConfig {
  id: string;
  command: string;
  /**
   * Mutex names held while this gate runs. Same-named gates in any worktree of
   * one repository never overlap; different repositories never wait for each
   * other because the key includes the repository.
   */
  serial: string[];
  /** Semaphores held for this gate's command; absent holds none. */
  semaphores?: string[];
  /**
   * Environment variables mapped to worktree-relative directories. The kernel
   * creates them and exports absolute paths, so two worktrees get two dirs.
   */
  env?: Record<string, string>;
  /**
   * Report paths the command writes before it exits, or the log regexes and
   * noise patterns that normalise its findings when it writes no report.
   * `junit` is converted to CTRF with `junit-to-ctrf`; `ctrf` and `sarif` are
   * read natively.
   */
  format?: {
    junit?: string;
    ctrf?: string;
    sarif?: string;
    regex?: GateRegex[];
    noise?: string[];
  };
  /**
   * Wall for this gate's command, in seconds. Absent or not a positive finite
   * number falls back to `GATE_TIMEOUT_SEC`; it never disables the timeout.
   */
  timeoutSec?: number;
  /**
   * A red from this gate is recorded and shown, never blocking. Absent or
   * false gates the tree.
   */
  advisory?: boolean;
}

/**
 * How the kernel stores one goal's artifacts. The backend is selected by name,
 * never by where a path happens to point.
 *
 * - `folder`: a plain directory, gitignored when it lives inside the repo.
 * - `same-repo`: a directory inside the repo, committed after every kernel
 *   write and replayed onto the goal branch, so orchestration artifacts are
 *   never left unmerged on a task branch.
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

/** One cause's default park route: the action this repo's history points to and
 * the evidence that overrides it. */
export interface ParkRouteConfig {
  action: StallDecision;
  reason: string;
  exception: string;
}

/** The routes a repo declares, keyed by the closed cause vocabulary. */
export type ParkRoutes = Partial<Record<CauseKind, ParkRouteConfig>>;

export interface RepoConfig {
  baseBranch: string;
  /** Goal directories live at <repo>/<artifactRoot>/<goal> unless a backend names another root. */
  artifactRoot: string;
  /** How artifacts are stored; absent reads as the plain folder backend. */
  artifacts?: ArtifactBackendConfig;
  identity?: { name: string; email: string };
  setup: string[];
  gates: GateConfig[];
  /** Named semaphores this layer declares; names are global across layers. */
  semaphores?: SemaphoreDeclaration[];
  /** Absent reads as required; false is the explicit no-gate opt-out. */
  requireGates?: boolean;
  /** Repo-relative rule file replacing the factory default coding rules; absent uses the factory default. */
  codingRules?: string;
  /**
   * Per-cause default for the PM's park decision: what this repo's history says
   * a cause usually deserves, and the evidence that overrides it. A cause the
   * repo names no route for is the architect's (`leave`).
   */
  parkRoutes?: ParkRoutes;
  cleanliness?: {
    maxFileSizeBytes?: number;
    allowedExtensions?: string[];
    allowedFiles?: string[];
  };
}

export interface ProcessConfig {
  flows: Record<string, FlowDefinition>;
  /**
   * Task type name -> what a task file naming it runs. The type owns the
   * flow, kind and output schema; a task file names only the type.
   */
  taskTypes: Record<string, TaskTypeDefinition>;
  /** Named semaphores this layer declares: flow-step and agent limits. */
  semaphores?: SemaphoreDeclaration[];
  /** Each kernel boundary step's prompt and alias; pre-flight requires these aliases. */
  boundary: Record<BoundaryStep, TurnSpec>;
  /** The goal-start step sequence: the branch first, the classifier, then extra steps. */
  ingestion?: IngestionStepConfig[];
  /** The plan review flow that completes before the PM derives tasks. */
  architecture: ArchitectureConfig;
  /** The PM stage's step list: the derive ladder and any turns around it. */
  pm?: PmConfig;
  /** Hierarchy depth and the epic architect's prompt; absent reads as depth 1. */
  hierarchy?: HierarchyConfig;
  /** Repair template a step renders when it names none; defaults to `delivery-repair`. */
  repairPrompt?: string;
  /** Outcome reminders after the first attempt; a task file's `repairTurns` overrides it for that task's turns only. */
  reminders: number;
  /** Task files past which the architect prompt suggests a saga; absent renders no reminder. */
  sagaTaskCount?: number;
  /** Wasted turns of one cause across iterations at or above which the pack proposes a spike; defaults to 2. */
  wasteSpikeThreshold?: number;
  calibration?: string;
  promptsDir?: string;
  presets?: Record<string, { calibration: string }>;
}

/** One fallback tier: another alias's whole ladder, or a model with its own effort (never inherited). */
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
  /** Effort level; absent means the harness default. */
  effort?: string;
  /**
   * Quota pool this tier draws on; defaults to the alias's subscription only
   * when the tier keeps the primary's harness and model.
   */
  subscription?: string;
  /**
   * Draws on the alias's subscription although the tier changes the primary's
   * harness or model. Without it such a tier is keyed `harness+model`.
   */
  sharesPool?: true;
}

export interface AliasConfig {
  harness: string;
  model: string;
  effort?: string;
  /** Quota pool this alias draws on; absent means throttled only overall. */
  subscription?: string;
  fallbacks?: FallbackConfig[];
  /** Alias the PM ladder climbs to after a tier fails; absent ends the ladder. */
  escalateTo?: string;
  /** Alias-level turn bounds; config defaults match `DEFAULT_TIMEOUTS`. */
  timeouts?: Timeouts;
}

/** One harness entry's compaction policy; disabling it records why. */
export interface HarnessCompactionConfig {
  enabled: boolean;
  /** Why this harness does not compact; present when `enabled` is false. */
  reason?: string;
  /**
   * Review rounds whose ended session is compacted. Absent compacts every
   * review round; non-review steps ignore the rule. Round numbers are 1-based.
   */
  reviewIterations?: number[];
}

/** One run-config harness entry: an adapter binding, executable override or opaque options. */
export interface HarnessConfig {
  /** Adapter binding; absent for a native adapter that only takes a binary. */
  acpx?: import("../../harness/acpx/config.js").AcpxConfig;
  /** Executable override; absent resolves through PATH. */
  binary?: string;
  /** Semaphore this harness's live sessions hold; absent means no harness limit. */
  semaphore?: string;
  /** Compaction policy for this harness; every entry declares one. */
  compaction: HarnessCompactionConfig;
  /** Opaque adapter options: acpx `args`/`env`, omp overlay keys. */
  options?: Record<string, unknown>;
}

export interface RunConfig {
  aliases: Record<string, AliasConfig>;
  /** One predefined process-level wrapper every child of this run starts in. */
  sandbox?: SandboxCommand;
  /** Harness id -> adapter binding, binary override or opaque options. */
  harnesses?: Record<string, HarnessConfig>;
  /** Named semaphores this layer declares: overall, harness and subscription limits. */
  semaphores?: SemaphoreDeclaration[];
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
    /** Semaphore every turn holds, on top of the concurrency block. */
    overallSemaphore?: string;
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
    /** Stable-window an inbox steer waits before it interrupts a running turn, in seconds. */
    steerDebounceSeconds?: number;
    /** Minimum free bytes in the temporary directory. */
    minTmpFreeBytes?: number;
  };
  sessions: { dir: string; keepRuns: number; retention: CacheTtl };
  /**
   * Quota-pool cooldown: a quota stop's stated reset sets the pool's skip
   * window, capped by `maxResetMinutes` when set; without a stated reset the
   * window is the pool's `perSubscription` entry, else `resetMinutes` (default
   * 300) from the stop.
   */
  quota?: {
    resetMinutes: number;
    maxResetMinutes?: number;
    /** Pool key (subscription, or harness+model) -> its own retry interval. */
    perSubscription?: Record<string, number>;
  };
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

/**
 * The repository and its run-config roots, before a goal name adds the goal's
 * own directories. Validation reads this without naming a goal.
 */
export interface GoalRoots {
  repoRoot: string;
  worktreeRoot: string;
  sessionsDir: string;
}

export interface GoalPaths extends GoalRoots {
  goalDir: string;
  goalCheckout: string;
  integrationBranch: string;
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
   * quota stop, with the epoch ms they may serve again and a probe in flight.
   * Loaded from the machine's session store at launch, so a relaunch or another
   * goal skips the pool before a stored reset and probes a due one once.
   */
  exhaustedPools: Map<string, PoolReset>;
  /** Price cache and fetcher; undefined means the shared cache plus network. */
  priceSource?: PriceSource;
}
