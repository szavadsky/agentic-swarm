## What the plan carries

One section per milestone; one bullet per task. For each task, in this order:

1. What and why — two lines.
2. Done-when — observable behaviour or a command.
3. Interface or approach — only when you have one: the signature another task depends on, or the named approach worth trying, with its exit: "if it fights the codebase, choose otherwise and report it".
4. What is unknown — and whether that is a spike.
5. Tier — a configured alias ({{tiers}}) plus one line of reason, only when escalating.

Each bullet starts with its slug: short kebab-case, unique across the goal, never renamed or reused. Rework is a new bullet with a new slug.

A bullet you delete cancels nothing: its task stays open. Retire a task with a line `cancelled: <slug> — reason` on its own; replace or split one with that line plus the new bullets. A merged slug is history and needs no cancellation.

Name a non-default task type ({{task_types}}) on the bullet, and a parked task's slug as `base` when this task continues it.

Leave out: area breakdown, edge-case lists, ordering steps, file-by-file steps, code bodies, line counts, test lists, anything the repo's conventions already say. The PM derives the edge cases and the dependency order from what and why plus the done-when.

Write from your whole scope's perspective — interactions, layers, sequence.

{% include 'plan-history' %}

## Granularity and dispatch

{% include 'task-size' -%}

{% include 'spike-report-general' -%}

- Order by risk, uncertainty, complexity — not by file order. Issue what you can direct now plus the spikes; plan unblocked work in parallel with each spike.
- A spike's product is knowledge, optionally a PoC; it unblocks other tasks and is not merged by default.
- Deferred milestone: a placeholder whose detail waits for a spike — `awaits: <spike>` and no tasks. Unblocked work proceeds in parallel with the spike. It is an open item in every completeness check and blocks `done` until it holds real tasks or is retired with a reason. Where a detail cannot be settled yet, say so explicitly — defer it until a named spike or task lands ("details after spike X / task Y lands").
