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
  "slug": "target-green-ratchet-fix",
  "kind": "dev",
  "title": "Apply baseline ratchet to target-green gate targets",
  "assignment": "Dev fix, tests-first, small prod diff (~60 lines hint) in plugins/software-factory/src/core/checks/runner.ts checkTargetGreen gate-target branch (lines 644-676): apply the same baseline ratchet runGates uses. When the gate command fails, load gates-baseline.yaml, derive the failing-test set (with JUnit re-derivation parity where runGates does it), and PASS when failures are a subset of baseline; otherwise FAIL with actionable evidence (new failing tests + command + output, same evidence shape as gate failures). No behavior change when baseline is absent/empty or target is fully green. Behavior tests-first with tmp-repo fixtures (cwd=plugins/software-factory, no network): (1) gate target failing ONLY on baseline-listed tests passes via ratchet; (2) gate target with one NEW failing test outside baseline still fails naming the new test; (3) fully green gate target passes without invoking ratchet. Record selector targets (new spec selector) — NEVER a gate target — so this item itself merges cleanly on the red baseline (td-baseline-disk). Verify the new spec file is green.",
  "outlineRef": "target-green-ratchet-fix",
  "milestone": "m1-omp-de-risk",
  "wave": 3
}

## Target
{
  "selectors": [
    "test/checks/target-green-ratchet.test.ts"
  ],
  "expectRed": [
    "target-green baseline ratchet for gate targets.gate target that only fails baseline-listed tests passes via ratchet",
    "target-green baseline ratchet for gate targets.gate target with a new failing test outside baseline fails naming the new test",
    "target-green baseline ratchet for gate targets.old-format baseline re-derives failing tests at the baseline commit before ratcheting"
  ]
}

## Context & Citations
[]

## Review Feedback


## Open Concerns
- id: rm-02fe59eb65
  kind: remarkable
  summary: Deterministic architect brief skeleton + cheap `@simpler` relevance judge (`brief.ts`)
- id: rm-61c10c8318
  kind: remarkable
  summary: Schema-bound architect plan (`plan.schema.json`) with PM structuring item edits
- id: rm-63922d9635
  kind: remarkable
  summary: Configure omp via a generated YAML overlay per turn


- Review the concerns above before starting; they constrain this step but are not part of the assignment.
- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.

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
- concerns (array of object, optional): Structured concerns raised during implementation
  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
  - summary (string, required)
  - detail (string, optional)
  - severity (string, optional, enum: ["low","medium","high"])
  - location (object, optional)
    - file (string, required)
    - line (integer, optional)
  - affects (array of string, optional)
- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
  - chosen (string, required)
  - why (string, required)
  - alternatives (array of string, required)
- notes (string, optional): Optional developer notes, implementation observations, or comments
