# Step: Test Assumptions

## Goal
Author permanent automated tests that explicitly verify third-party library behavior, runtime assumptions, and interface contract guarantees.

## Rules
- Permanent tests: Write tests into `paths.tests` designed to stay in the repository. Do NOT write temporary or throwaway tests.
- Assumption validation: Test boundary behaviors, edge conditions, return value contracts, and exception types that subsequent code will rely upon.
- Test infra first: Verify failure detection. Prove tests fail when assumptions are violated.
- Verification: Run tests via `bash` using project test runner; ensure tests pass cleanly on current environment.

## Assignment
{{assignment}}

## Context
{{context}}
