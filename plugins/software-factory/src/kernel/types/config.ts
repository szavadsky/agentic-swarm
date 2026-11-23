/** Repository, run and fallback configuration shapes. */

import type { Repo } from "../../core/git/repo.js";
import type { CacheTtl, Harness } from "../../harness/types.js";
import type { PriceSource } from "../openrouter.js";
import type { PromptLibrary } from "../prompts.js";
import type {
  ArchitectureConfig,
  BoundaryStep,
  FlowDefinition,
  HierarchyConfig,
  IngestionStepConfig,
  Limits,
  Timeouts,
  TurnSpec,
} from "./flow.js";
import type { TaskTypeDefinition } from "./tasks.js";
import type { ArtifactStore } from "./records.js";

/** A runner whose printed failure report the kernel parses by name. */
export type GatePattern = "pytest" | "jest" | "cargo";

/** One repo gate command and the shared resources it needs to itself. */
export interface GateConfig {
  id: string;
  command: string;
  /**
   * Mutex names held while this gate runs. Same-named gates in one worktree
   * never overlap; two worktrees never wait on each other because the key
   * includes the worktree.
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
  /**
   * Wall for this gate's command, in seconds. Absent or not a positive finite
   * number falls back to `GATE_TIMEOUT_SEC`; it never disables the timeout.
   */
  timeoutSec?: number;
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

export interface RepoConfig {
  baseBranch: string;
  /** Goal directories live at <repo>/<artifactRoot>/<goal> unless a backend names another root. */
  artifactRoot: string;
  /** How artifacts are stored; absent reads as the plain folder backend. */
  artifacts?: ArtifactBackendConfig;
  identity?: { name: string; email: string };
  setup: string[];
  gates: GateConfig[];
  /** Repo-relative rule file replacing the factory default coding rules; absent uses the factory default. */
  codingRules?: string;
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
  /** Each kernel boundary step's prompt and alias; pre-flight requires these aliases. */
  boundary: Record<BoundaryStep, TurnSpec>;
  /** The goal-start step sequence: the branch first, the classifier, then extra steps. */
  ingestion?: IngestionStepConfig[];
  /** The plan review flow that completes before the PM derives tasks. */
  architecture: ArchitectureConfig;
  /** Hierarchy depth and the epic architect's prompt; absent reads as depth 1. */
  hierarchy?: HierarchyConfig;
  /** Repair template a step renders when it names none; defaults to `delivery-repair`. */
  repairPrompt?: string;
  /** Outcome reminders after the first attempt; a task file's `repairTurns` overrides it for that task's turns only. */
  reminders: number;
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
  /** Compaction configuration for this harness; absent means the adapter's capability. */
  compaction?: HarnessCompactionConfig;
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
  sessions: { dir: string; keepRuns: number; retention: CacheTtl };
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
   * `harness+model` combinations that passed a canary run. Loaded from the
   * session store at launch; rotation only picks proven combinations. Narrow
   * per-test runtimes may omit it; rotation then stays ungated.
   */
  provenCombinations?: Set<string>;
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
