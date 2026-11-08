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

## Target
{
  "selectors": [
    "test/prompts.test.ts",
    "test/human-involvement-config.test.ts"
  ],
  "expectRed": [
    "test/prompts.test.ts::prompts: PromptLibrary & preflightPrompts.throws with descriptive error listing missing variables when render fails",
    "test/prompts.test.ts::prompts: concern fragment matrix (adr-prompt-fragment-matrix).registers concernsYaml for every concern-producing and triaging fragment",
    "test/prompts.test.ts::prompts: concern fragment matrix (adr-prompt-fragment-matrix).renders Open Concerns and Raise concerns instructions on all 19 matrix fragments",
    "test/prompts.test.ts::prompts: concern fragment matrix (adr-prompt-fragment-matrix).renders Human involvement criteria and the condense rule on triage fragments",
    "test/prompts.test.ts::prompts: concern fragment matrix (adr-prompt-fragment-matrix).switches autonomous and detailed criteria inside a rendered matrix fragment",
    "test/human-involvement-config.test.ts::human-involvement pipeline configuration.registers concernsYaml for producers and humanInvolvementCriteria for triagers",
    "test/human-involvement-config.test.ts::human-involvement pipeline configuration.preflight accepts the new vars on matrix fragments and rejects them elsewhere",
    "test/human-involvement-config.test.ts::human-involvement criteria reach triager prompts.renders sentinel criteria in every triage fragment of the matrix"
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
