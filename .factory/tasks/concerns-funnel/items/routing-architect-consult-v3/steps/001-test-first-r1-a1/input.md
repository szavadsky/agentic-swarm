# Step: Test-First

## Goal
Author automated tests specifying the required behavior changes BEFORE writing production code.

## Rules
- Test-first scope: modify files under test paths (`paths.tests`). You may introduce new (never modified) interface-stub files under production paths (`paths.prod`) within the engine-enforced stub budget so tests of new modules can collect/compile. Existing production code must remain untouched.
- Red expectation: every declared test must fail on the current production codebase because the functionality does not yet exist. A test that fails due to compilation/syntax/import errors does NOT satisfy target-red.
- Prove test infra first: confirm the runner executes your new tests and reports failures correctly before declaring the target.
- Target declaration in yield:
  - Standard story: yield `target: { selectors: ["<test-file-or-pattern>"], expectRed: ["<test-case-id-1>", "<test-case-id-2>"] }` (both required; `expectRed` non-empty).
  - Test id format: declare `expectRed` ids in the runner's native node-id form (e.g. pytest `tests/test_math.py::test_add`); the engine normalizes node ids against JUnit ids when matching.
  - Bootstrap story (no test runner exists yet): yield `target: { gate: "<gate-id>" }` or `target: { command: "<test-command>", customTarget: true }`. The gate/command itself must currently fail (red).
- Never test lint/format rules: assert behavior, never style or compiler-guaranteed facts. Debloat test code preserving intent.
- Output: yield structured output per `developer-output.schema.json`.

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
