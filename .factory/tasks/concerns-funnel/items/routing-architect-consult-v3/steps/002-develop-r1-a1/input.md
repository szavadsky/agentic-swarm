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
  "slug": "routing-architect-consult-v3",
  "kind": "dev",
  "title": "Architect consult and hydration (merge repair)",
  "assignment": "Act-phase ONLY merge-repair rerun (pure derive already merged in routing-blocker-derive-v2; do NOT touch derive/task.ts or scheduler). Implement wave-act newly-blocked check writing decisions/concern-<cid>.yaml exactly once (restart idempotent, runExclusive + atomic write) plus buildArchitectHydration concernsYaml extension appended LAST (open+routed, capped sub-budget, plan-reviewer path stays open-only) per adr-routing-derived-state and adr-concern-store-taskwt. Do NOT redesign: rebase the exact ready routing-architect-consult-v2 diff onto current topic tip, verify wave-9 sibling conflict resolution kept ALL THREE diffs (consult + adr-blocking-digest-v2 + status-state-surface-v2), pull the exact merge-gate failure (failing test names + output from evidence) and fix root cause. Out of scope: 4 optional nits (carry to docs-finish). Gates: bun run typecheck and TMPDIR=/tmp bun test test/engine/concerns-funnel.test.ts then full suite. Behavior must satisfy m3-routing: single consult file on newly-blocked, restart writes no second file, architect hydration contains concern id+summary.",
  "outlineRef": "routing-architect-consult-v3",
  "milestone": "m3-routing",
  "wave": 10,
  "deps": [
    "modes-prompts-v2",
    "routing-blocker-derive-v2"
  ],
  "citations": [
    "adr-routing-derived-state",
    "adr-concern-store-taskwt",
    "adr-triage-suggestions-dismiss"
  ]
}

## Target
{
  "selectors": [
    "test/engine/routing-architect-consult.test.ts"
  ],
  "expectRed": [
    "Routing: architect consult and hydration.writes one concern decision file and hydrates architect turns with routed concerns",
    "Routing: architect consult and hydration.restart after a mid-iteration failure neither repeats the consult nor rewrites the decision"
  ]
}

## Context & Citations
[
  "adr-routing-derived-state",
  "adr-concern-store-taskwt",
  "adr-triage-suggestions-dismiss"
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
