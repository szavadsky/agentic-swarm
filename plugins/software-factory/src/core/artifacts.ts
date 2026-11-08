/**
 * software-factory v2 — Core Artifact & Configuration Type Definitions
 *
 * Single module defining TypeScript interfaces matching all JSON schemas.
 */

// ==============================================================================
// Configuration Types
// ==============================================================================

export interface ProjectConfig {
  orchestrationFolder: string;
  adrFolder?: string;
  worktreeRoot: string;
  /** Free-form command hints for the infra agent (setup, compile, lint, test, …). */
  scripts?: Record<string, string>;
  paths?: {
    tests?: string | string[];
    prod?: string | string[];
  };
  skillDirs?: string[];
}

export type RoleDefinition =
  | { model: string; fallbacks?: string[] }
  | { alias: string };

export interface AgentConfig {
  role: string;
  tools?: string[];
  definition?: string;
  output?: string;
  timeoutSec?: number;
}

export interface CustomCheckConfig {
  run: string;
  expect?: "pass" | "fail";
  cwd?: "item" | "task";
  timeoutSec?: number;
  phase?: "before" | "after";
  onFail?: "retry-step" | "fix-loop" | "consult" | "feed";
}

export interface HookWhen {
  kinds?: string[];
  escalated?: boolean;
  taskKinds?: string[];
}

export interface HookEntry {
  agent?: string;
  check?: string;
  when?: HookWhen;
}

export interface FlowStep {
  id: string;
  agent: string;
  role?: string;
  retryRole?: string;
  escalatable?: boolean;
  session?: "fresh" | "reuse";
  checks?: string[];
  focus?: string;
  stepFragment?: string;
  timeoutSec?: number;
}

export interface FlowKindConfig {
  criteria?: string;
  steps: FlowStep[];
  fixLoopTo?: string;
  limits?: Record<string, unknown>;
}

export interface PipelineLimits {
  maxParallelItems?: number;
  maxParallelTurns?: number;
  stubMaxProdLines?: number;
  maxStepAttempts?: number;
  maxInterruptions?: number;
  maxFixRounds?: number;
  maxConsultsPerItem?: number;
  maxSplitDepth?: number;
  maxPlanReviewRounds?: number;
  maxAmendmentsPerIteration?: number;
  maxIterations?: number;
  maxInfraRetries?: number;
  maxInfraRetriesExpensive?: number;
  gateRetries?: number;
  gateTimeoutSec?: number;
  storyMaxProdLines?: number;
  simpleMaxProdLines?: number;
  maxMilestones?: number;
  maxItemsPerPlan?: number;
  checkOutputBytes?: number;
  hydrationBytes?: number;
  stepTranscriptWarningBytes?: number;
  contextPackBytes?: number;
  timeoutNudgeSec?: number;
  minFreeDiskMb?: number;
  [key: string]: unknown;
}

export interface PipelineBudget {
  perTaskUsd?: number;
  perIterationUsd?: number;
  perItemUsd?: number;
  perStepUsd?: number;
  expensiveRoles?: string[];
}

export interface PipelineConfig {
  models: {
    roles: Record<string, RoleDefinition>;
  };
  agents: Record<string, AgentConfig>;
  checks?: Record<string, CustomCheckConfig>;
  hooks?: Record<string, HookEntry[]>;
  flows: {
    simple: { steps: FlowStep[] };
    story: Record<string, FlowKindConfig>;
    spike: Record<string, FlowKindConfig>;
  };
  limits: PipelineLimits;
  budget?: PipelineBudget;
  diversity?: "warn" | "error" | "off";
  harness?: string;
  reviewPolicy?: {
    default?: string[];
    [agent: string]: string[] | undefined;
  };
  criteria?: Record<string, string>;
  contextPack?: boolean;
  prompts?: {
    overrides?: Record<string, unknown>;
    extraSkillDirs?: string[];
  };
}

// ==============================================================================
// Artifact Types (§6, §8)
// ==============================================================================

export type TaskKind = "simple" | "story" | "spike" | "epic" | "saga";

export interface TriageArtifact {
  kind: TaskKind;
  rationale: string;
  citations: Citation[];
  size?: string;
  risks?: string[];
}

export interface Citation {
  file: string;
  lines: string;
  anchors: string[];
  summary: string;
}

export interface ContextObject {
  citations: Citation[];
}

export type ContextArtifact = ContextObject | Citation[];

export interface InfraGate {
  id: string;
  command: string;
}

export interface TestRunnerConfig {
  command: string;
  selectorArgs?: string[];
  junitArg?: string;
}

export interface InfraArtifact {
  setup: string[];
  gates: InfraGate[];
  testRunner: TestRunnerConfig;
  notes?: string[];
}

export interface GateBaselineEntry {
  id: string;
  command?: string;
  status: "pass" | "fail" | "flaky";
  durationMs?: number;
  details?: string;
  mutatesWorktree?: boolean;
  failingTests?: string[];
  collectionErrors?: string[];
  improvements?: string[];
}


export interface GatesBaselineArtifact {
  timestamp?: string;
  gates: GateBaselineEntry[];
}

export interface PlanMilestone {
  id: string;
  title: string;
  scenarios?: string[];
  directionalInterfaces?: string[];
  replanAfter?: boolean;
}

export interface PlanUncertainty {
  id: string;
  description: string;
  spikeOutlines?: string[];
}

export interface PlanItemOutline {
  slug: string;
  kind: string;
  title: string;
  description?: string;
  milestoneId?: string;
  deps?: string[];
  escalate?: boolean;
  replanAfter?: boolean;
}

export interface PlanAssumption {
  assumption: string;
  why: string;
  disposition?: string;
}

export interface PlanEpic {
  slug: string;
  intent: string;
}

export interface PlanTechDebt {
  id: string;
  description: string;
  category: "adjacent" | "impacting" | "blocking";
  resolution?: string;
}

export interface PlanAdr {
  id: string;
  title: string;
  context: string;
  decision: string;
  consequences?: string;
}

export interface PlanArtifact {
  iteration: number;
  milestones: PlanMilestone[];
  uncertainties?: PlanUncertainty[];
  itemOutlines?: PlanItemOutline[];
  assumptions?: PlanAssumption[];
  epics?: PlanEpic[];
  techDebt?: PlanTechDebt[];
  adrs?: PlanAdr[];
}

export interface PlanEditsItem {
  slug: string;
  kind: string;
  title: string;
  assignment: string;
  outlineRef?: string;
  milestone: string;
  wave: number;
  deps?: string[];
  scenarioRefs?: string[];
  citations?: string[];
  escalate?: boolean;
}

export interface PlanEditsArtifact {
  iteration: number;
  amendmentIndex?: number;
  items: PlanEditsItem[];
}

export interface AssignmentArtifact {
  slug: string;
  kind: string;
  title: string;
  assignment: string;
  outlineRef?: string;
  milestone?: string;
  wave?: number;
  deps?: string[];
  scenarioRefs?: string[];
  citations?: (string | Citation)[];
  escalate?: boolean;
}

export type ReviewDisposition =
  | "fix"
  | "optional"
  | "architect"
  | "human-awareness"
  | "human-async"
  | "human-stop";

export interface ReviewSuggestion {
  id: string;
  disposition: ReviewDisposition | string;
  summary: string;
  detail?: string;
  location?: {
    file: string;
    line?: number;
  };
}

export interface ReviewArtifact {
  status: "approved" | "changes_requested";
  summary: string;
  suggestions: ReviewSuggestion[];
}

export type DeveloperTarget =
  | { selectors: string[]; expectRed: string[] }
  | { gate: string }
  | { command: string; customTarget: boolean };

export interface DeveloperOutputArtifact {
  status: "ok" | "blocked" | "failed";
  summary: string;
  target?: DeveloperTarget;
  evidence?: string[];
  concerns?: string[];
  notes?: string;
}

export interface FactFinderOutputArtifact {
  status: "ok" | "inconclusive";
  summary: string;
  findings: string;
  sources?: string[];
  recommendations?: string[];
}

export interface WaveCloseupArtifact {
  wave: number;
  iteration: number;
  status: "complete" | "has_failures" | "blocked";
  mergedItems: string[];
  failedItems?: string[];
  blockedItems?: string[];
  debt?: string[];
  summary: string;
  recommendations?: string[];
}

export interface PlanCloseupArtifact {
  iteration: number;
  status: "complete" | "next-iteration" | "blocked";
  summary: string;
  question?: string;
  completedMilestones?: string[];
  remainingMilestones?: string[];
  techDebt?: string[];
}

export type DecisionContext = "item" | "non-item" | "wave" | "plan-closeup";

export interface DecisionArtifact {
  id: string;
  context: DecisionContext;
  decision: string;
  rationale?: string;
  text?: string;
  persist?: boolean;
  outlines?: unknown[];
  outline?: unknown;
  debt?: string;
  reason?: string;
  question?: string;
  planDelta?: string;
  timestamp: string;
}

export interface SteerItemArtifact {
  id: string;
  ref: string;
  disposition: string;
  question: string;
  draftDecision?: string;
  blocks?: string[];
  status: "open" | "answered" | "dismissed";
  createdAt?: string;
  answeredAt?: string;
  answer?: string;
}

export interface SteerClassificationArtifact {
  refs: string[];
  kind: "answer" | "directive" | "stop";
  urgency: "now" | "next-architect-call";
  summary: string;
}

export type StepMetaStatus =
  | "started"
  | "ok"
  | "rejected"
  | "error"
  | "interrupted";

export interface StepUsage {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export interface StepMetaArtifact {
  seq?: number;
  name?: string;
  attempt?: number;
  agent: string;
  role: string;
  models: string[];
  session?: string;
  traceRef?: string;
  status: StepMetaStatus;
  usage?: StepUsage;
  startedAt: string;
  endedAt?: string;
  error?: string;
  repairedFrom?: string;
  timeoutSec?: number;
}

export interface CheckItemResult {
  id: string;
  status: "pass" | "fail" | "skipped";
  phase?: "before" | "after";
  durationMs?: number;
  message?: string;
  details?: string;
}

export interface ChecksResultArtifact {
  checks: CheckItemResult[];
}

export interface StateItemInfo {
  kind: string;
  status: string;
  branch?: string;
  attempts?: number;
  fixRounds?: number;
  assignedAt?: string;
  mergedAt?: string;
}

export interface StateArtifact {
  task: string;
  kind?: string;
  status: "active" | "blocked" | "done" | "failed";
  iteration: number;
  currentWave?: number;
  items: Record<string, StateItemInfo>;
  debt?: string[];
  budgetSpentUsd?: number;
  lastUpdated: string;
}
