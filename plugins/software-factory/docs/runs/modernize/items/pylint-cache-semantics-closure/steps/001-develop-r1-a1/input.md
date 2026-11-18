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
  "slug": "pylint-cache-semantics-closure",
  "kind": "test-assumptions",
  "title": "Land or verify pylint writer/timing verdict",
  "assignment": "Close iteration-2 M3 gap (test-assumptions: permanent tests in paths.tests asserting assumptions; review checks validity; offline, no src writes). If tests/assumptions/test_pylint_cache_semantics.py already merged at HEAD, verify verdict exists and is readable and report location; else land EXACTLY ONE new file at that path (no_external_api, test_<api>_given_<condition>_then_<expected>, offline, no src writes). Writer-first verdict must pin writer identity + timing + --path scoping (crash-safe lock vs runner post-merge vs jobs=1/sidecars-if--j). Verdict is consumed by epic-semantic-infrastructure cache concurrency (epic must not invent semantics). Covers U3/TD3-I1 and ADR-010 writer-first input.",
  "outlineRef": "pylint-cache-semantics-closure",
  "milestone": "M1",
  "wave": 1,
  "scenarioRefs": [
    "M1: Epic kickoff gated on validated artifacts"
  ],
  "citations": [
    "src/python_setup_lint/checkers/_semantic.py:37-52",
    "docs/semantic-justification.md:34-45",
    "docs/semantic-justification.md:56-62",
    "pyproject.toml:49-49",
    "CodingRules.md:230-306"
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
