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
  "slug": "plan-reviewer-triage-v2",
  "kind": "dev",
  "title": "Plan-reviewer triage",
  "assignment": "Plan-reviewer triage: aggregate plan/revise concerns + remarkable rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition and dismiss vocabulary as item reviewer, non-dismissed become routed. Tests: dismissed vs routed, rm-* triaged, debt predicate (kind tech-debt routed OR disposition optional routed), no approval trigger from triage ids.",
  "outlineRef": "plan-reviewer-triage-v2",
  "milestone": "m2-triage-modes",
  "wave": 7,
  "deps": [
    "concerns-store-v2"
  ]
}

## Target
{
  "selectors": [
    "test/engine/plan-reviewer-triage.test.ts"
  ],
  "expectRed": [
    "test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.hydrates plan-review with plan concerns and triages dismiss vs routed ids",
    "test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.aggregates architect-revise concerns and remarkable rm-* for the next review round",
    "test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.keeps triage ids out of the plan fix loop so they never trigger a revision",
    "test/engine/plan-reviewer-triage.test.ts::Plan-reviewer triage.derives debt from routed tech-debt concerns and routed optional dispositions only"
  ]
}

## Context & Citations
[]

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
