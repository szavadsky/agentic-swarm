# Self-improvement campaign — operator runbook

For the operator session, at any model grade. Owner intent: `INTENT.md`. Requirements of the current phase: `Phase1.md`. Journal: `bootstrap/LOG.md`.

Paths: `V3=/home/slava/aiexp/agentic-swarm.wt/v3` (branch `factory-v3`), `MAIN=/home/slava/aiexp/agentic-swarm` (branch `main`), `PIN=$HOME/.local/share/factory/pins/current`, goal dir `$V3/.factory/artifacts/<goal>`.

## Role

The operator does six things:
1. Keeps `INTENT.md` the owner's consolidated intent: owner input only, latest wins, no history.
2. Decides which subset of the intent is the current phase, as requirements in `Phase1.md`.
3. Launches, lands (`factory/self` → `factory-v3` → `main`), promotes.
4. Recovers from major issues (table below).
5. Reports bugs and incidents to the architect as steers: what was observed, with evidence.
6. Reports to the owner.

The architect owns the rest: evaluating the project against the intent (mechanical solidity and agentic behavior), the plan, milestones, order, scopes, spikes — including spikes into previous sessions' behavior.

The operator never:
- edits `plan.md`, task files, prompts or kernel code (recovery excepted);
- tells the architect what to build first, how to split, which files to touch, or how long a plan may be;
- judges plan or task design, or re-prioritises planned work;
- hand-writes factory deliverables (features, docs, dashboard, skill).

## Stages

| Stage | Goal | Ends when |
|---|---|---|
| A. Phase 1 | `self`, intent = `Phase1.md` requirements | the evidence listed in `Phase1.md` exists |
| B. Standalone tasks | two small goals (below) | both merged or correctly escalated |
| C. Everything | `self`, intent = the whole of `INTENT.md` | architect `done`, benchmark run, owner confirms |

## One iteration

1. Nothing live: `pgrep -af "factory.ts run"` prints nothing; `git -C $V3 status --short` is empty.
2. `$V3/bootstrap/promote.sh > /tmp/promote.log 2>&1`.
3. Launch in the background with no deadline; the result is delivered on exit. Never poll.
   ```bash
   bun run $PIN/bin/factory.ts run --repo $V3 --goal self --run-config $V3/bootstrap/run/self.yaml --iterations 1 > /tmp/self-iN.log 2>&1; echo "exit=$?"; tail -4 /tmp/self-iN.log
   ```
4. On exit: triage (next section). Exit 3 = normal; 0 = done; 2 = blocked; 1 = failure; 130/143 = signal.
5. Land:
   ```bash
   git -C $V3 merge --no-ff factory/self -m "merge self-run iteration N: <merged slugs>"
   (cd $V3/plugins/software-factory && bun run typecheck && bun test) > /tmp/landN.log 2>&1
   git -C $MAIN merge --no-ff factory-v3 -m "land factory-v3: iteration N"
   ```
6. Journal in `LOG.md`: numbers from the summary, operator acts, owner decisions. Drop steers (if any). Commit, merge to `main` again, promote, launch the next.
7. Report to the owner: merged / parked (cause) / cost / next, plus the summary's "achieved" and "of concern" lines, with a link to the summary.

## Triage: facts, not judgement

Run it inside `checkpoint` … `rewind`; give deep reads of records or transcripts to a `scout`/`task` subagent. Keep only:
- exit code; merged, parked (with cause), cancelled and pending counts; the cost table; base gate state;
- `forward` lines addressed to the operator (e.g. "ready for the interrupt test");
- an assumption in the summary that contradicts a line of `INTENT.md` — quote both;
- incidents: infra failures, parks whose cause is not the task's own work, repair turns that repeat, turns that ended without delivering, anything that held dispatch, a flaky test at promote. One line each, with the record id.

Do not evaluate the plan, the task split or the code. That is the architect's consult.

## Steers

Until `Phase1.md` R23 is built and shown live, drop steers between runs only: a steer during a run holds dispatch.

Incident report (observations only):
```markdown
# Incident report — iteration N (operator)
Observed, not prescribed; what to do about it is yours.
- <what happened> — evidence: <record id, path or log line>
```

Intent change:
```markdown
# Intent change — <date>
`INTENT.md` changed in <section>: <one line>. Diff: `git diff <old>..<new> -- INTENT.md`.
```

A question the architect asked (exit 2): answer only when `INTENT.md` or `Phase1.md` answers it, quoting the line; otherwise ask the owner.

## Recovery: major issues only

| Symptom | Act |
|---|---|
| Launch cannot start, or exits 1 before its first record | Read the log tail. Environment (lock, stale worktree, auth, quota): fix it, relaunch. Kernel defect: smallest fix with a test on `factory-v3`, journal it, report it as an incident. |
| `promote.sh` fails | Rerun once. Fails again: do not promote; incident report with the failing test names; launch from the previous pin. |
| Gates red after merging `factory/self` | Rerun once. Still red: do not land on `main`, do not promote; incident report; launch from the previous pin. Not fixed by that iteration → stop and report. |
| Merge conflict `factory/self` → `factory-v3` | `git merge --abort`; stop and report. |
| Run must be stopped | One `pkill -INT -f "factory.ts run"`; wait for the exit; journal; incident report; relaunch. |

Stop and report to the owner, do not relaunch: two consecutive iterations with 0 merges; one iteration over 8 h; the same failure twice in a row; an architect turn that does not deliver twice in a row.

Every recovery act is journaled and reported as an incident, so the architect owns the proper fix.

## Operator launches

- Interrupt test (after the architect's `forward` says relaunch is ready): during a launch with at least one task running and one queued, send one `pkill -INT -f "factory.ts run"`, wait for exit 130, relaunch the same command. Journal the first record ids of the relaunch.
- Small goals (after `forward` says the trivial and task paths are ready), one at a time, no `self` run live:
  ```bash
  bun run $PIN/bin/factory.ts init --repo $V3 --goal p1-trivial --intent /tmp/p1-trivial.md
  bun run $PIN/bin/factory.ts run  --repo $V3 --goal p1-trivial --run-config $V3/bootstrap/run/self.yaml --iterations 1 > /tmp/p1-trivial.log 2>&1
  ```
  Suggested intents — pick another small one if these are already done: trivial, *"Remove the unused `Caps.fork` flag from the harness types and adapters; gates stay green."*; task, *"Make the omp cache TTL a run-config key (default `short`) passed to the omp adapter; covered by a test."* Land `factory/<goal>` like `factory/self`. A misclassification is an incident, never a hand-written `class.yaml`.
- Stage B goals: `t-retention` — *"Session/transcript pruning keeps every transcript a record cites; covered by a test."*; `t-hygiene` — *"After implement, a cleanliness check flags new file extensions, oversized files and many added files; the author gets one follow-up prompt to fix or justify."* An escalation to bigger is a valid outcome.
- Benchmark (`bootstrap/benchmark/README.md`, ~7 h): once at the end of Phase 1.

## Stage C: the whole intent

Replace `$V3/.factory/artifacts/self/intent.md` and its versioned copy `bootstrap/goal-self/intent.md` with:

```markdown
# Goal — the factory completes itself (stage: everything)

## Intent
`INTENT.md` at the repository root binds, whole. Phase 1 holds. Read the intent against how previous iterations behaved (logs, records, sessions) and against the code, and make sure the entire intent is built, tested and documented.

## Particular to this goal
- The factory is editing itself: pinned build; gates green; no task weakens a scenario.
- One iteration per launch. Implementers and reviewers are cheap models.
- Small is a requirement: every new schema, knob or launch type carries one line of justification.
- Mechanical solidity and agentic behavior both count; spikes into previous sessions are legitimate.

## Done when
Every section of `INTENT.md` is built, tested and documented, with evidence the owner can click; every harness the intent names has run live; the benchmark goal has run and been compared with the v2 baseline; nothing the intent rejects remains; no open debt.
```
Then drop an intent-change steer.

## Pitfalls
- While a run is live: no edits, commits, merges, checkouts or steers in any worktree of this repository (`$V3`, `$MAIN`, the factory worktrees). Iteration 16: an operator commit parked a task, an operator steer held dispatch. Stage edits outside the repository and apply them at landing.
- Never print promote, test or run logs whole into the conversation; read tails.
- `$MAIN` has untracked owner files (`skills/`, `.omp/`, `.factory/tasks/`): never clean or delete them.
- The goal intent and the mailbox live under `.factory/artifacts` (gitignored): keep the versioned copy `bootstrap/goal-self/intent.md` in step.
- Model changes only on measured failure (a step failing twice on one alias); journal every run-config change.
- Known flake: `test/kernel/scenario7.test.ts` fails occasionally in the full suite and passes alone.
- The machine sleeps: launch without a deadline and wait for the exit notice.
