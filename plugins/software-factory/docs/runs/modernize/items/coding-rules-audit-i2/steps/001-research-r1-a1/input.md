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
  "slug": "coding-rules-audit-i2",
  "kind": "fact-finder",
  "title": "Inventory CodingRules violations and ownership",
  "assignment": "GOAL: Inventory CodingRules violations and own unified disjoint file-ownership map on final HEAD containing M1 plus M2 merges (U3). Read-only; zero repo writes. STEPS: Audit src plus scripts vs CodingRules and AGENTS on final HEAD. Output in item report as engine-durable replan input: rows with module, section, evidence file:line, category, est LoC delta, owner, fix plus UNIFIED disjoint file-ownership map over ownership universe (src plus scripts plus tests minus tests/data; owner enum runner,checkers,setup-testing,semantic,root; stub follows .py; tests/data plus config plus docs as root-owned group) plus symbol-exclusion column (_base.py check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS, _semantic.py plus pyi) plus planned-path reservations for new backend and cache modules. Single owner of map; test audit aligns via inter-dep. Read final HEAD plus beartype report plus secrets-spike verdict. VERIFY: Every universe file appears exactly once with exactly one owner, root-owned group listed once, exclusions reference existing symbols, reservations name only planned paths. Per ADR-008 no committed map; escape hatch only if engine drops reports.",
  "outlineRef": "coding-rules-audit",
  "milestone": "M4",
  "wave": 3,
  "deps": [
    "runner-format-contract",
    "baseline-violations-fix",
    "consolidate-integration-helpers-i2",
    "golden-contract-hardening"
  ],
  "scenarioRefs": [
    "M4-1",
    "M4-3"
  ],
  "citations": [
    "CodingRules.md:90-107",
    "CodingRules.md:139-159",
    "CodingRules.md:230-306",
    "AGENTS.md:87-93",
    "AGENTS.md:121-139",
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
  "CodingRules.md:230-306",
  "AGENTS.md:87-93",
  "AGENTS.md:121-139",
  "lint.baseline:1-1"
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
