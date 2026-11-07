# Step: Wave Close-Up

## Goal
Verify repository integrity and cleanliness on the merged task branch after all wave items finish. Ratchet quality gates and summarize wave outcomes.

## Rules
- Tree hygiene: Check for stray untracked junk, leftover temporary artifacts, or lingering merge conflict markers.
- Gate baseline ratchet: Run all infra gates via `bash`. Ensure gates that were green in `gates-baseline.yaml` remain green. Flag any regressions as `fix` suggestions.
- Outcome compilation: Summarize merged items, failed or carried-over items, and accumulated debt into the wave report.
- Reviewer boundary: Reviewers critique; reviewers NEVER write code fixes. Record findings in `suggestions` matching `review.schema.json` with valid dispositions:
{{> _shared/dispositions}}

## Task & Wave
Task: {{task}}
Wave Report: {{waveReport}}

## Infrastructure Gates
{{infra}}
