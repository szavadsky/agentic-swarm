# Phase 1 — requirements

Phase 1 makes the single-level factory solid and economical enough to build hierarchy on and to execute sagas, with trivial and standalone-task goals working as intended.

This file is requirements only: which part of `INTENT.md` must hold before hierarchy, and the evidence the owner wants. Milestones, order, task split, scopes, spikes and deferrals are the architect's. Status is not kept here: read the code and how previous iterations behaved.

Known defects and their evidence: `bootstrap/reports/review-2026-11-13/WORKLIST.md` (B and W rows), repro tests in `bootstrap/reports/review-2026-11-13/repro/`, journal `bootstrap/LOG.md`.

## Requirements

Each line points at the `INTENT.md` section that defines it; the intent text governs.

Solid: no lost work, no wedged launch
- R1. Stop in the middle, relaunch — it keeps going; no architect intervention required. (preamble)
- R2. A session that cannot be resumed is logged as an error and started de novo, on every harness. (Context economy)
- R3. Work is bounded — iterations, review cycles, $/time per iteration, drain on a budget hit; nothing retries or waits forever. (Stopping and debt)
- R4. The defects of the 2026-11-13 review that lose work, switch gating off, wedge or end a launch, or misreport an outcome are fixed, each with a regression test. (WORKLIST)
- R5. The kernel ensures every agent delivers. (Iteration)
- R6. Agents are not policed mechanically: checks on agent output that create loops without value are found and removed; nothing enforces which files a task touches. (Iteration; Notes: loop causes)

Small goals as intended
- R7. Trivial: the classifying agent implements in the same session. (Escalation ladder)
- R8. Standalone task: no architect; its review escalates to "bigger" when the real scope needs architecture input. (Escalation ladder)

Integration as normal development
- R9. Scope is the architect's prediction of a reasonable, non-overlapping area — no file lists. (Iteration)
- R10. End-of-wave steward with the merge ladder; unmerged tasks are relaunched on the new branch state; a kept green branch lands without a new task. (Iteration; Config-driven flows)
- R11. Plan checker before the architect, with repeat. (Iteration)

Architect as intended
- R12. Plans the road to completion with explicit deferrals; starts every consult by evaluating the project against the intent. (Iteration)
- R13. The context pack is an index without artificial caps that always includes what the architect needs to read agentically. (Context economy)
- R14. A task-tier model reviews the plan, advisory; the architect samples whether it helped. (Model economics)

Prompts and kernel hygiene
- R15. Prompts are assembled by an established templating engine from shared fragments and single definitions; prompt-debloat applied to all. (Config-driven flows; Clean code)
- R16. Agents that write schema-controlled files have LSP or a validation command. (Notes: structured output)
- R17. The kernel applies clean code to itself: autoformat, lint, schema checks of schema-enforced files and configs. (Clean code)

Measured and economical
- R18. Actual cost and work are measured per model: cost, tokens, turns, edits, test runs. (Model economics)
- R19. Concurrency limits overall and per provider; dispatch throttles per subscription and falls back. (Config-driven flows)
- R20. Compaction works, as cost saving and as context management. (Context economy)
- R21. Done detection sees open debt; every summary shows the distance and, at each level, what is achieved and what is of concern. (Stopping and debt; Funnel)
- R22. agy runs task-level work through acpx. (Harness agnosticism)

Steering
- R23. Steers do not interrupt work; the PM handles task-specific, redo and small-task/spike steers; the architect handles intent amendments and architecture decisions; a steer stalls the run only when pending work lost its value or an unplanned priority is asked. (Steering and autonomy)

## Evidence the owner wants
- Gates green; every landed iteration on `main`.
- Live, in records: an interrupt mid-dispatch followed by a relaunch that continued without an architect turn; one trivial goal merged in the classifier's session; one standalone task goal merged without an architect turn; each steer class handled once; the steward and the plan checker at work; a plan review the architect judged; cost and work per model in the metrics; a task turn on agy.
- For R6: the checks on agent output, what each caught and what it cost (parks, repair turns, loops), and what was removed.
- Tests for what cannot be shown live.

The interrupt and the two small goals are operator launches: the architect says in `forward` when the factory is ready for them.

## After Phase 1
A couple of standalone tasks, then everything else — hierarchy included: read `INTENT.md` against the previous iterations' behavior (logs, records, sessions) and the code, and make sure the entire intent is built, tested and documented.
