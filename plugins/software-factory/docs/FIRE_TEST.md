# Fire test

Target: `/home/slava/aiexp/python-setup` (Python ≥ 3.14, uv). Goal from `docs/factory.v2.md` "Fire testing".

## Setup (once)
```bash
cd /home/slava/aiexp/python-setup
git switch main && git status --short          # must be clean
F="bun /home/slava/aiexp/agentic-swarm/plugins/software-factory/bin/factory.ts"   # keeps cwd = target repo
$F init
# review .factory/project.yaml (paths, setup/gates hints), commit it on main
```

## Task
`.factory/tasks/modernize/INTENT.md` (the only uncommitted file allowed on the first run; the engine commits it on `topic/modernize`):

```markdown
# modernize

Modernize the project while preserving every material lint/check behavior.
- Enforce the project's coding rules across the code base.
- Debloat code and tests; keep test intent, never test linting, test infra/assumptions first.
- Remove redundant tests.
- Replace the embedding/rerank based justification/comment check
  (`src/python_setup_lint/checkers/_semantic.py`) with a CPU-friendly small decision model,
  e.g. https://huggingface.co/fastino/GLiDE-0.4B or smaller
  (https://huggingface.co/spaces/multimodalart/jev-decision-index); keep a git-stored cache with cleanup.
```

## Launch loop (≤ 5 launches)
```bash
$F preflight modernize
$F run modernize                             # exit 0 done, 10 blocked on human, 1 failed
$F status modernize
$F steer modernize "answer / directive text"   # answers steer/tousertoreview questions
```
A launch may cover several architect iterations. After each launch:
1. Trace analysis (subagents): task folder records (`runs/`, `items/*/steps/`, `journal.ndjson`, `state.yaml`) on the task branch and item branches; omp session transcripts referenced by `meta.yaml` `traceRef`. Audit agent use, not only outcomes:
   - token economy: expensive roles (architect, task-escalation) work mostly from context prepared by cheap agents (triage citations, fact-finder findings, structured summaries); flag expensive turns spent on raw exploration (many read/grep calls), oversized prompts, repeated hydration;
   - separation of concerns: developers don't plan or review, reviewers/QA don't write fixes, PM doesn't design, architect doesn't implement; no agent runs git writes or spawns subagents;
   - deterministic guardrails actually executed and respected: gates (lint, tests), target-red/green, red-test, scope/size checks — present in `checks.yaml` of every step that requires them, failures acted on, no agent bypassing them;
   - model split as configured (role per step, alt-on-retry swaps, escalations), loop bounds and no-progress detection firing correctly, cost per role.
2. Classify findings: harness bug, prompt defect, config default, model weakness, target-repo issue.
3. Fix the harness (tests for behavior bugs), commit, relaunch — restart resumes from records.

Operator steering is logged in `steer/fromusertaken/` on the task branch.

## Self-host
Target: this repo (`/home/slava/aiexp/agentic-swarm`). The factory runs from the main checkout's `plugins/software-factory` while it edits its own copy on `topic/{task}` in a worktree; after trace analysis and review the operator merges the result to `main` (conflicts with interim harness fixes resolved in the merge). Same launch loop and trace analysis as above, ≤ 5 launches per task, in order:
1. `concerns-tracking` — INTENT = spec item 18 of `docs/factory.v2.md` (concerns in structured agent output, aggregated under the task folder, triaged by the step reviewer with dispositions + `dismiss`, routed to dependent-item blocking / architect / steer mailbox / tech debt, surfaced in close-ups and status).
2. `omp-workspaces` — INTENT = spec item 19 (omp isolation backend by default with engine worktrees as an option, preflight compatibility checks, idempotent status/cleanup/gc, commit content from agent output, wave-end merger agent + architect escalation with status/worktree pointers, saga with independent epic launches, no-model end-to-end tests through omp with a scripted mock provider). Expected to be planned as epic/saga scale with a fact-finder spike on omp isolation first; prior research in `docs/spikes/`.

## Exit
Push the target repo's `topic/*` branches and the harness commits. Report: launches, iterations, items done/failed, interventions, harness fixes, cost.
