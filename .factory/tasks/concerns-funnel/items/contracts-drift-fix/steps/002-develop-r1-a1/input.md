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
  "slug": "contracts-drift-fix",
  "kind": "dev",
  "title": "Producer type and schema drift",
  "assignment": "Schemas + TS only, no ingest/apply/runtime, no hydration, no routing. Own artifacts.ts + review-schema.ts + review.schema.json + wave-report output + plan-closeup + decisions schemas per adr-closeup-lifecycle-resolved (schema half). artifacts.ts: DeveloperOutput concerns Concern[], ReviewArtifact newConcerns + remarkable, FactFinder/WaveCloseup/PlanCloseup/Decision concerns/remarkable, ConcernConfirms + ConcernResolution types (concernConfirms?: [{id,confirm:accept|reject,note?}], concernResolution?: {id,action:resolve|carry}). review-schema.ts + review.schema.json: add remarkable (fix additionalProperties failure). Wave-report output + plan-closeup schemas: concernConfirms. decisions.schema + DecisionArtifact: concernResolution. Normalize ALL concern Detail->lowercase detail across schemas (fix developer-output capital-D bug). Triage/infra/pm-edit schemas still reject concerns (no change). Behavior/contract tests: structured concerns/remarkable from developer (incl poc/test-assumptions/test-first/simple-implement/fix-round), fact-finder (incl research), qa, reviewer/plan-reviewer newConcerns+remarkable, plan/revise, decisions concernResolution, close-ups concernResolutions, architect concernConfirms all validate + typecheck with matching TS; lowercase detail validates and persists; reviewer remarkable passes; triage/infra/pm-edit reject. Verify: bun run typecheck + preflight. Budget ~140 prod lines.",
  "outlineRef": "contracts-drift-fix",
  "milestone": "m2-contracts-epic",
  "wave": 1,
  "scenarioRefs": [
    "m2-contracts-epic:1"
  ],
  "citations": [
    "docs/factory.v2.md:89-103",
    "plugins/software-factory/src/core/artifacts.ts:313-325",
    "plugins/software-factory/src/core/records/review-schema.ts:5-52"
  ]
}

## Target
{
  "selectors": [
    "test/contracts/concern-schemas.test.ts",
    "test/contracts/concern-artifact-types.test.ts"
  ],
  "expectRed": [
    "Concern producer schemas.adds remarkable and lowercase detail to reviewer, plan-reviewer, QA, and file review schemas",
    "Concern producer schemas.adds concernConfirms and concernResolution to architect report decisions",
    "Concern producer schemas.adds concernConfirms to plan close-up outputs while preserving concernResolutions",
    "Concern artifact types.types structured concerns and remarkable decisions on every producer artifact",
    "Concern artifact types.types concern confirmations and decision resolutions with strict vocabularies"
  ]
}

## Context & Citations
[
  "docs/factory.v2.md:89-103",
  "plugins/software-factory/src/core/artifacts.ts:313-325",
  "plugins/software-factory/src/core/records/review-schema.ts:5-52"
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
