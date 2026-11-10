---
name: factory-selfhost
description: Self-host a harness self-improvement pipeline on agentic-swarm: launch, overlap, merge, iterate.
---

# software-factory self-host loop (agentic-swarm only)

Same CLI as factory-run-target, `--repo` = this repo. Live runs load code at start, re-read prompts per render.

## Rules while runs are live

- `src/**` edits: safe (loaded at start). `agents/**`: atomic whole-file writes, prose-only, NO new `{{vars}}` (picked up next render). Never break either mid-run.
- One run per task; different repos never interfere — run target + self-host in parallel.
- Orchestrator commits+pushes; worker agents never commit.

## 1. INTENT + launch

- `.factory/tasks/<slug>/INTENT.md` on main, clean tree otherwise.
- First `factory run <slug>` creates `topic/<slug>`; stop it early (SIGTERM) if you need a task-level `pipeline.yaml` override (e.g. cheaper architect model), then relaunch. Wasted first turn ~$0.01.

## 2. Overlap

- Up to 5 launches per target; env/operator-killed attempts don't count.
- Mode switches (human gates on/off) between launches via config, not mid-run.
- Keep a fire-test log: launch #, iter/spend, trace findings, harness fixes.

## 3. Merge the self-host branch

- Self-host branches drift from main (prompt edits land during runs). Merge manually: `git merge --no-commit topic/<slug>`, triage conflicts (funnel/adrs/tests), run FULL suite + typecheck, commit, push.
- Never `factory run` the concluded task again for ceremony.

## 4. Close the loop

- Trace analysis per finished run: journal anomalies (fallback walks, interrupts, retries), cost outliers, gate verdicts.
- Fix harness bugs on main, land prompt/prose tweaks live-safe, update IMPLEMENTATION.md + inspection entry points when behavior changes.
