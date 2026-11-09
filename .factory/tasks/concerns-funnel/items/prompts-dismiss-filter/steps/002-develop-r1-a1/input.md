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
  "slug": "prompts-dismiss-filter",
  "kind": "dev",
  "title": "Dismiss criteria row + prompt filtering",
  "assignment": "Implement adr-dismiss-criteria-row (prod budget ~15 lines). (1) Add one terse dismiss row + rule to agents/criteria/dispositions.md (triager-only, reason required, kept on disk). (2) Extend formatDispositionsSection in src/core/prompts.ts:90-110 to filter dismiss rows/rules when allowed excludes dismiss, mirroring existing human-stop filtering; keep rows when allowed includes dismiss (QA-excludes vs reviewer-includes). (3) Add render test locking QA-excludes/reviewer-includes behavior. (4) Keep test/prompts.test.ts fragment matrix + 15-per-fragment/80-total debloat budgets green. Verify: typecheck + TMPDIR=/tmp bun test green.",
  "outlineRef": "prompts-dismiss-filter",
  "milestone": "m1-dismiss-contract",
  "wave": 1,
  "scenarioRefs": [
    "m1-dismiss-contract:s1",
    "m1-dismiss-contract:s2",
    "m1-dismiss-contract:s3",
    "m1-dismiss-contract:s4"
  ],
  "citations": [
    "docs/factory.v2.md:89-103",
    "plugins/software-factory/src/core/records/review-schema.ts:5-52",
    "plugins/software-factory/src/core/flows/item-machine.ts:628-647"
  ]
}

## Target
{
  "selectors": [
    "test/prompts.test.ts"
  ],
  "expectRed": [
    "prompts: dismiss disposition contract (adr-dismiss-criteria-row).documents a terse triager-only dismiss row and rule kept on disk",
    "prompts: dismiss disposition contract (adr-dismiss-criteria-row).filters dismiss rows and rules unless the allowed set includes dismiss",
    "prompts: dismiss disposition contract (adr-dismiss-criteria-row).renders dismiss criteria for triager reviewers but not QA"
  ]
}

## Context & Citations
[
  "docs/factory.v2.md:89-103",
  "plugins/software-factory/src/core/records/review-schema.ts:5-52",
  "plugins/software-factory/src/core/flows/item-machine.ts:628-647"
]

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
