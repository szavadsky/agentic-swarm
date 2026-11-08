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
  "slug": "reviewer-triage-v2",
  "kind": "dev",
  "title": "Workhorse reviewer triage",
  "assignment": "Item reviewer triage: hydrate steps/review with concernsYaml (id/kind/severity/summary/affects), isTriager gate, exact-id partitionSuggestions excluding triage ids from fix-loop/approval/normal mailbox, fix-on-concern returns fixRequired once, mailbox dedup q-concern-<cid>, dismiss requires non-empty detail persisted to dismissReason else step errors, condensing output<input, debt predicate with no tech-debt disposition. Tests: dismiss no routing, routed persists, QA non-triager no-op, missing detail errors, fix-once, no double mailbox.",
  "outlineRef": "reviewer-triage-v2",
  "milestone": "m2-triage-modes",
  "wave": 7,
  "deps": [
    "concerns-store-v2"
  ]
}

## Target
{
  "selectors": [
    "test/engine/reviewer-triage.test.ts"
  ],
  "expectRed": [
    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).hydrates steps/review with terse concern fields and triage instructions",
    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).partitions exact-id triage from findings and flags fix once",
    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).renders condensing concern YAML without detail and within the byte cap",
    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).dismisses a concern with its reason and routes nothing",
    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).persists routed dispositions and applies the debt predicate without a tech-debt disposition",
    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).returns fixRequired once for fix-on-concern and keeps it in the fix loop",
    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).writes one deduped q-concern mailbox entry for human-async triage",
    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).rejects dismiss triage without detail and leaves the concern unchanged",
    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).fails the review step when a dismiss triage lacks detail",
    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).gates non-triagers: QA matching a concern id is a no-op",
    "test/engine/reviewer-triage.test.ts::Reviewer triage (§8.7, §18).blocks the item with a single q-concern mailbox entry in the engine flow"
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
