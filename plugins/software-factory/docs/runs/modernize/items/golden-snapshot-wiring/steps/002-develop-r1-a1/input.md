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
  "slug": "golden-snapshot-wiring",
  "kind": "dev",
  "title": "Commit golden files and wire integration capture",
  "assignment": "Using tests/_golden.py from golden-helpers-unit and probe verdict. (1) Commit tests/data/golden/minimal_sample_project_findings.json + ..._tool_counts.json via helper serialization, outside sample dir, never copied/linted; violations.txt RETAINED as oracle. (2) Edit tests/integration.py test_setup_new_and_lint only: keep first run (no baseline, rc!=0) AND retain tool-section/SKIPPED/[CRASH]/W9705 assertions; add dedicated second capture (caller owns tmp, copy_sample, git-init, _make_config with package_name+rumdl override, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0) calling collect_findings; replace substring loop with golden equality + oracle/tool coverage; brush-off/carry as tool-qualified lookups (tool='pylint', file='src/minimal_sample/mod.py', line 49 present / 56 absent); drift injection on in-memory list copies only. Run captures on temp copies only — never bare `uv run lint` on repo (ruff-format write hazard). Bounded src allowance ONLY if probe proved test-side insufficient: runner/baseline.py relativize/sort + runner/parsers.py|_record_parsers.py ordering, <=40 added lines, determinism-only (no finding added/removed), reviewed diff in report. Acceptance: `uv run pytest tests/integration.py -v` and `uv run pytest tests/test_golden.py -q` pass; PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 regen twice byte-identical; golden+counts byte-stable.",
  "outlineRef": "golden-snapshot-wiring",
  "milestone": "M1",
  "wave": 7,
  "deps": [
    "golden-determinism-probe",
    "golden-helpers-unit"
  ],
  "scenarioRefs": [
    "M1: Golden snapshot pins current behavior",
    "M1: Behavior drift is reported precisely",
    "M1: Deterministic regeneration",
    "M1: Planted-rule and per-tool coverage preserved",
    "M1: Crash/skip coverage retained outside golden"
  ],
  "citations": [
    "tests/_golden.py",
    "tests/integration.py",
    "tests/data/golden/minimal_sample_project_findings.json",
    "ADR-001",
    "TD-3"
  ]
}

## Target
{
  "selectors": [
    "tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint"
  ],
  "expectRed": [
    "tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint"
  ]
}

## Context & Citations
[
  "tests/_golden.py",
  "tests/integration.py",
  "tests/data/golden/minimal_sample_project_findings.json",
  "ADR-001",
  "TD-3"
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
