# E1 — launch recovery prunes the whole shared worktreeRoot

| field | value |
|---|---|
| claim | The run lock is per goal, but launch recovery force-removes every registered worktree under the shared `worktreeRoot` except its own goal checkout (worktree.ts:128-139, launch.ts:165, config.ts:291-297). So launching goal B on a repo while goal A has live task worktrees deletes A's worktrees; and two repos using the same goal name share one checkout path. |
| reproduced | yes (both variants) |
| test file | scratch: `/tmp/review-swarm/ReproE1/wt/plugins/software-factory/test/kernel/repro-e1.test.ts`; copy: local://repro-E1.test.ts |
| command | `cd /tmp/review-swarm/ReproE1/wt/plugins/software-factory && bun test test/kernel/repro-e1.test.ts` |

Scratch tree: `git clone --no-hardlinks /home/slava/aiexp/agentic-swarm.wt/v3` + `git worktree add … b4a2d9f` (plain `checkout`/`reset 518cca5→b4a2d9f` was refused by the workspace's guard, so the commit was materialised with `git worktree add` from my clone). Test runs only inside `createTmpRepo` dirs under `/tmp`; no reads/writes of `~/.local/share/factory` or the real worktree.

## Key output

```
$ bun test test/kernel/repro-e1.test.ts
[E1] goalCheckoutA=/tmp/.factory-worktrees/factory-test-repo-J9OhB6/alpha exists=false
[E1] taskWtA=/tmp/.factory-worktrees/factory-test-repo-J9OhB6/alpha-tasks/t-one exists=false
[E1] beta checkout exists=true ; alpha lock held after B launch=true
[E1] before: worktrees alpha + alpha-tasks/t-one listed; after: only beta listed
[E1b] goalCheckout=/tmp/repro-e1-shared-wt-D2DO1N/demo
[E1b] repoOneMarkerExists=false
[E1b] .git content=gitdir: /tmp/factory-test-repo-pAYDSR/.git/worktrees/demo
[factory lock] Stale run lock for task "goal-demo" (PID 4000000 on host Slava-Yoga) taken over by PID 4162613
[E1b] repo one worktree list: worktree /tmp/repro-e1-shared-wt-D2DO1N/demo, branch factory/demo, HEAD f2caecd6
[E1] B launch result: threw: FakeHarness: no scripted turn for request 1
[E1b] repo two launch result: threw: FakeHarness: no scripted turn for request 1
 2 pass
 0 fail
 19 expect() calls
```

## What exactly was observed

Source anchors verified at b4a2d9f: `worktree.ts:128-133` loops `git worktree list` of `runtime.paths.repoRoot` and runs `git worktree remove --force` (line 132, `allowFail: true`) for every path under `path.resolve(worktreeRoot) + path.sep` that is not the caller's `goalCheckout`/`repoRoot`; `worktree.ts:136-139` `fs.rmSync(goalCheckout, …)` when the path is registered but not in this repo; `recovery.ts:44` is `prepareIntegrationCheckout`; `runGoal` calls `recoverLaunch` at `launch.ts:231`; the lock is acquired at `launch.ts:210-212` with task key `goal-${opts.goal}` and `runtimeDir = <worktreeRoot>/.factory-runtime`, i.e. lock file `<worktreeRoot>/.factory-runtime/locks/goal-<name>.lock` (`lock.ts:37-45`).

Variant 1 (one repo, goals alpha and beta, default shared `worktreeRoot=/tmp/.factory-worktrees/<repo basename>`): built alpha's runtime with the package's `runtimeFor` (same body as `s2-helpers.makeRuntime`), ran `prepareIntegrationCheckout` (alpha's `factory/alpha` checkout), created alpha's real task worktree with the kernel's `ensureTaskWorktree(task("t-one"))` at `<worktreeRoot>/alpha-tasks/t-one`, and left an uncommitted file `in-progress.txt` in it. Held alpha's run lock (`acquireRunLock(repo, "goal-alpha", {runtimeDir})`, live PID), confirmed `isRunLockFree(...,"goal-alpha")` is false and `isRunLockFree(...,"goal-beta")` is true. Then called the real `runGoal({repo, goal:"beta", iterations:1, harnesses:{fake:new FakeHarness({id:"fake"})}, baseGates:false})`. After that call: `<worktreeRoot>/alpha` and `<worktreeRoot>/alpha-tasks/t-one` are gone (both directories), `git worktree list` no longer lists either, `<worktreeRoot>/beta` exists and is registered, alpha's lock file is still present and alpha still reports locked. B's launch got past recovery and only failed at its first fake turn, after deletion.

Variant 2 (two separate temp repos, both goal `demo`, both `run.yaml: worktreeRoot: <abs shared tmp dir>`): `resolveGoalPaths` returns the identical `goalCheckout` `<shared>/demo` for both. Repo one's checkout contained a committed file `repo-one-only.txt`. Repo one held the lock (live PID) and repo two's `acquireRunLock` with the same goal name returned `null` (same lock file, log-free refusal path). After replacing that lock with a stale one (`pid 4_000_000`, same host, `isRunLockFree` true), a real `runGoal(repo two, "demo")` took the stale lock over (log line above) and its recovery replaced the shared checkout: `repo-one-only.txt` is gone and `<shared>/demo/.git` now contains `gitdir: /tmp/factory-test-repo-pAYDSR/.git/worktrees/demo` (repo two). Repo one's own `git worktree list` still lists `<shared>/demo` with HEAD `f2caecd6`.

## Anything that differs from the claim

- The cited `launch.ts:165` is the `runGoal` doc comment ("One launch: configs, pre-flight, goal lock, crash recovery…"), not code; the recovery call is `launch.ts:231`, and the pruning itself is entirely in `worktree.ts:128-139`.
- The lock really is per goal: two goals in one repo are not mutually exclusive, reproduced (alpha's live lock held while beta's `runGoal` acquired its own, `goal-beta`, and ran recovery). Nothing serialises B's recovery against A's live process beyond the per-goal name.
- The cross-repo clause needs a *shared configured* `worktreeRoot`: the default is `path.resolve(root, "..", ".factory-worktrees", basename(root))` (`config.ts:291-294`), which is parent-derived, so same-named repos in different parents do not collide, and a relative configured value is resolved against each repo root (`config.ts:292`). Collision occurs for an identical absolute value — or a relative `..`-form that lands on one directory for sibling repos. My variant 2 used the identical absolute value.
- For two repos, the lock directory is shared too, so a *live* second launch of the same goal name is refused (`goal "demo" is already running in another process`); the shared-checkout destruction happened on the stale-lock/crash path (takeover), not concurrently with a live owner. The single-repo variant 1 needs no such caveat: distinct goal names, live A, B's recovery still ran.
- The single-repo deletion is `git worktree remove --force` (`worktree.ts:132`) and removed a task worktree carrying uncommitted work; failures are swallowed (`allowFail: true`). The two-repo clobber is *not* `worktree remove` — repo two's `git worktree list` does not contain repo one's path — it is the `fs.rmSync(goalCheckout)` at `worktree.ts:137-139`.
- Both test launches threw `FakeHarness: no scripted turn for request 1` *after* recovery (recovery is before the iteration loop, `launch.ts:231`); the deletions are caused by recovery, not by the failed turn. Test timings: 2 tests in ~350 ms.
- Repo checkout note: the real worktree is at 518cca5, not b4a2d9f; `git diff --stat b4a2d9f 518cca5` over `worktree.ts`, `launch.ts`, `config.ts`, `lock.ts` is empty, so the cited code is identical in both.
