# Prompt variables

Template syntax: [LiquidJS](https://liquidjs.com), strict mode (unknown variable = render error; unknown filter = render error). `{{ name }}` interpolates one value; `{% include 'partial-name' %}` inlines `prompts/partial-name.md`. Every prompt is stable text up to its final `## This turn` block; turn variables live there so providers can cache the prefix, except the implementer's spike opening sentence, which names `report_path` before the body so the commit-first instruction is read first. Renderer defaults also appear above the block, so the prefix is stable only within one checkout and launch.

## Prompts and their partials

- `architect` — `architect-assignment` (`architect-bounds`), `architect-goal`, `architect-body` (`architect-turn`, `plan-standard` (`plan-history`, `task-size`), `architect-scope` (`plan-rules`, `calibration`)), `outcome`, `plan-review-marks`, `verdict`
- `subarchitect` — `architect-bounds`, `architect-epic`, `architect-body` (`architect-turn`, `plan-standard` (`plan-history`, `task-size`), `architect-scope` (`plan-rules`, `calibration`)), `outcome`
- `front` — `task-size`, `plan-read-only`, `calibration`, `outcome`, `task-frontmatter`
- `infra` — `plan-read-only`, `calibration`, `outcome`
- `intent` — `calibration`, `outcome`
- `pm` — `task-size`, `plan-read-only`, `spike-report-general`, `calibration`, `outcome`, `task-frontmatter`
- `implementer` — `cleanliness-revision`, `implementer-body`, `clean-code`, `scope` (`plan-read-only`), `calibration`, `outcome`
- `qa` — `implementer-body`, `qa-acceptance`, `qa-turn`
- `browser-qa` — `implementer-body`, `browser-tests`, `qa-acceptance`, `qa-turn`
- `reviewer` — `<author>-body` (`implementer-body` by default), `review-<author>` duties, `review-<author>-turn` inputs, `verdict`
- `review-architect` — `architect-assignment` (`architect-bounds`), `architect-body` (`architect-turn`, `plan-standard` (`plan-history`, `task-size`), `architect-scope` (`plan-rules`, `calibration`)), `finding-standards`, `outcome`
- `architect-review-return` — `architect-assignment`, `plan-review-marks`, `calibration`, `outcome`
- `digest` — `calibration`, `outcome`
- `steward` — `clean-code`, `calibration`, `outcome`
- `plan-checker` — `calibration`, `outcome`
- `pack-preparer` — `calibration`, `outcome`
- `scout` — `plan-read-only`, `calibration`, `outcome`

The shared definitions exist once as partials: `scope` (the predicted-area rule: out-of-area judgement, upscope condition; includes `plan-read-only`), `plan-read-only` (the plan, intent, other task files and records are read-only), `task-size` (what one task is: one implementer session, one seam, one reviewable diff, one done-when, and the split/merge criteria; included by `front`, `plan-standard` and `pm`), `calibration` (concerns and calibration, with `remarkable` inside it), `outcome` (the outcome contract, with a filled example and its alternative rendered from the kernel outcome schema), `task-frontmatter` (the task-file frontmatter shape rendered from the kernel task schema, plus the configured task types and tiers; included by the authoring roles), `clean-code` (the code standard; the repo layer's `codingRules` file replaces its content per repo while the fragment name stays fixed, so implementer, QA, steward and adjudicator prompts render the same rule text through their shared bodies), `remarkable` (the remarkable definition), `finding-standards` (the no-praise, no-restating, no-taste rule shared by both reviews), `qa-acceptance` (the acceptance duties and verdicts the code QA and browser QA share), `qa-turn` (the turn block those two QA prompts share), `browser-tests` (the browser-surface turn the browser QA adds before the code QA), `plan-review-marks` (the plan-review mark meaning, shared by the architect's turn and return), `plan-history` (merged work is history: what a merged bullet collapses to; included by `plan-standard`), `spike-report-general` (what a spike's done-when says; included by `pm` and `architect-body`), `verdict` (which step each of `verdict` and `decision` belongs to, for review and architect steps) and the role bodies `implementer-body` and `architect-body` (everything before the role's turn block; a reviewer includes its author's body by role name, so the plan review reuses the reviewer template over `architect-body`).

The architect's body is assembled from fragments so a reviewer and a subarchitect share the whole body: `architect-bounds` (the bounds), `architect-turn` (the consult's turn order, completeness check, stop decision and plan edit), `plan-standard` (what the plan carries and its granularity, with `plan-history` and `task-size`), `plan-rules` (debt, parked work and ADRs) and `architect-scope` (tiers and calibration, with `plan-rules` inside). `architect-body` is that shared body plus `outcome`; `architect-assignment` adds the top architect's role line before the bounds. `architect-goal` adds the top's scope (the whole goal, the register at depth 2, steers), and `architect-epic` adds the subarchitect's epic scope and upward brief. The plan reviewer includes `architect-assignment` and the whole `architect-body`; the architect's return includes `architect-assignment`.

`calibration` is the default calibration partial. The process config may replace its content per repo; the prompt template does not change.

Renderer defaults live outside any `This turn` block and the renderer supplies them, so turn code does not pass them: `validate_cmd` (the running build's absolute `bun <build>/bin/factory.ts validate`, stable only within one checkout), `outcome_schema` (a filled outcome YAML example and its alternative rendered from the task type's kernel output schema, or the QA step's own schema, and narrowed to the fields the step delivers, in the `outcome` partial), `task_frontmatter` (the frontmatter YAML skeleton rendered from the kernel task schema, in the `task-frontmatter` partial), `task_types` (configured task type names in config order with the flow, kind, output schema, nogit/promote flags and use-when each supplies, from the process config), `tiers` (run-config alias names in config order; `default` is kernel vocabulary for no tier override and stays literal), `depth` (`1` until the hierarchy config names `2`), `subagents` (the architect alias harness's `Caps.subagents`; `none` is the harness-generic default, and the steered hierarchy passes `steer` so only a steering harness renders the omp tool instructions), `author` (the reviewer's author role; it selects the `<role>-body` and `review-<role>` fragments) and `checks_result`/`checks_tree`/`checks_log` (the latest checks record's result, tree and log; a render with no checks record gets `no checks run`, `unknown` and `unknown`), and `base_gates` (the base tree's recorded gate result; a render with no base record gets `not recorded`, never a clean base). `author` defaults to `implementer`; the plan-review turn overrides it with `architect`. `class_types` is a turn-supplied variable above the block: the front turn renders the development types each class may write from the process config, the same types the validator enforces. The turn code supplies its own narrowed `outcome_schema` from the step's prompt, expectation and schema, so the role prompt and its repair ask show the same examples.

## architect.md

- `turn` — `first` on a new goal's first turn; `relaunch` on the first turn of a relaunch of the same goal; `boundary` otherwise
- `iteration` — 1-based iteration number of this launch
- `intent_path` — path to the goal's `intent.md`
- `plan_path` — path to the goal's own markdown plan; the file to edit
- `checkout` — path to the stable goal checkout (integration worktree)
- `pack_path` — path to the iteration context pack (index: status, short hashes, per-task rounds, infra, code facts, paths)
- `digest_path` — path to the previous launch's digest; empty string on a first launch
- `steers` — formatted pending steers: id, first line, file path; `none` when empty
- `outcome_path` — path where the outcome file must be written when the harness asks for a file
- `validate_cmd` — absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default
- `outcome_schema` — outcome examples from the kernel schema; renderer default
- `task_types` — configured task types with their flow, kind, output schema, nogit/promote flags and use-when; renderer default
- `tiers` — run-config alias names; renderer default
- `depth` — `2` renders the architect register; `1` (renderer default) leaves it out
- `subarchitect_block` — the rendered launch block naming each live subarchitect with its agent id and spawn name; empty when the harness cannot steer or no epic has a plan to review
- `saga_reminder` — the rendered consider-a-saga block, naming the goal's task count and the configured `sagaTaskCount`; empty at or below the threshold and when none is configured

## architect-subarchitects.md

Architect's steered-subarchitect block; omp text conditional.

- `subarchitects` — one row per epic: the epic id, the agent id `subarchitect`, and the exact spawn name the script steers
- `subagents` — the architect harness's `Caps.subagents`; `none` by default

## subarchitect-agent.md

Transient subarchitect definition; omp tool text is conditional.

- `subagents` — `Caps.subagents`; `steer` renders the omp tool text

The file opens with the agent's YAML frontmatter, so `biome.json` excludes it from markdown formatting: the formatter would re-indent the definition.

## subarchitect.md

One epic's architect, below the top architect: the same bounds, turn order, plan format, granularity, debt and stop rules, plus its epic scope and the upward brief. It edits only its own epic plan and reports `done` for the epic, never for the goal.

- `turn` — `first` on this epic's first turn; `relaunch` on the first turn of a relaunch; `boundary` otherwise
- `pass` — `report` on the bottom-up pass before the top's turn; `direction` on the top-down consult after it
- `iteration` — 1-based iteration number of this launch
- `epic` — the epic name from the parent's register, `[a-z0-9-]+`
- `intent_path` — path to the goal's `intent.md`
- `plan_path` — path to this epic's plan, `epics/<epic>.md`; the only plan the subarchitect edits
- `parent_plan_path` — path to the top architect's `plan.md`; read-only to the subarchitect
- `checkout` — path to the stable goal checkout (integration worktree)
- `pack_path` — path to this epic's context pack
- `digest_path` — path to the previous launch's digest; empty string when this launch has none
- `outcome_path` — path where the outcome file must be written when the harness asks for a file
- `validate_cmd` — absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default
- `outcome_schema` — outcome examples from the kernel schema; renderer default
- `task_types` — configured task types with their flow, kind, output schema, nogit/promote flags and use-when; renderer default
- `tiers` — run-config alias names; renderer default

## front.md

- `iteration` — 1-based iteration number of this launch
- `intent_path` — path to the goal's `intent.md`
- `plan_path` — path to the goal's own markdown plan; may not exist yet
- `tasks_dir` — directory where the one task file is written, `<slug>.md`
- `class_path` — path to `class.yaml`: `{ class: trivial|task|bigger, slug? }` beside the plan
- `pack_path` — path to the iteration context pack the front writes: the architect's input on `bigger`, the implementer's briefing on `trivial`/`task`
- `checkout` — path to the stable goal checkout the front reads
- `setup_command` — repository setup command; `none` when not needed
- `gate_commands` — configured gate commands as `- id: command` lines; `none` when empty
- `outcome_path` — path where the outcome file must be written when the harness asks for a file
- `validate_cmd` — absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default
- `outcome_schema` — outcome examples from the kernel schema; renderer default
- `task_frontmatter` — frontmatter YAML skeleton from the kernel schema; renderer default
- `task_types` — configured task types with their flow, kind, output schema, nogit/promote flags and use-when; renderer default
- `tiers` — run-config alias names; renderer default
- `class_types` — the configured development types each front class may write, rendered by the front turn
- `code_map_path` — path of the code map a `when: [bigger]` scout step wrote; `none` when no scout ran

## intent.md

- `iteration` — 1-based iteration number of the consult that carries the steer
- `intent_path` — path to the goal's `intent.md`, the only file the turn may edit
- `steer` — the pending steer as `- <id> (<relPath>):` plus its full indented text
- `outcome_path` — path where the outcome file must be written when the harness asks for a file
- `validate_cmd` — absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default
- `outcome_schema` — outcome examples from the kernel schema; renderer default

The turn's record carries the unified diff of the edit; the next architect pack renders it beside the pending steer.

## pm.md

- `iteration` — 1-based iteration number of this launch
- `epic` — the epic this PM derives for; empty for the top PM
- `epic_scoped` — `true` for an epic's PM, `false` for the top
- `intent_path` — path to the goal's `intent.md`, for resolving wording only
- `plans` — the plan this PM owns, one `- goal: <path>` for the top PM or ``- epic `<epic>`: <path>`` for that epic's PM; derive every bullet from the plan that carries it; read-only to the PM
- `plan_diff` — diff of the plan keyed by task slug against the previous derived plan (`none` on the first iteration or when the previous plan is missing)
- `tasks_dir` — directory where task files are written, one `<slug>.md` per task
- `existing_tasks` — existing task files as `- slug | status | hash | deps: a,b` lines (`none` when empty); merged/finished lines end `frozen (read-only)`, cancelled `read-only (spent)`, steer tasks `steer <id>`, stall continuations `stall <n>`, plan-check follow-ups `plan-check <n>`
- `repair` — the script validator's findings from the previous ask; empty string on the first ask and on steer turns
- `steers` — pending steers as `- id (file):` plus indented full text; `none` on a derive, stall or plan-check turn
- `stalls` — this iteration's undecided parks as one entry per slug (cause, record paths, kept branch, spent turns, amends used of the limit, the cause's default action, done-when); `none` except on a stall turn
- `concerns` — open concerns no wave-end turn has marked yet, one per line
- `plan_checks` — checker follow-ups as one entry per slug (kind, reason, cause, record paths, kept branch, spent turns, amends used of the limit, the cause's default action, done-when); `none` except on a plan-check turn
- `holds_dir` — directory for one `<id>.yaml` hold per steer or concern
- `outcome_path` — path where the outcome file must be written when the harness asks for a file
- `validate_cmd` — absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default
- `outcome_schema` — outcome examples from the kernel schema; renderer default
- `task_frontmatter` — frontmatter YAML skeleton from the kernel schema; renderer default
- `task_types` — configured task types with their flow, kind, output schema, nogit/promote flags and use-when; renderer default
- `tiers` — run-config alias names; renderer default

## implementer.md

- `task_path` — path to this task's file: frontmatter plus brief
- `cleanliness_revision` — `true` when this turn is a cleanliness revision turn; selects `cleanliness-revision`
- `front_pack` — path to the front's context pack for a front-classified trivial or task goal; empty string when no front classified this task
- `worktree` — path to the task worktree to edit
- `resume_note` — follow-up notice for a relaunched or trivial turn: the task branch and the resume fragment; empty string on a de-novo turn
- `report_path` — repo-relative path a spike commits its finding to (`.factory/spikes/<slug>.md`); empty on a development task and on a `nogit` task, whose product lives outside git; when set, it also opens the prompt with the commit-first sentence
- `env_notes` — the task file's environment notes as `- ` bullet lines (infra facts, known flakes, workarounds); empty string when the task has none
- `setup_command` — worktree bootstrap command (dependencies etc.); `none` when not needed
- `gate_commands` — configured compile/lint/test commands as `- id: command` lines; `none` when empty
- `base_gates` — the base tree's recorded gate result: commit plus `green`, or the pre-existing failing checks; `not recorded` when pre-flight has no trustworthy base run
- `findings` — previous acceptance round's summary and findings for this task (QA or review), plus any legacy forward lines (summary first); gate failures when the latest record is red checks; empty string before the first acceptance. Each numbered finding is answered by a change, a reply or both
- `outcome_path` — path where the outcome file must be written when the harness asks for a file
- `validate_cmd` — absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default
- `outcome_schema` — outcome examples from the kernel schema; renderer default

## cleanliness-revision.md

The cleanliness revision follow-up instruction (fix or justify), included by `implementer.md` on a cleanliness revision turn. It contains no turn variables.

## qa.md

The QA step's acceptance prompt: the implementer's Work, Bounds and Code standard, then the acceptance focus, its own `qa` verdict, and the checks handoff. QA sends actionable findings back to the author or accepts the work; its own test and script edits are gated again before review.

- `task_path` — path to the task file whose done-when this turn accepts
- `worktree` — path to the task worktree holding the gated tree
- `base_hash` — commit hash before this task's first turn; the range spans every round
- `head_hash` — commit hash after the latest turn
- `round` — 1-based call of this QA step's own change-request budget
- `max_rounds` — this QA step's total acceptance calls: its change-request bound plus the last call
- `last_call` — `true` when this QA turn is the step's last call: `qa.verdict changes` is refused
- `base_gates` — the base tree's recorded gate result: commit plus `green`, the pre-existing failing checks, or `not recorded`
- `checks_result` — latest checks record's failing-check text, or `pass` when green; `no checks run` without a checks record
- `checks_tree` — the checked tree's hash; `unknown` without a checks record
- `checks_log` — the checks record's directory; `unknown` without a checks record
- `gate_commands` — configured compile/lint/test commands as `- id: command` lines; `none` when empty
- `prior_findings` — the last acceptance's findings (QA or review), numbered; empty before the first acceptance
- `fix_dispositions` — the current fix round's summary plus one numbered reply per prior finding; round 1 carries the cleanliness revision turn's summary/replies and is otherwise empty; renderer default
- `outcome_path` — path where the outcome file must be written when the harness asks for a file
- `validate_cmd` — absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default
- `outcome_schema` — outcome examples narrowed to the base fields and `qa`; supplied by the turn

## browser-qa.md

The browser-test acceptance prompt: the QA body plus one browser-surface turn before the code QA, with the same `qa` verdict and the same checks handoff.

- `task_path` — path to the task file whose done-when this turn accepts
- `worktree` — path to the task worktree holding the gated tree
- `base_hash` — commit hash before this task's first turn; the range spans every round
- `head_hash` — commit hash after the latest turn
- `round` — 1-based call of this QA step's own change-request budget
- `max_rounds` — this QA step's total acceptance calls: its change-request bound plus the last call
- `last_call` — `true` when this QA turn is the step's last call: `qa.verdict changes` is refused
- `base_gates` — the base tree's recorded gate result: commit plus `green`, the pre-existing failing checks, or `not recorded`
- `checks_result` — latest checks record's failing-check text, or `pass` when green; `no checks run` without a checks record
- `checks_tree` — the checked tree's hash; `unknown` without a checks record
- `checks_log` — the checks record's directory; `unknown` without a checks record
- `gate_commands` — configured compile/lint/test commands as `- id: command` lines; `none` when empty
- `prior_findings` — the last acceptance's findings (QA or review), numbered; empty before the first acceptance
- `fix_dispositions` — the current fix round's summary plus one numbered reply per prior finding; round 1 carries the cleanliness revision turn's summary/replies and is otherwise empty; renderer default
- `outcome_path` — path where the outcome file must be written when the harness asks for a file
- `validate_cmd` — absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default
- `outcome_schema` — outcome examples narrowed to the base fields and `qa`; supplied by the turn

## decider.md

The decide turn's prompt: a mechanical signal (an empty diff, a spent round bound, or red gates that survived their fixes) stopped the task and the kernel raised it instead of parking. The decider reads the signal, the branch, the checks log and the prior findings, then answers through its outcome verdict: approve continues past the stopped point and ships (accepting a red on a gates signal), changes grants the next fix round or fix budget, reject parks. It reuses the reviewer alias and session.

- `pending_signal` — the raised signal as `<kind>: <evidence>`; the sentence the kernel would have parked with
- `task_path` — path to the task file whose done-when the branch is judged against
- `worktree` — path to the task worktree holding the branch
- `base_hash` — commit hash before this task's first turn; the range spans every round
- `head_hash` — commit hash after the latest turn
- `findings` — the latest acceptance or red-check handoff; empty when none
- `prior_findings` — the last review's numbered summary and concerns; empty before the first review
- `checks_result` — latest checks record's failing-check text, or `pass` when green; `no checks run` without a checks record
- `checks_tree` — the checked tree's hash; `unknown` without a checks record
- `checks_log` — the checks record's directory; `unknown` without a checks record
- `outcome_path` — path where the outcome file must be written when the harness asks for a file
- `validate_cmd` — absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default
- `outcome_schema` — outcome YAML skeleton from the kernel schema; renderer default

## reviewer.md

`reviewer.md` is the shared reviewer composition for task reviews: an author-neutral intro, the author's body, the duties partial named by `author`, the verdict sentence, and the turn block common to every review. The task reviewer renders it with `author: implementer`, which selects `implementer-body`, `review-implementer` and `review-implementer-turn`. All turn variables stay in the final `## This turn` block.

- `worktree` — task worktree for a task review; goal checkout for a plan review
- `author` — role whose body the reviewer includes (`implementer` by default); renderer default
- `checks_result` — latest checks record's failing-check text, or `pass` when green; `no checks run` when the render has no checks record (renderer default)
- `checks_tree` — the checked tree's hash; `unknown` without a checks record (renderer default)
- `checks_log` — the checks record's directory; `unknown` without a checks record (renderer default)
- `outcome_path` — path where the outcome file must be written when the harness asks for a file
- `validate_cmd` — absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default
- `outcome_schema` — outcome examples from the kernel schema; renderer default

## review-implementer.md

The diff-review duties, included by `reviewer.md` when `author: implementer`. It selects its decision block with `last_call`.

- `last_call` — `true` when this review is the step's last call; selects `review-implementer-last-call`

## review-implementer-last-call.md

The ship-or-park decision, included by `review-implementer.md` on the last call. It contains no turn variables.

## review-implementer-turn.md

- `task_path` — path to the task file the diff is judged against
- `base_hash` — commit hash before this task's first turn; the range spans every round
- `head_hash` — commit hash after the latest implementer turn
- `round` — 1-based review round of this step's own change-request budget
- `max_rounds` — this review step's total review calls: its change-request bound plus the last call
- `base_gates` — the base tree's recorded gate result, and the only evidence a red gate predates the task: commit plus `green`, the pre-existing failing checks, or `not recorded`; a claimed pre-existing failure is a finding unless this record lists it
- `prior_findings` — previous round's numbered summary and concerns, plus any legacy forward lines (summary first); empty string in round 1
- `upscope_ask` — escalation ask for a standalone task review, answered as `upscope: yes|no` with the verdict; empty string when this task is part of an architect plan
- `fix_dispositions` — the current fix round's summary plus one numbered reply per prior finding; round 1 carries the cleanliness revision turn's summary/replies and is otherwise empty; renderer default

## adjudicator.md

The review-adjudication prompt: a step after a review re-judges that review's `changes` findings and may discard them. Its outcome is the review the implementer sees, so an omitted finding never travels.

- `task_path` — path to the task file the diff is judged against
- `base_hash` — commit hash before this task's first turn
- `head_hash` — commit hash after the latest turn
- `round` — 1-based review round whose findings are adjudicated
- `findings` — the reviewed review's summary, concerns and forward lines; the only findings judged
- `base_gates` — the base tree's recorded gate result
- `worktree` — path to the task worktree holding the reviewed tree
- `checks_result` — latest checks text, or `pass` when green (renderer default)
- `checks_tree` — the checked tree's hash (renderer default)
- `checks_log` — the checks record's directory (renderer default)
- `outcome_path` — path for the outcome file the harness asks for
- `validate_cmd` — absolute validate command for this launch; renderer default
- `outcome_schema` — outcome examples; renderer default

## review-architect.md

The plan-review prompt the architecture flow renders on each reviewer alias. It composes the architect's assignment and whole body from fragments, adds the review focus, and delivers `planReview` findings (`technical`, `planNotes`) with no verdict. It never edits the plan.

- `iteration` — 1-based iteration number of this launch
- `intent_path` — path to the goal's `intent.md`
- `plan_path` — path to the goal plan under review; read-only to the reviewer
- `pack_path` — path to the iteration context pack the architect planned from
- `worktree` — goal checkout; the reviewer reads the repo from it
- `outcome_path` — path where the outcome file must be written when the harness asks for a file
- `validate_cmd` — absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default
- `outcome_schema` — outcome examples narrowed to `status`, `summary`, `concerns`, `steerAnswers`, `debtClosed` and `planReview`; supplied by the turn
- `task_types` — configured task types with their flow, kind, output schema, nogit/promote flags and use-when, read by the included plan standard; renderer default
- `tiers` — run-config alias names, read by the included architect scope; renderer default

## architect-review-return.md

The architect's one turn on the plan review's technical findings, before the PM derives tasks. It edits the plan, marks every finding in `planReviewMarks`, and takes no goal decision and no verdict.

- `iteration` — 1-based iteration number of this launch
- `intent_path` — path to the goal's `intent.md`
- `plan_path` — path to the plan; edited in place
- `pack_path` — path to the iteration context pack
- `reviewers` — the reviewer aliases that delivered the findings
- `technical_findings` — numbered technical findings, `1..N`, or `none`
- `plan_notes` — numbered plan notes, after the technical findings, or `none`
- `finding_count` — total findings; every number `1..finding_count` must appear once in `planReviewMarks`
- `outcome_path` — path where the outcome file must be written when the harness asks for a file
- `validate_cmd` — absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default
- `outcome_schema` — outcome examples narrowed to the base fields and `planReviewMarks`; supplied by the turn

## digest.md

- `launch_id` — identifier of the previous launch being summarised
- `goal_dir` — path to the goal directory (records, mailbox, iterations)
- `records_dir` — path to the append-only step records, scoped to the named launch
- `transcripts_dir` — path to the session transcripts outside the repo
- `digest_path` — path where the digest must be written; the script has already written the cost-and-turn table there
- `outcome_path` — path where the outcome file must be written when the harness asks for a file
- `validate_cmd` — absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default
- `outcome_schema` — outcome examples from the kernel schema; renderer default

The digest scout appends loops, failures and interventions; it does not restate the script table.

## steward.md

- `worktree` — path to the task worktree holding the conflicted merge
- `branch` — task branch the integration head merges into
- `integration_head` — integration head sha the branch must absorb
- `conflicts` — conflicted files, comma-separated; `none` when the merge needs no resolution
- `gate_log_path` — path to the gate log of the red this branch must repair (the goal head's run when the head is red, else the branch's red merged result); `none` when the merge needs no gate repair
- `gate_commands` — configured gate commands as `- id: command` lines; `none` when empty
- `base_gates` — the base tree's recorded gate result: commit plus `green`, the pre-existing failing checks, or `not recorded`
- `outcome_path` — path where the outcome file must be written when the harness asks for a file
- `validate_cmd` — absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default
- `outcome_schema` — outcome examples from the kernel schema; renderer default

The flow's `resolve` step renders this same prompt with the same variables: the wave-end steward and the in-flow resolve turn own one conflict ask.

## plan-checker.md

- `iteration` — 1-based iteration number of this launch
- `intent_path` — path to the goal's `intent.md`, for resolving wording only
- `plans` — the active plans, one `- goal: <path>` or ``- epic `<epic>`: <path>`` line each; verify every plan against the repo; read-only to the checker
- `checkout` — path to the stable goal checkout (integration worktree)
- `tasks_dir` — directory holding one `<slug>.md` task file per task
- `existing_tasks` — existing task files as `- slug | status | hash | deps: a,b` lines (`none` when empty), then parked slugs with their cause
- `open_concerns` — the open concerns a merged follow-up or an earlier check has not answered, one `- <id> [kind/calibration]: <text> — <source>` line each; debt-kind concerns stay in the pack's debt register, not this list; `none` when empty
- `gate_record_path` — `end.yaml` of the newest record that ran gates, to read instead of running them; `none recorded` when no gate has run
- `outcome_path` — path where the outcome file must be written when the harness asks for a file
- `validate_cmd` — absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default
- `outcome_schema` — outcome examples from the kernel schema; renderer default
- `task_types` — configured task types with their flow, kind, output schema, nogit/promote flags and use-when; renderer default

## pack-preparer.md

- `iteration` — 1-based iteration number of this launch
- `context_data_path` — the script's full derived status for this iteration as JSON; the preparer reads it and returns the sections to brief
- `intent_path` — path to the goal's `intent.md`; a pointer, never pasted
- `plan_path` — path to the current plan; a pointer, never pasted
- `checkout` — path to the stable goal checkout (integration worktree)
- `outcome_path` — path where the outcome file must be written when the harness asks for a file
- `validate_cmd` — absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default
- `outcome_schema` — outcome examples from the kernel schema plus this turn's `packBriefs`; the turn supplies it

## scout.md

- `iteration` — 1-based iteration number of this launch
- `intent_path` — path to the goal's `intent.md`; the map's subject
- `checkout` — path to the stable goal checkout (integration worktree) being mapped
- `code_map_path` — path of the code map to write, with one entry per directory; the one artifact the turn authors (the outcome file is the other)
- `outcome_path` — path where the outcome file must be written when the harness asks for a file
- `validate_cmd` — absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default
- `outcome_schema` — outcome examples from the kernel schema; renderer default

## infra.md

The ingestion gate discovery: with repo-config gates present it copies them exactly and reports their status; with none it discovers the project's commands. Its output is `infra.yaml`, the kernel schema the gates the kernel runs are read from.

- `iteration` — 1-based iteration number of this launch
- `intent_path` — path to the goal's `intent.md`; a pointer, never pasted
- `checkout` — path to the stable goal checkout (integration worktree) the gates run in
- `setup_command` — repository setup command; `none` when not needed
- `gate_commands` — configured gate commands as `- id: command` lines with any recorded status; `none` when the repo config declares none, which is when discovery is allowed
- `infra_path` — path of the `infra.yaml` to write, naming each gate's command, speed and observed status; the one artifact the turn authors (the outcome file is the other)
- `outcome_path` — path where the outcome file must be written when the harness asks for a file
- `validate_cmd` — absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default
- `outcome_schema` — outcome YAML skeleton from the kernel schema; renderer default

## delivery-repair.md

The default in-session repair ask, rendered by the kernel when a turn delivers no outcome, no verdict or decision, or (architect) no plan. Process config names the template per step (`repairPrompt`); a step that names none renders this one. A repo may shadow it like any template. It is not a role prompt: it is rendered directly, never included by another prompt, and it includes `repair-ask` for the header, findings and outcome contract, then adds its closing instruction. It includes `outcome` for the contract and, unless a bare done delivers, `verdict` for the verdict/decision usage line. Its `outcome_schema` is narrowed to the fields that turn delivers — the base shape, the prompt's reporting fields, and the one field its expectation gates — so a bare done is never asked for a verdict.

- `role` — the prompt (the role) whose turn missed its deliverable
- `deliverable` — the product the turn must deliver; process config names it, else a review turn's verdict, else the outcome
- `done_allowed` — `true` when a bare `status: done` delivers (no verdict or decision required), else `false`
- `findings` — the missing or invalid findings as `- ` bullet lines
- `outcome_path` — path where the corrected outcome must be written
- `validate_cmd` — absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default
- `outcome_schema` — outcome examples from the kernel schema, narrowed to the fields this turn delivers; supplied by the repair ask

## unfinished-turn.md

The finish-the-task ask, named by a step's `unfinishedPrompt`. The kernel sends it instead of the outcome-only repair when the settled read found no outcome at all and no halted stop ended the turn, so the turn explored or planned but never delivered. It is not a role prompt: it is rendered directly and stands alone, naming the task path and worktree because the repair may land in a session that did not survive. A step that names no `unfinishedPrompt` keeps `delivery-repair`.

- `role` — the prompt (the role) whose turn settled no outcome
- `deliverable` — the product the turn must deliver; process config names it, else a review turn's verdict, else the outcome
- `done_allowed` — `true` when a bare `status: done` delivers (no verdict or decision required), else `false`
- `findings` — the missing or invalid findings as `- ` bullet lines
- `task_path` — path to the task file the turn must finish
- `worktree` — the worktree the turn must do the work in
- `outcome_path` — path where the outcome must be written
- `validate_cmd` — absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default
- `outcome_schema` — outcome examples from the kernel schema, narrowed to the fields this turn delivers; supplied by the repair ask

## rescue-turn.md

The fresh-session ask the flow renders when an implement turn left work on its branch but delivered no valid outcome after its reminders. The kernel sends it once, without a session, so the ask stands alone: it names the task, the worktree and the diff range the new turn must judge, then the outcome findings the hook passed and the acceptance findings from the turn's own vars that `replies` must answer. It is not a role prompt: it is rendered directly by the flow, never included by another prompt.

- `role` — the prompt (the role) whose turn left the work
- `worktree` — the worktree holding the branch's work
- `task_path` — path to the task file the work answers
- `base_hash` — commit hash the branch's work is judged from
- `head_hash` — commit hash the branch reached before the rescue call
- `outcome_findings` — the surviving outcome findings the kernel passed to the hook, as `- ` bullet lines
- `findings` — the acceptance findings the turn already answers, as the implementer's vars render them; empty when none
- `outcome_path` — path where the outcome must be written
- `validate_cmd` — absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default
- `outcome_schema` — outcome examples from the kernel schema; supplied by the turn

## architect-repair.md

The architect's repair ask, named by the architect boundary step's `repairPrompt`. Same variables as `delivery-repair.md`; it adds that a continued turn must have its plan edit on disk, so the generic template stays free of role branches.

- `role` — the prompt (the role) whose turn missed its deliverable
- `deliverable` — the product the turn must deliver; process config names it, else a review turn's verdict, else the outcome
- `done_allowed` — `true` when a bare `status: done` delivers (no verdict or decision required), else `false`
- `findings` — the missing or invalid findings as `- ` bullet lines
- `outcome_path` — path where the corrected outcome must be written
- `validate_cmd` — absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default
- `outcome_schema` — outcome examples from the kernel schema, narrowed to the fields this turn delivers; supplied by the repair ask

## resume.md

- `branch` — task branch the relaunch continues; empty when none
- `reason` — `relaunch` after an interruption, `fallback` for a tier that continues edited work, `trivial` in the front's session
- `session_cwd` — directory the resumed session's tools run in; trivial turns only
- `worktree` — absolute worktree a trivial turn must use; trivial turns only
