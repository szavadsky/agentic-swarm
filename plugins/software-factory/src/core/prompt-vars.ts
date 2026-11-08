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

  // Item development & verification steps
  "steps/develop": ["assignment", "target", "citations"],
  develop: ["assignment", "target", "citations"],

  "steps/test-first": ["assignment", "citations"],
  "test-first": ["assignment", "citations"],
  "steps/qa": ["assignment", "checks", "testDiff", "diff", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],
  qa: ["assignment", "checks", "testDiff", "diff", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],

  "steps/review": ["assignment", "checks", "diff", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],
  review: ["assignment", "checks", "diff", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],

  "steps/fix-round": ["assignment", "feedback", "checks", "diff"],
  "fix-round": ["assignment", "feedback", "checks", "diff"],

  "steps/simple-implement": ["intent", "citations"],
  "simple-implement": ["intent", "citations"],

  "steps/integrate": ["item", "diff"],
  integrate: ["item", "diff"],

  // Spikes
  "steps/research": ["assignment", "intent", "citations"],
  research: ["assignment", "intent", "citations"],

  "steps/poc": ["assignment", "context"],
  poc: ["assignment", "context"],

  "steps/test-assumptions": ["assignment", "context"],
  "test-assumptions": ["assignment", "context"],

  // Project manager steps
  "steps/pm-edits": ["plan", "kinds", "citations", "limits", "storyKindsCriteria"],
  "pm-edits": ["plan", "kinds", "citations", "limits", "storyKindsCriteria"],

  "steps/pm-amend": ["plan", "feedback", "waveReport"],
  "pm-amend": ["plan", "feedback", "waveReport"],

  "steps/pm-single-item": ["intent", "citations", "kinds", "storyKindsCriteria"],
  "pm-single-item": ["intent", "citations", "kinds", "storyKindsCriteria"],

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
    "humanInvolvementCriteria",
    "concernsYaml",
  ],

  "steps/architect-revise": ["plan", "planReview", "humanInvolvementCriteria", "concernsYaml"],
  "architect-revise": ["plan", "planReview", "humanInvolvementCriteria", "concernsYaml"],

  "steps/architect-resume": ["plan", "waveReport", "steering", "humanInvolvementCriteria", "concernsYaml"],
  "architect-resume": ["plan", "waveReport", "steering", "humanInvolvementCriteria", "concernsYaml"],

  "steps/architect-wave-report": ["plan", "waveReport", "debt", "steering", "humanInvolvementCriteria", "concernsYaml"],
  "architect-wave-report": ["plan", "waveReport", "debt", "steering", "humanInvolvementCriteria", "concernsYaml"],

  "steps/architect-closeup": ["closeup", "plan", "intent", "humanInvolvementCriteria", "concernsYaml"],
  "architect-closeup": ["closeup", "plan", "intent", "humanInvolvementCriteria", "concernsYaml"],

  "steps/architect-consult-item": [
    "item",
    "assignment",
    "priorAttempts",
    "diff",
    "feedback",
    "humanInvolvementCriteria",
    "concernsYaml",
  ],
  "architect-consult-item": [
    "item",
    "assignment",
    "priorAttempts",
    "diff",
    "feedback",
    "humanInvolvementCriteria",
    "concernsYaml",
  ],

  "steps/architect-consult-nonitem": ["task", "context", "feedback", "debt", "humanInvolvementCriteria", "concernsYaml"],
  "architect-consult-nonitem": ["task", "context", "feedback", "debt", "humanInvolvementCriteria", "concernsYaml"],

  // Close-up and review checkpoints
  "steps/wave-close-up": ["task", "waveReport", "infra", "humanInvolvementCriteria", "concernsYaml"],
  "wave-close-up": ["task", "waveReport", "infra", "humanInvolvementCriteria", "concernsYaml"],

  "steps/plan-close-up": ["intent", "plan", "context", "humanInvolvementCriteria", "concernsYaml"],
  "plan-close-up": ["intent", "plan", "context", "humanInvolvementCriteria", "concernsYaml"],

  "steps/plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],
  "plan-review": ["plan", "intent", "context", "limits", "dispositionsCriteria", "humanInvolvementCriteria", "concernsYaml"],

  // System fragments
  "system/steer-classify": [],
  "steer-classify": [],

  "system/repair": [],
  repair: [],
};
