# Goal: repair — emergency repair of the delta stall mechanisms

## Scope
Fix the two mechanisms that stalled the delta goal (11 merges, then two
consecutive 0-merge segments) plus the adjacent state-mutation defect.
Evidence: `.factory/artifacts/delta/records/00363-00393`,
`bootstrap/LOG.md` 2026-11-18 entries, and the two 5-why reports in this
goal's inbox (read them first — they carry file:line proof).

## The work
1. Spike→report→record mechanism: a spike's done-when product must be a
   named, writable, checkable destination; a missing/empty report must
   become a fix turn before review (not a reject-park). Spike flow,
   prompts, store/containment contract, reviewer alignment — as the
   evidence demands.
2. Resume stall-escape: a resume launch must not loop boundary-only
   forever — bounded resume attempts, hold-aware dispatch accounting,
   and iteration advance (or in-pass boundary) when plancheck returns
   `architect` or a pass starts no task turn.
3. Read-must-not-mutate: listing/deriving state must never quarantine,
   move, or rewrite task files, holds, or records. Fix the
   store-without-taskTypes path and the config gap behind it.
4. Regression tests for all three; records; per-iteration summaries.

## Non-goals
Delta's 50-task plan (delta resumes after this goal completes). Do not
modify `.factory/artifacts/delta/` — it is evidence.

## Done
Declare complete only when all three mechanisms are built, tested
(green gates), and reviewed, with evidence pointers. If the repair
reveals the stall needs an INTENT-level decision, say so in the summary
instead of stalling: a blocked declaration with the exact question
beats a 0-merge loop.
