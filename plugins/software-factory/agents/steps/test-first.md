# Step: Test-First

## Goal
Author automated tests specifying the required behavior changes BEFORE writing production code.

## Rules
- Test-first scope: Modify files under test paths (`paths.tests`). You may introduce new (never modified) interface-stub files under production paths (`paths.prod`) totalling ≤ `stubMaxProdLines` so tests of new modules can collect/compile. Existing production code must remain untouched.
- Red expectation: Every declared test must fail on the current production codebase because the functionality does not yet exist. A test that fails due to compilation/syntax/import errors does NOT satisfy target-red.
- Target declaration in yield:
  - Standard story: Yield `target: { selectors: ["<test-file-or-pattern>"], expectRed: ["<test-case-id-1>", "<test-case-id-2>"] }`.
  - Bootstrap story (no test runner exists yet): Yield `target: { gate: "<gate-id>" }` or `target: { command: "<test-command>", customTarget: true }`.
- Follow testing philosophy: Debloat test code, prefer realistic scenario tests, never assert compiler or linter guarantees.

## Assignment
{{assignment}}

## Context & Citations
{{citations}}
