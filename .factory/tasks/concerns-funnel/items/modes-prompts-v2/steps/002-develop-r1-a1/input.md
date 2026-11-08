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
  "slug": "modes-prompts-v2",
  "kind": "dev",
  "title": "Modes, thresholds, prompt wiring",
  "assignment": "Implement humanInvolvement + concerns thresholds: schema/loader/merge, PipelineConfig.humanInvolvement default autonomous + concerns {raiseAllowlist,minDigestSeverity,minBlockingSeverity}, commented autonomous/principal/detailed presets with blocking table in config/pipeline.default.yaml, terse agents/criteria/human-involvement.md fragment, KNOWN_VARS concernsYaml + humanInvolvementCriteria wired per fragment matrix. Behavior: mode switch changes criteria fragment and blocking-ADR routing; preflight green. Must precede all routing items. Verify: typecheck + preflightPrompts.",
  "outlineRef": "modes-prompts-v2",
  "milestone": "m2-triage-modes",
  "wave": 6,
  "deps": [
    "concerns-contracts-policy",
    "concerns-contracts-schemas",
    "concerns-contracts-types"
  ]
}

## Target
{
  "selectors": [
    "test/human-involvement-config.test.ts"
  ],
  "expectRed": [
    "human-involvement pipeline configuration.defaults to autonomous mode with concern raise/digest/blocking policy",
    "human-involvement pipeline configuration.layers humanInvolvement and concern thresholds through project and task configs",
    "human-involvement pipeline configuration.applies overrides last and supports null deletion of concern keys",
    "human-involvement pipeline configuration.schema accepts all modes and thresholds, rejects unknown values, and stays closed at root",
    "human-involvement pipeline configuration.ships commented autonomous/principal/detailed presets with a blocking table",
    "human-involvement pipeline configuration.registers a terse human-involvement criteria fragment and loads it",
    "human-involvement pipeline configuration.registers concernsYaml and humanInvolvementCriteria for the fragment matrix",
    "human-involvement pipeline configuration.preflight accepts the new vars on matrix fragments and rejects them elsewhere",
    "human-involvement mode switching at prompt time.selects the active mode section plus the shared ADR blocking table",
    "human-involvement mode switching at prompt time.renders empty involvement criteria when no fragment is configured",
    "human-involvement mode switching at prompt time.lets callers provide hydrated concernsYaml without dropping the criteria"
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
