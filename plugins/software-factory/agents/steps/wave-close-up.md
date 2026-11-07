# Step: Wave Close-Up

## Goal
Verify repository integrity and cleanliness on the merged task branch after all wave items finish. Audit gates against baseline and compile the wave outcome.

## Rules
- Tree hygiene: check for stray untracked junk, leftover temporary artifacts, or lingering merge conflict markers.
- Gate baseline: run all infra gates via `bash`. Gates that were green in `gates-baseline.yaml` must remain green; report any regressions in `failedItems`/`blockedItems` and the summary.
- Outcome compilation: yield the wave outcome matching `wave-closeup.schema.json`: `{wave, iteration, status, mergedItems, failedItems?, blockedItems?, debt?, summary, recommendations?}`.
- Status semantics: `complete` (all items merged, tree clean, gates green), `has_failures` (some items failed but iteration can continue), `blocked` (wave cannot proceed without operator input).
- Reviewer boundary: reviewers critique; reviewers NEVER write code fixes.

## Task & Wave
Task: {{task}}
Wave Report: {{waveReport}}

## Infrastructure Gates
{{infra}}
