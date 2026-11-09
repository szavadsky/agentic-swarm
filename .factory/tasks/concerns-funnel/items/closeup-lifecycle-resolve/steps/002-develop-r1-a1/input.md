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
  "slug": "closeup-lifecycle-resolve",
  "kind": "dev",
  "title": "Close-up lifecycle and unblock",
  "assignment": "Requires contracts-drift-fix (schemas/TS), epic-saga-propagate (propagate helper for accept+propagate), human-router-severity (router/derive). Own ingest + apply only per adr-closeup-lifecycle-resolved (no schema edits). ingestStepConcerns reads concernConfirms + concernResolution; consults.ts concernResolution passthrough; cross-emission guard (honor only concern consults + closeup/architect contexts, else ignore+journal); ordering: consult apply at decision commit, confirms at architect ingest. Resolutions->pendingResolution with status unchanged; confirms accept: resolve->resolved, carry->routed+architect, propagate->parent copy/digest via epic helper; reject clears pending, preserves status, no disposition. Consult act phase applies resolve->resolved at decision commit (unblocks next derive). Wave-close-up fallback over triage-less open (open, no pendingResolution, no disposition): tech-debt->optional (in derived debt list), assumption|risk|question->architect; kind=blocker stays open for explicit triage; fallback never assigns human-* dispositions. Behavior tests: pending/confirm accept matrix (resolved/routed/propagated), reject preserves open with no disposition, consult resolve unblocks by id on next derive, guard ignores item-consult resolution with journal, simple-item fallback + debt inclusion, blocker stays open, resolved reachable. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~240 prod lines.",
  "outlineRef": "closeup-lifecycle-resolve",
  "milestone": "m3-routing-lifecycle",
  "wave": 3,
  "deps": [
    "contracts-drift-fix",
    "epic-saga-propagate",
    "human-router-severity"
  ],
  "scenarioRefs": [
    "m3-routing-lifecycle:8",
    "m3-routing-lifecycle:9",
    "m3-routing-lifecycle:10"
  ],
  "citations": [
    "plugins/software-factory/src/core/derive/task.ts:167-205",
    "plugins/software-factory/src/core/steer.ts:59-88",
    "plugins/software-factory/src/core/flows/iteration.ts:439-485"
  ],
  "escalate": true
}

## Target
{
  "selectors": [
    "test/engine/closeup-lifecycle-resolve.test.ts"
  ],
  "expectRed": [
    "Close-up lifecycle: architect confirmations.accept resolves a pending resolve and derive exposes the resolved status",
    "Close-up lifecycle: architect confirmations.accept carries a pending carry to the architect",
    "Close-up lifecycle: architect confirmations.accept propagates a pending propagate to the parent concern store",
    "Close-up lifecycle: architect confirmations.reject clears the pending resolution, preserving open status and disposition",
    "Close-up lifecycle: consult unblock.consult resolve unblocks the affected item on the next derive",
    "Close-up lifecycle: consult unblock.ignores concernResolution from an item consult and journals the drop",
    "Close-up lifecycle: wave fallback.falls back over triage-less open concerns and lists tech-debt as derived debt",
    "Close-up lifecycle: wave fallback.leaves blocker concerns open for explicit triage"
  ]
}

## Context & Citations
[
  "plugins/software-factory/src/core/derive/task.ts:167-205",
  "plugins/software-factory/src/core/steer.ts:59-88",
  "plugins/software-factory/src/core/flows/iteration.ts:439-485"
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
