---
name: run-factory
description: Operate the software factory on a target repository — place the intent, configure the repo/process/run layers, launch bounded iterations, watch status, cost and the HTML dashboard, and steer a live goal. Use when asked to run the factory, start or resume a goal, inspect a parked goal, or configure a factory run.
---

# Run the factory

CLI: `bun bin/factory.ts` from `plugins/software-factory`. Goal commands take
`--repo <target>` and `--goal <kebab-name>`. State is derived from the goal's
task files and append-only records in the configured artifact store (a plain
folder by default); there is no daemon and no state file to repair.

## 1. Intent placement

- Write the WHAT, acceptance criteria and constraints in one Markdown file.
- `init --intent <file>` copies it to `<goal>/intent.md` in the artifact store; without
  `--intent` it writes a template. An existing intent is never overwritten.
- Edit `intent.md` between launches; the intent changes only by owner decision.
- Never pre-edit `plan.md`: the architect owns it. Plan problems go through
  `steer`.
- `run` refuses a goal whose `intent.md` is missing.

## 2. Config

Three layers, merged and validated with one report naming file and key:
[config.md](config.md).

- **Repo** — `.factory/repo.yaml`, tracked: base branch, artifact root, setup
  commands, gates and their formats.
- **Process** — package `config/process.yaml` plus `.factory/process.yaml`:
  flows, task types, boundary roles, plan review.
- **Run** — transient: aliases, harnesses, limits, roots, prices. Defaults to
  `.factory/run.yaml`; `--run-config` or `FACTORY_RUN_CONFIG` selects another.
- Worktree and session roots belong to the run layer and must be outside the
  repo; pre-flight refuses a root inside it.
- The whole factory is assumed to run inside a sandbox:
  [sandbox.md](sandbox.md).

## 3. Launch

Run from `plugins/software-factory` and set `REPO` to the target checkout. The
block below is the operator walkthrough; an automated walkthrough test runs the
same lines on the fake harness.

```bash run-factory-walkthrough
bun bin/factory.ts init --repo "$REPO" --goal demo --intent "$REPO/INTENT.md"
bun bin/factory.ts steer --repo "$REPO" --goal demo "$REPO/notes.md"
bun bin/factory.ts run --repo "$REPO" --goal demo --run-config "$REPO/.factory/run.yaml" --iterations 1
bun bin/factory.ts status --repo "$REPO" --goal demo
bun bin/factory.ts status --repo "$REPO" --goal demo --json
bun bin/factory.ts benchmark --repo "$REPO" --goal demo
```

- `init` writes `.factory/repo.yaml` when missing, creates the goal layout and
  copies the intent.
- `run` pre-flights (models, effort, fallbacks, binaries, roots, base gates),
  takes the goal lock, recovers interrupted records and stale worktrees, then
  alternates boundary consults with task dispatch.
- `--iterations N` bounds the launch; exit `0` done, `1` failure, `2` blocked,
  `3` iteration limit or a promote stop, `130`/`143` signal. Exit `3` is normal
  for a bounded launch: relaunch the same command to continue (a promote stop
  first needs the named build promoted).
- One launch can run minutes to hours; redirect its output to a file.

## 4. Dashboard location

- `status` — derived goal state, one line per task, every parked cause and the
  last summary path. It launches nothing.
- `status --json` — prints `status.json`, the snapshot the kernel rewrites
  after each agent launch and finish.
- Dashboard — `<artifact root>/<goal>/dashboard.html`, a static page rendered
  beside `status.json`. Pico CSS and Chart.js are vendored under `vendor/` and
  loaded locally; it leads with the PM's latest summary (or the kernel's
  mechanical account when none was written) and reads the architect's
  `iterations/<n>/intent-status.json` as one input. Open it in a browser and
  refresh it; it updates only when the kernel writes a snapshot.
- `benchmark` — cost, tokens, architect share, cost per merged task, work,
  incidents and wall time.
- Iteration record — `<artifact root>/<goal>/iterations/<n>/summary.md` and
  `metrics.yaml`.
- [kernel.md](kernel.md) — command surface, goal layout, records, exit codes.

## 5. Steers

- `steer --repo … --goal … <file|->` drops a file into `mailbox/inbox/`
  atomically. The architect reads it at the next boundary and answers in
  `mailbox/outbox/steer-<id>.md`.
- A steer whose file starts with `urgent: true` frontmatter is not answered by
  the PM: dispatch stops starting new work, in-flight tasks finish, and the next
  consult reads it as `[urgent]`.
- Failed turn: open its `records/<n>-…/` directory (`started.yaml`, `end.yaml`,
  `outcome.yaml`, logs) before relaunching.
- `factory validate [--run-config <file>] [<file>]` checks one
  schema-enforced file with the gate's validators; `factory schemas --out <dir>`
  writes JSON Schemas for editors and the artifact LSP.

## 6. Prompt templating

Role prompts are LiquidJS templates rendered from `prompts/*.md` fragments.
`{{ name }}` interpolates one value; `{% include 'partial-name' %}` inlines
`prompts/partial-name.md`. Strict mode: an unknown variable or filter is a
render error. Turn variables live in the final `## This turn` block so the
stable prefix stays cacheable; renderer defaults (schemas, task types, tiers)
are supplied by the library, never passed by turn code.

- `factory variables --out <file>` regenerates `prompts/VARIABLES.md`, the
  per-prompt variable reference.
- The process config's `promptsDir` shadows prompt files from a repo
  directory.
- `calibration` is the default calibration partial; the process config may
  replace its content per repo without changing the template.
- Shared fragments (`scope`, `plan-read-only`, `task-size`, `outcome`,
  `task-frontmatter`, `clean-code`, `finding-standards`) exist once and are
  included by every prompt that needs them.
