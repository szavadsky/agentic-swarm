# Repro Medium B — E10, E12, E13 at b4a2d9f

Scratch: `/tmp/review-swarm/ReproMediumB-tree` (worktree of a no-hardlinks clone, detached at `b4a2d9f`; `bun install` done in `plugins/software-factory`). Each test was run alone with `cd /tmp/review-swarm/ReproMediumB-tree/plugins/software-factory && bun test <file>`.

## E10

- claim: a new steer whose content hash equals any previously processed steer is archived silently, with no architect turn and no outbox reply (mailbox.ts:125,144-146,172-181).
- reproduced at b4a2d9f: yes (at the mailbox gate every consumer reads)
- test file path: `/tmp/review-swarm/ReproMediumB-tree/plugins/software-factory/test/kernel/repro-e10-steer-dedupe.test.ts`
- command: `bun test test/kernel/repro-e10-steer-dedupe.test.ts`
- key output:

```
bun test v1.4.4 (38afee6c8)
E10 steers: [] processed: s0.md,s2.97fba3b3.md outbox: []
test/kernel/repro-e10-steer-dedupe.test.ts:
 1 pass
 0 fail
 5 expect() calls
```

- what exactly was observed: `mailbox/processed/s0.md` held "Please keep the API stable.\n"; `postSteer(store,"s2",same text)` wrote `mailbox/inbox/s2.md`; `scanInbox(settleMs:0)` returned `[]`, inbox was empty, the file was renamed to `mailbox/processed/s2.97fba3b3.md` (sha1 first 8, mailbox.ts:144-146,188-197), and `mailbox/outbox` stayed empty; a second scan also returned `[]`. Dedupe is by content over every file in `processed` (mailbox.ts:60-81), so any replay with the same normalized text is dropped before either consumer (`boundary.ts:118`, dispatch `pollSteers`) can see it; the only outbox writer writes one reply per returned `Steer` (boundary.ts:175-184), so no reply exists. The boundary's architect turn still runs for the iteration as usual, but the duplicate is never delivered to it (not in the pack vars, boundary.ts:164) and triggers no PM steer turn.
- what steer-guards changed: `mailbox.ts` was untouched by merge `7a16a07` (name-only: boundary.ts, dispatch.ts, launch.ts, pm.ts, two test files); the dedupe predates it (`f9dcd93`). steer-guards changed dispatch's seen-steer bookkeeping to boundary-supplied ids plus a settle window (dispatch.ts:170-175,210-231), but dispatch still calls `scanInbox`, so a fresh same-content steer is still archived silently there.

## E12

- claim: `readHolds` throws on a malformed hold file; holds are written by the steer-PM turn without validation or rollback and are never deleted, so one bad hold makes every dispatch throw on every launch (mailbox.ts:251-262; dispatch.ts:166,185; pm.ts:362-381).
- reproduced at b4a2d9f: partial — throws at `readHolds`, permanent per-launch wedge, but dispatch returns infra instead of throwing
- test file path: `/tmp/review-swarm/ReproMediumB-tree/plugins/software-factory/test/kernel/repro-e12-holds.test.ts`
- command: `bun test test/kernel/repro-e12-holds.test.ts`
- key output:

```
bun test v1.4.4 (38afee6c8)
E12 readHolds: hold file "s1.yaml" must be { slugs: string[], goal: boolean }
E12 dispatch1: infra | steer holds: hold file "s1.yaml" must be { slugs: string[], goal: boolean }
E12 dispatch2: infra | steer holds: hold file "s1.yaml" must be { slugs: string[], goal: boolean }
 1 pass
 0 fail
 11 expect() calls
```

- what exactly was observed: a scripted PM steer turn wrote `holds/s1.yaml` with `slugs: alpha, goal: maybe`; `runSteerPm` left it in place, wrote no `steer-reconcile` record, and `readHolds` then threw `hold file "s1.yaml" must be { slugs: string[], goal: boolean }` (mailbox.ts:259-262). Two successive `runDispatch` calls each returned `reason: "infra"` with the same `steer holds: ...` cause and made zero turns; the file was still present after both. No code path deletes hold files: `holdsDir` is only read (dispatch) and passed to the prompt as `holds_dir` (pm.ts:373,445); the steer turn's snapshot/restore covers only `plan.md` and task files (pm.ts:431-459), not holds, and no validation runs on hold contents after the turn. So the wedge is permanent across dispatches/launches, but at b4a2d9f it surfaces as an infra stop, not a thrown exception: steer-guards wraps both `readHolds` calls in try/catch (dispatch.ts:177-187 before any work; dispatch.ts:237-245 after a steer turn) and returns `reason: "infra"`; launch turns that into `ended = "infra"` and a stop (launch.ts:300-310). Line drift: pm.ts:362-381 is now the task PM turn; the steer turn is pm.ts:427-459.
- what steer-guards changed: added the two `readHolds` try/catch guards in dispatch.ts (infra return instead of throw), added the post-steer-turn `holdError` path (dispatch.ts:237-245, 279-283), threaded `seenSteers` through launch.ts (4 lines), and added `snapshotTurn`/`restoreTurn` for the steer turn plus the `steer-reconcile` record — plan and task files only, holds still unvalidated, unrestored and undeleted. It also added malformed-hold tests (steer-holds.test.ts:409,518).

## E13

- claim: `listTasks` throws on any unparseable task file and the launch loop's derive sits outside the try, so one half-written task file wedges every launch (store.ts:105-113; launch.ts:209).
- reproduced at b4a2d9f: yes
- test file path: `/tmp/review-swarm/ReproMediumB-tree/plugins/software-factory/test/kernel/repro-e13-tasks.test.ts`
- command: `bun test test/kernel/repro-e13-tasks.test.ts`
- key output:

```
bun test v1.4.4 (38afee6c8)
E13 direct: TaskFileError task "broken" has no --- frontmatter ---
E13 stack: at parseTaskFile (.../src/kernel/tasks.ts:35:15) \n at listTasks (.../src/kernel/store.ts:111:37) \n at async preflight (.../src/kernel/preflight.ts:186:34) \n at async runGoal (.../src/kernel/launch.ts:219:11)
E13 launch: TaskFileError task "broken" has no --- frontmatter ---
E13 launch: TaskFileError task "broken" has no --- frontmatter ---
 1 pass
 0 fail
 9 expect() calls
```

- what exactly was observed: with `tasks/broken.md` containing only `half-written task body with no frontmatter`, `store.listTasks()` rejected with `TaskFileError: task "broken" has no --- frontmatter ---` (store.ts:111 -> tasks.ts:35). Two consecutive `runGoal` calls each rejected with that same error while the file remained; the stack shows the first uncaught call is `preflight`'s `store.listTasks()` (preflight.ts:186, reached from launch.ts:219), i.e. before the loop, so no turn or iteration record was reached. `launch.ts:209` is `const uninstall = ...` at b4a2d9f, so that citation is stale. The loop's own derive at launch.ts:252 is before the inner `try` (launch.ts:257) inside an outer `try/finally` with no catch, and the inner catch rethrows (launch.ts:362-365), so there is no catch path for the derive either.
- what steer-guards changed: `store.ts`, `tasks.ts` and `preflight.ts` were untouched by merge `7a16a07`; launch.ts changed only by the 4-line `seenSteers` threading. pm.ts gained `snapshotTurn`/`restoreTurn` (pm.ts:431-459), which rolls back plan/task files written by a steer PM turn — so a malformed task file created by that one turn is undone — but any other unparseable task file (architect/agent write, crash, operator drop) still wedges every launch.
