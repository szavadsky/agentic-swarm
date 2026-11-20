# Prompt variables

Template syntax: [LiquidJS](https://liquidjs.com), strict mode (unknown variable = render error; unknown filter = render error). `{{ name }}` interpolates one value; `{% include 'partial-name' %}` inlines `prompts/partial-name.md`. Every prompt is stable text up to its final `## This turn` block; turn variables live there so providers can cache the prefix, except the implementer's spike opening sentence, which names `report_path` before the body so the commit-first instruction is read first. Renderer defaults also appear above the block, so the prefix is stable only within one checkout and launch.

| prompt                  | partials                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| architect               | `architect-body` (`architect-assignment`, `architect-turn`, `plan-standard` (`task-size`), `architect-scope`), `plan-review-marks`, `calibration`, `outcome`, `verdict` |
| front                   | `task-size`, `plan-read-only`, `calibration`, `outcome`, `task-frontmatter`                                                                                             |
| pm                      | `task-size`, `plan-read-only`, `spike-report-general`, `calibration`, `outcome`, `task-frontmatter`                                                                     |
| implementer             | `implementer-body`, `clean-code`, `scope` (`plan-read-only`), `calibration`, `outcome`                                                                                  |
| reviewer                | `<author>-body` (`implementer-body` by default), `review-<author>` duties, `review-<author>-turn` inputs, `verdict`                                                     |
| review-architect        | `architect-assignment`, `plan-standard` (`task-size`), `plan-rules`, `finding-standards`, `outcome`                                                                     |
| architect-review-return | `architect-assignment`, `plan-review-marks`, `calibration`, `outcome`                                                                                                   |
| digest                  | `calibration`, `outcome`                                                                                                                                                |
| steward                 | `clean-code`, `calibration`, `outcome`                                                                                                                                  |
| plan-checker            | `calibration`, `outcome`                                                                                                                                                |
| pack-preparer           | `calibration`, `outcome`                                                                                                                                                |

The shared definitions exist once as partials: `scope` (the predicted-area rule: out-of-area judgement, upscope condition; includes `plan-read-only`), `plan-read-only` (the plan, intent, other task files and records are read-only), `task-size` (what one task is: one implementer session, one seam, one reviewable diff, one done-when, and the split/merge criteria; included by `front`, `plan-standard` and `pm`), `calibration` (concerns and calibration, with `remarkable` inside it), `outcome` (the outcome contract, shape rendered from the kernel outcome schema), `task-frontmatter` (the task-file frontmatter shape rendered from the kernel task schema, plus the configured task types and tiers; included by the authoring roles), `clean-code` (the code standard), `remarkable` (the remarkable definition), `finding-standards` (the no-praise, no-restating, no-taste rule shared by both reviews), `plan-review-marks` (the plan-review mark meaning, shared by the architect's turn and return), `spike-report-general` (what a spike's done-when says; included by `pm` and `architect-body`), `verdict` (which step each of `verdict` and `decision` belongs to, for review and architect steps) and the role bodies `implementer-body` and `architect-body` (everything before the role's turn block; a reviewer includes its author's body by role name, so the plan review reuses the reviewer template over `architect-body`).

The architect's body is assembled from fragments so a reviewer can share only
the assignment: `architect-assignment` (the role and its bounds),
`architect-turn` (the consult's turn order), `plan-standard` (what the plan
carries and its granularity, with `task-size`), `plan-rules` (debt, parked work and ADRs) and
`architect-scope` (tiers, steers and calibration). The plan reviewer includes
`architect-assignment`, `plan-standard` and `plan-rules`; the architect's
return includes `architect-assignment`.

`calibration` is the default calibration partial. The process config may replace its content per repo; the prompt template does not change.

Renderer defaults live outside any `This turn` block and the renderer supplies them, so turn code does not pass them: `validate_cmd` (the running build's absolute `bun <build>/bin/factory.ts validate`, stable only within one checkout), `outcome_schema` (the outcome YAML skeleton rendered from the task type's kernel output schema, in the `outcome` partial), `task_frontmatter` (the frontmatter YAML skeleton rendered from the kernel task schema, in the `task-frontmatter` partial), `task_types` (configured task type names in config order with the flow, kind and output schema each supplies, from the process config), `tiers` (run-config alias names in config order; `default` is kernel vocabulary for no tier override and stays literal), `author` (the reviewer's author role; it selects the `<role>-body` and `review-<role>` fragments) and `checks_result`/`checks_tree`/`checks_log` (the latest checks record's result, tree and log; a render with no checks record gets `no checks run`, `unknown` and `unknown`), and `base_gates` (the base tree's recorded gate result; a render with no base record gets `not recorded`, never a clean base). `author` defaults to `implementer`; the plan-review turn overrides it with `architect`. `class_types` is a turn-supplied variable above the block: the front turn renders its class-to-task-type mapping from the same kernel mapping the validator enforces. The delivery-repair ask also supplies its own narrowed `outcome_schema`; it has no role prompt, so its shape must match the turn it repairs.

## architect.md

| variable         | meaning                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| `turn`           | `first` on a new goal's first turn; `relaunch` on the first turn of a relaunch of the same goal; `boundary` otherwise |
| `iteration`      | 1-based iteration number of this launch                                                                               |
| `intent_path`    | path to the goal's `intent.md`                                                                                        |
| `plan_path`      | path to the goal's single markdown plan; the file to edit                                                             |
| `checkout`       | path to the stable goal checkout (integration worktree)                                                               |
| `pack_path`      | path to the iteration context pack (index: status, short hashes, per-task rounds, infra, code facts, paths)           |
| `digest_path`    | path to the previous launch's digest; empty string on a first launch                                                  |
| `steers`         | formatted pending steers: id, first line, file path; `none` when empty                                                |
| `outcome_path`   | path where the outcome file must be written when the harness asks for a file                                          |
| `validate_cmd`   | absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default                                      |
| `outcome_schema` | outcome YAML skeleton from the kernel schema; renderer default                                                        |
| `task_types`     | configured task types with their flow, kind and schema; renderer default                                              |
| `tiers`          | run-config alias names; renderer default                                                                              |

## front.md

| variable           | meaning                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `iteration`        | 1-based iteration number of this launch                                                                                                |
| `intent_path`      | path to the goal's `intent.md`                                                                                                         |
| `plan_path`        | path to the goal's markdown plan; may not exist yet                                                                                    |
| `tasks_dir`        | directory where the one task file is written, `<slug>.md`                                                                              |
| `class_path`       | path to `class.yaml`: `{ class: trivial\|task\|bigger, slug? }` beside the plan                                                        |
| `pack_path`        | path to the iteration context pack the front writes: the architect's input on `bigger`, the implementer's briefing on `trivial`/`task` |
| `checkout`         | path to the stable goal checkout the front reads                                                                                       |
| `setup_command`    | repository setup command; `none` when not needed                                                                                       |
| `gate_commands`    | configured gate commands as `- id: command` lines; `none` when empty                                                                   |
| `outcome_path`     | path where the outcome file must be written when the harness asks for a file                                                           |
| `validate_cmd`     | absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default                                                       |
| `outcome_schema`   | outcome YAML skeleton from the kernel schema; renderer default                                                                         |
| `task_frontmatter` | frontmatter YAML skeleton from the kernel schema; renderer default                                                                     |
| `task_types`       | configured task types with their flow, kind and schema; renderer default                                                               |
| `tiers`            | run-config alias names; renderer default                                                                                               |
| `class_types`      | class-to-task-type mapping, rendered by the front turn                                                                                 |

## pm.md

| variable           | meaning                                                                                                                                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `iteration`        | 1-based iteration number of this launch                                                                                                                                                                                                                                    |
| `intent_path`      | path to the goal's `intent.md`, for resolving wording only                                                                                                                                                                                                                 |
| `plan_path`        | path to the plan to derive from; read-only to the PM                                                                                                                                                                                                                       |
| `tasks_dir`        | directory where task files are written, one `<slug>.md` per task                                                                                                                                                                                                           |
| `existing_tasks`   | existing task files as `- slug \| status \| hash \| deps: a,b` lines (`none` when empty); merged/finished lines end `frozen (read-only)`, cancelled `read-only (spent)`, steer tasks `steer <id>`, stall continuations `stall <n>`, plan-check follow-ups `plan-check <n>` |
| `repair`           | the script validator's findings from the previous ask; empty string on the first ask and on steer turns                                                                                                                                                                    |
| `steers`           | pending steers as `- id (file):` plus indented full text; `none` on a derive, stall or plan-check turn                                                                                                                                                                     |
| `stalls`           | this iteration's undecided parks as one entry per slug (cause, record paths, kept branch, spent turns, amends used of the limit, the cause's default action, done-when); `none` except on a stall turn                                                                     |
| `plan_checks`      | checker follow-ups as one entry per slug (kind, reason, cause, record paths, kept branch, spent turns, amends used of the limit, the cause's default action, done-when); `none` except on a plan-check turn                                                                |
| `holds_dir`        | directory for one `<steer-id>.yaml` hold file per structured steer                                                                                                                                                                                                         |
| `outcome_path`     | path where the outcome file must be written when the harness asks for a file                                                                                                                                                                                               |
| `validate_cmd`     | absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default                                                                                                                                                                                           |
| `outcome_schema`   | outcome YAML skeleton from the kernel schema; renderer default                                                                                                                                                                                                             |
| `task_frontmatter` | frontmatter YAML skeleton from the kernel schema; renderer default                                                                                                                                                                                                         |
| `task_types`       | configured task types with their flow, kind and schema; renderer default                                                                                                                                                                                                   |
| `tiers`            | run-config alias names; renderer default                                                                                                                                                                                                                                   |

## implementer.md

| variable         | meaning                                                                                                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `task_path`      | path to this task's file: frontmatter plus brief                                                                                                                                                                                                                    |
| `front_pack`     | path to the front's context pack for a front-classified trivial or task goal; empty string when no front classified this task                                                                                                                                       |
| `worktree`       | path to the task worktree to edit                                                                                                                                                                                                                                   |
| `resume_note`    | follow-up notice for a turn resumed in the front's session: the task branch plus the absolute-path rules; empty string on a de-novo turn                                                                                                                            |
| `report_path`    | repo-relative path a spike commits its finding to (`.factory/spikes/<slug>.md`); empty string on a development task; when set, it also opens the prompt with the commit-first sentence                                                                              |
| `setup_command`  | worktree bootstrap command (dependencies etc.); `none` when not needed                                                                                                                                                                                              |
| `gate_commands`  | configured compile/lint/test commands as `- id: command` lines; `none` when empty                                                                                                                                                                                   |
| `base_gates`     | the base tree's recorded gate result: commit plus `green`, or the pre-existing failing checks; `not recorded` when pre-flight has no trustworthy base run                                                                                                           |
| `findings`       | previous review round's summary and concerns for this task, plus any legacy forward lines (summary first); gate failures when the latest record is red checks; empty string before the first review. Each numbered finding is answered by a change, a reply or both |
| `outcome_path`   | path where the outcome file must be written when the harness asks for a file                                                                                                                                                                                        |
| `validate_cmd`   | absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default                                                                                                                                                                                    |
| `outcome_schema` | outcome YAML skeleton from the kernel schema; renderer default                                                                                                                                                                                                      |

## reviewer.md

`reviewer.md` is the shared reviewer composition for task reviews: an
author-neutral intro, the author's body, the duties partial named by `author`,
the verdict sentence, and the turn block common to every review. The task
reviewer renders it with `author: implementer`, which selects
`implementer-body`, `review-implementer` and `review-implementer-turn`. All
turn variables stay in the final `## This turn` block.

| variable         | meaning                                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `worktree`       | task worktree for the review                                                                                                             |
| `author`         | role whose body the reviewer includes (`implementer` by default); renderer default                                                       |
| `checks_result`  | latest checks record's failing-check text, or `pass` when green; `no checks run` when the render has no checks record (renderer default) |
| `checks_tree`    | the checked tree's hash; `unknown` without a checks record (renderer default)                                                            |
| `checks_log`     | the checks record's directory; `unknown` without a checks record (renderer default)                                                      |
| `outcome_path`   | path where the outcome file must be written when the harness asks for a file                                                             |
| `validate_cmd`   | absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default                                                         |
| `outcome_schema` | outcome YAML skeleton from the kernel schema; renderer default                                                                           |

## review-implementer.md

The diff-review duties, included by `reviewer.md` when `author: implementer`.
It selects its decision block with `last_call`.

| variable    | meaning                                                                                 |
| ----------- | --------------------------------------------------------------------------------------- |
| `last_call` | `true` when this review is the step's last call; selects `review-implementer-last-call` |

## review-implementer-last-call.md

The ship-or-park decision, included by `review-implementer.md` on the last call.
It contains no turn variables.

## review-implementer-turn.md

| variable           | meaning                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `task_path`        | path to the task file the diff is judged against                                                                                                                                                                                           |
| `base_hash`        | commit hash before this task's first turn; the range spans every round                                                                                                                                                                     |
| `head_hash`        | commit hash after the latest implementer turn                                                                                                                                                                                              |
| `round`            | 1-based review round                                                                                                                                                                                                                       |
| `max_rounds`       | this review step's total review calls: its change-request bound plus the last call                                                                                                                                                         |
| `base_gates`       | the base tree's recorded gate result, and the only evidence a red gate predates the task: commit plus `green`, the pre-existing failing checks, or `not recorded`; a claimed pre-existing failure is a finding unless this record lists it |
| `prior_findings`   | previous round's numbered summary and concerns, plus any legacy forward lines (summary first); empty string in round 1                                                                                                                     |
| `upscope_ask`      | escalation ask for a standalone task review, answered as `upscope: yes\|no` with the verdict; empty string when this task is part of an architect plan                                                                                     |
| `fix_dispositions` | the current fix round's summary plus one numbered reply per prior finding; empty string in round 1; renderer default                                                                                                                       |

## review-architect.md

The plan-review prompt the architecture flow renders on each reviewer alias.
It composes the architect's assignment and plan standard from fragments, adds
the review focus, and delivers `planReview` findings (`technical`, `planNotes`)
with no verdict. It never edits the plan.

| variable         | meaning                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `iteration`      | 1-based iteration number of this launch                                                                                                |
| `intent_path`    | path to the goal's `intent.md`                                                                                                         |
| `plan_path`      | path to the plan under review; read-only to the reviewer                                                                               |
| `pack_path`      | path to the iteration context pack the architect planned from                                                                          |
| `worktree`       | goal checkout; the reviewer reads the repo from it                                                                                     |
| `outcome_path`   | path where the outcome file must be written when the harness asks for a file                                                           |
| `validate_cmd`   | absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default                                                       |
| `outcome_schema` | outcome YAML skeleton narrowed to `status`, `summary`, `concerns`, `steerAnswers`, `debtClosed` and `planReview`; supplied by the turn |

## architect-review-return.md

The architect's one turn on the plan review's technical findings, before the PM
derives tasks. It edits the plan, marks every finding in `planReviewMarks`, and
takes no goal decision and no verdict.

| variable             | meaning                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------- |
| `iteration`          | 1-based iteration number of this launch                                                       |
| `intent_path`        | path to the goal's `intent.md`                                                                |
| `plan_path`          | path to the plan; edited in place                                                             |
| `pack_path`          | path to the iteration context pack                                                            |
| `reviewers`          | the reviewer aliases that delivered the findings                                              |
| `technical_findings` | numbered technical findings, `1..N`, or `none`                                                |
| `plan_notes`         | numbered plan notes, after the technical findings, or `none`                                  |
| `finding_count`      | total findings; every number `1..finding_count` must appear once in `planReviewMarks`         |
| `outcome_path`       | path where the outcome file must be written when the harness asks for a file                  |
| `validate_cmd`       | absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default              |
| `outcome_schema`     | outcome YAML skeleton narrowed to the base fields and `planReviewMarks`; supplied by the turn |

## digest.md

| variable          | meaning                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `launch_id`       | identifier of the previous launch being summarised                                                  |
| `goal_dir`        | path to the goal directory (records, mailbox, iterations)                                           |
| `records_dir`     | path to the append-only step records, scoped to the named launch                                    |
| `transcripts_dir` | path to the session transcripts outside the repo                                                    |
| `digest_path`     | path where the digest must be written; the script has already written the cost-and-turn table there |
| `outcome_path`    | path where the outcome file must be written when the harness asks for a file                        |
| `validate_cmd`    | absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default                    |
| `outcome_schema`  | outcome YAML skeleton from the kernel schema; renderer default                                      |

The digest scout appends loops, failures and interventions; it does not restate the script table.

## steward.md

| variable           | meaning                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `worktree`         | path to the task worktree holding the conflicted merge                                                        |
| `branch`           | task branch the integration head merges into                                                                  |
| `integration_head` | integration head sha the branch must absorb                                                                   |
| `conflicts`        | conflicted files, comma-separated; `none` when the merge needs no resolution                                  |
| `gate_commands`    | configured gate commands as `- id: command` lines; `none` when empty                                          |
| `base_gates`       | the base tree's recorded gate result: commit plus `green`, the pre-existing failing checks, or `not recorded` |
| `outcome_path`     | path where the outcome file must be written when the harness asks for a file                                  |
| `validate_cmd`     | absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default                              |
| `outcome_schema`   | outcome YAML skeleton from the kernel schema; renderer default                                                |

The flow's `resolve` step renders this same prompt with the same variables: the
wave-end steward and the in-flow resolve turn own one conflict ask.

## plan-checker.md

| variable           | meaning                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `iteration`        | 1-based iteration number of this launch                                                                                      |
| `intent_path`      | path to the goal's `intent.md`, for resolving wording only                                                                   |
| `plan_path`        | path to the plan to verify against the repo; read-only to the checker                                                        |
| `checkout`         | path to the stable goal checkout (integration worktree)                                                                      |
| `tasks_dir`        | directory holding one `<slug>.md` task file per task                                                                         |
| `existing_tasks`   | existing task files as `- slug \| status \| hash \| deps: a,b` lines (`none` when empty), then parked slugs with their cause |
| `gate_record_path` | `end.yaml` of the newest record that ran gates, to read instead of running them; `none recorded` when no gate has run        |
| `outcome_path`     | path where the outcome file must be written when the harness asks for a file                                                 |
| `validate_cmd`     | absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default                                             |
| `outcome_schema`   | outcome YAML skeleton from the kernel schema; renderer default                                                               |

## pack-preparer.md

| variable            | meaning                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| `iteration`         | 1-based iteration number of this launch                                                              |
| `context_data_path` | the script's full derived status for this iteration as JSON; the preparer's input                    |
| `pack_path`         | path of the context pack to write; the one artifact the turn authors (the outcome file is the other) |
| `intent_path`       | path to the goal's `intent.md`; a pointer, never pasted                                              |
| `plan_path`         | path to the current plan; a pointer, never pasted                                                    |
| `checkout`          | path to the stable goal checkout (integration worktree)                                              |
| `outcome_path`      | path where the outcome file must be written when the harness asks for a file                         |
| `validate_cmd`      | absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default                     |
| `outcome_schema`    | outcome YAML skeleton from the kernel schema; renderer default                                       |

## delivery-repair.md

The default in-session repair ask, rendered by the kernel when a turn delivers no outcome, no verdict or decision, or (architect) no plan. Process config names the template per step (`repairPrompt`); a step that names none renders this one. A repo may shadow it like any template. It is not a role prompt: it is rendered directly, never included by another prompt, and it includes `repair-ask` for the header, findings and outcome contract, then adds its closing instruction. It includes `outcome` for the contract and, unless a bare done delivers, `verdict` for the verdict/decision usage line. Its `outcome_schema` is narrowed to the fields that turn delivers — the base shape, the prompt's reporting fields, and the one field its expectation gates — so a bare done is never asked for a verdict.

| variable         | meaning                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `role`           | the prompt (the role) whose turn missed its deliverable                                                             |
| `deliverable`    | the product the turn must deliver; process config names it, else a review turn's verdict, else the outcome          |
| `done_allowed`   | `true` when a bare `status: done` delivers (no verdict or decision required), else `false`                          |
| `findings`       | the missing or invalid findings as `- ` bullet lines                                                                |
| `outcome_path`   | path where the corrected outcome must be written                                                                    |
| `validate_cmd`   | absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default                                    |
| `outcome_schema` | outcome YAML skeleton from the kernel schema, narrowed to the fields this turn delivers; supplied by the repair ask |

## architect-repair.md

The architect's repair ask, named by the architect boundary step's `repairPrompt`. Same variables as `delivery-repair.md`; it adds that a continued turn must have its plan edit on disk, so the generic template stays free of role branches.
