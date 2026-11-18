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
  "slug": "test-debloat-audit",
  "kind": "fact-finder",
  "title": "Inventory redundant and lint-testing tests",
  "assignment": "Read-only audit of tests/** (no repo writes; structured item-report tables). Depends on coding-rules-audit: read its UNIFIED ownership map via inter-dep and align owner column (do not redefine owners). Semantic exclusions marked SKIPPED: tests/checkers/test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline, tests/checkers/conftest.py (epic-created), tests/assumptions runtime/decision/cache modules (epic-created). Per module: behaviors protected; duplicates (incl golden-covered); CodingRules-Tests violations (first-party mocking, naming incl task-ID test_t5_*/test_t9_7_*/test_t11_*/test_t1b_*/test_t3_*, markers, in-file fixtures, _factories.py list[Any] tables, far cases); repo-self-lint for removal (test_self_lint_clean.py, AST/source-scanning guards, config re-checks per broadened never-linting definition); slow/benchmark. Output rows {module,behaviors,duplicate-of,recommendation keep|merge|rewrite|remove,surviving coverage,reason,owner} + per-subsystem LoC estimates + per-limb pinning inventory (CLI/exit: test_cli_*; baseline/autofix: test_baseline_*/test_autofix_*; configs/scopes: overlay+config tests — surviving test or blocking-debt flag).",
  "outlineRef": "test-debloat-audit",
  "milestone": "M3",
  "wave": 5,
  "deps": [
    "golden-findings-snapshot",
    "third-party-assumption-tests",
    "consolidate-integration-helpers",
    "coding-rules-audit"
  ],
  "scenarioRefs": [
    "M3: Test redundancy inventoried",
    "M3: Ownership map is complete and disjoint"
  ],
  "citations": [
    "AGENTS.md:87-93",
    "CodingRules.md:230-306",
    "tests/checkers/test_semantic_check.py:1-7",
    "tests/checkers/test_semantic_check.py:159-257",
    "tests/checkers/test_semantic_threshold.py:19-25",
    "pyproject.toml:49-55"
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
  "AGENTS.md:87-93",
  "CodingRules.md:230-306",
  "tests/checkers/test_semantic_check.py:1-7",
  "tests/checkers/test_semantic_check.py:159-257",
  "tests/checkers/test_semantic_threshold.py:19-25",
  "pyproject.toml:49-55"
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
