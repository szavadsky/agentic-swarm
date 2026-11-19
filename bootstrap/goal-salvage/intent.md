# Goal: salvage — recover parked-but-useful work from delta

## Status quo (facts)
- Delta goal paused: 35 merges, 27 parks, 24 cancelled, 25 pending.
  63 delta task branches hold non-ancestor commits (flow-landed
  content + parks).
- Prior recovery: delta i3 architect mapped the then-20 parks
  (7 salvage-land, 2 redesign, 8 redo); friction goal M3 landed
  4 salvage merges (land-outcome-ids 9b6cd065, land-gate-mutex
  4311aaa9, land-lint-ratchet e1a43616, land-config-compose bcc8aaa7)
  and dropped the rest with reasons in its plan.
- Dupe handoff recorded: delta's outcome-ids-land / gate-mutex-land /
  lint-ratchet-land bullets duplicate friction's lands — whoever
  resumes delta must cancel them (friction summary carries it verbatim).

## The work
1. Assess which parked delta work is still useful and unlanded (live
   repo + delta/friction records + task branches). Parked content,
   not pending plan content.
2. Recover it through the normal task flow (implement/commit/checks/
   review) — rebase onto head, re-verify, land. Drop what is
   obsolete/redundant with a recorded reason per item.
3. Keep it small: if the recoverable set is task-sized, say so and do
   it as tasks; do not inflate.

## Non-goals
Delta's pending plan (delta resumes separately). Do not hand-edit
delta's artifacts; do not hand-merge branches.

## Done
Declare complete when every delta park is landed, formally dropped
with reason, or re-queued as a named delta task — with evidence
pointers. A 0-merge "nothing useful remains" rationale with per-park
disposition is a valid success signal.
