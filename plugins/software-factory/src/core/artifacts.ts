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
  gateRetries?: number;
  gateTimeoutSec?: number;
  storyMaxProdLines?: number;
  simpleMaxProdLines?: number;
  maxMilestones?: number;
  maxItemsPerPlan?: number;
  checkOutputBytes?: number;
  hydrationBytes?: number;
  stepTranscriptWarningBytes?: number;
  [key: string]: unknown;
}

export interface PipelineBudget {
  perTaskUsd?: number;
  perIterationUsd?: number;
  perItemUsd?: number;
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
  /** How aggressively the human is consulted (`autonomous` is least, `detailed` most). */
  humanInvolvement?: "autonomous" | "principal" | "detailed";
  concerns?: {
    /** Agents allowed to raise concerns from their structured output. */
    raiseAllowlist?: string[];
    minDigestSeverity?: ConcernSeverity;
    minBlockingSeverity?: ConcernSeverity;
  };
  reviewPolicy?: {
    /** Canonical default dispositions for agents without a specific entry. */
    default?: string[];
    /** Legacy alias for `default`, kept for existing pipeline configs. */
    allowedDispositions?: string[];
    [agent: string]: string[] | undefined;
  };
  criteria?: Record<string, string>;
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
}

export interface GateBaselineEntry {
  id: string;
  command?: string;
  status: "pass" | "fail" | "flaky";
  durationMs?: number;
  details?: string;
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
  /** Needs a human decision per the active involvement mode. */
  blocking?: boolean;
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

export type ConcernKind = "tech-debt" | "assumption" | "blocker" | "risk" | "question";

export type ConcernSeverity = "low" | "medium" | "high";

export type ConcernStatus = "open" | "dismissed" | "routed" | "resolved";

/** A structured "see something, say something" report from any agent output. */
export interface Concern {
  /** Stable fingerprint id; assigned by the engine when the concern is aggregated. */
  id?: string;
  kind: ConcernKind;
  summary: string;
  detail: string;
  location?: {
    file: string;
    line?: number;
  };
  severity: ConcernSeverity;
  /** Item, epic, or plan refs the concern affects. */
  affects?: string[];
}

export interface RemarkableDecision {
  chosen: string;
  alternatives: string[];
  why: string;
}

/** Architect confirmation for a close-up concern resolution. */
export interface ConcernConfirms {
  id: string;
  confirm: "accept" | "reject";
  note?: string;
}

/** Decision-level resolution: resolve now or carry to the next architect turn. */
export interface ConcernResolution {
  id: string;
  action: "resolve" | "carry";
  note?: string;
}

/** Close-up proposals may also propagate a concern to the parent epic or saga. */
export interface CloseupConcernResolution {
  id: string;
  action: "resolve" | "carry" | "propagate";
  note?: string;
}

export interface ConcernSource {
  record: string;
  agent: string;
  step?: string;
  item?: string;
  iteration?: number;
  escalated?: boolean;
  /** Timestamp of the most recent re-emit for merged concerns. */
  lastSeen?: string;
}

export interface PendingConcernResolution {
  action: "resolve" | "carry" | "propagate";
  note?: string;
  by: string;
  at: string;
}

/** A concern persisted under the task's `concerns/` folder. */
export interface StoredConcernArtifact extends Concern {
  id: string;
  status: ConcernStatus;
  disposition?: ReviewDisposition;
  dismissReason?: string;
  source: ConcernSource;
  pendingResolution?: PendingConcernResolution;
  createdAt: string;
  updatedAt: string;
}

export type ReviewDisposition =
  | "fix"
  | "optional"
  | "architect"
  | "human-awareness"
  | "human-async"
  | "human-stop"
  | "dismiss";

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
  newConcerns?: Concern[];
  remarkable?: RemarkableDecision[];
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
  concerns?: Concern[];
  remarkable?: RemarkableDecision[];
  notes?: string;
}

export interface FactFinderOutputArtifact {
  status: "ok" | "inconclusive";
  summary: string;
  findings: string;
  sources?: string[];
  recommendations?: string[];
  concerns?: Concern[];
  remarkable?: RemarkableDecision[];
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
  concerns?: Concern[];
  remarkable?: RemarkableDecision[];
  concernResolutions?: CloseupConcernResolution[];
}

export interface PlanCloseupArtifact {
  iteration: number;
  status: "complete" | "next-iteration" | "blocked";
  summary: string;
  question?: string;
  completedMilestones?: string[];
  remainingMilestones?: string[];
  techDebt?: string[];
  concerns?: Concern[];
  remarkable?: RemarkableDecision[];
  concernConfirms?: ConcernConfirms[];
  concernResolutions?: CloseupConcernResolution[];
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
  concerns?: Concern[];
  remarkable?: RemarkableDecision[];
  concernConfirms?: ConcernConfirms[];
  concernResolution?: ConcernResolution;
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

/** Concern-store totals surfaced on state.yaml (§18). */
export interface ConcernCounts {
  open: number;
  dismissed: number;
  routed: number;
  resolved: number;
}

export interface StateArtifact {
  task: string;
  kind?: string;
  status: "active" | "blocked" | "done" | "failed";
  iteration: number;
  currentWave?: number;
  items: Record<string, StateItemInfo>;
  concerns: ConcernCounts;
  debt?: string[];
  budgetSpentUsd?: number;
  lastUpdated: string;
}
