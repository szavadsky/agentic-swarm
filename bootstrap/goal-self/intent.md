# Goal — the factory completes itself

## Intent

`manifesto.md` at the repository root, whole. Its `## Intent` binds; its `## Notes on implementation` are judgement to shift on evidence. `manifesto.advice.md` is advice: cite line ranges, keep what survives contact with the code.

## Where it stands

Kernel-0 (`bootstrap/KERNEL0.md`): the left column of its §2 exists and is held by the no-model suite (§7); the right column does not exist yet. Decisions and evidence so far: `bootstrap/LOG.md`. The code is `plugins/software-factory`; map of the modules kept from v2: `bootstrap/context/kept-modules.md`.

## Particular to this goal

- The factory is editing itself. It runs from a pinned build; the next launch runs what this one merged, after the suite passed. Every task keeps `bun run typecheck` and `bun test` green, and no task weakens a scenario to get there.
- One iteration per launch. Prefer the plan whose first iteration makes the next launch cheaper or easier to observe: measurement before optimization (usage by role, loop incidents, prompt sizes).
- Implementers and reviewers are free models. Size tasks for them; a model failing twice on a well-directed task is evidence for the run config, not a reason to thicken the task text.
- Small is a requirement. A new schema, launch type, retry counter or config knob carries one line of justification in the plan.
- Deliverables beyond code: a usage document and an ideology document derived from the manifesto — short, for a new operator — and a table mapping each Intent section to its test or run evidence.

## Done when

Every section of the manifesto's `## Intent` is implemented and has test or run evidence in that table; the fixed benchmark goal has been run and compared with the v2 baseline (`plugins/software-factory/docs/runs`); nothing the manifesto rejects remains in the repository; this goal leaves no open debt.
