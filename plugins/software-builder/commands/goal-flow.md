# Goal Execution Workflow

Role: **mechanical** orchestration. All technical work delegated to subagents.
Achieve goal from `{F}/goal.md`. Iterative.

## Variables

| Var | Meaning |
|-----|---------|
| `{F}` | Goal file folder (contains `goal.md`) |
| `{N}` | Max iterations before final report |

## Workflow

### 1. Locate goal file

Confirm `{F}/goal.md` exists. Do NOT read or interpret.

### 2. Run the eval

Run Python code block below in `eval` cell. All logic — restart-aware resume, glitch recovery, plan→orchestrate→completeness-check loop, halt conditions — lives in the bundled script. Do NOT reason about file content, prompt amendment, or iteration state: the script handles it. Only job: launch eval.

```python
F, N = "{F}", {N}
exec(read("skill://software-builder-asset/goal_flow.py"))
```

`read("skill://...")` is the eval prelude helper; `skill://software-builder-asset/goal_flow.py` resolves the script inside this plugin's `software-builder-asset` skill directory — no absolute path needed. `agent()` calls pass only plan path (file name); `schema=` args activate structured-output path (parsed object returned + schema rendered into subagent system prompt).
