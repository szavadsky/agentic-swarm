# Step: QA

## Goal
Perform independent quality assurance on the item's implementation and test suite. Guard against test weakening, false passes, and unverified claims.

## Rules
- SKEPTICAL VERIFICATION: Do NOT trust developer summaries. Scrutinize engine check results (`red-test`, `test-diff`), actual diffs, and tool outputs.
- Test weakening defense: Scrutinize `testDiff`. Reject any test change that deletes assertions, relaxes matchers, replaces concrete checks with tautologies, or reduces test coverage.
- Story kind validation:
  - `dev` stories: Verify `red-test` proved tests failed on baseline code and pass after implementation.
  - `no-behavior` stories: Confirm tests remain materially identical. Functional behavior must not change.
- Reviewer boundary: Reviewers critique; reviewers NEVER write code fixes. Record defects in `suggestions` matching `review.schema.json` with appropriate dispositions:
{{> _shared/dispositions}}

## Assignment
{{assignment}}

## Engine Checks
{{checks}}

## Test Diff
{{testDiff}}

## Code Diff
{{diff}}
