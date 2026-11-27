# Gaps and defects

What differs from [INTENT.md](INTENT.md) on `main` after goal `delta` landed (75 merged; parked `suite-compact-boundary`, `suite-compact-task`; pending `lint-warnings`, `suite-compact-rest`). This is not the scope: build the entire intent.

- **Basis**: `f7193e09` (`main` + the INTENT update). Paths are relative to `plugins/software-factory/`; line numbers are at that commit. Run evidence is goal `delta` (`/home/slava/aiexp/agentic-swarm.wt/v3/.factory/artifacts/delta/`, 1,061 records; the run executed the pin `66992f55`, not this code).
- **Evidence**: *[run]* — shown by run records; everything else was found by reading the code and not reproduced.
- Delete an entry in the change that closes it.

## 1. Deviations from the intent, by slug

*missing* — no code. *partial* — part is built. *differs* — built another way. *unproven* — built, never run live.

### Actors and goal start

- **[[InfraAgent]]** — *partial*. Ingestion only: `prompts/infra.md` writes `infra.yaml` (`src/kernel/ingestion.ts:261-273`). On an infra failure no agent runs: dispatch returns `infra` and the launch stops (`src/kernel/dispatch-end.ts:71,110,316`, `launch-goal.ts:58-65`); nothing decides infra vs really red, fixes config, or prescribes retry / ignore / fall back / stop task types / escalate in structured output. *[run]* 11 of 14 parks were tests-gate timeouts that only a config change (timeout or semaphore) would have prevented.
- **[[GoalBranchAndSteward]]** — *differs*. The goal branch is cut from `repo.baseBranch`, set once at `goal init`, not from the repo's current branch at goal start (`src/cli/commands/goal.ts:47-56`, `src/kernel/worktree/checkout.ts:57-63,208`).
- **[[StandaloneTaskUpscope]]** — *partial*. The last reviewer gets "the front's predicted area above" (`src/kernel/flow-context-front.ts:84-96`), but its prompt carries neither that area nor the trivial/task/bigger definitions, which live only in `prompts/front.md:9-15` (`prompts/review-implementer-turn.md:6`). A flow that ends without a reviewer is never asked.

### Architect, plan, checker

- **[[ContextPackPreparer]]** — *differs*. Content by default: a section renders whole unless the preparer lists it in `packBriefs`, and only six sections can be briefed — planCheck, planReview, forwarded, spikeFindings, pmAnswers, codeMap (`prompts/pack-preparer.md:9-17`, `src/kernel/context-pack/sections.ts:9-20`, `render.ts:69-74`).
- **[[BootstrapPreviousRunAssessor]]** — *partial*. `plugins/self-improve/prompts/assess-run.md` reads records, summaries, metrics and transcripts and writes `iterations/<n>/assessment.md`, appending one pointer line to the pack; it does not prepare the pack. Its record access is not a configured read-only grant (see [[KernelRecordsSeparation]]).

### Concerns

- **[[ConcernsFunnel]]** — *missing* stage: the reviewer gets only its own earlier findings (`prior_findings`, `src/kernel/flow-context-vars.ts:116-126`), not the concerns of QA and the implementer, and has no field to dismiss one as immaterial (`src/kernel/types/outcome.ts:5-10,226-240`).
- **[[ConcernsFunnel]]** — *partial*. The PM judges concerns only in the stall route, which runs only when a park is undecided (`src/kernel/dispatch-end.ts:88-100`, `pm/routes/stall.ts:35-43`).
- **[[ConcernsFunnel]]** — *partial*. The checker's `open_concerns` carry no PM mark (`src/kernel/plan-check.ts:250-272`). A follow-up replaced by a continuation does not close its concern (runs `00126`, `00100`; not re-traced at this commit).
- **[[RemarkablesCalibration]]** — *missing*. `prompts/remarkable.md:1` is one definition line; no prompt or schema asks for "what is achieved" and "what is of concern". *[run]* 389 concerns: 330 FYI, 58 architect, 1 owner.

### Task flow and parks

- **[[AgenticParkAndKeptBranches]]** — *partial*. The kernel still parks by itself on all six signals: a gate that times out or cannot start (`src/kernel/derive-task-gates.ts:101-108`), a second crash or timeout of one step (`:293-320`), a second merge conflict (`:259-275`), a repeated-tree fingerprint (`derive-task-turn.ts:136-190`, `next.ts:63-76`), `changes` on the last call (`derive-task-verdict.ts:145-160`), an overflow that survives retry (`agent/price.ts:133-146`). *[run]* `per-agent-rounds` parked on the round limit after an `approve` verdict (`00333`).
- **[[ReviewBoundsAndLaunchAccounting]]** — *partial*. Round counters are per step now (`src/kernel/derive-types.ts:74-78`); the decider has no bound of its own (D1).
- **[[CiCdFailureAdjudication]]** — *partial*. A red gate goes to the `decide` step once fix rounds are spent (`src/kernel/derive-task-gates.ts:151-165,241-260`); merge gates of a normal landing get no re-run, only kept-branch landings do (`integrate/merge-checks.ts:118-132,247-272`). A timeout is parked as "gate could not start"; no agent decides whether it is infra or really red (D2).
- **[[SelfBuildTaskFlowPresets]]** — *partial*. `poc` exists (`config/process.yaml:81-86,217-221`); `noqa` does not.

### Saga

- **[[SagaArchitectPlanning]]** — *differs*. On a steer-capable harness the top architect's choice cannot hold back a steered epic: children start in its live session before its outcome exists (`src/kernel/boundary-steer.ts:98-120,201-235`, `prompts/architect-goal.md:24`).
- **[[SagaArchitectPlanning]]** — *partial*. The top pack has a per-epic rollup line (status, decision, open tasks), not the epic summaries written to `iterations/N/epics/<epic>/summary.md` (`src/kernel/context-pack/append.ts:65-93`, `epic-summary.ts:100-125`).
- **[[OmpRpcAndAddressableSubarchitects]]** — *partial*. An epic's first consult is never a steered omp child: `steeredRows` needs an earlier, ended subarchitect record (`src/kernel/boundary-steer.ts:98-120`).
- **[[SagaDepthAndLiveProof]]** — *unproven*. Fake-harness tests only (`test/kernel/saga-e2e.test.ts` and siblings); no live multi-epic goal in `bootstrap/LOG.md`; depth 2 has never run live.

### Steers and launch

- **[[SteerTriageAndUrgentDrain]]** — *partial*. An urgent steer arriving during a PM turn is injected like any other (`src/kernel/dispatch-watch.ts:102-111`, `dispatch.ts:232`); drain starts only if it is still pending at a poll (`dispatch-admit.ts:29-42`). No hold for a steer that asks to wait for the boundary: *[run]* `e625288b` said "evaluate at the next boundary" and the digest was rewritten 83 s after filing.
- **[[LaunchBoundsAndDrain]]** — *partial*. `--iterations` is the only bound that is a launch argument (`src/cli/dispatch/args.ts:42-44`); checker rounds, wall time and USD are config and bound an iteration (`src/kernel/config/run-schema.ts:225-227`, `dispatch-admit.ts:38-60`). Missing: wait-and-retry on infra, a subscription-use limit, the stop file (only SIGINT/SIGTERM, `src/core/shutdown.ts`). A drain that ends with an infra fault still runs the steward, stall-PM and checker stages (`dispatch-end.ts:270-305`).

### Configuration and prompts

- **[[ConfigSemaphores]]** — *missing*. Concurrency is `limits.concurrency.overall | perSubscription | perModel` in the run config (`src/kernel/config/run-schema.ts:206-214`), plus binary gate mutexes through a gate's `serial` keys (`repo-schema.ts:47`, `src/kernel/gates.ts:67,142`) and a flow-level count (`types/flow.ts:259-263`). No named counting semaphores, none declared in the repo or factory layer, nothing that keeps the tests gate from contending with live turns.
- **[[PromptOverlay]]** — *partial*. Per-file shadowing exists: in-memory, then `promptsDir`, then `<repo>/.factory/prompts`, then shipped (`src/kernel/prompts.ts:27-59,91-95`). `promptsDir` is only in the run schema (`run-schema.ts:51`); the factory layer cannot overlay. Agent-bound text still hardcoded in `.ts`: PM contracts (`src/kernel/pm/prompts.ts:118,156,282,322`), last-call text (`prompts.ts:89-90,330`), resume note (`digest.ts:301`), merge-conflict note (`merge-conflict.ts:27`), bootstrap assignment (`src/cli/commands/bootstrap-dispatch.ts:101`). `prompts --dry-run` omits resume, reminder and last-call prompts (`src/kernel/prompt-dry-run.ts:58-95`).
- **[[PromptGuide]]** — *partial*. `skills/run-factory/SKILL.md:102-119` covers shadowing and calibration but not the dry-run; `config.md:127-128` puts `promptsDir` in the process config, which the schema does not.

### Observability

- **[[KernelRecordsSeparation]]** — *missing*. Kernel records and agent artifacts share one goal directory — a step's `started.yaml` and `end.yaml` sit beside its `outcome.yaml` (`src/kernel/store/folder-records.ts:102,169-174`), and `records/` sits beside `plan.md`, `tasks/` and `mailbox/`. Nothing hides records from agents or the sandbox, and no record schema is published.
- **[[KernelCliCommands]]** — *partial*. Commands: run, init, status, steer, validate, variables, schemas, prompts (`src/cli/dispatch/commands.ts:207-216`). No record query, artifact cleanup, log level, or stats/cost command; `status` has no schema and no YAML output (and see D14). No logger: console only.
- **[[StatusAndDashboard]]** — *partial*. Intent completion is keyed by free-text section, not by slug, and only the architect reports it (`src/kernel/types/outcome.ts:206-212`, `summary/intent-status.ts:9-13`).
- **[[TestRuntimeTracking]]** — *partial*. Checks carry `durationMs` and steps `wallMs` (`src/kernel/record.ts:70-82`, `src/core/checks/types.ts:97`); `testRuns` still counts checks. No per-test runtimes, no comparison with goal start, no invitation in the architect prompts.
- **[[UsageAndPriceTracking]]** — *partial*. *[run]* 155 of 347 agent turns unpriced (118 pi/deepseek, 34 agy/gemini, 2 ernie, 1 other): $11.72 reported against $36.80 at list. Timed-out turns record zero usage (D12).
- **[[WastedTurnTracking]]** — *partial*. *[run]* The metric counts 6 wasted turns (1.7%) but none of the ~60 records re-run after the 11 timeout parks, which intent counts as incorrect rejections.
- **[[Traceability]]** — *missing*. No slug parsing (the only `\[\[` in `src/` is an ANSI regex, `src/kernel/gates-normalise.ts:21`), no triage note or agent that adds missing slugs, no per-slug status footnote, no deterministic check.

### Harness, quota, gates

- **[[SupportedHarnesses]]** — *partial*. Pre-flight checks effort per leg, fallbacks included (`src/kernel/preflight-aliases/models.ts:112-143`, `tiers.ts:7-30`); an auth probe was not found. A primary that fails without quota is not remembered (D3).
- **[[TreeKeyedGateCache]]** — *partial*. Merge checks reuse a judged tree; task gates always run in full, and the baseline re-runs whenever the base moved (`src/kernel/flow-gates.ts:80-100,141`, `baseline.ts:320-332`). *[run]* 204 gate runs (143 task, 61 merge), median 178.5 s, 11.4 h in total; the suite (~128 s alone) hit the 300 s tests timeout (`.factory/repo.yaml:32`) in 26 records.
- **[[DomainAgnosticFlows]]** — *partial*. Failure identity falls back to a bun/tsc line scanner (`src/kernel/gates-signatures.ts:6-14,185-234`); `bun` is named in `src/kernel/prompts.ts:230`.

### Workspace, OS, artifacts

- **[[MultiRepoProjects]]** — *missing*. One repo root is assumed throughout (`FACTORY_REPO_ROOT`, `--repo`).
- **[[MultiOS]]** — *missing*. Linux/POSIX calls are spread across modules with no OS interface: `/proc` reads (`src/kernel/gate-processes.ts:45,57`), process-group kills `kill(-pid)` (`src/core/shutdown.ts:30`, `gate-processes.ts:99,107`, `src/core/proc.ts:106,124`, `src/harness/acpx/turn/process.ts:206`), `kill(pid, 0)` liveness (`src/cli/lock.ts:64`), `bash -c` (`src/core/proc.ts:136`), hardcoded `/` (`src/kernel/store-backend.ts:47`, `context-pack/misc.ts:29`). No CI exists. Wrapped sandbox cases are skipped without bwrap (`test/harness/sandbox.test.ts:354-377`).
- **[[ProcessSandbox]]** — *partial*. The wrapper is built (`src/core/sandbox.ts`, `skills/run-factory/sandbox.md`), but the bootstrap run config does not enable it (`bootstrap/run/base.yaml:144-148`, commented out).
- **[[ArtifactRetentionAndCherryPick]]** — *partial*. `docs/runs` is gone, and `test/no-run-archive.test.ts` guards only that path; nothing generic stops raw agent I/O being committed elsewhere (the store's `.gitignore` covers goal stores only, `src/kernel/store-backend.ts:15-30`). See D7, D8.

### Stack and delivery

- **[[TypeScriptStackAndLint]]** — *differs*. `biome.json` caps every function at 50 lines and cognitive complexity at 15, with no test override; intent is ~120 lines in source and ~300 in tests. *[run]* That cap blocked both suite-compaction tasks (−12.7% and −6% against −20%). `bootstrap/shakedown/make-repo.sh` (54 lines) holds real logic in shell.
- **[[RootReadme]]** — *missing*. No root `README.md`. `plugins/software-factory/README.md` is 705 lines (Configuration ≈480) and overlaps `skills/run-factory/config.md` (262) and `kernel.md` (123).

## 2. Defects, most severe first

- **D1 — Unbounded decider.** `approve` on a red merge re-queues the merge with no counter, and `changes` resets the gate-fix count (`grantGateFix`); fix → red → decide repeats until an optional iteration limit (`src/kernel/derive-task-decide.ts:63-72,99-140`, `derive-task-verdict.ts:260-280`). [[AgenticParkAndKeptBranches]]
- **D2 — Slow suite parks finished work.** *[run]* A gate timeout is stamped infra, reported as "gate could not start", never re-run, and parked by the kernel — 11 of the 14 `delta` parks (`src/kernel/flow-gates.ts:34-48`, `derive-task-gates.ts:101-110`, `integrate/merge-checks.ts:70-78`). The wrong cause sent the steward, PM and operator after a spawn failure (`00279`). [[InfraAgent]], [[CiCdFailureAdjudication]]
- **D3 — A dead primary is retried every turn.** *[run]* 113 QA turns first failed on `effort not found: high`, then ran on the fallback. Pre-flight now checks effort, but a primary's non-quota failure is still not latched: each turn restarts from the primary (`src/harness/fallback.ts:81-84,106-108,162-210`); rounds that resume lose a session owned by the fallback harness. [[SupportedHarnesses]], [[EndOfSessionCompaction]]
- **D4 — Two launches of one goal.** Takeover does not re-read the lock after winning the marker; a crash leaves the marker and blocks takeover until deleted by hand; liveness is PID-only, so a reused PID looks alive (`src/cli/lock.ts:60-68,177-203,250-300`). [[IdempotentCrashResume]]
- **D5 — Steer handled twice or dropped.** An injected steer is not added to `seenSteers`, and a non-task route never moves it out of the inbox (`src/kernel/pm/routes/steer-claim.ts:56-65`, `pm/routes/steer.ts:336-346`), so a later pass or relaunch can claim it again (not reproduced). A PM steer turn that stops on infra drops its routes; the steer waits with no answer (`pm/routes/steer.ts:193-212`). [[SteerMailboxPolling]]
- **D6 — Hung push stalls the store.** `git push` runs inside the checkout queue with no timeout; a failed push leaves the commit local with no retry (`src/kernel/store-backend.ts:88,110-116`). [[ArtifactStorageBackends]]
- **D7 — One conflicting artifact commit blocks every launch.** A failed cherry-pick aborts and throws during checkout preparation, and the next launch meets it again (`src/kernel/store-backend.ts:287-316`, `launch-goal.ts:128,154`). [[ArtifactRetentionAndCherryPick]]
- **D8 — Fallback tier by stale index.** The admitted tier is an index re-applied to a list recomputed at start, with only a quota re-check, so the turn can run on a pool at its cap; `cap-falls-back` did not change this (`src/kernel/flow-step.ts:292-310`, `dispatch-admit.ts:130-146`, `agent/chain.ts:406-415`). [[ConfigSemaphores]]
- **D9 — Repair ignored.** If `outcome.yaml` parses but fails the step's contract, a corrected YAML block in the repair reply is never read: the file wins (`src/kernel/outcome.ts:93-114,250-263`, `agent/turn.ts:410-436`). [[StructuredOutputChannels]]
- **D10 — Error text misread.** Quota is matched before overflow, so "insufficient context window" latches the pool; a zero-usage reply that mentions billing or 429 does the same; waits stated in days or only in seconds are not parsed (`src/harness/omp/classify.ts:26-47`, `acpx/classify.ts:40-47,113-132`, `stated-wait.ts:7-19`). [[QuotaPoolExhaustion]]
- **D11 — Timed-out turns cost nothing.** The wall bound returns a synthetic result with zero usage and no attempts (`src/kernel/agent/chain.ts:108-147`). [[UsageAndPriceTracking]]
- **D12 — Child stdin.** Without input the pipe is never closed, so a gate that reads stdin hangs until its wall; with input there is no `error` listener on stdin, so an early exit can raise an unhandled EPIPE (`src/core/proc.ts:193-201,297-308`). [[KernelCore]]
- **D13 — Stale `status --json`.** It returns the stored file while plain `status` derives fresh (`src/cli/commands/goal.ts:96-157`, `src/kernel/status.ts:251-262`). [[KernelCliCommands]]
- **D14 — Malformed RPC line dropped.** A truncated omp frame is skipped silently and the turn ends as a timeout (`src/harness/omp/rpc.ts:217-234`). [[OmpRpcAndAddressableSubarchitects]]

## 3. Run inefficiencies

Goal `delta`: 1,061 records, 347 agent turns, 75 merged, 43.5 h wall.

- **Tokens** *[run]* — 2.26 B in total, 86% cache reads, 30 M per merged task. Implementers take 1.77 B over 125 turns (14 M per turn), QA 372 M over 113, the architect 1.4 M over 2: long agent loops, not prompts, are the cost.
- **Timeout rework** *[run]* — the 11 timeout parks (D2) re-ran their flows through continuations, ~60 records.
- **Self-hostile tests** *[run]* — under load the `validate_cmd` tests that shell out to `factory.ts validate` die at their 5 s timeout (`00760`).
- **Fallback spin** *[run]* — 115 turns needed a fallback hop, 113 of them QA on one effort error (D3).
- **Late conflicts** *[run]* — 9 merge conflicts with 9 resolve turns; 9 merges went red only at merge checks.
- **Dispatcher tail** *[run]* — near the end, with 22 tasks open, 1 of 3 slots was busy (one observation).

## 4. Stack inefficiencies

- **Size** — since `2773bd20`: source 56.7k → 60.5k lines, tests 109.9k → 120.0k; tests are 1.98× the source. The kernel is 82% of the source, 291 files; 14.5% of source lines are comments.
- **The 500-line file cap splits files instead of shrinking them** *(inference)* — the ten largest files sit at 499–500 lines, the allowlist is empty, and 66 test files carry numbered or continuation names.
- **Hand-rolled where a library exists** — line diff (`src/kernel/intent.ts`, 466 lines), run lock (`src/cli/lock.ts`, 321, see D4), CLI parsing (`src/cli/dispatch/args.ts`, 144), front matter (`src/harness/lsp/frontmatter.ts`, 280). No logger.
- **Duplicates** — same-name helpers in several files (`walk`, `recordPath`, `bySeq` ×4; `oneLine`, `isTaskTurn`, `isENOENT`, `costOf` ×3). `scripts/duplicate-helpers.ts` catches only verbatim bodies of 100+ characters.
- **Status rewrite** — every status write re-lists records and re-derives the goal (`src/kernel/status.ts:215-216`); prices load on the same path with no fetch timeout and no back-off (`src/kernel/openrouter.ts:136`).
- **Merge setup** — every merge check and every baseline runs the full repo setup in its worktree (`src/kernel/integrate/merge-checks.ts:94`, `baseline.ts:248`).
- **Repository** — `.git` is 122 MB; deleting `docs/runs` did not shrink history. The largest tracked file is the prompt snapshot (`test/kernel/__snapshots__/prompts-snapshot.test.ts.snap`, 230 KB).

## Not reviewed in depth

[[StewardMergeLadder]], [[MechanicalCommitsAndHashContext]], [[PreserveRepoHarnessSetup]], [[SessionPortability]], [[EndOfSessionCompaction]], [[GatedWarmStarts]], [[WorkspaceCleanlinessHeuristic]], [[DefaultTaskFlow]], [[ArtifactStorageBackends]] beyond D6–D7, and the decision logic in `steward/` and `gates-normalise.ts`.
