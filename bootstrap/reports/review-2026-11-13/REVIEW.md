# Project review 2026-11-13: status, execution history, manifesto against as-built

Requested by the owner on 2026-11-13. This file is the digest; the reasoning and the proposals are in `manifesto.md` (`[AI Review]` inlines and the `Fable proposal` section).

**Scope.** Iterations 1–12 of the self-run were audited from records, transcripts and code at `dd6fc97`. Iteration 13 finished during the review and is taken from its summary and records. The review changed no product code.

**Evidence beside this file.**

| File | What it holds |
|---|---|
| `manifesto-vs-built.md` | 103 manifesto statements, each with a status and a code citation; mechanisms built but not in the manifesto; 42 intent defects; remaining work |
| `execution-history.md` | timeline, totals, operator acts, steering audit, failure modes, convergence |
| `forensics.md` | records and transcripts: turn statistics, wall-time anatomy, park autopsies, misclassified failures, harness coverage |
| `edge-cases.md` | code review of the kernel: 31 defects and unhandled cases |
| `facts/` | narrow fact reports: reproductions of the defects by test, state of the forensic bugs at `b4a2d9f`, scope compliance, architect turn anatomy, debt ledger, iteration 13 |
| `repro/` | the test files that reproduce the defects; copy one into `plugins/software-factory/test/kernel/` and run `bun test` on it |
| `salvage/` | uncommitted work of a task parked by an operator commit |

## Status

- **Code.** Branch `factory-v3`, iteration 13 merged as `b4a2d9f`. 436 tests: 432 pass, 4 skipped, 0 fail.
- **Run.** 13 iterations of the self-improvement goal. Through iteration 12: $19.05, 14.4 hours of factory time, 49 tasks merged, $0.39 per merged task, no merge conflict inside the factory, no gate failure after a merge. Iteration 13 added $2.20, 2.6 hours and 5 merges.
- **Done condition** (`.factory/artifacts/self/intent.md:19-21`), four clauses:

| Clause | State |
|---|---|
| Every Intent section implemented, with an evidence table | Not met. Saga and hierarchy and harness rotation are unbuilt; the evidence table (`intent-evidence`) and the usage document (`operator-docs`) are pending. |
| Benchmark run and compared with the v2 baseline | Not started. The kit exists since iteration 9; the run is an operator job of about 7 hours. |
| Nothing the manifesto rejects remains | Met, pending review (`sweep-land` added a reachability test). |
| No open debt | Not met. Open debt-register items, 11 pending tasks, open parks. |

- **Only the operator or the owner can do:** the benchmark run, live pi and codex turns, and the decisions listed at the end of the `Fable proposal`.
- **Held.** Iteration 14 is not launched. Its next work would be the hierarchy chain, which the proposal recommends deferring.

## Execution history

### Bootstrap, 2026-11-12 (before the self-run; spend unmetered)

| Phase | Wall | Result |
|---|---|---|
| Manifesto and decisions D1–D9 | about 4 h | worktree `factory-v3` created |
| Prune of v2 | — | source 26,059 to 8,964 lines; tests 700 in 154 s to 188 in 15 s |
| Slices S0–S4, integration | about 2.5 h | kernel 0, 327 tests; two hand fixes of slice conflicts; free tier exhausted, work moved to subscription |
| Review, fix | 79 min | reviewer verdict "do not launch" with 4 proven findings; fixed, 335 tests |
| Shakedown on a toy goal | 41 min | 3 of 3 tasks merged |

### Self-run

| Iteration | Wall min | Cost $ | Merged | New parks | Pending at end | How it ended |
|---|---|---|---|---|---|---|
| 1 | 11 | 1.25 | 0 | 0 | 0 | architect turn ended without a plan |
| 2 | 5 | 0.02 | 0 | 0 | 0 | stale session crashed the architect; filed as blocked-by-user |
| 3 | 4 | 0 | 0 | 0 | 0 | same crash |
| 4 | 1 | 0 | 0 | 0 | 0 | same crash; error text now visible |
| 5 | 87 | 3.33 | 7 | 0 | 10 | a torn outcome file killed the launch |
| 6 | 13 | 2.00 | 0 | 0 | 10 | PM wrote no outcome; nothing dispatched |
| 7 | 144 | 1.84 | 14 | 2 | 3 | stalled; killed by the operator after records settled |
| 8 | 14 | 1.05 | 1 | 0 | 2 | architect turn ended waiting on scouts, no plan edit |
| 9 | 63 | 2.63 | 3 | 2 | 16 | iteration limit |
| 10 | 10 | 1.99 | 0 | 0 | 16 | PM wrote no outcome a second time |
| 11 | 369 | 2.67 | 18 | 3 | 10 | iteration limit |
| 12 | 143 | 2.27 | 6 | 1 | 13 | iteration limit |
| 13 | 156 | 2.20 | 5 | 1 | 11 | iteration limit; the new park was caused by an operator commit |
| **1–12** | **864** | **19.05** | **49** | **8** | | |

Source: `execution-history.md` parts 1 and 2; iteration 13 from `iterations/13/summary.md`.

### Cost by role, iterations 1–12

| Role | Turns | Cost $ | Share |
|---|---|---|---|
| architect | 12 | 14.30 | 75.1% |
| implementer | 75 | 3.04 | 16.0% |
| reviewer | 62 | 1.59 | 8.4% |
| PM | 12 | 0.06 | 0.3% |
| digest | 11 | 0.05 | 0.3% |

One architect turn per launch, whatever the launch produced. $6.28 (33%) was spent in iterations that merged one task or none. Implementer and reviewer cost is what the paid fallback charged after the free tier refused: 432 quota rejections, 145 of 172 turns retried, 136 finished on the paid model. 162 of 172 records store a cost of $0; cost exists only in the aggregate.

### Parks, iterations 1–12

| Recorded cause | Count | What the records and transcripts show |
|---|---|---|
| upscope | 5 | All five correct: the plan drew the task's scope too tight. Two parked the same interface gap ten minutes apart. |
| empty-diff | 2 | Both wrong: the work was committed; the gate command did not exist at the branch's base (exit 127). |
| no-progress | 1 | Parked a fix turn that was a correct no-op. |

Six of the eight were later merged through follow-up tasks.

### Where the time went

Per merged task the wall time is the same in a fast and a slow iteration (21.0 and 20.5 minutes). Iteration 11 was slow because it ran one task at a time for 309 of 369 minutes: the dispatcher never runs two tasks with overlapping scopes, and `test/kernel/**` was in 17 of 21 scopes. Each merge also pays two full gate runs of about 50 seconds, serialised per repository. Inside a turn, 77% of the time is model latency.

### Operator acts, iterations 1–12

52 acts against 49 factory merges. The metric `humanInterventions` reports 1, because it counts processed steers.

| Kind | Count | Covered by a factory task |
|---|---|---|
| Hand fixes to product code or scripts | 8 | partly; rehydration tolerance for torn outcomes has no task |
| Merge of the goal line into the base | 6 | no (operator work by decision D9) |
| Promotion of a pinned build | at least 12 | no |
| Independent verification of a merge | 6 | no |
| Relaunch | 12 | no (one iteration per launch) |
| Kill of a stalled launch | 1 | no (no wall-clock bound) |
| Run-config and repo-config changes | 4 | config, outside the factory by design |
| Steers written to the mailbox | 2 | yes |

### Recurring failures

| Failure | Count | Damage | State |
|---|---|---|---|
| Quota rejections and fallback hops | 432 rejections | tokens and wall time; three early launches | no throttle in the kernel |
| Architect turn without a plan edit | 5 of 13 turns | $2.28 | crash cases fixed; the scout-wait case is not |
| PM turn without a usable outcome | 3 | $4.00, two iterations with no work | PM ladder merged in iteration 11 |
| Scope too tight | 5 parks | 13% of the run's tokens; one park held 13 tasks | fixed case by case with follow-up tasks |
| Gate command missing at a stale base | 2 parks | two tasks redone | fixed in iteration 11 |
| Torn outcome file killed the launch | 1 | one iteration without a summary | hand fix only |
| Launch stalled | 1 | manual kill | no wall-clock bound |

### Convergence

Locally converging, globally diverging. Parks are turned into follow-up tasks and merged, and the original programme (milestones M1–M8) is complete. But each review produces the next plan: the review of iteration 11 created milestone M15, the review of iteration 12 created M16, and pending tasks have not dropped below 10 since iteration 9. Three iterations (7, 11, 12) delivered 38 of the 49 merges. Cost per merged task shows no trend (0.48, 0.13, 0.88, 0.15, 0.38 dollars in the five productive iterations); it follows merges per architect turn.

### Owner steers honored partly or not at all

| Steer | State |
|---|---|
| pi as task implementer, harness rotation tested | Not honored. pi and codex have not run a turn; rotation is parked. |
| codex and Claude legs in the self-run | Partly. Claude runs as architect; codex is configured only in an unused run config. |
| Limit free-tier concurrency | Partly. The lock is in a bootstrap script, not in the kernel. |
| beam-free is the mechanical tier | Partly. It was used as PM and failed twice before being replaced. |
| PM failures retried, then escalated | Built in iteration 11; the infra case was completed in iteration 13. |
| Usage and ideology documents | Partly. The ideology document exists; the usage document is pending. |

## Manifesto against as-built

Counts are rows of the matrix in `manifesto-vs-built.md`.

| Section | Built and tested | Built, untested | Partial | Missing | Differs or contradicted | What is missing or differs |
|---|---|---|---|---|---|---|
| Escalation ladder | 3 | 0 | 0 | 1 | 3 | task-to-bigger escalation; "same agent" cannot hold across checkouts |
| Iteration | 3 | 1 | 1 | 1 | 1 | sub-epic completeness check; "dependents idle" is not what the code does |
| Model economics | 5 | 1 | 1 | 1 | 0 | advisory plan review; implementer escalation |
| Context economy | 6 | 0 | 2 | 1 | 1 | portability graph; tree summaries |
| Saga and hierarchy | 2 | 0 | 2 | 3 | 0 | level 2 is unbuilt |
| Funnel | 4 | 2 | 1 | 0 | 0 | top-architect stage |
| Uncertainty and spikes | 1 | 1 | 0 | 0 | 0 | |
| Stopping and debt | 1 | 2 | 0 | 1 | 0 | `done` ignores open debt; no subscription limit |
| Steering and autonomy | 4 | 0 | 0 | 0 | 0 | |
| Clean code and architecture | 1 | 1 | 0 | 0 | 0 | |
| Config-driven flows | 7 | 0 | 0 | 0 | 0 | |
| Harness agnosticism | 0 | 0 | 2 | 0 | 1 | pi and codex never ran; no rotation; the opencode adapter contradicts the adapter rule |
| Operating assumptions | 0 | 0 | 0 | 1 | 0 | the sandbox assumption is documented nowhere |
| Notes on implementation | 12 | 0 | 7 | 0 | 3 | concern store deleted; no presets, no LSP, no cleanliness check; cache TTL hardcoded |
| Bootstrap | 0 | 0 | 4 | 0 | 0 | pin by hand; benchmark never run; one run config; pi and codex untested |
| Preamble, decisions, glossary | 1 | 0 | 3 | 0 | 0 | epics unproven; glossary terms without a mechanism |
| **All 103 rows** | **50** | **8** | **23** | **9** | **9** | plus 4 rule-level rows with no code to check |

## Built by practice, absent from the manifesto

Candidates for manifesto amendments. Each exists in code and tests.

- **Failure handling.** PM retry and escalation ladder (`src/kernel/pm.ts:171-360`). Infra failure classes with same-harness fallbacks, never charged to the item budget (`src/kernel/types.ts:30-41`). One outcome repair turn (`src/kernel/agent.ts:70-94`). One fresh retry after a context overflow (`src/kernel/agent.ts:137-153`). One gate-fix turn after red merge checks (`src/kernel/derive-task.ts:160-189`).
- **Integration.** Serial squash-merge queue with gates on the merged result (`src/kernel/integrate.ts:58-102`). Base-gate baseline: red inherited from the base is not a task finding (`src/kernel/baseline.ts:29-43`). Continuation of a parked branch under a new slug with `base:` (`src/kernel/tasks.ts:135-141`). Admission by scope overlap (`src/kernel/dispatch.ts:40-59`).
- **Safety.** Containment: a turn may change only its own worktree (`src/kernel/worktree.ts:273-300`). One run per goal, runtime directory outside the checkout (`src/kernel/launch.ts:154-158`). Recovery from torn records and interrupted merges (`src/kernel/recovery.ts`).
- **Steering.** Hold files that name the tasks or the goal a steer blocks (`src/kernel/mailbox.ts:27-41`).
- **Measurement.** Price table where unpriced is not $0 (`src/kernel/pricing.ts`). Per-iteration brakes on turns, wall time and dollars (`src/kernel/dispatch.ts:224-247`). Digest split into script-computed facts and an agent narrative (`src/kernel/digest.ts:24-28`).
- **Front.** `class.yaml` and the one-task contract for the task class (`src/kernel/front.ts:103-148`).
- **Outside the kernel.** Export-copy gates (`scripts/gates.sh`), the promotion script (`bootstrap/promote.sh`), the benchmark kit (`bootstrap/benchmark/`).

## Journal corrections

The journal (`bootstrap/LOG.md`) was written by hand by the orchestrating agent. Checked against the records, it is wrong in these places.

| Journal says | Records say |
|---|---|
| Iteration 9 cost $2.10 | $2.63; $2.10 was the architect alone |
| Iteration 5 summary cost $2.51 | $3.33; the summary priced the architect alone |
| beam-free at max effort takes effect from iteration 12 | iteration 11's digest already ran at max effort |
| Iteration 12 parked `doc-drift` and `prune-sweep` | `doc-drift` was never dispatched; `prune-sweep` parked in iteration 11; iteration 12 had one new park |
| `front-ladder` still parked after iteration 12 | it was retired by `front-land` in the same iteration |
| Iteration 5 left no summary | a summary exists, written by the relaunch recovery |

The merge and park ledger itself reconciles. Iteration lines should be generated from `metrics.yaml` and the records.

## Verification done for this review

The claims that mattered most were checked by narrow agents before they were written into the manifesto. Tests were run in scratch clones at `b4a2d9f`, never in the worktree. `repro-e4` asserts the intended behaviour and fails today; the other tests assert the defect and pass today, so a fix inverts them.

| Claim | Result | Where |
|---|---|---|
| A second goal's launch deletes the first goal's worktrees (edge-cases E1) | reproduced, both variants | `repro/repro-e1.test.ts` |
| A blocked goal never reads a steer (E3) | not reproduced at `b4a2d9f`: fixed by `front-status` (`83c9e6c`) in iteration 13; reproduced at the older `a6de636` | `repro/repro-e3.test.ts`, `repro/repro-e3-old.test.ts` |
| A first interrupt does not stop dispatch (E4) | reproduced: three more tasks started and merged | `repro/repro-e4.test.ts` |
| A red base disables the gate (E5) | reproduced: a task with its own new failure merged | `repro/e5-repro.test.ts` |
| Boundary failures are filed as blocked-by-user with exit 3 (E6) | reproduced for an architect infra stop and for a PM that asks or is exhausted; the PM's infra case was fixed by `pm-infra-stop` (`c7e092a`) | `repro/repro-e6-boundary-blocked.test.ts` |
| Timeouts never use the turn budget (E7) | reproduced over three relaunches | `repro/repro-e7-infra-timeout.test.ts` |
| A steer with repeated text is dropped (E10) | reproduced | `repro/repro-e10-steer-dedupe.test.ts` |
| A malformed hold wedges every launch (E12) | partly: since `steer-guards` each launch ends as infra instead of throwing; the hold is never removed | `repro/repro-e12-holds.test.ts` |
| A malformed task file wedges every launch (E13) | reproduced | `repro/repro-e13-tasks.test.ts` |
| The 18 forensic bugs at `b4a2d9f` | 14 still present, 2 partly fixed (6.2, 6.3), 1 not confirmed (6.7), 1 corrected (6.13) | `facts/still-present-A.md`, `facts/still-present-B.md` |
| Scope compliance of merged work | 47 of 54 merged tasks stayed strictly inside their declared scope | `facts/scope-compliance.md` |
| Debt items | 121 distinct items, 103 closed, 18 open after iteration 13 | `facts/debt-ledger.md` |
| Iteration 13 | 17 agent turns, 42 quota rejections, 12 gate runs, one new park | `facts/iteration-13-delta.md` |

## Corrections to the evidence files

The reports beside this file are kept as written. Where a later check contradicted them, this list wins.

- `manifesto-vs-built.md`: the headline counts (26 partial, 15 missing) do not match its own matrix, which has 23 partial and 9 missing rows.
- `edge-cases.md`: E3 was fixed in iteration 13. E14 was closed by `steer-guards` in iteration 13 (`src/kernel/pm.ts` now snapshots and restores around the steer turn). E12 no longer throws; the launch ends as infra.
- `forensics.md`: row 6.7 (second-round turns get the first round's outcome path) is not confirmed; the prompts carry the right path. Row 6.13: pack size is still recorded after iteration 8, always at the 8000-byte cap. Row 6.17: the `git checkout` in record 00290 was attempted and failed on the path; it did not succeed.
- `execution-history.md`: "116 debt items opened, 21 closed" counts summary bullets, including repeats. The ledger has 121 distinct items, of which 103 are closed.

## Salvaged work

`rotation-threaded` (harness rotation) was parked in iteration 13 by an operator commit, not by its own fault (records 00559, 00560), and its work was never committed: 20 changed paths in the task worktree. `salvage/rotation-threaded.patch` holds that diff against `83c9e6c`, in case launch recovery removes the worktree.

## Corrections after delivery

`facts/architect-anatomy.md` was copied while its agent was still writing. The final file (replaced here) changes no number in its own table, but it shows that four lines of the manifesto review generalised from a partial view. Corrected in place on main; owner text untouched.

| Manifesto line | Published | Corrected | Source |
|---|---|---|---|
| Where the project stands, Cost | architect is 75% of the $21.25 bill | 74% ($15.79 of $21.25); 75.1% is the iteration 1–12 share in the table above | `facts/architect-anatomy.md` part 1 |
| Where the project stands, Cost | a third of the money ($6.28) | $6.28 is 30% of $21.25; it is 33% of the $19.05 spent through iteration 12 | same |
| R30, P4 | $1.19 per launch | $1.58 per turn that ran (ten turns, $0.83 to $2.51); $1.19 averaged in three launches that crashed at start and cost nothing | same |
| R05, P4 | a turn is 15 to 45 requests | 15 to 42 requests, known only for iterations 10–13 (one surviving transcript); 45 was a tool-call count | same |
| R05, P4 | 0.7 to 3.2 million cache-read tokens per turn against a few dozen fresh ones | 0.7 to 7.3 million over the ten turns that ran (iteration 5: 7.3 million); under 100 fresh input tokens on six of the ten, 68 thousand to 539 thousand on the other four | same |

None of this changes a proposal: the corrected figures make the P4 case stronger, not weaker.
