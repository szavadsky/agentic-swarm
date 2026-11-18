# Step: Research

## Goal
Conduct technical spike research to eliminate architecture unknowns, investigate library capabilities, or diagnose root causes.

## Rules
- Investigative discipline: form multiple hypotheses; test using search, LSP, code inspection, and documentation queries.
- Concrete references: ground every finding with repository paths, exact line ranges, or documentation URLs.
- Deliverable: yield structured output matching `fact-finder-output.schema.json`. Do NOT write files; the engine writes `findings` to `items/{item}/findings.md`.
- Read-only on repository: do NOT edit or write code files. NEVER issue git write commands or launch subagents.
- Fix-round re-entry: when `Review Feedback` below is non-empty, this is a fix round. Address ONLY the listed concerns with targeted follow-up investigation; do NOT re-run the full probe from scratch.
- Tool-call budget: aim to finish within ~60 tool calls (probes that re-read files run 60-90 calls and diverge). Batch reads, prefer `grep`/`ast_grep` over re-reading, and stop once findings answer the assignment.

## Assignment
{
  "slug": "final-gate-validation",
  "kind": "fact-finder",
  "title": "Final gate table and docs reconciliation check",
  "assignment": "Root-owned final validation (fact-finder, read-only; findings.md + structured findings; review checks validity; zero repo writes). Record final gate table: format exit 0; lint per-tool results on scoped clean checkout for detect-secrets MemoryError (cite mechanism + HEAD); pytest -q green (pass/skip/deselect counts); integration 9-collected-0-failed with pre-commit env pinned (9 passed with it, 7 passed + 2 skipped without via ensure_precommit_or_skip); golden byte-identical or regen-with-reviewed-diff per hatch report; lint.baseline []; docs reconciliation with must-contain strings (semantic-justification.md: DecisionBackend, .python-setup-decisions.json, ADR-009, prompt-v1; custom-checks.md: DecisionBackend; troubleshooting.md: DECISION_MODEL + RERANKER deprecated; AGENTS.md pipeline: DecisionBackend; CHANGELOG: [semantic] + no-go; AGENTS.md counts to 9-collected contract + ruff-format scope row; CHANGELOG version; README pin; ADR staleness notes per kickoff assignment). Red-cell routing: red cells route back via new root items (root-owned files) or epic follow-up items (epic-owned files), never baseline edits. Covers M3 close-out, TD3-A1/TD3-I2.",
  "outlineRef": "final-gate-validation",
  "milestone": "M3",
  "wave": 5,
  "deps": [
    "golden-regen-hatch"
  ],
  "scenarioRefs": [
    "M3: Iteration closes with evidence"
  ],
  "citations": [
    "docs/semantic-justification.md:5-14",
    "docs/semantic-justification.md:34-45",
    "AGENTS.md:79-85",
    "AGENTS.md:87-93",
    "lint.baseline:1-1",
    ".gitignore:243-244"
  ]
}

## Task Intent
# modernize

Modernize the project while preserving every material lint/check behavior.
- Enforce the project's coding rules (CodingRules.md, AGENTS.md) across the code base.
- Debloat code and tests; keep test intent, never test linting, test infra/assumptions first.
- Remove redundant tests.
- Replace the embedding/rerank based justification/comment check
  (`src/python_setup_lint/checkers/_semantic.py`) with a CPU-friendly small decision model,
  e.g. https://huggingface.co/fastino/GLiDE-0.4B or smaller
  (https://huggingface.co/spaces/multimodalart/jev-decision-index); keep a git-stored cache with cleanup.


## Context & Citations
[
  "docs/semantic-justification.md:5-14",
  "docs/semantic-justification.md:34-45",
  "AGENTS.md:79-85",
  "AGENTS.md:87-93",
  "lint.baseline:1-1",
  ".gitignore:243-244"
]

## Review Feedback


## Open Concerns
- id: c-3e935debcb
  kind: risk
  severity: low
  summary: PoC lock is POSIX-only fcntl.flock
  affects:
    - cache-design-spike
    - decision-cache-impl
- id: c-5463b26c4b
  kind: assumption
  severity: medium
  summary: Production call site passes a constant rule symbol, collapsing the cache rule component
  affects:
    - cache-design-spike
    - decision-cache-impl


- Review the concerns above before starting; they constrain this step but are not part of the assignment.
- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.

## Output

Yield a structured JSON object matching this schema:
- status (string, required, enum: ["ok","inconclusive"])
- summary (string, required)
- findings (string, required)
- contextPack (string, optional)
- sources (array of string, optional)
- recommendations (array of string, optional)
- concerns (array of object, optional): Structured concerns raised while investigating
  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
  - summary (string, required)
  - detail (string, optional)
  - severity (string, optional, enum: ["low","medium","high"])
  - location (object, optional)
    - file (string, required)
    - line (integer, optional)
  - affects (array of string, optional)
- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
  - chosen (string, required)
  - why (string, required)
  - alternatives (array of string, required)
