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
- [FIX] test_bench_runner_overhead.py has 1 slow test, not 2: File defines a single test at tests/runner/test_bench_runner_overhead.py:119; collect-only shows 1 deselected and the -m slow list has 1 bench entry. Report rows claim '241/2 slow' and '(2 slow)'. Correct both rows and the slow-reduction budget (total 18 stays correct). (.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/output.yaml)
- [FIX] TestPublicSymbolSurface is a unique surface lock, do not remove as duplicate: TestPublicSymbolSurface (tests/checkers/test_stub_fidelity_invariants.py:277-322) hasattr-loops 19 re-exported fidelity names; grep confirms it is the sole surface-lock test and other stub tests import only subsets. Removing it loses the re-export/split-preservation contract with no named survivor. Keep it or prove the import union covers all 19 names and name the surviving pin. (.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/output.yaml)
- [FIX] Serialization canonical/empty properties are not pinned by integration replay: tests/test_golden.py:152-215 asserts canonical format (sorted, sort_keys, indent=2, trailing newline), empty-input arrays, and tool-minimum mapping order. tests/integration.py:115-122 byte-identical replay proves determinism on one non-empty real finding set, not unsorted/empty/mapping-order properties. Narrow the removal to truly redundant rows or keep the canonical/empty pins with surviving coverage. (.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/output.yaml)
- [FIX] _semantic.pyi citation 1-42 is wrong; file is 27 lines: wc -l src/python_setup_lint/checkers/_semantic.pyi = 27, so '1-42' in the exclusion table is impossible. Correct to 1-27 (whole-file exclusion intent unchanged). (.factory/tasks/modernize/items/test-debloat-audit-i2/steps/001-research-r1-a1/output.yaml)

- [OPTIONAL] Clarify LoC counting method; wc -l differs slightly: Report claims 14,664 test + 3,693 helper LoC; wc -l gives 14,650 (58 test_*.py + integration.py) and 3,716 (14 helpers). Gap is immaterial to the 1.3-1.8k budget but state the counter (wc vs parser, trailing newline, integration inclusion) for replan reproducibility. Uncertainty: runtime figures (e.g. 6.53s vs 9.69s observed for test_setup_install) are environment-sensitive; note measurement conditions.
- [OPTIONAL] Clarify whether per-module N is default-collected or total incl slow: Rows like test_extra_tools_downstream '209/4 (1 slow)' are ambiguous: default collect shows 4 while the slow list adds 1 (total 5?). State once that N = default-collected unless noted, so replan does not miscount slow-inclusive totals.

## Output

Yield a structured JSON object matching this schema:
- status (string, required, enum: ["ok","inconclusive"])
- summary (string, required)
- findings (string, required)
- contextPack (string, optional)
- sources (array of string, optional)
- recommendations (array of string, optional)
