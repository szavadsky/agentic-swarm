# Step: Test Assumptions

## Goal
Author permanent automated tests that explicitly verify third-party library behavior, runtime assumptions, and interface contract guarantees.

## Rules
- Permanent tests: write tests into `paths.tests` designed to stay in the repository. Do NOT write temporary or throwaway tests.
- Assumption validation: test boundary behaviors, edge conditions, return value contracts, and exception types that subsequent code will rely upon.
- Test infra first: verify failure detection. Prove tests fail when assumptions are violated.
- Verification: run tests via `bash` using project test runner; ensure tests pass cleanly on current environment.
- Output: yield structured output per `developer-output.schema.json` (`status: ok` with executed verification in `evidence`).
- Fix-round re-entry: when `Review Feedback` below is non-empty, address ONLY the listed concerns with targeted follow-up work; do NOT regenerate the suite from scratch.

## Assignment
{
  "slug": "decision-runtime-pinning",
  "kind": "test-assumptions",
  "title": "Pin chosen runtime wheels and API contracts",
  "assignment": "GOAL: Pin chosen runtime wheels and API contracts conditional on eval recommendation. Conditional: no-go from model-eval-poc means report-only skip with no file. STEPS: For chosen runtime only verify py3.14 CPU wheels for linux,mac,win, import and device and offline contract (CPU fallback, no network on hit), and custom-code pinning (vendored revision, never unpinned trust_remote_code). Add tests/assumptions/test_decision_runtime_contracts.py with no_external_api marker and test_<api>_given_<condition>_then_<expected> names. No src changes. VERIFY: New assumption tests pass offline or explicit blocker recorded for iteration-3 epic; wheels and APIs pinned.",
  "outlineRef": "decision-runtime-pinning",
  "milestone": "M3",
  "wave": 3,
  "deps": [
    "model-eval-poc"
  ],
  "scenarioRefs": [
    "M3-1"
  ],
  "citations": [
    "src/python_setup_lint/checkers/_semantic.py:93-122",
    "src/python_setup_lint/checkers/_semantic.py:37-52",
    "pyproject.toml:28-31",
    "docs/semantic-justification.md:5-14"
  ]
}

## Context


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
