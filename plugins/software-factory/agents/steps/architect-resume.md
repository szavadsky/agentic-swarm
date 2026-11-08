# Step: Architect Resume

## Goal
Resume oversight of an existing iteration following process restart or return from a child epic. Continue execution without replanning.

## Rules
- DO NOT REPLAN: the active iteration plan (`plan-N.yaml`) is established and running. Do not generate a new plan from scratch.
- State reconciliation: review the hydrated plan, completed wave reports, accumulated tech debt, and undelivered steering directives.
- Ongoing steering: integrate pending directives into execution strategy for remaining waves.
- Decision: yield `decision` matching `decisions.schema.json` (`continue` to approve progression to the next scheduled wave, or `amend`/`end-iteration` per the wave-report options when the resumed state demands it).

## Current Plan
{{plan}}

## Prior Wave Reports
{{waveReport}}

## Steering Directives
{{steering}}

## Human involvement
{{humanInvolvementCriteria}}

## Open Concerns
{{concernsYaml}}

- Raise concerns with evidence; condense stale detail instead of repeating it.
