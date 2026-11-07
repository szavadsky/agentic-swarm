# Step: PM Amend

## Goal
Generate an updated plan edits artifact (`edits-{N}.{k}.yaml`) incorporating the architect's plan amendment into active execution.

## Rules
- Delta execution: Apply architect's modifications to upcoming waves. Add new items, update dependencies, or supersede remaining items.
- Protect history: DO NOT alter, reschedule, or remove items in waves that have already executed or merged.
- Dependency integrity: Ensure all new dependencies reference either completed items from earlier waves or earlier items in the amended plan. Acyclic wave rules remain strict.
- Output: Yield the updated edits artifact.

## Current Plan
{{plan}}

## Architect Amendment Directives
{{feedback}}

## Completed Wave Reports
{{waveReport}}
