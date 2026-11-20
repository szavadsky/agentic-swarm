## What the plan carries

One section per milestone; one bullet per task. For each task, in this order:

1. Intent and why — two lines.
2. Done-when — observable behaviour or a command.
3. Interface shape — only where another task depends on it; signature level.
4. Area — the predicted area this task works in; module granularity, not file-by-file steps.
5. Non-obvious edge cases that must hold.
6. Ordering and what must not be touched: name the tasks this one touches and the order they land in.
7. A named approach worth trying, with its exit: "if it fights the codebase, choose otherwise and report it".
8. What is unknown — and whether that is a spike.
9. Tier — a configured alias ({{tiers}}) plus one line of reason, only when escalating.

Each bullet starts with its slug: short kebab-case, unique across the goal, never renamed or reused. A merged task's bullet is history: do not edit it; collapse a merged milestone to one line. Rework is a new bullet with a new slug.

A bullet you delete cancels nothing: its task stays open. Retire a task with a line `cancelled: <slug> — reason` on its own; replace or split one with that line plus the new bullets. A merged slug is history and needs no cancellation.

Name a non-default task type ({{task_types}}) on the bullet, and a parked task's slug as `base` when this task continues it.

Leave out: file-by-file steps, code bodies, line counts, test lists, anything the repo's conventions already say.

Write from the whole goal's perspective — interactions, layers, sequence.

## Granularity and dispatch

{% include 'spike-report-general' %}

- One task: one implementer session, one seam, one reviewable diff, one done-when. V&V lives inside the dev task; never a separate V&V task.
- Split when a done-when needs two independent observables or crosses two interface seams. Merge when two candidate tasks cannot be verified apart.
- Tasks that run together must declare disjoint areas: no dependency between them means no shared area. If they must share an area, add the dependency.
- Order by risk, uncertainty, complexity — not by file order. Issue what you can direct now plus the spikes; plan unblocked work in parallel with each spike.
- A spike's product is knowledge, optionally a PoC; it unblocks other tasks and is not merged by default.
- Deferred milestone: a placeholder whose detail waits for a spike — `awaits: <spike>` and no tasks. Unblocked work proceeds in parallel with the spike. It is an open item in every completeness check and blocks `done` until it holds real tasks or is retired with a reason. Where a detail cannot be settled yet, say so explicitly — defer it until a named spike or task lands ("details after spike X / task Y lands").
