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
  "slug": "concerns-contracts-types",
  "kind": "dev",
  "title": "Concern artifact types",
  "assignment": "Types only (split 1/3 of concerns-contracts per decision 001; unblocks schemas+policy). In src/core/artifacts.ts add Concern/ConcernKind/ConcernSeverity/ConcernStatus, RemarkableDecision, StoredConcernArtifact (+pendingResolution?, source.escalated?), ReviewDisposition+dismiss (no tech-debt value), PlanAdr.blocking, PipelineConfig.humanInvolvement+concerns{raiseAllowlist,minDigestSeverity,minBlockingSeverity}, reviewPolicy.default canonical + legacy allowedDispositions alias in type. No JSON schemas, no runtime, no repair logic (deferred to concerns-store). Do not implement aggregate/repair/triage; do not use cross-file $ref. Prod budget <=80 lines. Verify: bun run typecheck. Run with TMPDIR=/tmp.",
  "outlineRef": "concerns-contracts-types",
  "milestone": "m1-contracts-aggregate",
  "wave": 2,
  "citations": [
    "docs/factory.v2.md:89-103",
    "plugins/software-factory/src/core/artifacts.ts:313-325"
  ]
}

## Target
{
  "selectors": [
    "test/contracts/concern-artifact-types.test.ts"
  ],
  "expectRed": [
    "Concern artifact types.exposes structured concerns and remarkable decisions with strict vocabularies",
    "Concern artifact types.stores concern lifecycle metadata including pending resolution and escalation",
    "Concern artifact types.adds dismiss to review dispositions without a tech-debt value",
    "Concern artifact types.marks plan ADRs as blocking or remarkable",
    "Concern artifact types.adds human involvement modes, concern thresholds, and canonical review policy to pipeline config"
  ]
}

## Context & Citations
[
  "docs/factory.v2.md:89-103",
  "plugins/software-factory/src/core/artifacts.ts:313-325"
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
