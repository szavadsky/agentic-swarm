# Repro medium A — E6 and E7

Scratch copy: `/tmp/review-swarm/ReproMediumA/v3` (clone of the real worktree). The
prescribed `git checkout b4a2d9f` was refused by workspace policy, so the clone stayed
at 518cca5; `git diff --stat b4a2d9f 518cca5 -- plugins/software-factory` is empty
(only `bootstrap/LOG.md` differs), so the plugin tree is b4a2d9f's. Tests exist only in
that scratch copy, never in the repo or the goal dir.

Common command prefix: `cd /tmp/review-swarm/ReproMediumA/v3/plugins/software-factory`

---

## E6 — boundary ends blocked / architect infra → stop=iteration-limit, exit 3, no cause, summary blocked-by-user

claim | When the boundary ends blocked (PM asked or exhausted, architect produced no decision) or the architect stops on infra (quota/auth), the launch reports stop=iteration-limit with exit code 3 and no cause, and the summary says blocked-by-user.

reproduced | yes, for all four launch cases (architect infra quota, architect infra auth through the CLI, PM escalated ask, PM exhausted). PM **rung** infra is no longer this path after iteration 13 (see below).

test file path | `/tmp/review-swarm/ReproMediumA/v3/plugins/software-factory/test/kernel/repro-e6-boundary-blocked.test.ts`

command | `cd /tmp/review-swarm/ReproMediumA/v3/plugins/software-factory && bun test test/kernel/repro-e6-boundary-blocked.test.ts` → 6 pass, 0 fail

key output |
```
E6 architect-infra result: {"stop":"iteration-limit","cause":null,"iterations":1}
E6 architect-infra summary: "status: blocked-by-user\n## Architect\n- no architect outcome recorded\n- boundary: architect turn produced no decision: no outcome"
goal demo: active, 1 iteration(s), stop=iteration-limit     (CLI output; no "cause:" line)
summary: iterations/1/summary.md
E6 architect-auth exit code: 3
E6 pm-asked result: {"stop":"iteration-limit","cause":null,"calls":4}
E6 pm-asked summary: "status: blocked-by-user\n## Architect\n- boundary: PM escalated and asked: which alpha did you mean?"
E6 pm-exhausted result: {"stop":"iteration-limit","cause":null,"calls":3}
E6 pm-exhausted summary: "status: blocked-by-user\n## Architect\n- boundary: PM ladder exhausted: rung 1 pm (fake-pm): status failed: cannot split the plan; rung 2 pm (fake-pm): status failed: cannot split the plan"
E6 pm-infra result: {"stop":"infra","cause":"infrastructure stop during iteration 1: quota: quota exceeded for fake-pm; relaunch to retry"}
E6 pm-infra summary: "status: stopped-with-debt\n## Architect\n- boundary: PM ladder stopped on infrastructure at rung 1 pm (fake-pm): quota: quota exceeded for fake-pm"
E6 pm-infra exit code: 1
```

what exactly was observed |
- Setup: goal class `bigger` (no front turn), fake architect returns Stop `{kind:"infra",cause:"quota",details:"quota exceeded for fake-architect"}` with no outcome. `runBoundary` sees `result.outcome` undefined → decision `blocked`, cause `architect turn produced no decision: no outcome`, and **no** `stop` field (src/kernel/boundary.ts:199-210). With `iterations:2`, the launch still ran 1 iteration.
- `runGoal` leaves `ended` undefined (only boundary.stop / front / dispatch set it, src/kernel/launch.ts:291-294), computes summary status `blocked-by-user` (launch.ts:339-345), passes the boundary cause to the summary (launch.ts:353-359) but returns `cause: undefined`; final stop falls through to `iteration-limit` because derived `state.goal` stays `active` (launch.ts:368-378). `exitCode` maps `iteration-limit` to 3 (src/cli/dispatch.ts:153-158); the auth variant run through `dispatch` printed exit code 3 and no `cause:` line.
- PM escalated ask: ladder `pm → pm-strong`; rungs 1-2 refusal, rung 3 escalated `blocked` → boundary cause `PM escalated and asked: …`, decision blocked, no stop (boundary.ts:234-243): same iteration-limit / no-cause / blocked-by-user. PM exhausted: two failed rungs → boundary cause `PM ladder exhausted: …` (boundary.ts:257-268): same.
- Iteration 13's `pm-infra-stop` (commit c7e092a, records 00527-00533) changed only the PM-rung infra case: `runPm` now returns `{status:"infra",stop,rungs}` on a rung record with `stop.kind==="infra"` instead of climbing; `BoundaryResult` carries that stop (boundary.ts:244-256); `runGoal` sets `ended="infra"` and a stop cause (launch.ts:291-294), so a PM quota stop now yields stop=`infra`, exit 1, summary `stopped-with-debt`, cause `infrastructure stop during iteration 1: quota: …`. The pre-change `pm.ts` (git show c7e092a^) had no infra branch: the rung failed with `no outcome (infra: quota)` and the ladder climbed on toward `exhausted` — i.e. E6's old behaviour. The task file states the motivation: "The launch still ends `iteration-limit`: `launch.ts` reads only `boundary.decision`".

anything that differs from the claim |
- "No cause" holds for `LaunchResult.cause` and the CLI (`cause:` line absent), but the summary's ## Remarkable does carry `boundary: architect turn produced no decision: no outcome` (summary.ts:141); the cause is not lost, only absent from the launch result.
- The cited lines (boundary.ts:177-196,219-238; launch.ts:279-282,309-320) do not line up at 518cca5/b4a2d9f. Actual: boundary 199-210 (no decision), 234-243 (asked), 244-256 (infra), 257-268 (exhausted); launch 291-294 (boundary.stop), 339-356 (status), 368-378 (stop). Pre-pm-infra-stop the no-decision cause sat at boundary.ts:190 and the ask at 225, closer to the citation.
- After iteration 13, E6's "architect stops on infra" / "PM asked or exhausted" parts still reproduce, but a PM **rung** quota/auth stop does not: it reports stop=infra, exit 1, summary `stopped-with-debt` (claim E6's parenthetical is stale for that sub-case).
- The label `blocked-by-user` is written even though the launch never asks the operator and the CLI prints `goal demo: active`; the question, when there is one, is the PM's outbox note for the architect.

---

## E7 — adapter wall/idle timeout and unknown errors are infra; derive skips infra records, so no item-budget spend and no park; an always-timing-out step retries on every relaunch without bound

claim | Adapter wall/idle timeouts and unknown errors are classified infra (timeout/crash); derive skips infra records, so they never consume the item turn budget and never park; a step that always times out is retried on every relaunch without bound.

reproduced | yes (3 consecutive full launches, item budget forced to 2; task never parks, `turns` stays 0, every relaunch re-dispatches the same implement step).

test file path | `/tmp/review-swarm/ReproMediumA/v3/plugins/software-factory/test/kernel/repro-e7-infra-timeout.test.ts`

command | `cd /tmp/review-swarm/ReproMediumA/v3/plugins/software-factory && bun test test/kernel/repro-e7-infra-timeout.test.ts` → 1 pass, 0 fail, 30 expectations

key output |
```
E7 launch 1: {"exit":1,"status":"ready","turns":0,"round":1,"phase":"implement","park":null,"cause":null,
  "summary":"status: stopped-with-debt\n- boundary: infrastructure stop during iteration 1: alpha: timeout: idle 30m; relaunch to retry"}
E7 launch 2: same with "...iteration 2..."
E7 launch 3: same with "...iteration 3..."
E7 records: {"implRecords":3,"stops":["infra:timeout","infra:timeout","infra:timeout"],
  "parks":0,"budgetParks":0,"implementOutcomes":0}
```

what exactly was observed |
- Goal class `bigger`; `.factory/process.yaml` sets `itemTurns: 2` (two counted turns would park). Launch 1: architect writes plan + `decision: continue`, PM files task `alpha` (flow implement-review), implementer returns Stop `{kind:"infra",cause:"timeout",details:"idle 30m"}` and no outcome. Launch 2 and 3 (separate `dispatch` runs, digest scout scripted for the relaunch) repeat architect continue / PM done / implement timeout.
- Every launch exited 1 (`stop=infra`); after each, derived task state was `status:"ready"`, `phase:"implement"`, `round:1`, `turns:0`, `park:undefined`, `cause:undefined`; each iteration summary says `status: stopped-with-debt` and `- boundary: infrastructure stop during iteration N: alpha: timeout: idle 30m; relaunch to retry`.
- After three launches the record store holds exactly 3 `alpha/implement` records, all `stop.kind="infra"`, 0 implement outcomes, 0 `alpha/park` records and no `budget:`-caused record; the phase machine re-dispatches the step every launch.
- Source match: `deriveTask` skips `stop.kind==="infra"` before `turns += 1` and before the no-progress fingerprint (src/kernel/derive-task.ts:193-194; progress.ts:15 also returns undefined for infra), so neither the item budget (`next.ts:78-80`, `turns >= itemTurns`) nor loop detection can fire on infra attempts. `dispatch.settledTurns` likewise excludes infra from the *iteration* turn budget (dispatch.ts:71-82). No persisted infra-retry counter or cap exists; `metrics.infraRetries` is a display count only (metrics.ts:181, summary.ts:61), and `run.limits.iterations` is per launch — hence every relaunch retries.
- Classification is code-read, not adapter-tested here (assignment limited me to my own test files): wall and idle aborts both yield `{kind:"infra",cause:"timeout"}` (omp turn.ts:88,149 → classify.ts:105; opencode turn.ts:87,108 → classifier.ts:69; acpx turn.ts:111,134 → classify.ts:82), and unknown/exit failures yield `{kind:"infra",cause:"crash"}` (omp classify.ts:52, opencode classifier.ts:57, acpx classify.ts:65). The synthetic `timeout` stop used in the test is therefore the same shape the adapters produce.

anything that differs from the claim |
- One infra cause does park: `overflow` (agent.ts:205-210 calls `appendPark(..., "overflow")`), so "infra records never park" is true for timeout/crash but not for overflow — outside E7's wall/idle/crash scope.
- "Never consume the item turn budget" is exactly reproduced (`turns` 0 after 3 attempts even with `itemTurns: 2`); the claim's "without bound" is supported by three consecutive relaunches plus the absence of any infra-attempt counter, but I did not run a longer campaign.
- Launch exit is 1 (`stop=infra`) on each attempt; no operator-visible counter records the retry count outside the per-iteration summary's "infra retries" metrics line.
