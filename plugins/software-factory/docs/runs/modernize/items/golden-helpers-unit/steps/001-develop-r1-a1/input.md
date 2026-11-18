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
  "slug": "golden-helpers-unit",
  "kind": "test-only",
  "title": "Golden helpers module with synthetic unit tests",
  "assignment": "Create tests/_golden.py as SOLE golden owner (no pipeline run in this item). Implement: UPDATE_ENV='PYTHON_SETUP_LINT_UPDATE_GOLDEN', SEMANTIC_ENV='PYTHON_SETUP_LINT_SEMANTIC'; Finding TypedDict {tool:str, file:str|None, line:int|None, col:int|None, rule:str}; finding_key(f) None-safe (tool, file or '', line if int else -1, col if int else -1, rule) mirroring _violation_sort_key; normalize_record (drop msg, relativize vs project, strip './', backslash->'/', as_posix, assert non-absolute); serialize via json.dump(indent=2, sort_keys=True)+trailing newline; assert_matches_golden (Counter multiset diff, sorted added/removed; UPDATE=1: pytest.fail('refusing to rewrite golden under CI...') if CI/GITHUB_ACTIONS else warn+rewrite golden+counts together); read_oracle_rules, slice_tool_section, assert_oracle_coverage, assert_tool_coverage. Consume golden-determinism-probe report normalization spec. Add tests/test_golden.py with synthetic Finding lists ONLY (no run_lint, no pipeline): finding_key None vs str/int ordering, POSIX normalization, multiset diff exact added/removed, CI-guard fail, coverage asserts, serialization byte-format. Constraints: no src/ changes, no golden files yet, module <=500 lines, formatted. Acceptance: `uv run pytest tests/test_golden.py -q` passes.",
  "outlineRef": "golden-helpers-unit",
  "milestone": "M1",
  "wave": 6,
  "deps": [
    "golden-determinism-probe"
  ],
  "scenarioRefs": [
    "M1: Golden snapshot pins current behavior",
    "M1: Behavior drift is reported precisely",
    "M1: Deterministic regeneration"
  ],
  "citations": [
    "tests/_golden.py",
    "tests/test_golden.py",
    "ADR-001"
  ]
}

## Target
tests

## Context & Citations
[
  "tests/_golden.py",
  "tests/test_golden.py",
  "ADR-001"
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
