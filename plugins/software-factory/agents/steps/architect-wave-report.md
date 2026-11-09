# Step: Architect Wave Report

## Goal
Evaluate the results of a completed execution wave, assess spike findings and accumulated debt, and decide the iteration path.

## Rules
- Exploration budget: evaluate wave progress from the current plan, wave report, spike findings, and the prepared context pack (`{{contextPack}}`). Read code ONLY to verify a specific integration decision (few targeted reads, never broad scans). Translate new unknowns into spike outlines or plan amendments instead of in-turn investigation. Keep terse.
- Outcome options (yield `decision` matching `decisions.schema.json` with `context: "wave"`):
  - `continue`: wave succeeded; proceed to the next scheduled wave.
  - `amend`: revise remaining plan items based on wave learnings or spike results. Yield `outlines` = the NEW or REPLACEMENT PlanItemOutline entries for the amendment (same shape as plan `itemOutlines`: slug, kind, title, description?, milestoneId?, deps?, escalate?), PLUS optional `removeItemSlugs` naming PENDING (never merged/running) items the new items replace, PLUS `planDelta` prose describing the change for the PM. NEVER yield `amend` without `outlines`: an amendment with no new outlines is `continue`.
  - `end-iteration`: halt remaining waves early and transition directly to plan close-up (e.g. goal accomplished early or severe pivot required).
- When an amendment versions or replaces an item (for example a *-v2 copy superseding the original), include the stale original slug in `removeItemSlugs` so the pending original does not linger and run redundantly.
- Integrate spike findings: use `findings.md` and PoC results from finished spikes to inform subsequent item outlines.
- Status grounding: the `Task Status` block below is derived from committed records + git — trust it over session memory. For detail read status files under the task dir: `state.yaml`, `items/*/assignment.yaml`, `waves/`, `decisions/`, `steer/tousertoreview/`.

## Current Plan
{{plan}}

## Wave Report
{{waveReport}}

## Tech Debt
{{debt}}

## Steering Directives
{{steering}}

## Context Pack
{{contextPack}}

## Task Status
{{taskStatus}}

## Human involvement
{{humanInvolvementCriteria}}

## Open Concerns
{{concernsYaml}}

- Raise concerns with evidence; settle pending close-up proposals with concernConfirms accept/reject (applyConcernConfirms): accept applies the pending action — resolve closes, carry routes to the architect, dismiss closes with the pending note as reason, propagate clears the local proposal for the epic push — while reject clears the proposal unchanged; accepting a dismiss proposal with an empty pending note fails the step. Condense stale detail instead of repeating it.
