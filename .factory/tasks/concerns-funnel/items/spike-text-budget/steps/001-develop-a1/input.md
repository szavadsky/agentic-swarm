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
  "slug": "spike-text-budget",
  "kind": "test-assumptions",
  "title": "Spike: funnel byte budget",
  "assignment": "Verify funnel byte budget assumptions (adr-funnel-text-budget) with NO prod code. Add permanent exploratory tests under test/engine/ measuring item/wave diff bytes vs concern detail sizes; assert per-level UTF-8 byte caps on hydrated promptVars only (stored artifacts never truncated): code steps min(diffBytes,2000) where diff is item diff for review and wave aggregated diff for close-ups, zero-diff orchestration steps min(inputBytes,500) where input is plan/context bytes, reviewer/architect/close-up condensing requires output bytes < input bytes, no 500-floor violation. Cover: wave diff 5000B + concerns 3000B => concernsYaml <=2000B and < diff; zero-diff 4000B input => <=500B and < input. Finding record only; gates funnel-closeups. Run TMPDIR=/tmp bun test on new test file.",
  "outlineRef": "spike-text-budget",
  "milestone": "m1-contracts-aggregate",
  "wave": 1,
  "scenarioRefs": [
    "m4-funnel-surface:s1",
    "m4-funnel-surface:s2"
  ],
  "citations": [
    "docs/factory.v2.md:89-103",
    "plugins/software-factory/src/core/flows/iteration.ts:439-485"
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
