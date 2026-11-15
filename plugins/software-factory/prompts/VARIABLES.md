# Prompt variables

Template syntax: [LiquidJS](https://liquidjs.com), strict mode (unknown variable = render error; unknown filter = render error). `{{ name }}` interpolates one value; `{% include 'partial-name' %}` inlines `prompts/partial-name.md`. Every prompt is stable text up to its final `## This turn` block; all variables live there so providers can cache the prefix. Partials carry no variables.

| prompt      | partials                                        |
| ----------- | ----------------------------------------------- |
| architect   | `calibration`, `outcome`                        |
| front       | `calibration`, `outcome`                        |
| pm          | `calibration`, `outcome`                        |
| implementer | `clean-code`, `scope`, `calibration`, `outcome` |
| reviewer    | `clean-code`, `scope`, `calibration`, `outcome` |
| digest      | `outcome`                                       |

The shared definitions exist once as partials: `scope` (the predicted-area rule), `calibration` (concerns and calibration, with `remarkable` inside it), `outcome` (the outcome contract), `clean-code` (the code standard) and `remarkable` (the remarkable definition).

`calibration` is the default calibration partial. The process config may replace its content per repo; the prompt template does not change.

`validate_cmd` is the one variable outside a `This turn` block: it renders the running build's absolute `bun <build>/bin/factory.ts validate`, so it cannot be prompt text and the prefix is stable only within one checkout. The renderer supplies it as a launch-wide default; turn code never passes it.

## architect.md

| variable       | meaning                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| `turn`         | `first` on a new goal's first turn; `relaunch` on the first turn of a relaunch of the same goal; `boundary` otherwise |
| `iteration`    | 1-based iteration number of this launch                                                                               |
| `intent_path`  | path to the goal's `intent.md`                                                                                        |
| `plan_path`    | path to the goal's single markdown plan; the file to edit                                                             |
| `checkout`     | path to the stable goal checkout (integration worktree)                                                               |
| `pack_path`    | path to the iteration context pack (index: status, short hashes, per-task rounds, infra, code facts, paths)           |
| `digest_path`  | path to the previous launch's digest; empty string on a first launch                                                  |
| `steers`       | formatted pending steers: id, first line, file path; `none` when empty                                                |
| `outcome_path` | path where the outcome file must be written when the harness asks for a file                                          |
| `validate_cmd` | absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default                                      |

## front.md

| variable        | meaning                                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `iteration`     | 1-based iteration number of this launch                                                                                                |
| `intent_path`   | path to the goal's `intent.md`                                                                                                         |
| `plan_path`     | path to the goal's markdown plan; may not exist yet                                                                                    |
| `tasks_dir`     | directory where the one task file is written, `<slug>.md`                                                                              |
| `class_path`    | path to `class.yaml`: `{ class: trivial\|task\|bigger, slug? }` beside the plan                                                        |
| `pack_path`     | path to the iteration context pack the front writes: the architect's input on `bigger`, the implementer's briefing on `trivial`/`task` |
| `checkout`      | path to the stable goal checkout the front reads                                                                                       |
| `setup_command` | repository setup command; `none` when not needed                                                                                       |
| `gate_commands` | configured gate commands as `- id: command` lines; `none` when empty                                                                   |
| `outcome_path`  | path where the outcome file must be written when the harness asks for a file                                                           |
| `validate_cmd`  | absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default                                                       |

## pm.md

| variable         | meaning                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `iteration`      | 1-based iteration number of this launch                                                                                                                                 |
| `intent_path`    | path to the goal's `intent.md`, for resolving wording only                                                                                                              |
| `plan_path`      | path to the plan to derive from; read-only to the PM                                                                                                                    |
| `tasks_dir`      | directory where task files are written, one `<slug>.md` per task                                                                                                        |
| `existing_tasks` | existing task files as `- slug \| status \| hash \| deps: a,b` lines (`none` when empty); merged/finished lines end `frozen (read-only)`, cancelled `read-only (spent)` |
| `repair`         | the script validator's findings from the previous ask; empty string on the first ask and on steer turns                                                                 |
| `steers`         | pending steers as `- id (file):` plus indented full text; `none` on a derive turn                                                                                       |
| `holds_dir`      | directory for one `<steer-id>.yaml` hold file per structured steer                                                                                                      |
| `outcome_path`   | path where the outcome file must be written when the harness asks for a file                                                                                            |
| `validate_cmd`   | absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default                                                                                        |

## implementer.md

| variable          | meaning                                                                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `task_path`       | path to this task's file: frontmatter plus brief                                                                                                                              |
| `front_pack`      | path to the front's context pack for a front-classified trivial or task goal; empty string when no front classified this task                                                 |
| `worktree`        | path to the task worktree to edit                                                                                                                                             |
| `resume_note`     | follow-up notice for a turn resumed in the front's session: the task branch plus the absolute-path rules; empty string on a de-novo turn                                      |
| `setup_command`   | worktree bootstrap command (dependencies etc.); `none` when not needed                                                                                                        |
| `gate_commands`   | configured compile/lint/test commands as `- id: command` lines; `none` when empty                                                                                             |
| `baseline_checks` | gate failures recorded before this turn, same format; `none` when the baseline is green                                                                                       |
| `findings`        | previous review round's summary, concerns and forward for this task (summary first); gate failures when the latest record is red checks; empty string before the first review |
| `outcome_path`    | path where the outcome file must be written when the harness asks for a file                                                                                                  |
| `validate_cmd`    | absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default                                                                                              |

## reviewer.md

| variable          | meaning                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `task_path`       | path to the task file the diff is judged against                                                 |
| `worktree`        | path to the task worktree holding the diff                                                       |
| `base_hash`       | commit hash before this task's first turn; the range spans every round                           |
| `head_hash`       | commit hash after the latest implementer turn                                                    |
| `round`           | 1-based review round                                                                             |
| `max_rounds`      | configured review round limit for this flow                                                      |
| `baseline_checks` | gate failures recorded on the base before any task; pre-existing, not findings against this diff |
| `prior_findings`  | previous round's summary, concerns and forward (summary first); empty string in round 1          |
| `outcome_path`    | path where the outcome file must be written when the harness asks for a file                     |
| `validate_cmd`    | absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default                 |

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

The digest scout appends loops, failures and interventions; it does not restate the script table.

## delivery-repair.md

The one in-session repair ask, rendered by the kernel when a turn delivers no outcome, no verdict or decision, or (architect) no plan. A repo may shadow it like any template. It is not a role prompt: it is rendered directly, never included.

| variable       | meaning                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| `role`         | the role whose turn missed its deliverable                                                                   |
| `deliverable`  | the product the turn must deliver: plan edit or stop decision, outcome, verdict, task files, class/task/pack |
| `done_allowed` | `true` when a bare `status: done` delivers (no verdict or decision required), else `false`                   |
| `findings`     | the missing or invalid findings as `- ` bullet lines                                                         |
| `outcome_path` | path where the corrected outcome must be written                                                             |
