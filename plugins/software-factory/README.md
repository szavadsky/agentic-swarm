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
bun bin/factory.ts benchmark --repo <path> --goal <name>
bun bin/factory.ts steer  --repo <path> --goal <name> <file | ->
bun bin/factory.ts validate [--step <id>] <file>
bun bin/factory.ts schemas --out <dir>
```

`init` writes `.factory/repo.yaml` if missing, creates the goal directory and
copies the intent (or writes a template). `run` pre-flights, takes the goal
lock, recovers interrupted work and runs the iteration loop. `status` prints
derived state and parked causes; `benchmark` prints one goal's benchmark rows;
`steer` drops a file into the inbox atomically. `validate` checks one
schema-enforced file with the gate's validators (tasks/*.md with its
directory's dependency graph and flow existence against the merged process
config, class.yaml, outcome.yaml keyed by the step in the sibling
started.yaml or `--step`, mailbox/holds/*.yaml, repo.yaml, run.yaml,
process.yaml); exit 0 valid, 1 invalid or unknown kind. `schemas` writes every
kernel file schema as JSON Schema (`task`, `outcome`, `hold`, `class`, `repo`,
`run`, `process`) into `--out` for editors and the artifact LSP.

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
    format: { junit: junit.xml }
```

**Process** — package `config/process.yaml`, optionally overridden by
`.factory/process.yaml`:

```yaml
flows:
  implement-review:
    steps:
      - { id: implement, prompt: implementer, alias: implementer }
      - { id: review, prompt: reviewer, alias: reviewer, review: true, changeRequests: 2 }
taskTypes:
  development: { flow: implement-review, kind: development, schema: outcome }
boundary:                       # the kernel turns outside any task flow
  architect: { prompt: architect, alias: architect }
  digest: { prompt: digest, alias: digest }
  front: { prompt: front, alias: pm }
  plancheck: { prompt: plan-checker, alias: plan-checker }
  planreview: { prompt: reviewer, alias: plan-reviewer }
  pm: { prompt: pm, alias: pm }
  steward: { prompt: steward, alias: steward }
```

**Run** — transient, passed with `--run-config`:

```yaml
aliases:
  architect: { harness: opencode, model: opencode/minimax-m3.1-flash-free, effort: highest }
  implementer: { harness: opencode, model: opencode/deepseek-v4.1-flash-free }
prices:
  opencode/minimax-m3.1-flash-free: { input: 0, cachedInput: 0, output: 0, reasoning: 0 }
  opencode/deepseek-v4.1-flash-free: { input: 0, cachedInput: 0, output: 0, reasoning: 0 }
  opencode-go/deepseek-v4.1-flash: { input: 0.15, cachedInput: 0.003, output: 0.6, reasoning: 0.6 }
limits:
  concurrency: { overall: 3, perSubscription: { opencode-go: 2 }, perModel: {} }
  iterations: 1
  iterationUsd: 5
sessions: { dir: ~/.local/share/factory/sessions, keepRuns: 5, retention: short }
worktreeRoot: ~/.local/share/factory/worktrees
lsp: true                                             # artifact LSP on omp
scouts: { model: opencode-go/deepseek-v4.1-flash }   # omp architect subagents
```

`lsp: true` enables artifact diagnostics where the harness supports them. At
launch the factory writes every kernel schema as JSON Schema and one omp LSP
config into the goal's artifact folder (`.factory/artifacts/<goal>/schemas/`
and `.factory/artifacts/<goal>/.omp/lsp.json`). On omp, every turn installs
that config into its own cwd (`<cwd>/.omp/.lsp.json`, added to the clone's
`.git/info/exclude` and never committed) and omp runs without `--no-lsp`;
`yaml-language-server` must be on PATH, and pre-flight refuses the launch when
it is not. The config maps the YAML artifacts
(`outcome.yaml`, hold files, `class.yaml`) to their schemas and sends task files
to a small bundled frontmatter server, because a YAML server would parse a
task's Markdown body as a second document and flag it. Harnesses without an LSP
surface (opencode, pi, codex) ignore the flag and keep the validation command.

An alias may carry `escalateTo: <alias>` to name the PM's next rung. A PM turn
that is not usable gets a fresh retry on the same alias; after two failed turns
the ladder climbs to `escalateTo`, which carries a broader mandate and may stop
with one question for the architect. Without `escalateTo` the iteration blocks
with every rung in the summary. `fallbacks` stay infrastructure-only (quota and
crash), so escalation is model routing, not a retry. Each fallback tier names
its own model, harness and effort, and the quota pool it draws on; a turn that
lands on a tier keeps the launch on it, and dispatch throttles each pool and
model within the overall limit.

An alias may carry `rotate: [{ harness, model, effort }]` to change its primary
per iteration: iteration N resolves `rotate[N % rotate.length]`, so iteration 1
uses the second entry and the cycle wraps to the first. The rotated entry
replaces the alias's own harness, model and effort for that turn; its fallbacks
apply to the rotated entry, and a fallback without `harness` runs on the
rotated harness. Pre-flight validates every entry's harness, model and effort,
and a fallback that can land on several rotated harnesses is checked against
each of them. Without `rotate` (or with an empty list) the alias keeps its own
harness and model. Shipped example: `bootstrap/run/self-rotate.yaml` cycles the
implementer across opencode, pi and codex.

`prices` maps a model id to USD per million tokens: `input`, `cachedInput`,
`output` and `reasoning`, all four required. A turn costs its harness's
non-zero figure, else the table's price for the model. Every agent record
carries that priced cost plus the table-only list-price equivalent (for
subscriptions that under-report) and the original harness figure. Counters
that are all zero mean the harness reported no usage, so the turn stays
unpriced even when its model has a table entry. A model absent from the table
is unpriced — unknown, never `$0`; a free model is a known `$0` only through
an explicit all-zero entry. opencode reports `0` for turns it cannot price,
so the table is what separates that from free. A resumed turn whose harness
did not split the cache prices its input at the cached rate: the unreported
split is the cached prefix.

`limits.iterationUsd` is an optional brake: once the iteration's priced spend
reaches it, dispatch drains — no new task starts; tasks already started finish
their remaining steps and merge, and the summary records the cause and how many
turns the brake could not price.

Pre-flight resolves every alias (and fallback) through the harness, checks the
model list, `effort: highest` (highest level the model accepts), binaries, the
base branch, and that session/worktree roots are writable and outside the repo.
An omp `@` alias is the exception: omp resolves it inside its own chain, so
there is no catalog entry and no per-model effort list. `effort: highest` is
refused there, and the effort must be one omp's `--thinking` flag parses
(`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, `auto`) — or absent.
Gates run once on the base; a red base is recorded and warned once, not fatal.

## Goal directory

```
<artifactRoot>/<goal>/
  intent.md plan.md tasks/
  records/                  # one directory per settled step and round: started/end/outcome
  mailbox/{inbox,processed,outbox}/
  iterations/<n>/{context-pack.md,summary.md,metrics.yaml}
  metrics.yaml
```

## Steering

`factory steer --goal demo notes.md` (or `-` for stdin) puts the file in
`mailbox/inbox` without a partial-file window. The architect reads it at the
next boundary, marks it processed and writes its answer to
`mailbox/outbox/steer-<id>.md`.

A steer whose file starts with `urgent: true` frontmatter is the exception: it
is not answered by the PM. Dispatch stops starting new work, in-flight tasks
finish, and the next iteration's architect consult reads the steer with the
flag shown as `[urgent]`. The frontmatter block is not part of the steer text.

```markdown
---
urgent: true
---
Stop the rollout and consult me.
```

## Summary and metrics

Each iteration writes exactly one `iterations/<n>/summary.md` (also copied to
the outbox): status, merged/finished/parked tasks, remarkable concerns,
assumptions and debt. `metrics.yaml` is rebuilt from the usage records:
architect launches, architect cost and token share, cost and list cost per
merged task, incident counts (infra retries, fallback hops, outcome-repair
turns, merge conflicts, merged-gate failures, and round-limit, no-progress,
empty-diff and overflow parks), loop incidents (no-progress and
empty-diff parks; a spike's empty finish and overflow parks are not loop
incidents), human interventions (processed steers) and the observable
operator-act counter (steers plus containment outside-changes and
integration-moved merges), gate and commit wall time, and turns, tokens, cost
and work (committed files/lines, attributed gate runs) by role, alias and
model. Costs come from the price table, and every retry or fallback call the
harness reports in `attempts` is priced too, each call once. A turn whose
harness resolved its model inside one call (an omp `@` alias, which can hop
natively) records each served model with its own tokens and prices each at its
own row; the model table counts the turn in every served row and keeps
committed work on the record's own model row. The hop adds no attempt, the
record keeps the configured alias, and a served model with no price row is
unpriced, never `$0`. A turn whose counters are all zero carries no usage
report and is unpriced even when its model has a table entry. A turn neither the harness nor the table priced is
counted as unpriced, so a total containing one is partial; cost per merged
task is unset only when nothing merged or no turn had a known cost. A free
model prices to a known `$0` through its all-zero table entry, and its tokens
still carry the signal. `factory benchmark --goal <name>` prints these
aggregates as rows.
