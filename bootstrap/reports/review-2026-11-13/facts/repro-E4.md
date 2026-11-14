# Repro E4 — first signal does not stop dispatch admission

| claim | reproduced | test file path | command | key output |
|---|---|---|---|---|
| First SIGINT/SIGTERM should "stop dispatching, let in-flight turns finish", but `runDispatch` never reads the drain controller, so queued tasks keep being admitted after the signal. | **yes** | `/tmp/review-swarm/ReproE4/tree/plugins/software-factory/test/kernel/repro-e4.test.ts` (new file, scratch copy of `b4a2d9f`) | `cd /tmp/review-swarm/ReproE4/tree/plugins/software-factory && bun test test/kernel/repro-e4.test.ts` | see below |

```
goal demo: active, 1 iteration(s), stop=interrupted
test/kernel/repro-e4.test.ts:
error: expect(received).toEqual(expected)
- []
+ [ "beta", "delta", "gamma" ]
(fail) repro E4 ... [1307.74ms]
 0 pass
 1 fail
 2 expect() calls
```

Diagnostics written by the test (`calls` = FakeHarness turn log, `signalTurn` = call index):

```
calls: 3 alpha implement | 4 alpha review | 5 beta implement | 6 delta implement
7 beta review | 8 delta review | 9 gamma implement | 10 gamma review
signalTurn: 3, implementStart: alpha@3, beta@5, delta@6, gamma@9
records: alpha/beta/delta/gamma each have implement+commit+checks+review+merge
exit: 130, controller.draining: true
```

## What exactly was observed

- Harness call 3 is alpha's implement turn (concurrency 1, four disjoint tasks alpha/beta/gamma/delta filed by the scripted PM). Inside that turn the test calls `controller.handleSignal("SIGINT")` — the same `DrainController` instance passed to `dispatch(["run",...], {signals: controller})`, i.e. the object `runGoal` uses at `launch.ts:208`.
- After that signal, `runDispatch` kept admitting work: beta implement (call 5), delta implement (6), beta/delta review (7,8), gamma implement (9), gamma review (10), plus commit/checks/merge records for all three, all inside the same dispatch loop and iteration.
- All four tasks ended merged; the launch only stopped after `runDispatch` returned, when `launch.ts:346/360` read `signals.shouldStop()`. Exit code 130.
- Test asserts the documented behavior (`furtherTasks === []`) and fails with `["beta","delta","gamma"]`; `expect(controller.draining).toBe(true)` passes, so the controller state was correct while admission continued.
- Static corroboration at `b4a2d9f`: `runDispatch` (`plugins/software-factory/src/kernel/dispatch.ts:148-151`) takes only `runtime` and `DispatchOptions` — grep finds zero occurrences of `signals`/`DrainController`/`shouldStop` in `dispatch.ts`. Its local `drain` variable (`dispatch.ts:167`) is only set by turn/wall/USD limits and steer holds (`dispatch.ts:292-308`), never by the signal controller.
- `shouldStop()` is read only outside dispatch: `launch.ts:251` (before an iteration), `launch.ts:300` (before `runDispatch`), `launch.ts:346` and `launch.ts:360` (after it).
- Doc promise: `signals.ts:6` "First signal: stop dispatching, let in-flight turns finish"; handler branch `signals.ts:31-34` (first signal sets `draining`, warns "no new dispatch"). Implementation `shouldStop()` at `signals.ts:57-59` simply returns `draining`.
- Concurrency 1 was still honoured: no two agent turns overlapped (calls are sequential in the harness log); the admitted tasks ran one after another.

## What the existing signals test does and does not cover

`test/kernel/signals.test.ts` (166 lines, 3 tests):

1. `drains on the first signal and aborts on the second, without OS signals` (line 65): calls `controller.handleSignal` directly and asserts `draining`, `aborted`, `interruptedBy`, `shouldStop()` and SIGINT listener install/uninstall plus console text. Covers controller state machine only; never runs dispatch.
2. `stops dispatching after a drain request and writes the summary` (line 93): raises SIGINT inside the **architect** turn, before dispatch exists (`handleSignal` at line 100), then asserts exit 130, `harness.calls` length 2 (architect + PM) and summary `stopped-with-debt`. It proves the pre-dispatch guard at `launch.ts:300` works; because the signal lands before `runDispatch` is called, no task turn exists to observe admission. It does not raise a signal while a task is in flight.
3. `records the partial usage a cancelled turn returns` (line 128): two SIGTERMs inside the architect turn, cancelled stop, asserts usage accounting. Also pre-dispatch.

Does not cover: a first signal during `runDispatch` (in-flight task turn); whether queued tasks are admitted afterwards; any assertion that admission stops when `draining` flips. No test in the file drives a signal into a running dispatch loop, so the gap E4 names is untested.
