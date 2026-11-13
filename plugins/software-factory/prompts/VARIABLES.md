# Prompt variables

Template syntax: `{{name}}` interpolates one value; `{{> partial-name}}` inlines a partial. Undefined variable = render error. Every prompt is stable text up to its final `## This turn` block; all variables live there so providers can cache the prefix. Partials carry no variables.

| prompt | partials |
|---|---|
| architect | `_calibration`, `_outcome` |
| front | `_calibration`, `_outcome` |
| pm | `_calibration`, `_outcome` |
| implementer | `_clean-code`, `_calibration`, `_outcome` |
| reviewer | `_clean-code`, `_calibration`, `_outcome` |
| digest | `_outcome` |

`_calibration` is the default calibration text. The process config may replace its content per repo; the prompt template does not change.

## architect.md

| variable | meaning |
|---|---|
| `turn` | `first` on a new goal's first turn; `relaunch` on the first turn of a relaunch of the same goal; `boundary` otherwise |
| `iteration` | 1-based iteration number of this launch |
| `intent_path` | path to the goal's `intent.md` |
| `plan_path` | path to the goal's single markdown plan; the file to edit |
| `checkout` | path to the stable goal checkout (integration worktree) |
| `pack_path` | path to the iteration context pack: derived status, short hashes, per-task rounds, infra commands, code facts, links |
| `digest_path` | path to the previous launch's digest; empty string on a first launch |
| `steers` | formatted pending steers: id, first line, file path; `none` when empty |
| `outcome_path` | path where the outcome file must be written when the harness asks for a file |

## front.md

| variable | meaning |
|---|---|
| `iteration` | 1-based iteration number of this launch |
| `intent_path` | path to the goal's `intent.md` |
| `plan_path` | path to the goal's markdown plan; may not exist yet |
| `tasks_dir` | directory where the one task file is written, `<slug>.md` |
| `class_path` | path to `class.yaml`: `{ class: trivial\|task\|bigger, slug? }` beside the plan |
| `pack_path` | path to the iteration context pack the front writes: the architect's input on `bigger`, the implementer's briefing on `trivial`/`task` |
| `checkout` | path to the stable goal checkout the front reads |
| `setup_command` | repository setup command; `none` when not needed |
| `gate_commands` | configured gate commands, one per line with ids |
| `outcome_path` | path where the outcome file must be written when the harness asks for a file |

## pm.md

| variable | meaning |
|---|---|
| `iteration` | 1-based iteration number of this launch |
| `intent_path` | path to the goal's `intent.md`, for resolving wording only |
| `plan_path` | path to the plan to derive from; read-only to the PM |
| `tasks_dir` | directory where task files are written, one `<slug>.md` per task |
| `existing_tasks` | existing task files, one `slug \| status \| material hash \| deps` line each; merged/finished marked frozen |
| `repair` | the script validator's findings from the previous ask; empty string on first ask |
| `outcome_path` | path where the outcome file must be written when the harness asks for a file |

## implementer.md

| variable | meaning |
|---|---|
| `task_path` | path to this task's file: frontmatter plus brief |
| `worktree` | path to the task worktree to edit |
| `setup_command` | worktree bootstrap command (dependencies etc.); `none` when not needed |
| `gate_commands` | configured compile/lint/test commands, one per line with ids |
| `baseline_checks` | gate failures recorded before this turn, same format; `none` when the baseline is green |
| `findings` | previous review round's findings for this task; empty string on the first turn |
| `outcome_path` | path where the outcome file must be written when the harness asks for a file |

## reviewer.md

| variable | meaning |
|---|---|
| `task_path` | path to the task file the diff is judged against |
| `worktree` | path to the task worktree holding the diff |
| `base_hash` | commit hash before this task's first turn; the range spans every round |
| `head_hash` | commit hash after the latest implementer turn |
| `round` | 1-based review round |
| `max_rounds` | configured review round limit for this flow |
| `baseline_checks` | gate failures recorded on the base before any task; pre-existing, not findings against this diff |
| `prior_findings` | previous round's findings; empty string in round 1 |
| `outcome_path` | path where the outcome file must be written when the harness asks for a file |

## digest.md

| variable | meaning |
|---|---|
| `launch_id` | identifier of the previous launch being summarised |
| `goal_dir` | path to the goal directory (records, mailbox, iterations) |
| `records_dir` | path to the append-only step records, scoped to the named launch |
| `transcripts_dir` | path to the session transcripts outside the repo |
| `digest_path` | path where the digest must be written; the script has already written the cost-and-turn table there |
| `outcome_path` | path where the outcome file must be written when the harness asks for a file |

The digest scout appends loops, failures and interventions; it does not restate the script table.
