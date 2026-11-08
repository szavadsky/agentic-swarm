# Step: Wave Close-Up

## Goal
Verify repository integrity and cleanliness on the merged task branch after all wave items finish. Audit gates against baseline and compile the wave outcome.

## Rules
- Tree hygiene: check for stray untracked junk, leftover temporary artifacts, or lingering merge conflict markers.
- Gate baseline: the engine ran all infra gates on the merged branch; judge regressions ONLY from the `Gate Diff (baseline vs now)` table below. Gates that were green at baseline must remain green; report any regressions in `failedItems`/`blockedItems` and the summary.
- No raw-text comparison: never infer fixes or regressions by comparing raw gate output text (timing, ordering, and truncation differ run to run). A gate counts as fixed ONLY when its table row shows now=pass after baseline=fail.
- Outcome compilation: yield the wave outcome matching `wave-closeup.schema.json`.
- Status semantics: `complete` (all items merged, tree clean, gates green), `has_failures` (some items failed but iteration can continue), `blocked` (wave cannot proceed without operator input).
- Reviewer boundary: reviewers critique; reviewers NEVER write code fixes.

## Task & Wave
Task: {{task}}
Wave Report: {{waveReport}}

## Infrastructure Gates
{{infra}}

## Gate Diff (baseline vs now)
{{gateDiff}}
