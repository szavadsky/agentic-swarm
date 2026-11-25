# Kernel

The kernel is the script around the agents. Agents produce schema-bound
outcomes; the kernel reads those outcomes and performs the fixed transitions —
it owns task state, worktrees, gates, merges, records and status. The fixed
surface is the schema set (`factory schemas`), not a config key.

## Commands

Run from `plugins/software-factory`; `--repo` is the target checkout.

```bash
bun bin/factory.ts init    --repo <path> --goal <name> [--intent <file>]
bun bin/factory.ts run     --repo <path> --goal <name> [--run-config <file>] [--iterations N]
bun bin/factory.ts status  --repo <path> --goal <name> [--json]
bun bin/factory.ts benchmark --repo <path> --goal <name>
bun bin/factory.ts steer   --repo <path> --goal <name> <file | ->
bun bin/factory.ts validate [--step <id>] [--run-config <file>] [<file>]
bun bin/factory.ts schemas --out <dir>
bun bin/factory.ts variables --out <file>
```

| Command | Does |
| --- | --- |
| `init` | Writes `.factory/repo.yaml` when missing, creates the goal layout, copies `--intent` to `<goal>/intent.md` or writes a template. Never overwrites an existing intent. |
| `run` | Loads the three config layers, pre-flights, takes the goal lock, recovers interrupted records and stale worktrees, then alternates boundary consults with task dispatch for the iteration budget. |
| `status` | Derives goal state from task files and records, prints one line per task, every parked cause and the last summary path. Launches nothing. |
| `status --json` | Prints `status.json`, the snapshot written after each agent launch and finish. Before the first launch it derives the same document. |
| `benchmark` | Prints one goal's benchmark rows from `metrics.yaml` and its records. |
| `steer` | Writes a steer file into the mailbox inbox atomically. |
| `validate` | Checks one schema-enforced file with the gate's validators: `tasks/*.md`, `class.yaml`, `outcome.yaml`, `mailbox/holds/*.yaml`, `repo.yaml`, `run.yaml`, `process.yaml`, `infra.yaml`. `--run-config` names the run config explicitly, including one not named `run.yaml`. A repo, process or run file also gets the cross-layer checks (required aliases, task-type flows/schemas, quota pools) — launches nothing. Exit 0 valid, 1 invalid or unknown kind. |
| `schemas` | Writes every kernel schema as JSON Schema (`task`, `outcome`, `hold`, `class`, `infra`, `repo`, `run`, `process`). |
| `variables` | Renders `prompts/VARIABLES.md` from the typed prompt-variable descriptor. |

`init` creates the goal directory under the configured artifact root
(`.factory/artifacts` by default; the repo config's `artifacts.backend` may move
it into the repository or a separate one). The goal name must be kebab-case.

## Goal layout

```
<artifact root>/<goal>/
  intent.md plan.md tasks/    # intent, plan and one file per task
  epics/<epic>.md             # one plan per architect scope
  class.yaml                  # the front's classification
  infra.yaml                  # the infra turn's gates, speeds and observed status
  records/                    # one directory per settled step and round
  mailbox/{inbox,processed,outbox}/
  iterations/<n>/{context-pack.md,summary.md,metrics.yaml,intent-status.json}
  vendor/{pico.min.css,chart.umd.min.js}
  metrics.yaml
  status.json                 # machine-readable snapshot
  dashboard.html              # static page rendered from status.json + intent-status.json
```

## Iteration lifecycle

1. Pre-flight resolves aliases, fallbacks, models, efforts, binaries, the base
   branch, the roots and the base gates. Nothing is written before it passes.
2. The goal lock admits one launch per goal. An interrupted iteration resumes
   as a recorded attempt, bounded by `limits.resumeAttempts`; a pass that died
   inside ingestion adopts the outcome its turn delivered once the step's
   artifact is on disk and continues that same iteration, so stale worktrees
   are recovered and a half-delivered step reruns instead of counting.
3. The boundary runs the kernel turns the iteration needs: front (classify a
   fresh goal), the configured ingestion steps (the shipped `infra` step writes
   `infra.yaml`; its gates drive the task runs when the repo config declares
   none), plan checker, architect consult, plan review, digest, pack preparer,
   PM/steward. The architect owns `plan.md`.
4. Dispatch runs each ready task's flow in its own worktree, step by step, with
   real gates and a squash merge into the goal's integration branch. State comes
   from the task files plus the append-only records, so a crash never needs a
   state repair.
5. The iteration writes one `iterations/<n>/summary.md` and `metrics.yaml`, then
   `status.json` and `dashboard.html`.

A `done` decision closes the goal only when no open task or debt remains;
otherwise the state stays active and the next launch continues. A `blocked`
decision parks the goal until a steer arrives.

## Status and dashboard

- `status.json` and `dashboard.html` sit beside the goal's task files. The
  kernel rewrites both after each agent launch and finish; `status --json`
  prints the stored snapshot.
- `dashboard.html` is fully static: the kernel vendors Pico CSS and Chart.js
  under `vendor/` and links them locally; no request leaves disk and every
  value is escaped. It leads with the status paragraph: the newest PM turn's
  summary, or the kernel's own mechanical account (goal, iteration, landed,
  open and parked tasks) when no PM turn wrote one, so records never read as
  an unknown status. The architect's intent status is one input of that page:
  its section reads the newest `iterations/<n>/intent-status.json` the
  architect's summary wrote, and says `not reported` when none exists instead
  of deriving intent status from tasks. Open the file directly in a browser
  and refresh after a launch.
- `status` text is the quick read; `--json` is for editors, scripts and the
  dashboard's data source. Both derive from the same records.
- `benchmark` adds cost, token, architect-share, work, incident and wall rows.

## Records

`records/<NNNNN>-i<iteration>[-<slug>]-<step>-r<round>/` holds
`started.yaml` (written before the turn), `end.yaml` (commits it and seals its
files read-only) and `outcome.yaml` (the accepted agent outcome). Records are
append-only and never rewritten. Read a failed turn's directory before
relaunching; `end.yaml` names its stop and usage.

Steering is the mailbox. The architect reads `mailbox/inbox/` at a boundary,
moves the file to `mailbox/processed/` and writes its answer to
`mailbox/outbox/steer-<id>.md`. `urgent: true` frontmatter drains new dispatch,
lets in-flight tasks finish and surfaces the steer as `[urgent]` at the next
consult. A hold file in `mailbox/holds/` parks the named task until it is
resolved or removed.

## Exit codes and signals

`run` exits `0` goal done, `1` failure, `2` blocked, `3` iteration limit or a
promote stop, `130`/`143` interrupted by SIGINT/SIGTERM. The first signal
drains: no new dispatch, in-flight turns finish. The second aborts in-flight
turns and records their partial usage. A bounded launch ending in `3` is
normal; relaunch the same command to continue. A promote stop names the goal
build to promote: promote it, then relaunch the same command to continue.

See [config.md](config.md) for the layers and [SKILL.md](SKILL.md) for the
walkthrough.
