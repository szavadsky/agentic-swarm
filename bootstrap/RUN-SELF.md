# How to run factory for self improvement

Campaign (stages, decision rules, pitfalls): `SELF-IMPROVE.md`. Intent: `INTENT.md`; current scope: `Phase1.md`.

Goal `self` in `/home/slava/aiexp/agentic-swarm.wt/v3` (branch `factory-v3`). Product: `plugins/software-factory`. The factory runs from a pin; one iteration per launch.

## Pre-flight: no run live

- `pgrep -af "factory.ts run"` must print nothing.
- `cd /home/slava/aiexp/agentic-swarm.wt/v3 && git status --short` must be clean.
- HARD RULE: no edits and no commits in this worktree while a run is live — the containment check parks the running turn (it.13: my mid-run commit parked `rotation-threaded`).

## Launch one iteration

```bash
cd /home/slava/aiexp/agentic-swarm.wt/v3
./bootstrap/promote.sh > /tmp/promote.log 2>&1   # typecheck + tests, records <pin>/gate.yaml, links HEAD
PIN=$HOME/.local/share/factory/pins/current
bun run $PIN/bin/factory.ts run --repo /home/slava/aiexp/agentic-swarm.wt/v3 --goal self --run-config /home/slava/aiexp/agentic-swarm.wt/v3/bootstrap/run/self.yaml --iterations 1 > /tmp/self-iN.log 2>&1
```

The launch refuses a pin whose `gate.yaml` is missing or red. A red promote
leaves `current` on the previous pin, so there is nothing to fix; if the owner
rules to launch a recorded-red pin anyway, add `--pin-gate-override <reason>`
and the reason lands in the run's records.

Takes ~2–6 h, ~$2. Exit 3 (`iteration-limit`) is the normal ending. Use absolute paths and redirect output; `cd` does not survive across commands.

## After it finishes

1. Read `.factory/artifacts/self/iterations/N/summary.md` (outcome, parks, metrics).
2. `git merge --no-ff factory/self -m "merge self-run iteration N: ..."`
3. `cd plugins/software-factory && bun run typecheck && bun test`
4. Land on main: `git -C /home/slava/aiexp/agentic-swarm merge --no-ff factory-v3`.
5. Journal in `bootstrap/LOG.md`, commit, land on main again.
6. Promote + relaunch (above).

## Steering

- Drop a file in `.factory/artifacts/self/mailbox/inbox/`; the next boundary reads it. The live iteration cannot be steered — the mailbox is read at boundaries only.
- Run config: `bootstrap/run/self.yaml` (PM deepseek, `escalateTo` escalation/sonnet, beam-free at max).

## If it breaks

- Read `/tmp/self-iN.log` tail, then `iterations/N/summary.md`, then `records/` for the failed turn.
- Fix between runs, promote, relaunch. Never commit mid-run.
