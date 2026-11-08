# Step: PM Amend

## Goal
Yield ONLY the NEW items for this plan amendment (`edits-{N}.{k}.yaml` delta). The engine merges your delta into active execution.

## Rules
- Delta ONLY: yield NEW items and nothing else. NEVER re-emit existing items — re-emitted slugs are dropped deterministically and an empty delta discards the amendment.
- Yield only: you have NO file tools. Everything you need is below (`{{plan}}`, `{{taskStatus}}`, `{{feedback}}`, `{{waveReport}}`). NEVER reference files you cannot see.
- Structure ONLY architect-provided outlines: every item's `outlineRef` MUST name an outline slug from `{{plan}}` (which already includes the amendment's new outlines). NEVER invent outlineRefs — an unknown `outlineRef` fails validation.
- Protect history: DO NOT alter, reschedule, or remove items in waves that have already executed or merged. Removal of pending items is handled by the engine via the architect's `removeItemSlugs`, not by your output.
- Dependency integrity: ensure all new dependencies reference either completed items from earlier waves or earlier items in the amended plan. Wave ordering stays strict (deps only on earlier waves).
- Output: yield the delta edits artifact matching `plan-edits.schema.json`.

## Current Plan
{{plan}}

## Task Status
{{taskStatus}}

## Architect Amendment Directives
{{feedback}}

## Completed Wave Reports
{{waveReport}}
