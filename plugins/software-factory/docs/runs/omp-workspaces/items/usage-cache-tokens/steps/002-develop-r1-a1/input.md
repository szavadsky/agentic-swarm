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
  "slug": "usage-cache-tokens",
  "kind": "dev",
  "title": "Cache-token usage plumbing end to end",
  "assignment": "Dev item, tests-first, prod budget ~180 lines. Extend Usage/StepUsage types with optional cacheReadTokens/cacheWriteTokens/totalTokens plus cost breakdown {costUsd?, cost?: {input?, output?, cacheRead?, cacheWrite?}}; parse them in the NDJSON usage parser tolerating absent keys; persist in step meta records; aggregate with zero-defaults in budget/derive helpers; surface cache columns in status output. All new fields optional; historical records without cache keys remain valid (missing->0, no migration); schemas gain optional properties only. Behavior tests (write failing first): fixture NDJSON turn carrying usage.cacheRead/cacheWrite and cost sub-fields parses and persists; old-record backward compat; budget sums include cache with zero-defaults; status shows cache columns. Constraints: cwd=plugins/software-factory, fixtures repo-relative; baseline red disk-space test accepted as-is, ratchet on no NEW failures. Acceptance: M2 scenarios 1-2 (parse/persist/aggregate + backward compat).",
  "outlineRef": "usage-cache-tokens",
  "milestone": "m2-measure-stabilize",
  "wave": 2,
  "scenarioRefs": [
    "m2-measure-stabilize:scenario-1",
    "m2-measure-stabilize:scenario-2"
  ],
  "citations": [
    "docs/factory.v2.md:114-120",
    "plugins/software-factory/docs/OMP_ADAPTER.md:163-168",
    "plugins/software-factory/src/cli/status.ts:24-70"
  ]
}

## Target
{
  "selectors": [
    "test/harness/ndjson-usage-cache.test.ts",
    "test/engine/usage-cache-tokens.test.ts",
    "test/contracts/usage-cache-schema.test.ts",
    "test/sessions.test.ts"
  ],
  "expectRed": [
    "parses cache read/write tokens, total tokens and cost breakdown",
    "zero-defaults cache fields when a historical turn omits them",
    "forwards cache fields to the onUsage callback",
    "persists cache tokens and cost breakdown into step meta records",
    "keeps historical records without cache keys and aggregates zero defaults",
    "sums cache tokens with zero defaults across mixed old and new records",
    "BudgetTracker sums cache tokens with zero defaults",
    "status output surfaces cache token columns",
    "step-meta accepts cache tokens and cost breakdown and keeps legacy usage valid",
    "state spend breakdowns accept cache token columns",
    "accumulates cache tokens and cost breakdown across turns"
  ]
}

## Context & Citations
[
  "docs/factory.v2.md:114-120",
  "plugins/software-factory/docs/OMP_ADAPTER.md:163-168",
  "plugins/software-factory/src/cli/status.ts:24-70"
]

## Review Feedback


## Open Concerns
- id: c-552344216d
  kind: blocker
  severity: high
  summary: Merge-path gates run without infra.setup in the child worktree; missing node_modules fails typecheck
  affects:
    - "19.2"
    - wave-merge
- id: c-f972360209
  kind: tech-debt
  severity: medium
  summary: Merge redrive ignores retry-with-guidance (no execution path); guidance-only recovery cannot fix environmental gate failures
  affects:
    - redrive
    - wave-merge


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
