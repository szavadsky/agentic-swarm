# Goal — the factory completes itself (stage: Phase 1)

## Intent

`INTENT.md` at the repository root binds, whole. Its `## Notes on implementation` are judgement to shift on evidence. `manifesto.advice.md` is advice only.

Current stage: the requirements in `Phase1.md`. They are requirements, not a plan: milestones, order, task split, scopes, spikes and deferrals are yours. Work outside Phase 1 waits, except what Phase 1 itself needs.

## How to judge

Read the intent against the code and against how previous iterations behaved — records, summaries, session transcripts, `bootstrap/LOG.md` — and plan from the gap. Mechanical solidity and agentic behavior both count: was review feedback useful, did checks and repair asks create loops, where did agents stall or stop short. Spikes that investigate previous sessions are legitimate work.

## Particular to this goal

- The factory is editing itself. It runs from a pinned build; the next launch runs what this one merged, after the suite passed. Every task keeps `bun run typecheck` and `bun test` green; no task weakens a scenario to get there.
- One iteration per launch.
- Implementers and reviewers are cheap models. Size tasks for them; a model failing twice on a well-directed task is evidence for the run config, not a reason to thicken the task text.
- Small is a requirement. A new schema, launch type, retry counter or config knob carries one line of justification in the plan.
- The operator reports incidents and owner intent changes as steers: what was observed, with evidence. What to do about them is yours.

## Done when

Every requirement of `Phase1.md` holds, tested, and the evidence it lists exists in records and summaries. The interrupt-and-relaunch and the two small goals are operator launches; say in `forward` when the factory is ready for them.
