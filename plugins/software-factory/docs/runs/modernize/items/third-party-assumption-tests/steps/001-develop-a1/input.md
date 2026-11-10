# Step: Test Assumptions

## Goal
Author permanent automated tests that explicitly verify third-party library behavior, runtime assumptions, and interface contract guarantees.

## Rules
- Permanent tests: write tests into `paths.tests` designed to stay in the repository. Do NOT write temporary or throwaway tests.
- Assumption validation: test boundary behaviors, edge conditions, return value contracts, and exception types that subsequent code will rely upon.
- Test infra first: verify failure detection. Prove tests fail when assumptions are violated.
- Verification: run tests via `bash` using project test runner; ensure tests pass cleanly on current environment.
- Output: yield structured output per `developer-output.schema.json` (`status: ok` with executed verification in `evidence`).

## Assignment
{
  "slug": "third-party-assumption-tests",
  "kind": "test-assumptions",
  "title": "Pin astroid/pylint/beartype contracts",
  "assignment": "Create tests/assumptions/__init__.py + 3 modules (test_astroid_contracts.py, test_pylint_contracts.py, test_beartype_contracts.py) with distinct classes TestAstroidContracts/TestPylintContracts/TestBeartypeContracts, pytestmark no_external_api, tests named test_<api>_given_<condition>_then_<expected> asserting OBSERVED behavior at pinned versions. astroid: Module.stream().read() bytes|str-tolerant (product decodes-if-bytes); doc_node Const/JoinedStr when docstring present else None for module/class/function; nodes_of_class(tuple) returns union in document order; Const/JoinedStr expose int fromlineno/end_lineno/col_offset/end_col_offset (assert on sample literal). pylint (third-party side): PyLinter.register_checker lifecycle incl open()/close() order (record observed); CheckerTestCase/UnittestLinter capture into release_messages (assert observed MessageTest shape); MessageDefinitionTuple leading fields (msgid,symbol,description) + record full arity. beartype: decorate fn with TYPE_CHECKING-only forward-ref, assert OBSERVED outcome (call-time vs import-time vs checker-only), record in item report for M3. No src/ changes. Must NOT touch AGENTS.md (consolidate is sole counts owner). Acceptance: `uv run pytest tests/assumptions -q` all pass, one test per contract.",
  "outlineRef": "third-party-assumption-tests",
  "milestone": "M2",
  "wave": 1,
  "scenarioRefs": [
    "M2: Third-party contracts pinned",
    "M2: Assumption failures diagnose at the source"
  ],
  "citations": [
    "pyproject.toml:10-16",
    "pyproject.toml:48-55",
    "src/python_setup_lint/checkers/_base.py:142-158",
    "src/python_setup_lint/checkers/conformance/suppression_justification_checker.py:152-158",
    "CodingRules.md:230-306"
  ]
}

## Context

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
