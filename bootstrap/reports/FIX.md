# FIX — repair the four proven REV findings

Worktree `factory-v3-fix`, commits `a1bf923` + `7ce1933` + this report. Kernel 16 files, +275/−30 LOC; tests 13 files (2 new), +395/−11; two prompt lines. No harness or core leaf-module changes.

## Fixes → REV finding → regression test

1. **REV §1 merge-crash sealer.** `recoverableMergeStart` matches a merge start carrying its planned commit when it is open or sealed `infra: crash`; `reduceTask` ignores sealed infra merge records; the ref-moved case now runs through the real `recoverLaunch`. Files: `kernel/integrate.ts`, `kernel/derive-task.ts`; tests: `merge-recovery.test.ts` ("completes the recorded merge after a crash..."), `shakedown.test.ts`.
2. **REV §2 infra stop.** `runDispatch` keeps a per-slug infra map for the iteration, skips only that slug, lets independent work continue, and reports `infra` only when nothing else is dispatchable. Files: `kernel/dispatch.ts`; test: `scenario4.test.ts` ("confines an infra stop to its slug...").
3. **REV §3 red base is read.** `recordedBaseGates`/`preexistingRed` feed the context pack, implementer/reviewer vars (the mislabeled `baseline_checks`), branch checks, `newGateFailures` merge comparison and the summary's `Base gates` section. New red still parks `gates:`; inherited red does not. Files: `kernel/{baseline,gates,record,flow,flow-context,boundary,context-pack,summary,integrate}.ts`, `prompts/{reviewer.md,VARIABLES.md}`; tests: `scenario5.test.ts` ("records a red base once..."), `context-pack.test.ts`, `shakedown.test.ts`.
4. **REV §4 rogue containment.** `containmentSnapshot`/`containmentViolation` (`kernel/worktree.ts`) run in every task step's settle and in the conflict implementer attempt: HEAD must still be the task branch; the main checkout must be byte-identical (HEAD + porcelain); the integration checkout must be clean unless its HEAD moved (a merge legitimately moves it). A breach skips the commit and parks the slug. Files: `kernel/{worktree,flow,merge-attempt}.ts`; test: `containment.test.ts` ("parks a turn that writes outside its worktree and switches branch").
5. **§5 items.** Artifact-root `.gitignore` (`kernel/store.ts`, `kernel/launch.ts`, `test/kernel/s2-helpers.ts`); `iterationTurns` counts task agent turns only, excluding architect/PM/infra (`kernel/dispatch.ts`); empty `scope` rejected by `validateTaskGraph` (`kernel/tasks.ts`); tests: `store.test.ts`, `dispatch.test.ts` ("does not charge architect, PM or infra records..."), `tasks.test.ts` ("rejects a task with no scope").

## Verified

- `bun run typecheck` clean.
- `bun test`: 331 pass / 4 skip / 0 fail (335 tests, 75 files), 38–44 s wall over five runs; baseline 323/4/0 at 36 s. 8 tests added, none dropped.
- Hostile shakedown test: red base, kill between ref-move and end record, relaunch → alpha `merged` (cause `recovered merge after crash`), beta merges, iteration-2 summary has `merged: alpha, beta`, `base-red` listed as `pre-existing; not attributed to tasks`, `main..factory/demo` = 2 commits.
- The shakedown launches through `runGoal`, so it exercises recovery through the real `recoverLaunch`; production and test no longer diverge.

## Choices / deviations

- Writes outside the repository (e.g. `/tmp`) are not detectable without a sandbox; containment covers the shared state the factory owns: task branch, main checkout, integration checkout. Sibling task worktrees are excluded because concurrent live turns legitimately change them.
- Pre-existing red is excused by gate name (the assignment's direction); a task changing an already-red gate's failure for a new reason is not distinguished. The reviewer prompt now carries the base state so it cannot reject on inherited red.
- `.gitignore` is `*` (it ignores itself), never overwrites an existing file, and is skipped when the artifact root is itself a git root. `s2-helpers` now passes the artifact root like `launch` does so containment sees production-like status.
- Fixed an adjacent dispatch race: a task settling during the record read was reported `boundary` with its next action ready; `runningAtRead` now re-derives.

## Shared files

- `plugins/software-factory/src/cli/commands.ts` (+3/−3): pass `path.dirname(goalDir)` to `createFolderStore` in init/steer/status. Everything else is in `src/kernel/**`, `test/kernel/**`, `prompts/**`.

## Next

Run the live shakedown the REV required (toy goal, free models, kill in the merge window). Backlog untouched as directed: stall exit, $ brake, overflow de-novo, empty-diff review skip, `taskHash`, usage dedup, file splits, `attempts` readers.

Surprise: the dispatch comment described the settling-task race it did not handle; the new settle timing made it deterministic in integration-e2e.
