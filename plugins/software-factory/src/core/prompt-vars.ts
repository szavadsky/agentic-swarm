/**
 * Contract of engine-supplied prompt placeholder variables (§10).
 *
 * This mapping defines every placeholder variable that the engine is responsible
 * for providing when rendering step and system prompt fragments.
 * Preflight validation checks template placeholders against this registry.
 */

/**
 * One-line description per variable supplied by the engine across prompt fragments.
 */
export const PROMPT_VAR_DESCRIPTIONS: Record<string, string> = {
  assignment: "Item assignment specification detailing scope, requirements, and acceptance criteria",
  target: "Test target specification declaring selectors, expectRed test cases, gate, or command",
  citations: "Verified codebase citations and relevant source excerpts",
  checks: "Formatted outputs and error logs from engine mechanical checks",
  testDiff: "Git diff of test paths since branch point or test-first commit",
  diff: "Git diff of working tree changes relative to branch start or merge base",
  feedback: "Review suggestions, failure diagnostics, or consult directives from prior steps",
  plan: "Architectural plan artifact formatted as YAML",
  waveReport: "Summary report of executed waves, merge outcomes, and spike findings",
  kinds: "Story and spike kinds criteria guide formatted as markdown",
  limits: "Pipeline limits (milestones, concurrency, item count, size budgets) formatted as text",
  intent: "Raw task intent specification loaded from the task's INTENT.md",
  context: "Task triage context, background citations, or failure context",
  item: "Item slug, branch name, and metadata",
  priorAttempts: "Summary and error output of previous failed step attempts",
  task: "Task slug and worktree context",
  debt: "Accumulated technical debt items formatted as text",
  steering: "Operator steering directives and taken mailbox items",
  iteration: "Current iteration number (1-based integer)",
  infra: "Discovered infrastructure gates, setup commands, and test runner configuration",
  planReview: "Adversarial review suggestions and findings on the proposed plan",
  closeup: "Plan close-up audit findings detailing scenario and milestone completion",
  triageCriteria: "Task triage hierarchy criteria file contents (criteria.triage)",
  dispositionsCriteria: "Review dispositions criteria file contents filtered to allowed dispositions (criteria.dispositions)",
  storyKindsCriteria: "Story and spike kinds criteria file contents (criteria.story-kinds)",
  contextPack: "Condensed, citation-backed context document covering module maps, signatures, excerpts, conventions, and open questions",
  gateDiff: "Structured gate/tool diff table (baseline-vs-now per-gate status) for regression judgment",
  hydrationContext: "Deterministic architect brief: relevance-selected one-line entries (id, section, headline) with task-relative file paths for full detail",
  limitViolations: "Deterministic plan outline-count limit violations (milestone/item counts vs limits), empty when the plan is within limits; for PM amendments the item budget block names the delta's remaining item allowance",
  humanInvolvementCriteria: "Active human-involvement mode rules plus shared ADR/concern blocking table (criteria.human-involvement)",
  concernsYaml: "Open concerns hydrated for this step, formatted as YAML",
};

/**
 * Mapping of fragment identifier to array of variables supplied by the engine.
 * Includes both prefixed ("steps/...") and bare ("...") fragment keys.
 */
export const KNOWN_VARS: Record<string, string[]> = {
  // Ingest & infrastructure steps
  "steps/triage": ["task", "intent", "triageCriteria"],
  triage: ["task", "intent", "triageCriteria"],

  "steps/infra": ["task", "intent", "context"],
  infra: ["task", "intent", "context"],
  "steps/context-pack": ["task", "intent", "context"],
  "context-pack": ["task", "intent", "context"],


  // Item development & verification steps
  "steps/develop": ["assignment", "target", "citations", "feedback", "concernsYaml"],
  develop: ["assignment", "target", "citations", "feedback", "concernsYaml"],

  "steps/test-first": ["assignment", "citations", "feedback", "concernsYaml"],
  "test-first": ["assignment", "citations", "feedback", "concernsYaml"],
  "steps/qa": ["assignment", "checks", "testDiff", "diff", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],
  qa: ["assignment", "checks", "testDiff", "diff", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],

  "steps/review": ["assignment", "checks", "diff", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],
  review: ["assignment", "checks", "diff", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],

  "steps/fix-round": ["assignment", "feedback", "checks", "diff", "concernsYaml"],
  "fix-round": ["assignment", "feedback", "checks", "diff", "concernsYaml"],

  "steps/simple-implement": ["intent", "citations", "concernsYaml"],
  "simple-implement": ["intent", "citations", "concernsYaml"],

  "steps/integrate": ["item", "diff"],
  integrate: ["item", "diff"],

  // Spikes
  "steps/research": ["assignment", "intent", "citations", "feedback", "concernsYaml"],
  research: ["assignment", "intent", "citations", "feedback", "concernsYaml"],

  "steps/poc": ["assignment", "context", "feedback", "concernsYaml"],
  poc: ["assignment", "context", "feedback", "concernsYaml"],

  "steps/test-assumptions": ["assignment", "context", "feedback", "concernsYaml"],
  "test-assumptions": ["assignment", "context", "feedback", "concernsYaml"],

  // Project manager steps
  "steps/pm-edits": ["plan", "taskStatus", "kinds", "citations", "limits", "storyKindsCriteria"],
  "pm-edits": ["plan", "taskStatus", "kinds", "citations", "limits", "storyKindsCriteria"],

  "steps/pm-amend": ["plan", "taskStatus", "feedback", "waveReport", "limits", "limitViolations"],
  "pm-amend": ["plan", "taskStatus", "feedback", "waveReport", "limits", "limitViolations"],

  "steps/pm-single-item": ["intent", "citations", "kinds", "storyKindsCriteria", "taskStatus"],
  "pm-single-item": ["intent", "citations", "kinds", "storyKindsCriteria", "taskStatus"],

  // Architect steps
  "steps/architect-plan": [
    "task",
    "iteration",
    "intent",
    "context",
    "infra",
    "debt",
    "steering",
    "limits",
    "contextPack",
    "taskStatus",
    "humanInvolvementCriteria",
    "concernsYaml",
  ],
  "architect-plan": [
    "task",
    "iteration",
    "intent",
    "context",
    "infra",
    "debt",
    "steering",
    "limits",
    "contextPack",
    "taskStatus",
    "humanInvolvementCriteria",
    "concernsYaml",
  ],

  "steps/architect-revise": ["plan", "planReview", "contextPack", "taskStatus", "humanInvolvementCriteria", "concernsYaml"],
  "architect-revise": ["plan", "planReview", "contextPack", "taskStatus", "humanInvolvementCriteria", "concernsYaml"],

  "steps/architect-resume": ["plan", "waveReport", "steering", "contextPack", "humanInvolvementCriteria", "concernsYaml"],
  "architect-resume": ["plan", "waveReport", "steering", "contextPack", "humanInvolvementCriteria", "concernsYaml"],

  "steps/architect-wave-report": ["plan", "waveReport", "debt", "steering", "contextPack", "taskStatus", "humanInvolvementCriteria", "concernsYaml"],
  "architect-wave-report": ["plan", "waveReport", "debt", "steering", "contextPack", "taskStatus", "humanInvolvementCriteria", "concernsYaml"],

  "steps/architect-closeup": ["closeup", "plan", "intent", "contextPack", "taskStatus", "humanInvolvementCriteria", "concernsYaml"],
  "architect-closeup": ["closeup", "plan", "intent", "contextPack", "taskStatus", "humanInvolvementCriteria", "concernsYaml"],

  "steps/architect-consult-item": [
    "item",
    "assignment",
    "priorAttempts",
    "diff",
    "feedback",
    "contextPack",
    "humanInvolvementCriteria",
    "concernsYaml",
  ],
  "architect-consult-item": [
    "item",
    "assignment",
    "priorAttempts",
    "diff",
    "feedback",
    "contextPack",
    "humanInvolvementCriteria",
    "concernsYaml",
  ],

  "steps/architect-consult-nonitem": ["task", "context", "feedback", "debt", "contextPack", "humanInvolvementCriteria", "concernsYaml"],
  "architect-consult-nonitem": ["task", "context", "feedback", "debt", "contextPack", "humanInvolvementCriteria", "concernsYaml"],

  // Close-up and review checkpoints
  "steps/wave-close-up": ["task", "waveReport", "infra", "gateDiff", "humanInvolvementCriteria", "concernsYaml"],
  "wave-close-up": ["task", "waveReport", "infra", "gateDiff", "humanInvolvementCriteria", "concernsYaml"],

  "steps/plan-close-up": ["intent", "plan", "context", "humanInvolvementCriteria", "concernsYaml"],
  "plan-close-up": ["intent", "plan", "context", "humanInvolvementCriteria", "concernsYaml"],

  "steps/plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria", "limitViolations", "humanInvolvementCriteria", "concernsYaml"],
  "plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria", "limitViolations", "humanInvolvementCriteria", "concernsYaml"],

  // System fragments
  "system/steer-classify": [],
  "steer-classify": [],

  "system/brief-select": [],
  "brief-select": [],

  "system/repair": [],
  repair: [],
};
