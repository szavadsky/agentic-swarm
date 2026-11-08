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
  "slug": "prompt-fragments",
  "kind": "dev",
  "title": "Fragment matrix and raise instructions",
  "assignment": "Own prompt-vars.ts + fragments + prompts.test matrix per adr-prompt-fragment-matrix (no hydration bytes, no router). KNOWN_VARS gains concernsYaml on steps/develop,develop,steps/test-first,test-first,steps/simple-implement,simple-implement,steps/fix-round,fix-round,steps/poc,poc,steps/test-assumptions,test-assumptions,steps/research,research (+humanInvolvementCriteria only where already registered). Sections: producers (develop-family+poc/test-assumptions/research) get 3-line ## Open Concerns {{concernsYaml}} + 1-line raise (no HI: raise never triage); triagers/architects/close-ups/qa get HI section + condense rule appended. Deltas: architect-plan/revise add OC+raise; review adds HI+condense; plan-review adds raise+condense; rest per matrix. Budgets: added lines per fragment <=15, total <=80 (2-3-line sections); prompts.test asserts per-fragment sentinels (## Open Concerns + Raise concerns on all 19; ## Human involvement on review/qa/plan-review/architect-*/close-ups) + budgets; update human-involvement-config.test.ts non-consumer assertion (develop leaves, triage/infra stay) + FRAGMENT_MATRIX. Behavior tests: sections render with sentinels, mode switch (pipeline.yaml humanInvolvement detailed) changes criteria, budget assertions pass. Verify: preflight + bun run typecheck. Budget ~120 prod lines.",
  "outlineRef": "prompt-fragments",
  "milestone": "m1-hydration-prompts",
  "wave": 1,
  "scenarioRefs": [
    "m1-hydration-prompts:5"
  ],
  "citations": [
    "plugins/software-factory/src/core/flows/item-machine.ts:628-647",
    "plugins/software-factory/src/core/flows/iteration.ts:439-485",
    "docs/factory.v2.md:89-103"
  ]
}

## Context & Citations
[
  "plugins/software-factory/src/core/flows/item-machine.ts:628-647",
  "plugins/software-factory/src/core/flows/iteration.ts:439-485",
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
