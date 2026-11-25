---
name: run-self-improve
description: Operate a self-improvement campaign on the host repository — install the self-improvement flows, launch one bounded iteration at a time, triage records as facts, drop steers, recover from incidents, and land each iteration. Use when asked to run the factory on itself, assess a self-run, install the self-improvement plugin, or write an incident report.
---

# Run a self-improvement campaign

The owner's intent binds; the architect owns the plan; this skill owns the
operator loop around both. The factory edits itself from a pinned build, one
bounded launch at a time, and the operator keeps the record facts clean.

Machine specifics — checkout and pin paths, worktree and session roots, model
aliases — belong to the operator's own files, never to this skill. The fences
below show a shape to copy, not a requirement.

## 1. Role

The operator does six things:

1. Keeps `INTENT.md` the owner's consolidated intent: owner input only, latest
   wins, no history.
2. Decides which subset of the intent is the current phase, as requirements.
3. Launches, lands, and promotes: the goal branch to the integration branch,
   then to `main`.
4. Recovers from major issues.
5. Reports bugs and incidents to the architect as steers: what was observed,
   with evidence.
6. Reports to the owner.

The operator never edits the plan, task files, prompts or kernel code (recovery
excepted), tells the architect what to build first or how to split it, judges
plan or task design, or hand-writes factory deliverables. Question the intent,
the phase requirements or the plan answer, the architect decides; the owner
decides the intent.

## 2. Install

Two halves: the plugin provides the skill and the flow files; the target repo
provides the wiring. Install the plugin with the harness's plugin manager
(Claude Code, omp and Codex read `.claude-plugin/plugin.json`; a harness that
reads only `SKILL.md` still gets this runbook). Then copy the flow files in:

```bash self-improve-install
mkdir -p "$REPO/.factory/prompts"
cp "$PLUGIN/config/process.yaml" "$REPO/.factory/process.yaml"
cp "$PLUGIN/prompts/assess-run.md" "$REPO/.factory/prompts/assess-run.md"
```

- `config/process.yaml` is a process-layer overlay: it keeps the package
  default and only restates `architecture.flows` with the previous-run
  assessment first. On the first consult of a goal (`initial`) it runs
  nothing extra; on `concerns`, `iteration-done`, `steer` and `relaunch` it
  runs `assess-run` before the architect.
- The overlay names the `assess` alias; the run layer binds it. Add it to the
  self-run's run config, on a cheap model — the assessment is evidence work,
  never the architect's model. The rest of the run layer stays yours:

```yaml self-improve-run-example
aliases:
  assess: { harness: omp, model: opencode-go/deepseek-v4.1-flash }
```

- `factory validate <repo>/.factory/process.yaml` and
  `factory prompts --dry-run --repo <repo>` must both come back clean before
  the first launch; a flow step whose prompt does not resolve is a config
  error, not a runtime surprise.

## 3. Stages

| Stage | Goal | Ends when |
|---|---|---|
| A. Phase 1 | the intent's current phase requirements | the evidence the phase lists exists |
| B. Standalone tasks | one or two small goals outside the campaign | both merged or correctly escalated |
| C. Everything | the whole intent | architect `done`, benchmark run and compared, owner confirms |

The stage is an owner decision, read from the intent. Do not widen it.

## 4. One iteration

Before anything: no launch is live (`pgrep -af "factory.ts run"` prints
nothing) and `git -C "$V3" status --short` is empty.

1. Promote the pinned build. The promote script records typecheck and suite
   verdicts in the pin's `gate.yaml`; a red build is kept as a recorded pin but
   never linked as current, and `run` refuses a recorded-red pin.
2. Launch one iteration in the background, with no deadline. The result is
   delivered on exit; never poll.
3. On exit, triage the summary (section 5) and land what merged: merge the
   goal branch into the integration branch, run the gates from a clean
   checkout, then merge into `main`.
4. Journal the numbers and the operator acts, drop any steers recorded for the
   next launch, promote again, and launch the next iteration.
5. Report to the owner: merged, parked with cause, cost, and what is next.

Exit codes: `0` done, `1` failure, `2` blocked, `3` normal bounded stop,
`130`/`143` signal. A bounded launch that stops with `3` is continued by the
same command; a promote stop first needs its build promoted.

```bash self-improve-example
V3=$HOME/src/agentic-swarm
MAIN=$HOME/src/agentic-swarm-main
PIN=$HOME/.local/share/factory/pins/current
GOAL=delta
FACTORY=$V3/plugins/software-factory
bun run "$PIN/bin/factory.ts" run --repo "$V3" --goal "$GOAL" \
  --run-config "$V3/.factory/run.yaml" --iterations 1
```

## 5. Triage: facts, not judgement

Read inside a checkpoint; give deep record or transcript reads to a scout and
keep only:

- exit code; merged, parked with cause, cancelled and pending counts; the cost
  table; base gate state;
- `forward` lines addressed to the operator (for example "ready for the
  interrupt test");
- an assumption in the summary that contradicts a line of the intent — quote
  both;
- incidents: infrastructure failures, parks whose cause is not the task's own
  work, repair turns that repeat, turns that ended without delivering,
  anything that held dispatch, a flaky test at promote. One line each, with
  the record id.

Do not evaluate the plan, the task split or the code; that is the architect's
consult. What you drop needs no record.

## 6. Steers

A steer is the operator's whole channel to the architect; use it only for
observations and owner changes.

- **Incident report** — observations only, one line per incident with evidence:

```markdown
# Incident report — iteration N (operator)
Observed, not prescribed; what to do about it is yours.
- <what happened> — evidence: <record id, path or log line>
```

- **Intent change** — a one-line statement of the section and the change, with
  the diff path. The architect and PM handle the goal's own artifacts; the
  repo intent is the source of truth the note names.
- **A question** (exit `2`) — answer only when the intent or the phase
  requirements answer it, quoting the line; otherwise ask the owner.

Drop steers between launches while the runbook does not support a live
interrupt; never drop one during a launch that has not implemented steer
handling without holding dispatch.

## 7. Recovery

Major issues only, each act journaled and reported as an incident:

| Symptom | Act |
|---|---|
| Launch cannot start, or exits `1` before its first record | Read the log tail. Environment (lock, stale worktree, auth, quota): fix it and relaunch. Kernel defect: smallest fix with a test on the factory branch, journal it, report it as an incident. |
| Promote fails | Rerun once. Fails again: do not promote; incident report with the failing test names; launch from the previous pin. |
| Gates red after merging the goal branch | Rerun once. Still red: do not land, do not promote; incident report; launch from the previous pin. Not fixed by that iteration: stop and report. |
| Merge conflict | Abort the merge; stop and report. |
| Run must be stopped | One interrupt signal to the run process; wait for the exit; journal; incident report; relaunch. |

Stop and report to the owner, do not relaunch: two consecutive iterations with
zero merges; one iteration over the day's bound; the same failure twice in a
row; an architect turn that does not deliver twice in a row. This is an
operator rule, not owner intent.

## 8. Operator launches

- **Interrupt test** — during a launch with at least one task running and one
  queued, send one interrupt to the run process, wait for exit `130`, and
  relaunch the same command. Journal the first record ids of the relaunch.
- **Small goals** — `init` with a small intent, then one bounded `run`, landed
  like a campaign iteration. A misclassification is an incident, never a
  hand-written class file.
- **Steer answer** — a steer dropped while tasks run must get its answer while
  dispatch continues, with the record ids journaled; a steer that arrives
  before a plan waits for it.
- **Benchmark** — run once at the end of the phase, and compare it with the
  previous baseline.
- **Quota rotation** — when a paid pool is exhausted, relaunch with the
  off-subscription run config; revert when it resets.

## 9. Pitfalls

- While a run is live: no edits, commits, merges, checkouts or steers in any
  worktree of the repository. A commit parks a task; a steer holds dispatch.
- Never print promote, test or run logs whole into the conversation; read
  tails.
- The owner's checkout may hold untracked files: never clean or delete them.
- The goal intent and its versioned copy must stay in step; the goal directory
  lives under the artifact root and is not committed by the run.
- Model changes only on measured failure (a step failing twice on one alias);
  journal every run-config change.
- One known flake and one sleep-prone machine are facts of the runbook, not
  reasons to thin the suite: relaunch rather than weakening a check.
