# Config

Merged in order: package defaults, then the repo layer, then the run layer.
Every layer is validated on load and one report names the file and key that
failed. `factory validate <.factory/repo.yaml|run.yaml|process.yaml>` checks a
layer with the gate's validators.

## Repo layer — `.factory/repo.yaml`

Tracked. Names the base branch, the artifact backend and root, the setup
commands and the gates every task branch runs.

```yaml
baseBranch: main
artifactRoot: .factory/artifacts
identity: { name: Factory, email: factory@example.com }   # optional commit identity
setup: [bun install]
gates:
  - id: unit
    command: bun test --reporter=junit --reporter-outfile=reports/junit.xml
    format: { junit: reports/junit.xml }       # report the command writes
  - id: integration
    command: bun test test/integration
    format: { pattern: jest }                  # runner whose printed failures parse
    serial: [database]                         # gates naming a mutex never overlap
    env: { TMPDIR: .cache/gate }               # per-worktree scratch directory
cleanliness:                                   # optional
  maxFileSizeBytes: 1048576
  allowedExtensions: [ts, json, md]
```

- Gate `env` values are worktree-relative directories; the kernel creates them
  and exports absolute paths, so two worktrees never share one.
- `format.junit` is exported as `FACTORY_JUNIT_PATH` before the command runs; a
  missing, empty or unreadable report is red. `pattern` is `pytest`, `jest` or
  `cargo`.
- Gates run once on the base; a red base is recorded and warned once, not fatal.
- The tracked layer names no worktree root: checkouts and sessions belong to
  the run layer.
- `artifacts` selects the store by backend name, not by path:

  ```yaml
  artifacts:
    backend: same-repo               # folder (default) | same-repo | git-repo
    root: .factory/artifacts         # optional; defaults per backend
    remote: ../factory-artifacts.git # git-repo only: local path or URL
  ```

  `folder` keeps a plain, gitignored directory. `same-repo` requires a root
  inside the repo and commits every kernel write to the main checkout's branch,
  so artifacts never sit unmerged on a task branch. `git-repo` keeps a separate
  repository (default root `<worktreeRoot>/artifacts`, outside the repo),
  clones `remote` when absent, and commits and pushes every write. Both git
  backends never commit sessions, logs or raw agent I/O.

## Process layer — `config/process.yaml` and `.factory/process.yaml`

The package file is the default; the repo file is an optional override. The
override merges key by key, so it may retarget one flow, boundary step or
architecture field without restating the rest.

```yaml
flows:
  implement-review:
    steps:
      - { id: implement, prompt: implementer, alias: implementer, alternates: [implementer-b] }
      - { id: qa, prompt: qa, alias: qa, qa: true, changeRequests: 2, deliverable: verdict }
      - { id: review, prompt: reviewer, alias: reviewer, review: true, changeRequests: 2, deliverable: verdict }
      - { id: resolve, prompt: steward, alias: steward }   # merge-conflict turn only
taskTypes:
  development: { flow: implement-review, kind: development, schema: outcome }
  spike: { flow: spike, kind: spike, schema: outcome }
boundary:                        # kernel turns outside any task flow
  architect: { prompt: architect, alias: architect, repairPrompt: architect-repair, deliverable: "plan edit or stop decision" }
  front: { prompt: front, alias: pm, deliverable: "class, task, and pack" }
  pm: { prompt: pm, alias: pm, deliverable: "task files" }
architecture:                    # plan review, before the PM derives tasks
  planReview: { prompt: review-architect, deliverable: "plan-review findings" }
  reviewers: [plan-reviewer]
  architectReturn: on-technical-concerns
  planReturn: { prompt: architect-review-return, deliverable: "plan edit and marks" }
```

- A flow step names the prompt it renders and the run-config alias it runs on.
  `alternates: [alias…]` changes the model after a failure-kind launch;
  `followUp` chooses `same-session` (default), `de-novo` or `different-model`.
- `qa: true` makes the step an acceptance turn with its own verdict schema;
  `review: true` makes it a review turn. A `resolve` step runs only after a
  squash merge conflicts.
- `boundary` and `architecture` name the kernel turns. Every boundary step is
  required in the merged layer; the package default supplies them.
- `reminders` (default 1) bounds missing-outcome reminders; `repairPrompt`
  names the default missing-outcome template; `promptsDir` shadows prompt files
  from a repo directory.
- `presets` defines named calibration text; the run layer's `preset` selects
  one.

## Run layer — `.factory/run.yaml` or `--run-config`

Transient: model aliases, harness bindings, limits and the roots for this
launch. `--run-config <file>` and `FACTORY_RUN_CONFIG` override the default
`<repo>/.factory/run.yaml`.

```yaml
extends: base.yaml                                   # paths resolve from this file
aliases:
  architect: { harness: omp, model: anthropic/claude-opus-5-5, effort: high }
  implementer: { harness: opencode, model: opencode/deepseek-v4.1-flash-free }
  implementer-b: { harness: omp, model: opencode-go/deepseek-v4.1-flash, effort: max }
harnesses:
  opencode:
    acpx: { agent: opencode acp, raw: true, compact: true, usage: { cache: true } }
    compaction: { enabled: true }
  omp:
    options: { defaultThinkingLevel: low, memory: { backend: off } }
    compaction: { enabled: true }
limits:
  iterations: 1
  concurrency: { overall: 3, perSubscription: { opencode-go: 2 }, perModel: {} }
  iterationUsd: 5
sessions: { dir: ~/.local/share/factory/sessions, keepRuns: 5, retention: short }
quota: { resetMinutes: 300, maxResetMinutes: 1440 }
worktreeRoot: ~/.local/share/factory/worktrees
lsp: true
priceIds: { opencode/beam-free: reflection/beam-1.0-501b-a23b }
envAllowlist: [ANTHROPIC_API_KEY]
```

- `extends` composes from a base; the path resolves from the file that names
  it, objects merge key by key, arrays replace, and `null` removes an inherited
  key. A missing base and a cycle are refused by name.
- An alias may carry `effort`, `fallbacks` (infrastructure-only: quota,
  crash), `rotate` (per-iteration primary), `escalateTo` (PM ladder) and
  `timeouts`; a fallback may name another alias.
- `harnesses.<id>` binds an `acpx:` adapter or an executable and passes
  `options` untouched. `compaction.enabled` turns session compaction on or off
  for that harness; disabling it requires a `reason`, an acpx harness that
  enables it needs `acpx.compact: true`, and `reviewIterations: [1, 2]` limits
  review compaction to those 1-based rounds. `sessions.retention` is the
  provider cache TTL (`auto|short|long|none`, required in a declared `sessions`
  block); only `short`/`long` give a hot window, so `auto` and `none` do not
  compact. The factory repository's `bootstrap/run/base.yaml` and
  `bootstrap/run/self.yaml` are complete examples.
- `limits`: `iterations` (default 1), `concurrency`, `planCheckRounds`,
  `resumeAttempts`, `parkAmends`, `turns`, `wallMinutes`, `iterationUsd`,
  `turnMinutes`, `iterationMinutes`, `minTmpFreeBytes`.
- `worktreeRoot` defaults to `../.factory-worktrees/<repo-id>` beside the
  checkout; `sessions.dir` defaults to `<worktreeRoot>/.sessions`. Both must be
  outside the repo and writable.
- Every child runs on a fixed base environment; only names in `envAllowlist`
  (and an acpx entry's `options.env`) inherit from the factory.
- `portability: [{ from, to }]` declares harness edges a session may resume
  across. `scouts.model` pins the omp architect's subagent model.

## Pre-flight

`run` resolves every alias and fallback through its harness and checks the
model list, effort level, binaries, base branch, writable roots outside the
repo, the free space on `TMPDIR` (`limits.minTmpFreeBytes`, default 2 GiB) and
the base gates. A failure is reported before any session, lock or record is
written.

See [SKILL.md](SKILL.md) for the run walkthrough and [kernel.md](kernel.md) for
what the commands do.
