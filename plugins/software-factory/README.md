# Software Factory

The factory runs one goal as bounded iterations. An iteration is one
architect consult (plan) plus the task dispatch it starts. When the dispatch
set runs out with fresh parks, the PM decides each one in the same iteration —
amend on its kept branch with the park's evidence, replace, split, cancel, or
leave for the architect — whether or not the wave merged anything. An amended
task reruns on its kept branch, after merging a moved head in its first turn,
and on its step's next alternate. When open work remains, the boundary runs
the plan checker first: a `progress` verdict resumes dispatch without a
consult, bounded by `limits.planCheckRounds`; the consult runs on `architect`,
when nothing is open, or when the bound is hit. State is derived from task
files and append-only records; there is no state file to repair. After the
first iteration a pack-preparer turn turns the script's full status data into
the iteration's index pack; when it fails, it tries its alias fallback chain before the
script renders a bounded index pack and the fallback is recorded as a glitch.

## Commands

```bash
cd plugins/software-factory
bun bin/factory.ts init   --repo <path> --goal <name> [--intent <file>]
bun bin/factory.ts run    --repo <path> --goal <name> --run-config <file> [--iterations N]
bun bin/factory.ts status --repo <path> --goal <name> [--json]
bun bin/factory.ts benchmark --repo <path> --goal <name>
bun bin/factory.ts steer  --repo <path> --goal <name> <file | ->
bun bin/factory.ts validate [--step <id>] <file>
bun bin/factory.ts schemas --out <dir>
bun bin/factory.ts variables --out <file>
```

`init` writes `.factory/repo.yaml` if missing, creates the goal directory and
copies the intent (or writes a template). `run` pre-flights, takes the goal
lock, recovers interrupted work and runs the iteration loop. `status` prints
derived state and parked causes; `--json` prints `status.json`, the snapshot
the kernel rewrites after each agent launch and finish, together with the
static `dashboard.html` rendered beside it; `benchmark` prints one
goal's benchmark rows;
`steer` drops a file into the inbox atomically. `validate` checks one
schema-enforced file with the gate's validators (tasks/*.md with its
directory's dependency graph and flow existence against the merged process
config, class.yaml, outcome.yaml keyed by the step in the sibling
started.yaml or `--step`, mailbox/holds/*.yaml, repo.yaml, run.yaml,
process.yaml); exit 0 valid, 1 invalid or unknown kind. `schemas` writes every
kernel file schema as JSON Schema (`task`, `outcome`, `qa`, `hold`, `class`, `repo`,
`run`, `process`) into `--out` for editors and the artifact LSP. `variables`
renders `prompts/VARIABLES.md` from the typed prompt-variable descriptor; the
prompt tests fail when the committed file differs from that render.

Exit codes for `run`: `0` goal done, `1` failure, `2` blocked, `3` iteration
limit, `130`/`143` interrupted by SIGINT/SIGTERM. The first signal drains (no
new dispatch, in-flight turns finish), the second aborts in-flight turns and
records their partial usage.

## Skill

`skills/run-factory/SKILL.md` is the operator skill: where the intent goes,
which layer configures what, what to launch, what to watch and where the HTML
dashboard is. Its resources are [kernel.md](skills/run-factory/kernel.md)
(commands, goal layout, records, exit codes) and
[config.md](skills/run-factory/config.md) (the three layers); its walkthrough
commands run green on the fake harness in the test suite.
[sandbox.md](skills/run-factory/sandbox.md) documents the
run-inside-a-sandbox assumption.

## Configuration

Three layers, all validated with one report naming file and key.

**Repo** — `.factory/repo.yaml`, tracked:

```yaml
baseBranch: main
artifactRoot: .factory/artifacts
artifacts:                      # optional; defaults to a gitignored folder
  backend: folder               # folder | same-repo | git-repo
  root: .factory/artifacts      # optional; defaults per backend
  remote: ../factory-artifacts.git  # git-repo only: local path or URL
setup: [bun install]
gates:
  - id: unit
    command: pytest --junitxml=reports/junit.xml
    format: { junit: reports/junit.xml }         # report the command writes
  - id: integration
    command: jest --ci
    format: { pattern: jest }                    # runner whose output it parses
    serial: [database]                          # same-named gates in one worktree never overlap
    env: { TMPDIR: .cache/gate }                # per-worktree scratch directory
cleanliness:                                    # optional; default rules active without it
  maxFileSizeBytes: 1048576                     # default: 1048576 (1 MB)
  allowedExtensions: [ts, json, md]             # default: extensions present in base tree
  maxOutOfScopeFiles: 3                         # default: 3
```

Cleanliness checks run by default without repo config to detect large files, disallowed/new extensions, temp/weights/huge outputs, and excessive files out of task scope. A cleanliness hit sends the author one revision follow-up turn (fix or justify) before review; if justified, the task advances to review without re-looping and the reviewer evaluates the justification. Tightened thresholds may be configured under `cleanliness` in `.factory/repo.yaml`.

The tracked repo layer names no worktree root: checkouts, sessions and harness
policy belong to the run layer, so one checkout never silently shadows another.

`artifacts.backend` selects storage by name, never by where a path happens to
point. `folder` (the default) keeps the root a plain directory and writes a `*`
`.gitignore` when it sits inside the repo. `same-repo` requires a root inside
the repo and commits every kernel write to the main checkout's branch, so
orchestration artifacts are never left unmerged on a task branch; the store
replaces its own folder `.gitignore` and commits nothing under `sessions/`,
`logs/`, `raw/` or a `.jsonl`/`.log`/`.tmp` name. `git-repo` keeps a separate
repository at `root` (default `<worktreeRoot>/artifacts`, outside the repo),
clones `remote` when the checkout is absent, commits every write there and
pushes it; a local bare repository needs no network. A same-repo root must be
inside the repository and a git-repo root outside it, so one repository never
absorbs the other's history; the same-repo root must also not be ignored by the
repository (the store replaces only its own folder `.gitignore`).

Gate runs in different worktrees run in parallel. A gate waits only for the
mutexes it names in `serial`, and same-named gates serialize within one worktree
only: two worktrees never wait on each other's mutex, and a gate that names none
never waits. `env` maps variable names to worktree-relative directories; the
kernel creates them and exports absolute paths, so two worktrees get two
directories.

A gate's `format` gives its failures identities that survive assertion values
and timings, so a red inherited from the base is not blamed on the task:

- `junit: <path>` names a worktree-relative report the command writes before it
  exits. The kernel exports the absolute path as `FACTORY_JUNIT_PATH`, reads the
  same file after the run, and stores its cases (capped, failing cases first).
  Any runner that emits JUnit works: bun, pytest, jest-junit, nextest.
- `pattern: pytest | jest | cargo` parses that runner's printed failure lines
  when it writes no report. A gate may declare both; the report wins when it
  names a failure.

A JUnit red's summary names its failing cases, and a missing, empty or
unreadable report is red rather than a silent pass. Records written before
`details.junit` existed still classify by their output lines.

**Process** — package `config/process.yaml`, optionally overridden by
`.factory/process.yaml`:

```yaml
flows:
  implement-review:
    steps:
      - { id: implement, prompt: implementer, alias: implementer }
      - { id: qa, prompt: qa, alias: qa, qa: true, changeRequests: 2, deliverable: verdict }
      - { id: review, prompt: reviewer, alias: reviewer, review: true, changeRequests: 2 }
      - { id: resolve, prompt: steward, alias: steward }   # merge-conflict turn only
taskTypes:
  development: { flow: implement-review, kind: development, schema: outcome }
boundary:                       # the kernel turns outside any task flow
  architect: { prompt: architect, alias: architect, repairPrompt: architect-repair, deliverable: "plan edit or stop decision" }
  digest: { prompt: digest, alias: digest }
  front: { prompt: front, alias: pm, deliverable: "class, task, and pack" }
  intent: { prompt: intent, alias: intent, deliverable: "intent edit" }
  packprep: { prompt: pack-preparer, alias: pack-preparer, deliverable: "context pack" }
  plancheck: { prompt: plan-checker, alias: plan-checker, deliverable: "plan verdict" }
  pm: { prompt: pm, alias: pm, deliverable: "task files" }
  steward: { prompt: steward, alias: steward, deliverable: "merge resolution" }
architecture:                   # the plan review flow, before the PM derives tasks
  planReview: { prompt: review-architect, deliverable: "plan-review findings" }
  reviewers: [plan-reviewer]    # one fresh read-only review turn per alias
  architectReturn: on-technical-concerns  # or never
  planReturn: { prompt: architect-review-return, deliverable: "plan edit and marks" }
hierarchy:                      # 1 architect (the norm), or 2 with one subarchitect per epic
  depth: 1
  subarchitect: { prompt: subarchitect, repairPrompt: architect-repair, deliverable: "epic plan edit or stop decision" }
```

A step may name `repairPrompt` (the template its in-session repair ask
renders) and `deliverable` (the product the ask and the missing-outcome finding
name; default `outcome`, or `verdict` on an acceptance step). A `qa: true` step
carries its own outcome schema (`qa: {verdict: accept | changes, findings}`)
and acceptance duty; QA and the reviewer share the acceptance round, so a QA
change request costs the same round budget as a review's. QA's own test and
script edits are gated again before the reviewer reads the tree. The `resolve` step is
outside the normal agent sequence: a squash merge that conflicts runs one turn
that merges the head into the task branch and resolves it, then the task checks
and the merge retries. A second conflict parks, the wave-end steward remains the
fallback, and a resolution that changed files outside the conflict set goes
through QA and review before it lands. A step that names no
template renders the process-level `repairPrompt` (default `delivery-repair`).
The architect names `architect-repair` because its ask also requires the plan
edit on disk; the default template then carries no role branch.

`hierarchy.depth: 2` makes the architect register in `plan.md` live: one
bullet per epic (`- epic \`auth\` | architect \`subarchitect\` | plan
\`epics/auth.md\` | scope \`src/auth/**\` | opened i7 | active`). The boundary
runs the main architect, then one subarchitect consult per active
`subarchitect` row on the architect alias — each with its own epic plan and
its own resumable, compacted session — then a plan review for every plan
that changed, then the PM. An epic with a prior plan is steered on a harness
whose caps advertise `subagents: steer` (omp with the subagent RPC surface):
the main architect launches it as a named child of its own session, the
script sends the consult over IRC, and the child's context is compacted
before the next launch revives it by name. Every other harness, and a new
epic's first consult, runs the separate written-report turn. A subarchitect
whose last decision was `done` and whose epic has no open task is left out
until a task reopens it. Each subarchitect's outcome paragraph is written to
`iterations/<n>/epics/<epic>/summary.md`. Depth 1 never parses the register
and keeps today's single-architect flow.

The `architecture` flow completes before the PM derives tasks. Each alias in
`reviewers` gets one fresh read-only review turn that delivers `planReview`
findings (`technical`, `planNotes`) and no verdict. With `architectReturn:
on-technical-concerns`, technical findings get one `planReturn` architect turn
that edits the plan and marks every finding; the findings never block the
iteration. With `never`, the findings reach the next architect's pack, which
asks for the same marks. The return runs on the architect boundary step's
alias; its prompt is `planReturn.prompt`.

The kernel adds one technical finding of its own: an in-place edit to the
bullet of a task whose file already exists. A task file is immutable outside
amend, so the finding names the one sanctioned fix — `cancelled:` plus a new
slug, or a `base` continuation — instead of letting the edit drop. The derive
turn stores each plan's bullets in `iterations/<n>/plan-bullets.json`; the
comparison catches a bullet or any of its nested lines. New, merged, cancelled
and unchanged bullets are not findings.

A flow step may name `alternates: [<alias>…]` to change the model on retry:
the step's alias runs first, and after each failure-kind launch — no outcome
after the reminders, an agent-declared `failed`/`blocked`, or fix rounds
exhausted on red gates — the next attempt at that step runs on the next
alternate, staying on the last one once the list is spent. The position is
derived from the step records, so an amend or a relaunch lands on the same
alternate; a turn that delivered after its reminder did not fail. An alternate
resolves its own fallbacks and quota pool, and a task `tier` still escalates
the producer.

A step may name `followUp` to decide how its later turn follows the one it
repairs — the productive step's fix turn, or a review round after the first.
`same-session` (the default) continues the step's own compacted session on its
alias; `de-novo` starts fresh; `different-model` runs the later turn on
`alias` without a session, or with `keepSession: true` continues the step's
compacted session across the switch when the portability graph admits it (the
same harness always, another harness only along a declared edge). The prompt
stays the step's: the retry changes the model, not the role. Pre-flight refuses
`followUp` on a step of the trivial flow (`just-implement`): a trivial task
implements in the front's session, so the step never follows up.

**Run** — transient, passed with `--run-config`:

```yaml
extends: base.yaml                                   # inherit the shared aliases, harnesses and roots
aliases:
  architect: { harness: opencode, model: opencode/minimax-m3.1-flash-free, effort: high }
  implementer: { harness: opencode, model: opencode/deepseek-v4.1-flash-free }
priceIds:                                            # harness model id -> OpenRouter id, when matching cannot resolve
  opencode/beam-free: reflection/beam-1.0-501b-a23b
limits:
  concurrency: { overall: 3, perSubscription: { opencode-go: 2 }, perModel: {} }
  iterations: 1
  iterationUsd: 5
sessions: { dir: ~/.local/share/factory/sessions, keepRuns: 5, retention: short }
quota: { resetMinutes: 300 }                         # fallback cooldown; a stated reset wins; maxResetMinutes caps it
worktreeRoot: ~/.local/share/factory/worktrees
lsp: true                                             # artifact LSP on omp
scouts: { model: opencode-go/deepseek-v4.1-flash }   # omp architect subagents
portability: [{ from: opencode, to: omp }]           # sessions cross only declared edges
```

`extends: <file>` composes the run layer from a base. The path resolves relative
to the file that names it, a base may extend another, and the child's keys win.
Objects merge key by key and arrays replace, so a variant restates only the
alias field, harness entry or price-id row it changes; a `null` removes an
inherited key (`scouts: null`, `fallbacks: null`). A missing base and an
`extends` cycle are refused when the config loads, naming the file.
`bootstrap/run/base.yaml` carries the shared self-run aliases, the unattended
omp policy, the price-id rows and the roots; every other shipped file is a thin
overlay.

A task session resumes on the harness that recorded it. `portability: [{from, to}]`
declares further directional edges: a session recorded on `from` may resume on
`to`, while every other pair starts de novo with the rendered prompt. Pre-flight
refuses an edge whose endpoint names no registered harness.

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
with one question for the architect. The untouched graph is validated before
the first rung: a finding the graph already raised fails no rung, so a turn that
introduces none keeps its valid writes and its plan cancellations and the
ladder ends routing those findings to the architect instead of blocking the
goal. Without `escalateTo` the iteration blocks with every rung in the summary.
`fallbacks` stay infrastructure-only (quota and crash), so escalation is model
routing, not a retry. Each fallback tier either
names its own model, harness and effort, and the quota pool it draws on, or
names another alias (`{ alias: backup }`) and reuses that alias's whole ladder,
each of its tiers keeping its own quota pool; pre-flight refuses a missing alias
or a fallback cycle. A tier that changes the primary's harness or model cannot
inherit the alias's subscription: it must name its own `subscription` or set
`sharesPool: true` to draw on the alias's, or its pool key is `harness+model`.
Pre-flight refuses an alias that names a subscription and such a tier with
neither declaration. A tier that keeps the primary's harness and model keeps
inheriting the alias's subscription. A turn that lands on a tier keeps the
launch on it, and dispatch throttles each pool and model within the overall
limit.

A tier that answers quota latches its pool. The stop's stated reset
(`Resets in 130h19m23s`, `Resets in 33m53s`, `retry-after-ms=38240413`) sets
that pool's cooldown, capped by `quota.maxResetMinutes` when the run config sets
one; a stop whose text names no parseable reset falls back to
`quota.resetMinutes` (default 300) from the stop. A quota stop is final for the
pool: a stated wait inside the retry window (`maxDelayMs`, 8 s) sleeps in full
and retries once, and a quota stop again on that retry latches; a stop naming no
wait, or a wait beyond the window, latches at once after one call. Every retry
and every tier call reads the latch, so a latched pool makes no call and a
later, shorter reset never shortens the stored one. A later tier drawing on a
different pool is still called. The latch is visible in memory before the store
write. The launch stores the reset time in the goal's session store
(`quota-pools.yaml` beside the launch directories, so rotation keeps it), and a
relaunch before that time skips the pool and starts on the next tier. An alias
whose every tier is exhausted is unavailable: no harness call is made, and
dispatch defers that work under a cause naming the dead pools and their reset
times instead of probing the last dead tier.

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

`limits.parkAmends` (default 1) bounds how many times one parked slug may be
amended in a single iteration. The PM's stall brief lists the amends already
spent (`amends: <used> of <limit>`); at the limit an amend is refused and the
park must be replaced, split, cancelled or left for the architect.

`limits.minTmpFreeBytes` (default 2 GiB) is the free space the temp directory
(`os.tmpdir()`, so `TMPDIR` is respected) must hold. Below it, `run` exits 1
before it writes any session, lock or record, with a cause naming the
directory, the free bytes and `operator: purge <tmpdir>`.

A relaunch into an interrupted iteration resumes it as a recorded attempt (a
`resume` script record) bounded by `limits.resumeAttempts` (default 2). It
refuses, with a `resume-refused` record naming the cause, when attempts are
spent, the previous resume started no task turn or architect ruling, the
iteration's latest plan-check is `architect`, every ready task is held by a
pending steer, a hold file is unreadable, or a goal hold or iteration brake
stands. A refused resume goes straight to the boundary at the next iteration.
An architect route (a stall waits for the architect too) or an underivable graph
finding from the resume's steer turn runs the boundary before dispatch in the
same iteration, and that ruling counts as the pass's progress. A resumed pass that starts no task turn and runs no
boundary does not consume the `iterations` budget: the boundary runs next in the
same launch.

Pre-flight resolves every alias (and fallback) through the harness, checks the
model list, the effort level, binaries, the base branch, and that
session/worktree roots are writable and outside the repo. `effort` names a
literal level the model accepts, `auto`, or `harness-default` (omit the level);
`effort: highest` is refused. An omp `@` alias is the exception: omp resolves
it inside its own chain, so there is no catalog entry and no per-model effort
list; its effort must be one omp's `--thinking` flag parses (`off`, `minimal`,
`low`, `medium`, `high`, `xhigh`, `max`, `auto`) — or absent.

`harnesses.<id>` binds an adapter (`acpx:`) or executable and carries
`options` passed untouched: acpx reads `args`/`env` (pre-flight refuses an
`args` that is not a string array or an `env` that is not a string-to-string
map), omp merges the keys into its launch overlay (`sessions.retention` still
owns `providers.cacheRetention`). The shipped `bootstrap/run/base.yaml` keeps the
unattended omp policy there — memory/auto-learn/skills off, approval, disabled
providers, retry — so no policy is compiled in.

Every child a launch spawns runs on a fixed base environment (`PATH`, `HOME`,
temp dirs, bun/node caches, git's optional locks, locale) instead of the
factory's own, so provider keys and unrelated operator state never reach gates,
setup, git or harness processes. A run config adds names for harness and agent
children with `envAllowlist: [ANTHROPIC_API_KEY]`; a value set in an acpx
harness entry's `options.env` always reaches that child.

Gates run once on the base; a red base is recorded and warned once, not fatal.

## Goal directory

```
<artifact root>/<goal>/
  intent.md plan.md tasks/
  epics/<epic>.md           # one plan per architect scope; the goal plan's register names them
  records/                  # one directory per settled step and round: started/end/outcome
  mailbox/{inbox,processed,outbox}/
  iterations/<n>/{context-pack.md,summary.md,metrics.yaml}
  metrics.yaml
  status.json              # machine-readable snapshot for the CLI and dashboard
  dashboard.html           # static page rendered from status.json; no server
```

## Steering

`factory steer --goal demo notes.md` (or `-` for stdin) puts the file in
`mailbox/inbox` without a partial-file window. A steer that arrives while
dispatch runs gets one PM steer turn at the next poll. A steer that arrives
while nothing is in flight takes the same PM turn at the next boundary, before
the architect: the PM answers it, writes its task or spike, routes it to the
intent agent, or hands it to the architect. An `intent` route is carried into
`intent.md` first, and the architect's pack shows the diff and the steer
record. A steer the PM cannot route reaches the architect, who marks it
processed and writes its answer to `mailbox/outbox/steer-<id>.md`.

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

Each iteration writes exactly one `iterations/<n>/summary.md` (the outbox entry
references it): status, merged/finished/parked tasks, remarkable concerns,
assumptions and debt, and a waste section naming every wasted turn's record
with rebutted reviews counted apart. The next iteration's context pack carries
that waste section. `metrics.yaml` is rebuilt from the usage records;
`mailbox/outbox/metrics.yaml` references it: architect launches and turn count, architect
cost, token and turn share, cost and list cost per merged task, incident counts
(infra retries, fallback hops, outcome-repair turns, merge conflicts,
merged-gate failures, and round-limit, no-progress, empty-diff and overflow
parks), loop incidents (no-progress and empty-diff parks; a spike's empty
finish and overflow parks are not loop incidents), wasted turns by reason and
by role and alias (complete implementer failure; structure: protocol,
containment, outcome channel, infra; flaky-test rejection), rebutted review
turns counted apart as accepted tax, human interventions
(processed steers) and the observable
operator-act counter (steers plus containment outside-changes and
integration-moved merges), gate and commit wall time, and turns, tokens, cost
and work (committed files/lines) by role, alias and model, with gate runs
credited to the script role.
Costs come from the price table, and every retry or fallback call the
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

## Loop-based optimization

Loop-based optimization goals (such as algorithmic speedups, throughput tuning,
cache optimization, or memory reduction) run entirely on the shipped task types
(`spike`, `development`, `trivial`) and the standard boundary iteration loop with
no new configuration keys or custom flows:

- **Candidate spikes (`type: spike`)**: When exploring multiple or uncertain
  optimization approaches (e.g. SIMD vectorization vs. arena allocation vs.
  lock-free buffers), the architect plans parallel candidate spikes. Each spike
  runs in its own worktree on the researcher alias, benchmarks or prototypes the
  hypothesis against measurement commands configured in `repo.gates`, and
  commits quantitative findings and trade-offs to `.factory/spikes/<slug>.md`.
  Spikes finish without merging to the goal branch (`kind: spike`), ensuring
  unselected explorations leave no code diff or dead scaffolding in repository
  history.
- **Architect selection**: At the iteration boundary, the architect consult reads
  the context pack containing the committed spike reports (via `spikeFinding`),
  evaluates the empirical benchmark measurements against baseline, selects the
  winning approach, and rejects unviable or high-risk candidates.
- **Implementation (`type: development`)**: The architect schedules implementation
  tasks for the chosen approaches. The PM derives them, and they execute across
  worktrees under the `implement-review` flow, verifying performance against the
  target gates and passing QA and review before merging.
- **Cleanup tasks**: Merged optimization waves often deprecate legacy code paths,
  scalar fallbacks, temporary fixtures, or transitional profiling hooks. Post-merge
  cleanup is scheduled by the architect in the subsequent iteration as standard
  `development` (or `trivial`) tasks. Because tasks execute in isolated worktrees
  and cannot predict concurrent wave changes, cleanup after a wave belongs cleanly
  at the next boundary rather than within the individual optimization tasks.
- **Loop convergence**: The boundary repeats this cycle—characterizing updated
  baselines, testing candidate variations, merging winners, and cleaning
  transitional debt—until the architect verifies that performance targets are
  achieved and declares the goal done.
