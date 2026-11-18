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
  "slug": "remaining-lint-violations-fix",
  "kind": "no-behavior",
  "title": "Fix remaining src/tests lint violations (W9704 tail)",
  "assignment": "Close M1 green-baseline W9704 tail (no-behavior, red-test-exempt). Context: baseline-violations-fix (merged) fixed SIM102/R0914/C0208; lint stays red on 2 W9704 sites never owned by any item (TD2-B2 omitted them). Depends on baseline-violations-fix — start from HEAD containing it; no other deps.\n\nScope: (1) src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py options-Any site; (2) src/python_setup_lint/testing.py list[Any]/type-ignore site. If reproduction surfaces additional src/** or tests/** violations, fix ONLY if trivially behavior-preserving (justification-comment strengthening); else record as debt in report — do not balloon scope.\n\nSteps: 1) Reproduce via declared split gates (format check + lint gate check-only without --fix) or scoped pylint/pylint-pyi/pylint-tests on src/** and tests/**; capture exact remaining violations (tool, file:line, rule). 2) Fix with justification-comment-only edits (no logic/config changes) so check_if_meaningful accepts. 3) Verify.\n\nFORBIDDEN: lint.baseline edits (stays []); tests/data/** changes; golden regen; unrelated refactors; .secrets.baseline; writes outside repo.\n\nSecrets-triage verdict is human-async and out of scope.\n\nVerify: lint gate zero violations in src/** and tests/**; `uv run pytest -q` no new failures; `uv run pytest tests/integration.py -v` no new failures; golden+counts byte-identical; touched files format-clean (ruff format --check with shipped config). Report before/after violation list + per-file disposition + any deferred debt.",
  "outlineRef": "remaining-lint-violations-fix",
  "milestone": "M1",
  "wave": 3,
  "deps": [
    "baseline-violations-fix"
  ],
  "scenarioRefs": [
    "M1: Gates green per-gate"
  ],
  "citations": [
    "src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py",
    "src/python_setup_lint/testing.py"
  ]
}

## Target
tests

## Context & Citations
[
  "src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py",
  "src/python_setup_lint/testing.py"
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
