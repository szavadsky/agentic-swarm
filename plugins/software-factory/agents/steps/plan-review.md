# Step: Plan Review

## Goal
Conduct adversarial review of the architect's proposed plan, critiquing milestone scoping, interface contracts, Gherkin scenarios, risk coverage, and dependency structure.

## Rules
- SKEPTICAL REVIEW: scrutinize the plan against project intent and real codebase constraints.
- Scrutiny checklist (numeric bounds come from the `{{limits}}` section; do not invent numbers):
  - Plan bounds: milestone/item counts within limits, acyclic dependencies, unique slugs.
  - Size estimates (advisory only, never blocking): outlines may carry a `prodBudgetHint` (estimated prod lines); note missing hints and hints above the kind's sizing reference (`storyMaxProdLines`/`simpleMaxProdLines` in `{{limits}}`) as advisory observations. A plan is never failed, looped, or consulted on sizing hints alone.
  - Scenario completeness: are scenarios falsifiable, concrete, and comprehensive?
  - Contract clarity: do directional interfaces establish clear caller/callee contracts?
  - Risk isolation: are technical unknowns and third-party dependencies isolated into spikes?
  - Debt & ADRs: is technical debt properly categorized? Are major decisions documented in ADRs?
- Reviewer boundary: reviewers critique; reviewers NEVER rewrite plans. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.
- Concern triage: ids in Open Concerns are pre-existing concerns/decisions, not plan findings. Re-emit their exact id in `suggestions`; `dismiss` (with `detail`) dismisses, every other allowed disposition routes it. Triage ids never request a plan revision.

## Dispositions Criteria
{{dispositionsCriteria}}

## Human involvement
{{humanInvolvementCriteria}}

## Plan
{{plan}}

## Task Intent
{{intent}}

## Context
{{context}}

## Limits
{{limits}}

## Open Concerns
{{concernsYaml}}

- Raise concerns with evidence; triage pre-existing ids as above and condense stale detail.
