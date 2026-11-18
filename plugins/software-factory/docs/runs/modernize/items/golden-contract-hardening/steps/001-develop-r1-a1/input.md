# Step: Develop

## Goal
Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.

## Rules
- Target green: every test selector and case identified in `target` MUST pass cleanly.
- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.

## Assignment
{
  "slug": "golden-contract-hardening",
  "kind": "test-only",
  "title": "Harden golden via caller asserts and shared slicer",
  "assignment": "GOAL: Harden golden contract via caller asserts and shared slicer per ADR-006; committed files never mutated by proofs. SCOPE: tests only. STEPS: Keep collect_findings(project,config) in tool order with no sort (synthetic-empty safe); sorting stays in serialize_write plus _diff_keys; add caller asserts in test_setup_new_and_lint (len findings not zero post-collect; first-run CRASH absent plus SKIPPED only package_name retained); keep Counter-multiset diff plus UPDATE guard failing under CI and GITHUB_ACTIONS plus oracle and tool coverage (read_oracle_rules, assert_oracle_coverage, assert_tool_coverage); use slice_tool_section(output,[pylint],[pylint-pyi]) in overlay test; extend tests/test_golden.py synthetic coverage for ordering, POSIX, diff keys, CI-guard, coverage, byte-format, empty-list safe; no Finding CRASH sentinel. Determinism via temp-copy double-collect: collect plus serialize on two fresh temp copies, sha256 hashes equal each other and equal committed golden hash. UPDATE_GOLDEN equals 1 never touches committed files except reviewed regen. VERIFY: integration plus test_golden pass; golden plus counts byte-identical.",
  "outlineRef": "golden-contract-hardening",
  "milestone": "M2",
  "wave": 2,
  "deps": [
    "consolidate-integration-helpers-i2"
  ],
  "scenarioRefs": [
    "M2-3"
  ],
  "citations": [
    "CodingRules.md:230-306",
    "AGENTS.md:87-93",
    "pyproject.toml:49-49",
    "lint.baseline:1-1"
  ]
}

## Target
tests

## Context & Citations
[
  "CodingRules.md:230-306",
  "AGENTS.md:87-93",
  "pyproject.toml:49-49",
  "lint.baseline:1-1"
]

## Review Feedback

## Output

Yield a structured JSON object matching this schema:
- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
- summary (string, required): Concise summary of implementation actions and test results
- target (object, optional): Target test selectors, gate, or custom command for red/green verification
  - Option 1:
    - selectors (array of string, required)
    - expectRed (array of string, required, minItems: 1)
  - Option 2:
    - gate (string, required)
  - Option 3:
    - command (string, required)
    - customTarget (boolean, required)
- evidence (array of string, optional): List of executed checks and verification commands proving correctness
- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
- notes (string, optional): Optional developer notes, implementation observations, or comments
