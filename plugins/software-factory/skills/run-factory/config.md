# Config

Merged in order: package defaults, then the repo layer, then the run layer.
Every layer is validated on load and one report names the file and key that
failed. `factory validate <.factory/repo.yaml|run.yaml|process.yaml>` checks
one file with the gate's validators; for a repo, process or run file it also
checks the three layers together (see
[Validating a run config](#validating-a-run-config)).

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
codingRules: .factory/prompts/coding-rules.md  # optional; replaces the factory default clean-code partial
```

- Gate `env` values are worktree-relative directories; the kernel creates them
  and exports absolute paths, so two worktrees never share one.
- `format.junit` is exported as `FACTORY_JUNIT_PATH` before the command runs; a
  missing, empty or unreadable report is red. `pattern` is `pytest`, `jest` or
  `cargo`.
- Gates run once on the base; a red base is recorded and warned once, not fatal.
- With no `gates` configured, the goal's `infra.yaml` (written by the shipped
  `infra` ingestion step) supplies the commands the task runs; a configured gate
  always wins, and the infra turn's observed red/flaky status is advisory.
- A launch that resolves no gate stops before dispatch with that cause; set
  `requireGates: false` on the repo layer when the repository intentionally runs
  none.
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
  development: { flow: implement-review, kind: development, schema: outcome, useWhen: "change meant to land in the repo and merge after QA and review" }
  spike: { flow: spike, kind: spike, schema: outcome, useWhen: "question only evidence answers — finished with findings and never merged" }
  # An operator barrier: no flow turn runs; its readiness drains the launch and
  # stops it so the operator promotes the build before dependent work starts.
  promote: { flow: spike, kind: spike, schema: outcome, nogit: true, promote: true, useWhen: "a landed batch needs a build promotion before the work depending on it starts" }
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
- `nogit: true` on a spike task type marks work whose product may live outside
  git: the task finishes without a committed report and never merges. The shipped
  `fact-finder` and `poc` types use it; `computer-use` is a development type
  with an extra browser acceptance turn before QA.
- `promote: true` on a spike task type makes it an operator barrier: no flow
  turn runs, the task's readiness drains the launch (in-flight turns finish,
  nothing new starts) and stops it so the operator promotes the goal build,
  then relaunches. The stop records the task finished, so the relaunch
  continues with the work depending on it. A promote type must be a spike: it
  never merges.
- `boundary` and `architecture` name the kernel turns. Every boundary step is
  required in the merged layer; the package default supplies them.
- `ingestion` names the goal-start sequence: `branch` first, exactly one
  `front`, then configured agent steps such as the shipped `infra` (gate
  discovery and status) and `scout` (`when: [bigger]`); `when` cannot appear
  ahead of `front`.
- `reminders` (default 1) bounds missing-outcome reminders; `repairPrompt`
  names the default missing-outcome template; `promptsDir` shadows prompt files
  from a repo directory; `sagaTaskCount` (default 20) is the task count past
  which the architect prompt reminds him to weigh a saga.
- `presets` defines named calibration text; the run layer's `preset` selects
  one.

## Run layer — `.factory/run.yaml` or `--run-config`

Transient: model aliases, harness bindings, limits and the roots for this
launch. `--run-config <file>` and `FACTORY_RUN_CONFIG` override the default
`<repo>/.factory/run.yaml`.

```yaml
extends: base.yaml                                   # paths resolve from this file
aliases:
  architect: { harness: omp, model: anthropic/claude-opus-5-5, effort: xhigh, fallbacks: [{ model: anthropic/claude-sonnet-5-5, effort: high }] }
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
quota: { resetMinutes: 300, maxResetMinutes: 1440, perSubscription: { opencode-go: 60 } }
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
  `timeouts`; a fallback may name another alias. A role's fallback chain walks
  the subscriptions whose roles fit it; architecture is the exception and falls
  back only within its own subscription.
- `harnesses.<id>` binds an `acpx:` adapter or an executable and passes
  `options` untouched. Every harness entry must declare `compaction`; its
  `enabled` flag turns session compaction on or off for that harness; disabling
  it requires a `reason`, an acpx harness that enables it needs
  `acpx.compact: true`, and `reviewIterations: [1, 2]` limits review compaction
  to those 1-based rounds. `sessions.retention` is the
  provider cache TTL (`auto|short|long|none`, required in a declared `sessions`
  block); only `short`/`long` give a hot window, so `auto` and `none` do not
  compact. The factory repository's `bootstrap/run/base.yaml` and
  `bootstrap/run/self.yaml` are complete examples.
- `limits`: `iterations` (default 1), `concurrency`, `planCheckRounds`,
  `resumeAttempts`, `parkAmends`, `turns`, `wallMinutes`, `iterationUsd`,
  `turnMinutes`, `iterationMinutes`, `steerDebounceSeconds`,
  `minTmpFreeBytes`.
- `quota`: a quota stop's pool is latched until the provider-stated reset
  (capped by `maxResetMinutes`), or for the pool's `perSubscription` interval
  when the stop states none, else `resetMinutes` (default 300). The latches
  live in `<sessions.dir>/quota-pools.yaml`, outside every goal directory, so
  another goal on this machine skips the same pool; a pool whose interval
  passes is probed once, and a serving probe frees it.
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

## Validating a run config

`factory validate --run-config <file>` is the operator's check for a real run
config (and for the repo and process files beside it). A run file named
`run.yaml` also validates positionally; any other name needs the flag, as in
`factory validate --run-config ../../bootstrap/run/self.yaml`. That flag
also selects the run layer when a repo or process file is the positional
file. It never launches a harness:
no process is spawned, no model list is probed, no pool is called. It loads
the three layers exactly as a launch would and reports, naming the owning
file and key:

- every alias the process layer requires (boundary steps, architecture
  reviewers, flow steps, alternates, different-model follow-ups) that the run
  layer does not define;
- every task type that names a flow or a kernel outcome schema the process
  layer does not define, and every follow-up declared on the trivial flow,
  which never follows up;
- every quota pool an alias or a literal fallback tier draws on that
  `limits.concurrency.perSubscription` does not define, a tier that changes
  the primary without naming its pool or `sharesPool`, and a `sharesPool` with
  no alias subscription to share;
- `aliases.<name>.escalateTo` and `aliases.<name>.fallbacks[<n>].alias` that
  name a run-config alias that does not exist, and escalation and fallback
  chains that cycle;
- `scouts` while no alias or fallback tier runs on omp;
- an alias, rotation entry or explicit fallback tier on a harness the launch
  does not register;
- a `portability` edge whose endpoint no harness registers;
- malformed acpx `options.args`/`options.env`;
- every executable a registered harness declares (a harness entry's `binary`,
  a raw acpx `agent`, omp and its YAML server) that is not executable; a bare
  alias, rotation or fallback harness with no declaration is the registration
  finding, not a missing executable;
- a `worktreeRoot` or `sessions.dir` inside the repository, or a configured
  root that is not writable.

A scratch run file outside a repo is checked against the process defaults and
an optional `--repo` fallback; a file inside a repo is checked against that
repo's process override. A scratch file has no repository roots to judge, so
those checks need a repo file or `--repo`. The checks are the launch
pre-flight's non-model list; the pre-flight also does the live checks (model
lists, effort probe, base branch, base gates), while this command launches
nothing and probes no model.
