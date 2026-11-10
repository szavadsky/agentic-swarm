# Step: PM Amend

## Goal
Yield ONLY the NEW items for this plan amendment (`edits-{N}.{k}.yaml` delta). The engine merges your delta into active execution.

## Rules
- Delta ONLY: yield NEW items and nothing else. NEVER re-emit existing items — re-emitted slugs are dropped deterministically and an empty delta discards the amendment.
- Yield only: you have NO file tools. Everything you need is below (`{{plan}}`, `{{taskStatus}}`, `{{feedback}}`, `{{waveReport}}`, `{{limits}}`). NEVER reference files you cannot see.
- Item cap: your delta is validated against `maxItemsPerPlan` TOGETHER with every item that already exists in task history — not against the plan alone. `{{limits}}` states how many items already exist and the exact remaining budget. Yield at most that many NEW items; when the amendment implies more scope, yield the highest-value items only. Exceeding the cap fails validation and discards the whole amendment.
- Structure ONLY architect-provided outlines: every item's `outlineRef` MUST name an outline slug from `{{plan}}` (which already includes the amendment's new outlines). NEVER invent outlineRefs — an unknown `outlineRef` fails validation.
- Protect history: DO NOT alter, reschedule, or remove items in waves that have already executed or merged. Removal of pending items is handled by the engine via the architect's `removeItemSlugs`, not by your output.
- Dependency integrity: every `deps` entry MUST be the slug of an item that already exists in task history, or the slug of another item in THIS delta scheduled in a STRICTLY earlier wave. NEVER put an outline slug, an epic slug, or a not-yet-scheduled slug in `deps` — unknown dependencies fail validation. Never depend on yourself; never create cycles; never depend on the same wave.
- Wave scheduling: new items land in waves after the current wave; deps must be strictly earlier (dep.wave < item.wave). Keep at most `maxParallelItems` new items per wave.
- Output: yield the delta edits artifact matching `plan-edits.schema.json`.

## Current Plan
{{plan}}

## Task Status
{{taskStatus}}

## Architect Amendment Directives
{{feedback}}

## Completed Wave Reports
{{waveReport}}

## Limits
{{limits}}

## Limit Violations
{{limitViolations}}
