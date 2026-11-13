# Software Factory

The factory runs one goal as bounded iterations. Each iteration is one
architect consult (plan) plus the task dispatch it starts. State is derived from
task files and append-only records; there is no state file to repair.

## Commands

```bash
cd plugins/software-factory
bun bin/factory.ts init   --repo <path> --goal <name> [--intent <file>]
bun bin/factory.ts run    --repo <path> --goal <name> --run-config <file> [--iterations N]
bun bin/factory.ts status --repo <path> --goal <name>
bun bin/factory.ts steer  --repo <path> --goal <name> <file | ->
```

`init` writes `.factory/repo.yaml` if missing, creates the goal directory and
copies the intent (or writes a template). `run` pre-flights, takes the goal
lock, recovers interrupted work and runs the iteration loop. `status` prints
derived state and parked causes; `steer` drops a file into the inbox atomically.

Exit codes for `run`: `0` goal done, `1` failure, `2` blocked, `3` iteration
limit, `130`/`143` interrupted by SIGINT/SIGTERM. The first signal drains (no
new dispatch, in-flight turns finish), the second aborts in-flight turns and
records their partial usage.

## Configuration

Three layers, all validated with one report naming file and key.

**Repo** — `.factory/repo.yaml`, tracked:

```yaml
baseBranch: main
artifactRoot: .factory/artifacts
setup: [bun install]
gates:
  - id: typecheck
    command: bun run typecheck
```

**Process** — package `config/process.yaml`, optionally overridden by
`.factory/process.yaml`:

```yaml
itemTurns: 8
flows:
  implement-review:
    reviewRounds: 2
    steps:
      - { id: implement, role: implementer }
      - { id: review, role: reviewer, review: true }
roles:
  architect: { prompt: architect }
  implementer: { prompt: implementer }
```

**Run** — transient, passed with `--run-config`:

```yaml
aliases:
  architect: { harness: opencode, model: opencode/minimax-m3.1-flash-free, effort: highest }
  implementer: { harness: opencode, model: opencode/deepseek-v4.1-flash-free }
limits: { concurrency: 3, iterations: 1 }
sessions: { dir: ~/.local/share/factory/sessions, keepRuns: 5 }
worktreeRoot: ~/.local/share/factory/worktrees
scouts: { model: opencode-go/deepseek-v4.1-flash }   # omp architect subagents
```

Pre-flight resolves every alias (and fallback) through the harness, checks the
model list, `effort: highest` (highest level the model accepts), binaries, the
base branch, and that session/worktree roots are writable and outside the repo.
Gates run once on the base; a red base is recorded and warned once, not fatal.

## Goal directory

```
<artifactRoot>/<goal>/
  intent.md plan.md tasks/
  records/                  # one directory per turn: started/end/outcome
  mailbox/{inbox,processed,outbox}/
  iterations/<n>/{context-pack.md,summary.md,metrics.yaml}
  metrics.yaml
```

## Steering

`factory steer --goal demo notes.md` (or `-` for stdin) puts the file in
`mailbox/inbox` without a partial-file window. The architect reads it at the
next boundary, marks it processed and writes its answer to
`mailbox/outbox/steer-<id>.md`.

## Summary and metrics

Each iteration writes exactly one `iterations/<n>/summary.md` (also copied to
the outbox): status, merged/finished/parked tasks, remarkable concerns,
assumptions and debt. `metrics.yaml` is rebuilt from the usage records:
architect launches, architect cost and token share, cost per merged task, loop
incidents (no-progress parks), human interventions (processed steers), and turns
and tokens by role. Free models report cost `0`; token counts carry the signal.
