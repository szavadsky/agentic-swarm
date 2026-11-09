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
  "slug": "epic-saga-propagate",
  "kind": "dev",
  "title": "Epic to saga propagation",
  "assignment": "Requires hydration-fingerprint-caps (saga hydration must show epic copies). Own engine.runChildTask -> propagateEpicConcerns per adr-epic-push-condensed; spike-saga-commit/Decision 002 authoritative; no ingest/confirm logic. Call propagateEpicConcerns({childTaskDir,parentTaskDir,parentWt,epic}) after runIteration before child-closeup write, every status: push open+routed (skip dismissed); c-* copies get summary [epic] <child summary>, id=recomputed fingerprint, status open, source {epic, record epic:<epic>/<child-record>}; child rm-* propagate as parent rm-* with chosen prefixed [epic], id recomputed, why condensed. Condense UTF-8 char-safe: detail<=120B verbatim; else cut to min(500B,half) on char boundary (strictly shorter). Writes use aggregate opts {commit:false}; parent-side propagate+closeup+add+commit serialized under KeyedMutex(parentWt) (never repo.writeLock); existing single commit covers copies+closeup; restart-idempotent merge preserving parent triage. Forward childTaskDir/steer/tousertoreview entries with blocks.length>0 to parent.taskDir/steer/tousertoreview as q-epic-<epic>-<orig>, blocks mapped (child item slugs->epic; child-task-level->parent task slug; default [epic]). No back-sync (child complete, forwarded parent-owned). Copies open/unrouted -> no parent halt; halt only via forwarded questions. Behavior tests: one condensed copy incl rm-*, dismissed local, tiny-detail verbatim, 800B detail <=500B strictly shorter char-safe, saga architect concernsYaml contains epic id+summary, restart no dup, forwarded q-epic-* with mapped blocks, no parent exit-10 from copies. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~190 prod lines.",
  "outlineRef": "epic-saga-propagate",
  "milestone": "m2-contracts-epic",
  "wave": 2,
  "deps": [
    "hydration-fingerprint-caps"
  ],
  "scenarioRefs": [
    "m2-contracts-epic:2",
    "m2-contracts-epic:3"
  ],
  "citations": [
    "plugins/software-factory/src/core/steer.ts:59-88",
    "plugins/software-factory/src/core/fingerprint.ts:20-50",
    "docs/factory.v2.md:89-103"
  ],
  "escalate": true
}

## Target
{
  "selectors": [
    "test/engine/epic-saga-propagate.test.ts"
  ],
  "expectRed": [
    "Epic to saga propagation (adr-epic-push-condensed).copies open and routed concerns with an [epic] summary while dismissed stays local",
    "Epic to saga propagation (adr-epic-push-condensed).condenses long detail and why to the byte cap on a char boundary",
    "Epic to saga propagation (adr-epic-push-condensed).is restart-idempotent and preserves parent triage",
    "Epic to saga propagation (adr-epic-push-condensed).forwards blocked child questions as q-epic-* with mapped blocks",
    "Epic to saga propagation (adr-epic-push-condensed).hydrates propagated copies into the saga architect concernsYaml",
    "Epic to saga propagation (adr-epic-push-condensed).runTask exits 0 when only open copies were propagated",
    "Epic to saga propagation (adr-epic-push-condensed).propagates after a failed child iteration as well"
  ]
}

## Context & Citations
[
  "plugins/software-factory/src/core/steer.ts:59-88",
  "plugins/software-factory/src/core/fingerprint.ts:20-50",
  "docs/factory.v2.md:89-103"
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
