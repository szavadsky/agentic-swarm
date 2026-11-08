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
  "slug": "adr-blocking-digest-v2",
  "kind": "dev",
  "title": "Blocking vs remarkable ADRs",
  "assignment": "Blocking vs remarkable ADRs: full ADR md title/context/decision/consequences/blocking, blocking routed per mode table with exit-10 when stop, remarkable digest-only never waiting, dispositions.md exit-10 preserved. Tests: blocking mailbox+blocks, remarkable digest only.",
  "outlineRef": "adr-blocking-digest-v2",
  "milestone": "m3-routing",
  "wave": 9,
  "deps": [
    "modes-prompts-v2",
    "routing-human-debt-v2"
  ]
}

## Target
{
  "selectors": [
    "test/engine/adr-blocking-digest.test.ts"
  ],
  "expectRed": [
    "test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs (§18).writes full ADR markdown with context, decision, consequences, and blocking status",
    "test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs (§18).routes a blocking ADR to the mailbox with task blocks and halts with exit 10",
    "test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs (§18).reports a remarkable ADR in the digest and lets the run complete",
    "test/engine/adr-blocking-digest.test.ts::Blocking vs remarkable ADRs (§18).respects the active mode table for blocking and remarkable ADRs"
  ]
}

## Context & Citations
[]

## Review Feedback
Fix in adr-blocking-digest-v2 (one round): 1) Add a terse `{{humanInvolvementCriteria}}` section to agents/steps/architect-plan.md, agents/steps/architect-revise.md, and agents/steps/plan-review.md (plan-review triages ADR/concern blocking per matrix). Insert after the existing criteria/dispositions block with a short heading (e.g. `## Human involvement` + placeholder only, no prose duplication — criteria text comes from agents/criteria/human-involvement.md via formatHumanInvolvementCriteria). Keep each addition ≤5 lines to respect the 15/60 debloat budget. 2) Do NOT touch step-runner computation or KNOWN_VARS registration (already correct). 3) Add a prompt-render test (extend test/human-involvement-config.test.ts): render architect-plan, architect-revise, and plan-review prompts with a sentinel humanInvolvementCriteria string and assert the sentinel appears in each rendered prompt. 4) Verify: bun run typecheck + TMPDIR=/tmp bun test (prompts.test preflight must stay green). Out of scope: steps/review placeholder (triage items own it), digest/blocking logic changes.

Output validation and repair failed: Agent output failed schema validation:
/: must be object ({"type":"object"})

Budget: 149 prod lines changed vs storyMaxProdLines 300 (kind dev). Shrink the diff or escalate; do not re-verify green checks from scratch.

Fix-or-escalate: address the failing check above directly. If the failure is unsatisfiable or the budget cannot be met, yield status failed/blocked with evidence instead of burning another attempt.

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
