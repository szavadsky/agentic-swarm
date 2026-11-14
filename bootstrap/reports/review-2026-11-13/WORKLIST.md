# Review 2026-11-13 — work list and bug list

Verbatim from `manifesto.md` at `8650676` (lines 339–415), kept here because `INTENT.md` replaced `manifesto.md`. Paths in rows are relative to `plugins/software-factory` unless they start with `bootstrap/`. Status of each row: iteration summaries, not this file.

### What remains to build

Ordered by dependency and value. "Section" is the manifesto section the item comes from.

| id | Item | Section | Size | Covered by | Handling |
|---|---|---|---|---|---|
| W1 | Fix the high-severity defects B1–B5 | — | S each | no task | One milestone, test first; see Handling strategy |
| W2 | Landing, promotion, rollback and relaunch without the operator | Orchestration artifacts, Bootstrap | M | no task; operator work by decision D9 | P6; owner decision 2 |
| W3 | Wall-clock bound per turn and iteration; park on repeated infra failure | Stopping and debt | S | no task | P3, P9; closes B12 |
| W4 | Distance to done, debt materiality, stop after idle iterations, `done` gated on material debt | Stopping and debt | M | no task | P1; owner decision 4 |
| W5 | Scope handling: widening at review or landing by script; test paths per module | Escalation ladder, Config-driven flows | M | no task | P2; owner decision 3 |
| W6 | Task-to-bigger escalation on upscope | Escalation ladder | S | `review-upscope`, pending | P12 |
| W7 | Advisory plan review by a weaker model | Model economics | S | `plan-review`, pending | keep |
| W8 | Benchmark run and comparison with the v2 baseline | Bootstrap | M, about 7 h | operator; kit merged in iteration 9 | P8; after W1 |
| W9 | Live pi and codex turns; harness rotation across iterations | Harness agnosticism, Bootstrap | M | `rotation-threaded`, parked by B1 with its uncommitted work saved in `salvage/`; no task for live legs | P8 |
| W10 | Usage document, sandbox assumption, intent-to-evidence table, stale docs | Operating assumptions, Bootstrap | M | `operator-docs`, `intent-evidence`, `doc-drift`, pending | keep |
| W11 | Hierarchy level 2: depth setting, epic derive, packs, consult, PM, reporting | Saga and hierarchy | L | six `epic-*` tasks, pending | P8: defer with a trigger; owner decision 1 |
| W12 | Implementer tier escalation | Model economics | S | `tier-escalation`, parked since iteration 7 | P3 |
| W13 | Concurrency per provider and model; sticky fallback tier | Config-driven flows, Bootstrap | S | no task | P9; closes B10 |
| W14 | Cost truth: priced cost in each record, list-price column, compaction spend, gate time, `costPerMergedTask` | Model economics, Bootstrap | S | no task | P9; closes B20, B21 |
| W15 | Intervention metric that counts operator acts | Bootstrap | S | no task | P6 |
| W16 | Summary cap; parks per iteration; status that follows the launch | Funnel | S | no task | P10; closes B22 |
| W17 | Isolation for self-hosting: dedicated clone or read-only root, pinned gate script, protected goal directory | Operating assumptions | M | no task | P7; closes B1, B15, B16 |
| W18 | Rehydration tolerance for torn outcome files: exists only as a hand fix (`e7d908d`) | — | S | no task | add a test and an owner in the plan |
| W19 | Pre-launch check for stale pins, reads outside the package, a gate command that cannot start | — | S | no task; named once in the journal | fold into pre-flight; closes B6 |
| W20 | Retention: 65 task branches, 6 worktrees (532 MB), 43 MB of transcripts; transcripts pruned while records cite them | Bootstrap | S | no task | retain by reference; closes B23 |
| W21 | LSP for the plan and YAML/JSON | Harness agnosticism, Notes | S | no task | build or strike; P11 |
| W22 | Git cleanliness heuristic with agentic revision | Notes | M | no task | build or strike; P11 |
| W23 | Human-involvement presets | Notes | M | no task | build or strike; P11 |
| W24 | Session portability graph; cache retention as config; opaque harness config pass-through | Context economy, Harness agnosticism, Notes | M | no task | correct the text or build; P11 |

### Bugs and unhandled edge cases

"Seen" says how each row is known: `run` means it happened in the self-run (record ids given), `test` means a test written for this review reproduces it at `b4a2d9f` (files in `bootstrap/reports/review-2026-11-13/repro/`), `review` means it comes from reading the code and was not reproduced.

| id | Severity | Case | Seen | Evidence | Handling |
|---|---|---|---|---|---|
| B1 | high | Containment blames the running turn for any change to the repository root. An operator commit or file edit during a turn parks the task and drops its work. | run: records 00559, 00560 | `src/kernel/worktree.ts:296-302`; edge-cases E2 | Check only paths a task can reach, or run against a dedicated clone; record an outside change as an incident (P7). |
| B2 | high | A red base switches gating off. Inherited red is matched by gate name and cached per commit, and this repository has one gate; a task that adds its own failure still merges. | test: `e5-repro.test.ts`; base red in records 00001, 00004, 00007 | `src/kernel/baseline.ts:41-43`; edge-cases E5 | Match by failing test or error signature; never cache an infra failure as base red; split the gate into typecheck and tests. |
| B3 | high | Launching a second goal deletes the first goal's checkout and task worktrees while it runs: recovery prunes the whole shared worktree root and the lock is per goal. Two repositories with one goal name and a shared root also share one checkout path. | test: `repro-e1.test.ts`, both variants | `src/kernel/worktree.ts:128-139`; edge-cases E1 | Recovery touches only its own goal; lock per repository; repository id in the checkout path. |
| B4 | high | A first interrupt does not stop dispatch. Queued tasks keep starting; only a second signal stops them, and it kills turns in flight. | test: `repro-e4.test.ts`, three more tasks started and merged | `src/kernel/dispatch.ts:148-151`; edge-cases E4 | Pass the drain controller into dispatch and stop admitting. |
| B5 | high | A model or harness failure at the boundary is filed as `blocked-by-user`, and the launch exits 3 as if it had hit the iteration limit. Five of twelve iterations were lost this way. | run: records 00006, 00009, 00012, 00101, 00290; test: `repro-e6-boundary-blocked.test.ts` | `src/kernel/boundary.ts:199-210`; edge-cases E6; forensics 6.2 | Fixed for the PM's infra case in iteration 13. Open for the architect: return an infra result, retry the boundary turn, exit 1 with the cause. |
| B6 | medium | A gate command that cannot start (exit 127) counts as the task's failure; the task parks as `empty-diff` although its work was committed. | run: records 00258, 00264, 00279, 00285; parks 00265, 00286 | `src/kernel/derive-task.ts:144-156` at `b4a2d9f`; forensics 6.1; edge-cases E8 | Fixed for the merge gate only. Treat gate start-up errors, timeouts and install failures as infra; stamp the cause on check records; advance a reused `base:` worktree to the integration head before the turn (`src/kernel/worktree.ts:207-221`). |
| B7 | medium | A valid outcome is thrown away when the session's stop is infra or cancelled. Two reviews were redone an iteration later. | run: records 00090, 00222 | `src/kernel/flow.ts:79-86` at `b4a2d9f`; forensics 6.4 | Accept a valid outcome whatever the stop; record the stop as an incident (P3). |
| B8 | medium | The PM can write frozen task files, and the restore replays a snapshot taken from the damaged state. `tasks/acpx-probe.md` is still corrupt; it cost iteration 10. | run: records 00106, 00228, 00238, 00290 | `src/kernel/pm.ts:35-84` at `b4a2d9f`; forensics 6.5 | Snapshot from a known-good source and verify the restore; frozen files read-only for the tool; track or checksum the goal directory. |
| B9 | medium | Scope overlap serialises the run: one shared test directory in most scopes held iteration 11 at one task for 309 of 369 minutes. | run: iteration 11 | `src/kernel/dispatch.ts:50-60` at `b4a2d9f`; forensics 6.6 | Test files named per module; overlap decided on files, not directory prefixes (P2). |
| B10 | medium | The retry ladder restarts at the exhausted free tier, also for the repair turn: 432 quota rejections, 12 turns with 8 attempts. | run: records 00020, 00109 | `src/harness/fallback.ts:66-86` at `b4a2d9f`; forensics 6.9 | Skip a tier that refused for the rest of the launch; the repair reuses the tier that answered (P3, P9). |
| B11 | medium | A stale session crashes the turn. Fixed for omp with one fresh retry; the opencode adapter still resumes blindly. | run: records 00006, 00009, 00012 | `src/harness/opencode/turn.ts:39-49` at `b4a2d9f`; forensics 6.3 | Check that the session exists before resuming, in every adapter. |
| B12 | medium | Timeouts and crashes never use the turn budget. A step that cannot finish is retried on every relaunch, up to an hour each time, without end. | test: `repro-e7-infra-timeout.test.ts` | `src/kernel/derive-task.ts:193-195`; edge-cases E7 | Park when the same step fails on infra twice (P3). |
| B13 | medium | A steer with the same text as an earlier one is archived silently: no architect turn, no reply. | test: `repro-e10-steer-dedupe.test.ts` | `src/kernel/mailbox.ts:144-146`; edge-cases E10 | Deduplicate only the same file in one window; write a reply when dropping (P13). |
| B14 | medium | One malformed hold or task file wedges every launch. A bad hold is never removed and each launch ends as infra; a bad task file makes each launch throw. | test: `repro-e12-holds.test.ts`, `repro-e13-tasks.test.ts` | `src/kernel/mailbox.ts:251-262`; `src/kernel/store.ts:105-113`; edge-cases E12, E13 | Validate what the PM writes and roll back; quarantine an unreadable file and report it. |
| B15 | medium | Agents can write the goal directory (records, tasks, holds) and commit in the integration checkout; containment does not see ignored files. A PM turn tried `git checkout` on a task file in the live worktree; only a wrong path stopped it. | run: record 00290; review | `src/kernel/worktree.ts:275-306`; edge-cases E17, E18; forensics 6.17 | Path allowlist enforced by the harness; goal directory writable by the script and the owning role only (P7). |
| B16 | medium | The gate script and the test command come from the tree under test, so a self-improvement task can weaken its own gate; promotion runs the candidate's own suite. | review | `src/kernel/gates.ts:23-31`; `bootstrap/promote.sh:34`; edge-cases E19 | Gates and promotion use the pinned build's gate script (P7). |
| B17 | medium | A steer the architect does not answer stays pending for good and its hold stays active; a goal hold then drains every later iteration at full architect cost. | review | `src/kernel/boundary.ts:166-174`; edge-cases E11 | Present it again once, then expire the hold and report (P13). |
| B18 | low | Nothing compares a merged diff with the task's scope. It has mattered little so far: 47 of 54 merged tasks stayed inside their scope, and two made source edits outside it that no plan rule allowed. | run: `cost-pricing`, `budget-drain` | `src/kernel/flow.ts:175`; edge-cases E16 | Decide P2; then either record the widening at review or refuse at merge. |
| B19 | medium | One exception in a task action ends the whole launch while sibling turns are still running. | review | `src/kernel/dispatch.ts:191,321`; edge-cases E9 | Catch per task, record a crash for that task, continue. |
| B20 | medium | Session compaction is an LLM call after almost every step. Its cost is not recorded or braked, and sessions that are never resumed are compacted too. | review | `src/kernel/flow.ts:176-181`; edge-cases E15 | Record and price it; compact only before a follow-up (P9). |
| B21 | medium | Cost and time are missing from the records: 162 of 172 turns store $0, and gate and commit steps have zero-length timestamps. | run | `src/kernel/pricing.ts:77-92` at `b4a2d9f`; forensics 6.8, 6.10 | Write priced cost and gate wall time into each record (P9). |
| B22 | medium | Summaries: the status never leaves `in-progress`, and the park section is cumulative. | run: summaries of iterations 8, 9, 11, 12 | forensics 6.14 | Derive the status from the launch result; list parks by the iteration they happened in (P10). |
| B23 | medium | Transcripts are pruned while records still cite them: 80 of 168 turns, all of iterations 5 and 7. | run | `bootstrap/run/self.yaml:56`; forensics 6.11 | Keep what a record cites. |
| B24 | medium | After a successful PM run, a pending task whose slug is not found in the plan is cancelled, including tasks with commits; a plan that writes `tasks/foo.md` does not match `foo`. | review | edge-cases E22 | Cancel only on an explicit plan statement; never cancel a task that has commits. |
| B25 | medium | Child processes inherit the full environment, provider keys included; gate output goes into records and prompts unscrubbed. | review | edge-cases E21 | Pass an allowlisted environment; scrub gate output like other details. |
| B26 | medium | Base gates are measured on the base branch, but tasks start from the integration head; a red integration head makes every task's gate red as new. | review | edge-cases E20 | Baseline the integration head. |
| B27 | medium | Nothing at goal level stops a goal that keeps planning: no cap on iterations without a merge. | review; pending tasks at 10 or more since iteration 9 | `src/kernel/launch.ts:207-305`; edge-cases E31 | P1. |
| B28 | low | Smaller cases, from code reading unless noted: a no-progress park on a correct no-op fix turn (run: record 00108); a merge attempt commits before its stop is examined; conflict resolutions get no review; the dollar brake resets each iteration; a failed front turn's `class.yaml` is reused unchecked; a dead lock-takeover marker blocks its task for good; a git process killed by a signal counts as success; a spike that finishes with nothing else running ends the iteration without starting its dependents; promotion has no live smoke turn and no rollback. | review | edge-cases E23–E30; forensics 6.15 | Fix when the file is next opened; the last one is part of P6. |

Checked and dropped: "a blocked goal never reads a steer" (edge-cases E3) no longer holds at `b4a2d9f`; `front-status` fixed it in iteration 13, and `repro-e3.test.ts` shows the steer being read. "Second-round turns get the first round's outcome path" (forensics 6.7) could not be confirmed: the prompts carry the right path. "The steer PM runs without validation or restore" (edge-cases E14) was closed by `steer-guards` in iteration 13.

### Handling strategy

1. **Safety first.** B1–B5 become one milestone ahead of everything pending. Each fix starts from the test in `repro/` that shows the defect today.
2. **Batch, do not chase.** The medium rows go into six tasks grouped by the code they touch: boundary and status (B5 remainder, B22); the failure ladder (B7, B10, B11, B12); mailbox and PM files (B8, B13, B14, B17, B24); scope and dispatch (B9, B18, B19); isolation (B6, B15, B16, B25, B26); measurement (B20, B21, B23). No row gets a task of its own. The low row is fixed when its file is next opened.
3. **Freeze the plan's growth until the distance shrinks.** Until the measure of P1 exists and has fallen two iterations in a row, the architect opens no new milestone, and review debt about wording or structure goes to the register.
4. **Who does what.** Factory tasks: W1, W3, W6, W7, W10, W12–W20 and the B rows, plus W2, W4, W5 and W11 once their decisions are made. Operator: the benchmark run (W8), the live pi and codex legs (W9), the journal corrections. Owner: the decisions below, and the text of P11.
5. **Verify by run, not by test count.** The suite grew from 188 to 436 tests while five of twelve iterations were lost to failures no test covered. Each milestone ends with a launch on the benchmark target.
6. **Generate the journal's numbers.** Six journal entries misstate cost or task state (`REVIEW.md`, "Journal corrections"). Iteration lines come from `metrics.yaml` and the records; the journal keeps decisions and interventions.

