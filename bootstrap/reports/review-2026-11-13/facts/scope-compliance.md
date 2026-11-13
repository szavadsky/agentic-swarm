# Scope compliance — merged work vs declared `scope`, iterations 1–13

## 1. Totals

| measure | value |
|---|---|
| merged tasks examined | 54 |
| tasks with every changed file inside declared scope (strict globs) | 47 |
| tasks with at least one file outside declared scope | 7 |
| files outside declared scope | 21 |

- The 54 are every `factory: merge <slug>` commit on `factory/self` that has a self merge record: iteration 5 (7), iteration 7 (14), iteration 8 (1), iteration 9 (3), iteration 11 (18), iteration 12 (6), iteration 13 (5). Iterations 1–4, 6 and 10 merged none (`iterations/<n>/summary.md`, `- merged: none`).
- Strict glob match only. `plan.md:13` declares "Tests and the rendered prompt snapshot of a touched module are in-scope collateral, whatever the Scope line lists" (rule added in iteration 7, record 00104-i7-architect-r1:21-23; applied retroactively in iterations/6/summary.md:36-37). That rule, plus sweep-land's own done-when (delete the `src/cli/index.ts` barrel; tests import concrete modules), accounts for 17 of the 21 files (all tests, snapshots, fixtures and one test helper), leaving 4 source edits: cost-pricing (`launch.ts`, `types.ts`) and budget-drain (`config.ts`, `dispatch.ts`).
- budget-drain's scope bullet is malformed YAML: `  - src/kernel/dispatch.ts  - src/kernel/config.ts` parses as one pattern (`tasks/budget-drain.md:11`; `yaml.parse` yields `['src/kernel/dispatch.ts  - src/kernel/config.ts', ...]`). Only the missing newline puts those two outside; read as written intent, the sole source-file breach is cost-pricing: 1 task, 2 files.

## 2. Tasks with files outside scope

Paths below are relative to `plugins/software-factory/` (all outliers are product files).

| slug | iteration | files changed | files outside scope | did the review record mention it |
|---|---|---|---|---|
| prompt-refs | 5 | 3 | test/kernel/__snapshots__/prompts-snapshot.test.ts.snap | yes (00052-i5-prompt-refs-review-r1): "forced ... rather than scope creep" |
| cost-pricing | 5 | 10 | src/kernel/launch.ts; src/kernel/types.ts; test/kernel/pricing.test.ts | no: launch.ts and types.ts never named in 00032 or 00047; pricing.test.ts cited only as a test |
| prompt-size | 5 | 4 | test/kernel/agent.test.ts | no: cited only as the test command (00082-i5-prompt-size-review-r1) |
| subagent-usage | 7 | 5 | test/fixtures/omp/child-session-cost.jsonl; test/harness/omp-subagent-usage.test.ts; test/harness/omp-usage.test.ts | no: tests and fixture cited as proof (00145-i7-subagent-usage-review-r1) |
| budget-drain | 7 | 6 | src/kernel/config.ts; src/kernel/dispatch.ts | yes (00193-i7-budget-drain-review-r2): "Diff stays inside the task's file list; no scope creep" (malformed bullet) |
| benchmark-report | 7 | 4 | test/cli/benchmark.test.ts | no: cited as the gate (00208-i7-benchmark-report-review-r1); its scope note is about README |
| sweep-land | 12 | 33 | test/cli/benchmark.test.ts; test/cli/cli.test.ts; test/cli/e2e.test.ts; test/kernel/e2e-helpers.ts; test/kernel/integration-e2e.test.ts; test/kernel/metrics.test.ts; +4 (pricing, scenario1, scenario3, signals) | yes (00507-i12-sweep-land-review-r1): names `test/cli/*`, `test/kernel/*`, `e2e-helpers.ts` as outside literal scope, justified |

## 3. Parks recorded as `upscope`

Paths below are relative to `plugins/software-factory/`.

| slug | record id | files the implementer said it needed | were they inside another task's scope at the time |
|---|---|---|---|
| tier-escalation | 00205-i7-tier-escalation-implement-r1 (park 00210) | src/kernel/agent.ts; src/kernel/flow.ts; src/kernel/merge-attempt.ts (forward) | unknown: agent.ts possibly overflow-denovo (scope unrecorded then); flow.ts and merge-attempt.ts: no |
| prune-sweep | 00351-i11-prune-sweep-implement-r1 (park 00353) | src/cli/index.ts; src/harness/fake/index.ts; src/harness/fake/fake-harness.ts; src/kernel/register.ts; plus test importers test/cli/**, test/kernel/**, test/fake-harness.test.ts | no for the four src files; test/kernel/** and test/cli/cli.test.ts yes (cli-paths et al.) |
| front-ladder | 00430-i11-front-ladder-implement-r1 (park 00432) | test/cli/e2e.test.ts (red gate); prompts/VARIABLES.md (debt) | no: cli-paths merged 34 min before the park; prompt-refs merged earlier |
| harness-rotation | 00440-i11-harness-rotation-implement-r1 (park 00442) | src/kernel/dispatch.ts; src/kernel/flow.ts; src/kernel/merge-attempt.ts (forward) | yes (turn-target, parked; steer-holds) |
| pm-ladder-tidy | 00494-i12-pm-ladder-tidy-implement-r1 (park 00496) | src/kernel/launch.ts (forward) | yes (front-ladder, parked) |

## 4. Method and caveats

1. Scope is the `scope:` list parsed from `.factory/artifacts/self/tasks/<slug>.md` exactly as `parseTaskFile` does (`plugins/software-factory/src/kernel/tasks.ts:32-66`); for all 54 files the current `materialHash` equals the `taskHash` of the task's latest implement record, so none was materially edited after its last turn (and mtime ≤ merge time for all).
2. Paths resolved per `plan.md:3`: relative to `plugins/software-factory/` unless root-prefixed (`bootstrap/`, `docs/`, `plugins/`, `agents/`, `.factory/`, `manifesto*`, `LICENSE`); `README.md` accepted under either. `*` and `?` stay within a segment, `**` crosses segments, a no-wildcard entry is an exact path.
3. The kernel has no diff-vs-scope matcher: `dispatch.ts:49-67` compares globs to globs for admission only; `flow.ts:157-184` checks worktree containment (writes outside the worktree). The `git diff` calls that exist compare empty staging (`core/git/commit.ts:24`, `kernel/integrate.ts:158`), list conflict files (`core/git/merge.ts:50`) or list unmerged paths (`kernel/worktree.ts:83`); none reads a task's scope.
4. Commits are single-parent squash merges `factory: merge <slug>`; files come from `git diff-tree --no-commit-id --name-only -r <merge>^ <merge>`. The 54 merge records map 1:1 to 54 commits (392 changed-file entries). The 25 `factory: merge item *` commits (2026-11-07/08) predate the self goal and are excluded.
5. Review "mention" = the record names an outside file or the scope boundary; a test cited only as a gate command counts as no. Reviewed: prompt-refs 00052; cost-pricing 00032 and 00047; prompt-size 00082; subagent-usage 00145; budget-drain 00182 and 00193; benchmark-report 00208; sweep-land 00507.
6. Upscope "at the time" uses the park record timestamp and every task file with mtime before it; a task already merged by then is not counted; a task file edited later makes the answer unknown, and files behind `forward`/`concerns` are in the implement outcome, not the park record.
