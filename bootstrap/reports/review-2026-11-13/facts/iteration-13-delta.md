# Iteration 13 delta — records, summary, transcripts

Read-only pass on worktree `/home/slava/aiexp/agentic-swarm.wt/v3` at `b4a2d9f`. Universe: 49 record dirs `00512`–`00560` (`*-i13-*`, all with `started.yaml` and `end.yaml`; 00559's `end.yaml` now exists), 17 agent turns + 32 script steps. Baseline gate `00511-i0-baseline-r1` (iteration 0) is excluded except where noted. Artifacts: `iterations/13/{summary.md,metrics.yaml,digest.md}`; journal `bootstrap/LOG.md:284-288`.

## 1. Turn statistics by role

| role | turns | wall m (total / mean / med / max) | in tok | out tok | cache-read | reasoning tok | cost recorded | cost priced | stop kinds | harness, model |
|---|---|---|---|---|---|---|---|---|---|---|
| architect | 1 | 6.34 / 6.34 / — / 6.34 | 60 | 30,899 | 1,728,480 | 0 | **$1.483871** | $1.483871 | done 1 | omp, `anthropic/claude-opus-5-5` (effort high) |
| pm | 1 | 3.31 | 64,598 | 7,807 | 983,680 | 12,312 | $0 | $0.025351 | done 1 | opencode, `opencode-go/deepseek-v4.1-flash` (high) |
| digest | 1 | 2.42 | 183,248 | 10,239 | 2,402,432 | 12,815 | $0 | $0 | done 1 | opencode, `opencode/beam-free` (max) |
| implementer | 8 | 86.90 / 10.86 / 9.25 / 17.37 | 1,097,864 | 116,535 | 47,823,104 | 180,073 | $0 | $0.487754 | done 8 | opencode; free `deepseek-v4.1-flash-free` → paid `opencode-go/deepseek-v4.1-flash`, 8/8 |
| reviewer | 6 | 50.91 / 8.49 / 8.12 / 11.87 | 468,367 | 40,041 | 10,856,704 | 131,614 | $0 | $0.207713 | done 6 | opencode; free `minimax-m3.1-flash-free` → paid `opencode-go/deepseek-v4.1-flash`, 6/6 |
| **total** | **17** | **149.89** | **1,814,137** | **205,521** | **63,794,400** | **336,814** | **$1.483871** | **$2.204690** | done 17 | 16 opencode + 1 omp |

- Retries: 14 of 17 turns ran 4 attempts (every implementer and reviewer turn); architect, pm and digest ran 1. Total attempts 59; the fourth attempt ends `done` on all 14.
- Quota stops: **42** = 24 on `opencode/deepseek-v4.1-flash-free` + 18 on `opencode/minimax-m3.1-flash-free`; every one is `infra/quota` with `details: provider.free-limit … 429`.
- Fallback hops: **14**, all free → paid (8 implementer, 6 reviewer). No turn hopped twice; no paid attempt failed. `outcomeRepairs: 0`, cancelled 0, no-outcome 0 (`metrics.yaml:179-190`).
- Summary "infra retries: 28" (`summary.md:86`) = the same-model retry pairs counted by `attemptIncidents` (`metrics.ts:172-187`); the 42 quota stops include each turn's first attempt too.
- Record cost is $0 on 16 of 17 turns; only the architect turn stores `costUsd` (`pricing.ts:57-70`). The $2.2047 in `metrics.yaml:19` is priced at aggregation from the same usage.
- The architect turn resumed omp session `01a1d4a3-53d7-7668-849d-bb90e117c038` (same session as records 00289, 00293, 00458 — iterations 10–12), `compacted: true`.
- All 17 records carry `stop.kind: done`, but 00559 also carries `ok: false` and a `containment:` cause (§4). All 17 outcomes are `status: done`.

## 2. Wall-time anatomy

- Wall total **154.4 min** (20:08:30.708Z → 22:42:55.559Z; 2 h 34 m). Journal: "2.6 h, exit 3" (`bootstrap/LOG.md:285`).
- Σ agent wall **149.9 min**; union(agent) **145.5 min**; **parallelism 0.97** (Σ/span). Concurrency histogram: 1 for 141.1 min, 2 for 4.4 min (00515 and 00516 both started at 20:20:37), 0 for 8.9 min.
- The 8.9 min with no live turn is exactly ten handoff gaps of 50.7–56.2 s (e.g. 20:37:40→20:38:31, 21:03:51→21:04:44, 22:25:01→22:25:57): commit → gate → next turn. No other idle.
- **Gate runs: 12** (7 `checks` after implement, 5 `merge-checks`; one merge-checks per merge). All `package: pass`; 417–436 tests, 82–84 files each. Measured `bun test` inside them: **587.0 s (9.8 min)** total (`Ran N tests … [Xs]` lines in `end.yaml.checks[].output`). Gate wall measured from record gaps: **759.5 s (12.7 min)**; commit→`checks` gap median 65.1 s (n=7, range 60.5–67.6), last commit/debt→`merge-checks` median 66.4 s (n=5, 52.1–68.0). Gates are mutexed on the repo root (`src/kernel/gates.ts:21`). Ten of the twelve gate windows overlap the no-agent gaps above; 00518 and 00519 both ran entirely while 00516 was still live (20:24:48–20:26:45 inside 20:20:37–20:37:40).
- Base gate `00511-i0` (iteration 0): package pass, `Ran 420 tests … [47.73s]`, at 20:08:28.122Z — 2.6 s before the digest turn.
- Longest 5 turns (record windows):

| record | role / step | wall | note |
|---|---|---|---|
| `00534-i13-steer-guards-implement-r1` | implementer, implement | 17.37 m (1041.9 s) | out 17,053 tok |
| `00516-i13-front-handoff-implement-r1` | implementer, implement | 17.05 m (1023.1 s) | out 29,940 tok |
| `00559-i13-rotation-threaded-implement-r1` | implementer, implement | 16.96 m (1017.8 s) | refused at settle (§4) |
| `00537-i13-steer-guards-review-r1` | reviewer, review | 11.87 m (712.2 s) | verdict `changes` |
| `00546-i13-front-status-implement-r1` | implementer, implement | 11.34 m (680.4 s) | out 12,889 tok |

Merges 5, turns 17 → 0.29 merges/turn; 30.9 min of span per merge.

## 3. Tasks dispatched in iteration 13

| slug | steps run (implement / review rounds / gate-fix / merge) | result | minutes (window / agent) |
|---|---|---|---|
| git-helpers-prune | 1 / 0 / 0 / 1 (`flow: just-implement`) | merged `a663e4b` (00520) | 6.15 / 4.39 |
| front-handoff | 1 / 1 approve / 0 / 1 | merged `97572e0` (00526) | 28.27 / 26.57 |
| pm-infra-stop | 1 / 1 approve / 0 / 1 | merged `c7e092a` (00533) | 15.81 / 14.10 |
| steer-guards | 2 / 2 (changes → approve) / 0 / 1 | merged `7a16a07` (00545) | 44.97 / 42.31 |
| front-status | 2 / 2 (changes → approve) / 0 / 1 | merged `83c9e6c` (00558) | 36.22 / 33.49 |
| rotation-threaded | 1 / 0 / 0 / 0 | parked, record 00560 | 16.96 / 16.96 |

- Window = first record start to last record end for the slug; agent = sum of its agent-turn walls. Task windows sum to 148.4 min inside the 154.4 min span.
- gate-fix = an implement turn sent back by a red `checks` gate (`derive-task.ts:172-174`). Zero: all 12 gates were green, and both r2 implements followed a review verdict of `changes` (00537 ended 21:34:50 / 00539 started 21:34:51; 00549 ended 22:09:20 / 00551 started 22:09:21).
- Bases: 00515 and 00516 at `dd6fc97` (concurrent); 00527 at `97572e0`, 00534 at `c7e092a`, 00546 at `7a16a07`, 00559 at `83c9e6c` — each later implement started on the previous merge.
- Non-task overhead at the head: digest 2.42 m + architect 6.34 m + pm 3.31 m = 12.07 min.
- Review records 00523 and 00530 approved r1; 00537 and 00549 returned `changes`; 00542 and 00554 approved r2. No r3.

## 4. Parks

Nine slugs are printed under "Parked by root cause" (`summary.md:27-44`). Only one has a park record inside iteration 13; the other eight are carried. The whole run contains exactly nine `step: park` records.

| slug | new in iteration 13 | recorded cause (as printed in the iteration summary) | what the records show |
|---|---|---|---|
| rotation-threaded | **yes** | `containment: HEAD moved outside the worktree in /home/slava/aiexp/agentic-swarm.wt/v3` (`summary.md:41`, 00560) | 00559 `ok: false`, stop `done`, outcome `done`; work uncommitted; HEAD mover was the orchestrator's `676a296` at 22:37:36Z, not the turn. Detail below |
| front-ladder | no | `upscope:` the front ladder was implemented but "The front's session is recorded but not resumed by the first implement step: that needs flow.ts/flow-context.ts, outside this task's scope" (00432, iteration 11) | 00430 ran 33.8 m, 00432 parked; re-done as front-land, merged in iteration 12 (00479); 00516 rewrote the resume path in iteration 13 |
| harness-rotation | no | `upscope:` every caller that resolves a turn target sits outside the scope and never passes the iteration (00442, iteration 11) | 00442 parked 19.9 min after 00432; 00440 had started 9.7 min after the first park. Re-scoped as rotation-threaded in iteration 13 (task `source: M15`), which parked on containment before review |
| pm-ladder-tidy | no | `upscope: In-scope work is complete and green …` ending the iteration as infra needs `launch.ts` (00496, iteration 12) | 00494 (17.9 m, branch `121f5ec`) then 00496; iteration 13's pm-infra-stop (`base: pm-ladder-tidy`, 00527) widened to `launch.ts` and merged `c7e092a`; `compactArchitect` is gone from the merged tree |
| prune-checks | no | `no-progress: implement r2 repeats r1 (da0b719d)` (00108, written in iteration 7 for iteration-5 work) | r1 `77af4d5` did the work (00084: "deletion-only diff, 4839 lines, 14 files"); r2 changed nothing on purpose (00092: "worktree is clean at 77af4d5 … already satisfies the done-when"); checks r2 00097 green; `da0b719d` is not a git object |
| prune-checks-types | no | `empty-diff: implement r1 committed no changes` (00265, iteration 9) | commit record 00263 = `7395981` (−100 lines in `src/core/checks/types.ts`); checks 00258/00264 `package: exit 127` "gates.sh: No such file or directory"; re-done as prune-checks-land, merged iteration 11 (00312) |
| turn-target | no | `empty-diff: implement r1 committed no changes` (00286, iteration 9) | 00266 = `dc95ddf` (13 files, +253/−69); checks 00279/00285 same exit 127; re-done as turn-land, merged iteration 11 (00360) |
| prune-sweep | no | `upscope:` reachability walker still lists four files outside the scope (00353, iteration 11) | 00351 ran 13.5 m, 00353 parked; re-done as sweep-land, merged iteration 12 (00510); in iteration 13's tree `src/cli/index.ts` is gone and `test/reachability.test.ts` exists |
| tier-escalation | no | `upscope:` `flow.ts` passes only `role: target.role` and `agent.ts:120` re-resolves (00210, iteration 7) | plumbing landed with turn-land (merge `3a2b177`, iteration 11); `escalateTo: escalation` landed with pm-ladder (iteration 11, `self.yaml:13`); iteration 13's only pm turn ran the primary rung (00514, done) — no escalation alias turn exists |

### rotation-threaded (00559, 00560) — exact record facts

- Breach text, identical in `00559/end.yaml` `cause` and `00560/end.yaml` `cause`: `containment: HEAD moved outside the worktree in /home/slava/aiexp/agentic-swarm.wt/v3`.
- Turn start `2026-11-13T22:25:57.781Z`, turn end `2026-11-13T22:42:55.555Z` — 16 min 57.8 s. Park record 00560: `22:42:55.558Z → 22:42:55.559Z`, 3 ms after the turn's `endedAt`.
- Was the turn's own work committed? **No.** `factory-task/self/rotation-threaded` still points at the step base `83c9e6c`; `git log 83c9e6c..HEAD` = 0 commits; the task worktree holds 20 changed paths (18 modified, 2 untracked: `test/kernel/rotation.test.ts`, `bootstrap/run/self-rotate.yaml`), `git diff --stat` = 18 files, +225/−69. Its reflog has only the worktree reset at `17:25:57 -0500` (= 22:25:57Z). The settle refuses `commitStep` on a breach (`src/kernel/flow.ts:171-174`) and appends the park (`:183-185`).
- What moved the root HEAD: `676a296` "bootstrap: log project-review steers" (`bootstrap/LOG.md` only), committed on `factory-v3` at `22:37:36Z` = 11 min 38 s into the turn, 5 min 20 s before it ended. Reflog: `676a296 HEAD@{2026-11-13 17:37:36 -0500}: commit`. Journal: "The HEAD that moved was mine: `676a296` … committed on factory-v3 at 22:37:36Z while the turn was live" (`bootstrap/LOG.md:286`).
- The turn's transcript shows no git write command — only `rev-parse`, `log`, `status`, `diff`, `branch`, `merge-base`; all edits were absolute paths inside the task worktree; the only write outside it was its own `outcome.yaml`.
- The turn's own gate runs inside the worktree were green: 439 pass / 0 fail at 22:38:26Z, 440 pass / 4 skip / 0 fail at 22:40:46Z (`Ran 444 tests … [53.88s]`). No gate record exists for rotation-threaded — the kernel never ran `checks`.
- Transcript timing: the opencode shell's first `pwd` (22:26:05Z) printed `/home/slava/aiexp/agentic-swarm.wt/v3`; at 22:26:21Z the turn called `opencode.session_move` to the task worktree, and `end.session.cwd` is recorded as the task worktree.

## 5. Recorded causes the records contradict

| # | Recorded | Records show |
|---|---|---|
| 1 | 00559 `cause` and park 00560 record a containment breach: "HEAD moved outside the worktree in /home/slava/aiexp/agentic-swarm.wt/v3" | The only root-HEAD move in the window is the orchestrator's `676a296` at 22:37:36Z; the turn ran no git write; `worktree.ts:296-302` attributes any repo-root HEAD change to the running turn (`bootstrap/LOG.md:286-287`). Cause is a false attribution, not a task failure |
| 2 | Summary "Debt opened" lists three steer-guards items from 00537 (r1): hold re-read untested, `restoreTurn` empty-plan bug, boundary→dispatch untested (`summary.md:47-49`) | 00542 (r2, `approve`) says "Round 2 closes all four round-1 items". Merged tree (`7a16a07`): `pm.ts:56-63` already `fs.rmSync`s a created plan; bad-hold-from-steer-turn test at `test/kernel/steer-holds.test.ts:433-441`; launch-level steer test at `test/kernel/steer-window.test.ts:38-64`. `summary.ts:156` renders every `debt` concern of the iteration with no supersede |
| 3 | Summary "Debt opened" rotation-threaded cites "flow-context.ts:203-212 (guard)" and "frontTarget now refuses a rotating front alias" (`summary.md:53`) | That code exists only in the uncommitted task worktree (`flow-context.ts:189,195,203` there). In merged `factory-v3` `inheritedIteration` has 0 hits and `front.ts:145` still calls `frontTarget(runtime)` |
| 4 | Carried causes printed in this summary: prune-checks-types and turn-target "committed no changes"; prune-checks "no-progress … (da0b719d)" | Their own commit records are non-empty: 00263 `7395981` (−100 lines), 00266 `dc95ddf` (+253/−69); checks 00258/00264/00279/00285 died `exit 127` with `gates.sh: No such file or directory`. For prune-checks, r2's empty diff was correct and 00097 was green; `da0b719d` resolves to no object |
| 5 | `summary.md:83` "parked: 9"; `metrics.yaml:10-11` `parked: [rotation-threaded]` (1); `summary.md:3` and `metrics.yaml:2` `status: in-progress` | Summary parked/pending come from cumulative derived task state (`summary.ts:112-122`); metrics count the iteration's parks. The launch ended (`bootstrap/LOG.md:285` "exit 3") and iteration 13 was merged at `b4a2d9f` |
| 6 | `summary.md:86` "infra retries: 28"; `metrics.yaml:191` `humanInterventions: 0` | 42 quota stop events in `attempts[]`; 28 counts only same-model retry pairs (`metrics.ts:172-187`). `humanInterventions` counts processed steers only — the operator's mid-run commit `676a296` is invisible to it (`LOG.md:286`) |
| 7 | Summary Remarkable (`summary.md:74-76`) "Still owed for done: … M15 steer-guards, rotation-threaded" and "harness-rotation → rotation-threaded" | Text is the architect's opening turn at 20:10; steer-guards merged at 21:49 (00545) and rotation-threaded parked at 22:42 (00560). Summary "Outcome" and "Parked" disagree with its own Remarkable section |

## 6. Method and caveats

- Turn walls are `end.endedAt − started.startedAt`; script steps (`commit`, `checks`, `merge`, `park`, `debt`) are zero-length windows, so gate time was measured from the gap before the zero-length record plus the `Ran N tests … [Xs]` line inside `checks[].output`.
- Tokens/cost are `end.usage` as recorded; priced costs are `metrics.yaml` role totals (record `costUsd` is $0 except the architect). Span/parallelism are over iteration-13 records only; the baseline gate 00511 is iteration 0.
- Transcript claims come from `ses_e28fb7333ffeo7Ft96QS0au0Ri.export.json` (00559); session-level wall/tokens are shared across resumed rounds, so only `end.usage` was used per turn.
- Park causes for carried slugs were read from their own park records and cited in place, not re-derived; iteration 13 did not re-run those tasks.
- Caveats: the earlier forensics snapshot found 00559 without `end.yaml`; it is present now (with `endedAt` 22:42:55.555Z). `summary.md` was written 1.2 s after the park (17:42:56.804 -0500), so its Architect/Remarkable sections are the architect's 20:10 text and predate the iteration's merges.
