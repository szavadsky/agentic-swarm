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
{{assignment}}

## Context
{{context}}

## Review Feedback
{{feedback}}
