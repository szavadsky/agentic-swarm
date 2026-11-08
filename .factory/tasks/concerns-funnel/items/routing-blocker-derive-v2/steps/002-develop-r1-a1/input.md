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
  "slug": "routing-blocker-derive-v2",
  "kind": "dev",
  "title": "Blocker derive",
  "assignment": "Pure derive only, no writes: derive/task.ts collectRoutedBlockers(taskDir)->Set + deriveWave/deriveItem integration (thread blockedBy into deriveItemState or post-process before every deriveWaveState call), scheduler.blockedByConcern reusing blockedByFailure fixpoint, union with failure-blocked, cascade only over declared deps. Spike-saga-commit findings authoritative. Tests: dependent blocked, non-dependent unaffected, transitive via declared deps only.",
  "outlineRef": "routing-blocker-derive-v2",
  "milestone": "m3-routing",
  "wave": 8,
  "deps": [
    "modes-prompts-v2",
    "plan-reviewer-triage-v2",
    "reviewer-triage-v2"
  ],
  "escalate": true
}

## Target
{
  "selectors": [
    "test/engine/routing-blocker-derive.test.ts",
    "test/plan-scheduler.test.ts"
  ],
  "expectRed": [
    "plan/scheduler: blockedByConcern.blocks concern-affected items and their declared dependents in PM order",
    "plan/scheduler: blockedByConcern.unions concern blocking with the failure-blocked fixpoint over declared deps",
    "plan/scheduler: blockedByConcern.ignores refs naming no item and never blocks a done item",
    "derive/task: collectRoutedBlockers.collects affects of routed blocker concerns and ignores other statuses and kinds",
    "derive/task: collectRoutedBlockers.returns an empty set when the task has no concerns directory",
    "derive/wave: routed blocker integration.routes a concern-affected item and its declared dependents to blocked",
    "derive/wave: routed blocker integration.cascades transitively over declared deps only",
    "derive/item: routed blocker integration.blocks only the item named by a routed blocker",
    "derive/item: routed blocker integration.keeps a terminal item status over routed blocking",
    "derive/task: routed blocker scenario.blocks affected items and declared dependents, leaving non-dependents pending without writes",
    "derive/task: routed blocker scenario.derives the task blocked when every item is in the routed blocker cascade"
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
