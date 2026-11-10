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
  "slug": "coding-rules-audit",
  "kind": "fact-finder",
  "title": "Inventory CodingRules violations",
  "assignment": "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS at final state (post-golden/assumptions/consolidate; read beartype discovery report from third-party item). No repo writes; output is structured item-report tables (durable in orchestration records, no committed file). Semantic exclusions marked SKIPPED (audit rest normally): checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache modules (+.pyi), _base.py::check_if_meaningful (+stub section), no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. Inventory: .pyi fidelity/private symbols, @beartype + structural suppressions, trivial wrappers/duplicated logic, redundant fallbacks (astroid 3.x), legacy stubs (_FALLBACK_TOOLS, peek_fallback_tools, _compare_sorted re-export), over-long comments, 500-line/R0912/R0915 proximity, structlog/error rules, rumdl tests/data-exclude hack (TD-11). Output rows {module,section,evidence file:line,category,est LoC delta,owner,fix} + UNIFIED disjoint-ownership map (this audit is SINGLE owner; test-debloat-audit consumes via inter-dep). Deps: read golden + helper final state; beartype report informs owner/fix.",
  "outlineRef": "coding-rules-audit",
  "milestone": "M3",
  "wave": 4,
  "deps": [
    "golden-findings-snapshot",
    "third-party-assumption-tests",
    "consolidate-integration-helpers"
  ],
  "scenarioRefs": [
    "M3: Coding-rules debt inventoried",
    "M3: Ownership map is complete and disjoint"
  ],
  "citations": [
    "CodingRules.md:90-107",
    "CodingRules.md:139-159",
    "src/python_setup_lint/checkers/_semantic.py:1-12",
    "src/python_setup_lint/checkers/_semantic.py:37-52",
    "src/python_setup_lint/checkers/_base.py:142-158",
    "src/python_setup_lint/runner/baseline.py:22-42",
    "lint.baseline:1-1"
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
  "CodingRules.md:90-107",
  "CodingRules.md:139-159",
  "src/python_setup_lint/checkers/_semantic.py:1-12",
  "src/python_setup_lint/checkers/_semantic.py:37-52",
  "src/python_setup_lint/checkers/_base.py:142-158",
  "src/python_setup_lint/runner/baseline.py:22-42",
  "lint.baseline:1-1"
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
