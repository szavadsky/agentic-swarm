# Self-improvement campaign — operator runbook

For the operator agent driving the factory to completion. Intent: `INTENT.md`. Current build scope: `Phase1.md`. Mechanics of one launch: `RUN-SELF.md`. Journal: `LOG.md`.

Paths: `V3=/home/slava/aiexp/agentic-swarm.wt/v3` (branch `factory-v3`, the factory builds here), `MAIN=/home/slava/aiexp/agentic-swarm` (branch `main`, receives every landed iteration), `PIN=$HOME/.local/share/factory/pins/current`, goal dir `$V3/.factory/artifacts/<goal>`.

## Stages

| Stage | Goal | Runs until |
|---|---|---|
| A. Phase 1 | `self` with the Phase 1 intent (installed) | `Phase1.md` "Done when" holds |
| B. Standalone tasks | `t-retention`, `t-hygiene` (below) | both merged or correctly escalated |
| C. Everything | `self` with the full intent (below) | architect `done`, benchmark run, owner confirms |

### Stage A extras (operator-run evidence)
- After M2 (relaunch) is merged: in the next launch, once ≥1 task runs and ≥1 is queued, send ONE interrupt to the factory process: `pkill -INT -f "factory.ts run"`. Wait for exit 130. Relaunch the same command. Check the relaunch's first records: no `architect` record before dispatch resumes. Journal the record ids.
- After M4 (trivial/task) is merged: run the two test goals, one at a time, no `self` run live:
  ```bash
  printf '%s\n' 'Remove the unused `Caps.fork` flag from plugins/software-factory/src/harness (the Caps type and every adapter). Gates stay green.' > /tmp/p1-trivial.md
  printf '%s\n' 'Make the omp cache TTL a run-config key (default `short`), passed to the omp adapter at launch; covered by a test.' > /tmp/p1-task.md
  bun run $PIN/bin/factory.ts init --repo $V3 --goal p1-trivial --intent /tmp/p1-trivial.md
  bun run $PIN/bin/factory.ts run  --repo $V3 --goal p1-trivial --run-config $V3/bootstrap/run/self.yaml --iterations 1 > /tmp/p1-trivial.log 2>&1
  ```
  Same for `p1-task`. Expected: `class.yaml` says trivial / task; no `architect` record; trivial's implement record carries the front's session id; task has implement + review records. Land `factory/p1-trivial` / `factory/p1-task` like `factory/self` (below). A misclassification is evidence: journal it, never hand-write `class.yaml`.
- Benchmark run (`bootstrap/benchmark/README.md`, ~7 h) once at the end of Phase 1.

### Stage B intents
- `t-retention`: *Session/transcript pruning keeps every transcript a record cites (WORKLIST B23); covered by a test.*
- `t-hygiene`: *After implement, a cleanliness check flags new file extensions, oversized files and many added files; the author gets one follow-up prompt to fix or justify (INTENT Git hygiene; WORKLIST W22).* Expected to be classified task; an upscope to bigger is a valid outcome — then the next launch runs the architect on that goal.

### Stage C: install the full intent
Replace `$V3/.factory/artifacts/self/intent.md` (and its copy `bootstrap/goal-self/intent.md`) with:

```markdown
# Goal — the factory completes itself (stage: everything)

## Intent
`INTENT.md` at the repository root binds, whole. Phase 1 is done. Build everything in INTENT.md not yet fully completed, tested or documented — hierarchy (the dashboard is its forcing case) first.

## Particular to this goal
- The factory is editing itself; pinned build; typecheck, lint and tests green; no task weakens a scenario.
- One iteration per launch. Cheap implementers and reviewers: size tasks for them.
- Small is a requirement; every new schema, knob or launch type carries one line of justification.
- Deliverables beyond code: the "run factory" skill (usage), the dashboard, and an INTENT-section → test/run-evidence table.

## Done when
Every INTENT.md section is built, tested and documented, with evidence in that table; every harness in INTENT.md has run live; the benchmark goal has run and been compared with the v2 baseline; nothing INTENT.md rejects remains; no open debt.
```
Then drop a steer: "Stage C: full intent installed; plan the hierarchy first."

## One iteration (all stages)

1. No run live: `pgrep -af "factory.ts run"` prints nothing; `git -C $V3 status --short` clean.
2. `$V3/bootstrap/promote.sh > /tmp/promote.log 2>&1` — on failure read the log tail only.
3. Launch in the background, no deadline (runs take 2–6 h; the machine sleeps): bash with `timeout: 0`,
   `bun run $PIN/bin/factory.ts run --repo $V3 --goal self --run-config $V3/bootstrap/run/self.yaml --iterations 1 > /tmp/self-iN.log 2>&1`. Results auto-deliver; do not poll.
4. On exit read `$V3/.factory/artifacts/self/iterations/N/summary.md`. Exit 3 = normal; 0 = done; 2 = blocked; 1 = failure; 130/143 = signal.
5. Land:
   ```bash
   git -C $V3 merge --no-ff factory/self -m "merge self-run iteration N: <merged slugs>"
   (cd $V3/plugins/software-factory && bun run typecheck && bun test) > /tmp/landN.log 2>&1
   git -C $MAIN merge --no-ff factory-v3 -m "land factory-v3: iteration N"
   ```
6. Journal in `$V3/bootstrap/LOG.md` (numbers from `metrics.yaml` and the summary, decisions and operator acts only), commit, merge to main again, promote, relaunch.
7. Report to the owner: merged / parked (cause) / cost / next, with a link to the summary. Terse; no analysis unless asked.

## Decision rules
- Exit 2: answer by steer only when `INTENT.md` or `Phase1.md` answers the question; quote the line. Otherwise ask the owner.
- Exit 1 or a launch that cannot start: diagnose from the log tail, the summary, then the failed record. A kernel defect that blocks launching → smallest fix on `factory-v3` with a test, journaled as an operator act. Anything else → ask the owner.
- Two consecutive iterations with 0 merges, or one iteration > $5 or > 8 h → stop and report.
- The same failure twice in a row → do not relaunch a third time; report.
- Model changes only on measured failure (two failures of a step on one alias); journal every run-config change.
- Owner gives new intent → edit `INTENT.md` in place (consolidated, latest wins, no history), commit, merge to main, drop a steer naming the changed lines.

## Pitfalls
- While a run is live: no edits, commits, merges or checkouts in ANY worktree of this repository (`$V3`, `$MAIN`, the factory worktrees). Containment (B1) parks the running task. Journal after the run.
- The architect may reinstate an old reading against `INTENT.md` as a "reversible assumption" (e.g. iteration 13 made trivial de novo). Check each summary's Assumptions against `INTENT.md`; steer back quoting the line. Assumptions that contradict the owner are not reversible-by-default — they are defects.
- Scopes must not name files (`Phase1.md` M5). Until M5 lands, a park with cause `upscope` on finished green work is the old fence: land the kept branch per the plan, don't re-scope by hand.
- Do not hand-write factory deliverables (features, docs, dashboard, skill). The operator writes steers, run configs, `LOG.md`, intent files, and launch-blocking hand fixes only.
- Never print promote/test/run logs whole into the conversation; read tails.
- `$MAIN` has untracked owner files (`skills/`, `.omp/`, `.factory/tasks/`): never clean or delete them. Merges into `main` only between runs.
- Free tiers hit quota walls; the paid fallback carries the run until M6 throttling lands. Watch the cost table in each summary.
- The goal intent file and the mailbox live under `.factory/artifacts` (gitignored): copy goal intents to `bootstrap/goal-self/intent.md` so they are versioned.
- A `self` run and a test goal run never overlap until B3 is merged; after that, still prefer serial.
- Known flake: `test/kernel/scenario7.test.ts` ("plan edit between iterations") fails occasionally in the full suite (architect outcome repair path), passes alone. One promote retry is fine; a second failure is real.

## Owner steers applied (2026-11-14)
- agy through acpx, sooner than later: one task-level step live during Phase 1 (another subscription to burn). Evidence wanted: the turn record with harness=acpx, model=agy/gemini-flash-3.8, cost/turns; if acpx cannot drive it, the exact failing command and the minimal adapter gap.
