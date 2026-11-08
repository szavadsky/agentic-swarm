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
  "slug": "routing-human-debt-v2",
  "kind": "dev",
  "title": "Human mailbox and debt routing",
  "assignment": "Human mailbox + debt routing: human-async blocks [item] and continues without exit-10, human-stop blocks task/item + exit-10 halt + blocked derive, human-awareness blocks [] digest-only never blocking/exiting, debt predicate kind==tech-debt routed/resolved OR disposition==optional routed. Tests: mailbox files per disposition, exit 10 on stop, awareness continues, debt includes [item] summary.",
  "outlineRef": "routing-human-debt-v2",
  "milestone": "m3-routing",
  "wave": 8,
  "deps": [
    "modes-prompts-v2",
    "reviewer-triage-v2"
  ]
}

## Target
{
  "selectors": [
    "test/engine/routing-human-debt.test.ts"
  ],
  "expectRed": [
    "test/engine/routing-human-debt.test.ts::Human mailbox and debt routing (§8.7, §18).derives item blocking and task continuation per human disposition",
    "test/engine/routing-human-debt.test.ts::Human mailbox and debt routing (§8.7, §18).halts with exit 10 and writes a task/item human-stop mailbox entry",
    "test/engine/routing-human-debt.test.ts::Human mailbox and debt routing (§8.7, §18).writes a digest-only human-awareness entry and continues to completion",
    "test/engine/routing-human-debt.test.ts::Human mailbox and debt routing (§8.7, §18).keeps running other items while one item waits on human-async",
    "test/engine/routing-human-debt.test.ts::Human mailbox and debt routing (§8.7, §18).collects debt with [item] prefixes for routed/resolved tech-debt and routed optional concerns"
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
