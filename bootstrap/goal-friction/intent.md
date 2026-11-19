# Goal: friction — repair the stall mechanics, reduce friction, recover salvageable work

## Status quo (facts)
- Delta goal: 35 merges, 27 parks, 24 cancelled, 25 pending, 6 debt.
  Milestone A 4/4 (env-allowlist-v2 merged); architect 'considers Phase 1
  done on merged evidence' (remarkable line, not a formal decision).
  Milestone R: retry-alternate + spike-route + park-recover merged.
  Milestone S mostly merged (waste-accounting pending).
- Repair goal completed (10 iterations, DONE re-declared): M1 read-pure,
  M2 resume-escape, M3 spike-report, M4 tmp hygiene, M5 store-boundary
  normalizer. Follow-up base-gate-attribution absorbed into delta and
  landed. Explicitly not built: uncited-claim rule, outcome reminder.
- Legs: agy sub HARD DEAD (~130h reset); implement 100% deepseek
  fallback; plan-reviewer/checker + steward moved to hy4/deepseek by
  operator (run config cd978f4b); implementer primary still agy (owner
  call pending); ernie intermittent (429s); hy4 $0 bulk; opus architect.
- Integration lines fully landed; 63 delta task branches hold commits
  not on factory-v3 (mostly landed-via-flow content + parks).

## Symptoms (observed facts with evidence pointers — verify, then diagnose)
1. PM ladder exhausted 2 straight segments (i5: records 00757-00764
   incl 2 sonnet escalation turns $0.53; quota-stop run: 00768-00783)
   on validateTaskGraph frozen-base findings
   (gate-handoff-land→gate-handoff-log, kept-land-fix→kept-land-live,
   metrics-attrib-land→metrics-attrib) — zero dispatch, no
   "not derivable → boundary" exit; paid rungs burn before
   underivability is recognized.
2. No architect turn on resume; the frozen-base direction ruling
   (exempt / amend / unfreeze) awaits a boundary that resumes don't
   run. i5 status: BLOCKED-BY-USER.
3. Infra-stop on dead legs: steward turn 00796 (base-gate-attribution)
   died on agy quota ×3 with zero usage → whole launch stopped
   (exit 1 stop=infra). Should one turn's infra-death stop a launch?
4. Conflict parks after full-price work: config-compose (00784-00794,
   2 implement rounds + commit + checks + review + merge attempt);
   VARIABLES.md / baseline.ts / commands/agent conflict clustering
   across segments.
5. qa-step ×2 parked on containment (finish/ report outside worktree)
   — friction between the M3 spike-report channel and containment
   rules, 2nd instance, unowned.
6. No-outcome signature persists, corroborated on 3rd leg (gemini →
   hy4 → deepseek 00454/00459); retry-alternate merged, trial pending.
   Forensics: `.factory/artifacts/delta/mailbox/inbox/no-outcome-forensics.md`
   + ready spike (4 segments undischarged) — detector timing-sensitive
   (00459), stale repairFindings (00416/00459),
   file-first/fenced-vs-prose (00437), no agy transcripts retained.
7. Aging-ready inventory: no-outcome-forensics-spike ready 4 segments,
   never dispatched.
8. Reviews work (10-sample: directed fixes landed, rejects prevented
   bad merges, one reject changed the plan) but forwarded-debt
   follow-through evaporates (churn-cleanup precedent: flagged, no
   task filed until steered).

## The work
1. Assess this goal's problem from the live repo plus the delta and
   repair records. The symptoms above are observed facts, not a
   diagnosis — verify each, then diagnose.
2. Fix the stall mechanics (PM-ladder exit, frozen-base rule,
   resume/architect availability, dead-leg launch behavior) and reduce
   the listed friction at requirement level — tested, reviewed.
3. Recover what makes sense: the architect-mapped salvage-land parks
   and conflict-parked full-price work (config-compose class) — land
   through the normal task flow (implement/commit/checks/review),
   never by hand-merge.
4. Regression tests for every mechanism fix; records; per-iteration
   summaries.

## Non-goals
Delta's 50-task plan content beyond recovery (delta resumes after this
goal completes). Do not hand-edit other goals' artifacts.

## Done
Declare complete only when the stall mechanics are fixed — proven by a
resume carrying frozen-base findings that either dispatches or reaches
a boundary ruling (no silent 0-merge ladder exhaustion) — friction
items rectified or explicitly scheduled, salvage landed or formally
dropped with reasons, all with evidence pointers. If a fix needs an
INTENT-level decision, say so in the summary with the exact question
instead of stalling.
