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
  "slug": "test-debloat-audit-i2",
  "kind": "fact-finder",
  "title": "Inventory redundant tests and pinning limbs",
  "assignment": "GOAL: Inventory redundant tests and pinning limbs aligned to unified map (U3). Read-only; zero repo writes. STEPS: Audit tests minus tests/data root-owned. Output in item report: rows with module, behaviors, duplicate-of, keep or merge or rewrite or remove, surviving coverage, reason, owner plus LoC and runtime estimates plus per-limb pinning inventory for CLI and exit, baseline and autofix, configs and scopes (surviving test or blocking-debt flag) plus symbol exclusions (test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline) plus planned-path reservations for epic conftest and runtime modules. Align owner column to coding-rules-audit unified map via inter-dep; file ownership separate from symbol skips. Iteration-3 replan consumes both reports plus HEAD re-glob validation. VERIFY: Each module has disposition with surviving coverage, repo-self-lint tests listed for removal, each material limb names pinning test or blocking debt, owners match unified map.",
  "outlineRef": "test-debloat-audit",
  "milestone": "M4",
  "wave": 4,
  "deps": [
    "coding-rules-audit-i2",
    "consolidate-integration-helpers-i2",
    "golden-contract-hardening"
  ],
  "scenarioRefs": [
    "M4-2",
    "M4-3"
  ],
  "citations": [
    "CodingRules.md:230-306",
    "CodingRules.md:139-159",
    "AGENTS.md:87-93",
    "pyproject.toml:49-49",
    "tests/checkers/test_semantic_check.py:1-7",
    "tests/checkers/test_semantic_threshold.py:19-25"
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
  "CodingRules.md:230-306",
  "CodingRules.md:139-159",
  "AGENTS.md:87-93",
  "pyproject.toml:49-49",
  "tests/checkers/test_semantic_check.py:1-7",
  "tests/checkers/test_semantic_threshold.py:19-25"
]

## Review Feedback

## Output

Yield a structured JSON object matching this schema:
- status (string, required, enum: ["ok","inconclusive"])
- summary (string, required)
- findings (string, required)
- contextPack (string, optional)
- sources (array of string, optional)
- recommendations (array of string, optional)
