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
  "slug": "runner-dispatch-split",
  "kind": "no-behavior",
  "title": "Split dispatch registry below limits",
  "assignment": "Owns runner/dispatch*.py + runner/__init__.py (sole __init__ writer) + registry tests ONLY (enumerated: tests/runner/test_lint_runner.py incl its stale :7 disable removal, test_lint_runner_stats.py, test_t3_coverage.py, test_testing_fakes.py; recount at HEAD); FORBIDDEN baseline.py/parsers.py (shim item), types.py/_cli_complexity.py/cli.py (cache-impl threading), tests/data, baseline edits, docs. Canonical lists: TOOLS = frozen built-in ToolSpec list (dispatch.py:46, verify); LINT_TOOLS = live mutable registry (:507) mirroring TOOLS plus extras via register_lint_tool — PRESERVED with mutation semantics intact (consumers _select_tools/_config.py:127/cli.py/extra_tools unaffected); EXPECTED_TOOL_NAMES keeps deriving from TOOLS (:144). Split dispatch.py 542 (disable :1) into modules each <=500 (registry/strategies/parser-sets) with single-sourced re-exports through runner/__init__.py (same public names: TOOLS, LINT_TOOLS, EXPECTED_TOOL_NAMES, FORMATTER_ONLY, RECORDLESS_TOOLS, STATISTICS/RECORD sets, STRATEGIES, TOOLS_BY_NAME, GenericLintTool, LintTool, register_lint_tool); FORMATTER_ONLY/RECORDLESS explicit; no threshold raises. After shim merges: remove __init__ peek lines (doc :17, import :22, __all__ :62 — verify at HEAD) iff shim deleted, else keep with evidence. Migrate registry/fakes tests to EXPECTED/STATISTICS sets. Verify: no too-many-lines in split; registry tests pass; format exit 0; scoped lint zero new; no new failures vs M1 table; golden hash-equal or shift report {justification-class, keys, CHANGELOG snippet, file:line}.",
  "outlineRef": "runner-dispatch-split",
  "milestone": "M3",
  "wave": 3,
  "deps": [
    "runner-compat-shim-removal"
  ],
  "scenarioRefs": [
    "M3: Runner split without drift"
  ],
  "citations": [
    "CodingRules.md:90-107",
    "CodingRules.md:139-159"
  ],
  "escalate": true
}

## Target
tests

## Context & Citations
[
  "CodingRules.md:90-107",
  "CodingRules.md:139-159"
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
