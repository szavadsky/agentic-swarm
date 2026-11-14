# REV — adversarial review of kernel-0

Method: manifesto Intent + KERNEL0 §3/5/6/7, all of `src/kernel`, harness types/fallback/adapters,
all prompts, all `test/kernel`. Baseline green: 323 pass / 4 skip / 0 fail (327 tests, 36s), `tsc`
clean. Throwaway probes (in /tmp, uncommitted): P1 hostile derive/next sequences; PA merge-crash
through recoverLaunch+dispatch; PB red-base surfacing; PC infra vs independent task; PD rogue-agent
containment. Product of this assignment is this file only; no code changed.

1. `integrate.ts:62-90` + `recovery.ts:13-35` — proven. Crash between ref-move and end record:
recoverLaunch (always runs first) seals the open merge as endedAt+ok:false; recoverOpenMerge filters
`!endedAt` so never matches post-sealer; derive parks "merge failed without a recorded cause" while
the ref already moved (PA: parked, head==planned, 0 merge-ok). Merged work then needs a new slug
whose diff is empty → second no-progress park. Fix: match sealed infra-crash merge records carrying
a commit, or exempt commit-carrying merge starts from the sealer. `merge-recovery.test.ts:48-108`
skips recoverLaunch, so it passes while production fails — route one case through it.
2. `dispatch.ts:146-179` + `flow.ts:70` + `launch.ts:188-218` — proven. The first infra turn sets
stop and every later step/checks/merge candidate is skipped; one rate blip ends the whole dispatch
(PC: reason infra, 1 call, independent taskB 0 records). Relaunch to retry costs a full extra
architect turn. Fix: confine infra to the faulted slug for the iteration, end infra only when
nothing is dispatchable. Scenario 4 needs a two-task variant.
3. `baseline.ts:87-112` vs `context-pack.ts:52-131`, `flow-context.ts:169`, `integrate.ts:184-195`,
`reviewer.md:19` — proven. Red base is written and never read (zero readers; PB). Pack has no
baseline field; first-turn `baseline_checks` is branch checks ("none" on r1) though labeled
"failures here are pre-existing"; implementer burns itemTurns on pre-existing red, reviewer may
reject on a failing gate, merge parks `gates:…` with no baseline attribution. KERNEL0 §6 "do not
block unrelated merges" unmet. Fix: pack + implementer vars carry base gate state; merge compares
merged-result gates against it before parking.
4. `flow.ts:112-164` vs `implementer.md:15` ("branch switch or change outside the worktree rejects
the turn") — proven gap. No post-turn validation exists (only `worktree.ts:72` checks the goal
checkout at setup); PD wrote OUTSIDE.txt + switched to branch rogue → accepted, phase→review, 0
parks, outside file persists. Outside edits bypass mechanical commit, tree fingerprints and loop
detection; merge later parks no-progress on the wrong branch. Fix: after settle assert HEAD branch
== task branch and porcelain clean outside worktree, else park.
5. Invariant gaps, proven by code, impact suspected: `taskHash` written (`flow.ts:145`, `merge-
attempt.ts:105`) never read — advisory "validator compares material hash; mismatch on done slug
errors" unimplemented; mid-iteration edits silently adopted (pending) or ignored (merged, P1.4);
only PM reconcile guards, at boundaries. No empty-diff skip-reviewer (advice §5): no-op implement
consumes review rounds, caught late as merge no-progress park. No stall exit (advice: 2 iterations,
no merge/finding/plan-change → owner): runs to the iteration limit. No $ brake: costUsd tracked
only; `core/budget.ts` has zero importers; overflow has no de-novo path. `attempts` recorded per
turn, never read in production. `addUsage`/`zeroUsage` triplicated (`harness/usage.ts`,
`agent.ts:42`, `summary.ts:26-41`) with divergent undefined-cost handling. Over ~250 lines:
`types.ts:309`, `config.ts:305`, `derive-task.ts:252`. `ensureLayout` writes no `.gitignore` for
artifactRoot — goal records committable by a stray add (sessions/transcripts safe: outside repo,
`preflight.ts:166-171`). `turnsUsed` (`dispatch.ts:114`) counts architect+PM+infra records toward
optional iterationTurns, so tiny limits drain before any task runs. Empty scope unchecked by
validateTaskGraph and skipped by overlapsRunning — concurrent same-file edits (contained later by
conflict→park).
6. Loops and money, each bound: outcome repair ×1 then failed→park (`agent.ts:160-184`);
reviewRounds with last-round changes→merge-with-debt (`next.ts:69`, `derive-task.ts:199-209`);
branch-gate fail→retry from step 0 bounded by itemTurns (`derive-task.ts:106-117`, `next.ts:78`);
merged-gate fail→1 fix then park (`derive-task.ts:127-139`); conflict→1 attempt then park; PM repair
×1→blocked (`pm.ts:210-217`); fallbacks retries=2 on one shared counter, not nested
(`fallback.ts:56-90`), though a repair opens a fresh chain (≤2 calls/step, constants); architect
exactly 1/iteration — single call site `boundary.ts:117`, one boundary per loop `launch.ts:183`, a
throw ends the launch; digest scout adds one digest-role turn on relaunch boundaries only. No-
progress is history-wide incl. A,B,A,B (P1.9, scenario9). Drain is optional; in-flight always
settles via wall timers. Persistent infra is bounded by finding 2's stop (at the price of the
iteration). No unbounded loop found.
7. Invariants, enforcement + test: (1) architect 1/iteration — above; `boundary-session.test.ts`.
(2) plan/task separation — architect-touch snapshot diff `boundary.ts:152-161`, PM reconcile
`pm.ts:90-96`; `pm.test.ts`. (3) done frozen, slugs immutable, rework=new slug — reconcile restores
frozen bytes; `tasks.ts` slug/file authority; gap: hash check missing (§5). (4) parked terminal,
base-continuation validated `tasks.ts:132-138`; branches never deleted, only worktrees; hand-made
cycle → both pending → boundary, no hang (P1.5). (5) state derived; script steps write records
(`record.ts`); `store/continuation/recovery` tests. (6) exactly one summary — once per loop plus
existence-guarded backfill (`summary.ts:192-207`); `crash-summary.test.ts`. Metrics copy in outbox
is uncalibrated data, acceptable. (7) one budget/item, no nested counters — itemTurns single
counter; multiplication is repair×chain constants only. (8) pinned build — no goal-tree code imports
(static); tension, sanctioned: `.factory/prompts` overrides and gate commands execute repo content
as config. (9) sessions/transcripts outside git — preflight rootFinding; gap: artifactRoot records
not gitignored (§5).
8. Prompts vs code: snapshot test pins exactly-documented vars and undefined var is a render error
(`prompts-snapshot.test.ts:69-88`, `core/prompts.ts:355-361`) — good. Stale/mislabeled:
`baseline_checks` (§3). Unenforced threat: `implementer.md:15` (§4). Wired correctly: `steer <id>:`
both sides (`mailbox.ts:221-228`, `architect.md:77`), `debt closed:` (`summary.ts:122-127`), digest
scout reads YAML with a YAML reader as prompted.

Verdict: do not launch this on its own repository yet. Finding 1 loses the merge/park distinction
exactly when a crash hits the narrow ref-move window — merged work reported parked, follow-up slug
guaranteed to no-progress park; finding 2 turns every transient rate blip into a lost iteration plus
a spare architect turn; finding 3 lets a red base silently tax every task and block unrelated
merges. Fix 1–3 (all small: widen the open-merge match, scope infra stop to the slug, thread
baseline state into pack/vars/merge-gate comparison), add the two-test coverage (merge recovery
through the sealer; two-task infra), then a shakedown on a toy goal with a deliberately red base and
a kill -9 inside the merge window is the gate I would require.

