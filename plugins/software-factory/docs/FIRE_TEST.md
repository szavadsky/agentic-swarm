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
1. Trace analysis by dedicated task subagents per launch (split by area when large), down to the omp session JSONL transcripts referenced by `meta.yaml` `traceRef` — not only records (`runs/`, `items/*/steps/`, `journal.ndjson`, `state.yaml`) on the task and item branches. Find where behavior is suboptimal or loops are introduced (repeated tool calls, re-reading, retries without new information, consult/fix cycles). Audit agent use, not only outcomes:
   - token economy: expensive roles (architect, task-escalation) work mostly from context prepared by cheap agents (triage citations, fact-finder findings, structured summaries); flag expensive turns spent on raw exploration (many read/grep calls), oversized prompts, repeated hydration;
   - separation of concerns: developers don't plan or review, reviewers/QA don't write fixes, PM doesn't design, architect doesn't implement; no agent runs git writes or spawns subagents;
   - deterministic guardrails actually executed and respected: gates (lint, tests), target-red/green, red-test, scope/size checks — present in `checks.yaml` of every step that requires them, failures acted on, no agent bypassing them;
   - model split as configured (role per step, alt-on-retry swaps, escalations), loop bounds and no-progress detection firing correctly, cost per role;
   - human exposure: mailbox shows only funnelled, confirmed, low-noise items matching the active human-involvement mode.
2. Classify findings: harness bug, prompt defect, config default, model weakness, target-repo issue.
3. Fix the harness (tests for behavior bugs), commit, relaunch — restart resumes from records.

Operator steering is logged in `steer/fromusertaken/` on the task branch.

## Self-host
Target: this repo (`/home/slava/aiexp/agentic-swarm`). The factory runs from the main checkout's `plugins/software-factory` while it edits its own copy on `topic/{task}` in a worktree; after trace analysis and review the operator merges the result to `main` (conflicts with interim harness fixes resolved in the merge). Same launch loop and trace analysis as above; ≤ 5 launches per task, each task expected to finish within a couple of iterations; a complex goal should be split into epics when the architect judges its complexity so. In order:
1. `concerns-funnel` — INTENT = spec item 18 of `docs/factory.v2.md` (concerns + remarkable decisions in structured agent output, aggregated and triaged by the step reviewer, funnelled worker → reviewer → epic architect → saga architect → human with less detail per level; blocking vs non-blocking ADRs; human-involvement mode presets `autonomous` / `principal` / `detailed` shipped as default config examples with prompt fragments). The launches switch modes via config to test what reaches the human.
2. `omp-workspaces` — INTENT = spec items 19 + 20 (omp isolation backend by default with engine worktrees as an option, preflight compatibility checks, idempotent status/cleanup/gc, commit content from agent output, wave-end merger agent + architect escalation with status/worktree pointers, saga with independent epic launches and concern propagation to the saga architect, no-model end-to-end tests through omp with a scripted mock provider; architect cache coherence: compaction before uncached resume, cache warm on standby, cost-measured defaults, re-evaluated schema-free telegraphic architect output with PM structuring). Expected to be planned as epics with fact-finder spikes on omp isolation and cache/compaction mechanics first; prior research in `docs/spikes/`.

## Exit
Push the target repo's `topic/*` branches and the harness commits. Report: launches, iterations, items done/failed, interventions, harness fixes, cost.
