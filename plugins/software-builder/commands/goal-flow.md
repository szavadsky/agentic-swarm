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

Run `read` on the folder `{F}` (a directory listing) ONLY to confirm `goal.md` is present. Do NOT read `goal.md` contents — the script reads it; you must not interpret it.

### 2. Run the eval

Call the `eval` tool EXACTLY with these arguments (all fields required — omitting `language` causes a validation error):

- `language`: `"py"`
- `code`: the two-line snippet below (substitute `{F}` and `{N}`)
- `timeout`: `0` (no per-cell deadline; the script runs for hours)

```python
F, N = "{F}", {N}
exec(read("skill://software-builder-asset/goal_flow.py:raw"))
```

All logic — restart-aware resume, glitch recovery, plan→orchestrate→completeness-check loop, halt conditions — lives in the bundled script. Do NOT reason about file content, prompt amendment, or iteration state: the script handles it. Only job: launch eval. After the eval returns, `print()` its final status line and stop.

`read("skill://...")` is the eval prelude helper; `skill://software-builder-asset/goal_flow.py:raw` resolves the script inside this plugin's `software-builder-asset` skill directory — no absolute path needed. The `:raw` selector is REQUIRED: without it `read()` returns the anchored line-numbered preview format (`1|...`, `2|...`) which is not valid Python and `exec()` raises `SyntaxError`. `agent()` calls pass only plan path (file name); `schema=` args activate structured-output path (parsed object returned + schema rendered into subagent system prompt).
