# software-builder omp plugin — TLDR

## Loading

```sh
omp --plugin-dir /path/to/agentic-swarm/plugins/software-builder
```

Agents, commands, and the bundled python orchestration scripts are
discovered from this plugin. Scripts are resolved at runtime via
`skill://software-builder-asset/<file>` — no absolute paths, no
env vars. Only `--plugin-dir` is required.

## Purpose

Goal-execution agentic system: **plan → orchestrate → verify**. A command (`goal-flow.md`) drives
iterative cycles where a planner produces an implementation plan and an orchestrator delegates
execution across waves of subtasks. Role-based tool assignment enforces least privilege — each
agent gets only the tools its role requires.

## Call tree

```
goal-flow.md (command, eval loop)
├── plan-goal-execution          [full_read_only + plan-write]
│   ├── fact-finder              [full_read_only + web_search]
│   ├── librarian                (bundled)
│   ├── oracle                   (local)
│   ├── designer                 (bundled)
│   └── task                     (bundled, generic)
├── orchestrate-goal-execution   [minimum_orchestrator]
│   ├── subtask-dev-process       [pass-through: read+eval+yield]  (per subtask)
│   │   └── (eval python loop: agent() calls)
│   │       ├── implement-subtask    [full_developer]
│   │       │   ├── task             (bundled)
│   │       │   ├── fact-finder       [full_read_only + web_search]
│   │       │   ├── sonic        (bundled)
│   │       │   └── librarian         (bundled)
│   │       └── check-and-commit-subtask [reviewer_committer]
│   │           ├── sonic        (bundled)
│   │           └── librarian         (bundled)
│   ├── wave-end-checkpoint       [full_developer]  (per wave end)
│   ├── fact-finder              [full_read_only + web_search]
│   └── oracle                   (local)
└── plan-completeness-checker    [full_read_only + delegation]
    ├── task                     (bundled)
    ├── fact-finder              [full_read_only + web_search]
    └── oracle                   (local)
```

## subtask-dev-process architecture

`subtask-dev-process` is a **pass-through pipe**: it reads a plan locator, then runs a single
`eval` cell. All orchestration logic lives in the eval python code:

1. The eval spawns `implement-subtask` via `agent()` with `schema=IMPL_SCHEMA`.
2. The eval spawns `check-and-commit-subtask` via `agent()` with `schema=CHECK_SCHEMA`.
3. If check returns `partial`, the loop retries (up to 3 iterations):
   - Iteration 2+: implementer gets reviewer concerns from previous iteration.
   - Iteration 2+: checker gets implementer's response to previous concerns.
   - Last iteration: both get "FINAL CALL" instruction.
4. Concerns accumulate across iterations and are yielded upward via `tool.yield()`.

The agent itself NEVER calls `yield` or `task` directly — the eval handles everything.

## Concerns schema

Implement and check agents return structured concerns as `[{slug, resolution}]` arrays:

- **implement-subtask**: `planConcerns` (accumulated) + `responseToReviewer` (empty first, response on retry).
- **check-and-commit-subtask**: `implementationConcerns` (last iteration only) + `extraPlanConcerns` (accumulated) + `planConcernNotes`.
- **subtask-dev-process**: `concerns` (accumulated plan concerns + last implementation concerns).

## Tool-assignment principles

1. **Least privilege** — each agent gets only the tools its role requires; no blanket access.
2. **Read-only agents get bash for measurement only** — investigation agents (fact-finder,
   plan-completeness-checker) have `bash` but prompt instructions enforce non-changing use only.
3. **Orchestrators get minimal tools** — read + spawn + status write + track. No bash, no edit,
   no LSP, no debug. They delegate all project work.
4. **Web search via webmcp** — when an agent needs web search, it uses `mcp__webmcp_scrape_batch`
   and `mcp__webmcp_search_engine_batch`. The built-in `web_search` tool is NEVER used.
5. **Implementers get full developer toolset** — the doer (implement-subtask, wave-end-checkpoint)
   gets all software/dev tools including edit, write, bash, eval, LSP, AST, debug.
6. **Planners get read-only + plan-write** — exploration tools (read, grep, glob, lsp, ast_grep)
   plus `write` for the plan artifact. No bash (enforces delegation).

## Roles → tools

Tools auto-added by the runtime (not listed in agent frontmatter): `yield` (when `tools:` is
specified), `task` (when `spawns:` is non-empty and depth allows), `hub` (ensured in explicit
tool lists).

| Role | Explicit tools |
|------|---------------|
| `full_developer` | read, bash, edit, write, ast_grep, ast_edit, eval, glob, grep, lsp, inspect_image, debug, todo, resolve, report_tool_issue, generate_image, checkpoint, rewind, yield |
| `full_read_only` | read, bash, grep, glob, lsp, ast_grep, inspect_image, debug, todo, checkpoint, rewind, yield, report_tool_issue |
| `web_search` | mcp__webmcp_scrape_batch, mcp__webmcp_search_engine_batch |
| `docs_edit` | read, edit, write, grep, glob, yield |
| `status_edit` | read, write, yield |
| `status_report` | write, yield |
| `minimum_orchestrator` | read, grep, glob, write, hub, todo, yield |
| `pass_through` | read, eval, todo, yield |
| `reviewer_committer` | read, bash, grep, glob, lsp, ast_grep, inspect_image, todo, yield |

## Agents → roles

| Agent | Role | Spawns |
|-------|------|--------|
| `orchestrate-goal-execution` | minimum_orchestrator | subtask-dev-process, wave-end-checkpoint, fact-finder, oracle |
| `plan-goal-execution` | full_read_only + plan-write | fact-finder, librarian, oracle, designer, task |
| `subtask-dev-process` | pass_through | implement-subtask, check-and-commit-subtask |
| `implement-subtask` | full_developer | task, fact-finder, sonic, librarian |
| `check-and-commit-subtask` | reviewer_committer | sonic, librarian |
| `plan-completeness-checker` | full_read_only + delegation | task, fact-finder, oracle |
| `fact-finder` | full_read_only + web_search | — |
| `wave-end-checkpoint` | full_developer (full edit access) | — |

## Critical files

- `agents/subtask-dev-process.md` — pass-through agent: read locator + eval python loop. All logic in the skill script.
- `skills/software-builder-asset/SKILL.md` + `subtask_dev_process.py` + `goal_flow.py` — bundled python orchestration assets. Resolved via `skill://software-builder-asset/<file>` (e.g. `read("skill://software-builder-asset/subtask_dev_process.py")`).
- `agents/orchestrate-goal-execution.md` — frontmatter `tools:` and `spawns:`; prompt body step 3.
- `agents/implement-subtask.md` — output: status, summary, planConcerns, responseToReviewer.
- `agents/check-and-commit-subtask.md` — output: status, committed, implementationConcerns, extraPlanConcerns, planConcernNotes.
- `agents/plan-goal-execution.md` — planner agent.
- `agents/wave-end-checkpoint.md` — wave-end cleanup/commit agent.
- `agents/plan-completeness-checker.md` — plan completeness checker.
- `commands/goal-flow.md` — eval-driven goal execution loop (invoked as `software-builder:goal-flow`).
