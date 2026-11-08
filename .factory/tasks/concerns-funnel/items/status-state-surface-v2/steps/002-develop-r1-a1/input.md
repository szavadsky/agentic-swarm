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
  "slug": "status-state-surface-v2",
  "kind": "dev",
  "title": "State counts and status surfacing",
  "assignment": "Sole owner StateArtifact.concerns {open,dismissed,routed,resolved}: state.schema, toStateArtifact/refreshStateYaml (missing dir zeros, corrupt skip+warn), CLI Concerns plus separate Blocking vs Digest sections. Tests: counts, missing/corrupt handling, CLI sections.",
  "outlineRef": "status-state-surface-v2",
  "milestone": "m4-funnel-surface",
  "wave": 9,
  "deps": [
    "concerns-store-v2",
    "routing-human-debt-v2"
  ]
}

## Target
{
  "selectors": [
    "test/engine/state-concern-counts.test.ts",
    "test/contracts/state-concern-schema.test.ts",
    "test/cli/status-concerns.test.ts"
  ],
  "expectRed": [
    "test/engine/state-concern-counts.test.ts::StateArtifact concern counts (§18)::counts stored concerns by status",
    "test/engine/state-concern-counts.test.ts::StateArtifact concern counts (§18)::reports zero counts when the concerns directory is missing",
    "test/engine/state-concern-counts.test.ts::StateArtifact concern counts (§18)::skips corrupt concern files and warns instead of failing derivation",
    "test/engine/state-concern-counts.test.ts::StateArtifact concern counts (§18)::refreshStateYaml materializes the counts into state.yaml",
    "test/contracts/state-concern-schema.test.ts::State schema concern counts::accepts concern status counts and rejects incomplete ones",
    "test/cli/status-concerns.test.ts::factory status concern surfacing (§18)::prints concern counts and separates blocking from digest questions",
    "test/cli/status-concerns.test.ts::factory status concern surfacing (§18)::prints zero counts when the task has no concerns yet"
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
