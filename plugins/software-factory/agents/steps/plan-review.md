# Step: Plan Review

## Goal
Conduct adversarial review of the architect's proposed plan, critiquing milestone scoping, interface contracts, Gherkin scenarios, risk coverage, and dependency structure.

## Rules
- SKEPTICAL REVIEW: Scrutinize the plan against project intent and real codebase constraints.
- Scrutiny checklist:
  - Plan bounds: Milestones ≤ 8, items ≤ 50, acyclic dependencies, unique slugs.
  - Scenario completeness: Are scenarios falsifiable, concrete, and comprehensive?
  - Contract clarity: Do directional interfaces establish clear caller/callee contracts?
  - Risk isolation: Are technical unknowns and third-party dependencies isolated into spikes?
  - Debt & ADRs: Is technical debt properly categorized? Are major decisions documented in ADRs?
- Reviewer boundary: Reviewers critique; reviewers NEVER rewrite plans. Report defects in `suggestions` with appropriate dispositions:
{{> _shared/dispositions}}

## Plan
{{plan}}

## Task Intent
{{intent}}

## Context
{{context}}

## Limits
{{limits}}
