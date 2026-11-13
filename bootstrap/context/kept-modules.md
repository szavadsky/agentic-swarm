# Kept modules (slice P)

State after pruning the rejected v2 design: 50 src files, ~9.0k LOC (was 90 files / 26.1k) and
29 test files, ~5.0k LOC (was 107 / 36.6k). `bun run typecheck` and `bun test` are green.
Everything below compiles without `core/artifacts.ts` or `config/schemas/**`. LOC are indicative.

## Harness

| Module | LOC | Exported API | Gotchas / tests |
|---|---:|---|---|
| `src/harness/types.ts` | 88 | `ModelRef`, `Caps`, `Stop`, `Usage`, `SessionRef`, `TurnRequest`, `TurnResult`, `Harness` | Kernel contract from KERNEL0 §4 + advice:96-143. `ModelRef = {id, effort?}` is the one shape the advice leaves open. `Stop.infra` is separate from task failure. `Harness.caps` is async; `compact` optional. |
| `src/harness/fake/fake-harness.ts` | 169 | `FakeHarness`, `fakeTurnResult`, `emptyUsage`, `DEFAULT_FAKE_CAPS`; types `FakeHarnessOptions`, `FakeTurnHandler`, `FakeTurnContext` | One handler per `turn`, FIFO. Handler writes files under `req.cwd` and `ctx.writeOutcome`; session ids created/resumed automatically; every Stop cause passes through. `test/fake-harness.test.ts`. |
| `src/harness/omp/*` | 1,660 | `OmpHarness`, `OmpNdjsonParser`, `classifyOmpOutcome`, overlay helpers; private v2 contract in `contract.ts` | Still on the v2 `AgentRun/AgentOutcome` contract (`contract.ts`) and `OmpPipelineConfig`; S1 moves it to `harness/types.ts`. Uses `core/config/{roles,ajv}`, `cli/lock`, `proc`, `shutdown`, `clock`, `runtime-tmp`. `test/harness/{omp-harness,ndjson,classify,overlay}.test.ts`. |

## Git and worktrees

| Module | LOC | Exported API | Gotchas / tests |
|---|---:|---|---|
| `core/git/exec.ts` | 135 | `git`, `GitError`, `GitOptions`, `GitResult` | All git goes through `runProcess`; `allowFail` returns code instead of throwing. `test/git-exec.test.ts`. |
| `core/git/repo.ts` | 46 | `Repo`, `RepoOptions` | Holds main root, worktree root, per-key merge locks, `identityEnv()`. |
| `core/git/naming.ts` | 111 | `SLUG_REGEX`, `RESERVED_SLUGS`, `validateSlug`, `assertValidSlug`, `parseBranch`, `taskBranch`, `childBranch`, `worktreePath` | Epic depth 2; reserved slugs (`simple`, `task`). `test/git-naming.test.ts`. |
| `core/git/worktrees.ts` | 224 | `ensureTaskWorktree`, `ensureChildWorktree`, `removeWorktree`, `resetScratch` | Root worktree path from branch with `/` → `_`. `test/git/worktrees.test.ts`. |
| `core/git/commit.ts` | 92 | `commitAll`, `headOf`, `isAncestor`, `areFilesCommitted` | Mechanical commits only; staging is `add -A` scoped by caller path. `test/git/commit-and-guard.test.ts`. |
| `core/git/guard.ts` | 76 | `captureHead`, `enforceHead`, `EnforceHeadResult` | Head-guard mechanics; failures are returned, not thrown. `test/git/commit-and-guard.test.ts`. |
| `core/git/merge.ts` | 273 | `treeOf`, `unmergedFiles`, `hasConflictMarkers`, `scanConflictMarkers`, `mergeParentInto`, `concludeMerge`, `mergeChildIntoParent` | Conflict-marker scanning is text-level; callers decide park/retry. `test/git/merge.test.ts`. |
| `core/git/repair.ts` | 93 | `repairWorktree` | Startup repair; assumes branch checked out in the worktree. `test/git/repair.test.ts`. |
| `core/git/diff.ts` | 222 | `matchGlobs`, `untrackedFiles`, `changedFiles`, `numstat`, `changedLines`, `diffText`; types `ChangedFile`, `NumstatEntry`, `ChangedLinesResult` | Rebase-safe range helpers; callers pass explicit bases. `test/git-diff.test.ts`. |
| `core/git/status.ts` | 75 | `porcelainStatus`, `isStatusDirty`, `parseWorktreeList`, `StatusEntry` | Porcelain v1 `-z` parsing, rename pairs. |
| `core/git/cleanliness.ts` | 68 | `isCleanlinessIgnored`, `findDirtyEntries`, `CleanlinessOptions` | .factory/runtime paths ignored. |
| `core/git/untracked-lines.ts` | 34 | `countUntrackedLines` | Counts text lines only. |
| `core/git/index.ts` | 61 | Re-exports the above | Import the barrel unless testing a leaf. |

## Runtime, checks, prompts, records

| Module | LOC | Exported API | Gotchas / tests |
|---|---:|---|---|
| `core/proc.ts` | 306 | `runProcess`, `capOutput`, `HeadTailBuffer`, `TailRing`, `RunProcessOptions`, `ProcessResult` | Process-group spawn, shutdown registration, suspend detection. `test/proc.test.ts`. |
| `core/shutdown.ts` | 183 | `registerChildGroup`, `unregisterChildGroup`, `getActiveChildGroups`, `registerActiveStep`, `unregisterActiveStep`, `getActiveSteps`, `terminateChildGroup`, `terminateAllChildGroups`, `markActiveStepsInterrupted`, `installShutdownHandlers`; `ActiveStepRecord` | `getUsage` now returns the kernel `Usage`; interrupted markers write `session`/`usage` back to meta. |
| `core/mutex.ts` | 123 | `AsyncMutex`, `KeyedMutex`, `Semaphore` | Async in-process locks only. `test/mutex.test.ts`. |
| `core/clock.ts` | 89 | `Clock`, `defaultClock`, `getClock`, `setClock`, `resetClock`, `detectSuspend`, `createActiveTimer`, `DEFAULT_SUSPEND_THRESHOLD_MS` | Injectable clock for tests; suspend threshold. |
| `core/journal.ts` | 47 | `appendJournal`, `readJournal`, `JournalEvent` | NDJSON at `<taskDir>/journal.ndjson`; append-only. |
| `core/runtime-tmp.ts` | 70 | `initFactoryRuntimeTmp`, `getFactoryTmpDir`, `RuntimeTmpHandle` | Sets TMPDIR/TMP/TEMP; purges old entries. `test/runtime-tmp.test.ts`. |
| `core/disk-space.ts` | 266 | `checkDiskSpace`, `assertDiskSpace`, `resolveDiskSpaceTargets`, probe get/set/reset, `defaultDiskSpaceProbe`, `findExistingAncestor`, `DEFAULT_MIN_FREE_DISK_MB`, `LowDiskSpaceStopError`; types `DiskSpacePipelineConfig`, `DiskPathCheck`, `DiskSpaceCheckResult` | On shortage writes journal + `low-disk-space.yaml` then throws `LowDiskSpaceStopError`; pipeline slice is `{limits.minFreeDiskMb}`. `test/disk-space.test.ts`. |
| `core/checks/types.ts` | 122 | `CheckContext`, `CheckResult`, `CheckProjectConfig`, `CheckPipelineConfig`, `CheckLimits`, `CustomCheckConfig`, `InfraGate`, `TestRunnerConfig`, `InfraArtifact`, `GateBaselineEntry`, `GatesBaselineArtifact`, `DeveloperTarget`, `tailCap` | Local check-domain types replace the deleted artifacts module; context config fields are structural. |
| `core/checks/runner.ts` | 1,404 | `runCheck`, `isUnknownGateTargetError`, `TargetCheckDetail` | Built-in checks by name; target red/green expects a commit; writes JUnit under temp. `test/checks/*`. |
| `core/checks/gates.ts` | 719 | `runGates`, `snapshotWorktree`, `checkAndRestoreWorktreeMutation`, `isTestRunnerGate`, `gateTimedOut`, `rederiveBaselineFailingTests`, `buildGateDiffSection`, `GATE_TIMED_OUT_MARKER`; types `WorktreeSnapshot`, `WorktreeMutation` | Retries/flaky handling, mutation snapshot/restore, disk guard. `test/checks/gates.test.ts`. |
| `core/checks/junit.ts` | 262 | `parseJunit`, `validateTestRunner`, `buildTargetCommand`, `buildGateWithJunitCommand`, `sanitizeDeveloperTarget`, `shellQuote`, `isPositionalSelector`; types `ParsedJunit`, `ParsedCase` | pytest node-ids must stay positional even when `selectorArgs` is set. `test/checks/{junit-and-targets,pytest-selectors}.test.ts`. |
| `core/checks/gate-target.ts` | 128 | `resolveGateTarget`, `normalizeDeveloperTarget`, `normalizeGateCommand`, `formatKnownGateTargets`, `GateTargetSource` | Resolves gate id or recorded command, word-boundary extensions. `test/checks/gate-target-resolution.test.ts`. |
| `core/checks/setup.ts` | 78 | `runWorktreeSetup`, `SetupResult` | Runs `infra.setup` commands sequentially. |
| `core/prompts.ts` | 399 | `loadPromptLibrary`, `renderStepPrompt`, `resolveAgentTools`, `formatHumanInvolvementCriteria`, `FILE_TOOL_IDS`, `PromptLibrary`, `HumanInvolvement`, `PromptPipelineConfig` | Partial includes `{{> _shared/x}}`; missing variables throw; criteria/preflight/step lists were removed with v2. `test/prompts.test.ts`. |
| `core/records/io.ts` | 39 | `writeTextAtomic`, `writeYamlAtomic`, `readYaml`, `readText` | Atomic temp+rename; creates parent dirs. `test/records-and-fingerprint.test.ts`. |
| `core/records/schema-format.ts` | 123 | `formatOutputSchemaSection` | Two-level JSON-schema rendering for outcome prompts. |
| `core/fingerprint.ts` | 50 | `normalizeText`, `fingerprintText`, `fingerprintObject` | Lowercases by default; sha1. `test/records-and-fingerprint.test.ts`. |

## Domain state

| Module | LOC | Exported API | Gotchas / tests |
|---|---:|---|---|
| `core/concern-types.ts` | 95 | `Concern`, `StoredConcernArtifact`, `ConcernSource`, `ConcernCounts`, `ConcernConfirms`, `RemarkableDecision`, `ReviewSuggestion`, `ReviewDisposition`, `ConcernKind/Severity/Status`, `PendingConcernResolution` | Persisted YAML shapes; keep in sync with on-disk `concerns/*.yaml`. |
| `core/concerns.ts` | 369 | `aggregateConcerns`, `listConcerns`, `listOpenConcerns`, `countConcerns`, `listConcernIds`, `applyConcernTriage`, `applyCloseupResolutions`, `applyConcernConfirms`, `applyConcernResolution`, `applyWaveCloseupFallback`, `partitionSuggestions`, `concernFingerprint`, `severityAtLeast`, `DEFAULT_RAISE_ALLOWLIST`; types `ConcernInput`, `ConcernStoreContext`, `ConcernWriteContext`, `ConcernResolution` | Fingerprint = kind + normalized summary + location; merging keeps the longer detail; mutations commit through `Repo` when provided. v2 record reconciliation was deleted (derive owns it). `test/concerns.test.ts`. |
| `core/budget.ts` | 129 | `BudgetTracker`, `BudgetLimits`, `SpendTotals`, `BudgetCheckResult` | In-memory only; disk spend scanning was v2-record-specific and deleted. `Usage` maps cached input to input and reasoning to output. |
| `core/steer.ts` | 127 | `listPending`, `takenPaths`, `writeQuestion`, `questionBlocks`, `SteerQuestion` | Mailbox primitives only; classification via `harness.complete` was removed. Stable question ids and no clobbering. `test/steer.test.ts`. |
| `core/config/ajv.ts` | 27 | `createAjv`, `formatAjvErrors` | Kept for the omp adapter; only strict-off Ajv setup. |
| `core/config/roles.ts` | 120 | `resolveRole`, `RoleDefinition`, `ResolvedRole` | Alias-chain + BFS fallbacks with cycle detection. `resolveStepRole` was v2-flow-specific and removed. Used by the omp overlay and adapter. |

## CLI

| Module | LOC | Exported API | Gotchas / tests |
|---|---:|---|---|
| `src/cli/dispatch.ts`, `index.ts` | 75 | `dispatch`, `parseCliArgs`, `ParsedArgs` | Only help/version/unknown until S0 re-adds `run`; arg parsing keeps `--repo`. `test/cli/cli.test.ts`. |
| `src/cli/lock.ts` | 264 | `acquireRunLock`, `isRunLockFree`, `getRunLockPath`, `resolveRuntimeDir`, `isProcessAlive`; types `LockData`, `RunLockHandle`, `AcquireRunLockOptions` | Locks live in `{worktreeRoot}/.factory-runtime/locks`; atomic `wx` + dead-PID takeover on the same host. `test/cli/cli.test.ts`. |

## Deleted but likely wanted later (readable via `git show main:<path>`)

- Derived state: `core/derive/{task,item,wave}.ts` — v2 record layout, but the status/queue rules are reference for `src/kernel/derive`.
- Triage and routing: `core/triage.ts`, `agents/criteria/triage.md`, `agents/triage.md` — task-kind/size routing; the kernel's front agent replaces it.
- Review policy: `core/review-policy.ts`, `agents/criteria/dispositions.md` — disposition allowlists; last-round decision is kernel-0 scope.
- Config: `core/config/{loader,merge,validate}.ts` + `config/schemas/**` + `config/pipeline.default.yaml` — 21-schema Ajv layer is rejected; role resolution survived. S4 builds the three-layer config.
- Sessions: `core/sessions.ts` — resume/hot-cold policies; S1 puts session stores outside worktrees.
- Record discipline: `core/records/{step-record,repair,schema-cache,review-schema,citations}.ts` — schema repair is rejected, but `step-record` dir naming and append-only IO inform S0's store.
- Execution: `core/flows/*`, `core/engine.ts`, `core/plan/*`, `core/brief.ts`, `core/loops.ts` — rejected loop design; keep only as negative reference.
- Human-involvement presets: `agents/criteria/human-involvement.md`; the section selector survives in `formatHumanInvolvementCriteria`.
- Step prompts: `agents/**` (except `agents/_shared/`) — S3 writes the new prompts/partials; `_shared/` remains as source material.
- v2 baselines: `docs/runs/**` and `docs/spikes/**` are intentionally kept and reference deleted paths; `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION.md`, `docs/records/**`, `docs/FIRE_TEST.md`, `docs/inspection.md`, `docs/OMP_ADAPTER.md` were deleted.

## Repo-root material left untouched but now stale

- `docs/factory.v2.md`, `docs/adr/**`, `docs/dev-process.md`, `docs/dev-process-diagram.svg` — v1/v2 design; `manifesto.md:94` calls the ADRs non-binding. Do not cite as current.
- `agents/skills/factory-selfhost/SKILL.md` — runbook for the removed `engine.ts`/`factory run` command; rewrite in S3/S4 when the kernel command lands.
- Root `skills/` is empty; the package runbook `plugins/software-factory/skills/factory-run-target/` was deleted with the v2 CLI.
- `.omp/lsp.json` maps the deleted `config/schemas/**`; its editor mappings are inert until S4 adds the new config schema.
