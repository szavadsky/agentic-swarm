# Gaps and defects

What will still differ from [INTENT.md](INTENT.md) once the running build (goal `delta`) delivers **every** bullet of its [plan](/home/slava/aiexp/agentic-swarm.wt/v3/.factory/artifacts/delta/plan.md). Gaps that a plan bullet fully closes are not listed. This is not the scope: build the entire intent.

- **Basis**: `factory/delta` at `2773bd20`, plus the parked branches and run records of 2026-11-24. Paths are relative to `plugins/software-factory/`; line numbers are at that commit.
- **Evidence**: *[run]* — shown by run records; everything else was found by reading the code and not reproduced.
- Delete an entry in the change that closes it.

## 1. Deviations from the intent, by slug

*missing* — no code and no plan bullet. *partial* — code plus plan deliver only part. *differs* — built or planned another way. **merged short** — the plan bullet is merged, but its own done-when is not met.

### Goal start and scope

- **[[Traceability]]** — *missing*. No slug parsing, no triage note or agent that adds missing slugs, no per-slug status footnote, no deterministic check. The plan predates this section.
- **[[StandaloneTaskUpscope]]** — *partial*. The last reviewer is asked about "the front's predicted area above", but its prompt contains no such area and no trivial/task/bigger definitions (`src/kernel/flow-context-front.ts:97-108`, `prompts/review-implementer-turn.md:6`). A flow that ends without a reviewer is never asked.
- **[[GoalBranchAndSteward]]** — *differs*. The goal branch is cut from `repo.baseBranch`, fixed at `init`, not from the repo's current branch at goal start (`src/cli/commands/goal.ts:48`, `src/kernel/worktree/checkout.ts:208`).

### Architect, plan, checker

- **[[PlanReviewBoundary]], [[PlanCompletenessChecker]]** — **merged short** (`checker-every-consult`). The checker is still skipped when a steer waits (`src/kernel/plan-check.ts:191`).
- **[[ContextPackPreparer]]** — *differs*. The pack is content by default: a section renders whole unless the preparer briefs it, and only six sections can be briefed (`prompts/pack-preparer.md`). Intent: links by default. `pack-index-single` fixes the renderer, not the default.
- **[[SelfBuildArchitectFlowRotation]]** — *missing*. No flow in which a dedicated agent adversarially reviews status and the architect adjudicates. `boundary-flow-config` makes it possible; nothing configures or rotates it.
- **[[BootstrapPreviousRunAssessor]]** — *partial*. The plan provides the step slot (`boundary-flow-config`, `self-improve-plugin`); no bullet makes the assessor read logs for friction and waste or prepare the pack.

### Concerns

- **[[ConcernsFunnel]]** — *missing* stage: the reviewer is not given the concerns of QA and the implementer and has no field to dismiss one as immaterial (`prompts/review-implementer.md`, `src/kernel/types/outcome.ts`).
- **[[ConcernsFunnel]]** — **merged short** (`concerns-funnel-pm`). The PM judges concerns only inside the stall turn, so a wave without an undecided park judges none (`src/kernel/dispatch-end.ts:81-91`).
- **[[ConcernsFunnel]]** — **merged short** (`concerns-funnel-checker`). The checker sees open concerns without the PM's marks; a follow-up replaced by a continuation does not close its concern (runs `00126`, `00100`).
- **[[RemarkablesCalibration]]** — *missing*. No prompt or schema asks for "what is achieved" and "what is of concern" (`prompts/remarkable.md`).

### Task flow and parks

- **[[AgenticParkAndKeptBranches]]** — **merged short** (`signal-decider-limits`). The kernel still parks by itself on: a gate timeout or a gate that cannot start, a second crash of one step, a second merge conflict, a repeated-turn fingerprint, `changes` on the last call, context overflow (`src/kernel/derive-task-gates.ts:97-104,190-325`, `next.ts:63-73`, `derive-task-turn.ts:386`, `derive-task-verdict.ts:159`, `agent/price.ts:137`).
- **[[ReviewBoundsAndLaunchAccounting]]** — *partial*. The decider has no bound of its own (see defect D1). `per-agent-rounds` leaves two users of the shared round: adjudication and the follow-up mode (D6).
- **[[CiCdFailureAdjudication]]** — *missing*. No dedicated agent adjudicates a red gate: one mechanical re-run, then an implementer fix turn. Merge gates of a normal landing get no re-run (`src/kernel/integrate/merge-checks.ts:108`).
- **[[SelfBuildTaskFlowPresets]]** — *partial*. `self-build-catalogue` names fact finder, ComputerUse and `nogit`; PoC and `noqa` are in no bullet.

### Saga

- **[[SagaArchitectPlanning]]** — *differs* (`saga-pass-planner`, parked branch). On a steer-capable harness the top architect's choice of subarchitects has no effect: children start before its outcome exists. The prompt documents this as an exception, against the bullet's done-when.
- **[[SagaArchitectPlanning]]** — *partial* (same branch). The top architect's pack carries the bottom-up concerns and decisions, not the epic summaries.
- **[[OmpRpcAndAddressableSubarchitects]]** — *partial*. An epic's first consult is never an addressable omp child, only a separate turn (`src/kernel/boundary-steer.ts:126-135`).
- **[[SagaDepthAndLiveProof]]** — unproven. The live multi-epic goal is deferred to an operator launch; depth 2 has never run live.

### Steers and launch

- **[[SteerMailboxPolling]]** — **merged short** (`steer-watch`). The debounce only delays the wake during a running turn. Any other pass claims a steer after a short settle, so a burst can still cost several PM turns (`src/kernel/dispatch-poll.ts:26-83`).
- **[[SteerTriageAndUrgentDrain]]** — *partial*. An urgent steer that arrives while the PM runs is injected as an ordinary one; if the PM routes it as a task, the iteration does not drain (`src/kernel/dispatch.ts:231`, `dispatch-watch.ts` `deliverDue`).
- **[[GracefulStopFile]]** — *missing*. Only SIGINT/SIGTERM stop a run.
- **[[LaunchBoundsAndDrain]]** — *missing*. `--iterations` is the only bound that is a launch argument. Checker rounds, time, budget and "wait and retry on infra" are not; time and budget bound an iteration, not the launch (`src/cli/dispatch/args.ts`, `src/kernel/config/run-schema.ts:221-245`).
- **[[IterationBudgetDrain]]** — *partial*. No subscription-use limit. A drain that ends with an infra fault still launches steward, PM and checker turns (`src/kernel/dispatch-end.ts:226-233`).

### Observability

- **[[KernelJsonlJournal]]** — *differs*. The journal is a directory of YAML files per step; no JSONL and no published record schema (`src/kernel/store/folder-records.ts:102`).
- **[[KernelCliCommands]]** — *partial*. No artifact cleanup, log level, or stats/cost command. `status` has no schema and no YAML output. `drop-unasked-tools` removes `benchmark`, the only stats command.
- **[[StatusAndDashboard]]** — *partial*. Intent completion is keyed by free-text section, not by slug, and only the architect reports it (`src/kernel/types/outcome.ts:201`).
- **[[TestRuntimeTracking]]** — *missing*. Gates carry no duration of their own, tests have no tracked runtimes, nothing compares now with goal start, and the architect prompt has no invitation to cut test time. `testRuns` counts gates (`src/kernel/record.ts:77`).

### Gates, harness, delivery

- **[[TreeKeyedGateCache]]** — *partial*. Merge checks reuse a judged tree; task gates always run in full, and the baseline re-runs whenever the base moved (`src/kernel/flow-gates.ts:140`, `baseline.ts:336`).
- **[[DomainAgnosticFlows]]** — *partial*. Failure identity falls through to a bun/tsc line scanner (`src/kernel/gates-signatures.ts:272`). `gate-findings-model` removes the runner enum, not explicitly this default.
- **[[SupportedHarnessesAndCanary]]** — *differs*. `drop-unasked-tools` deletes the canary command and its proof record, so "proven before rotation" rests on the operator alone. Live canaries, cross-harness model switch and sandboxed runs are deferred.
- **[[ProcessSandbox]]** — *partial*. `sandbox-wrapper` builds the wrapper; no bullet makes bwrap the bootstrap setup, and `skills/run-factory/sandbox.md:8` still calls it out of scope.
- **[[ArtifactRetentionAndCherryPick]]** — *partial*. `drop-run-archive` deletes 63 MB of raw agent I/O, but no check prevents the next commit of it.
- **[[TypeScriptStackAndLint]]** — *differs*. `bootstrap/shakedown/make-repo.sh` holds real logic in shell; no bullet. (`bootstrap/benchmark/reset.sh` should go with the benchmark.)

## 2. Defects and inefficiencies

### Defects, most severe first

- **D1 — Unbounded decider.** `approve` on a red merge retries the same tree, the red returns, the decider is asked again. `changes` resets the fix budget, so fix → red → decide repeats too. Only the optional iteration limits stop it (`src/kernel/derive-task-decide.ts:104-141`, `derive-task-gates.ts:208-250`; probed by QA in run `00278`). [[AgenticParkAndKeptBranches]]
- **D2 — Slow suite parks finished work.** *[run]* A gate timeout is classed as infra, reported as "gate could not start", never re-run, and parked by the kernel. 5 of the 6 `delta` parks: `00280`, `00376`, `00517`, `00540`, `00543`, all the 300 s test wall (`src/kernel/flow-gates.ts:33-48`, `integrate/merge-checks.ts:60-69`). [[CiCdFailureAdjudication]]
- **D3 — A dead primary is retried forever.** *[run]* All 65 QA turns first failed on `effort not found: high`, then ran on the fallback. Pre-flight accepted the effort; the error is classed `crash`, so nothing remembers it. At least 23 later rounds lost their session because it belonged to the fallback harness (`resume-fallback` records from `00067`). [[ConfigDrivenEffortAndCompaction]], [[HotCacheCompactedResume]] 
- **D4 — Two launches of one goal.** Stale-lock takeover does not re-read the lock after winning the marker, so a late process can overwrite a live lock. A crash leaves the marker and blocks takeover until deleted by hand; a reused PID looks like a live factory (`src/cli/lock.ts:185-210,296`). [[IdempotentCrashResume]]
- **D5 — Steer handled twice.** A steer injected into a live PM turn is not marked seen; routed to anything but a task it stays in the inbox and gets a second PM turn (`src/kernel/pm/routes/steer-claim.ts:48-57`, `dispatch-poll.ts:79`). A PM turn that ends in infra drops its result: the steer waits for the architect (`dispatch-poll.ts:138-161`). [[SteerMailboxPolling]]
- **D6 — Adjudication on the wrong cycle.** With QA in the flow, `adjudicate: last` and `different-model` follow-up use the shared round and fire early. Shipped flows are not affected (`src/kernel/review.ts:49`, `flow-context-step.ts:88`; run `00268`). [[ReviewAdjudicationAgent]]
- **D7 — A hung push stalls the store.** `git push` runs inside the checkout queue with no timeout. A failed push leaves the commit local with no retry (`src/kernel/store-backend.ts:116`). [[ArtifactStorageBackends]]
- **D8 — One conflicting artifact commit blocks every launch.** A cherry-pick failure aborts and throws during checkout preparation, and the next launch meets it again (`src/kernel/store-backend.ts:300-315`). [[ArtifactRetentionAndCherryPick]]
- **D9 — Fallback tier by index.** The tier admitted is an index into a quota-filtered list that is recomputed at start; if a pool latches in between, the turn can run on a pool at its cap (parked `cap-falls-back`, run `00359`). [[PerSubscriptionConcurrency]]
- **D10 — Repair ignored.** If `outcome.yaml` parses but fails the step's contract, a corrected YAML block in the repair reply is never read: the file wins (`src/kernel/outcome.ts:95-115`). [[StructuredOutputChannels]]
- **D11 — Error text misread.** Quota is matched before overflow, so "insufficient context window" latches the pool. A zero-usage reply that mentions billing or 429 does the same. Waits stated in days or only in seconds are not parsed (`src/harness/omp/classify.ts:33-54`, `acpx/classify.ts:30-40,107`, `stated-wait.ts:7`). [[QuotaPoolExhaustion]]
- **D12 — Timed-out turns cost nothing.** The wall bound returns a synthetic result with zero usage and no attempts (`src/kernel/agent/chain.ts:113-127`). [[UsageAndPriceTracking]]
- **D13 — Child stdin.** Without input the pipe is never closed, so a gate that reads stdin hangs until its wall; with input there is no `error` listener, so an early exit can raise an unhandled EPIPE (`src/core/proc.ts:203-210`). [[KernelCore]]
- **D14 — Stale `status --json`.** It returns the stored file while plain `status` derives fresh (`src/cli/commands/goal.ts:147`). [[KernelCliCommands]]
- **D15 — Malformed RPC line dropped.** A truncated omp frame is skipped silently and the turn ends as a timeout (`src/harness/omp/rpc.ts:228-237`). [[OmpRpcAndAddressableSubarchitects]]

### Run inefficiencies

Goal `delta`, 582 records, 37 merged tasks. The run executes the pin `66992f55`, not the code under review.

- **Tokens** *[run]* — 1.05 B in total, 28 M per merged task; 97% are cache reads. Implementers take 780 M over 72 turns, about 10.8 M per turn: long agent loops, not prompts, are the cost.
- **Gates** *[run]* — 121 gate runs, 3.3 per merged task, median 181 s, 6.7 h in total. Intent: nothing needs minutes. `suite-speed-spike` precedes any fix and its tasks are not written yet.
- **QA spin** *[run]* — D3 spends one failed launch on every QA turn.
- **Late conflicts** *[run]* — 5 resolve turns (`00194`, `00232`, `00319`, `00380`, `00514`). Lint went red only at merge twice (`00081`, `00471`).
- **Unpriced turns** *[run]* — 74 of 192 (pi, agy), so $7.61 understates the run.
- **Concern noise** *[run]* — 202 concerns, 175 of them FYI; 27 need a decision.

### Stack inefficiencies

- **Size** — source 51.9k → 56.7k lines, tests 101.2k → 109.9k since `main`; tests are 1.94× the source and grow 1.9× faster. The kernel is 81% of the source, 239 files. 14% of source lines are comments.
- **M10 is too weak** — "a fifth less" per test area leaves about 1.55×. `report-view-model` and `validation-check-list` ask only that "kernel lines go down". Nothing limits growth while M1–M9 are built.
- **The 500-line cap splits files instead of shrinking them** *(inference)* — the largest files sit at 474–500 lines, and 67 test files carry numbered or continuation names.
- **Hand-rolled where a library exists, no bullet** — line diff (`kernel/intent.ts`), run lock (`cli/lock.ts`, see D4), CLI parsing (`cli/dispatch/args.ts`), front matter (`harness/lsp/frontmatter.ts`). No logger. JUnit is covered by `gate-findings-model`.
- **Duplicates, no bullet** — 26 function names defined in more than one file (`recordPath` ×4, `bySeq` ×4), two worktree-list parsers, three register parsers, four plan/task parsers.
- **Status rewrite** — every agent launch and finish re-lists records, re-derives the goal and recomputes metrics for each iteration over all records (`kernel/status.ts:268,415-450`). Prices load on the same path, with no fetch timeout and no back-off (`kernel/openrouter.ts:141-180`).
- **Derive per pass** — each dispatch pass re-reads the record directory and re-derives the whole goal one or more times; sealed records are cached, the derived state is not.
- **Merge setup** — every merge check and every baseline runs the full repo setup in its worktree (`integrate/merge-checks.ts:84`, `baseline.ts:246`).
- **Repository** — `docs/runs` is 63 MB in 1,561 files, and `.git` is 111 MB; deleting the folder does not shrink history.

## Not reviewed in depth

[[StewardMergeLadder]], [[MechanicalCommitsAndHashContext]], [[PreserveRepoHarnessSetup]], [[HarnessSessionPortability]], [[CliPromptDump]], and the decision logic in `steward/` and `gates-normalise.ts`.
