# Step: Fix-Round

## Goal
Address reviewer suggestions and gate failures from the previous development attempt. Deliver focused corrections resolving reported defects.

## Rules
- Defect resolution: resolve all suggestions marked with disposition `fix`. Consider `optional` suggestions only if straightforward and safe.
- Delta focus: keep changes tightly scoped to reported concerns. Do not introduce unrelated modifications or refactors.
- Non-regression: ensure all previously green tests remain passing and all project gates pass cleanly.
- Updated evidence: yield `status: ok` with updated `evidence` (array of strings) documenting personal verification of each corrected defect per `developer-output.schema.json`.

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

## Review Feedback
- [FIX] Blocking/remarkable routing dropped when adrFolder unset: iteration.ts:388 gates entire persistAdrs (markdown + mailbox routing + halt) on project.adrFolder, but adrFolder is optional in ProjectConfig. When undefined, blocking ADRs never reach tousertoreview nor halt, silently losing the safety signal. Markdown write should be gated, routing must always run. Split persistAdrs or make folder optional; add test with no adrFolder asserting mailbox entry with blocks:[task] and blocked/exit-10. (plugins/software-factory/src/core/flows/iteration.ts)

- [OPTIONAL] Revise-path ADRs not persisted or routed: architect-revise merges plan.adrs into plan yaml without persistAdrs nor halt check, so blocking ADR added/flipped during revise never creates docs/adr md or mailbox entry and waves still run. Reuse persistAdrs (idempotent via deterministic question IDs) plus task-block halt after revise loop.
- [OPTIONAL] Redundant mailbox scan duplicates derive logic: hasOpenTaskBlockingQuestion re-scans tousertoreview with questionBlocks(q,task), duplicating deriveTaskState.hasTaskLevelOpenQuestion already computed by refreshStateYaml just before. Reuse refreshStateYaml return status instead of new helper to keep single source of truth.
- [OPTIONAL] Unsanitized ADR id used as filename: persistAdrs joins adrDir with `${adr.id}.md` from LLM-supplied plan without sanitizing; ../ or / would escape adrDir or create subdirs. Clean like writeQuestion cleanRef or reject traversal. Pre-existing pattern, low severity (architect already has worktree write), harden while touched.
- [OPTIONAL] Revise prompt omits blocking guidance: architect.md and architect-plan.md document blocking:true vs remarkable, but architect-revise.md (also outputs plan.schema with ADRs) has no ADR/blocking mention, risking dropped/flipped flags on revise. Mirror one-line blocking rule for consistency.

## Check Results



> **TRIMMED COPY.** Original `input.md` = 228331 bytes / 4753 lines. This in-repo copy keeps the
> prompt head (through `## Current Diff`) and the trailing `## Output` section quoted in
> `IMPLEMENTATION.md` §J; the embedded multi-thousand-line code diff between them is elided.
> Full live record: `/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/.factory/tasks/concerns-funnel/items/adr-blocking-digest-v2/steps/005-develop-r2-a1`.

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
