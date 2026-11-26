# Example: the owner's bootstrap run config

An example of how one machine's subscriptions map to roles and fallbacks during
the factory's own bootstrap. Models, harnesses and subscriptions change often;
the live run config is the operator's own file and wins over this page.

| Subscription | Only use with models | Supported harnesses | Roles | Notes |
|---|---|---|---|---|
| Claude Code | Opus 5.5 xhigh / Sonnet 5.5 high | omp, Claude Code | architect, escalation implementer | |
| OpenCode Go paid tier ×2 | opencode-go/deepseek-v4.1-flash :max, opencode-go/muse-spark-1.3-contributor :max (xhigh at most in the opencode harness) | omp (2 keys); one key: opencode, pi, codex | implementer, plan reviewer | |
| OpenCode Go free tier (stays on when the Go quota is over) | opencode-go/hy4-flash-free xhigh | omp, opencode, pi, codex | OK implementer, simple tasks, context prep | |
| OpenRouter free tier | openrouter/baidu/ernie-5.5-flash-preview:free | omp | OK implementer, simple tasks | |
| Antigravity | Gemini 3.8 Flash | agy | workhorse | runs out quickly; use when available |
| OpenCode free tier | deepseek-v4.1-flash-free (most capable), mimo-v2.6-flash-free, at max available effort | opencode only | capable implementer models | use when available; runs out quickly |
| Command Code | meta/muse-ember, qwen/qwen3.8-flash, at max available effort | cmdc (ACP via acpx) | capable, different task-level models | use when available |

## Rules

- Fallback chains run through every subscription whose roles fit the role,
  except the architect, which is Claude only. E.g. implementer: Go paid → agy
  → OpenCode free → Command Code → Go free hy4 → OpenRouter ernie. Claude is
  never in task-level chains; Sonnet is only the escalation alias.
- Implementers and task reviewers run at the highest supported effort, set
  explicitly in each harness's syntax (muse takes `:max` on omp, `#xhigh` on
  OpenCode, the bare id on codex) and checked at pre-flight. There is no
  `highest` keyword.
- Keep several model configs and alternate them across launches to test
  harness combinations; pi is one of the rotated harnesses.
- omp supports auto rotation (OpenCode Go has 2 keys) and auto fallback
  (aliases can use config fallbacks); the other harnesses do not. That makes
  them the right legs for testing kernel-level fallbacks, e.g. from pi as task
  implementer to agy.
