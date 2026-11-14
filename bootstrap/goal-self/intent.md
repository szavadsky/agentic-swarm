# Goal — the factory completes itself (stage: Phase 1)

## Intent

`INTENT.md` at the repository root binds, whole; it replaced `manifesto.md`. Its `## Notes on implementation` are judgement to shift on evidence. `manifesto.advice.md` is advice only.

Current stage: `Phase1.md` — build it, milestones M1 → M6 in order. Nothing outside Phase 1 is planned until Phase 1's "Done when" holds, except fixes Phase 1 itself needs.

## Particular to this goal

- The factory is editing itself. It runs from a pinned build; the next launch runs what this one merged, after the suite passed. Every task keeps `bun run typecheck` and `bun test` green; no task weakens a scenario to get there.
- One iteration per launch.
- Implementers and reviewers are cheap models. Size tasks for them; a model failing twice on a well-directed task is evidence for the run config, not a reason to thicken the task text.
- Small is a requirement. A new schema, launch type, retry counter or config knob carries one line of justification in the plan.
- The plan predates `INTENT.md`: rewrite it to Phase 1 and keep it short. Rows outside Phase 1 leave the plan (they return in later stages). Task scopes name an area, not files.

## Done when

Every M1–M6 item of `Phase1.md` is merged with tests, and the live evidence its "Done when" lists exists in records/summaries. The live trivial/task goals (`p1-trivial`, `p1-task`) and the deliberate interrupt-and-relaunch are operator launches; the architect names in `forward` when they can run.
